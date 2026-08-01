import { createServer } from "node:http";
import { readFile, stat, mkdir, writeFile, rename, chmod } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual
} from "node:crypto";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { createEstimateStore } from "./server/estimate-store.mjs";

const root = fileURLToPath(new URL("./dist/", import.meta.url));
const port = Number(process.env.PORT || 3200);
const releaseSha = process.env.PROSMET_RELEASE_SHA || "development";
const configRoot = process.env.PROSMET_CONFIG_DIR || join(homedir(), ".prosmet-greenfield", "config");
const registryFile = join(configRoot, "agents.json");
const registryTempFile = join(configRoot, "agents.json.tmp");
const keyFile = join(configRoot, "agents.key");
const adminTokenFile = join(configRoot, "admin.token");
const estimateDatabaseFile = process.env.PROSMET_DATABASE_PATH || join(configRoot, "prosmet.sqlite");
const estimateStore = createEstimateStore(estimateDatabaseFile);
const capabilityManifest = {
  vertical: "construction-estimates-ru",
  workflow: ["brief", "technology-card", "price-research", "estimate", "construction-documents"],
  quickActions: [
    {
      id: "create-estimate",
      title: "Составить смету",
      prompt: "Составь строительную смету. Сначала уточни недостающие исходные данные, затем сформируй технологическую карту, исследуй актуальные цены и создай редактируемую смету.",
      artifactType: "estimate"
    },
    {
      id: "calculate-measurements",
      title: "Рассчитать по замерам",
      prompt: "Рассчитай объёмы работ и материалов по моим замерам, затем создай смету с ценами, источниками и итогами.",
      artifactType: "estimate"
    },
    {
      id: "prepare-documents",
      title: "Подготовить документы",
      prompt: "На основании сметы подготовь комплект строительных документов: коммерческое предложение, договор, акт и счёт.",
      artifactType: "document-set"
    }
  ],
  supportedArtifacts: ["estimate", "commercial-proposal", "contract", "ks-2", "ks-3", "invoice"]
};
const publicAgentAccess = process.env.PROSMET_PUBLIC_AGENT_ACCESS === "true";
const maxBodyBytes = 2 * 1024 * 1024;

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8"
};

const providerKinds = new Set([
  "openai-compatible",
  "ollama",
  "codex-app-server",
  "http-agent"
]);

const estimateSchema = {
  type: "object",
  properties: {
    text: { type: "string" },
    artifact: { type: ["string", "null"], enum: ["estimate", null] },
    estimate: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            project: { type: "string" },
            customer: { type: "string" },
            region: { type: "string" },
            revision: { type: "number" },
            status: { type: "string", enum: ["draft", "review", "approved", "sent"] },
            overheadPercent: { type: "number" },
            profitPercent: { type: "number" },
            vatPercent: { type: "number" },
            updatedAt: { type: "string" },
            sections: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  title: { type: "string" },
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        unit: { type: "string" },
                        quantity: { type: "number" },
                        unitPrice: { type: "number" },
                        category: {
                          type: "string",
                          enum: ["work", "material", "equipment", "logistics"]
                        }
                      },
                      required: ["id", "name", "unit", "quantity", "unitPrice", "category"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["id", "title", "items"],
                additionalProperties: false
              }
            }
          },
          required: [
            "id",
            "title",
            "project",
            "customer",
            "region",
            "revision",
            "status",
            "overheadPercent",
            "profitPercent",
            "vatPercent",
            "updatedAt",
            "sections"
          ],
          additionalProperties: false
        }
      ]
    }
  },
  required: ["text", "artifact", "estimate"],
  additionalProperties: false
};

const systemInstructions = [
  "Ты главный агент-сметчик универсального строительного приложения Просметчик.",
  "Отвечай только одним JSON-объектом с полями text, artifact и estimate.",
  "artifact должен быть null или строкой estimate.",
  "Когда пользователь просит смету, сначала проверь исходные данные и задай только необходимые уточняющие вопросы.",
  "До формирования сметы составь технологическую карту: этапы, подготовка, материалы, механизмы, контроль качества, охрана труда и условия выполнения.",
  "После технологической карты подбери актуальные цены для указанного региона, фиксируя в названиях и структуре сметы все необходимые работы, материалы, оборудование и логистику.",
  "Когда данных достаточно, верни полноценную редактируемую смету по переданной JSON-схеме; сервер сам сохранит её в базе данных и откроет редактор.",
  "Если критически важных данных недостаточно, не придумывай значения: задай конкретный вопрос в text, а artifact и estimate оставь null.",
  "Все количества, цены и проценты должны быть конечными неотрицательными числами.",
  "Не используй тестовые, демонстрационные или фиктивные объекты."
].join(" ");

