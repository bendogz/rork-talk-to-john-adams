#!/usr/bin/env node

/**
 * One-time D-ID Knowledge provisioning for Speak with John Adams.
 *
 * Usage:
 *   DID_API_KEY=... node scripts/provision-adams-did-knowledge.mjs
 *
 * Keep DID_API_KEY out of the repository. This script uses it only for the
 * D-ID API calls that create the Knowledge base, upload documents, and attach
 * the Knowledge ID to the Agent.
 */

const API = "https://api.d-id.com";
const AGENT_ID = "v2_agt_qstKVH90";
const RAW_ROOT = "https://raw.githubusercontent.com/bendogz/rork-talk-to-john-adams/main/web-speak-with-john-adams/src/lib";
const KNOWLEDGE_NAME = "John Adams — Source-Grounded Historical Memory";

// D-ID currently limits a Knowledge base to five documents, so these five
// packs divide Adams's life into retrieval-friendly eras.
const sources = [
  ["01 — Early Life, Education, Law, Boston Massacre", "adams-memory-01-early-life-law.txt"],
  ["02 — Revolution, Independence, Constitution", "adams-memory-02-revolution-constitution.txt"],
  ["03 — Diplomacy, Europe, Peace, Constitutional Writings", "adams-memory-03-diplomacy.txt"],
  ["04 — Vice Presidency, Presidency, War and Peace", "adams-memory-04-presidency.txt"],
  ["05 — Abigail, Family, Retirement, Jefferson, Last Years", "adams-memory-05-abigail-retirement.txt"],
].map(([title, file]) => ({ title, type: "txt", url: `${RAW_ROOT}/${file}` }));

const key = process.env.DID_API_KEY;
if (!key) {
  console.error("Missing DID_API_KEY. Set it in your shell; never commit it to GitHub.");
  process.exit(1);
}

const headers = {
  Authorization: `Basic ${key}`,
  "Content-Type": "application/json",
};

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
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
      description: "Five source-grounded memory packs for a first-person John Adams historical simulation, with primary-source collection links and life-period retrieval guidance.",
    }),
  });

  const knowledgeId = knowledge.id;
  if (!knowledgeId) throw new Error("D-ID did not return a knowledge id.");
  console.log(`Created knowledge base: ${knowledgeId}`);

  for (const source of sources) {
    const doc = await request(`/knowledge/${knowledgeId}/documents`, {
      method: "POST",
      body: JSON.stringify({ title: source.title, documentType: source.type, source_url: source.url }),
    });
    console.log(`Added: ${doc.id || source.title}`);
  }

  let status = "processing";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const current = await request(`/knowledge/${knowledgeId}`);
    status = current.status || "processing";
    console.log(`Knowledge status: ${status}`);
    if (status === "done") break;
    if (["failed", "error"].includes(status)) throw new Error(`Knowledge processing failed with status=${status}`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  if (status !== "done") throw new Error("Knowledge base did not reach status=done within the polling window.");

  const agent = await request(`/agents/${AGENT_ID}`, {
    method: "PATCH",
    body: JSON.stringify({ knowledge: { id: knowledgeId }, llm: { template: "rag-ungrounded" } }),
  });

  console.log(`Agent updated: ${agent.id || AGENT_ID}`);
  console.log(`Knowledge ID: ${knowledgeId}`);
  console.log("D-ID Knowledge is ready for retrieval by the agent.");
}

main().catch((error) => {
  console.error("D-ID provisioning failed:", error.message);
  process.exit(1);
});
