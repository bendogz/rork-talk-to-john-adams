/**
 * D-ID Talks Streams: the painted portrait becomes a live, lip-synced talking
 * head. The stream is negotiated over WebRTC in the browser; his words are
 * spoken by your own ElevenLabs voice through D-ID's rendering. Any failure
 * here falls back to the plain voice pipeline.
 */

import { ADAMS_PORTRAIT_URL, ADAMS_VOICE_ID } from "@/lib/adams";
import { getSettings } from "@/lib/settings";

const API_BASE = "https://api.d-id.com";
const MAX_CHUNK_CHARS = 500;
const WORDS_PER_SECOND = 2.4;
const CONNECT_TIMEOUT_MS = 12000;

export class DidError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DidError";
    this.status = status;
  }
}

function friendlyMessage(status: number): string {
  if (status === 401) return "The portrait studio refuses its key. Pray check the D-ID account.";
  if (status === 402) return "The portrait studio's allowance has run dry. Visit d-id.com to set it right.";
  if (status === 429) return "The portrait studio is much in demand this moment. Wait briefly.";
  return "The living portrait could not be raised — he will speak in voice alone.";
}

/**
 * Builds the Basic-auth credential, accepting the key either as it appears in
 * D-ID's studio ("…@ak_…") or already base64-encoded.
 */
function didCredential(): string {
  const raw = (import.meta.env.VITE_DID_API_KEY ?? "").trim();
  if (raw.length === 0) return "";
  // A studio key contains characters no base64 payload would ("|", "@ak_");
  // D-ID authenticates it as a username with an empty password.
  if (raw.includes("|") || raw.includes("@ak_")) {
    return btoa(`${raw}:`);
  }
  return raw;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Basic ${didCredential()}`,
    "Content-Type": "application/json",
    accept: "application/json",
  };
}

/** True when a D-ID key is built into the app's foundations. */
export function isDidEnabled(): boolean {
  return (import.meta.env.VITE_DID_API_KEY ?? "").trim().length > 0;
}

/**
 * Registers the ElevenLabs key with D-ID's secret store, so the stream can
 * speak with your own account's voices. Quietly ignored when already present.
 */
async function ensureElevenLabsSecret(): Promise<void> {
  const apiKey = getSettings().elevenlabsKey;
  if (apiKey.length === 0) return;
  try {
    await fetch(`${API_BASE}/secrets`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ type: "api_key", provider: "elevenlabs", api_key: apiKey }),
    });
  } catch (secretError) {
    console.warn("[adams] ElevenLabs secret could not be registered with D-ID", secretError);
  }
}

/** A live talking-portrait session, with its WebRTC video feed. */
export interface DidSession {
  id: string;
  sessionId: string;
  stream: MediaStream;
  close: () => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Opens a stream: portrait in, WebRTC negotiated, video feed ready. */
export async function createDidSession(): Promise<DidSession> {
  await ensureElevenLabsSecret();

  const response = await fetch(`${API_BASE}/talks/streams`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ source_url: ADAMS_PORTRAIT_URL, stream_warmup: true }),
  });
  if (!response.ok) {
    console.error("[adams] D-ID stream creation failed", response.status);
    throw new DidError(friendlyMessage(response.status), response.status);
  }

  const data = (await response.json()) as {
    id: string;
    session_id: string;
    offer: { type: RTCSdpType; sdp: string };
    ice_servers: RTCIceServer[];
  };

  const pc = new RTCPeerConnection({ iceServers: data.ice_servers ?? [] });
  const streamPromise = new Promise<MediaStream>((resolve) => {
    pc.ontrack = (event) => resolve(event.streams[0] ?? new MediaStream([event.track]));
  });

  await pc.setRemoteDescription(data.offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  const sdpResponse = await fetch(`${API_BASE}/talks/streams/${data.id}/sdp`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ answer: { type: answer.type, sdp: answer.sdp }, session_id: data.session_id }),
  });
  if (!sdpResponse.ok) {
    pc.close();
    console.error("[adams] D-ID SDP exchange failed", sdpResponse.status);
    throw new DidError(friendlyMessage(sdpResponse.status), sdpResponse.status);
  }

  pc.onicecandidate = (event) => {
    if (!event.candidate) return;
    void fetch(`${API_BASE}/talks/streams/${data.id}/ice`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ candidate: event.candidate.toJSON(), session_id: data.session_id }),
    }).catch(() => undefined);
  };

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new DidError(friendlyMessage(504), 504)),
      CONNECT_TIMEOUT_MS,
    );
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        window.clearTimeout(timeout);
        resolve();
      }
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        window.clearTimeout(timeout);
        reject(new DidError(friendlyMessage(502), 502));
      }
    };
  });

  const stream = await streamPromise;
  return {
    id: data.id,
    sessionId: data.session_id,
    stream,
    close: () => pc.close(),
  };
}

/** Sends one piece of his answer to the stream — his lips form it live. */
export async function speakOnDidSession(session: DidSession, text: string): Promise<void> {
  const response = await fetch(`${API_BASE}/talks/streams/${session.id}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      script: {
        type: "text",
        input: text,
        provider: {
          type: "elevenlabs",
          voice_id: getSettings().elevenlabsVoiceId || ADAMS_VOICE_ID,
          // NB: D-ID reads `voice_config`, not `elevenlabs_voice_settings`.
          voice_config: {
            stability: 0.55,
            similarity_boost: 0.75,
            style: 0.25,
            use_speaker_boost: true,
          },
        },
      },
      config: { stitch: true },
      session_id: session.sessionId,
    }),
  });
  if (!response.ok) {
    console.error("[adams] D-ID speech failed", response.status);
    throw new DidError(friendlyMessage(response.status), response.status);
  }
}

/** Ends the stream so no studio minutes are spent while he merely listens. */
export async function destroyDidSession(session: DidSession): Promise<void> {
  try {
    session.close();
    await fetch(`${API_BASE}/talks/streams/${session.id}`, {
      method: "DELETE",
      headers: { Authorization: `Basic ${didCredential()}` },
      body: JSON.stringify({ session_id: session.sessionId }),
    });
  } catch (destroyError) {
    console.warn("[adams] D-ID stream could not be closed", destroyError);
  }
}

/** Rough speaking duration, so captions can follow the rendered voice. */
export function estimateSpeechSeconds(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1.2, words / WORDS_PER_SECOND);
}

/** Splits an answer into sentence-safe pieces the studio can stitch. */
export function chunkAnswer(text: string): string[] {
  const sentences = text.match(/[^.!?\n]+[.!?]*["'”’)]*\s*|\S+$/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current.length > 0 && current.length + sentence.length > MAX_CHUNK_CHARS) {
      chunks.push(current.trim());
      current = "";
    }
    current += sentence;
  }
  if (current.trim().length > 0) chunks.push(current.trim());
  return chunks;
}

export { sleep as didSleep };
