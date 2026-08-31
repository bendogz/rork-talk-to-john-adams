/** One-shot: restore the agent's presenter to the painted portrait, voice unchanged. */
import { readFileSync } from "node:fs";

const ENV = readFileSync("web-speak-with-john-adams/.env", "utf8");
const didKey = ENV.match(/VITE_DID_API_KEY=(.+)/)?.[1]?.trim();
const elKey = ENV.match(/VITE_ELEVENLABS_API_KEY=(.+)/)?.[1]?.trim();
const AGENT = "v2_agt_qstKVH90";
const PORTRAIT =
  "https://r2-pub.rork.com/projects/jik0ntwupcavtim1umit5/assets/ba4d35d3-ba93-45d3-b9e0-26d770a9947a.png";

const res = await fetch(`https://api.d-id.com/agents/${AGENT}`, {
  method: "PATCH",
  headers: { Authorization: `Basic ${didKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    presenter: {
      type: "talk",
      source_url: PORTRAIT,
      voice: {
        type: "elevenlabs",
        voice_id: "pqHfZKP75CvOlQylNhV4",
        model_id: "eleven_flash_v2_5",
        elevenlabs_api_key: elKey,
      },
    },
  }),
});
const text = await res.text();
console.log(`HTTP ${res.status}`);
try {
  const json = JSON.parse(text);
  console.log(JSON.stringify({ presenter: json.presenter }, null, 2));
} catch {
  console.log(text.slice(0, 600));
}
