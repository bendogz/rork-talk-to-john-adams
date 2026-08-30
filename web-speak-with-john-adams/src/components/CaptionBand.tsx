import { ChevronLeft, ChevronRight, Square, Volume2 } from "lucide-react";
import { useEffect, useRef } from "react";

import type { StagePhase } from "@/hooks/useAdamsConversation";
import type { Exchange } from "@/lib/adams";
import { cn } from "@/lib/utils";

interface CaptionBandProps {
  exchange: Exchange;
  revealedAnswer: string;
  phase: StagePhase;
  canGoBack: boolean;
  canGoForward: boolean;
  needsPlaybackTap: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onStop: () => void;
  onRetryPlayback: () => void;
}

/**
 * Mr. Adams' words set as an engraved caption over the scene, revealed in
 * time with his voice and framed by gold rules.
 */
export function CaptionBand({
  exchange,
  revealedAnswer,
  phase,
  canGoBack,
  canGoForward,
  needsPlaybackTap,
  onPrevious,
  onNext,
  onStop,
  onRetryPlayback,
}: CaptionBandProps) {
  const isSpeaking = phase === "speaking";
  // While he speaks, only the revealed words show — never the whole answer at once.
  const shown = isSpeaking ? revealedAnswer : exchange.answer;

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Follow the writing like a reader would, unless the visitor scrolled up to reread.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isSpeaking) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (isNearBottom) el.scrollTop = el.scrollHeight;
  }, [isSpeaking, revealedAnswer]);

  return (
    <div className="animate-rise-in mx-auto w-full max-w-4xl">
      <Flourish />

      <div className="relative px-8 py-4 sm:px-14 sm:py-5">
        {canGoBack ? (
          <NavArrow side="left" label="Earlier reply" onClick={onPrevious} />
        ) : null}
        {canGoForward ? (
          <NavArrow side="right" label="Later reply" onClick={onNext} />
        ) : null}

        {exchange.question.length > 0 ? (
          <p className="sr-only">You asked: {exchange.question}</p>
        ) : null}

        <div
          ref={scrollRef}
          className="no-scrollbar min-h-[4.5rem] max-h-[36vh] overflow-y-auto overscroll-contain sm:max-h-[42vh]"
        >
          <p
            aria-live="polite"
            className="text-engraved text-center font-serif-voice text-[clamp(1.15rem,3.1vw,2.05rem)] leading-[1.32] text-[hsl(41_58%_90%)]"
          >
            <span aria-hidden="true">&ldquo;</span>
            {shown}
            {isSpeaking && revealedAnswer.length < exchange.answer.length ? (
              <span className="ml-0.5 inline-block h-[0.85em] w-[2px] translate-y-[0.1em] animate-quill-pulse bg-gold-bright align-middle" />
            ) : (
              <span aria-hidden="true">&rdquo;</span>
            )}
          </p>
        </div>
      </div>

      <Flourish />

      <div className="flex min-h-[44px] items-center justify-center gap-3 pt-3">
        {isSpeaking ? (
          <button
            type="button"
            onClick={onStop}
            className="inline-flex min-h-[42px] items-center gap-2.5 rounded-[4px] border border-[hsl(40_55%_55%/0.6)] bg-[hsl(34_40%_8%/0.55)] px-5 py-2 font-serif-voice text-[0.98rem] text-[hsl(41_55%_86%)] transition-colors duration-200 hover:border-gold-bright hover:bg-[hsl(34_40%_10%/0.75)] hover:text-gold-bright"
          >
            <Square className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            Stop him
          </button>
        ) : null}

        {needsPlaybackTap ? (
          <button
            type="button"
            onClick={onRetryPlayback}
            className="inline-flex min-h-[42px] items-center gap-2.5 rounded-[4px] border border-[hsl(40_55%_55%/0.6)] bg-[hsl(34_40%_8%/0.55)] px-5 py-2 font-serif-voice text-[0.98rem] text-gold-bright transition-colors duration-200 hover:bg-[hsl(34_40%_10%/0.8)]"
          >
            <Volume2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Hear him
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Flourish() {
  return (
    <div className="relative flex items-center justify-center" aria-hidden="true">
      <div className="rule-flourish w-full" />
      <span className="absolute select-none px-2 text-[0.7rem] leading-none text-gold/80" style={{ background: "transparent" }}>
        &#10087;
      </span>
    </div>
  );
}

interface NavArrowProps {
  side: "left" | "right";
  label: string;
  onClick: () => void;
}

function NavArrow({ side, label, onClick }: NavArrowProps) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "absolute top-1/2 flex h-11 w-8 -translate-y-1/2 items-center justify-center text-gold/70 transition-colors duration-200 hover:text-gold-bright",
        side === "left" ? "left-0" : "right-0",
      )}
    >
      <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}
