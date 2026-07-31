import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import {
  agentResponseJsonSchema,
  createEstimateTool,
  extractToolEstimate,
  normalizeAgentEnvelope,
  normalizeMessages,
  parseEnvelopeText
} from "./agent-schema.mjs";
import { resolveAgentSecret } from "./agent-config.mjs";

function endpoint(baseUrl, suffix) {
  if (baseUrl.endsWith(suffix)) return baseUrl;
  return `${baseUrl.replace(/\/$/, "")}${suffix}`;
}

async function fetchJson(url, init, timeoutMs, upstreamSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort(upstreamSignal?.reason || new Error("Request aborted"));
  upstreamSignal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error(`Agent timed out after ${timeoutMs} ms`)), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch {}
    if (!response.ok) {
      const detail = data?.error?.message || data?.error || raw || response.statusText;
      throw new Error(`Agent HTTP ${response.status}: ${String(detail).slice(0, 1000)}`);
    }
    if (data === null) throw new Error("Agent returned a non-JSON response");
    return data;
  } finally {
    clearTimeout(timer);
    upstreamSignal?.removeEventListener("abort", abort);
  }
}

function requestHeaders(agent) {
  const headers = { "content-type": "application/json", ...agent.headers };
  const secret = resolveAgentSecret(agent);
  if (secret) headers.authorization = `Bearer ${secret}`;
  return headers;
}

function contentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => part?.text || part?.content || "").filter(Boolean).join("\n");
}

function parseOpenAIResponse(data) {
  const choice = data?.choices?.[0];
  const message = choice?.message || data?.message || {};
  const estimate = extractToolEstimate(message.tool_calls || data?.tool_calls || []);
  const text = contentText(message.content) || contentText(data?.content) || "";
  if (estimate) {
    return {
      text: text.trim() || "Смета подготовлена и открыта как редактируемый документ.",
      artifact: "estimate",
      estimate,
      usage: data?.usage || null
    };
  }
  const envelope = normalizeAgentEnvelope(parseEnvelopeText(text));
  return { ...envelope, usage: data?.usage || null };
}

async function invokeOpenAICompatible(agent, messages, signal) {
  const body = {
    model: agent.model,
    messages: normalizeMessages(messages, agent.systemPrompt),
    temperature: agent.temperature,
    stream: false
  };
  if (agent.supportsTools) {
    body.tools = [createEstimateTool];
    body.tool_choice = "auto";
  }

  const data = await fetchJson(
    endpoint(agent.baseUrl, "/chat/completions"),
    { method: "POST", headers: requestHeaders(agent), body: JSON.stringify(body) },
    agent.timeoutMs,
    signal
  );
  return parseOpenAIResponse(data);
}

async function invokeOllama(agent, messages, signal) {
  const body = {
    model: agent.model,
    messages: normalizeMessages(messages, agent.systemPrompt),
    stream: false,
    options: { temperature: agent.temperature }
  };
  if (agent.supportsTools) body.tools = [createEstimateTool.function];

  const data = await fetchJson(
    endpoint(agent.baseUrl, "/api/chat"),
    { method: "POST", headers: requestHeaders(agent), body: JSON.stringify(body) },
    agent.timeoutMs,
    signal
  );
  return parseOpenAIResponse(data);
}

async function invokeEnvelopeAgent(agent, messages, signal) {
  const url = agent.endpoint
    ? new URL(agent.endpoint, `${agent.baseUrl}/`).toString()
    : endpoint(agent.baseUrl, agent.kind === "a2a" ? "/tasks/send" : "/run");
  const data = await fetchJson(
    url,
    {
      method: "POST",
      headers: requestHeaders(agent),
      body: JSON.stringify({
        protocol: "prosmet-agent/1",
        agentId: agent.id,
        messages: normalizeMessages(messages, agent.systemPrompt),
        tools: [createEstimateTool],
        responseSchema: agentResponseJsonSchema
      })
    },
    agent.timeoutMs,
    signal
  );

  if (data?.choices || data?.message?.tool_calls) return parseOpenAIResponse(data);
  const candidate = data?.result?.artifact || data?.result || data?.response || data;
  return normalizeAgentEnvelope(candidate);
}

class CodexRpcClient {
  constructor(agent, signal) {
    this.agent = agent;
    this.signal = signal;
    this.sequence = 0;
    this.pending = new Map();
    this.notificationHandlers = new Set();
    this.stderr = [];
    this.closed = false;
    this.child = null;
  }

