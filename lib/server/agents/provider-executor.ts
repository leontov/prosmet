import "server-only";

import { runCodexSemantic } from "@/lib/server/agents/codex-cli";
import { runCodexAppServerSemantic } from "@/lib/server/agents/codex-app-server";
import { runA2ACompatible, runAgUiCompatible } from "@/lib/server/agents/universal-protocols";
import {
  parseProviderInterpretation,
  providerSystemPrompt,
  providerUserPrompt,
  type ProviderSemanticResult,
  type ProviderUsage
} from "@/lib/server/agents/provider-contract";
import {
  getSelectedProviderRuntime,
  type ProviderRuntimeConnection
} from "@/lib/server/services/providers";

const DEFAULT_TIMEOUT_MS = 120_000;

export type PreparedProviderRun = {
  connection: ProviderRuntimeConnection;
  descriptor: {
    id: string;
    kind: ProviderRuntimeConnection["kind"];
    name: string;
    model: string;
  };
};

function timeoutSignal(parent?: AbortSignal) {
  const configured = Number(process.env.PROSMET_PROVIDER_TIMEOUT_MS);
  const milliseconds = Number.isFinite(configured)
    ? Math.max(10_000, Math.min(600_000, configured))
    : DEFAULT_TIMEOUT_MS;
  const timeout = AbortSignal.timeout(milliseconds);
  return parent ? AbortSignal.any([parent, timeout]) : timeout;
}

function boundedText(value: string, limit = 4_000) {
  return value.length > limit ? value.slice(0, limit) : value;
}

function contentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const record = part as Record<string, unknown>;
      if (record.type === "text" && typeof record.text === "string") return [record.text];
      return [];
    })
    .join("\n");
}

function usageFromOpenAi(payload: Record<string, unknown>, durationMs: number): ProviderUsage {
  const usage =
    payload.usage && typeof payload.usage === "object"
      ? (payload.usage as Record<string, unknown>)
      : {};
  const inputTokens = Number(usage.prompt_tokens ?? usage.input_tokens);
  const outputTokens = Number(usage.completion_tokens ?? usage.output_tokens);
  const totalTokens = Number(usage.total_tokens);
  return {
    ...(Number.isFinite(inputTokens) ? { inputTokens } : {}),
    ...(Number.isFinite(outputTokens) ? { outputTokens } : {}),
    ...(Number.isFinite(totalTokens) ? { totalTokens } : {}),
    durationMs
  };
}

async function runOpenAiCompatible(
  connection: ProviderRuntimeConnection,
  input: { prompt: string; messages?: unknown; state?: unknown; signal?: AbortSignal }
): Promise<ProviderSemanticResult> {
  const endpoint = `${connection.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const started = Date.now();
  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json"
  });
  if (connection.apiKey) headers.set("Authorization", `Bearer ${connection.apiKey}`);

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    cache: "no-store",
    signal: timeoutSignal(input.signal),
    body: JSON.stringify({
      model: connection.model,
      temperature: 0.1,
      max_tokens: 2_500,
      messages: [
        { role: "system", content: providerSystemPrompt() },
        { role: "user", content: providerUserPrompt(input) }
      ]
    })
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(
      `${connection.name} ответил ${response.status}: ${boundedText(raw) || "пустой ответ"}`
    );
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`${connection.name} вернул некорректный JSON HTTP-ответ.`);
  }
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const message =
    choices[0] && typeof choices[0] === "object"
      ? (choices[0] as Record<string, unknown>).message
      : null;
  const content =
    message && typeof message === "object"
      ? contentText((message as Record<string, unknown>).content)
      : "";
  return {
    interpretation: parseProviderInterpretation(content),
    usage: usageFromOpenAi(payload, Date.now() - started)
  };
}

async function runOllama(
  connection: ProviderRuntimeConnection,
  input: { prompt: string; messages?: unknown; state?: unknown; signal?: AbortSignal }
): Promise<ProviderSemanticResult> {
  const endpoint = `${connection.baseUrl.replace(/\/$/, "")}/api/chat`;
  const started = Date.now();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    cache: "no-store",
    signal: timeoutSignal(input.signal),
    body: JSON.stringify({
      model: connection.model,
      stream: false,
      format: "json",
      options: { temperature: 0.1 },
      messages: [
        { role: "system", content: providerSystemPrompt() },
        { role: "user", content: providerUserPrompt(input) }
      ]
    })
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Ollama ответил ${response.status}: ${boundedText(raw) || "пустой ответ"}`);
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("Ollama вернул некорректный JSON HTTP-ответ.");
  }
  const message =
    payload.message && typeof payload.message === "object"
      ? (payload.message as Record<string, unknown>)
      : {};
  const inputTokens = Number(payload.prompt_eval_count);
  const outputTokens = Number(payload.eval_count);
  return {
    interpretation: parseProviderInterpretation(contentText(message.content)),
    usage: {
      ...(Number.isFinite(inputTokens) ? { inputTokens } : {}),
      ...(Number.isFinite(outputTokens) ? { outputTokens } : {}),
      ...(Number.isFinite(inputTokens + outputTokens)
        ? { totalTokens: inputTokens + outputTokens }
        : {}),
      durationMs: Date.now() - started
    }
  };
}

export async function prepareProviderRun(tenantId: string): Promise<PreparedProviderRun> {
  const connection = await getSelectedProviderRuntime(tenantId);
  return {
    connection,
    descriptor: {
      id: connection.id,
      kind: connection.kind,
      name: connection.name,
      model: connection.model
    }
  };
}

export async function executePreparedProvider(
  prepared: PreparedProviderRun,
  input: {
    prompt: string;
    messages?: unknown;
    state?: unknown;
    signal?: AbortSignal;
    resumeSessionId?: string;
  }
): Promise<ProviderSemanticResult | null> {
  const { connection } = prepared;
  if (connection.kind === "rules") return null;
  if (connection.kind === "codex-cli") {
    return runCodexSemantic({
      ...input,
      model: connection.model,
      resumeSessionId: input.resumeSessionId
    });
  }
  if (connection.kind === "codex-app-server") {
    return runCodexAppServerSemantic({ ...input, model: connection.model, resumeSessionId: input.resumeSessionId });
  }
  if (connection.kind === "a2a") return runA2ACompatible(connection, input);
  if (connection.kind === "ag-ui") return runAgUiCompatible(connection, input);
  if (connection.kind === "ollama") return runOllama(connection, input);
  return runOpenAiCompatible(connection, input);
}
