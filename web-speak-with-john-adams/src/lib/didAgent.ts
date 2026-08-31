/**
 * D-ID agent session: the living portrait. The agent (created from the John
 * Adams portrait) streams continuously over WebRTC through the official
 * Client SDK — when he answers, his lips form his words in real time.
 *
 * The session is opened on demand and closed after a quiet spell, so no
 * studio minutes are spent while he merely listens. Any failure here falls
 * back to the plain voice pipeline.
 */

import {
  createAgentManager,
  ConnectionState,
  Providers,
  StreamingState,
  type AgentManager,
} from "@d-id/client-sdk";
import { ADAMS_VOICE_ID } from "@/lib/adams";

/** The John Adams agent in D-ID (presenter: his standing portrait). */
export const DID_AGENT_ID = "v2_agt_qstKVH90";
/** The agent's client key — safe for the browser, scoped to this agent. */
export const DID_CLIENT_KEY = "ck_I_uBZ-OlQtgXzHKLqaojj";

/** How long a quiet stream is kept open between answers, in milliseconds. */
export const DID_IDLE_CLOSE_MS = 150000;

export function isAgentEnabled(): boolean {
  return DID_AGENT_ID.length > 0 && DID_CLIENT_KEY.length > 0;
}

export interface AdamsAgentCallbacks {
  /** The WebRTC video feed, ready for the stage — null when it ends. */
  onStream: (stream: MediaStream | null) => void;
  /** The agent's reply, as its spoken message lands. */
  onAnswer?: (text: string) => void;
  /** His stream went quiet — the rendered speech has finished. */
  onIdle?: () => void;
  /** The connection could not be kept. */
  onFail: (message: string) => void;
}

/**
 * Opens the living portrait: agent stream negotiated, video feed arriving.
 * Resolves once the connection is up; the stream callback fires as frames land.
 */
export async function createAdamsAgentSession(callbacks: AdamsAgentCallbacks): Promise<AgentManager> {
  const manager = await createAgentManager(DID_AGENT_ID, {
    auth: { type: "key", clientKey: DID_CLIENT_KEY },
    streamOptions: { streamWarmup: true, compatibilityMode: "auto" },
    callbacks: {
      onSrcObjectReady: (stream) => {
        callbacks.onStream(stream);
      },
      onVideoStateChange: (state) => {
        if (state === StreamingState.Stop) {
          // Speech done — but the connection lives on, idling on D-ID's rendered
          // idle video. Dropping the feed here would snap the stage back to the
          // painted portrait after every answer.
          callbacks.onIdle?.();
        }
      },
      onNewMessage: (messages, type) => {
        if (type !== "answer") return;
        const last = messages[messages.length - 1];
        if (last?.role === "assistant" && last.content) callbacks.onAnswer?.(last.content);
      },
      onConnectionStateChange: (state) => {
        if (state === ConnectionState.Fail || state === ConnectionState.Closed) {
          // A dead connection must hand the stage back to the portrait.
          callbacks.onStream(null);
          callbacks.onFail(`connection ${state}`);
        }
      },
      onError: (error) => {
        console.warn("[adams] living portrait stumbled", error.message);
        callbacks.onFail(error.message);
      },
    },
  });

  try {
    await manager.connect();
  } catch (connectError) {
    // A failed connect still reserved a session on D-ID's side. Without this
    // teardown the next attempt meets "Max user sessions reached" and every
    // answer after it falls back to the slow house pipeline.
    try {
      await manager.disconnect();
    } catch {
      // The session was already gone.
    }
    throw connectError;
  }
  return manager;
}

/**
 * Puts a visitor's question to the agent. The agent itself listens, thinks,
 * and speaks — the reply comes back as text while his voice plays through the
 * living portrait. Returns the reply text (empty when the chat yields none).
 */
export async function chatWithAdamsAgent(manager: AgentManager, question: string): Promise<string> {
  const response = await manager.chat(question);
  return response?.result ?? "";
}

/**
 * Has him speak one piece of text on the stream. His voice is always the
 * pinned ElevenLabs one, so it can never drift from the portrait's voice.
 */
export async function speakOnAdamsAgent(manager: AgentManager, text: string): Promise<void> {
  await manager.speak({
    type: "text",
    input: text,
    provider: {
      type: Providers.Elevenlabs,
      voice_id: ADAMS_VOICE_ID,
      voice_config: { stability: 0.55, similarity_boost: 0.75 },
    },
  });
}

/** Ends the stream so no studio minutes are spent while he merely listens. */
export async function destroyAdamsAgentSession(manager: AgentManager): Promise<void> {
  try {
    await manager.disconnect();
  } catch (destroyError) {
    console.warn("[adams] living portrait could not be laid to rest", destroyError);
  }
}

/** Rough speaking duration, so captions keep pace with normal talking speed. */
export function estimateSpeechSeconds(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1.2, words / 2.8);
}

/** Splits an answer into sentence-safe pieces the studio can stitch. */
export function chunkAnswer(text: string): string[] {
  const MAX_CHUNK_CHARS = 500;
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

export function agentSleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
