/**
 * Viggle: the painted portrait given a full, living body. His portrait is
 * preprocessed once into a reusable character; motion templates (or a driving
 * video of one's own) are rendered against it, and minutes later a clip
 * returns in which he paces, sits, and gestures in the picture itself.
 * Renders are slow and cost one credit per second of film, so clips are made
 * ahead of time and kept; nothing here needs to be fast.
 */

import { ADAMS_PORTRAIT_URL } from "@/lib/adams";
import { getSettings, updateSettings, type MotionClip } from "@/lib/settings";

const API_BASE = "https://apis.viggle.ai/v1";
const POLL_MS = 4000;
const MAX_POLLS = 300; // ~20 minutes before a render is given up on

const trackedRenders = new Set<string>();

export class ViggleError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ViggleError";
    this.status = status;
  }
}

function friendlyMessage(status: number): string {
  if (status === 401) return "The motion studio refuses its key. Pray check the Viggle account.";
  if (status === 402) return "The motion studio's credits have run dry. Visit portal.viggle.ai to set it right.";
  if (status === 409) return "He is still rehearsing that motion — one moment, then try again.";
  if (status === 429) return "The motion studio is much in demand this moment. Wait briefly.";
  return "The motion studio could not be reached just now.";
}

/** True when a Viggle key is built into the app's foundations. */
export function isViggleEnabled(): boolean {
  return (import.meta.env.VITE_VIGGLE_API_KEY ?? "").trim().length > 0;
}

async function viggleFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${(import.meta.env.VITE_VIGGLE_API_KEY ?? "").trim()}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    console.error("[adams] Viggle request failed", path, response.status);
    throw new ViggleError(friendlyMessage(response.status), response.status);
  }
  return (await response.json()) as T;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

/** The portrait, preprocessed once into a reusable Viggle character. */
export async function ensureViggleCharacter(): Promise<string> {
  const existing = getSettings().viggleCharacterId;
  if (existing.length > 0) {
    try {
      const character = await viggleFetch<{ status?: string }>(`/characters/${existing}`);
      if (character.status === "ready") return existing;
      if (character.status === "queued" || character.status === "processing") {
        await waitForCharacter(existing);
        return existing;
      }
      // "failed" or unknown: forge him anew below.
    } catch (characterError) {
      console.warn("[adams] stored Viggle character unusable; forging anew", characterError);
    }
  }

  const form = new FormData();
  form.append("image_url", ADAMS_PORTRAIT_URL);
  form.append("name", "John Adams");
  const created = await viggleFetch<{ id: string }>("/characters", { method: "POST", body: form });
  updateSettings({ viggleCharacterId: created.id });
  await waitForCharacter(created.id);
  return created.id;
}

async function waitForCharacter(id: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await sleep(3000);
    const character = await viggleFetch<{ status?: string }>(`/characters/${id}`);
    if (character.status === "ready") return;
    if (character.status === "failed") {
      throw new ViggleError("The portrait could not be prepared for motion.", 500);
    }
  }
  throw new ViggleError("The portrait is long in preparation. Try again presently.", 504);
}

/** A motion he may learn: one from this account's repertoire. */
export interface MotionOption {
  id: string;
  name: string;
}

interface RawMotion {
  id?: string;
  motion_id?: string;
  name?: string;
  title?: string;
  status?: string;
  type?: string;
  capabilities?: string[];
}

/** The repertoire of motions ready to be rendered against his portrait. */
export async function fetchMotionOptions(): Promise<MotionOption[]> {
  const data = await viggleFetch<{ data?: RawMotion[] } | RawMotion[]>("/motions");
  const items = Array.isArray(data) ? data : (data.data ?? []);
  // Only motions that can be rendered as film — a bare 3D (glb) motion cannot.
  return items
    .map((item) => ({ id: item.id ?? item.motion_id ?? "", name: item.name ?? item.title ?? "" }))
    .filter((option, index) => {
      if (option.id.length === 0 || option.name.length === 0) return false;
      const capabilities = items[index]?.capabilities ?? [];
      return capabilities.length === 0 || capabilities.some((capability) => /render/i.test(capability));
    });
}

/**
 * Teaches him one of Viggle's own templates — the ID is copied from the
 * viggle.ai gallery beside each template's title. The motion joins the
 * repertoire once the studio has studied it.
 */
export async function importMotionTemplate(templateId: string, name = ""): Promise<void> {
  await viggleFetch<RawMotion>("/motions/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template_id: templateId, name }),
  });
}

/**
 * Sends him to the studio: his portrait plus a motion become a full-body clip.
 * The render is tracked in the background — across reloads too, by way of the
 * clip's "rendering" entry kept in the settings.
 */
export async function startMotionRender(option: MotionOption, customVideoUrl?: string): Promise<void> {
  const characterId = await ensureViggleCharacter();
  const form = new FormData();
  form.append("character_id", characterId);
  form.append("background_mode", "original");
  if (customVideoUrl !== undefined) {
    form.append("motion_video_url", customVideoUrl);
  } else {
    form.append("motion_id", option.id);
  }
  const render = await viggleFetch<{ id: string }>("/renders", { method: "POST", body: form });

  const clip: MotionClip = {
    id: render.id,
    name: option.name,
    status: "rendering",
    videoUrl: "",
    createdAt: Date.now(),
  };
  updateSettings({ motionClips: [clip, ...getSettings().motionClips] });
  trackRender(render.id);
}

/** Follows one render to its end, filing the finished film in the library. */
function trackRender(renderId: string): void {
  if (trackedRenders.has(renderId)) return;
  trackedRenders.add(renderId);
  void (async () => {
    for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
      await sleep(POLL_MS);
      try {
        const video = await viggleFetch<{ status?: string; video_url?: string }>(`/videos/${renderId}`);
        if (video.status === "ready" && typeof video.video_url === "string" && video.video_url.length > 0) {
          patchClip(renderId, { status: "ready", videoUrl: video.video_url });
          trackedRenders.delete(renderId);
          return;
        }
        if (video.status === "failed" || video.status === "cancelled") {
          patchClip(renderId, { status: "failed" });
          trackedRenders.delete(renderId);
          return;
        }
      } catch (pollError) {
        console.warn("[adams] motion render poll stumbled; trying again", pollError);
      }
    }
    patchClip(renderId, { status: "failed" });
    trackedRenders.delete(renderId);
  })();
}

/** On waking, take up any renders this device left unfinished. */
export function resumePendingMotionRenders(): void {
  if (!isViggleEnabled()) return;
  getSettings()
    .motionClips.filter((clip) => clip.status === "rendering")
    .forEach((clip) => trackRender(clip.id));
}

function patchClip(id: string, patch: Partial<MotionClip>): void {
  updateSettings({
    motionClips: getSettings().motionClips.map((clip) => (clip.id === id ? { ...clip, ...patch } : clip)),
  });
}

/** Discards a clip — and takes it off the stage if it was standing there. */
export function removeMotionClip(id: string): void {
  const settings = getSettings();
  updateSettings({
    motionClips: settings.motionClips.filter((clip) => clip.id !== id),
    activeMotionClipId: settings.activeMotionClipId === id ? "" : settings.activeMotionClipId,
  });
}

/** Places a finished clip upon the stage. */
export function setActiveMotionClip(id: string): void {
  updateSettings({ activeMotionClipId: id });
}

/** Lets him wander between every ready clip while he listens. */
export function setMotionShuffle(enabled: boolean): void {
  updateSettings({ motionShuffle: enabled });
}
