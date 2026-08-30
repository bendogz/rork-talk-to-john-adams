/**
 * His repertoire, wrought in advance: each entry is a full-body motion of
 * Adams rendered by Viggle from his standing portrait and baked into the app
 * itself, so he arrives knowing how to stand, sit, pace, ponder, and laugh —
 * no visitor's hand required. While he listens or ponders, the stage drifts
 * among these; while he speaks, the living portrait takes the frame.
 */

export type MotionTag = "idle" | "gesture" | "ponder" | "walk" | "sit" | "laugh";

export interface MotionClip {
  name: string;
  /** Served from the app's own public/ folder — permanent, no studio needed. */
  url: string;
  tags: MotionTag[];
}

export const MOTION_CLIPS: MotionClip[] = [
  { name: "Stands at ease", url: "/motions/33435.mp4", tags: ["idle"] },
  { name: "Addresses the room", url: "/motions/2960.mp4", tags: ["gesture"] },
  { name: "Argues the point", url: "/motions/23117.mp4", tags: ["gesture"] },
  { name: "Instructs the assembly", url: "/motions/50117.mp4", tags: ["gesture"] },
  { name: "Delivers his speech", url: "/motions/2955.mp4", tags: ["gesture"] },
  { name: "Ponders, hand to chin", url: "/motions/5507.mp4", tags: ["ponder"] },
  { name: "Sets pen to paper", url: "/motions/15774.mp4", tags: ["ponder"] },
  { name: "Takes his seat", url: "/motions/16087.mp4", tags: ["sit"] },
  { name: "Laughs heartily", url: "/motions/8741.mp4", tags: ["laugh"] },
  { name: "Crosses the hall", url: "/motions/4832.mp4", tags: ["walk"] },
  { name: "Paces the walk", url: "/motions/23410.mp4", tags: ["walk"] },
];

/** The motions that suit the moment: thought while he considers, all else otherwise. */
export function motionsForPhase(phase: "considering" | "other"): MotionClip[] {
  if (phase === "considering") {
    const pondering = MOTION_CLIPS.filter((clip) => clip.tags.includes("ponder"));
    if (pondering.length > 0) return pondering;
  }
  return MOTION_CLIPS;
}
