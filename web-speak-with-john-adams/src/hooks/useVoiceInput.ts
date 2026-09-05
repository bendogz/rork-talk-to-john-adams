import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { transcribeWithOpenAI, OpenAIError } from "@/lib/openai";
import { getSettings } from "@/lib/settings";
import { transcribeQuestion, ToolkitError } from "@/lib/toolkit";

export type VoiceStatus = "idle" | "listening" | "transcribing" | "ambient";

interface UseVoiceInputResult {
  status: VoiceStatus;
  isSupported: boolean;
  error: string | null;
  toggle: () => void;
  start: () => Promise<void>;
  startAmbient: (onBargeIn: () => void) => Promise<void>;
  stopAmbient: () => void;
  clearError: () => void;
}

const SPEECH_RMS = 0.022;
const SILENCE_RMS = 0.013;
// Give the visitor a full two seconds of silence before sending the question.
// This makes short pauses and incidental background sounds much less likely to
// become an accidental turn.
const SILENCE_MS = 2000;
const MAX_RECORDING_MS = 22000;
const NO_SPEECH_MS = 12000;
const POLL_MS = 80;
const BARGE_RMS = 0.034;
const BARGE_MS = 450;
const BARGE_GRACE_MS = 1200;

function pickMimeType(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  for (const candidate of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Keeps one microphone stream open for the whole visit. The stream is monitored
 * continuously, but audio is only recorded into short segments after speech is
 * detected. This makes the mic feel always ready without repeatedly requesting
 * microphone permission between turns.
 */
export function useVoiceInput(onTranscript: (text: string) => void): UseVoiceInputResult {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const pollRef = useRef<number | null>(null);
  const transcriptHandler = useRef(onTranscript);
  const statusRef = useRef<VoiceStatus>("idle");
  const startingRef = useRef(false);
  const recordingStartedAtRef = useRef(0);
  const hasSpokenRef = useRef(false);
  const lastVoiceAtRef = useRef(0);
  const modeRef = useRef<"listen" | "ambient">("listen");
  const bargeInRef = useRef<() => void>(() => undefined);
  const graceUntilRef = useRef(0);

  transcriptHandler.current = onTranscript;
  statusRef.current = status;

  const isSupported =
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined";

  const stopRecorder = useCallback((): void => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorder.stop();
  }, []);

  const closeMicrophone = useCallback((): void => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    try {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    } catch {
      // already stopped
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    hasSpokenRef.current = false;
    lastVoiceAtRef.current = 0;
    setStatus("idle");
    statusRef.current = "idle";
  }, []);

  useEffect(() => closeMicrophone, [closeMicrophone]);

  const transcribeAndContinue = useCallback((blob: Blob, mimeType: string): void => {
    // Keep the persistent mic alive while transcription happens.
    if (blob.size < 1200) {
      setStatus(modeRef.current === "ambient" ? "ambient" : "listening");
      statusRef.current = modeRef.current === "ambient" ? "ambient" : "listening";
      return;
    }

    setStatus("transcribing");
    statusRef.current = "transcribing";
    const transcribe = getSettings().openaiKey
      ? transcribeWithOpenAI
      : () => transcribeQuestion(blob, mimeType);

    transcribe(blob)
      .then((text) => {
        transcriptHandler.current(text);
        const nextStatus = modeRef.current === "ambient" ? "ambient" : "listening";
        setStatus(nextStatus);
        statusRef.current = nextStatus;
      })
      .catch((transcribeError: unknown) => {
        console.error("[adams] transcription failed", transcribeError);
        setError(
          transcribeError instanceof ToolkitError || transcribeError instanceof OpenAIError
            ? transcribeError.message
            : "Your words could not be made out. Try speaking again.",
        );
        const nextStatus = modeRef.current === "ambient" ? "ambient" : "listening";
        setStatus(nextStatus);
        statusRef.current = nextStatus;
      });
  }, []);

  const beginSegment = useCallback((): void => {
    const stream = streamRef.current;
    if (!stream || recorderRef.current?.state === "recording") return;

    chunksRef.current = [];
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    recordingStartedAtRef.current = Date.now();
    hasSpokenRef.current = true;

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      if (recorderRef.current === recorder) recorderRef.current = null;
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" });
      chunksRef.current = [];
      transcribeAndContinue(blob, recorder.mimeType || mimeType || "audio/webm");
    };

    recorder.start();
    setStatus("listening");
    statusRef.current = "listening";
  }, [transcribeAndContinue]);

  const openMicrophone = useCallback(async (): Promise<MediaStream | null> => {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (permissionError) {
      console.error("[adams] microphone unavailable", permissionError);
      setError("The microphone is not at hand. Allow the microphone and touch the seal again.");
      return null;
    }
  }, []);

  const monitor = useCallback((stream: MediaStream): void => {
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
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);
    analyserRef.current = analyser;

    const data = new Uint8Array(analyser.fftSize);
    graceUntilRef.current = Date.now() + BARGE_GRACE_MS;

    pollRef.current = window.setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      const now = Date.now();
      const recording = recorderRef.current?.state === "recording";

      if (recording) {
        if (rms > SPEECH_RMS) lastVoiceAtRef.current = now;
        const tooLong = now - recordingStartedAtRef.current >= MAX_RECORDING_MS;
        const quietLongEnough =
          hasSpokenRef.current && rms < SILENCE_RMS && now - lastVoiceAtRef.current >= SILENCE_MS;
        if (tooLong || quietLongEnough) stopRecorder();
        return;
      }

      if (modeRef.current === "ambient") {
        if (now < graceUntilRef.current || rms <= BARGE_RMS) return;
        if (lastVoiceAtRef.current === 0) lastVoiceAtRef.current = now;
        if (now - lastVoiceAtRef.current >= BARGE_MS) {
          bargeInRef.current();
          lastVoiceAtRef.current = now;
          beginSegment();
        }
        return;
      }

      if (rms > SPEECH_RMS) {
        hasSpokenRef.current = true;
        lastVoiceAtRef.current = now;
        beginSegment();
      } else if (!hasSpokenRef.current && now - graceUntilRef.current > NO_SPEECH_MS) {
        // Remain ready; do not shut down the microphone just because the visitor
        // has taken a long pause.
        hasSpokenRef.current = false;
        graceUntilRef.current = now;
      }
    }, POLL_MS);
  }, [beginSegment, stopRecorder]);

  const ensureOpen = useCallback(async (): Promise<void> => {
    if (!isSupported || startingRef.current || streamRef.current) return;
    startingRef.current = true;
    setError(null);

    try {
      const stream = await openMicrophone();
      if (!stream) return;
      streamRef.current = stream;
      monitor(stream);
      const nextStatus = modeRef.current === "ambient" ? "ambient" : "listening";
      setStatus(nextStatus);
      statusRef.current = nextStatus;
    } catch (error) {
      console.error("[adams] microphone monitor unavailable", error);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setError("The microphone could not be kept open in this browser.");
    } finally {
      startingRef.current = false;
    }
  }, [isSupported, monitor, openMicrophone]);

  const start = useCallback(async (): Promise<void> => {
    modeRef.current = "listen";
    await ensureOpen();
  }, [ensureOpen]);

  const startAmbient = useCallback(
    async (onBargeIn: () => void): Promise<void> => {
      modeRef.current = "ambient";
      bargeInRef.current = onBargeIn;
      await ensureOpen();
      if (streamRef.current) {
        graceUntilRef.current = Date.now() + BARGE_GRACE_MS;
        setStatus("ambient");
        statusRef.current = "ambient";
      }
    },
    [ensureOpen],
  );

  const stopAmbient = useCallback((): void => {
    modeRef.current = "listen";
    if (streamRef.current) {
      setStatus("listening");
      statusRef.current = "listening";
    }
  }, []);

  const toggle = useCallback((): void => {
    if (streamRef.current) {
      closeMicrophone();
      return;
    }
    void start();
  }, [closeMicrophone, start]);

  const clearError = useCallback((): void => setError(null), []);

  return useMemo(
    () => ({ status, isSupported, error, toggle, start, startAmbient, stopAmbient, clearError }),
    [clearError, error, isSupported, start, startAmbient, status, stopAmbient, toggle],
  );
}