let encryptionKeyPromise;
let adminTokenPromise;
let registryQueue = Promise.resolve();
const codexClients = new Map();

function sendJson(response, statusCode, body, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...extraHeaders
  });
  response.end(JSON.stringify(body));
}

function sendError(response, statusCode, code, message, details) {
  sendJson(response, statusCode, {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details })
    }
  });
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      const error = new Error("Request body is too large");
      error.code = "BODY_TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonBody(request) {
  const raw = await readBody(request);
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Request body must be valid JSON");
    error.code = "INVALID_JSON";
    throw error;
  }
}

async function ensureConfigRoot() {
  await mkdir(configRoot, { recursive: true, mode: 0o700 });
  await chmod(configRoot, 0o700).catch(() => undefined);
}

async function getEncryptionKey() {
  if (!encryptionKeyPromise) {
    encryptionKeyPromise = (async () => {
      await ensureConfigRoot();
      try {
        const existing = await readFile(keyFile);
        if (existing.length !== 32) throw new Error("Invalid encryption key length");
        return existing;
      } catch (error) {
        if (error?.code && error.code !== "ENOENT") throw error;
        const key = randomBytes(32);
        await writeFile(keyFile, key, { mode: 0o600, flag: "wx" }).catch(async (writeError) => {
          if (writeError?.code !== "EEXIST") throw writeError;
        });
        const persisted = await readFile(keyFile);
        if (persisted.length !== 32) throw new Error("Invalid persisted encryption key length");
        return persisted;
      }
    })();
  }
  return encryptionKeyPromise;
}

async function getAdminToken() {
  if (!adminTokenPromise) {
    adminTokenPromise = (async () => {
      const configured = process.env.PROSMET_ADMIN_TOKEN?.trim();
      if (configured) return configured;
      await ensureConfigRoot();
      try {
        const existing = (await readFile(adminTokenFile, "utf8")).trim();
        if (existing.length < 24) throw new Error("Persisted admin token is invalid");
        return existing;
      } catch (error) {
        if (error?.code && error.code !== "ENOENT") throw error;
        const token = randomBytes(32).toString("base64url");
        await writeFile(adminTokenFile, `${token}\n`, { mode: 0o600, flag: "wx" }).catch(async (writeError) => {
          if (writeError?.code !== "EEXIST") throw writeError;
        });
        return (await readFile(adminTokenFile, "utf8")).trim();
      }
    })();
  }
  return adminTokenPromise;
}

async function encryptSecret(value) {
  if (!value) return null;
  const key = await getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

async function decryptSecret(value) {
  if (!value) return null;
  const [version, ivValue, tagValue, encryptedValue] = String(value).split(".");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Unsupported encrypted secret format");
  }
  const key = await getEncryptionKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

function emptyRegistry() {
  return {
    version: 1,
    activeAgentId: null,
    agents: [],
    profile: null
  };
}

async function loadRegistry() {
  await ensureConfigRoot();
  try {
    const parsed = JSON.parse(await readFile(registryFile, "utf8"));
    return {
      version: 1,
      activeAgentId: typeof parsed.activeAgentId === "string" ? parsed.activeAgentId : null,
      agents: Array.isArray(parsed.agents) ? parsed.agents : [],
      profile: parsed.profile && typeof parsed.profile === "object" ? parsed.profile : null
    };
  } catch (error) {
    if (error?.code === "ENOENT") return emptyRegistry();
    throw error;
  }
}

async function saveRegistry(registry) {
  await ensureConfigRoot();
  await writeFile(registryTempFile, `${JSON.stringify(registry, null, 2)}\n`, { mode: 0o600 });
  await rename(registryTempFile, registryFile);
  await chmod(registryFile, 0o600).catch(() => undefined);
}

function mutateRegistry(mutator) {
  const operation = registryQueue.catch(() => undefined).then(async () => {
    const registry = await loadRegistry();
    const result = await mutator(registry);
    await saveRegistry(registry);
    return result;
  });
  registryQueue = operation;
  return operation;
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function cookieValue(request, name) {
  const header = request.headers.cookie || "";
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

async function createAdminSession() {
  const key = await getEncryptionKey();
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 12 * 60 * 60 * 1000 })).toString("base64url");
  const signature = createHmac("sha256", key).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

async function verifyAdminSession(value) {
  if (!value) return false;
  const [payload, signature] = String(value).split(".");
  if (!payload || !signature) return false;
  const key = await getEncryptionKey();
  const expected = createHmac("sha256", key).update(payload).digest("base64url");
  if (!constantTimeEqual(signature, expected)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number(decoded.exp) > Date.now();
  } catch {
    return false;
  }
}

async function isAdmin(request) {
  const expected = await getAdminToken();
  const headerToken = request.headers["x-prosmet-admin-token"];
  if (typeof headerToken === "string" && constantTimeEqual(headerToken.trim(), expected)) return true;
  const authorization = request.headers.authorization;
  if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
    if (constantTimeEqual(authorization.slice(7).trim(), expected)) return true;
  }
  return verifyAdminSession(cookieValue(request, "prosmet_admin_session"));
}

