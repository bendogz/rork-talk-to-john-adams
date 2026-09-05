import { useCallback, useEffect, useRef, useState } from "react";
import {
  createAdamsAgentSession,
  destroyAdamsAgentSession,
  speakOnAdamsAgent,
  stopAdamsSpeech,
} from "../lib/didAgent";
import { ADAMS_GREETING_SPEECH } from "../lib/adams";
import { askAdamsWithOpenAI } from "../lib/adamsBrain";

type AdamsAgentSession = Awaited<ReturnType<typeof createAdamsAgentSession>>;

export function useAdamsConversation() {
  const [isReady, setIsReady] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<AdamsAgentSession | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const greetingPlayedRef = useRef(false);
  const greetingPromiseRef = useRef<Promise<void> | null>(null);

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

      if (!greetingPlayedRef.current) {
        greetingPlayedRef.current = true;
        setIsSpeaking(true);
        greetingPromiseRef.current = speakOnAdamsAgent(session, ADAMS_GREETING_SPEECH)
          .finally(() => {
            greetingPromiseRef.current = null;
            setIsSpeaking(false);
          });
        await greetingPromiseRef.current;
      }

      return session;
    } catch (err) {
      setIsConnecting(false);
      setIsReady(false);
      setError(err instanceof Error ? err.message : "Unable to connect to John Adams.");
      throw err;
    }
  }, []);

  // Pre-connect as soon as the conversation UI mounts so the visitor does not
  // have to press “Ready to Talk” and then wait for the Agent to connect.
  useEffect(() => {
    void ensureAgent().catch(() => {
      // ensureAgent already exposes the user-facing error state.
    });
  }, [ensureAgent]);

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
        const session = await ensureAgent();
        if (greetingPromiseRef.current) await greetingPromiseRef.current;
        if (controller.signal.aborted) return;

        const answer = await askAdamsWithOpenAI(question, controller.signal);
        if (controller.signal.aborted) return;

        setIsThinking(false);
        setIsSpeaking(true);
        try {
          await speakOnAdamsAgent(session, answer);
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
