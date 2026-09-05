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

  // The D-ID Agent is the entire visual scene. There is deliberately no
  // fallback portrait, historical image, or decorative background here.
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-black" aria-hidden="true">
      {didStream ? (
        <video
          ref={didVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
      ) : null}
    </div>
  );
}

export const AdamsStage = memo(AdamsStageComponent);
