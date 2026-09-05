/**
 * Direct client for the visitor's own ElevenLabs account. The API key lives in
 * this browser's localStorage alone and is sent nowhere but ElevenLabs.
 */

import { ADAMS_VOICE_ID } from "@/lib/adams";
import { getSettings } from "@/lib/settings";

const API_BASE = "https://api.elevenlabs.io/v1";
const TTS_MODEL = "eleven_multilingual_v2";
const OUTPUT_FORMAT = "mp3_44100_128";

/** Errors surfaced to the visitor are phrased in plain, calm language. */
export class ElevenLabsError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ElevenLabsError";
    this.status = status;
  }
}

function friendlyMessage(status: number): string {
  if (status === 401) return "The voice account refuses that key. Pray check it in your ElevenLabs offices and enter it anew.";
  if (status === 402) return "The voice account needs attention — its allowance has run dry. Visit elevenlabs.io to set it right.";
  if (status === 429) return "The voice account is much in demand this moment. Wait briefly and he will speak.";
  if (status === 422) return "The voice could not give utterance to those words. Try once more.";
  return "The voice could not be raised just now. Try once more.";
}

/** A voice held in the visitor's ElevenLabs account. */
export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
}

/** Lists every voice in the account — premade and privately cloned alike. */
export async function fetchElevenLabsVoices(apiKey: string, signal?: AbortSignal): Promise<ElevenLabsVoice[]> {
  const response = await fetch(`${API_BASE}/voices`, {
    headers: { "xi-api-key": apiKey },
    signal,
  });
  if (!response.ok) {
    console.error("[adams] ElevenLabs voice list failed", response.status);
    throw new ElevenLabsError(friendlyMessage(response.status), response.status);
  }
  const data = (await response.json()) as { voices?: ElevenLabsVoice[] };
  return data.voices ?? [];
}

/**
 * Converts Adams' words into spoken audio by the visitor's own ElevenLabs
 * account and returns a playable object URL.
 */
export async function speakWithElevenLabs(
  text: string,
  options: { voiceId?: string; signal?: AbortSignal } = {},
): Promise<string> {
  const settings = getSettings();
  const apiKey = settings.elevenlabsKey;
  if (apiKey.length === 0) {
    throw new ElevenLabsError(
      "No voice account is entrusted yet. Add your ElevenLabs key in the Private Offices.",
      401,
    );
  }
  const voiceId = options.voiceId || ADAMS_VOICE_ID;

  const response = await fetch(
    `${API_BASE}/text-to-speech/${voiceId}?output_format=${OUTPUT_FORMAT}&optimize_streaming_latency=2`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      signal: options.signal,
      body: JSON.stringify({
        text,
        model_id: TTS_MODEL,
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.75,
          style: 0.25,
          speed: 0.88,
          use_speaker_boost: true,
        },
      }),
    },
  );

  if (!response.ok) {
    console.error("[adams] ElevenLabs speech request failed", response.status);
    throw new ElevenLabsError(friendlyMessage(response.status), response.status);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
