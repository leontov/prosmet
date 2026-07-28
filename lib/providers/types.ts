export interface AgentRunRequest {
  threadId: string;
  runId: string;
  prompt: string;
  signal: AbortSignal;
  attachments?: Array<{ id: string; name: string; mimeType: string; url: string }>;
}

export interface AgentProvider {
  readonly id: string;
  health(): Promise<{ ok: boolean; detail?: string }>;
  listModels(): Promise<string[]>;
  startRun(request: AgentRunRequest): AsyncIterable<string>;
  cancelRun(runId: string): Promise<void>;
  resumeRun(runId: string): AsyncIterable<string>;
  attachFiles(files: AgentRunRequest["attachments"]): Promise<void>;
  getUsage(): Promise<{ inputTokens: number; outputTokens: number } | null>;
}
