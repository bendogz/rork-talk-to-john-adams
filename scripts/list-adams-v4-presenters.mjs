#!/usr/bin/env node

/** List the Expressive/V4 presenters visible to your D-ID account. */
const key = process.env.DID_API_KEY;
if (!key) throw new Error("Missing DID_API_KEY.");

const res = await fetch("https://api.d-id.com/expressives/avatars?limit=200", {
  headers: { Authorization: `Basic ${key}` },
});
const text = await res.text();
let body = {};
try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${JSON.stringify(body)}`);

const avatars = body.avatars || body.items || body.data || [];
console.log("Expressive/V4 presenters available to this D-ID account:\n");
for (const avatar of avatars) {
  console.log(`${avatar.id || avatar.presenter_id || "(no id)"} — ${avatar.name || avatar.display_name || "unnamed"}`);
  if (Array.isArray(avatar.sentiments)) {
    console.log(`  sentiments: ${avatar.sentiments.map((s) => s.id || s.name).join(", ")}`);
  }
}
if (!avatars.length) console.log("No presenters were returned. Check that the account has V4/Expressive access.");
