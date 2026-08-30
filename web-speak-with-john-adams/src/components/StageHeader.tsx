import { useState } from "react";
import { AudioLines, Settings } from "lucide-react";

import { SettingsDialog } from "@/components/SettingsDialog";
import type { StagePhase } from "@/hooks/useAdamsConversation";
import { APP_SUBTITLE, APP_TITLE } from "@/lib/adams";

interface StageHeaderProps {
  phase: StagePhase;
}

/** Wordmark over the scene, which yields to a speaking indicator while he holds forth. */
export function StageHeader({ phase }: StageHeaderProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const isSpeaking = phase === "speaking";
  const isConsidering = phase === "considering";

  return (
    <header className="relative z-10 flex justify-center px-4 pt-[max(0.9rem,env(safe-area-inset-top))]">
      {isSpeaking || isConsidering ? (
        <p className="animate-rise-in flex items-center gap-2.5 font-serif-voice text-[0.95rem] tracking-wide text-gold-bright sm:text-[1.05rem]">
          <AudioLines
            className={isSpeaking ? "h-[18px] w-[18px] animate-pulse" : "h-[18px] w-[18px]"}
            strokeWidth={1.8}
            aria-hidden="true"
          />
          {isSpeaking ? "Mr. Adams is speaking" : "Mr. Adams considers your question"}
        </p>
      ) : (
        <div className="flex items-center gap-3 text-gold">
          <Ornament />
          <h1 className="text-center font-display text-[clamp(1rem,2.6vw,1.4rem)] leading-none tracking-wide text-[hsl(41_58%_84%)]">
            {APP_TITLE}
            <span className="ml-2 hidden font-serif-voice text-[0.78em] tracking-normal text-gold/85 sm:inline">
              &mdash; {APP_SUBTITLE}
            </span>
          </h1>
          <Ornament />
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsSettingsOpen(true)}
        aria-label="The private offices — settings"
        className="absolute right-3 top-[max(0.7rem,env(safe-area-inset-top))] flex h-10 w-10 items-center justify-center rounded-full text-gold-bright/70 transition-colors hover:bg-[hsl(41_60%_50%/0.12)] hover:text-gold-bright sm:right-5"
      >
        <Settings className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" />
      </button>

      <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
    </header>
  );
}

function Ornament() {
  return (
    <span className="select-none text-sm leading-none opacity-80" aria-hidden="true">
      &#8734;
    </span>
  );
}
