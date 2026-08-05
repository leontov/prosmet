import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const baseUrl = String(process.env.PROSMET_BASE_URL || "http://127.0.0.1:3200").replace(/\/+$/, "");
const localModel = String(process.env.PROSMET_LOCAL_LLM_MODEL || "qwen3.5:9b").trim();
const localBaseUrl = String(process.env.PROSMET_LOCAL_LLM_BASE_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
const activationPolicy = String(process.env.PROSMET_LOCAL_LLM_ACTIVATE || "auto").trim().toLowerCase();
const evidencePath = process.env.PROSMET_AGENT_POOL_EVIDENCE
  || `${process.env.HOME}/.prosmet-greenfield/agent-pool-evidence.json`;
const adminTokenFile = process.env.PROSMET_ADMIN_TOKEN_FILE
  || `${process.env.HOME}/.prosmet-greenfield/config/admin.token`;

function requiredText(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

async function loadAdminToken() {
  const inline = String(process.env.PROSMMET_ADMIN_TOKEN || process.env.PROSMET_ADMIN_TOKEN || "").trim();
  if (inline) return inline;
  return requiredText(await readFile(adminTokenFile, "utf8"), `admin token in ${adminTokenFile}`);
}

const adminToken = await loadAdminToken();

async function requestJson(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "x-prosmet-admin-token": adminToken,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers
    }
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const message = body?.error?.message || (typeof body === "string" ? body.slice(0, 500) : `HTTP ${response.status}`);
    const error = new Error(`${init.method || "GET"} ${path}: ${message}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function secret(name) {
  return String(process.env[name] || "").trim();
}

function optionalPreset({ id, env, name, baseUrl: providerBaseUrl, model, type = "openai-compatible" }) {
  const providerSecret = secret(env);
  if (!providerSecret) return null;
  return {
    id,
    required: false,
    secret: providerSecret,
    config: {
      name,
      type,
      enabled: true,
      model,
      baseUrl: providerBaseUrl,
      command: null,
      args: [],
      cwd: null,
      systemPrompt: null,
      timeoutMs: 180000
    }
  };
}

const presets = [
  {
    id: "local-ollama",
    required: true,
    secret: null,
    config: {
      name: `Local Ollama · ${localModel}`,
      type: "ollama",
      enabled: true,
      model: localModel,
      baseUrl: localBaseUrl,
      command: null,
      args: [],
      cwd: null,
      systemPrompt: null,
      timeoutMs: 300000
    }
  },
  optionalPreset({
    id: "qwen-free-tier",
    env: "PROSMET_QWEN_API_KEY",
    name: "Qwen Official · free tier",
    baseUrl: process.env.PROSMET_QWEN_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: process.env.PROSMET_QWEN_MODEL || "qwen-plus"
  }),
  optionalPreset({
    id: "groq-free-tier",
    env: "PROSMET_GROQ_API_KEY",
    name: "Groq Free · Qwen",
    baseUrl: "https://api.groq.com/openai/v1",
    model: process.env.PROSMET_GROQ_MODEL || "qwen/qwen3.6-27b"
  }),
  optionalPreset({
    id: "gemini-free-tier",
    env: "PROSMET_GEMINI_API_KEY",
    name: "Gemini Free · Flash",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: process.env.PROSMET_GEMINI_MODEL || "gemini-2.5-flash"
  }),
  optionalPreset({
    id: "openrouter-free-tier",
    env: "PROSMET_OPENROUTER_API_KEY",
    name: "OpenRouter Free Models",
    baseUrl: "https://openrouter.ai/api/v1",
    model: process.env.PROSMET_OPENROUTER_MODEL || "openrouter/free"
  })
].filter(Boolean);

function sameConnection(agent, preset) {
  return agent.name === preset.config.name
    || (
      agent.type === preset.config.type
      && String(agent.baseUrl || "").replace(/\/+$/, "") === String(preset.config.baseUrl || "").replace(/\/+$/, "")
      && agent.model === preset.config.model
    );
}

async function upsertPreset(preset, registry) {
  const existing = registry.agents.find((agent) => sameConnection(agent, preset));
  const payload = {
    ...preset.config,
    ...(preset.secret ? { secret: preset.secret } : existing ? {} : { secret: null })
  };
  const agent = existing
    ? await requestJson(`/api/agents/${encodeURIComponent(existing.id)}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    })
    : await requestJson("/api/agents", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  return agent;
}

async function testConnection(agent) {
  const startedAt = Date.now();
  try {
    const result = await requestJson(`/api/agents/${encodeURIComponent(agent.id)}/test`, { method: "POST" });
    return {
      ok: true,
      latencyMs: result.latencyMs ?? Date.now() - startedAt,
      message: String(result.message || "OK").slice(0, 240)
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message.slice(0, 500) : "Connection test failed"
    };
  }
}

async function activate(agentId) {
  return requestJson(`/api/agents/${encodeURIComponent(agentId)}/activate`, { method: "POST" });
}

const before = await requestJson("/api/agents");
const originalActive = before.agents.find((agent) => agent.id === before.activeAgentId) || null;
const records = [];
let registry = before;
let localAgent = null;

for (const preset of presets) {
  const agent = await upsertPreset(preset, registry);
  const test = await testConnection(agent);
  records.push({
    id: preset.id,
    required: preset.required,
    agent: {
      id: agent.id,
      name: agent.name,
      type: agent.type,
      model: agent.model,
      baseUrl: agent.baseUrl,
      active: agent.active
    },
    test
  });
  if (preset.id === "local-ollama") localAgent = agent;
  if (preset.required && !test.ok) {
    throw new Error(`Required local LLM failed its ProSmet adapter test: ${test.message}`);
  }
  registry = await requestJson("/api/agents");
}

if (!localAgent) throw new Error("Local Ollama agent was not created");

let originalActiveTest = null;
if (originalActive && originalActive.id !== localAgent.id) {
  originalActiveTest = await testConnection(originalActive);
}

const forceLocal = new Set(["1", "true", "yes", "always"]).has(activationPolicy);
const neverForceLocal = new Set(["0", "false", "no", "never"]).has(activationPolicy);
const noUsableActive = !originalActive || (originalActiveTest && !originalActiveTest.ok);
let activationReason = "preserved-existing-active-agent";

if (forceLocal || (!neverForceLocal && noUsableActive)) {
  await activate(localAgent.id);
  activationReason = forceLocal
    ? "forced-by-provisioning-policy"
    : originalActive
      ? "existing-active-agent-failed-health-check"
      : "no-active-agent-was-configured";
}

const after = await requestJson("/api/agents");
const system = await requestJson("/api/system");
const activeAfter = after.agents.find((agent) => agent.id === after.activeAgentId) || null;
const evidence = {
  ok: true,
  generatedAt: new Date().toISOString(),
  applicationBaseUrl: baseUrl,
  activationPolicy,
  activationReason,
  originalActive: originalActive ? {
    id: originalActive.id,
    name: originalActive.name,
    type: originalActive.type,
    model: originalActive.model,
    health: originalActiveTest
  } : null,
  activeAfter: activeAfter ? {
    id: activeAfter.id,
    name: activeAfter.name,
    type: activeAfter.type,
    model: activeAfter.model
  } : null,
  configuredProviders: records,
  skippedOfficialFreeTierProviders: [
    ["Qwen", "PROSMET_QWEN_API_KEY"],
    ["Groq", "PROSMET_GROQ_API_KEY"],
    ["Gemini", "PROSMET_GEMINI_API_KEY"],
    ["OpenRouter", "PROSMET_OPENROUTER_API_KEY"]
  ].filter(([, env]) => !secret(env)).map(([provider, env]) => ({ provider, reason: `${env} is not configured` })),
  system: {
    releaseSha: system.releaseSha,
    configuredAgents: system.configuredAgents,
    activeAgent: system.activeAgent ? {
      id: system.activeAgent.id,
      name: system.activeAgent.name,
      type: system.activeAgent.type,
      model: system.activeAgent.model
    } : null
  },
  security: {
    arbitrarySharedKeysAccepted: false,
    credentialsPersistedBy: "ProSmet encrypted server-side agent registry",
    localEndpointExposure: "loopback-only"
  }
};

await mkdir(dirname(evidencePath), { recursive: true, mode: 0o700 });
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(evidence, null, 2));
