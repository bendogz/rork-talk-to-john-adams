import { ADAMS_SYSTEM_PROMPT, ADAMS_VOICE_ID, type ChatTurn } from "@/lib/adams";

const TOOLKIT_URL: string = import.meta.env.EXPO_PUBLIC_TOOLKIT_URL ?? "https://toolkit.rork.com";
const TOOLKIT_KEY: string = import.meta.env.EXPO_PUBLIC_RORK_TOOLKIT_SECRET_KEY ?? "rork_web_delegated_auth";

const CHAT_MODEL = "google/gemini-3-flash";
const TRANSCRIPTION_MODEL = "xai/grok-stt";
const TTS_MODEL = "eleven_turbo_v2_5";
const MAX_REPLY_TOKENS = 1200;
const CONTINUE_PROMPT =
  "Continue precisely where you left off, completing the unfinished thought. Do not repeat any words you have already spoken.";

/** Errors surfaced to the visitor are always phrased in plain, calm language. */
export class ToolkitError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ToolkitError";
    this.status = status;
  }
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${TOOLKIT_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function friendlyMessage(status: number): string {
  if (status === 401 || status === 403) return "Mr. Adams cannot be reached just now — the connection was refused.";
  if (status === 429) return "Mr. Adams is much in demand. Pray wait a moment and ask again.";
  if (status >= 500) return "The line to Braintree is down. Try once more in a moment.";
  return "Something went awry in delivering your question. Try once more.";
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
}

/**
 * Sends the visitor's question, with prior context, and returns Adams' reply.
 * `history` holds the earlier turns of this conversation, oldest first. If the
 * model is stopped mid-thought by the token limit, it is asked to continue
 * until the thought is complete — no sentence is ever cut off.
 */
export async function askAdams(question: string, history: ChatTurn[], signal?: AbortSignal): Promise<string> {
  const baseMessages = [
    { role: "system" as const, content: ADAMS_SYSTEM_PROMPT },
    ...history.slice(-24),
    { role: "user" as const, content: question },
  ];

  let reply = "";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const messages =
      attempt === 0
        ? baseMessages
        : [
            ...baseMessages,
            { role: "assistant" as const, content: reply },
            { role: "user" as const, content: CONTINUE_PROMPT },
          ];

    const response = await fetch(`${TOOLKIT_URL}/v2/vercel/v1/chat/completions`, {
      method: "POST",
      headers: authHeaders(),
      signal,
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages,
        temperature: 0.85,
        max_tokens: MAX_REPLY_TOKENS,
      }),
    });

    if (!response.ok) {
      console.error("[adams] chat request failed", response.status);
      throw new ToolkitError(friendlyMessage(response.status), response.status);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const part = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (part.length === 0) break;
    reply = reply.length > 0 ? `${reply} ${part}` : part;
    if (data.choices?.[0]?.finish_reason !== "length") break;
  }

  if (reply.length === 0) {
    throw new ToolkitError("Mr. Adams fell silent. Ask him again.", 502);
  }

  return sanitizeReply(reply);
}

/** Strips markdown artefacts and any stray speaker label the model may emit. */
export function sanitizeReply(raw: string): string {
  return raw
    .replace(/\*\*/g, "")
    .replace(/[*_`#>]/g, "")
    .replace(/^\s*(John\s+)?Adams\s*:\s*/i, "")
    .replace(/\s+\n/g, "\n")
    .trim();
}

/** Converts Adams' words into spoken audio and returns a playable object URL. */
export async function speakAsAdams(text: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(`${TOOLKIT_URL}/v2/elevenlabs/v1/text-to-speech/${ADAMS_VOICE_ID}`, {
    method: "POST",
    headers: authHeaders(),
    signal,
    body: JSON.stringify({
      text,
      model_id: TTS_MODEL,
      output_format: "mp3_44100_128",
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.75,
        style: 0.35,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    console.error("[adams] speech request failed", response.status);
    throw new ToolkitError(friendlyMessage(response.status), response.status);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

interface TranscriptionResponse {
  text?: string;
  transcript?: string;
  results?: { text?: string }[];
}

/** Turns a recorded question into text so it can be put to Mr. Adams. */
export async function transcribeQuestion(
  audio: Blob,
  mediaTypeOverride?: string,
  signal?: AbortSignal,
): Promise<string> {
  const base64 = await blobToBase64(audio);
  const mediaType = mediaTypeOverride?.split(";")[0] || audio.type.split(";")[0] || "audio/webm";

  const response = await fetch(`${TOOLKIT_URL}/v2/vercel/v4/ai/transcription-model`, {
    method: "POST",
    headers: authHeaders({ "ai-model-id": TRANSCRIPTION_MODEL, "ai-gateway-protocol-version": "0.0.1" }),
    signal,
    body: JSON.stringify({ audio: base64, mediaType }),
  });

  if (!response.ok) {
    console.error("[adams] transcription request failed", response.status);
    throw new ToolkitError("Your words could not be made out. Try speaking again.", response.status);
  }

  const data = (await response.json()) as TranscriptionResponse;
  const text = (data.text ?? data.transcript ?? data.results?.[0]?.text ?? "").trim();

  if (text.length === 0) {
    throw new ToolkitError("No words were heard. Try speaking again.", 422);
  }

  return text;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the recording."));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}
