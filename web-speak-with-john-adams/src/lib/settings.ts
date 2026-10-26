/**
 * The app's built-in keys, set as environment variables when the site was
 * made (VITE_OPENAI_API_KEY, VITE_ELEVENLABS_API_KEY). There is no settings
 * panel: the house post serves every visitor, and a key is used only when it
 * was built in.
 */

export type VoiceProvider = "elevenlabs" | "openai";

export interface AdamsSettings {
  openaiKey: string;
  elevenlabsKey: string;
  ttsProvider: VoiceProvider;
}

const EMPTY_SETTINGS: AdamsSettings = {
  openaiKey: "",
  elevenlabsKey: "",
  ttsProvider: "elevenlabs",
};

/** The built-in snapshot — computed once, stable for the life of the page. */
const BUILT_IN: AdamsSettings = {
  ...EMPTY_SETTINGS,
  openaiKey: ((import.meta.env.VITE_OPENAI_API_KEY as string | undefined) ?? "").trim(),
  elevenlabsKey: ((import.meta.env.VITE_ELEVENLABS_API_KEY as string | undefined) ?? "").trim(),
};

/** Synchronous settings snapshot — safe to read inside request flows. */
export function getSettings(): AdamsSettings {
  return BUILT_IN;
}
