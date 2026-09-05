import { useCallback, useEffect, useRef, useState } from "react";
import {
  createAdamsAgentSession,
  destroyAdamsAgentSession,
  speakOnAdamsAgent,
  stopAdamsSpeech,
  type AdamsAgentSession,
} from "../lib/didAgent";
import { askAdamsWithOpenAI } from "../lib/adamsBrain";

export function useAdamsConversation() {
  const [isReady, setIsReady] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<AdamsAgentSession | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const ensureAgent = useCallback(async () => {
    if (sessionRef.current) return sessionRef.current;

    setError(null);
    setIsConnecting(true);

    try {
      const session = await createAdamsAgentSession({
        onConnected: () => {
          setIsReady(true);
          setIsConnecting(false);
        },
        onDisconnected: () => {
          setIsReady(false);
          setIsConnecting(false);
        },
        onError: (message) => {
          setError(message);
          setIsReady(false);
          setIsConnecting(false);
        },
        onSpeakingChange: setIsSpeaking,
      });

      sessionRef.current = session;
      return session;
    } catch (err) {
      setIsConnecting(false);
      setIsReady(false);
      setError(err instanceof Error ? err.message : "Unable to connect to John Adams.");
      throw err;
    }
  }, []);

  // Deliberately do NOT connect on page load. The D-ID Agent is warmed up only
  // when the visitor presses “Ready to Talk”, so the expensive WebRTC connection
  // happens at the moment the conversation is actually started.
  const startConversation = useCallback(async () => {
    setError(null);
    try {
      await ensureAgent();
    } catch {
      // ensureAgent already exposes the user-facing error state.
    }
  }, [ensureAgent]);

  const askQuestion = useCallback(
    async (question: string) => {
      if (!question.trim()) return;

      setError(null);
      setIsThinking(true);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await ensureAgent();
        const answer = await askAdamsWithOpenAI(question, controller.signal);
        if (controller.signal.aborted) return;

        setIsThinking(false);
        setIsSpeaking(true);
        try {
          await speakOnAdamsAgent(answer);
        } finally {
          setIsSpeaking(false);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Something went wrong.");
          setIsThinking(false);
          setIsSpeaking(false);
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [ensureAgent]
  );

  const stopConversation = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    stopAdamsSpeech();
    setIsThinking(false);
    setIsSpeaking(false);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      stopAdamsSpeech();
      if (sessionRef.current) {
        destroyAdamsAgentSession(sessionRef.current);
        sessionRef.current = null;
      }
    };
  }, []);

  return {
    isReady,
    isConnecting,
    isThinking,
    isSpeaking,
    error,
    startConversation,
    askQuestion,
    stopConversation,
  };
}
