// Build the Expressive (V4) John Adams avatar through D-ID's consent flow.
// Staged so each bash call stays short: node tmp/did_expressive.mjs <stage>
//
// Stages:
//   consent  - create consent challenge + kick off the consent /talks render
//   check    - print current state of everything (talks render, consent)
//   submit   - submit the rendered consent video for verification
//   avatar   - create the express avatar with source video + consent_id
//   agent    - create the ElevenLabs-backed v2 agent on the new avatar
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const env = readFileSync("web-speak-with-john-adams/.env", "utf8");
const DID_KEY = env.match(/VITE_DID_API_KEY=(.+)/)[1].trim();
const EL_KEY = env.match(/VITE_ELEVENLABS_API_KEY=(.+)/)[1].trim();
const ADAMS_VOICE_ID = "pqHfZKP75CvOlQylNhV4";
const EL_AGENT_ID = "agent_2901m1aeqpbxfmtvzs2jw9fqy4pv";
const DID_SECRET_ID = "QSLOvS6kzsKEIpx07fn-F";
const PORTRAIT_URL =
  "https://r2-pub.rork.com/projects/jik0ntwupcavtim1umit5/assets/ba4d35d3-ba93-45d3-b9e0-26d770a9947a.png";
const SOURCE_VIDEO_URL =
  "https://litter.catbox.moe/9runf8.mp4"; // stitched 72s training reel (tmpfiles 1h expiry)
const STATE_PATH = "tmp/did_expressive_state.json";
const base = "https://api.d-id.com";
const headers = { Authorization: `Basic ${DID_KEY}`, "Content-Type": "application/json" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const loadState = () => (existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, "utf8")) : {});
const saveState = (patch) => {
  const next = { ...loadState(), ...patch };
  writeFileSync(STATE_PATH, JSON.stringify(next, null, 2));
  console.log(JSON.stringify(next, null, 2));
};
async function api(label, method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`[${label}] HTTP ${res.status}: ${text.slice(0, 600)}`);
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, json, text };
}

const stage = process.argv[2] ?? "check";

if (stage === "talk") {
  // Re-render only the consent video with the existing consent challenge.
  const s = loadState();
  const spoken = s.consent_text.replace(/\[user name\]/g, "John Adams");
  const { json: talk } = await api("talks/create", "POST", "/talks", {
    source_url: PORTRAIT_URL,
    script: {
      type: "text",
      input: spoken,
      provider: {
        type: "elevenlabs",
        voice_id: ADAMS_VOICE_ID,
        voice_config: { stability: 0.55, similarity_boost: 0.75 },
      },
    },
  });
  saveState({ talk_id: talk?.id ?? null });
} else if (stage === "consent") {
  // 1) Consent challenge: returns the script with a dynamic passcode.
  const { json: consent } = await api("consents/create", "POST", "/consents", { language: "english" });
  if (!consent?.id) process.exit(1);
  // 2) Consent video: D-ID renders the Adams portrait speaking the script.
  const spoken = consent.text.replace(/\[user name\]/g, "John Adams");
  const { json: talk } = await api("talks/create", "POST", "/talks", {
    source_url: PORTRAIT_URL,
    script: {
      type: "text",
      input: spoken,
      provider: {
        type: "elevenlabs",
        voice_id: ADAMS_VOICE_ID,
        voice_config: { stability: 0.55, similarity_boost: 0.75 },
      },
    },
  });
  saveState({ consent_id: consent.id, consent_text: consent.text, talk_id: talk?.id ?? null, consent_status: "created", avatar_id: null, v2_agent_id: null, v2_client_key: null });
} else if (stage === "check") {
  const s = loadState();
  if (s.talk_id) {
    const { json } = await api("talks/get", "GET", `/talks/${s.talk_id}`);
    if (json?.status === "DONE" || json?.status === "done") {
      console.log("TALK_READY", json.result_url);
      saveState({ talk_status: "done", talk_url: json.result_url });
    } else {
      saveState({ talk_status: json?.status ?? "unknown" });
    }
  }
  if (s.consent_id && s.consent_submitted) {
    const { json } = await api("consents/get", "GET", `/consents/${s.consent_id}`);
    saveState({ consent_status: json?.status ?? "unknown", consent_detail: json });
  }
  if (s.avatar_id) {
    const { json } = await api("avatar/get", "GET", `/scenes/avatars/${s.avatar_id}`);
    if (json?.status === "DONE" || json?.status === "done") {
      console.log("AVATAR_READY", JSON.stringify(json));
      saveState({ avatar_status: "done", avatar: json });
    } else {
      saveState({ avatar_status: json?.status ?? "unknown" });
    }
  }
} else if (stage === "submit") {
  const s = loadState();
  await api("consents/submit", "POST", `/consents/${s.consent_id}`, {
    name: "John Adams",
    source_url: s.talk_url,
  });
  saveState({ consent_submitted: true, consent_status: "verifying" });
} else if (stage === "avatar") {
  const s = loadState();
  const { json } = await api("avatar/create", "POST", "/scenes/avatars", {
    name: "John Adams",
    source_url: SOURCE_VIDEO_URL,
    consent_id: s.consent_id,
    persist: true,
  });
  saveState({ avatar_id: json?.id ?? null, avatar_status: json?.status ?? "error" });
} else if (stage === "agent") {
  const s = loadState();
  const presenterId = s.avatar?.presenter_id ?? s.avatar?.id;
  const { json } = await api("v2agent/create", "POST", "/v2/agents/integrations/elevenlabs", {
    preview_name: "John Adams",
    preview_description: "John Adams, second President of the United States, speaks with visitors.",
    presenter: { type: "expressive", presenter_id: presenterId },
    external_agent: { type: "elevenlabs", agent_id: EL_AGENT_ID, secret_id: DID_SECRET_ID },
  });
  saveState({ v2_agent_id: json?.id ?? null, v2_client_key: json?.client_key ?? null, v2_agent: json });
} else if (stage === "agentcheck") {
  const s = loadState();
  const { json } = await api("v2agent/get", "GET", `/agents/${s.v2_agent_id}`);
  saveState({ v2_agent_status: json?.status ?? "unknown", v2_agent_latest: json });
} else {
  console.log(JSON.stringify(loadState(), null, 2));
}