  async start() {
    const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
      cwd: this.agent.cwd || process.cwd(),
      env: { ...process.env, LOG_FORMAT: "json" },
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.child = child;

    const abort = () => {
      this.failAll(this.signal?.reason || new Error("Codex request aborted"));
      child.kill("SIGTERM");
    };
    this.abort = abort;
    this.signal?.addEventListener("abort", abort, { once: true });

    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => this.onLine(line));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      this.stderr.push(String(chunk));
      if (this.stderr.length > 30) this.stderr.shift();
    });
    child.on("error", (error) => this.failAll(error));
    child.on("exit", (code, signalName) => {
      if (!this.closed && this.pending.size) {
        this.failAll(new Error(`Codex App Server exited (${code ?? signalName ?? "unknown"}): ${this.stderr.join("").slice(-2000)}`));
      }
    });

    await this.request("initialize", {
      clientInfo: {
        name: "prosmet",
        title: "Prosmet Universal Workspace",
        version: "0.1.0"
      }
    });
    this.notify("initialized", {});
  }

  onLine(line) {
    let message;
    try { message = JSON.parse(line); } catch { return; }

    if (message.id !== undefined && !message.method) {
      const pending = this.pending.get(String(message.id));
      if (!pending) return;
      this.pending.delete(String(message.id));
      if (message.error) pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
      else pending.resolve(message.result);
      return;
    }

    if (message.method && message.id !== undefined) {
      const method = String(message.method);
      const result = method.includes("requestApproval")
        ? { decision: "decline" }
        : method.includes("requestUserInput")
          ? { answers: {} }
          : { decision: "cancel" };
      this.write({ id: message.id, result });
      return;
    }

    if (message.method) {
      for (const handler of this.notificationHandlers) handler(message);
    }
  }

  write(message) {
    if (!this.child?.stdin?.writable) throw new Error("Codex App Server stdin is unavailable");
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  request(method, params) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(String(id), { resolve, reject });
      this.write({ method, id, params });
    });
  }

  notify(method, params) {
    this.write({ method, params });
  }

  onNotification(handler) {
    this.notificationHandlers.add(handler);
    return () => this.notificationHandlers.delete(handler);
  }

  failAll(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  close() {
    this.closed = true;
    this.signal?.removeEventListener("abort", this.abort);
    try { this.child?.stdin?.end(); } catch {}
    try { this.child?.kill("SIGTERM"); } catch {}
  }
}

function codexPrompt(messages, systemPrompt) {
  const transcript = normalizeMessages(messages, systemPrompt)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n");
  return `${transcript}\n\nReturn the final answer using the requested JSON output schema. Set artifact and estimate to null unless the user actually requested an estimate. Do not execute shell commands or edit files for this conversation.`;
}

async function invokeCodexAppServer(agent, messages, signal) {
  const client = new CodexRpcClient(agent, signal);
  const timeout = setTimeout(() => {
    client.failAll(new Error(`Codex App Server timed out after ${agent.timeoutMs} ms`));
    client.close();
  }, agent.timeoutMs);

  try {
    await client.start();
    const threadResult = await client.request("thread/start", {
      ephemeral: true,
      ...(agent.model ? { model: agent.model } : {}),
      ...(agent.cwd ? { cwd: agent.cwd } : {}),
      approvalPolicy: "never",
      sandbox: "readOnly"
    });
    const threadId = threadResult?.thread?.id;
    if (!threadId) throw new Error("Codex App Server did not return a thread id");

    let streamedText = "";
    let completedItemText = "";
    let completionError = null;
    let completeTurn;
    const completed = new Promise((resolve, reject) => { completeTurn = { resolve, reject }; });
    const stop = client.onNotification((message) => {
      const params = message.params || {};
      if (message.method === "item/agentMessage/delta" && params.threadId === threadId && typeof params.delta === "string") {
        streamedText += params.delta;
      }
      if (message.method === "item/completed" && params.threadId === threadId && params.item?.type === "agentMessage") {
        completedItemText = params.item.text || params.item.content || completedItemText;
      }
      if (message.method === "error" && params.error?.message) completionError = params.error.message;
      if (message.method === "turn/completed" && params.threadId === threadId) {
        if (params.turn?.status === "failed") completeTurn.reject(new Error(params.turn?.error?.message || completionError || "Codex turn failed"));
        else completeTurn.resolve(params.turn);
      }
    });

    await client.request("turn/start", {
      threadId,
      input: [{ type: "text", text: codexPrompt(messages, agent.systemPrompt) }],
      ...(agent.model ? { model: agent.model } : {}),
      approvalPolicy: "never",
      sandboxPolicy: { type: "readOnly" },
      outputSchema: agentResponseJsonSchema
    });
    await completed;
    stop();

    const raw = String(completedItemText || streamedText).trim();
    if (!raw) throw new Error("Codex completed without an agent message");
    return normalizeAgentEnvelope(parseEnvelopeText(raw));
  } finally {
    clearTimeout(timeout);
    client.close();
  }
}

export async function invokeAgentAdapter(agent, messages, signal) {
  switch (agent.kind) {
    case "openai-compatible": return invokeOpenAICompatible(agent, messages, signal);
    case "ollama": return invokeOllama(agent, messages, signal);
    case "ag-ui":
    case "a2a": return invokeEnvelopeAgent(agent, messages, signal);
    case "codex-app-server": return invokeCodexAppServer(agent, messages, signal);
    default: throw new Error(`Unsupported agent adapter: ${agent.kind}`);
  }
}
