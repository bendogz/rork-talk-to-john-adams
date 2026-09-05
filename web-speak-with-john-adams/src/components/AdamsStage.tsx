import { memo, useEffect, useRef, type MutableRefObject } from "react";

import type { StagePhase } from "@/hooks/useAdamsConversation";

interface AdamsStageProps {
  phase: StagePhase;
  mouthLevelRef: MutableRefObject<number>;
  didStream?: MediaStream | null;
}

function AdamsStageComponent({ didStream }: AdamsStageProps) {
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

  // The live D-ID Agent is the only portrait. The old static Adams image is
  // intentionally gone. The live presenter is displayed as a framed founding-
  // father portrait so Adams remains visibly "in the frame" without a second image.
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_50%_35%,hsl(35_25%_16%),hsl(30_25%_5%)_68%,hsl(25_20%_2%))]" aria-hidden="true">
      {didStream ? (
        <div className="absolute left-1/2 top-[5.5vh] h-[72vh] w-[min(88vw,62vh)] -translate-x-1/2 overflow-hidden rounded-[2px] border-[10px] border-[hsl(36_32%_25%)] bg-black shadow-[0_20px_70px_hsl(0_0%_0%/0.65),inset_0_0_0_2px_hsl(40_45%_58%/0.25)]">
          <div className="absolute inset-[5px] z-10 rounded-[1px] border border-[hsl(40_45%_58%/0.45)]" />
          <video
            ref={didVideoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover object-center"
          />
        </div>
      ) : null}
    </div>
  );
}

export const AdamsStage = memo(AdamsStageComponent);
