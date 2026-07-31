import "server-only";

import { randomUUID } from "node:crypto";
import {
  parseProviderInterpretation,
  providerSystemPrompt,
  providerUserPrompt,
  type ProviderSemanticResult
} from "@/lib/server/agents/provider-contract";
import type { ProviderRuntimeConnection } from "@/lib/server/services/providers";

function authHeaders(connection: ProviderRuntimeConnection) {
  const headers = new Headers({ Accept: "application/json", "Content-Type": "application/json" });
  if (connection.apiKey) headers.set("Authorization", `Bearer ${connection.apiKey}`);
  return headers;
}

function timeoutSignal(parent?: AbortSignal) {
  const timeout = AbortSignal.timeout(Number(process.env.PROSMET_PROVIDER_TIMEOUT_MS) || 120_000);
  return parent ? AbortSignal.any([parent, timeout]) : timeout;
}

function collectText(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(collectText);
  const record = value as Record<string, unknown>;
  const direct = [record.text, record.content, record.delta].flatMap(collectText);
  const nested = [record.message, record.parts, record.artifacts, record.status, record.result].flatMap(collectText);
  return [...direct, ...nested];
}

export async function probeUniversalAgent(connection: ProviderRuntimeConnection) {
  if (connection.kind === "a2a") {
    const base = connection.baseUrl.replace(/\/$/, "");
    const response = await fetch(`${base}/.well-known/agent-card.json`, {
      headers: authHeaders(connection), cache: "no-store", signal: AbortSignal.timeout(8_000)
    });
    if (!response.ok) throw new Error(`A2A Agent Card returned ${response.status}.`);
    const card = await response.json() as Record<string, unknown>;
    return { connected: true, detail: `A2A v1 agent connected${typeof card.name === "string" ? ` · ${card.name}` : ""}.` };
  }
  const response = await fetch(connection.baseUrl, {
    method: "OPTIONS", headers: authHeaders(connection), cache: "no-store", signal: AbortSignal.timeout(8_000)
  });
  if (!response.ok && response.status !== 405) throw new Error(`AG-UI endpoint returned ${response.status}.`);
  return { connected: true, detail: "AG-UI streaming endpoint is reachable." };
}

export async function runA2ACompatible(
  connection: ProviderRuntimeConnection,
  input: { prompt: string; messages?: unknown; state?: unknown; signal?: AbortSignal }
): Promise<ProviderSemanticResult> {
  const started = Date.now();
  const response = await fetch(connection.baseUrl, {
    method: "POST",
    headers: authHeaders(connection),
    cache: "no-store",
    signal: timeoutSignal(input.signal),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: randomUUID(),
      method: "message/send",
      params: {
        message: {
          role: "user",
          messageId: randomUUID(),
          parts: [{ kind: "text", text: `${providerSystemPrompt()}\n\n${providerUserPrompt(input)}` }]
        },
        configuration: { acceptedOutputModes: ["text", "application/json"] }
      }
    })
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`A2A agent returned ${response.status}: ${raw.slice(0, 2000)}`);
  const payload = JSON.parse(raw) as Record<string, unknown>;
  if (payload.error) throw new Error(`A2A error: ${JSON.stringify(payload.error).slice(0, 2000)}`);
  const text = collectText(payload.result).filter(Boolean).join("\n");
  if (!text.trim()) throw new Error("A2A agent returned no text artifact.");
  return { interpretation: parseProviderInterpretation(text), usage: { durationMs: Date.now() - started } };
}

export async function runAgUiCompatible(
  connection: ProviderRuntimeConnection,
  input: { prompt: string; messages?: unknown; state?: unknown; signal?: AbortSignal }
): Promise<ProviderSemanticResult> {
  const started = Date.now();
  const response = await fetch(connection.baseUrl, {
    method: "POST",
    headers: new Headers({ ...Object.fromEntries(authHeaders(connection)), Accept: "text/event-stream" }),
    cache: "no-store",
    signal: timeoutSignal(input.signal),
    body: JSON.stringify({
      threadId: randomUUID(),
      runId: randomUUID(),
      messages: [{ id: randomUUID(), role: "user", content: [{ type: "text", text: `${providerSystemPrompt()}\n\n${providerUserPrompt(input)}` }] }],
      tools: [],
      context: {},
      state: input.state ?? {}
    })
  });
  if (!response.ok || !response.body) throw new Error(`AG-UI agent returned ${response.status}.`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      for (const line of frame.split(/\r?\n/)) {
        if (!line.startsWith("data:")) continue;
        const event = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
        if (event.type === "TEXT_MESSAGE_CONTENT") {
          const delta = typeof event.delta === "string" ? event.delta : typeof event.content === "string" ? event.content : "";
          text += delta;
        }
        if (event.type === "RUN_ERROR") throw new Error(typeof event.message === "string" ? event.message : "AG-UI run failed");
      }
    }
  }
  if (!text.trim()) throw new Error("AG-UI agent completed without text content.");
  return { interpretation: parseProviderInterpretation(text), usage: { durationMs: Date.now() - started } };
}
