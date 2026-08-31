/** One-shot: print the agent's current presenter/voice/llm config. */
import { readFileSync } from "node:fs";

const ENV = readFileSync("web-speak-with-john-adams/.env", "utf8");
const didKey = ENV.match(/VITE_DID_API_KEY=(.+)/)?.[1]?.trim();
const AGENT = "v2_agt_qstKVH90";

const res = await fetch(`https://api.d-id.com/agents/${AGENT}`, {
  headers: { Authorization: `Basic ${didKey}` },
});
const text = await res.text();
console.log(`HTTP ${res.status}`);
try {
  const json = JSON.parse(text);
  console.log(JSON.stringify({ presenter: json.presenter, voice: json.voice, idle_video: json.idle_video, type: json.type, graph_type: json.graph_type }, null, 2));
} catch {
  console.log(text.slice(0, 800));
}
