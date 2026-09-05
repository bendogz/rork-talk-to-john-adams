import { memo, useEffect, useRef, useState, type MutableRefObject } from "react";

import type { StagePhase } from "@/hooks/useAdamsConversation";
import { createAdamsAgentSession, destroyAdamsAgentSession, isAgentEnabled, type AdamsAgentCallbacks } from "@/lib/didAgent";

interface AdamsStageProps {
  phase: StagePhase;
  mouthLevelRef: MutableRefObject<number>;
  didStream?: MediaStream | null;
}

function AdamsStageComponent({ didStream }: AdamsStageProps) {
  const didVideoRef = useRef<HTMLVideoElement | null>(null);
  const stageManagerRef = useRef<Awaited<ReturnType<typeof createAdamsAgentSession>> | null>(null);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(didStream ?? null);

  useEffect(() => {
    if (!isAgentEnabled()) return;

    let cancelled = false;
    const callbacks: AdamsAgentCallbacks = {
      onStream: (stream) => {
        if (!cancelled) setLiveStream(stream);
      },
      onFail: (message) => console.warn("[adams] live presenter", message),
      onIdle: () => undefined,
    };

    void createAdamsAgentSession(callbacks)
      .then((manager) => {
        if (cancelled) void destroyAdamsAgentSession(manager);
        else stageManagerRef.current = manager;
      })
      .catch((error) => console.warn("[adams] could not open live presenter", error));

    return () => {
      cancelled = true;
      const manager = stageManagerRef.current;
      stageManagerRef.current = null;
      if (manager) void destroyAdamsAgentSession(manager);
    };
  }, []);

  useEffect(() => {
    if (didStream) setLiveStream(didStream);
  }, [didStream]);

  const stream = didStream ?? liveStream;

  useEffect(() => {
    const el = didVideoRef.current;
    if (!el || !stream) return;

    // Use the complete D-ID WebRTC stream. Its audio is the same stream that
    // drives the presenter's mouth, so the voice and lip movement stay synced.
    el.srcObject = stream;
    el.muted = false;
    el.defaultMuted = false;
    el.volume = 1;
    el.playsInline = true;
    void el.play().catch(() => undefined);

    return () => {
      if (el.srcObject === stream) el.srcObject = null;
    };
  }, [stream]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_50%_35%,hsl(35_25%_16%),hsl(30_25%_5%)_68%,hsl(25_20%_2%))]" aria-hidden="true">
      <div className="absolute left-1/2 top-[5.5vh] h-[72vh] w-[min(88vw,62vh)] -translate-x-1/2 overflow-hidden rounded-[2px] border-[10px] border-[hsl(36_32%_25%)] bg-black shadow-[0_20px_70px_hsl(0_0%_0%/0.65),inset_0_0_0_2px_hsl(40_45%_58%/0.25)]">
        <div className="absolute inset-[5px] z-10 rounded-[1px] border border-[hsl(40_45%_58%/0.45)]" />
        {stream ? (
          <video
            ref={didVideoRef}
            autoPlay
            playsInline
            className="h-full w-full object-contain object-center [transform:translateZ(0)] [backface-visibility:hidden]"
          />
        ) : null}
      </div>
    </div>
  );
}

export const AdamsStage = memo(AdamsStageComponent);
