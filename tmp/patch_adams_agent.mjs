/**
 * One-shot: rewrites the John Adams agent's brain (instructions), greeting,
 * voice (ElevenLabs, pinned), and allowed domains via PATCH /agents/{id}.
 * Runs each PATCH stepwise so one rejection doesn't block the rest.
 */
import { readFileSync } from "node:fs";

const ENV = readFileSync("web-speak-with-john-adams/.env", "utf8");
const didKey = ENV.match(/VITE_DID_API_KEY=(.+)/)?.[1]?.trim();
const elKey = ENV.match(/VITE_ELEVENLABS_API_KEY=(.+)/)?.[1]?.trim();
const AGENT = "v2_agt_qstKVH90";
const AUTH = { Authorization: `Basic ${didKey}`, "Content-Type": "application/json" };

const adams = readFileSync("web-speak-with-john-adams/src/lib/adams.ts", "utf8");
const knowledge = readFileSync("web-speak-with-john-adams/src/lib/adams-knowledge.ts", "utf8");

function literal(source, name) {
  const decl = source.indexOf(`${name} = \``);
  if (decl < 0) throw new Error(`${name} not found`);
  const start = decl + `${name} = \``.length;
  const end = source.indexOf("\`;", start);
  if (end < 0) throw new Error(`${name} unterminated`);
  return source.slice(start, end);
}

const knowledgeText = literal(knowledge, "ADAMS_KNOWLEDGE").trim();
const systemPrompt = literal(adams, "ADAMS_SYSTEM_PROMPT").replace(
  "${ADAMS_KNOWLEDGE}",
  knowledgeText,
);

async function patch(label, body) {
  const res = await fetch(`https://api.d-id.com/agents/${AGENT}`, {
    method: "PATCH",
    headers: AUTH,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`== ${label}: HTTP ${res.status}`);
  console.log(text.slice(0, 400));
}

await patch("brain+greeting", {
  llm: { provider: "openai", model: "gpt-4.1-mini", instructions: systemPrompt },
  greetings: [
    "Good day. John Adams, of Braintree, Massachusetts, at your service. Ask me of independence, of government, of liberty — I am listening.",
  ],
});

await patch("voice", {
  presenter: {
    type: "talk",
    voice: { type: "elevenlabs", voice_id: "pqHfZKP75CvOlQylNhV4", elevenlabs_api_key: elKey },
  },
});

await patch("domains", {
  allowed_domains: [
    "jik0ntwupcavtim1umit5-web-speak-with-john-adams.rork.live",
    "studio.d-id.com",
    "localhost",
  ],
});
