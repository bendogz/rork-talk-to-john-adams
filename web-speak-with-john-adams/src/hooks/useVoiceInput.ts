import { useCallback, useEffect, useRef, useState } from "react";

import { transcribeWithOpenAI, OpenAIError } from "@/lib/openai";
import { getSettings } from "@/lib/settings";
import { transcribeQuestion, ToolkitError } from "@/lib/toolkit";

export type VoiceStatus = "idle" | "listening" | "transcribing";

interface UseVoiceInputResult {
  status: VoiceStatus;
  isSupported: boolean;
  error: string | null;
  toggle: () => void;
  start: () => Promise<void>;
  clearError: () => void;
}

const SPEECH_RMS = 0.028;
const SILENCE_RMS = 0.016;
const SILENCE_MS = 1600;
const MAX_RECORDING_MS = 22000;
const NO_SPEECH_MS = 8000;
const POLL_MS = 110;

function pickMimeType(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  for (const candidate of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Listens at the microphone and ends the question on its own: once the visitor
 * has spoken and then falls silent for a beat, the recording finishes itself
 * and the transcript is handed to `onTranscript`.
 */
export function useVoiceInput(onTranscript: (text: string) => void): UseVoiceInputResult {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const pollRef = useRef<number | null>(null);
  /** Marks a recording that ended because nobody spoke, so it fails quietly. */
  const noSpeechRef = useRef<boolean>(false);
  const transcriptHandler = useRef(onTranscript);

  transcriptHandler.current = onTranscript;

  const isSupported =
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined";

  const releaseStream = useCallback((): void => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      releaseStream();
    };
  }, [releaseStream]);

  const transcribeAndReport = useCallback((blob: Blob, mimeType: string): void => {
    if (blob.size < 1200) {
      setStatus("idle");
      setError("That was too brief to make out. Hold the seal a moment longer.");
      return;
    }

    setStatus("transcribing");
    // His hearing: the visitor's own OpenAI key when entrusted, the house post otherwise.
    const transcribe = getSettings().openaiKey ? transcribeWithOpenAI : () => transcribeQuestion(blob, mimeType);
    transcribe(blob)
      .then((text) => {
        setStatus("idle");
        transcriptHandler.current(text);
      })
      .catch((transcribeError: unknown) => {
        console.error("[adams] transcription failed", transcribeError);
        setStatus("idle");
        setError(
          transcribeError instanceof ToolkitError || transcribeError instanceof OpenAIError
            ? transcribeError.message
            : "Your words could not be made out. Try speaking again.",
        );
      });
  }, []);

  const start = useCallback(async (): Promise<void> => {
    if (!isSupported || status !== "idle") return;
    setError(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (permissionError) {
      console.error("[adams] microphone unavailable", permissionError);
      setError("The microphone is not at hand. Allow the microphone and touch the seal again.");
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      const recordedType = recorder.mimeType || "audio/webm";
      const wasSilent = noSpeechRef.current;
      noSpeechRef.current = false;
      releaseStream();
      // Auto-listening with no reply offered ends quietly, without complaint.
      if (wasSilent) {
        setStatus("idle");
        return;
      }
      transcribeAndReport(blob, recordedType);
    };

    recorder.start();

    // Voice-activity watch: end the question once he hears silence.
    try {
      const AudioCtx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) throw new Error("AudioContext unavailable");

      const ctx = new AudioCtx();
      void ctx.resume();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const data = new Uint8Array(analyser.fftSize);
      const startAt = Date.now();
      let hasSpoken = false;
      let lastVoiceAt = startAt;
      let level = 0;

      pollRef.current = window.setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        level = Math.max(rms, level * 0.72);
        const now = Date.now();

        if (level > SPEECH_RMS) {
          hasSpoken = true;
          lastVoiceAt = now;
        }

        if (!hasSpoken && now - startAt > NO_SPEECH_MS) {
          noSpeechRef.current = true;
          recorder.stop();
          return;
        }
        if (hasSpoken && level < SILENCE_RMS && now - lastVoiceAt >= SILENCE_MS) {
          recorder.stop();
          return;
        }
        if (now - startAt > MAX_RECORDING_MS) {
          recorder.stop();
        }
      }, POLL_MS);
    } catch (vadError) {
      console.warn("[adams] silence detection unavailable; recording will run to its cap", vadError);
      pollRef.current = window.setTimeout(() => {
        if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      }, MAX_RECORDING_MS) as unknown as number;
    }

    setStatus("listening");
  }, [isSupported, releaseStream, status, transcribeAndReport]);

  const stop = useCallback((): void => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  const toggle = useCallback((): void => {
    if (status === "listening") {
      stop();
      return;
    }
    if (status === "idle") void start();
  }, [start, status, stop]);

  const clearError = useCallback((): void => setError(null), []);

  return { status, isSupported, error, toggle, start, clearError };
}
