import { Loader2, Mic } from "lucide-react";

import type { VoiceStatus } from "@/hooks/useVoiceInput";
import { cn } from "@/lib/utils";

interface VoiceOrbProps {
  status: VoiceStatus;
  isSupported: boolean;
  disabled: boolean;
  onPress: () => void;
}

const STATUS_TEXT: Record<VoiceStatus, string> = {
  idle: "Touch the seal and speak",
  listening: "I am listening…",
  transcribing: "Making out your words…",
  ambient: "Speak up whenever you wish — I will yield the floor",
};

/**
 * The single wax-seal microphone. No keyboard: the visitor presses the seal,
 * speaks, and the question ends itself once they fall quiet.
 */
export function VoiceOrb({ status, isSupported, disabled, onPress }: VoiceOrbProps) {
  /** Armed: the ear is open and a raised voice interrupts him. */
  const isArmed = status === "listening" || status === "ambient";
  const isListening = status === "listening";
  const isAmbient = status === "ambient";
  const isTranscribing = status === "transcribing";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative flex items-center justify-center">
        {isListening ? (
          <>
            <span className="animate-ping absolute h-20 w-20 rounded-full bg-[hsl(4_72%_45%/0.35)] sm:h-24 sm:w-24" />
            <span
              className="animate-ping absolute h-20 w-20 rounded-full bg-[hsl(4_72%_45%/0.22)] sm:h-24 sm:w-24"
              style={{ animationDelay: "450ms" }}
            />
          </>
        ) : null}

        {isAmbient ? (
          <span className="animate-pulse absolute h-[4.6rem] w-[4.6rem] rounded-full bg-[hsl(4_72%_45%/0.26)] sm:h-[5.6rem] sm:w-[5.6rem]" />
        ) : null}

        <button
          type="button"
          onClick={onPress}
          disabled={disabled || !isSupported || isTranscribing}
          aria-label={isListening ? "Finish my question" : "Speak to Mr. Adams"}
          aria-pressed={isArmed}
          className={cn(
            "relative flex h-20 w-20 items-center justify-center rounded-full border-2 transition-[transform,box-shadow,background-color] duration-300 sm:h-24 sm:w-24",
            "bg-[radial-gradient(circle_at_35%_30%,hsl(8_55%_34%),hsl(11_68%_22%)_70%)]",
            isArmed
              ? "border-[hsl(4_78%_56%)] shadow-[0_0_0_6px_hsl(4_72%_45%/0.2),0_14px_36px_hsl(34_45%_3%/0.7)]"
              : "border-[hsl(41_45%_42%/0.7)] shadow-[0_10px_30px_hsl(34_45%_3%/0.65)]",
            "hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:brightness-100",
          )}
        >
          <span className="pointer-events-none absolute inset-[9px] rounded-full border border-[hsl(41_60%_70%/0.35)]" aria-hidden="true" />
          {isTranscribing ? (
            <Loader2 className="h-7 w-7 animate-spin text-[hsl(41_55%_88%)]" strokeWidth={1.9} aria-hidden="true" />
          ) : (
            <Mic className="h-7 w-7 text-[hsl(41_55%_88%)]" strokeWidth={1.7} aria-hidden="true" />
          )}
        </button>
      </div>

      <p className="font-serif-voice text-[0.98rem] italic text-gold-bright/90" aria-live="polite">
        {!isSupported
          ? "This browser will not lend a microphone — Mr. Adams awaits another device."
          : STATUS_TEXT[status]}
      </p>
    </div>
  );
}
