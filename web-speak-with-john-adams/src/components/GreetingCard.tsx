import { WaxSeal } from "@/components/WaxSeal";
import { GREETING_LINES } from "@/lib/adams";

/**
 * The first-run welcome: a parchment card sealed in wax, so a newcomer is
 * greeted rather than left staring at silence.
 */
export function GreetingCard() {
  return (
    <div className="animate-rise-in relative mx-auto w-full max-w-3xl pt-6">
      <WaxSeal
        size={52}
        className="animate-seal-in absolute left-1/2 top-0 z-10 -translate-x-1/2 [animation-delay:220ms]"
      />

      <div className="paper-grain relative overflow-hidden rounded-[10px] border border-[hsl(40_38%_62%/0.7)] bg-[hsl(41_46%_89%/0.95)] px-6 pb-6 pt-9 shadow-[0_20px_50px_hsl(34_45%_3%/0.6)] sm:px-10 sm:pb-8 sm:pt-11">
        {/* Engraved inner border */}
        <span className="pointer-events-none absolute inset-[7px] rounded-[6px] border border-[hsl(40_55%_45%/0.35)]" />

        <p className="relative z-[1] text-center font-serif-voice text-[clamp(1.05rem,2.6vw,1.5rem)] leading-snug text-ink">
          {GREETING_LINES[0]}
        </p>
        <p className="relative z-[1] mt-1.5 text-center font-serif-voice text-[clamp(1rem,2.4vw,1.4rem)] leading-snug text-[hsl(26_30%_24%)]">
          {GREETING_LINES[1]}
        </p>
      </div>
    </div>
  );
}
