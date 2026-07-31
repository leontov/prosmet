import "server-only";

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import {
  parseProviderInterpretation,
  providerSystemPrompt,
  providerUserPrompt,
  type ProviderSemanticResult
} from "@/lib/server/agents/provider-contract";

const CODEX_BIN = process.env.PROSMET_CODEX_BIN?.trim() || "codex";

type RpcMessage = {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { message?: string };
};

function safeEnvironment(): NodeJS.ProcessEnv {
  const allowed = [
    "PATH", "HOME", "LANG", "LC_ALL", "USER", "LOGNAME", "SHELL", "TERM",
    "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "TMPDIR",
    "OPENAI_API_KEY", "OPENAI_BASE_URL", "CODEX_HOME", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY"
  ];
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: process.env.NODE_ENV ?? "production"
  };
  for (const name of allowed) {
    const value = process.env[name];
    if (value) environment[name] = value;
  }
  return environment;
}

function textFromItem(item: Record<string, unknown>) {
  if (typeof item.text === "string") return item.text;
  if (typeof item.content === "string") return item.content;
  if (Array.isArray(item.content)) {
    return item.content
      .flatMap((part) => {
        if (!part || typeof part !== "object") return [];
        const value = part as Record<string, unknown>;
        return typeof value.text === "string" ? [value.text] : [];
      })
      .join("\n");
  }
  return "";
}

class CodexAppServerClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private readonly pending = new Map<number | string, { resolve: (value: unknown) => void; reject: (reason: Error) => void }>();
  private readonly listeners = new Set<(message: RpcMessage) => void>();
  private stderr = "";

  constructor() {
    this.child = spawn(CODEX_BIN, ["app-server", "--listen", "stdio://"], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      env: safeEnvironment()
    }) as ChildProcessWithoutNullStreams;
    createInterface({ input: this.child.stdout }).on("line", (line) => this.handleLine(line));
    this.child.stderr.on("data", (chunk: Buffer) => {
      this.stderr = (this.stderr + chunk.toString("utf8")).slice(-100_000);
    });
    this.child.on("error", (error) => this.failAll(error));
    this.child.on("close", (code) => this.failAll(new Error(`Codex App Server exited with ${code}: ${this.stderr.trim()}`)));
  }

  private write(message: RpcMessage) {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleLine(line: string) {
    let message: RpcMessage;
    try {
      message = JSON.parse(line) as RpcMessage;
    } catch {
      return;
    }
    if (message.id !== undefined && (message.result !== undefined || message.error)) {
      const pending = this.pending.get(message.id);
      if (pending) {
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message || "Codex App Server RPC error"));
        else pending.resolve(message.result);
      }
      return;
    }
    if (message.id !== undefined && message.method) {
      // This semantic adapter is read-only and never grants tool execution approvals.
      this.write({ id: message.id, result: { decision: "decline" } });
      return;
    }
    for (const listener of this.listeners) listener(message);
  }

  private failAll(error: Error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  request<T>(method: string, params: Record<string, unknown> = {}) {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.write({ id, method, params });
    });
  }

  notify(method: string, params: Record<string, unknown> = {}) {
    this.write({ method, params });
  }

  onNotification(listener: (message: RpcMessage) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close() {
    this.child.kill("SIGTERM");
  }
}

function withTimeout<T>(promise: Promise<T>, signal?: AbortSignal, timeoutMs = 120_000) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(combined.reason instanceof Error ? combined.reason : new Error("Codex App Server cancelled"));
    if (combined.aborted) return abort();
    combined.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => combined.removeEventListener("abort", abort));
  });
}

export async function checkCodexAppServer() {
  const child = spawn(CODEX_BIN, ["app-server", "--help"], {
    stdio: ["pipe", "pipe", "pipe"],
    shell: false,
    env: safeEnvironment()
  }) as ChildProcessWithoutNullStreams;
  child.stdin.end();
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  if (code !== 0) throw new Error("Codex App Server is not available on Primary.");
  return { connected: true, detail: "Codex App Server JSON-RPC is installed on Primary." };
}

export async function runCodexAppServerSemantic(input: {
  prompt: string;
  messages?: unknown;
  state?: unknown;
  signal?: AbortSignal;
  model?: string;
  resumeSessionId?: string;
}): Promise<ProviderSemanticResult> {
  const started = Date.now();
  const client = new CodexAppServerClient();
  let threadId = input.resumeSessionId ?? "";
  let text = "";
  let turnId = "";
  try {
    await withTimeout(client.request("initialize", {
      clientInfo: { name: "prosmet", title: "Просметчик", version: "1.0.0" },
      capabilities: { experimentalApi: true }
    }), input.signal, 15_000);
    client.notify("initialized");

    const threadResponse = input.resumeSessionId
      ? await withTimeout<Record<string, unknown>>(client.request("thread/resume", { threadId: input.resumeSessionId }), input.signal, 30_000)
      : await withTimeout<Record<string, unknown>>(client.request("thread/start", {
          cwd: process.env.PROSMET_CODEX_WORKSPACE || process.cwd(),
          approvalPolicy: "never",
          sandbox: "readOnly",
          ephemeral: false,
          ...(input.model ? { model: input.model } : {})
        }), input.signal, 30_000);
    const thread = threadResponse.thread && typeof threadResponse.thread === "object"
      ? (threadResponse.thread as Record<string, unknown>)
      : threadResponse;
    threadId = typeof thread.id === "string" ? thread.id : threadId;
    if (!threadId) throw new Error("Codex App Server did not return a thread id.");

    const completed = new Promise<void>((resolve, reject) => {
      const unsubscribe = client.onNotification((message) => {
        const params = message.params ?? {};
        if (message.method === "item/agentMessage/delta" && typeof params.delta === "string") {
          text += params.delta;
        }
        if (message.method === "item/completed" && params.item && typeof params.item === "object") {
          const item = params.item as Record<string, unknown>;
          if (item.type === "agentMessage") {
            const complete = textFromItem(item);
            if (complete) text = complete;
          }
        }
        if (message.method === "turn/completed") {
          const turn = params.turn && typeof params.turn === "object" ? (params.turn as Record<string, unknown>) : {};
          if (turnId && typeof turn.id === "string" && turn.id !== turnId) return;
          unsubscribe();
          if (turn.status === "failed") {
            const error = turn.error && typeof turn.error === "object" ? (turn.error as Record<string, unknown>) : {};
            reject(new Error(typeof error.message === "string" ? error.message : "Codex turn failed"));
          } else resolve();
        }
      });
    });

    const semanticPrompt = `${providerSystemPrompt()}\n\n${providerUserPrompt(input)}`;
    const turnResponse = await withTimeout<Record<string, unknown>>(client.request("turn/start", {
      threadId,
      input: [{ type: "text", text: semanticPrompt }],
      approvalPolicy: "never",
      sandboxPolicy: { type: "readOnly" },
      ...(input.model ? { model: input.model } : {})
    }), input.signal, 30_000);
    const turn = turnResponse.turn && typeof turnResponse.turn === "object"
      ? (turnResponse.turn as Record<string, unknown>)
      : turnResponse;
    turnId = typeof turn.id === "string" ? turn.id : "";
    await withTimeout(completed, input.signal, Number(process.env.PROSMET_PROVIDER_TIMEOUT_MS) || 120_000);
    if (!text.trim()) throw new Error("Codex App Server completed without an assistant message.");
    return {
      interpretation: parseProviderInterpretation(text),
      sessionId: threadId,
      usage: { durationMs: Date.now() - started }
    };
  } finally {
    client.close();
  }
}
