import "server-only";

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  PROVIDER_INTERPRETATION_JSON_SCHEMA,
  parseProviderInterpretation,
  providerSystemPrompt,
  providerUserPrompt,
  type ProviderSemanticResult
} from "@/lib/server/agents/provider-contract";

const DEFAULT_TIMEOUT_MS = 180_000;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

function codexBinary() {
  return process.env.PROSMET_CODEX_BIN?.trim() || "codex";
}

function codexHome() {
  return process.env.PROSMET_CODEX_HOME?.trim() || join(homedir(), ".codex");
}

function timeoutMs() {
  const configured = Number(process.env.PROSMET_PROVIDER_TIMEOUT_MS);
  return Number.isFinite(configured)
    ? Math.max(10_000, Math.min(600_000, configured))
    : DEFAULT_TIMEOUT_MS;
}

function sanitizedEnvironment() {
  const allowed = [
    "PATH",
    "HOME",
    "LANG",
    "LC_ALL",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR"
  ];
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: "production",
    CODEX_HOME: codexHome(),
    RUST_BACKTRACE: "0",
    NO_COLOR: "1"
  };
  for (const key of allowed) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  return environment;
}

function runProcess(input: {
  args: string[];
  stdin?: string;
  cwd?: string;
  signal?: AbortSignal;
  timeout?: number;
}) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(codexBinary(), input.args, {
      cwd: input.cwd,
      env: sanitizedEnvironment(),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let forcedKill: NodeJS.Timeout | undefined;

    const append = (current: string, chunk: Buffer) => {
      const next = current + chunk.toString("utf8");
      return next.length > MAX_OUTPUT_BYTES ? next.slice(-MAX_OUTPUT_BYTES) : next;
    };
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });

    const terminate = (reason: Error) => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      forcedKill = setTimeout(() => child.kill("SIGKILL"), 3_000);
      forcedKill.unref();
      reject(reason);
    };

    const timer = setTimeout(
      () => terminate(new Error("Codex CLI превысил допустимое время выполнения.")),
      input.timeout ?? timeoutMs()
    );
    timer.unref();

    const abort = () => terminate(new DOMException("Codex run cancelled", "AbortError"));
    if (input.signal?.aborted) abort();
    else input.signal?.addEventListener("abort", abort, { once: true });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (forcedKill) clearTimeout(forcedKill);
      input.signal?.removeEventListener("abort", abort);
      reject(
        error && "code" in error && error.code === "ENOENT"
          ? new Error("Codex CLI не установлен на Primary или PROSMET_CODEX_BIN указан неверно.")
          : error
      );
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (forcedKill) clearTimeout(forcedKill);
      input.signal?.removeEventListener("abort", abort);
      if (code !== 0) {
        reject(
          new Error(
            `Codex CLI завершился с кодом ${code ?? "null"}${signal ? ` (${signal})` : ""}: ${stderr.slice(-2_000) || "нет диагностического сообщения"}`
          )
        );
        return;
      }
      resolve({ stdout, stderr });
    });

    if (input.stdin !== undefined) child.stdin.end(input.stdin);
    else child.stdin.end();
  });
}

export async function checkCodexCli() {
  const version = await runProcess({ args: ["--version"], timeout: 8_000 });
  const login = await runProcess({ args: ["login", "status"], timeout: 8_000 });
  const status = `${login.stdout}\n${login.stderr}`.trim();
  if (!/Logged in using (ChatGPT|an API key|Agent Identity)/i.test(status)) {
    throw new Error(
      `Codex CLI не авторизован на Primary. Выполните server-side вход через ChatGPT/device auth. ${status}`
    );
  }
  return {
    connected: true,
    detail: `${version.stdout || version.stderr}`.trim().slice(0, 200),
    authentication: status.slice(0, 300)
  };
}

function sessionIdFromJsonl(value: string) {
  for (const line of value.split(/\r?\n/)) {
    if (!line.trim().startsWith("{")) continue;
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      for (const key of ["thread_id", "threadId", "session_id", "sessionId"]) {
        if (typeof event[key] === "string" && event[key]) return event[key] as string;
      }
      const thread = event.thread;
      if (thread && typeof thread === "object") {
        const id = (thread as Record<string, unknown>).id;
        if (typeof id === "string" && id) return id;
      }
    } catch {
      // Diagnostic JSONL can contain events irrelevant to the final answer.
    }
  }
  return undefined;
}

export async function runCodexSemantic(input: {
  prompt: string;
  messages?: unknown;
  state?: unknown;
  model?: string;
  signal?: AbortSignal;
  resumeSessionId?: string;
}): Promise<ProviderSemanticResult> {
  const directory = await mkdtemp(join(tmpdir(), "prosmet-codex-"));
  const schemaPath = join(directory, "provider-output-schema.json");
  const outputPath = join(directory, "last-message.json");
  await writeFile(schemaPath, JSON.stringify(PROVIDER_INTERPRETATION_JSON_SCHEMA), "utf8");

  const prompt = [
    providerSystemPrompt(),
    "",
    providerUserPrompt(input)
  ].join("\n");
  const started = Date.now();
  try {
    const args = [
      "exec",
      "--skip-git-repo-check",
      "--ignore-user-config",
      "--ignore-rules",
      "--sandbox",
      "read-only",
      "--json",
      "--output-last-message",
      outputPath
    ];
    if (!input.resumeSessionId) {
      args.push("--output-schema", schemaPath, "--ephemeral");
    } else {
      args.push("resume", input.resumeSessionId);
    }
    if (input.model?.trim()) args.push("--model", input.model.trim());
    args.push("-");

    const processResult = await runProcess({
      args,
      stdin: prompt,
      cwd: directory,
      signal: input.signal
    });
    const lastMessage = await readFile(outputPath, "utf8").catch(() => "");
    const interpretation = parseProviderInterpretation(lastMessage || processResult.stdout);
    return {
      interpretation,
      usage: { durationMs: Date.now() - started },
      sessionId: input.resumeSessionId || sessionIdFromJsonl(processResult.stdout)
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