async function requireAdmin(request, response) {
  if (await isAdmin(request)) return true;
  sendError(response, 401, "ADMIN_REQUIRED", "Требуется сессия супер-администратора.");
  return false;
}

function sanitizeAgent(agent, activeAgentId) {
  return {
    id: agent.id,
    name: agent.name,
    type: agent.type,
    enabled: agent.enabled !== false,
    active: agent.id === activeAgentId,
    model: agent.model || null,
    baseUrl: agent.baseUrl || null,
    command: agent.command || null,
    args: Array.isArray(agent.args) ? agent.args : [],
    cwd: agent.cwd || null,
    systemPrompt: agent.systemPrompt || null,
    timeoutMs: Number(agent.timeoutMs) || 120000,
    hasSecret: Boolean(agent.secretCipher),
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt
  };
}

function normalizeUrl(value, field) {
  const text = String(value || "").trim().replace(/\/+$/, "");
  if (!text) throw new Error(`${field} обязателен`);
  const url = new URL(text);
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new Error(`${field} должен использовать http или https`);
  }
  return url.toString().replace(/\/+$/, "");
}

function optionalString(value, maxLength = 4000) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

async function normalizeAgentInput(input, existing = null) {
  if (!input || typeof input !== "object") throw new Error("Agent configuration is required");
  const type = String(input.type || existing?.type || "");
  if (!providerKinds.has(type)) throw new Error("Unsupported agent provider type");
  const name = String(input.name || existing?.name || "").trim().slice(0, 80);
  if (!name) throw new Error("Название агента обязательно");

  const agent = {
    id: existing?.id || randomUUID(),
    name,
    type,
    enabled: input.enabled === undefined ? existing?.enabled !== false : Boolean(input.enabled),
    model: optionalString(input.model ?? existing?.model, 160),
    baseUrl: null,
    command: null,
    args: [],
    cwd: optionalString(input.cwd ?? existing?.cwd, 1000),
    systemPrompt: optionalString(input.systemPrompt ?? existing?.systemPrompt, 12000),
    timeoutMs: Math.min(600000, Math.max(5000, Number(input.timeoutMs ?? existing?.timeoutMs ?? 120000))),
    secretCipher: existing?.secretCipher || null,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (type === "codex-app-server") {
    agent.command = optionalString(input.command ?? existing?.command, 500) || "codex";
    const args = input.args ?? existing?.args ?? ["app-server", "--listen", "stdio://"];
    if (!Array.isArray(args) || args.some((entry) => typeof entry !== "string")) {
      throw new Error("Аргументы Codex должны быть массивом строк");
    }
    agent.args = args.slice(0, 24).map((entry) => entry.slice(0, 500));
  } else {
    agent.baseUrl = normalizeUrl(input.baseUrl ?? existing?.baseUrl, "URL агента");
    if (type !== "http-agent" && !agent.model) throw new Error("Модель обязательна");
  }

  if (Object.prototype.hasOwnProperty.call(input, "secret")) {
    agent.secretCipher = await encryptSecret(optionalString(input.secret, 12000));
  }

  return agent;
}

function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (typeof part === "string") return part;
    if (part && typeof part.text === "string") return part.text;
    return "";
  }).filter(Boolean).join("\n");
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.map((message) => ({
    role: new Set(["user", "assistant", "system"]).has(message?.role) ? message.role : "user",
    content: textFromContent(message?.content)
  })).filter((message) => message.content.trim());
}

function conversationPrompt(messages) {
  return normalizeMessages(messages)
    .map((message) => `${message.role === "user" ? "Пользователь" : message.role === "assistant" ? "Ассистент" : "Система"}: ${message.content}`)
    .join("\n\n");
}

function finiteNonNegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function validateEstimate(value) {
  if (!value || typeof value !== "object") return null;
  const sections = Array.isArray(value.sections) ? value.sections.map((section, sectionIndex) => {
    if (!section || typeof section !== "object") return null;
    const items = Array.isArray(section.items) ? section.items.map((item, itemIndex) => {
      if (!item || typeof item !== "object") return null;
      const name = String(item.name || "").trim();
      const unit = String(item.unit || "").trim();
      const category = new Set(["work", "material", "equipment", "logistics"]).has(item.category)
        ? item.category
        : "work";
      if (!name || !unit) return null;
      return {
        id: String(item.id || `item-${sectionIndex + 1}-${itemIndex + 1}`),
        name,
        unit,
        quantity: finiteNonNegative(item.quantity),
        unitPrice: finiteNonNegative(item.unitPrice),
        category
      };
    }).filter(Boolean) : [];
    const title = String(section.title || "").trim();
    if (!title || items.length === 0) return null;
    return {
      id: String(section.id || `section-${sectionIndex + 1}`),
      title,
      items
    };
  }).filter(Boolean) : [];

  if (sections.length === 0) return null;
  const title = String(value.title || "").trim();
  if (!title) return null;
  const status = new Set(["draft", "review", "approved", "sent"]).has(value.status) ? value.status : "draft";
  return {
    id: String(value.id || randomUUID()),
    title,
    project: String(value.project || "").trim(),
    customer: String(value.customer || "").trim(),
    region: String(value.region || "").trim(),
    revision: Math.max(1, Math.floor(finiteNonNegative(value.revision, 1))),
    status,
    overheadPercent: finiteNonNegative(value.overheadPercent),
    profitPercent: finiteNonNegative(value.profitPercent),
    vatPercent: finiteNonNegative(value.vatPercent),
    sections,
    updatedAt: new Date().toISOString()
  };
}

function extractJsonObject(raw) {
  if (raw && typeof raw === "object") return raw;
  const text = String(raw || "").trim();
  if (!text) return null;
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(unfenced.slice(start, end + 1)); } catch {}
    }
  }
  return null;
}

function parseAgentEnvelope(raw) {
  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== "object") {
    const text = String(raw || "").trim();
    if (!text) throw new Error("Агент вернул пустой ответ");
    return { text };
  }
  const text = String(parsed.text || parsed.message || parsed.output || "").trim();
  const estimate = validateEstimate(parsed.estimate);
  if (parsed.artifact === "estimate" && estimate) {
    return { text: text || "Смета подготовлена.", artifact: "estimate", estimate };
  }
  if (!text) throw new Error("Ответ агента не содержит текста или валидной сметы");
  return { text };
}

function endpointFor(baseUrl, suffix) {
  const clean = baseUrl.replace(/\/+$/, "");
  if (clean.endsWith(suffix)) return clean;
  return `${clean}/${suffix.replace(/^\/+/, "")}`;
}

function createLinkedAbortSignal(externalSignal, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Agent request timed out")), timeoutMs);
  const onAbort = () => controller.abort(externalSignal.reason || new Error("Agent request aborted"));
  externalSignal?.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", onAbort);
    }
  };
}

async function fetchJson(url, options, timeoutMs, externalSignal) {
  const linked = createLinkedAbortSignal(externalSignal, timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: linked.signal });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!response.ok) {
      const detail = typeof body === "string" ? body.slice(0, 1000) : body;
      const error = new Error(`Upstream agent returned HTTP ${response.status}`);
      error.details = detail;
      throw error;
    }
    return body;
  } finally {
    linked.dispose();
  }
}

async function callOpenAICompatible(agent, messages, signal) {
  const secret = await decryptSecret(agent.secretCipher);
  const result = await fetchJson(
    endpointFor(agent.baseUrl, "chat/completions"),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { authorization: `Bearer ${secret}` } : {})
      },
      body: JSON.stringify({
        model: agent.model,
        messages: [
          { role: "system", content: agent.systemPrompt || systemInstructions },
          ...normalizeMessages(messages)
        ],
        temperature: 0.1
      })
    },
    agent.timeoutMs,
    signal
  );
  const content = result?.choices?.[0]?.message?.content;
  return parseAgentEnvelope(content);
}

async function callOllama(agent, messages, signal) {
  const secret = await decryptSecret(agent.secretCipher);
  const result = await fetchJson(
    endpointFor(agent.baseUrl, "api/chat"),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { authorization: `Bearer ${secret}` } : {})
      },
      body: JSON.stringify({
        model: agent.model,
        messages: [
          { role: "system", content: agent.systemPrompt || systemInstructions },
          ...normalizeMessages(messages)
        ],
        stream: false,
        format: "json",
        options: { temperature: 0.1 }
      })
    },
    agent.timeoutMs,
    signal
  );
  return parseAgentEnvelope(result?.message?.content ?? result?.response);
}

async function callHttpAgent(agent, messages, signal) {
  const secret = await decryptSecret(agent.secretCipher);
  const result = await fetchJson(
    agent.baseUrl,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { authorization: `Bearer ${secret}` } : {})
      },
      body: JSON.stringify({
        messages: normalizeMessages(messages),
        instructions: agent.systemPrompt || systemInstructions,
        responseSchema: estimateSchema,
        context: { application: "prosmet-greenfield", releaseSha }
      })
    },
    agent.timeoutMs,
    signal
  );
  return parseAgentEnvelope(result);
}

