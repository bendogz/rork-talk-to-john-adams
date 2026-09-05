import { memo, useEffect, useRef, useState, type MutableRefObject } from "react";

import type { StagePhase } from "@/hooks/useAdamsConversation";
import {
  ADAMS_EYES_CLOSED_URL,
  ADAMS_MOUTH_OPEN_URL,
  ADAMS_PORTRAIT_URL,
} from "@/lib/adams";
import { cn } from "@/lib/utils";

interface AdamsStageProps {
  phase: StagePhase;
  mouthLevelRef: MutableRefObject<number>;
  didStream?: MediaStream | null;
}

/**
 * Keeps the original candlelit illustration as the scene and uses the live
 * D-ID V2 presenter only as a head/face replacement. This preserves the body,
 * clothing, desk, room and composition of the artwork instead of replacing
 * the whole character with the D-ID video.
 */
function AdamsStageComponent({ phase, mouthLevelRef, didStream }: AdamsStageProps) {
  const isSpeaking = phase === "speaking";
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const mouthImgRef = useRef<HTMLImageElement | null>(null);
  const eyesImgRef = useRef<HTMLImageElement | null>(null);
  const didVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const sources = [ADAMS_PORTRAIT_URL, ADAMS_MOUTH_OPEN_URL, ADAMS_EYES_CLOSED_URL];
    let pending = 0;
    sources.forEach((source) => {
      if (!source) return;
      pending += 1;
      const image = new Image();
      const done = (): void => {
        pending -= 1;
        if (pending <= 0) setIsLoaded(true);
      };
      if (image.complete && image.src) {
        done();
        return;
      }
      image.onload = done;
      image.onerror = done;
      image.src = source;
    });
  }, []);

  useEffect(() => {
    if (!ADAMS_MOUTH_OPEN_URL) return;
    let frame = 0;
    const tick = (): void => {
      const el = mouthImgRef.current;
      if (el) el.style.opacity = String(Math.min(1, Math.max(0, mouthLevelRef.current)));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [mouthLevelRef]);

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
    if (!ADAMS_EYES_CLOSED_URL) return;
    let timer = 0;
    const blink = (): void => {
      const el = eyesImgRef.current;
      if (el) {
        el.style.opacity = "1";
        window.setTimeout(() => { if (el) el.style.opacity = "0"; }, 130);
        if (Math.random() < 0.25) {
          window.setTimeout(() => {
            if (!el) return;
            el.style.opacity = "1";
            window.setTimeout(() => { if (el) el.style.opacity = "0"; }, 110);
          }, 320);
        }
      }
      timer = window.setTimeout(blink, 2800 + Math.random() * 3400);
    };
    timer = window.setTimeout(blink, 2000);
    return () => window.clearTimeout(timer);
  }, []);

  const frameClass =
    "absolute left-0 h-[110%] w-full -translate-y-[4%] object-cover object-[50%_8%]";
  const layerClass = "absolute inset-0 transition-opacity duration-[700ms] ease-in-out";

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-stage" aria-hidden="true">
      {/* Original artwork stays visible at all times. */}
      <div className="adams-breathe absolute inset-0">
        <div className={layerClass}>
          <img
            src={ADAMS_PORTRAIT_URL}
            alt=""
            className={cn(frameClass, isLoaded ? "opacity-100" : "opacity-0")}
            draggable={false}
          />

          {ADAMS_MOUTH_OPEN_URL ? (
            <img
              ref={mouthImgRef}
              src={ADAMS_MOUTH_OPEN_URL}
              alt=""
              className={cn(frameClass, "opacity-0")}
              draggable={false}
            />
          ) : null}

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
      </div>

      {/*
       * V2 live presenter: deliberately clipped to the head area. The D-ID
       * video is NOT allowed to cover the body or room. The exact crop is kept
       * responsive so the original composition remains the visual foundation.
       */}
      {didStream ? (
        <div
          className="absolute left-1/2 top-[5%] z-20 h-[38%] w-[28%] -translate-x-1/2 overflow-hidden rounded-[50%] transition-opacity duration-500"
          style={{
            clipPath: "ellipse(46% 48% at 50% 46%)",
            WebkitClipPath: "ellipse(46% 48% at 50% 46%)",
            filter: "drop-shadow(0 8px 18px rgba(0,0,0,.22))",
          }}
        >
          <video
            ref={didVideoRef}
            autoPlay
            playsInline
            muted={false}
            className="absolute left-1/2 top-0 h-[150%] w-[150%] -translate-x-1/2 object-cover object-[50%_14%]"
          />
        </div>
      ) : null}

      <div className="animate-candle-flicker absolute left-[14%] top-[38%] h-[38vh] w-[38vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,hsl(38_85%_62%/0.24),transparent_65%)]" />

      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-700",
          isSpeaking ? "opacity-100" : "opacity-80",
        )}
        style={{
          background:
            "radial-gradient(120% 85% at 50% 34%, transparent 28%, hsl(34 40% 4% / 0.5) 72%, hsl(34 45% 3% / 0.9) 100%)",
        }}
      />

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 h-[62%] transition-opacity duration-700",
          isSpeaking ? "opacity-100" : "opacity-85",
        )}
        style={{
          background: "linear-gradient(to top, hsl(34 45% 3% / 0.94), hsl(34 40% 5% / 0.5) 46%, transparent)",
        }}
      />

      <div
        className="absolute inset-x-0 top-0 h-32"
        style={{ background: "linear-gradient(to bottom, hsl(34 45% 3% / 0.6), transparent)" }}
      />
    </div>
  );
}

export const AdamsStage = memo(AdamsStageComponent);
