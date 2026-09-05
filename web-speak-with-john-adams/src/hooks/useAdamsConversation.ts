import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";

import { ADAMS_GREETING_SPEECH, type ChatTurn, type Exchange } from "@/lib/adams";
import type { AgentManager } from "@d-id/client-sdk";
import {
  agentSleep,
  chatWithAdamsAgent,
  chunkAnswer,
  createAdamsAgentSession,
  destroyAdamsAgentSession,
  DID_IDLE_CLOSE_MS,
  estimateSpeechSeconds,
  isAgentEnabled,
  speakOnAdamsAgent,
  type AdamsAgentCallbacks,
} from "@/lib/didAgent";
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

const WORDS_PER_SECOND_FALLBACK = 3.35;
const CONVERSATION_KEY = "speak-with-adams.conversation.v1";
const MAX_SAVED_EXCHANGES = 20;
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
  onAnswerComplete?: () => void;
}

export function useAdamsConversation({ onAnswerComplete }: UseAdamsConversationOptions = {}) {
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
  const exchangesRef = useRef<Exchange[]>(restoredExchanges);

  const mouthLevelRef = useRef<number>(0);
  const mouthRafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const simulateTimerRef = useRef<number | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  const agentRef = useRef<AgentManager | null>(null);
  const agentBootRef = useRef<Promise<AgentManager> | null>(null);
  const agentIdleTimerRef = useRef<number | null>(null);
  const didStreamRef = useRef<MediaStream | null>(null);
  const agentAnswerRef = useRef<string>("");
  const agentIdleResolverRef = useRef<(() => void) | null>(null);
  const [didStream, setDidStream] = useState<MediaStream | null>(null);

  const clearRevealTimer = useCallback((): void => {
    if (revealTimerRef.current !== null) {
      window.clearInterval(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }, []);

  const clearAgentIdleTimer = useCallback((): void => {
    if (agentIdleTimerRef.current !== null) {
      window.clearTimeout(agentIdleTimerRef.current);
      agentIdleTimerRef.current = null;
    }
  }, []);

  const waitForAgentIdle = useCallback((capMs: number): Promise<void> => {
    return new Promise((resolve) => {
      let settled = false;
      const settle = (): void => {
        if (settled) return;
        settled = true;
        agentIdleResolverRef.current = null;
        window.clearTimeout(timer);
        resolve();
      };
      const timer = window.setTimeout(settle, capMs);
      agentIdleResolverRef.current = settle;
    });
  }, []);

  const destroyAgent = useCallback((): void => {
    clearAgentIdleTimer();
    const manager = agentRef.current;
    agentRef.current = null;
    agentBootRef.current = null;
    didStreamRef.current = null;
    setDidStream(null);
    if (manager) void destroyAdamsAgentSession(manager);
  }, [clearAgentIdleTimer]);

  const scheduleAgentIdleClose = useCallback((): void => {
    clearAgentIdleTimer();
    agentIdleTimerRef.current = window.setTimeout(() => destroyAgent(), DID_IDLE_CLOSE_MS);
  }, [clearAgentIdleTimer, destroyAgent]);

  const ensureAgent = useCallback(async (): Promise<AgentManager> => {
    scheduleAgentIdleClose();
    const existing = agentRef.current;
    if (existing) return existing;
    if (agentBootRef.current) return agentBootRef.current;

    const callbacks: AdamsAgentCallbacks = {
      onStream: (stream) => {
        didStreamRef.current = stream;
        setDidStream(stream);
      },
      onAnswer: (text) => {
        agentAnswerRef.current = text;
      },
      onIdle: () => {
        agentIdleResolverRef.current?.();
      },
      onFail: (message) => console.warn("[adams] living portrait connection changed", message),
    };
    const boot = createAdamsAgentSession(callbacks)
      .then((manager) => {
        agentRef.current = manager;
        agentBootRef.current = null;
        return manager;
      })
      .catch((bootError: unknown) => {
        agentBootRef.current = null;
        throw bootError;
      });
    agentBootRef.current = boot;
    return boot;
  }, [scheduleAgentIdleClose]);

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
      destroyAgent();
    };
  }, [clearRevealTimer, destroyAgent, releaseAudio]);

  useEffect(() => {
    saveConversation(state.exchanges.filter((exchange) => exchange.question.length > 0));
  }, [state.exchanges]);

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
        mouthLevelRef.current = target > mouthLevelRef.current ? target : mouthLevelRef.current * 0.8;
        mouthRafRef.current = requestAnimationFrame(tick);
      };
      mouthRafRef.current = requestAnimationFrame(tick);
    } catch (analyserError) {
      console.warn("[adams] lip-sync analyser unavailable", analyserError);
    }
  }, []);

  const startSimulatedMouth = useCallback((): void => {
    if (simulateTimerRef.current !== null) return;
    simulateTimerRef.current = window.setInterval(() => {
      const t = Date.now() / 95;
      const pulse = 0.3 + 0.7 * Math.abs(Math.sin(t) * Math.cos(t * 0.63));
      mouthLevelRef.current = Math.random() < 0.14 ? mouthLevelRef.current * 0.55 : pulse;
    }, 95);
  }, []);

  const startReveal = useCallback(
    (answer: string, durationSeconds: number): void => {
      clearRevealTimer();
      const words = answer.split(/\s+/).filter(Boolean);
      if (words.length === 0) return;

      const safeDuration = Number.isFinite(durationSeconds) && durationSeconds > 0.5 ? durationSeconds : words.length / WORDS_PER_SECOND_FALLBACK;
      const stepMs = Math.max(40, (safeDuration * 1000) / words.length);
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
      if (Number.isFinite(audio.duration) && audio.duration > 0) beginReveal();
      else audio.onloadedmetadata = beginReveal;

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
    destroyAgent();
    finishSpeaking();
  }, [destroyAgent, finishSpeaking]);

  const speakAndPlay = useCallback(
    async (answer: string, signal: AbortSignal): Promise<void> => {
      if (isAgentEnabled()) {
        try {
          const manager = await ensureAgent();
          const chunks = chunkAnswer(answer);
          const totalSeconds = chunks.reduce((sum, chunk) => sum + estimateSpeechSeconds(chunk), 0);
          startReveal(answer, totalSeconds);
          for (const chunk of chunks) {
            if (signal.aborted) return;
            await speakOnAdamsAgent(manager, chunk);
            // Minimal handoff buffer; the old 400ms+ pauses made answers feel segmented.
            await agentSleep(100);
          }
          if (signal.aborted) return;
          finishSpeaking();
          onAnswerCompleteRef.current?.();
          return;
        } catch (agentError) {
          if (signal.aborted) return;
          console.warn("[adams] living portrait unavailable; falling back to voice alone", agentError);
          destroyAgent();
        }
      }

      try {
        const voiceSettings = getSettings();
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
        }, Math.max(2200, answer.split(/\s+/).length * 300));
      }
    },
    [destroyAgent, ensureAgent, finishSpeaking, playAudio, startReveal, startSimulatedMouth],
  );

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

  // Keep the exact Studio Agent warmed before the first question.
  useEffect(() => {
    if (!isAgentEnabled()) return;
    void ensureAgent().catch(() => undefined);
  }, [ensureAgent]);

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

      if (isAgentEnabled()) {
        try {
          agentAnswerRef.current = "";
          const manager = await ensureAgent();
          // Warmup normally supplies this before a question. Keep the safety
          // window short so a missing stream never creates a long dead pause.
          let waitedMs = 0;
          while (!didStreamRef.current && waitedMs < 2000) {
            if (controller.signal.aborted) return;
            await agentSleep(100);
            waitedMs += 100;
          }
          if (!didStreamRef.current) throw new Error("the living portrait never showed its face");

          const replied = await chatWithAdamsAgent(manager, question);
          if (controller.signal.aborted) return;
          const answer = replied || agentAnswerRef.current;
          if (answer.length > 0) {
            pendingAnswerRef.current = answer;
            const exchange: Exchange = { id: createId(), question, answer };
            exchangesRef.current = [...exchangesRef.current, exchange];
            setState((prev) => ({
              ...prev,
              phase: "speaking",
              exchanges: [...prev.exchanges, exchange],
              viewIndex: prev.exchanges.length,
              revealedAnswer: "",
              error: null,
              needsPlaybackTap: false,
            }));
            startReveal(answer, estimateSpeechSeconds(answer));
            // Resolve from D-ID's real idle event; only a compact safety cap remains.
            await waitForAgentIdle(Math.max(2500, estimateSpeechSeconds(answer) * 1000 + 500));
            if (controller.signal.aborted) return;
            finishSpeaking();
            onAnswerCompleteRef.current?.();
            return;
          }
          console.warn("[adams] the agent answered with silence; falling back");
        } catch (agentError) {
          if (controller.signal.aborted) return;
          console.warn("[adams] the agent's mind failed; falling back", agentError);
          destroyAgent();
        }
      }

      try {
        const history: ChatTurn[] = exchangesRef.current
          .filter((exchange) => exchange.question.length > 0)
          .flatMap((exchange) => [
            { role: "user" as const, content: exchange.question },
            { role: "assistant" as const, content: exchange.answer },
          ]);

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
    didStream,
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
