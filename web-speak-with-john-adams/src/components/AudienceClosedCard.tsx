import { Hourglass } from "lucide-react";

import { WaxSeal } from "@/components/WaxSeal";

function hoursUntilMidnight(): string {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const minutes = Math.max(1, Math.round((midnight.getTime() - now.getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} minute${rest === 1 ? "" : "s"}`;
  return `${hours} hour${hours === 1 ? "" : "s"}${rest > 0 ? ` and ${rest} minute${rest === 1 ? "" : "s"}` : ""}`;
}

/**
 * Shown when the visitor's ten minutes for the day are spent: the parchment
 * is sealed and the door reopens at midnight.
 */
export function AudienceClosedCard() {
  return (
    <div className="animate-rise-in relative mx-auto w-full max-w-3xl pt-6">
      <WaxSeal
        size={52}
        className="animate-seal-in absolute left-1/2 top-0 z-10 -translate-x-1/2 [animation-delay:220ms]"
      />
      <div className="paper-grain relative overflow-hidden rounded-[10px] border border-[hsl(40_38%_62%/0.7)] bg-[hsl(41_46%_89%/0.95)] px-6 pb-6 pt-9 shadow-[0_20px_50px_hsl(34_45%_3%/0.6)] sm:px-10 sm:pb-8 sm:pt-11">
        <span className="pointer-events-none absolute inset-[7px] rounded-[6px] border border-[hsl(40_55%_45%/0.35)]" />
        <p className="relative z-[1] text-center font-serif-voice text-[clamp(1.05rem,2.6vw,1.5rem)] leading-snug text-ink">
          Our time is over for today.
        </p>
        <p className="relative z-[1] mt-1.5 text-center font-serif-voice text-[clamp(1rem,2.4vw,1.3rem)] leading-snug text-[hsl(26_30%_24%)]">
          Mr. Adams grants each visitor ten minutes a day. He will receive you again tomorrow.
        </p>
        <p className="relative z-[1] mt-4 flex items-center justify-center gap-2 font-serif-voice text-[0.95rem] italic text-[hsl(26_30%_32%)]">
          <Hourglass className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
          The door reopens in {hoursUntilMidnight()}
        </p>
      </div>
    </div>
  );
}