function agentMessageText(item) {
  if (!item || typeof item !== "object") return "";
  if (typeof item.text === "string") return item.text;
  if (typeof item.message === "string") return item.message;
  if (Array.isArray(item.content)) return textFromContent(item.content);
  return "";
}

class CodexAppServerClient {
  constructor(agent, secret) {
    this.agent = agent;
    this.secret = secret;
    this.child = null;
    this.pending = new Map();
    this.listeners = new Set();
    this.nextId = 1;
    this.ready = null;
    this.stderr = [];
    this.queue = Promise.resolve();
  }

  async start() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const env = { ...process.env };
      if (this.secret) env.OPENAI_API_KEY = this.secret;
      this.child = spawn(this.agent.command || "codex", this.agent.args || ["app-server", "--listen", "stdio://"], {
        cwd: this.agent.cwd || process.cwd(),
        env,
        stdio: ["pipe", "pipe", "pipe"],
        shell: false
      });
      this.child.once("error", (error) => this.failAll(error));
      this.child.once("exit", (code, signal) => {
        this.failAll(new Error(`Codex App Server exited (${code ?? "null"}/${signal ?? "none"})`));
        this.child = null;
        this.ready = null;
      });
      createInterface({ input: this.child.stdout }).on("line", (line) => this.handleLine(line));
      createInterface({ input: this.child.stderr }).on("line", (line) => {
        this.stderr.push(line);
        if (this.stderr.length > 80) this.stderr.shift();
      });
      await this.request("initialize", {
        clientInfo: {
          name: "prosmet_greenfield",
          title: "Prosmet Greenfield",
          version: "1.0.0"
        }
      }, 30000);
      this.notify("initialized", {});
    })();
    return this.ready;
  }

  write(message) {
    if (!this.child?.stdin?.writable) throw new Error("Codex App Server is not writable");
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  request(method, params = {}, timeoutMs = this.agent.timeoutMs) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(String(id));
        reject(new Error(`Codex request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(String(id), {
        resolve: (value) => { clearTimeout(timeout); resolve(value); },
        reject: (error) => { clearTimeout(timeout); reject(error); }
      });
      this.write({ method, id, params });
    });
  }

  notify(method, params = {}) {
    this.write({ method, params });
  }

  handleLine(line) {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
      const pending = this.pending.get(String(message.id));
      if (!pending) return;
      this.pending.delete(String(message.id));
      if (message.error) pending.reject(new Error(message.error.message || "Codex request failed"));
      else pending.resolve(message.result);
      return;
    }
    if (message.id !== undefined && message.method) {
      this.write({
        id: message.id,
        error: { code: -32601, message: "Interactive requests are disabled for this integration" }
      });
      return;
    }
    if (message.method) {
      for (const listener of this.listeners) listener(message);
    }
  }

  failAll(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  onEvent(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  run(messages, signal) {
    const operation = this.queue.catch(() => undefined).then(() => this.runInternal(messages, signal));
    this.queue = operation;
    return operation;
  }

  async runInternal(messages, signal) {
    await this.start();
    const threadParams = {
      ephemeral: true,
      approvalPolicy: "never",
      sandbox: "readOnly",
      ...(this.agent.model ? { model: this.agent.model } : {}),
      ...(this.agent.cwd ? { cwd: this.agent.cwd } : {})
    };
    const threadResult = await this.request("thread/start", threadParams);
    const threadId = threadResult?.thread?.id;
    if (!threadId) throw new Error("Codex did not return a thread id");

    let turnId = null;
    let accumulated = "";
    let completedItem = "";
    let completionResolve;
    let completionReject;
    const completion = new Promise((resolve, reject) => {
      completionResolve = resolve;
      completionReject = reject;
    });

    const unsubscribe = this.onEvent((event) => {
      const params = event.params || {};
      if (params.threadId && params.threadId !== threadId) return;
      if (turnId && params.turnId && params.turnId !== turnId) return;
      if (event.method === "item/agentMessage/delta" && typeof params.delta === "string") {
        accumulated += params.delta;
      }
      if (event.method === "item/completed" && params.item?.type === "agentMessage") {
        completedItem = agentMessageText(params.item) || completedItem;
      }
      if (event.method === "turn/completed") {
        const turn = params.turn || {};
        if (turnId && turn.id && turn.id !== turnId) return;
        if (turn.status === "failed") {
          completionReject(new Error(turn.error?.message || "Codex turn failed"));
        } else if (turn.status === "interrupted") {
          completionReject(new Error("Codex turn was interrupted"));
        } else {
          completionResolve(turn);
        }
      }
    });

    const abort = async () => {
      if (!turnId) return;
      try { await this.request("turn/interrupt", { threadId, turnId }, 10000); } catch {}
    };
    signal?.addEventListener("abort", abort, { once: true });

    try {
      const prompt = `${this.agent.systemPrompt || systemInstructions}\n\n${conversationPrompt(messages)}`;
      const turnResult = await this.request("turn/start", {
        threadId,
        input: [{ type: "text", text: prompt }],
        approvalPolicy: "never",
        sandboxPolicy: { type: "readOnly" },
        outputSchema: estimateSchema,
        ...(this.agent.model ? { model: this.agent.model } : {})
      });
      turnId = turnResult?.turn?.id;
      if (!turnId) throw new Error("Codex did not return a turn id");
      const linked = createLinkedAbortSignal(signal, this.agent.timeoutMs);
      try {
        await Promise.race([
          completion,
          new Promise((_, reject) => linked.signal.addEventListener("abort", () => reject(linked.signal.reason || new Error("Codex timed out")), { once: true }))
        ]);
      } finally {
        linked.dispose();
      }
      return parseAgentEnvelope(completedItem || accumulated);
    } finally {
      signal?.removeEventListener("abort", abort);
      unsubscribe();
    }
  }

  close() {
    this.child?.kill("SIGTERM");
    this.child = null;
    this.ready = null;
  }
}

async function getCodexClient(agent) {
  const secret = await decryptSecret(agent.secretCipher);
  const signature = `${agent.updatedAt}:${agent.command}:${JSON.stringify(agent.args)}:${agent.cwd || ""}:${agent.model || ""}`;
  const existing = codexClients.get(agent.id);
  if (existing?.signature === signature) return existing.client;
  existing?.client.close();
  const client = new CodexAppServerClient(agent, secret);
  codexClients.set(agent.id, { signature, client });
  return client;
}

async function callConfiguredAgent(agent, messages, signal) {
  if (agent.enabled === false) throw new Error("Активный агент отключён");
  if (agent.type === "openai-compatible") return callOpenAICompatible(agent, messages, signal);
  if (agent.type === "ollama") return callOllama(agent, messages, signal);
  if (agent.type === "http-agent") return callHttpAgent(agent, messages, signal);
  if (agent.type === "codex-app-server") {
    const client = await getCodexClient(agent);
    return client.run(messages, signal);
  }
  throw new Error("Unsupported active agent type");
}

async function activeAgent() {
  const registry = await loadRegistry();
  return registry.agents.find((agent) => agent.id === registry.activeAgentId) || null;
}

function profileForResponse(profile) {
  return {
    name: String(profile?.name || ""),
    email: String(profile?.email || ""),
    organization: String(profile?.organization || ""),
    region: String(profile?.region || ""),
    role: "super_admin",
    updatedAt: String(profile?.updatedAt || "")
  };
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    return sendJson(response, 200, {
      ok: true,
      app: "prosmet-greenfield-v3",
      releaseSha,
      runtime: "node-static",
      ui: "greenfield"
    });
  }

  if (request.method === "GET" && url.pathname === "/api/system") {
    const registry = await loadRegistry();
    const adminAuthenticated = await isAdmin(request);
    const active = registry.agents.find((agent) => agent.id === registry.activeAgentId) || null;
    return sendJson(response, 200, {
      ok: true,
      app: "prosmet-greenfield-v3",
      releaseSha,
      ui: "greenfield",
      activeAgent: active ? sanitizeAgent(active, registry.activeAgentId) : null,
      configuredAgents: registry.agents.length,
      adminAuthenticated,
      bootstrapRequired: !process.env.PROSMET_ADMIN_TOKEN,
      profileConfigured: Boolean(registry.profile?.name || registry.profile?.organization),
      persistence: "sqlite-artifact-store"
    });
  }

  if (url.pathname === "/api/admin/session") {
    if (request.method === "GET") {
      return sendJson(response, 200, {
        authenticated: await isAdmin(request),
        bootstrapRequired: !process.env.PROSMET_ADMIN_TOKEN
      });
    }
    if (request.method === "POST") {
      const body = await readJsonBody(request);
      const expected = await getAdminToken();
      if (!constantTimeEqual(String(body.token || ""), expected)) {
        return sendError(response, 401, "INVALID_ADMIN_TOKEN", "Неверный токен супер-администратора.");
      }
      const session = await createAdminSession();
      return sendJson(response, 200, { authenticated: true, bootstrapRequired: !process.env.PROSMET_ADMIN_TOKEN }, {
        "set-cookie": `prosmet_admin_session=${encodeURIComponent(session)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`
      });
    }
    if (request.method === "DELETE") {
      return sendJson(response, 200, { authenticated: false, bootstrapRequired: !process.env.PROSMET_ADMIN_TOKEN }, {
        "set-cookie": "prosmet_admin_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0"
      });
    }
  }

  if (url.pathname === "/api/account") {
    if (!(await requireAdmin(request, response))) return;
    if (request.method === "GET") {
      const registry = await loadRegistry();
      return sendJson(response, 200, profileForResponse(registry.profile));
    }
    if (request.method === "PUT") {
      const body = await readJsonBody(request);
      const profile = await mutateRegistry((registry) => {
        registry.profile = {
          name: optionalString(body.name, 160) || "",
          email: optionalString(body.email, 320) || "",
          organization: optionalString(body.organization, 240) || "",
          region: optionalString(body.region, 240) || "",
          role: "super_admin",
          updatedAt: new Date().toISOString()
        };
        return registry.profile;
      });
      return sendJson(response, 200, profileForResponse(profile));
    }
  }

  if (request.method === "GET" && url.pathname === "/api/capabilities") {
    return sendJson(response, 200, capabilityManifest);
  }

  if (request.method === "GET" && url.pathname === "/api/estimates") {
    return sendJson(response, 200, {
      estimates: estimateStore.listEstimates("production"),
      persistence: "sqlite"
    });
  }

  const estimateRoute = url.pathname.match(/^\/api\/estimates\/([^/]+)$/);
  if (estimateRoute) {
    const estimateId = decodeURIComponent(estimateRoute[1]);
    if (request.method === "GET") {
      const estimate = estimateStore.getEstimate(estimateId, "production");
      if (!estimate) return sendError(response, 404, "ESTIMATE_NOT_FOUND", "Смета не найдена.");
      return sendJson(response, 200, estimate);
    }
    if (request.method === "PUT") {
      const body = await readJsonBody(request);
      const estimate = validateEstimate(body.estimate ?? body);
      if (!estimate || estimate.id !== estimateId) {
        return sendError(response, 400, "INVALID_ESTIMATE", "Передана некорректная смета.");
      }
      const stored = estimateStore.saveEstimate(estimate, { ownerId: "production" });
      return sendJson(response, 200, stored);
    }
  }

  if (request.method === "GET" && url.pathname === "/api/agents") {
    const registry = await loadRegistry();
    return sendJson(response, 200, {
      agents: registry.agents.map((agent) => sanitizeAgent(agent, registry.activeAgentId)),
      activeAgentId: registry.activeAgentId,
      adminAuthenticated: await isAdmin(request),
      bootstrapRequired: !process.env.PROSMET_ADMIN_TOKEN
    });
  }

  if (request.method === "POST" && url.pathname === "/api/agents") {
    if (!(await requireAdmin(request, response))) return;
    const body = await readJsonBody(request);
    const created = await mutateRegistry(async (registry) => {
      const agent = await normalizeAgentInput(body);
      registry.agents.push(agent);
      if (!registry.activeAgentId && agent.enabled !== false) registry.activeAgentId = agent.id;
      return sanitizeAgent(agent, registry.activeAgentId);
    });
    return sendJson(response, 201, created);
  }

  const agentRoute = url.pathname.match(/^\/api\/agents\/([^/]+)(?:\/(activate|test))?$/);
  if (agentRoute) {
    const agentId = decodeURIComponent(agentRoute[1]);
    const action = agentRoute[2] || null;
    if (!(await requireAdmin(request, response))) return;

    if (request.method === "PUT" && !action) {
      const body = await readJsonBody(request);
      const updated = await mutateRegistry(async (registry) => {
        const index = registry.agents.findIndex((agent) => agent.id === agentId);
        if (index < 0) return null;
        const agent = await normalizeAgentInput(body, registry.agents[index]);
        registry.agents[index] = agent;
        codexClients.get(agentId)?.client.close();
        codexClients.delete(agentId);
        return sanitizeAgent(agent, registry.activeAgentId);
      });
      if (!updated) return sendError(response, 404, "AGENT_NOT_FOUND", "Агент не найден.");
      return sendJson(response, 200, updated);
    }

    if (request.method === "DELETE" && !action) {
      const removed = await mutateRegistry((registry) => {
        const index = registry.agents.findIndex((agent) => agent.id === agentId);
        if (index < 0) return false;
        registry.agents.splice(index, 1);
        if (registry.activeAgentId === agentId) {
          registry.activeAgentId = registry.agents.find((agent) => agent.enabled !== false)?.id || null;
        }
        codexClients.get(agentId)?.client.close();
        codexClients.delete(agentId);
        return true;
      });
      if (!removed) return sendError(response, 404, "AGENT_NOT_FOUND", "Агент не найден.");
      return sendJson(response, 200, { deleted: true });
    }

    if (request.method === "POST" && action === "activate") {
      const activated = await mutateRegistry((registry) => {
        const agent = registry.agents.find((entry) => entry.id === agentId);
        if (!agent) return null;
        if (agent.enabled === false) throw new Error("Нельзя активировать отключённого агента");
        registry.activeAgentId = agent.id;
        return sanitizeAgent(agent, registry.activeAgentId);
      });
      if (!activated) return sendError(response, 404, "AGENT_NOT_FOUND", "Агент не найден.");
      return sendJson(response, 200, activated);
    }

    if (request.method === "POST" && action === "test") {
      const registry = await loadRegistry();
      const agent = registry.agents.find((entry) => entry.id === agentId);
      if (!agent) return sendError(response, 404, "AGENT_NOT_FOUND", "Агент не найден.");
      const startedAt = Date.now();
      const controller = new AbortController();
      const result = await callConfiguredAgent(agent, [
        { role: "user", content: "Проверь соединение. Верни JSON: text со словом OK, artifact null, estimate null." }
      ], controller.signal);
      return sendJson(response, 200, {
        ok: true,
        agentId: agent.id,
        latencyMs: Date.now() - startedAt,
        provider: agent.type,
        model: agent.model || null,
        message: result.text
      });
    }
  }

  if (request.method === "POST" && url.pathname === "/api/agent") {
    if (!publicAgentAccess && !(await requireAdmin(request, response))) return;
    const body = await readJsonBody(request);
    const agent = await activeAgent();
    if (!agent) {
      return sendError(response, 409, "AGENT_NOT_CONFIGURED", "Подключите и активируйте агента в настройках.");
    }
    const controller = new AbortController();
    request.once("close", () => {
      if (!request.complete) controller.abort(new Error("Client disconnected"));
    });
    const requestId = optionalString(body.requestId, 160) || randomUUID();
    const result = await callConfiguredAgent(agent, body.messages, controller.signal);
    let artifact = null;
    if (result.artifact === "estimate" && result.estimate) {
      const stored = estimateStore.saveEstimate(result.estimate, {
        ownerId: "production",
        sourceAgentId: agent.id,
        sourceRequestId: requestId
      });
      artifact = {
        type: "estimate",
        id: stored.id,
        revision: stored.revision,
        database: "sqlite"
      };
    }
    return sendJson(response, 200, {
      text: artifact ? (result.text || "Смета сформирована и сохранена в базе данных.") : result.text,
      artifact,
      agent: {
        id: agent.id,
        name: agent.name,
        type: agent.type,
        model: agent.model || null
      }
    });
  }

  return false;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  try {
    if (url.pathname.startsWith("/api/")) {
      const handled = await handleApi(request, response, url);
      if (handled !== false || response.writableEnded) return;
      return sendError(response, 404, "API_ROUTE_NOT_FOUND", "API route not found");
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405);
      return response.end();
    }

    const relative = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
    let filePath = join(root, relative || "index.html");
    if (!filePath.startsWith(root)) {
      response.writeHead(403);
      return response.end();
    }

    try {
      const info = await stat(filePath);
      if (info.isDirectory()) filePath = join(filePath, "index.html");
    } catch {
      filePath = join(root, "index.html");
    }

    try {
      const content = await readFile(filePath);
      const extension = extname(filePath);
      response.writeHead(200, {
        "content-type": mime[extension] || "application/octet-stream",
        "cache-control": extension === ".html" ? "no-store" : "public, max-age=31536000, immutable",
        "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
        "referrer-policy": "strict-origin-when-cross-origin",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY"
      });
      if (request.method === "HEAD") return response.end();
      response.end(content);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  } catch (error) {
    const code = error?.code === "BODY_TOO_LARGE"
      ? "BODY_TOO_LARGE"
      : error?.code === "INVALID_JSON"
        ? "INVALID_JSON"
        : "REQUEST_FAILED";
    const status = code === "BODY_TOO_LARGE" ? 413 : code === "INVALID_JSON" ? 400 : 500;
    console.error("[prosmet]", error);
    if (!response.headersSent && !response.writableEnded) {
      sendError(response, status, code, error instanceof Error ? error.message : "Unexpected server error", error?.details);
    } else if (!response.writableEnded) {
      response.end();
    }
  }
});

server.listen(port, "127.0.0.1", async () => {
  await ensureConfigRoot();
  await getAdminToken();
  console.log(`Prosmet Greenfield listening on http://127.0.0.1:${port}`);
  console.log(`Agent configuration: ${registryFile}`);
  if (!process.env.PROSMET_ADMIN_TOKEN) {
    console.log(`Generated admin token path: ${adminTokenFile}`);
  }
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    for (const { client } of codexClients.values()) client.close();
    estimateStore.close();
    server.close(() => process.exit(0));
  });
}
