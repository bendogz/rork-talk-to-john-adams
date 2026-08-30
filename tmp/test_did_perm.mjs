// Verify the upgraded D-ID plan grants skip-consent for Express avatars.
// We POST with a deliberately invalid (image) source_url:
//  - PermissionError "skip consent"  -> plan still blocks custom avatars
//  - any other validation error       -> permission granted, just bad input
import { readFileSync } from "node:fs";

const env = readFileSync("web-speak-with-john-adams/.env", "utf8");
const DID_KEY = env.match(/VITE_DID_API_KEY=(.+)/)[1].trim();

const headers = {
  Authorization: `Basic ${DID_KEY}`,
  "Content-Type": "application/json",
};

const base = "https://api.d-id.com";

async function show(label, res) {
  const text = await res.text();
  console.log(`\n=== ${label} (HTTP ${res.status}) ===`);
  console.log(text.slice(0, 800));
}

// Account + credits snapshot
await show("credits", await fetch(`${base}/credits`, { headers }));

// Permission probe: image as source (invalid for express avatars)
await show(
  "probe POST /scenes/avatars (image source)",
  await fetch(`${base}/scenes/avatars`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      source_url:
        "https://r2-pub.rork.com/projects/jik0ntwupcavtim1umit5/assets/ba4d35d3-6e4f-4e70-9e2b-2b6c8f59947a.png",
    }),
  }),
);
