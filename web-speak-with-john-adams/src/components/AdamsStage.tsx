import { memo, useEffect, useRef, type MutableRefObject } from "react";

import type { StagePhase } from "@/hooks/useAdamsConversation";
import { cn } from "@/lib/utils";

interface AdamsStageProps {
  phase: StagePhase;
  mouthLevelRef: MutableRefObject<number>;
  didStream?: MediaStream | null;
}

function AdamsStageComponent({ phase, didStream }: AdamsStageProps) {
  const isSpeaking = phase === "speaking";
  const didVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = didVideoRef.current;
    if (!el || !didStream) return;
    if (el.srcObject !== didStream) el.srcObject = didStream;
    void el.play().catch(() => undefined);

    return () => {
      if (el.srcObject === didStream) el.srcObject = null;
    };
  }, [didStream]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-stage" aria-hidden="true">
      {didStream ? (
        <video
          ref={didVideoRef}
          autoPlay
          playsInline
          muted
          className={cn(
            "absolute inset-0 h-full w-full object-cover object-center motion-fade-in",
          )}
        />
      ) : (
        <div className="absolute inset-0 bg-stage" />
      )}

      <div className="animate-candle-flicker absolute left-[14%] top-[38%] h-[38vh] w-[38vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,hsl(38_85%_62%/0.24),transparent_65%)]" />
      <div
        className={cn("absolute inset-0 transition-opacity duration-700", isSpeaking ? "opacity-100" : "opacity-80")}
        style={{ background: "radial-gradient(120% 85% at 50% 34%, transparent 28%, hsl(34 40% 4% / 0.5) 72%, hsl(34 45% 3% / 0.9) 100%)" }}
      />
      <div
        className={cn("absolute inset-x-0 bottom-0 h-[62%] transition-opacity duration-700", isSpeaking ? "opacity-100" : "opacity-85")}
        style={{ background: "linear-gradient(to top, hsl(34 45% 3% / 0.94), hsl(34 40% 5% / 0.5) 46%, transparent)" }}
      />
      <div className="absolute inset-x-0 top-0 h-32" style={{ background: "linear-gradient(to bottom, hsl(34 45% 3% / 0.6), transparent)" }} />
    </div>
  );
}

export const AdamsStage = memo(AdamsStageComponent);
