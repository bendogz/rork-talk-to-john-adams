import { cn } from "@/lib/utils";

interface WaxSealProps {
  className?: string;
  /** Diameter in pixels. */
  size?: number;
}

/** The wax-red "JA" seal that marks Mr. Adams' own words. */
export function WaxSeal({ className, size = 46 }: WaxSealProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-[hsl(11_60%_22%/0.7)] shadow-[0_6px_14px_hsl(34_45%_3%/0.55),inset_0_1px_2px_hsl(11_70%_52%/0.55)]",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: "radial-gradient(circle at 34% 28%, hsl(11 62% 44%), hsl(11 70% 27%) 68%, hsl(11 72% 20%))",
      }}
      aria-hidden="true"
    >
      <span
        className="font-display leading-none text-[hsl(41_60%_86%/0.92)]"
        style={{ fontSize: size * 0.36 }}
      >
        JA
      </span>
    </span>
  );
}
