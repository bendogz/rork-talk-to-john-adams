/** One-shot: point the agent's presenter back at the Expressive agent avatar (keep voice). */
import { readFileSync } from "node:fs";

const ENV = readFileSync("web-speak-with-john-adams/.env", "utf8");
const didKey = ENV.match(/VITE_DID_API_KEY=(.+)/)?.[1]?.trim();
const elKey = ENV.match(/VITE_ELEVENLABS_API_KEY=(.+)/)?.[1]?.trim();
const AGENT = "v2_agt_qstKVH90";
const AVATAR_FACE =
  "https://scenes-avatars.d-id.com/google-oauth2%7C116081849206873258456/avt_rbqBKyCkk1VA-iXmtMUxY/image.png";

const res = await fetch(`https://api.d-id.com/agents/${AGENT}`, {
  method: "PATCH",
  headers: { Authorization: `Basic ${didKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    presenter: {
      type: "talk",
      source_url: AVATAR_FACE,
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
console.log(`PATCH HTTP ${res.status}`);
try {
  const json = JSON.parse(text);
  console.log(JSON.stringify({ presenter: json.presenter }, null, 2));
} catch {
  console.log(text.slice(0, 600));
}

// Re-read the config so we can see which idle_video the presenter now pairs with.
const get = await fetch(`https://api.d-id.com/agents/${AGENT}`, {
  headers: { Authorization: `Basic ${didKey}` },
});
const got = await get.json();
console.log("idle_video now:", got.presenter?.idle_video);
