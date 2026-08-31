/** D-ID V4 Expressive Agent session. V4 uses LiveKit/fluent streaming automatically. */
import { createAgentManager, ConnectionState, StreamingState, type AgentManager } from "@d-id/client-sdk";
import { ADAMS_VOICE_ID } from "@/lib/adams";

export const DID_AGENT_ID = "v2_agt_qstKVH90";
export const DID_CLIENT_KEY = "ck_I_uBZ-OlQtgXzHKLqaojj";
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
  try { await manager.connect(); }
  catch (error) { try { await manager.disconnect(); } catch {} throw error; }
  return manager;
}

export async function chatWithAdamsAgent(manager: AgentManager, question: string): Promise<string> {
  const response = await manager.chat(question);
  return response?.result ?? "";
}

/** V4 Expressive speech: preserve the established Adams voice while varying delivery by context. */
export async function speakOnAdamsAgent(manager: AgentManager, text: string): Promise<void> {
  await manager.speak({
    type: "text",
    input: text,
    provider: { type: "elevenlabs", voice_id: ADAMS_VOICE_ID, voice_config: { stability: 0.55, similarity_boost: 0.75 } },
    sentiment: chooseAdamsSentiment(text),
    should_queue_speaks: true,
  });
}

function chooseAdamsSentiment(text: string): string {
  const t = text.toLowerCase();
  if (/\b(outrage|outrageous|tyranny|injustice|absurd|foolish|shame|corrupt)\b/.test(t)) return "frustrated";
  if (/\b(ha!|wonderful|delighted|splendid|excellent|marvelous|joy)\b/.test(t)) return "excited";
  if (/\b(abigail|friend|dear|glad|pleasure|happy to)\b/.test(t)) return "friendly";
  if (/\b(sorry|sorrow|suffer|grief|loss|difficult|pain)\b/.test(t)) return "empathetic";
  return "professional";
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
