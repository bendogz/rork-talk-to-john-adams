import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ADAMS_GREETING_SPEECH, type ChatTurn, type Exchange } from "@/lib/adams";
import type { AgentManager } from "@d-id/client-sdk";
import {
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
  viewIndex: number;
  revealedAnswer: string;
  error: string | null;
  needsPlaybackTap: boolean;
}

const WORDS_PER_SECOND = 3.35;
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
          typeof item === "object" && item !== null &&
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
    revealedAnswer: restoredExchanges.length > 0 ? restoredExchanges[restoredExchanges.length - 1].answer : "",
    error: null,
    needsPlaybackTap: false,
  }));

  const abortRef = useRef<AbortController | null>(null);
  const pendingAnswerRef = useRef("");
  const exchangesRef = useRef<Exchange[]>(restoredExchanges);
  const revealTimerRef = useRef<number | null>(null);
  const agentRef = useRef<AgentManager | null>(null);
  const agentBootRef = useRef<Promise<AgentManager> | null>(null);
  const agentIdleTimerRef = useRef<number | null>(null);
  const didStreamRef = useRef<MediaStream | null>(null);
  const [didStream, setDidStream] = useState<MediaStream | null>(null);
  const mouthLevelRef = useRef(0);
  const requestIdRef = useRef(0);

  const clearRevealTimer = useCallback(() => {
    if (revealTimerRef.current !== null) {
      window.clearInterval(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }, []);

  const clearAgentIdleTimer = useCallback(() => {
    if (agentIdleTimerRef.current !== null) {
      window.clearTimeout(agentIdleTimerRef.current);
      agentIdleTimerRef.current = null;
    }
  }, []);

  const destroyAgent = useCallback(() => {
    clearAgentIdleTimer();
    const manager = agentRef.current;
    agentRef.current = null;
    agentBootRef.current = null;
    didStreamRef.current = null;
    setDidStream(null);
    if (manager) void destroyAdamsAgentSession(manager);
  }, [clearAgentIdleTimer]);

  const scheduleAgentIdleClose = useCallback(() => {
    clearAgentIdleTimer();
    agentIdleTimerRef.current = window.setTimeout(destroyAgent, DID_IDLE_CLOSE_MS);
  }, [clearAgentIdleTimer, destroyAgent]);

  const ensureAgent = useCallback(async (): Promise<AgentManager> => {
    scheduleAgentIdleClose();
    if (agentRef.current) return agentRef.current;
    if (agentBootRef.current) return agentBootRef.current;

    const callbacks: AdamsAgentCallbacks = {
      onStream: (stream) => {
        didStreamRef.current = stream;
        setDidStream(stream);
      },
      onFail: (message) => console.warn("[adams] live presenter", message),
      onIdle: () => undefined,
    };

    const boot = createAdamsAgentSession(callbacks)
      .then((manager) => {
        agentRef.current = manager;
        agentBootRef.current = null;
        return manager;
      })
      .catch((error: unknown) => {
        agentBootRef.current = null;
        throw error;
      });

    agentBootRef.current = boot;
    return boot;
  }, [scheduleAgentIdleClose]);

  const startReveal = useCallback((answer: string, durationSeconds: number) => {
    clearRevealTimer();
    const words = answer.split(/\s+/).filter(Boolean);
    if (!words.length) return;
    const duration = Number.isFinite(durationSeconds) && durationSeconds > 0.5
      ? durationSeconds
      : words.length / WORDS_PER_SECOND;
    const stepMs = Math.max(35, (duration * 1000) / words.length);
    let shown = 0;
    revealTimerRef.current = window.setInterval(() => {
      shown += 1;
      setState((prev) => ({ ...prev, revealedAnswer: words.slice(0, shown).join(" ") }));
      if (shown >= words.length) clearRevealTimer();
    }, stepMs);
  }, [clearRevealTimer]);

  const finishSpeaking = useCallback(() => {
    clearRevealTimer();
    setState((prev) => ({
      ...prev,
      phase: prev.exchanges.length > 0 ? "resting" : "welcome",
      revealedAnswer: pendingAnswerRef.current,
      needsPlaybackTap: false,
    }));
  }, [clearRevealTimer]);

  useEffect(() => {
    return () => {
      clearRevealTimer();
      abortRef.current?.abort();
      destroyAgent();
    };
  }, [clearRevealTimer, destroyAgent]);

  useEffect(() => {
    saveConversation(state.exchanges.filter((exchange) => exchange.question.length > 0));
  }, [state.exchanges]);

  useEffect(() => {
    if (!isAgentEnabled()) return;
    void ensureAgent().catch(() => undefined);
  }, [ensureAgent]);

  const speakAnswer = useCallback(async (answer: string, signal: AbortSignal): Promise<void> => {
    if (signal.aborted) return;

    if (isAgentEnabled()) {
      const manager = await ensureAgent();
      startReveal(answer, estimateSpeechSeconds(answer));
      await speakOnAdamsAgent(manager, answer);
      if (signal.aborted) return;
      finishSpeaking();
      onAnswerCompleteRef.current?.();
      return;
    }

    const settings = getSettings();
    const url =
      settings.elevenlabsKey && settings.ttsProvider === "elevenlabs"
        ? await speakWithElevenLabs(answer, { signal })
        : settings.openaiKey && settings.ttsProvider === "openai"
          ? await speakAsAdamsWithOpenAI(answer, signal)
          : await speakAsAdams(answer, signal);

    if (signal.aborted) {
      URL.revokeObjectURL(url);
      return;
    }

    const audio = new Audio(url);
    audio.preload = "auto";
    audio.setAttribute("playsinline", "true");
    const cleanup = () => URL.revokeObjectURL(url);
    audio.onended = () => { cleanup(); finishSpeaking(); onAnswerCompleteRef.current?.(); };
    audio.onerror = cleanup;
    await audio.play().catch(() => setState((prev) => ({ ...prev, needsPlaybackTap: true })));
  }, [ensureAgent, finishSpeaking, startReveal]);

  useEffect(() => {
    if (hasGreetedThisSession || restoredExchanges.length > 0) return;
    hasGreetedThisSession = true;
    const greeting: Exchange = { id: createId(), question: "", answer: ADAMS_GREETING_SPEECH };
    pendingAnswerRef.current = greeting.answer;
    exchangesRef.current = [greeting];
    const controller = new AbortController();
    abortRef.current = controller;
    setState((prev) => ({ ...prev, phase: "speaking", exchanges: [greeting], viewIndex: 0, revealedAnswer: "" }));
    void speakAnswer(greeting.answer, controller.signal).catch((error) => console.warn("[adams] greeting failed", error));
  }, [restoredExchanges, speakAnswer]);

  const ask = useCallback(async (rawQuestion: string): Promise<void> => {
    const question = rawQuestion.trim();
    if (!question) return;

    const requestId = ++requestIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    clearRevealTimer();
    pendingAnswerRef.current = "";
    setState((prev) => ({ ...prev, phase: "considering", error: null, revealedAnswer: "", needsPlaybackTap: false }));

    try {
      const history: ChatTurn[] = exchangesRef.current
        .filter((exchange) => exchange.question.length > 0)
        .flatMap((exchange) => [
          { role: "user" as const, content: exchange.question },
          { role: "assistant" as const, content: exchange.answer },
        ]);

      // Exactly one mind answers the question. The D-ID V2 Agent is the live
      // presenter; it is not separately asked to answer, which prevents a
      // second generated voice from competing with ElevenLabs.
      const settings = getSettings();
      const answer = settings.openaiKey
        ? await askAdamsWithOpenAI(question, history, controller.signal)
        : await askAdams(question, history, controller.signal);

      if (controller.signal.aborted || requestId !== requestIdRef.current) return;

      const exchange: Exchange = { id: createId(), question, answer };
      pendingAnswerRef.current = answer;
      exchangesRef.current = [...exchangesRef.current, exchange];
      setState((prev) => ({
        ...prev,
        phase: "speaking",
        exchanges: [...prev.exchanges, exchange],
        viewIndex: prev.exchanges.length,
        revealedAnswer: "",
        error: null,
      }));

      await speakAnswer(answer, controller.signal);
    } catch (error) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      const message =
        error instanceof ToolkitError || error instanceof OpenAIError || error instanceof ElevenLabsError
          ? error.message
          : "Something went awry. Try once more.";
      console.error("[adams] question failed", error);
      setState((prev) => ({ ...prev, phase: prev.exchanges.length > 0 ? "resting" : "welcome", error }));
    }
  }, [clearRevealTimer, speakAnswer]);

  const stopSpeaking = useCallback(() => {
    requestIdRef.current += 1;
    abortRef.current?.abort();
    destroyAgent();
    finishSpeaking();
  }, [destroyAgent, finishSpeaking]);

  const retryPlayback = useCallback(() => {
    // Browser playback is intentionally handled by the normal question flow;
    // the live D-ID session itself has no second local audio element to restart.
    setState((prev) => ({ ...prev, needsPlaybackTap: false }));
  }, []);

  const showPrevious = useCallback(() => {
    setState((prev) => {
      if (prev.viewIndex <= 0) return prev;
      const index = prev.viewIndex - 1;
      return { ...prev, viewIndex: index, revealedAnswer: prev.exchanges[index].answer };
    });
  }, []);

  const showNext = useCallback(() => {
    setState((prev) => {
      if (prev.viewIndex >= prev.exchanges.length - 1) return prev;
      const index = prev.viewIndex + 1;
      return { ...prev, viewIndex: index, revealedAnswer: prev.exchanges[index].answer };
    });
  }, []);

  const dismissError = useCallback(() => {
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
