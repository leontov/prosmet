import "server-only";
import type { AgentProvider, AgentRunRequest } from "./types";

export class OpenAICompatibleProvider implements AgentProvider {
  readonly id = "openai-compatible";
  constructor(private readonly config: { baseUrl: string; apiKey: string; model: string }) {}
  async health() { const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/models`, { headers: { authorization: `Bearer ${this.config.apiKey}` }, cache: "no-store" }); return { ok: response.ok, detail: response.ok ? undefined : `HTTP ${response.status}` }; }
  async listModels() { const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/models`, { headers: { authorization: `Bearer ${this.config.apiKey}` }, cache: "no-store" }); if (!response.ok) throw new Error(`Provider models failed: ${response.status}`); const body = await response.json() as { data?: Array<{ id: string }> }; return body.data?.map((value) => value.id) ?? []; }
  async *startRun(request: AgentRunRequest) {
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, { method: "POST", headers: { authorization: `Bearer ${this.config.apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ model: this.config.model, stream: true, messages: [{ role: "user", content: request.prompt }] }), signal: request.signal });
    if (!response.ok || !response.body) throw new Error(`Provider run failed: ${response.status}`);
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    while (true) { const { value, done } = await reader.read(); if (done) break; if (value) yield value; }
  }
  async cancelRun() { /* fetch AbortSignal cancellation owns the active request */ }
  async *resumeRun(runId: string) { throw new Error(`Provider does not expose resumable run ${runId}`); }
  async attachFiles() { throw new Error("File adapter is not configured for this provider"); }
  async getUsage() { return null; }
}
