/**
 * Visitor-held settings. Keys may arrive two ways: built into the app's
 * foundations as environment variables (VITE_OPENAI_API_KEY,
 * VITE_ELEVENLABS_API_KEY), or entrusted per device through the Private
 * Offices, kept in this browser's localStorage alone. A key kept locally
 * overrides the built-in one.
 */

import { useSyncExternalStore } from "react";

export type VoiceProvider = "elevenlabs" | "openai";

export interface AdamsSettings {
  openaiKey: string;
  elevenlabsKey: string;
  /** Chosen from the account's own voices; empty falls back to his default. */
  elevenlabsVoiceId: string;
  ttsProvider: VoiceProvider;
}

const STORAGE_KEY = "speak-with-adams.settings.v1";

/** Keys set as environment variables — part of the app's foundations. */
const ENV_OPENAI_KEY: string = (import.meta.env.VITE_OPENAI_API_KEY ?? "").trim();
const ENV_ELEVENLABS_KEY: string = (import.meta.env.VITE_ELEVENLABS_API_KEY ?? "").trim();

export const hasBuiltInOpenAIKey: boolean = ENV_OPENAI_KEY.length > 0;
export const hasBuiltInElevenLabsKey: boolean = ENV_ELEVENLABS_KEY.length > 0;

const EMPTY_SETTINGS: AdamsSettings = {
  openaiKey: "",
  elevenlabsKey: "",
  elevenlabsVoiceId: "",
  ttsProvider: "elevenlabs",
};

/** What this device itself has entrusted — without the built-in keys. */
let raw: AdamsSettings = read();
/** Cached merged snapshot — a stable reference until the settings change. */
let mergedCache: AdamsSettings | null = null;
const listeners = new Set<() => void>();

function read(): AdamsSettings {
  if (typeof window === "undefined") return { ...EMPTY_SETTINGS };
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return { ...EMPTY_SETTINGS };
    const parsed = JSON.parse(stored) as Partial<AdamsSettings>;
    return {
      openaiKey: typeof parsed.openaiKey === "string" ? parsed.openaiKey : "",
      elevenlabsKey: typeof parsed.elevenlabsKey === "string" ? parsed.elevenlabsKey : "",
      elevenlabsVoiceId: typeof parsed.elevenlabsVoiceId === "string" ? parsed.elevenlabsVoiceId : "",
      ttsProvider: parsed.ttsProvider === "openai" ? "openai" : "elevenlabs",
    };
  } catch (error) {
    console.warn("[adams] settings could not be read; using defaults", error);
    return { ...EMPTY_SETTINGS };
  }
}

/**
 * Synchronous settings snapshot — safe to read inside request flows. Local
 * entries take precedence; built-in environment keys stand in when absent.
 * The returned object is cached: `useSyncExternalStore` requires a snapshot
 * that keeps the same reference between changes, or React re-renders without
 * end ("maximum update depth exceeded").
 */
export function getSettings(): AdamsSettings {
  if (mergedCache === null) {
    mergedCache = {
      ...raw,
      openaiKey: raw.openaiKey || ENV_OPENAI_KEY,
      elevenlabsKey: raw.elevenlabsKey || ENV_ELEVENLABS_KEY,
    };
  }
  return mergedCache;
}

/** Full replacement — writes every field, including empty keys. */
export function saveSettings(next: AdamsSettings): void {
  raw = {
    openaiKey: next.openaiKey.trim(),
    elevenlabsKey: next.elevenlabsKey.trim(),
    elevenlabsVoiceId: next.elevenlabsVoiceId.trim(),
    ttsProvider: next.ttsProvider,
  };
  persist();
}

/** Patches only the given fields, leaving the rest of this device's entries as they are. */
export function updateSettings(patch: Partial<AdamsSettings>): void {
  saveSettings({ ...raw, ...patch });
}

function persist(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
  } catch (error) {
    console.warn("[adams] settings could not be saved", error);
  }
  mergedCache = null;
  listeners.forEach((notify) => notify());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React binding so the settings panel re-renders when settings change. */
export function useAdamsSettings(): AdamsSettings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}
