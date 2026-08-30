import { readFileSync } from "node:fs";

const app = "web-speak-with-john-adams";

function extractTemplate(source, exportName) {
  const marker = `export const ${exportName}`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`${exportName} not found`);
  const tickStart = source.indexOf("`", start);
  const tickEnd = source.indexOf("`;", tickStart);
  return source.slice(tickStart + 1, tickEnd);
}

const knowledgeSrc = readFileSync(`${app}/src/lib/adams-knowledge.ts`, "utf8");
const adamsSrc = readFileSync(`${app}/src/lib/adams.ts`, "utf8");

const knowledge = extractTemplate(knowledgeSrc, "ADAMS_KNOWLEDGE");
const systemPrompt = extractTemplate(adamsSrc, "ADAMS_SYSTEM_PROMPT").replace(
  "${ADAMS_KNOWLEDGE}",
  knowledge,
);
const greeting = extractTemplate(adamsSrc, "ADAMS_GREETING_SPEECH");

const payload = {
  name: "John Adams",
  conversation_config: {
    agent: {
      first_message: greeting,
      language: "en",
      prompt: { prompt: systemPrompt },
    },
    tts: {
      voice_id: "pqHfZKP75CvOlQylNhV4",
      model_id: "eleven_turbo_v2",
      stability: 0.55,
      similarity_boost: 0.75,
      style: 0.25,
      use_speaker_boost: true,
    },
  },
};

const key = process.env.EL_KEY;
if (!key) throw new Error("EL_KEY missing");

const res = await fetch("https://api.elevenlabs.io/v1/convai/agents/create", {
  method: "POST",
  headers: { "xi-api-key": key, "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
const body = await res.json();
console.log(res.status, JSON.stringify(body).slice(0, 600));
