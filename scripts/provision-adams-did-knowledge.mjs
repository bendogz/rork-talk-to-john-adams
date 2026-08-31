#!/usr/bin/env node

/**
 * One-time D-ID Knowledge provisioning for Speak with John Adams.
 *
 * Run with a D-ID API key that has permission to manage Knowledge and Agents:
 *   DID_API_KEY=... node scripts/provision-adams-did-knowledge.mjs
 *
 * The API key is intentionally read from the environment and is never written
 * into the application bundle or repository.
 */

const API = "https://api.d-id.com";
const AGENT_ID = "v2_agt_qstKVH90";
const RAW_ROOT = "https://raw.githubusercontent.com/bendogz/rork-talk-to-john-adams/main/web-speak-with-john-adams/src/lib";
const KNOWLEDGE_NAME = "John Adams — Primary Source Memory";

const sources = [
  {
    title: "John Adams Primary Source Memory Index",
    type: "txt",
    url: `${RAW_ROOT}/adams-rag-source.txt`,
  },
];

const key = process.env.DID_API_KEY;
if (!key) {
  console.error("Missing DID_API_KEY. Set it in your terminal; do not put it in the repo.");
  process.exit(1);
}

const headers = {
  Authorization: `Basic ${key}`,
  "Content-Type": "application/json",
};

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  const knowledge = await request("/knowledge", {
    method: "POST",
    body: JSON.stringify({
      name: KNOWLEDGE_NAME,
      description: "Primary-source memory library for the Speak with John Adams historical simulation.",
    }),
  });
  const knowledgeId = knowledge.id;
  if (!knowledgeId) throw new Error("D-ID did not return a knowledge id.");
  console.log(`Created knowledge base: ${knowledgeId}`);

  for (const source of sources) {
    const doc = await request(`/knowledge/${knowledgeId}/documents`, {
      method: "POST",
      body: JSON.stringify({
        title: source.title,
        documentType: source.type,
        source_url: source.url,
      }),
    });
    console.log(`Added document: ${doc.id || source.title}`);
  }

  const agent = await request(`/agents/${AGENT_ID}`, {
    method: "PATCH",
    body: JSON.stringify({
      knowledge: { id: knowledgeId },
      llm: { template: "rag-ungrounded" },
    }),
  });

  console.log(`Agent updated: ${agent.id || AGENT_ID}`);
  console.log(`Knowledge ID: ${knowledgeId}`);
  console.log("Wait until the knowledge base reports status=done before testing the agent.");
}

main().catch((error) => {
  console.error("D-ID provisioning failed:", error.message);
  process.exit(1);
});
