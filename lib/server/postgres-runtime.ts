import "server-only";

import {
  ensureServerSchema,
  ensureTenant,
  getServerDatabase,
  postgresConfigured
} from "./postgres";

export async function beginAgentRun(input: {
  tenantId: string;
  runId: string;
  threadId: string;
  provider: string;
  model?: string;
  request: unknown;
}) {
  if (!postgresConfigured()) return;
  await ensureTenant(input.tenantId);
  const database = await getServerDatabase();
  await database.query(
    `INSERT INTO prosmet_agent_runs
      (tenant_id, run_id, thread_id, provider, model, status, request_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'running', $6::jsonb, NOW(), NOW())
     ON CONFLICT (tenant_id, run_id) DO UPDATE SET
       thread_id = EXCLUDED.thread_id,
       provider = EXCLUDED.provider,
       model = EXCLUDED.model,
       status = 'running',
       request_json = EXCLUDED.request_json,
       result_json = NULL,
       error_text = NULL,
       updated_at = NOW()`,
    [
      input.tenantId,
      input.runId,
      input.threadId,
      input.provider,
      input.model ?? null,
      JSON.stringify(input.request ?? null)
    ]
  );
}

export async function finishAgentRun(input: {
  tenantId: string;
  runId: string;
  status: "completed" | "cancelled" | "failed";
  result?: unknown;
  error?: string;
}) {
  if (!postgresConfigured()) return;
  await ensureServerSchema();
  await (await getServerDatabase()).query(
    `UPDATE prosmet_agent_runs SET
       status = $3,
       result_json = $4::jsonb,
       error_text = $5,
       updated_at = NOW()
     WHERE tenant_id = $1 AND run_id = $2`,
    [
      input.tenantId,
      input.runId,
      input.status,
      JSON.stringify(input.result ?? null),
      input.error ?? null
    ]
  );
}

export async function checkServerDatabase() {
  if (!postgresConfigured()) {
    return {
      configured: false,
      connected: false,
      driver: null,
      latencyMs: null,
      message: "DATABASE_URL is not configured"
    };
  }

  const started = Date.now();
  try {
    await ensureServerSchema();
    await (await getServerDatabase()).query("SELECT 1");
    return {
      configured: true,
      connected: true,
      driver: "postgres" as const,
      latencyMs: Date.now() - started,
      message: null
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      driver: "postgres" as const,
      latencyMs: Date.now() - started,
      message: error instanceof Error ? error.message : "PostgreSQL connection failed"
    };
  }
}
