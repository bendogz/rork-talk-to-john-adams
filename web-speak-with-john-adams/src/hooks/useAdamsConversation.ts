import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";

import { ADAMS_GREETING_SPEECH, type ChatTurn, type Exchange } from "@/lib/adams";
import { ElevenLabsError, speakWithElevenLabs } from "@/lib/elevenlabs";
import { askAdamsWithOpenAI, OpenAIError, speakAsAdamsWithOpenAI } from "@/lib/openai";
import { getSettings } from "@/lib/settings";
import { askAdams, speakAsAdams, ToolkitError } from "@/lib/toolkit";

export type StagePhase = "welcome" | "considering" | "speaking" | "resting";

interface ConversationState {
  phase: StagePhase;
  exchanges: Exchange[];
  /** Index of the exchange currently shown in the caption band. */
  viewIndex: number;
  /** The portion of the shown answer revealed so far, word by word. */
  revealedAnswer: string;
  error: string | null;
  /** True when the browser blocked playback and the visitor must tap to hear. */
  needsPlaybackTap: boolean;
}

const WORDS_PER_SECOND_FALLBACK = 2.6;
const CONVERSATION_KEY = "speak-with-adams.conversation.v1";
const MAX_SAVED_EXCHANGES = 20;
/** Guards the spoken introduction against StrictMode's double mounting. */
let hasGreetedThisSession = false;

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadSavedConversation(): Exchange[] {
  try {
    const raw = window.localStorage.getItem(CONVERSATION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is Exchange =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as Exchange).id === "string" &&
          typeof (item as Exchange).question === "string" &&
          typeof (item as Exchange).answer === "string",
      )
      .slice(-MAX_SAVED_EXCHANGES);
  } catch {
    return [];
  }
}

function saveConversation(exchanges: Exchange[]): void {
  try {
    window.localStorage.setItem(CONVERSATION_KEY, JSON.stringify(exchanges.slice(-MAX_SAVED_EXCHANGES)));
  } catch (error) {
    console.warn("[adams] conversation could not be kept", error);
  }
}

interface UseAdamsConversationOptions {
  /** Called when an answer finishes playing naturally — the cue to listen for a reply. */
  onAnswerComplete?: () => void;
}

/**
 * Owns the whole conversation: asking Mr. Adams, hearing him speak, and
 * revealing his words as captions in time with his voice. The thread of the
 * conversation is kept across page visits.
 */
