import { memo, useEffect, useRef, useState, type MutableRefObject } from "react";

import {
  ADAMS_EYES_CLOSED_URL,
  ADAMS_MOUTH_OPEN_URL,
  ADAMS_PORTRAIT_URL,
} from "@/lib/adams";
import { cn } from "@/lib/utils";

interface AdamsStageProps {
  /** Deepens the vignette while Mr. Adams holds forth. */
  isSpeaking: boolean;
  /** Live mouth-open level (0..1) sampled from his voice. */
  mouthLevelRef: MutableRefObject<number>;
}

/**
 * The full-bleed candlelit scene: Adams standing, facing the viewer, alive —
 * he breathes, blinks, and his mouth moves in time with his spoken answers.
 */
function AdamsStageComponent({ isSpeaking, mouthLevelRef }: AdamsStageProps) {
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const mouthImgRef = useRef<HTMLImageElement | null>(null);
  const eyesImgRef = useRef<HTMLImageElement | null>(null);

  // Preload the face variants so the first cross-fade does not pop.
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

  // Drive the mouth layer from the live voice level, updated outside React renders.
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

  // Natural blinks every few seconds, with the occasional double-blink.
  useEffect(() => {
    if (!ADAMS_EYES_CLOSED_URL) return;
    let timer = 0;

    const blink = (): void => {
      const el = eyesImgRef.current;
      if (el) {
        el.style.opacity = "1";
        window.setTimeout(() => {
          if (el) el.style.opacity = "0";
        }, 130);
        if (Math.random() < 0.25) {
          window.setTimeout(() => {
            if (el) {
              el.style.opacity = "1";
              window.setTimeout(() => {
                if (el) el.style.opacity = "0";
              }, 110);
            }
          }, 320);
        }
      }
      timer = window.setTimeout(blink, 2800 + Math.random() * 3400);
    };

    timer = window.setTimeout(blink, 2000);
    return () => window.clearTimeout(timer);
  }, []);

  const frameClass =
    "absolute left-0 h-[110%] w-full -translate-y-[4%] object-cover object-[50%_8%] transition-opacity duration-[1600ms] ease-out";

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-stage" aria-hidden="true">
      <div className="adams-breathe absolute inset-0">
        <img
          src={ADAMS_PORTRAIT_URL}
          alt=""
          className={cn(
            frameClass,
            "top-[-5%]",
            isLoaded ? "opacity-100" : "opacity-0",
          )}
          draggable={false}
        />

        {ADAMS_MOUTH_OPEN_URL ? (
          <img
            ref={mouthImgRef}
            src={ADAMS_MOUTH_OPEN_URL}
            alt=""
            className={cn(frameClass, "top-[-5%] opacity-0")}
            draggable={false}
          />
        ) : null}

        {ADAMS_EYES_CLOSED_URL ? (
          <img
            ref={eyesImgRef}
            src={ADAMS_EYES_CLOSED_URL}
            alt=""
            className={cn(frameClass, "top-[-5%] opacity-0")}
            draggable={false}
          />
        ) : null}
      </div>

      {/* Candle glow at the left of the scene */}
      <div className="animate-candle-flicker absolute left-[14%] top-[38%] h-[38vh] w-[38vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,hsl(38_85%_62%/0.24),transparent_65%)]" />

      {/* Edge vignette — deepens while he speaks so the caption carries the eye */}
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

      {/* Floor of shadow beneath the floating parchment */}
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
