import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const agentKinds = ["openai-compatible", "ollama", "ag-ui", "a2a", "codex-app-server"];
const allowedKinds = new Set(agentKinds);
const configFile = process.env.PROSMET_AGENT_CONFIG_FILE || join(homedir(), ".prosmet-greenfield", "agents.json");

function encryptionKey() {
  const secret = process.env.PROSMET_AGENT_CONFIG_KEY;
  return secret ? createHash("sha256").update(secret).digest() : null;
}

function encryptSecret(value) {
  const key = encryptionKey();
  if (!key) throw new Error("PROSMET_AGENT_CONFIG_KEY is required before credentials can be stored");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

function decryptSecret(value) {
  if (!value) return "";
  const key = encryptionKey();
  if (!key) throw new Error("PROSMET_AGENT_CONFIG_KEY is required to decrypt stored credentials");
  const [version, ivValue, tagValue, encryptedValue] = String(value).split(":");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) throw new Error("Unsupported encrypted credential format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

function normalizeUrl(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  const url = new URL(value.trim());
  if (!new Set(["http:", "https:"]).has(url.protocol)) throw new Error(`${field} must use http or https`);
  return url.toString().replace(/\/$/, "");
}

function normalizeHeaders(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const headers = {};
  for (const [key, entry] of Object.entries(value)) {
    const name = key.trim();
    if (!name || /^(authorization|cookie|host|content-length)$/i.test(name)) continue;
    if (typeof entry === "string" && entry.length <= 4096) headers[name] = entry;
  }
  return headers;
}

function normalizedId(value) {
  if (typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,63}$/.test(value)) return value;
  return `agent-${randomUUID()}`;
}

export function normalizeAgent(input, existing = null, source = "stored") {
  if (!input || typeof input !== "object") throw new Error("Agent configuration must be an object");
  const kind = String(input.kind || existing?.kind || "");
  if (!allowedKinds.has(kind)) throw new Error(`Unsupported agent kind: ${kind}`);

  const id = normalizedId(input.id || existing?.id);
  const name = String(input.name || existing?.name || id).trim();
  if (!name) throw new Error("Agent name is required");

  const agent = {
    id,
    name,
    kind,
    enabled: input.enabled === undefined ? existing?.enabled !== false : Boolean(input.enabled),
    source,
    model: typeof input.model === "string" ? input.model.trim() : existing?.model || "",
    baseUrl: typeof input.baseUrl === "string" ? input.baseUrl.trim() : existing?.baseUrl || "",
    endpoint: typeof input.endpoint === "string" ? input.endpoint.trim() : existing?.endpoint || "",
    systemPrompt: typeof input.systemPrompt === "string" ? input.systemPrompt.trim() : existing?.systemPrompt || "",
    cwd: typeof input.cwd === "string" ? input.cwd.trim() : existing?.cwd || "",
    timeoutMs: Math.min(600_000, Math.max(5_000, Number(input.timeoutMs ?? existing?.timeoutMs ?? 120_000))),
    temperature: Math.min(2, Math.max(0, Number(input.temperature ?? existing?.temperature ?? 0.2))),
    supportsTools: input.supportsTools === undefined ? existing?.supportsTools !== false : Boolean(input.supportsTools),
    headers: normalizeHeaders(input.headers ?? existing?.headers),
    apiKeyEnv: typeof input.apiKeyEnv === "string" ? input.apiKeyEnv.trim() : existing?.apiKeyEnv || "",
    apiKeyCipher: existing?.apiKeyCipher || "",
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (input.clearApiKey) agent.apiKeyCipher = "";
  if (typeof input.apiKey === "string" && input.apiKey.length > 0) agent.apiKeyCipher = encryptSecret(input.apiKey);

  if (new Set(["openai-compatible", "ollama", "ag-ui", "a2a"]).has(kind)) {
    agent.baseUrl = normalizeUrl(agent.baseUrl, "baseUrl");
  }
  if (new Set(["openai-compatible", "ollama"]).has(kind) && !agent.model) {
    throw new Error(`model is required for ${kind}`);
  }
  if (kind === "codex-app-server") {
    agent.command = "codex";
    agent.baseUrl = "";
    agent.endpoint = "";
  }

  return agent;
}

function environmentAgents() {
  const agents = [];
  const add = (input) => {
    try { agents.push(normalizeAgent(input, null, "environment")); } catch (error) {
      console.error(`Ignoring invalid environment agent ${input?.id || "unknown"}:`, error instanceof Error ? error.message : error);
    }
  };

  if (process.env.PROSMET_AGENT_PROVIDERS_JSON) {
    try {
      const parsed = JSON.parse(process.env.PROSMET_AGENT_PROVIDERS_JSON);
      for (const item of Array.isArray(parsed) ? parsed : []) add(item);
    } catch (error) {
      console.error("PROSMET_AGENT_PROVIDERS_JSON is invalid:", error instanceof Error ? error.message : error);
    }
  }

  if (process.env.PROSMET_OPENAI_COMPATIBLE_BASE_URL && process.env.PROSMET_OPENAI_COMPATIBLE_MODEL) {
    add({
      id: "openai-compatible",
      name: process.env.PROSMET_OPENAI_COMPATIBLE_NAME || "OpenAI-compatible",
      kind: "openai-compatible",
      baseUrl: process.env.PROSMET_OPENAI_COMPATIBLE_BASE_URL,
      model: process.env.PROSMET_OPENAI_COMPATIBLE_MODEL,
      apiKeyEnv: process.env.PROSMET_OPENAI_COMPATIBLE_KEY_ENV || "OPENAI_API_KEY",
      systemPrompt: process.env.PROSMET_OPENAI_COMPATIBLE_SYSTEM_PROMPT || ""
    });
  }

  if ((process.env.PROSMET_OLLAMA_BASE_URL || process.env.OLLAMA_HOST) && process.env.PROSMET_OLLAMA_MODEL) {
    add({
      id: "ollama",
      name: process.env.PROSMET_OLLAMA_NAME || "Ollama",
      kind: "ollama",
      baseUrl: process.env.PROSMET_OLLAMA_BASE_URL || process.env.OLLAMA_HOST,
      model: process.env.PROSMET_OLLAMA_MODEL,
      supportsTools: process.env.PROSMET_OLLAMA_TOOLS !== "0"
    });
  }

  if (/^(1|true|yes)$/i.test(process.env.PROSMET_CODEX_ENABLED || "")) {
    add({
      id: "codex",
      name: process.env.PROSMET_CODEX_NAME || "Codex App Server",
      kind: "codex-app-server",
      model: process.env.PROSMET_CODEX_MODEL || "",
      cwd: process.env.PROSMET_CODEX_CWD || process.cwd(),
      timeoutMs: Number(process.env.PROSMET_CODEX_TIMEOUT_MS || 180_000)
    });
  }

  if (process.env.PROSMET_AGUI_URL) {
    add({
      id: "ag-ui",
      name: process.env.PROSMET_AGUI_NAME || "AG-UI agent",
      kind: "ag-ui",
      baseUrl: process.env.PROSMET_AGUI_URL,
      endpoint: process.env.PROSMET_AGUI_ENDPOINT || "",
      apiKeyEnv: process.env.PROSMET_AGUI_KEY_ENV || ""
    });
  }

  if (process.env.PROSMET_A2A_URL) {
    add({
      id: "a2a",
      name: process.env.PROSMET_A2A_NAME || "A2A agent",
      kind: "a2a",
      baseUrl: process.env.PROSMET_A2A_URL,
      endpoint: process.env.PROSMET_A2A_ENDPOINT || "",
      apiKeyEnv: process.env.PROSMET_A2A_KEY_ENV || ""
    });
  }

  return agents;
}

async function readStoredConfig() {
  try {
    const raw = JSON.parse(await readFile(configFile, "utf8"));
    const agents = [];
    for (const item of Array.isArray(raw.agents) ? raw.agents : []) {
      agents.push(normalizeAgent(item, item, "stored"));
    }
    return {
      version: 1,
      defaultAgentId: typeof raw.defaultAgentId === "string" ? raw.defaultAgentId : "",
      agents
    };
  } catch (error) {
    if (error?.code === "ENOENT") return { version: 1, defaultAgentId: "", agents: [] };
    throw error;
  }
}

async function writeStoredConfig(config) {
  await mkdir(dirname(configFile), { recursive: true, mode: 0o700 });
  const temporary = `${configFile}.${process.pid}.${Date.now()}.tmp`;
  const serialized = `${JSON.stringify({ version: 1, defaultAgentId: config.defaultAgentId || "", agents: config.agents }, null, 2)}\n`;
  await writeFile(temporary, serialized, { mode: 0o600 });
  await rename(temporary, configFile);
}

export async function loadAgentConfig() {
  const stored = await readStoredConfig();
  const merged = new Map();
  for (const agent of environmentAgents()) merged.set(agent.id, agent);
  for (const agent of stored.agents) merged.set(agent.id, agent);
  const agents = [...merged.values()];
  const requestedDefault = process.env.PROSMET_DEFAULT_AGENT_ID || stored.defaultAgentId;
  const defaultAgentId = agents.some((agent) => agent.id === requestedDefault && agent.enabled)
    ? requestedDefault
    : agents.find((agent) => agent.enabled)?.id || "";
  return { version: 1, defaultAgentId, agents };
}

export function publicAgent(agent) {
  return {
    id: agent.id,
    name: agent.name,
    kind: agent.kind,
    enabled: agent.enabled,
    source: agent.source,
    model: agent.model || "",
    baseUrl: agent.baseUrl || "",
    endpoint: agent.endpoint || "",
    cwd: agent.cwd || "",
    timeoutMs: agent.timeoutMs,
    supportsTools: agent.supportsTools,
    credentialConfigured: Boolean((agent.apiKeyEnv && process.env[agent.apiKeyEnv]) || agent.apiKeyCipher),
    apiKeyEnv: agent.apiKeyEnv || "",
    updatedAt: agent.updatedAt
  };
}

export function resolveAgentSecret(agent) {
  if (agent.apiKeyEnv && process.env[agent.apiKeyEnv]) return process.env[agent.apiKeyEnv];
  return agent.apiKeyCipher ? decryptSecret(agent.apiKeyCipher) : "";
}

export async function upsertStoredAgent(input) {
  const stored = await readStoredConfig();
  const existing = stored.agents.find((agent) => agent.id === input?.id) || null;
  const normalized = normalizeAgent(input, existing, "stored");
  const agents = existing
    ? stored.agents.map((agent) => agent.id === normalized.id ? normalized : agent)
    : [...stored.agents, normalized];
  const defaultAgentId = input.makeDefault || !stored.defaultAgentId ? normalized.id : stored.defaultAgentId;
  await writeStoredConfig({ version: 1, defaultAgentId, agents });
  return { agent: normalized, defaultAgentId };
}

export async function deleteStoredAgent(id) {
  const stored = await readStoredConfig();
  const existing = stored.agents.find((agent) => agent.id === id);
  if (!existing) throw new Error("Only stored agents can be deleted from the admin API");
  const agents = stored.agents.filter((agent) => agent.id !== id);
  const defaultAgentId = stored.defaultAgentId === id ? agents.find((agent) => agent.enabled)?.id || "" : stored.defaultAgentId;
  await writeStoredConfig({ version: 1, defaultAgentId, agents });
  return { defaultAgentId };
}

export async function setDefaultAgent(id) {
  const config = await loadAgentConfig();
  if (!config.agents.some((agent) => agent.id === id && agent.enabled)) throw new Error("Agent is missing or disabled");
  const stored = await readStoredConfig();
  await writeStoredConfig({ ...stored, defaultAgentId: id });
  return id;
}

export function adminTokenConfigured() {
  return Boolean(process.env.PROSMET_ADMIN_TOKEN);
}

export function verifyAdminToken(candidate) {
  const expected = process.env.PROSMET_ADMIN_TOKEN || "";
  if (!expected || !candidate) return false;
  const expectedBuffer = Buffer.from(expected);
  const candidateBuffer = Buffer.from(candidate);
  return expectedBuffer.length === candidateBuffer.length && timingSafeEqual(expectedBuffer, candidateBuffer);
}

export function agentConfigurationPath() {
  return configFile;
}
