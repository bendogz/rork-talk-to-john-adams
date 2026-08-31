#!/usr/bin/env node

/**
 * Upgrade the existing John Adams D-ID Agent to a real V4 Expressive presenter.
 *
 * This does NOT put a private D-ID API key in the repository.
 *
 * First list the Expressive presenters in your D-ID account:
 *   DID_API_KEY=... node scripts/list-adams-v4-presenters.mjs
 *
 * Then run:
 *   DID_API_KEY=... DID_V4_PRESENTER_ID=... node scripts/upgrade-adams-to-v4.mjs
 *
 * The presenter ID must be an Expressive/V4 presenter from your D-ID account.
 */

const API = "https://api.d-id.com";
const AGENT_ID = process.env.DID_AGENT_ID || "v2_agt_qstKVH90";
const apiKey = process.env.DID_API_KEY;
const presenterId = process.env.DID_V4_PRESENTER_ID;

if (!apiKey) throw new Error("Missing DID_API_KEY.");
if (!presenterId) throw new Error("Missing DID_V4_PRESENTER_ID. Run list-adams-v4-presenters.mjs first.");

const headers = {
  Authorization: `Basic ${apiKey}`,
  "Content-Type": "application/json",
};

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const bodyText = await res.text();
  let body = {};
  try { body = bodyText ? JSON.parse(bodyText) : {}; } catch { body = { raw: bodyText }; }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${JSON.stringify(body)}`);
  return body;
}

const patch = await request(`/agents/${AGENT_ID}`, {
  method: "PATCH",
  body: JSON.stringify({
    presenter: {
      type: "expressive",
      presenter_id: presenterId,
    },
  }),
});

console.log(`Updated ${AGENT_ID}.`);
console.log(JSON.stringify({
  id: patch.id,
  status: patch.status,
  presenter: patch.presenter,
}, null, 2));
console.log("Wait until the agent status is done before testing the stream.");
