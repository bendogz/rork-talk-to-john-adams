import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";

import {
  ADAMS_FAREWELL_SPEECH,
  ADAMS_GREETING_SPEECH,
  ADAMS_OPENERS,
  type ChatTurn,
  type Exchange,
} from "@/lib/adams";
import type { AgentManager } from "@d-id/client-sdk";
import {
  agentSleep,
  chunkAnswer,
  createAdamsAgentSession,
  destroyAdamsAgentSession,
  DID_IDLE_CLOSE_MS,
  estimateSpeechSeconds,
  interruptAdamsAgent,
  isAgentEnabled,
  speakOnAdamsAgent,
  type AdamsAgentCallbacks,
} from "@/lib/didAgent";
import { ElevenLabsError, speakWithElevenLabs } from "@/lib/elevenlabs";
import { OpenAIError, speakAsAdamsWithOpenAI, streamAdamsWithOpenAI } from "@/lib/openai";
import { getSettings } from "@/lib/settings";
import { SentenceSplitter, SpeechQueue } from "@/lib/speechQueue";
import { speakAsAdams, streamAdams, ToolkitError } from "@/lib/toolkit";

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

/** He never holds his pen longer than this before he begins to speak. */
const PEN_LIMIT_MS = 1000;
const THOUGHT_SLIPPED =
  "Forgive me, the thread of my thought has slipped away. Put the question to me once more.";
const CONVERSATION_KEY = "speak-with-adams.conversation.v1";
const MAX_SAVED_EXCHANGES = 20;
/** Guards the spoken introduction against StrictMode's double mounting. */
let hasGreetedThisSession = false;

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function pickOpener(): string {
  return ADAMS_OPENERS[Math.floor(Math.random() * ADAMS_OPENERS.length)];
}

