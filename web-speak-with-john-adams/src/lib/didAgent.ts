/** D-ID Agent session for the V2 photo/talk presenter. */
import { createAgentManager, ConnectionState, StreamingState, type AgentManager } from "@d-id/client-sdk";

/** The exact V2 D-ID Agent selected in D-ID Studio. */
export const DID_AGENT_ID = import.meta.env.VITE_DID_AGENT_ID || "v2_agt_lhKl4JJ3";
/** Client key must be supplied through the deployment environment, never committed to source. */
export const DID_CLIENT_KEY = import.meta.env.VITE_DID_CLIENT_KEY || "";
export const DID_IDLE_CLOSE_MS = 150000;

export function isAgentEnabled(): boolean { return DID_AGENT_ID.length > 0 && DID_CLIENT_KEY.length > 0; }

export interface AdamsAgentCallbacks {
  onStream: (stream: MediaStream | null) => void;
  onAnswer?: (text: string) => void;
  onIdle?: () => void;
  onFail: (message: string) => void;
}

export async function createAdamsAgentSession(callbacks: AdamsAgentCallbacks): Promise<AgentManager> {
  const manager = await createAgentManager(DID_AGENT_ID, {
    auth: { type: "key", clientKey: DID_CLIENT_KEY },
    callbacks: {
      onSrcObjectReady: (stream) => callbacks.onStream(stream),
      onVideoStateChange: (state) => { if (state === StreamingState.Stop) callbacks.onIdle?.(); },
      onNewMessage: (messages, type) => {
        if (type !== "answer") return;
        const last = messages[messages.length - 1];
        if (last?.role === "assistant" && last.content) callbacks.onAnswer?.(last.content);
      },
      onConnectionStateChange: (state) => {
        if (state === ConnectionState.Fail || state === ConnectionState.Closed) {
          callbacks.onStream(null); callbacks.onFail(`connection ${state}`);
        }
      },
      onError: (error) => callbacks.onFail(error.message),
    },
  });
  await manager.connect();
  return manager;
}

/**
 * V2 does not use the Expressive V4 native microphone publishing API.
 * The app's speech-to-text microphone remains separate from the D-ID presenter.
 */
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

/** V2-compatible speech helper: use the voice configured on the D-ID Agent itself. */
export async function speakOnAdamsAgent(manager: AgentManager, text: string): Promise<void> {
  await manager.speak({
    type: "text",
    input: text,
    should_queue_speaks: true,
  });
}

export async function destroyAdamsAgentSession(manager: AgentManager): Promise<void> {
  try { await manager.disconnect(); } catch (e) { console.warn("[adams] session cleanup failed", e); }
}
export function estimateSpeechSeconds(text: string): number { return Math.max(1.2, text.split(/\s+/).filter(Boolean).length / 2.8); }
export function chunkAnswer(text: string): string[] {
  const max = 500; const sentences = text.match(/[^.!?\n]+[.!?]*["'”’)]*\s*|\S+$/g) ?? [text];
  const chunks: string[] = []; let current = "";
  for (const sentence of sentences) { if (current && current.length + sentence.length > max) { chunks.push(current.trim()); current = ""; } current += sentence; }
  if (current.trim()) chunks.push(current.trim()); return chunks;
}
export function agentSleep(ms: number): Promise<void> { return new Promise(resolve => window.setTimeout(resolve, ms)); }
