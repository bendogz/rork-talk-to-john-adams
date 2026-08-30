import { ADAMS_SYSTEM_PROMPT, type ChatTurn } from "@/lib/adams";
import { getSettings } from "@/lib/settings";
import { sanitizeReply } from "@/lib/toolkit";

const OPENAI_URL = "https://api.openai.com/v1";
const CHAT_MODEL = "gpt-4o-mini";
const TTS_MODEL = "gpt-4o-mini-tts";
const STT_MODEL = "whisper-1";
const MAX_REPLY_TOKENS = 1200;
const CONTINUE_PROMPT =
  "Continue precisely where you left off, completing the unfinished thought. Do not repeat any words you have already spoken.";

const TTS_INSTRUCTIONS =
  "Speak as John Adams: an 18th-century American statesman. Formal, measured, resolute, " +
  "with crisp diction and moral conviction. Never rushed, never casual.";

/** Errors from the visitor's own OpenAI key, phrased in plain, calm language. */
export class OpenAIError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "OpenAIError";
    this.status = status;
  }
}

function friendlyMessage(status: number): string {
  if (status === 401) return "The key you entrusted is refused at the door. Check it in the settings.";
  if (status === 429) return "The account is taxed beyond its allowance. Wait a moment, or check your OpenAI plan.";
  if (status >= 500) return "The line to the new offices is down. Try once more in a moment.";
  return "Your request could not be delivered. Try once more.";
}

async function parseError(response: Response, signal?: AbortSignal): Promise<OpenAIError> {
  if (signal?.aborted) return new OpenAIError("Interrupted.", response.status);
  try {
    const data = (await response.json()) as { error?: { message?: string } };
    console.error("[adams] OpenAI request failed", response.status, data.error?.message ?? "");
  } catch {
    console.error("[adams] OpenAI request failed", response.status);
  }
  return new OpenAIError(friendlyMessage(response.status), response.status);
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
}

/**
 * Asks Adams' mind on the visitor's own OpenAI key and returns his reply.
 * `history` holds the earlier turns of this conversation, oldest first. If the
 * model is stopped mid-thought by the token limit, it is asked to continue
 * until the thought is complete — no sentence is ever cut off.
 */
export async function askAdamsWithOpenAI(
  question: string,
  history: ChatTurn[],
  signal?: AbortSignal,
): Promise<string> {
  const { openaiKey } = getSettings();
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

    const response = await fetch(`${OPENAI_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages,
        temperature: 0.85,
        max_tokens: MAX_REPLY_TOKENS,
      }),
    });

    if (!response.ok) throw await parseError(response, signal);

    const data = (await response.json()) as ChatCompletionResponse;
    const part = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (part.length === 0) break;
    reply = reply.length > 0 ? `${reply} ${part}` : part;
    if (data.choices?.[0]?.finish_reason !== "length") break;
  }

  if (reply.length === 0) throw new OpenAIError("Mr. Adams fell silent. Ask him again.", 502);

  return sanitizeReply(reply);
}

/** Speaks Adams' words with the visitor's OpenAI key and returns a playable object URL. */
export async function speakAsAdamsWithOpenAI(text: string, signal?: AbortSignal): Promise<string> {
  const { openaiKey } = getSettings();

  const response = await fetch(`${OPENAI_URL}/audio/speech`, {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model: TTS_MODEL,
      voice: "onyx",
      input: text,
      instructions: TTS_INSTRUCTIONS,
      response_format: "mp3",
    }),
  });

  if (!response.ok) throw await parseError(response, signal);

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

/** Transcribes a recorded question with the visitor's OpenAI key. */
export async function transcribeWithOpenAI(audio: Blob, signal?: AbortSignal): Promise<string> {
  const { openaiKey } = getSettings();

  const form = new FormData();
  form.append("file", audio, "question.webm");
  form.append("model", STT_MODEL);

  const response = await fetch(`${OPENAI_URL}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}` },
    signal,
    body: form,
  });

  if (!response.ok) throw await parseError(response, signal);

  const data = (await response.json()) as { text?: string };
  const text = (data.text ?? "").trim();

  if (text.length === 0) throw new OpenAIError("No words were heard. Try speaking again.", 422);

  return text;
}
