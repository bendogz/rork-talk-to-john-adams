/** D-ID Agent session for the V2 photo/talk presenter. */
import { createAgentManager, ConnectionState, StreamingState, type AgentManager } from "@d-id/client-sdk";

const env = import.meta.env as Record<string, string | undefined>;

export const DID_AGENT_ID =
  env.VITE_DID_AGENT_ID ||
  env.EXPO_PUBLIC_DID_AGENT_ID ||
  env.DID_AGENT_ID ||
  "v2_agt_lhKl4JJ3";

export const DID_CLIENT_KEY =
  env.VITE_DID_CLIENT_KEY ||
  env.EXPO_PUBLIC_DID_CLIENT_KEY ||
  env.DID_CLIENT_KEY ||
  env.VITE_D_ID_CLIENT_KEY ||
  env.EXPO_PUBLIC_D_ID_CLIENT_KEY ||
  env.D_ID_CLIENT_KEY ||
  "";

export const DID_IDLE_CLOSE_MS = 150000;
export function isAgentEnabled(): boolean {
  return DID_AGENT_ID.length > 0 && DID_CLIENT_KEY.length > 0;
}

export interface AdamsAgentCallbacks {
  onStream: (stream: MediaStream | null) => void;
  onAnswer?: (text: string) => void;
  onIdle?: () => void;
  onFail: (message: string) => void;
}

let sharedManager: AgentManager | null = null;
let sharedBoot: Promise<AgentManager> | null = null;
let sharedStream: MediaStream | null = null;
let sharedUsers = 0;
const subscribers = new Set<AdamsAgentCallbacks>();

export async function createAdamsAgentSession(callbacks: AdamsAgentCallbacks): Promise<AgentManager> {
  if (!isAgentEnabled()) throw new Error("D-ID Agent configuration is missing.");

  subscribers.add(callbacks);
  sharedUsers += 1;

  if (sharedManager) {
    if (sharedStream) callbacks.onStream(sharedStream);
    return sharedManager;
  }
  if (sharedBoot) return sharedBoot;

  sharedBoot = createAgentManager(DID_AGENT_ID, {
    auth: { type: "key", clientKey: DID_CLIENT_KEY },
    streamOptions: {
      compatibilityMode: "on",
      streamWarmup: true,
      outputResolution: 1080,
    },
    callbacks: {
      onSrcObjectReady: (stream) => {
        sharedStream = stream;
        for (const subscriber of subscribers) subscriber.onStream(stream);
      },
      onVideoStateChange: (state) => {
        if (state === StreamingState.Stop) for (const subscriber of subscribers) subscriber.onIdle?.();
      },
      onNewMessage: (messages, type) => {
        if (type !== "answer") return;
        const last = messages[messages.length - 1];
        if (last?.role === "assistant" && last.content) {
          for (const subscriber of subscribers) subscriber.onAnswer?.(last.content);
        }
      },
      onConnectionStateChange: (state) => {
        if (state === ConnectionState.Fail || state === ConnectionState.Closed) {
          sharedStream = null;
          for (const subscriber of subscribers) {
            subscriber.onStream(null);
            subscriber.onFail(`connection ${state}`);
          }
        }
      },
      onError: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        for (const subscriber of subscribers) subscriber.onFail(message);
      },
    },
  }).then(async (manager) => {
    await manager.connect();
    sharedManager = manager;
    sharedBoot = null;
    return manager;
  }).catch((error: unknown) => {
    sharedBoot = null;
    subscribers.delete(callbacks);
    sharedUsers = Math.max(0, sharedUsers - 1);
    throw error;
  });

  return sharedBoot;
}

export async function destroyAdamsAgentSession(manager: AgentManager): Promise<void> {
  sharedUsers = Math.max(0, sharedUsers - 1);
  if (sharedUsers > 0) return;

  const current = sharedManager;
  sharedManager = null;
  sharedStream = null;
  subscribers.clear();

  if (current) {
    try { await current.disconnect(); } catch (e) { console.warn("[adams] session cleanup failed", e); }
  } else if (manager) {
    try { await manager.disconnect(); } catch (e) { console.warn("[adams] session cleanup failed", e); }
  }
}

export async function publishAdamsMicrophone(_manager: AgentManager): Promise<MediaStream> {
  throw new Error("Native microphone publishing is not used by this V2 Agent.");
}

export async function unpublishAdamsMicrophone(_manager: AgentManager, stream: MediaStream | null): Promise<void> {
  stream?.getTracks().forEach((track) => track.stop());
}

export async function chatWithAdamsAgent(manager: AgentManager, question: string): Promise<string> {
  const response = await manager.chat(question);
  return response?.result ?? "";
}

/**
 * Speak through D-ID itself so the WebRTC audio and talking-face video are one
 * synchronized stream. Do not play a separate ElevenLabs HTMLAudioElement:
 * that makes the face appear muted or looped while another voice talks.
 * The voice configured on the D-ID Studio Agent is therefore the only voice.
 */
export async function speakOnAdamsAgent(manager: AgentManager, text: string): Promise<void> {
  await manager.speak({
    type: "text",
    input: text,
    should_queue_speaks: false,
  });
}

export function stopAdamsSpeech(): void {
  // V2 Agents do not expose interrupt(); stopping the local audio element is no
  // longer necessary because D-ID owns the synchronized audio/video stream.
}

export function estimateSpeechSeconds(text: string): number {
  return Math.max(0.9, text.split(/\s+/).filter(Boolean).length / 3.35);
}

export function agentSleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
