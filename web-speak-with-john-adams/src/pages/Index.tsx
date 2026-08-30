import { useCallback, useEffect, useRef, useState } from "react";

import { AdamsStage } from "@/components/AdamsStage";
import { CaptionBand } from "@/components/CaptionBand";
import { ConsideringLine } from "@/components/ConsideringLine";
import { GreetingCard } from "@/components/GreetingCard";
import { StageHeader } from "@/components/StageHeader";
import { VoiceOrb } from "@/components/VoiceOrb";
import { useAdamsConversation } from "@/hooks/useAdamsConversation";
import { useVoiceInput } from "@/hooks/useVoiceInput";

const Index = () => {
  const [lastQuestion, setLastQuestion] = useState<string>("");
  /** Set once `voice` exists below; keeps the mic hook's callback stable. */
  const askRef = useRef<(question: string) => void>(() => undefined);
  const voiceRef = useRef<ReturnType<typeof useVoiceInput> | null>(null);
  /** Auto-listen only once the visitor has spoken at least once this session. */
  const hasSpokenOnceRef = useRef<boolean>(false);

  const {
    phase,
    exchanges,
    currentExchange,
    viewIndex,
    revealedAnswer,
    error,
    needsPlaybackTap,
    mouthLevelRef,
    ask,
    stopSpeaking,
    retryPlayback,
    showPrevious,
    showNext,
    dismissError,
  } = useAdamsConversation({
    // The back-and-forth: when he finishes, the seal opens to hear the reply.
    onAnswerComplete: () => {
      if (hasSpokenOnceRef.current) void voiceRef.current?.start();
    },
  });

  const busy = phase === "considering";

  const handleAsk = useCallback((question: string): void => {
    askRef.current(question);
  }, []);

  const voice = useVoiceInput(handleAsk);

  const submitQuestion = useCallback(
    (question: string): void => {
      const trimmed = question.trim();
      if (trimmed.length === 0) return;
      dismissError();
      voice.clearError();
      setLastQuestion(trimmed);
      void ask(trimmed);
    },
    [ask, dismissError, voice],
  );

  useEffect(() => {
    askRef.current = submitQuestion;
  }, [submitQuestion]);

  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);

  useEffect(() => {
    if (voice.status === "listening") hasSpokenOnceRef.current = true;
  }, [voice.status]);

  const handleMicPress = useCallback((): void => {
    if (phase === "speaking") stopSpeaking();
    voice.toggle();
  }, [phase, stopSpeaking, voice]);

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
  const showGreeting = currentExchange === null && phase !== "considering";

  return (
    <main className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-stage">
      <AdamsStage isSpeaking={phase === "speaking"} mouthLevelRef={mouthLevelRef} />

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

        {notice !== null ? (
          <p
            role="status"
            className="mx-auto max-w-2xl rounded-[5px] border border-[hsl(11_50%_45%/0.5)] bg-[hsl(11_45%_16%/0.72)] px-4 py-2 text-center font-serif-voice text-[0.95rem] text-[hsl(41_50%_84%)]"
          >
            {notice}
          </p>
        ) : null}

        <div className="pt-1">
          <VoiceOrb
            status={voice.status}
            isSupported={voice.isSupported}
            disabled={busy}
            onPress={handleMicPress}
          />
        </div>
      </section>
    </main>
  );
};

export default Index;
