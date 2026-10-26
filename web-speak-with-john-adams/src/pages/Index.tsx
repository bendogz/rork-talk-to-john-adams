import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { AdamsStage } from "@/components/AdamsStage";
import { AudienceClosedCard } from "@/components/AudienceClosedCard";
import { CaptionBand } from "@/components/CaptionBand";
import { ConsideringLine } from "@/components/ConsideringLine";
import { GreetingCard } from "@/components/GreetingCard";
import { StageHeader } from "@/components/StageHeader";
import { VoiceOrb } from "@/components/VoiceOrb";
import { useAdamsConversation } from "@/hooks/useAdamsConversation";
import { isAllowanceSpentToday, useDailyAllowance } from "@/hooks/useDailyAllowance";
import { useVoiceInput } from "@/hooks/useVoiceInput";

const Index = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [lastQuestion, setLastQuestion] = useState<string>("");
  /** Set once `voice` exists below; keeps the mic hook's callback stable. */
  const askRef = useRef<(question: string) => void>(() => undefined);
  const voiceRef = useRef<ReturnType<typeof useVoiceInput> | null>(null);
  /** Set when an answer ends; the microphone reopens once the ambient ear closes. */
  const resumeListenRef = useRef<boolean>(false);
  /** Ten minutes a day per device: open, then his farewell, then closed until midnight. */
  const [audience, setAudience] = useState<"open" | "closing" | "over">(() =>
    isAllowanceSpentToday() ? "over" : "open",
  );
  const audienceOpen = audience === "open";
  const allowance = useDailyAllowance(audienceOpen);

  const {
    phase,
    didStream,
    exchanges,
    currentExchange,
    viewIndex,
    revealedAnswer,
    error,
    needsPlaybackTap,
    mouthLevelRef,
    ask,
    bidFarewell,
    stopSpeaking,
    retryPlayback,
    showPrevious,
    showNext,
    dismissError,
  } = useAdamsConversation({
    // The back-and-forth: when he finishes, the seal opens to hear the reply.
    onAnswerComplete: () => {
      resumeListenRef.current = true;
    },
    closed: audience === "over",
  });

  const busy = phase === "considering";

  const handleAsk = useCallback((question: string): void => {
    askRef.current(question);
  }, []);

  const voice = useVoiceInput(handleAsk);

  const submitQuestion = useCallback(
    (question: string): void => {
      const trimmed = question.trim();
      if (trimmed.length === 0 || !audienceOpen) return;
      dismissError();
      voice.clearError();
      setLastQuestion(trimmed);
      void ask(trimmed);
    },
    [ask, audienceOpen, dismissError, voice],
  );

  useEffect(() => {
    askRef.current = submitQuestion;
  }, [submitQuestion]);

  /** Guards the carried question against StrictMode's double mounting. */
  const askedPendingRef = useRef<string | null>(null);
  // A question carried from the Foundations essay: asked once, then cleared.
  useEffect(() => {
    const pending = (location.state as { pendingQuestion?: unknown } | null)?.pendingQuestion;
    if (typeof pending !== "string" || pending.length === 0) return;
    if (askedPendingRef.current === pending) return;
    askedPendingRef.current = pending;
    navigate(".", { replace: true, state: null });
    submitQuestion(pending);
  }, [location.state, navigate, submitQuestion]);

  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);

  // An ear that yields the floor: while he thinks or speaks, it hears nothing;
  // the moment he falls quiet, the microphone reopens of its own accord. The
  // resume flag is set when an answer finishes naturally.
  useEffect(() => {
    if (phase === "considering" || phase === "speaking") {
      resumeListenRef.current = false;
      voice.hold();
      return;
    }
    if (!audienceOpen) return;
    voice.stopAmbient();
    if (resumeListenRef.current) {
      resumeListenRef.current = false;
      void voice.start();
    }
  }, [audienceOpen, phase, voice]);

  // The ten minutes are spent: once he has finished his current thought, he
  // says his goodbye, and the microphone is released until tomorrow.
  useEffect(() => {
    if (!allowance.exhausted || audience !== "open") return;
    if (phase === "considering" || phase === "speaking") return;
    setAudience("closing");
    voice.hold();
    void bidFarewell().finally(() => setAudience("over"));
  }, [allowance.exhausted, audience, bidFarewell, phase, voice]);

  useEffect(() => {
    if (audience === "over") voice.shutdown();
  }, [audience, voice]);

  // The ear opens the moment the page loads — hands-free from the first beat.
  // While the greeting holds the floor, the ambient ear is armed instead, and
  // the listening ear opens of its own accord when he falls quiet.
  const hasOpenedEarRef = useRef<boolean>(false);
  useEffect(() => {
    if (hasOpenedEarRef.current || !audienceOpen || phase === "speaking" || phase === "considering") return;
    hasOpenedEarRef.current = true;
    if (voice.status === "idle") void voice.start();
  }, [audienceOpen, phase, voice]);

  // A fallback for a denied permission: the first touch re-asks for the ear.
  const audienceOpenRef = useRef<boolean>(audienceOpen);
  audienceOpenRef.current = audienceOpen;
  useEffect(() => {
    const openEar = (): void => {
      if (!audienceOpenRef.current) return;
      if (voiceRef.current?.status === "idle") void voiceRef.current.start();
    };
    window.addEventListener("pointerdown", openEar, { once: true });
    window.addEventListener("keydown", openEar, { once: true });
    return () => {
      window.removeEventListener("pointerdown", openEar);
      window.removeEventListener("keydown", openEar);
    };
  }, []);

  const handleMicPress = useCallback((): void => {
    if (phase === "speaking") stopSpeaking();
    // While the pen is up, or the audience is over, a press must not reopen the ear.
    if (busy || !audienceOpen) return;
    voice.toggle();
  }, [audienceOpen, busy, phase, stopSpeaking, voice]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && phase === "speaking") stopSpeaking();
      if (event.code === "Space" && phase !== "considering" && event.target === document.body) {
        event.preventDefault();
        handleMicPress();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleMicPress, phase, stopSpeaking]);

  const notice = error ?? voice.error;
  const showGreeting = currentExchange === null && phase !== "considering" && audience !== "over";
  const minutesLeft = Math.ceil(allowance.remainingMs / 60000);

  return (
    <main className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-stage">
      <AdamsStage phase={phase} mouthLevelRef={mouthLevelRef} didStream={didStream} />

      <StageHeader phase={phase} />

      {/* The scene breathes here — Adams stands full length above the parchment */}
      <div className="min-h-[16vh] flex-1" />

      <section className="relative z-10 flex flex-col gap-4 px-4 pb-[max(1.1rem,env(safe-area-inset-bottom))] sm:gap-5 sm:px-6">
        {showGreeting ? <GreetingCard /> : null}

        {phase === "considering" ? <ConsideringLine question={lastQuestion} /> : null}

        {currentExchange !== null && phase !== "considering" ? (
          <CaptionBand
            exchange={currentExchange}
            revealedAnswer={revealedAnswer}
            phase={phase}
            canGoBack={viewIndex > 0}
            canGoForward={viewIndex < exchanges.length - 1}
            needsPlaybackTap={needsPlaybackTap}
            onPrevious={showPrevious}
            onNext={showNext}
            onStop={stopSpeaking}
            onRetryPlayback={retryPlayback}
          />
        ) : null}

        {audience === "over" && phase !== "speaking" ? <AudienceClosedCard /> : null}

        {notice !== null && audience !== "over" ? (
          <p
            role="status"
            className="mx-auto max-w-2xl rounded-[5px] border border-[hsl(11_50%_45%/0.5)] bg-[hsl(11_45%_16%/0.72)] px-4 py-2 text-center font-serif-voice text-[0.95rem] text-[hsl(41_50%_84%)]"
          >
            {notice}
          </p>
        ) : null}

        {audience === "over" ? null : (
          <div className="flex flex-col items-center gap-1.5 pt-1">
            <VoiceOrb
              status={voice.status}
              isSupported={voice.isSupported}
              disabled={busy}
              speaking={phase === "speaking"}
              onPress={handleMicPress}
            />
            {audienceOpen && minutesLeft <= 2 ? (
              <p className="font-serif-voice text-[0.85rem] italic text-gold/70" aria-live="polite">
                {minutesLeft <= 1 ? "About a minute remains" : "About two minutes remain"} in today's audience
              </p>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
};

export default Index;