/** Sleeps, but wakes at once if the answer is called off. */
function sleepUnlessAborted(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const done = (): void => {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = window.setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
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
  /** True when today's audience is already spent: no greeting, no stream, no questions. */
  closed?: boolean;
}

/**
 * Owns the whole conversation: asking Mr. Adams, hearing him speak, and
 * revealing his words as captions in time with his voice. The thread of the
 * conversation is kept across page visits.
 */
export function useAdamsConversation({ onAnswerComplete, closed = false }: UseAdamsConversationOptions = {}) {
  /** Once closed (spent today, or bid farewell), he takes no further questions. */
  const closedRef = useRef<boolean>(closed);
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

  // The living portrait: a D-ID agent stream, opened on demand and held open
  // between answers for quick reuse.
  const agentRef = useRef<AgentManager | null>(null);
  const agentBootRef = useRef<Promise<AgentManager> | null>(null);
  const agentIdleTimerRef = useRef<number | null>(null);
  /** Mirror of didStream, so the ask path can check his picture synchronously. */
  const didStreamRef = useRef<MediaStream | null>(null);
  /** The agent's latest reply, captured as its spoken message lands. */
  const agentAnswerRef = useRef<string>("");
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

  /** Closes the living portrait, so no studio minutes are spent while he listens. */
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

  /** Reveals one spoken line word by word across `seconds`, after what came before. */
  const revealChunk = useCallback(
    (prefix: string, chunk: string, seconds: number): void => {
      clearRevealTimer();
      const words = chunk.split(/\s+/).filter(Boolean);
      if (words.length === 0) return;
      const stepMs = Math.max(45, (Math.max(0.6, seconds) * 1000) / words.length);
      let shown = 0;
      setState((prev) => ({ ...prev, revealedAnswer: prefix.trimEnd() }));
      revealTimerRef.current = window.setInterval(() => {
        shown += 1;
        const text = prefix + words.slice(0, shown).join(" ");
        setState((prev) => ({ ...prev, revealedAnswer: text }));
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

  /** His voice alone for one line, when the living portrait is not at hand. */
  const fetchVoice = useCallback(async (text: string, signal: AbortSignal): Promise<string> => {
    const voiceSettings = getSettings();
    if (voiceSettings.elevenlabsKey && voiceSettings.ttsProvider === "elevenlabs") {
      return speakWithElevenLabs(text, { signal });
    }
    if (voiceSettings.openaiKey && voiceSettings.ttsProvider === "openai") {
      return speakAsAdamsWithOpenAI(text, signal);
    }
    return speakAsAdams(text, signal);
  }, []);

  /** Plays one spoken line to its end (or until called off), lips following the audio. */
  const playChunk = useCallback(
    (url: string, seconds: number, signal: AbortSignal): Promise<void> =>
      new Promise<void>((resolve) => {
        const audio = new Audio(url);
        audio.preload = "auto";
        // iOS needs playsinline for long-form playback without interruption.
        audio.setAttribute("playsinline", "true");
        audioRef.current = audio;
        objectUrlRef.current = url;

        let settled = false;
        let fallbackTimer: number | null = null;
        const done = (): void => {
          if (settled) return;
          settled = true;
          if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
          signal.removeEventListener("abort", done);
          releaseAudio();
          resolve();
        };
        audio.onended = done;
        audio.onerror = done;
        audio.onplaying = () => {
          if (audioCtxRef.current?.state === "suspended") {
            void audioCtxRef.current.resume().catch(() => undefined);
          }
        };
        signal.addEventListener("abort", done, { once: true });
        attachMouthAnalyser(audio);

        audio.play().catch((playError: unknown) => {
          console.warn("[adams] playback was blocked by the browser", playError);
          setState((prev) => ({ ...prev, needsPlaybackTap: true }));
          startSimulatedMouth();
          fallbackTimer = window.setTimeout(done, seconds * 1000 + 600);
        });
      }),
    [attachMouthAnalyser, releaseAudio, startSimulatedMouth],
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
    abortRef.current?.abort();
    // Cut him off but keep the stream warm, so the next answer starts at once.
    const manager = agentRef.current;
    if (manager && !interruptAdamsAgent(manager)) destroyAgent();
    finishSpeaking();
  }, [destroyAgent, finishSpeaking]);

  /**
   * Speaks lines from the queue as they become ready: through the living
   * portrait when its stream is up, otherwise as voice alone. Captions keep
   * pace line by line. Returns everything he actually said.
   */
  const runSpeech = useCallback(
    async (queue: SpeechQueue, signal: AbortSignal, onChunkStart: (spoken: string) => void): Promise<string> => {
      let spoken = "";
      let usedPortrait = false;
      acquireWakeLock();
      try {
        for (;;) {
          const chunk = await queue.next(signal);
          if (chunk === null || signal.aborted) break;
          const prefix = spoken.length > 0 ? `${spoken} ` : "";
          spoken = prefix + chunk;
          pendingAnswerRef.current = spoken;
          onChunkStart(spoken);
          const seconds = estimateSpeechSeconds(chunk);

          // The living portrait: real lips forming his words over WebRTC.
          const manager = agentRef.current;
          if (manager && didStreamRef.current) {
            try {
              scheduleAgentIdleClose();
              await speakOnAdamsAgent(manager, chunk);
              revealChunk(prefix, chunk, seconds);
              usedPortrait = true;
              // A small buffer after the estimate keeps lines from colliding.
              await sleepUnlessAborted(seconds * 1000 + 300, signal);
              continue;
            } catch (agentError) {
              if (signal.aborted) break;
              console.warn("[adams] living portrait unavailable; voice alone for now", agentError);
              destroyAgent();
              if (isAgentEnabled()) void ensureAgent().catch(() => undefined);
            }
          }

          try {
            const url = await fetchVoice(chunk, signal);
            if (signal.aborted) {
              URL.revokeObjectURL(url);
              break;
            }
            revealChunk(prefix, chunk, seconds);
            await playChunk(url, seconds, signal);
          } catch (speechError) {
            if (signal.aborted) break;
            console.warn("[adams] could not voice a line", speechError);
            revealChunk(prefix, chunk, seconds);
            startSimulatedMouth();
            await sleepUnlessAborted(seconds * 1000, signal);
            stopMouthAnimation();
          }
        }
        // Let the last rendered words leave his lips before the ear reopens.
        if (usedPortrait && !signal.aborted) await sleepUnlessAborted(700, signal);
      } finally {
        releaseWakeLock();
      }
      return spoken;
    },
    [
      acquireWakeLock,
      destroyAgent,
      ensureAgent,
      fetchVoice,
      playChunk,
      releaseWakeLock,
      revealChunk,
      scheduleAgentIdleClose,
      startSimulatedMouth,
      stopMouthAnimation,
    ],
  );

  /** Waits briefly for the living portrait so a set speech is delivered with his face. */
  const awaitPortrait = useCallback(
    async (signal: AbortSignal): Promise<void> => {
      if (!isAgentEnabled()) return;
      try {
        await Promise.race([ensureAgent(), agentSleep(8000)]);
      } catch {
        return;
      }
      let waitedMs = 0;
      while (!didStreamRef.current && waitedMs < 6000 && !signal.aborted) {
        await agentSleep(250);
        waitedMs += 250;
      }
    },
    [ensureAgent],
  );

  /** Delivers a set speech (greeting or farewell) as an exchange without a question. */
  const deliverSpeech = useCallback(
    async (text: string, controller: AbortController): Promise<boolean> => {
      const speech: Exchange = { id: createId(), question: "", answer: text };
      pendingAnswerRef.current = text;
      exchangesRef.current = [...exchangesRef.current, speech];
      setState((prev) => {
        const exchanges = [...prev.exchanges, speech];
        return {
          ...prev,
          phase: "speaking",
          exchanges,
          viewIndex: exchanges.length - 1,
          revealedAnswer: "",
          error: null,
          needsPlaybackTap: false,
        };
      });
      await awaitPortrait(controller.signal);
      await runSpeech(SpeechQueue.from(chunkAnswer(text)), controller.signal, () => undefined);
      pendingAnswerRef.current = text;
      return !controller.signal.aborted;
    },
    [awaitPortrait, runSpeech],
  );

  // A first visit earns a spoken introduction: who he is, and a curiosity.
  useEffect(() => {
    if (hasGreetedThisSession) return;
    hasGreetedThisSession = true;
    if (restoredExchanges.length > 0 || closedRef.current) return;

    exchangesRef.current = [];
    const controller = new AbortController();
    abortRef.current = controller;
    void deliverSpeech(ADAMS_GREETING_SPEECH, controller).then((finished) => {
      if (!finished) return;
      finishSpeaking();
      onAnswerCompleteRef.current?.();
    });
  }, [deliverSpeech, finishSpeaking, restoredExchanges]);

  // Warm the living portrait as the page loads, so the first answer starts the
  // moment it is thought of, with no dead wait while the stream negotiates.
  useEffect(() => {
    if (!isAgentEnabled() || closedRef.current) return;
    void ensureAgent().catch(() => undefined);
  }, [ensureAgent]);

  /** The daily audience is spent: he says his goodbye, then closes the stream. */
  const bidFarewell = useCallback(async (): Promise<void> => {
    if (closedRef.current) return;
    closedRef.current = true;
    abortRef.current?.abort();
    clearRevealTimer();
    releaseAudio();
    const controller = new AbortController();
    abortRef.current = controller;
    await deliverSpeech(ADAMS_FAREWELL_SPEECH, controller);
    finishSpeaking();
    destroyAgent();
  }, [clearRevealTimer, deliverSpeech, destroyAgent, finishSpeaking, releaseAudio]);

  const ask = useCallback(
    async (rawQuestion: string): Promise<void> => {
      const question = rawQuestion.trim();
      if (question.length === 0 || closedRef.current) return;

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

      // Keep his face ready while he thinks.
      if (isAgentEnabled()) void ensureAgent().catch(() => undefined);

      // The greeting and farewell carry no question, so they are not offered as context.
      const history: ChatTurn[] = exchangesRef.current
        .filter((exchange) => exchange.question.length > 0)
        .flatMap((exchange) => [
          { role: "user" as const, content: exchange.question },
          { role: "assistant" as const, content: exchange.answer },
        ]);

      // His mind streams its reply; each finished sentence joins the queue at once.
      const queue = new SpeechQueue();
      const splitter = new SentenceSplitter((line) => queue.push(line));
      let openerSpoken = false;
      let thinkingError: unknown = null;
      const streamMind = getSettings().openaiKey ? streamAdamsWithOpenAI : streamAdams;
      const thinking = streamMind(question, history, (piece) => splitter.feed(piece), controller.signal)
        .then(() => splitter.flush())
        .catch((streamError: unknown) => {
          thinkingError = streamError;
          splitter.flush();
          if (!controller.signal.aborted && (openerSpoken || splitter.emitted > 0)) queue.push(THOUGHT_SLIPPED);
        })
        .finally(() => queue.close());

      try {
        // He never holds the pen longer than a second: if his first sentence is
        // not yet written, he opens with a few words while the rest takes shape.
        const ready = await queue.waitForItem(PEN_LIMIT_MS, controller.signal);
        if (controller.signal.aborted) return;
        if (!ready) {
          if (queue.isClosed) {
            await thinking;
            throw thinkingError ?? new ToolkitError("Mr. Adams fell silent. Ask him again.", 502);
          }
          openerSpoken = true;
          queue.unshift(pickOpener());
        }

        const exchangeId = createId();
        let started = false;
        const onChunkStart = (spoken: string): void => {
          const exchange: Exchange = { id: exchangeId, question, answer: spoken };
          if (!started) {
            started = true;
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
            return;
          }
          setState((prev) => ({
            ...prev,
            exchanges: prev.exchanges.map((item) => (item.id === exchangeId ? exchange : item)),
          }));
        };

        const spoken = await runSpeech(queue, controller.signal, onChunkStart);
        if (spoken.length > 0) {
          exchangesRef.current = [
            ...exchangesRef.current.filter((item) => item.id !== exchangeId),
            { id: exchangeId, question, answer: spoken },
          ];
        }
        if (controller.signal.aborted) return;
        finishSpeaking();
        onAnswerCompleteRef.current?.();
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
    [clearRevealTimer, ensureAgent, finishSpeaking, releaseAudio, runSpeech],
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
    bidFarewell,
    stopSpeaking,
    retryPlayback,
    showPrevious,
    showNext,
    dismissError,
  };
}