export function useAdamsConversation({ onAnswerComplete }: UseAdamsConversationOptions = {}) {
  /** Latest completion callback; read at natural end so the hook contract stays stable. */
  const onAnswerCompleteRef = useRef(onAnswerComplete);
  onAnswerCompleteRef.current = onAnswerComplete;

  const restoredExchanges = useMemo(() => loadSavedConversation(), []);
  const [state, setState] = useState<ConversationState>(() => ({
    phase: restoredExchanges.length > 0 ? "resting" : "welcome",
    exchanges: restoredExchanges,
    viewIndex: restoredExchanges.length - 1,
    revealedAnswer:
      restoredExchanges.length > 0 ? restoredExchanges[restoredExchanges.length - 1].answer : "",
    error: null,
    needsPlaybackTap: false,
  }));

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pendingAnswerRef = useRef<string>("");
  /** Mirror of the exchanges, so a new question can read prior context synchronously. */
  const exchangesRef = useRef<Exchange[]>(restoredExchanges);

  /** Live mouth-open level (0..1) driving the portrait's lip animation. */
  const mouthLevelRef = useRef<number>(0);
  const mouthRafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const simulateTimerRef = useRef<number | null>(null);
  /** Keeps the phone's screen awake while he speaks, so a long answer is never lost. */
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  const clearRevealTimer = useCallback((): void => {
    if (revealTimerRef.current !== null) {
      window.clearInterval(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }, []);

  const acquireWakeLock = useCallback((): void => {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    nav.wakeLock
      ?.request("screen")
      .then((lock) => {
        wakeLockRef.current = lock;
      })
      .catch(() => undefined);
  }, []);

  const releaseWakeLock = useCallback((): void => {
    wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = null;
  }, []);

  const stopMouthAnimation = useCallback((): void => {
    if (mouthRafRef.current !== null) {
      cancelAnimationFrame(mouthRafRef.current);
      mouthRafRef.current = null;
    }
    if (simulateTimerRef.current !== null) {
      window.clearInterval(simulateTimerRef.current);
      simulateTimerRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    mouthLevelRef.current = 0;
  }, []);

  const releaseAudio = useCallback((): void => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    stopMouthAnimation();
  }, [stopMouthAnimation]);

  useEffect(() => {
    return () => {
      clearRevealTimer();
      releaseAudio();
      abortRef.current?.abort();
    };
  }, [clearRevealTimer, releaseAudio]);

  // Keep the thread of conversation, so a visitor returning to the page resumes it.
  // The spoken introduction carries no question, so it is not kept.
  useEffect(() => {
    saveConversation(state.exchanges.filter((exchange) => exchange.question.length > 0));
  }, [state.exchanges]);

  /** Feeds the mouth level from the actual speech audio, so lips match the voice. */
  const attachMouthAnalyser = useCallback((audio: HTMLAudioElement): void => {
    try {
      const AudioCtx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      void ctx.resume();
      const source = ctx.createMediaElementSource(audio);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.55;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      audioCtxRef.current = ctx;

      const data = new Uint8Array(analyser.fftSize);
      const tick = (): void => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const target = Math.min(1, rms * 3.4);
        // Attack fast, release slowly, so the mouth reads as deliberate speech.
        mouthLevelRef.current = target > mouthLevelRef.current ? target : mouthLevelRef.current * 0.8;
        mouthRafRef.current = requestAnimationFrame(tick);
      };
      mouthRafRef.current = requestAnimationFrame(tick);
    } catch (analyserError) {
      console.warn("[adams] lip-sync analyser unavailable", analyserError);
    }
  }, []);

  /** Fallback when real audio cannot play: pulse the mouth against the captions. */
  const startSimulatedMouth = useCallback((): void => {
    if (simulateTimerRef.current !== null) return;
    simulateTimerRef.current = window.setInterval(() => {
      const t = Date.now() / 95;
      const pulse = 0.3 + 0.7 * Math.abs(Math.sin(t) * Math.cos(t * 0.63));
      mouthLevelRef.current = Math.random() < 0.14 ? mouthLevelRef.current * 0.55 : pulse;
    }, 95);
  }, []);

  /** Reveals the answer word by word across `durationSeconds`. */
  const startReveal = useCallback(
    (answer: string, durationSeconds: number): void => {
      clearRevealTimer();
      const words = answer.split(/\s+/).filter(Boolean);
      if (words.length === 0) return;

      const safeDuration = Number.isFinite(durationSeconds) && durationSeconds > 0.5 ? durationSeconds : words.length / WORDS_PER_SECOND_FALLBACK;
      const stepMs = Math.max(45, (safeDuration * 1000) / words.length);
      let shown = 0;

      revealTimerRef.current = window.setInterval(() => {
        shown += 1;
        setState((prev) => ({ ...prev, revealedAnswer: words.slice(0, shown).join(" ") }));
        if (shown >= words.length) clearRevealTimer();
      }, stepMs);
    },
    [clearRevealTimer],
  );

  const finishSpeaking = useCallback((): void => {
    clearRevealTimer();
    releaseAudio();
    releaseWakeLock();
    setState((prev) => ({
      ...prev,
      phase: prev.exchanges.length > 0 ? "resting" : "welcome",
      revealedAnswer: pendingAnswerRef.current,
      needsPlaybackTap: false,
    }));
  }, [clearRevealTimer, releaseAudio, releaseWakeLock]);

  const playAudio = useCallback(
    async (url: string, answer: string): Promise<void> => {
      const audio = new Audio(url);
      audio.preload = "auto";
      // iOS needs playsinline for long-form playback without interruption.
      audio.setAttribute("playsinline", "true");
      audioRef.current = audio;
      objectUrlRef.current = url;
      acquireWakeLock();

      let resumeAttempts = 0;
      audio.onended = () => {
        finishSpeaking();
        onAnswerCompleteRef.current?.();
      };
      audio.onplaying = () => {
        resumeAttempts = 0;
        if (audioCtxRef.current?.state === "suspended") {
          void audioCtxRef.current.resume().catch(() => undefined);
        }
      };
      // A mobile interruption (a call, an app switch) pauses mid-sentence — quietly resume.
      audio.onpause = () => {
        if (audio.ended || resumeAttempts >= 4) return;
        resumeAttempts += 1;
        window.setTimeout(() => {
          if (!audio.ended && audio.paused) void audio.play().catch(() => undefined);
        }, 300);
      };
      audio.onerror = () => {
        startReveal(answer, 0);
      };

      const beginReveal = (): void => startReveal(answer, audio.duration);
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        beginReveal();
      } else {
        audio.onloadedmetadata = beginReveal;
      }

      attachMouthAnalyser(audio);

      try {
        await audio.play();
      } catch (playError) {
        console.warn("[adams] playback was blocked by the browser", playError);
        setState((prev) => ({ ...prev, needsPlaybackTap: true }));
        startReveal(answer, 0);
        startSimulatedMouth();
      }
    },
    [acquireWakeLock, attachMouthAnalyser, finishSpeaking, startReveal, startSimulatedMouth],
  );

  /** Retries playback after the browser blocked it without a gesture. */
  const retryPlayback = useCallback((): void => {
    const audio = audioRef.current;
    if (!audio) return;
    void audio.play().then(
      () => {
        if (simulateTimerRef.current !== null) {
          window.clearInterval(simulateTimerRef.current);
          simulateTimerRef.current = null;
        }
        setState((prev) => ({ ...prev, needsPlaybackTap: false }));
      },
      (playError) => console.warn("[adams] playback retry failed", playError),
    );
  }, []);

  const stopSpeaking = useCallback((): void => {
    finishSpeaking();
  }, [finishSpeaking]);

  /** Has his reply spoken through the visitor's chosen voice, then played. */
  const speakAndPlay = useCallback(
    async (answer: string, signal: AbortSignal): Promise<void> => {
      try {
        const voiceSettings = getSettings();
        // His voice: the visitor's own ElevenLabs account first, their OpenAI
        // key second, the house post only when neither is entrusted.
        const url =
          voiceSettings.elevenlabsKey && voiceSettings.ttsProvider === "elevenlabs"
            ? await speakWithElevenLabs(answer, { signal })
            : voiceSettings.openaiKey && voiceSettings.ttsProvider === "openai"
              ? await speakAsAdamsWithOpenAI(answer, signal)
              : await speakAsAdams(answer, signal);
        if (signal.aborted) {
          URL.revokeObjectURL(url);
          return;
        }
        await playAudio(url, answer);
      } catch (speechError) {
        if (signal.aborted) return;
        console.error("[adams] could not speak the reply", speechError);
        startReveal(answer, 0);
        startSimulatedMouth();
        window.setTimeout(() => {
          finishSpeaking();
          onAnswerCompleteRef.current?.();
        }, Math.max(2600, answer.split(/\s+/).length * 380));
      }
    },
    [finishSpeaking, playAudio, startReveal, startSimulatedMouth],
  );

  // A first visit earns a spoken introduction: who he is, and a curiosity.
  useEffect(() => {
    if (hasGreetedThisSession) return;
    hasGreetedThisSession = true;
    if (restoredExchanges.length > 0) return;

    const greeting: Exchange = { id: createId(), question: "", answer: ADAMS_GREETING_SPEECH };
    pendingAnswerRef.current = greeting.answer;
    exchangesRef.current = [greeting];
    const controller = new AbortController();
    abortRef.current = controller;
    setState((prev) => ({
      ...prev,
      phase: "speaking",
      exchanges: [greeting],
      viewIndex: 0,
      revealedAnswer: "",
      error: null,
      needsPlaybackTap: false,
    }));
    void speakAndPlay(greeting.answer, controller.signal);
  }, [restoredExchanges, speakAndPlay]);

  const ask = useCallback(
    async (rawQuestion: string): Promise<void> => {
      const question = rawQuestion.trim();
      if (question.length === 0) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      clearRevealTimer();
      releaseAudio();
      pendingAnswerRef.current = "";

      setState((prev) => ({
        ...prev,
        phase: "considering",
        error: null,
        revealedAnswer: "",
        needsPlaybackTap: false,
      }));

      try {
        // The greeting carries no question, so it is not offered as context.
        const history: ChatTurn[] = exchangesRef.current
          .filter((exchange) => exchange.question.length > 0)
          .flatMap((exchange) => [
            { role: "user" as const, content: exchange.question },
            { role: "assistant" as const, content: exchange.answer },
          ]);

        // His mind: the visitor's own OpenAI key when entrusted, the house post otherwise.
        const askMind = getSettings().openaiKey ? askAdamsWithOpenAI : askAdams;
        const answer = await askMind(question, history, controller.signal);
        if (controller.signal.aborted) return;

        pendingAnswerRef.current = answer;
        const exchange: Exchange = { id: createId(), question, answer };

        exchangesRef.current = [...exchangesRef.current, exchange];

        setState((prev) => {
          const exchanges = [...prev.exchanges, exchange];
          return {
            ...prev,
            phase: "speaking",
            exchanges,
            viewIndex: exchanges.length - 1,
            revealedAnswer: "",
            error: null,
          };
        });

        await speakAndPlay(answer, controller.signal);
      } catch (error) {
        if (controller.signal.aborted) return;
        const message =
          error instanceof ToolkitError || error instanceof OpenAIError || error instanceof ElevenLabsError
            ? error.message
            : "Something went awry. Try once more.";
        console.error("[adams] question failed", error);
        setState((prev) => ({
          ...prev,
          phase: prev.exchanges.length > 0 ? "resting" : "welcome",
          error: message,
        }));
      }
    },
    [clearRevealTimer, releaseAudio, speakAndPlay],
  );

  const showPrevious = useCallback((): void => {
    setState((prev) => {
      if (prev.viewIndex <= 0) return prev;
      const index = prev.viewIndex - 1;
      return { ...prev, viewIndex: index, revealedAnswer: prev.exchanges[index].answer };
    });
  }, []);

  const showNext = useCallback((): void => {
    setState((prev) => {
      if (prev.viewIndex >= prev.exchanges.length - 1) return prev;
      const index = prev.viewIndex + 1;
      return { ...prev, viewIndex: index, revealedAnswer: prev.exchanges[index].answer };
    });
  }, []);

  const dismissError = useCallback((): void => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const currentExchange = useMemo<Exchange | null>(() => {
    if (state.viewIndex < 0 || state.viewIndex >= state.exchanges.length) return null;
    return state.exchanges[state.viewIndex];
  }, [state.exchanges, state.viewIndex]);

  return {
    phase: state.phase,
    exchanges: state.exchanges,
    currentExchange,
    viewIndex: state.viewIndex,
    revealedAnswer: state.revealedAnswer,
    error: state.error,
    needsPlaybackTap: state.needsPlaybackTap,
    mouthLevelRef,
    ask,
    stopSpeaking,
    retryPlayback,
    showPrevious,
    showNext,
    dismissError,
  };
}
