import { memo, useEffect, useRef, useState, type MutableRefObject } from "react";

import type { StagePhase } from "@/hooks/useAdamsConversation";
import { ADAMS_EYES_CLOSED_URL, ADAMS_PORTRAIT_URL } from "@/lib/adams";
import { cn } from "@/lib/utils";

interface AdamsStageProps {
  phase: StagePhase;
  mouthLevelRef: MutableRefObject<number>;
  didStream?: MediaStream | null;
}

function AdamsStageComponent({ phase, didStream }: AdamsStageProps) {
  const isSpeaking = phase === "speaking";
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const eyesImgRef = useRef<HTMLImageElement | null>(null);
  const didVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!ADAMS_PORTRAIT_URL) return;
    const image = new Image();
    image.onload = () => setIsLoaded(true);
    image.onerror = () => setIsLoaded(true);
    image.src = ADAMS_PORTRAIT_URL;
  }, []);

  useEffect(() => {
    const el = didVideoRef.current;
    if (!el) return;
    if (didStream) {
      if (el.srcObject !== didStream) el.srcObject = didStream;
      void el.play().catch(() => undefined);
    } else {
      el.srcObject = null;
    }
  }, [didStream]);

  useEffect(() => {
    if (!ADAMS_EYES_CLOSED_URL || didStream) return;
    let timer = 0;
    const blink = (): void => {
      const el = eyesImgRef.current;
      if (el) {
        el.style.opacity = "1";
        window.setTimeout(() => { if (el) el.style.opacity = "0"; }, 130);
      }
      timer = window.setTimeout(blink, 2800 + Math.random() * 3400);
    };
    timer = window.setTimeout(blink, 2000);
    return () => window.clearTimeout(timer);
  }, [didStream]);

  const frameClass =
    "absolute left-0 h-[110%] w-full -translate-y-[4%] object-cover object-[50%_8%]";

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-stage" aria-hidden="true">
      {/* Keep the original scene as the background, but remove its Adams figure
          completely whenever the live V2 Agent is available. */}
      {!didStream ? (
        <div className="absolute inset-0">
          <img
            src={ADAMS_PORTRAIT_URL}
            alt=""
            className={cn(frameClass, isLoaded ? "opacity-100" : "opacity-0")}
            draggable={false}
          />
          {ADAMS_EYES_CLOSED_URL ? (
            <img
              ref={eyesImgRef}
              src={ADAMS_EYES_CLOSED_URL}
              alt=""
              className={cn(frameClass, "opacity-0")}
              draggable={false}
            />
          ) : null}
        </div>
      ) : (
        <video
          ref={didVideoRef}
          autoPlay
          playsInline
          className={cn(frameClass, "motion-fade-in")}
        />
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
