/**
 * His speaking repertoire — a handful of Viggle-rendered clips of John Adams
 * mid-address in his own picture, standing, gesturing, face to the visitor.
 * They are baked into the app: they play on loop while he answers, one clip
 * to an answer, so the scene never cuts away.
 */

export interface SpeakingClip {
  name: string;
  url: string;
}

export const SPEAKING_CLIPS: SpeakingClip[] = [
  { name: "Addresses the room", url: "/motions/2960.mp4" },
  { name: "Instructs the assembly", url: "/motions/50117.mp4" },
  { name: "Holds forth", url: "/motions/23117.mp4" },
  { name: "Argues the point", url: "/motions/2955.mp4" },
];

/** One steady clip for a given answer, chosen by its place in the conversation. */
export function speakingClipForAnswer(answerIndex: number): SpeakingClip {
  return SPEAKING_CLIPS[answerIndex % SPEAKING_CLIPS.length];
}
