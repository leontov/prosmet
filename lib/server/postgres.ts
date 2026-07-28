import "server-only";

import { Pool, type PoolClient } from "pg";

export type ServerDatabaseDriver = "postgres";

export type ServerQueryResult<Row extends object = Record<string, unknown>> = {
  rows: Row[];
  rowCount: number;
};

export interface ServerSqlClient {
  query<Row extends object = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[]
  ): Promise<ServerQueryResult<Row>>;
}

const connectionString = process.env.DATABASE_URL?.trim();

const globalForDatabase = globalThis as typeof globalThis & {
  prosmetPool?: Pool;
  prosmetSchema?: Promise<void>;
};

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS prosmet_tenants (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS prosmet_sync_operations (
    cursor BIGSERIAL PRIMARY KEY,
    operation_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
    payload_json JSONB,
    client_created_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, operation_id),
    FOREIGN KEY (tenant_id) REFERENCES prosmet_tenants(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_prosmet_sync_tenant_cursor
    ON prosmet_sync_operations(tenant_id, cursor ASC);

  CREATE TABLE IF NOT EXISTS prosmet_threads (
    tenant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    title TEXT,
    object_name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    pinned BOOLEAN NOT NULL DEFAULT FALSE,
    payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id) REFERENCES prosmet_tenants(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS prosmet_messages (
    tenant_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    id TEXT NOT NULL,
    payload_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id) REFERENCES prosmet_tenants(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_prosmet_messages_thread
    ON prosmet_messages(tenant_id, thread_id, created_at ASC);

  CREATE TABLE IF NOT EXISTS prosmet_estimates (
    tenant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    thread_id TEXT,
    revision INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'draft',
    payload_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id) REFERENCES prosmet_tenants(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS prosmet_estimate_revisions (
    tenant_id TEXT NOT NULL,
    estimate_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    payload_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, estimate_id, revision),
    FOREIGN KEY (tenant_id) REFERENCES prosmet_tenants(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS prosmet_documents (
    tenant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    thread_id TEXT,
    revision INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'draft',
    payload_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id) REFERENCES prosmet_tenants(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS prosmet_document_revisions (
    tenant_id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    payload_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, document_id, revision),
    FOREIGN KEY (tenant_id) REFERENCES prosmet_tenants(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS prosmet_prices (
    tenant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    payload_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id) REFERENCES prosmet_tenants(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS prosmet_files (
    tenant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    thread_id TEXT,
    payload_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id) REFERENCES prosmet_tenants(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS prosmet_agent_runs (
    tenant_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    thread_id TEXT,
    provider TEXT NOT NULL,
    model TEXT,
    status TEXT NOT NULL,
    request_json JSONB,
    result_json JSONB,
    error_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, run_id),
    FOREIGN KEY (tenant_id) REFERENCES prosmet_tenants(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS prosmet_workspace_profiles (
    tenant_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT '',
    legal_form TEXT NOT NULL DEFAULT 'organization',
    organization_name TEXT NOT NULL DEFAULT '',
    region TEXT NOT NULL DEFAULT '',
    profile_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES prosmet_tenants(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS prosmet_workspace_settings (
    tenant_id TEXT PRIMARY KEY,
    region TEXT NOT NULL DEFAULT '',
    method TEXT NOT NULL DEFAULT 'commercial',
    currency TEXT NOT NULL DEFAULT 'RUB',
    vat_percent NUMERIC(7,3) NOT NULL DEFAULT 0,
    auto_sync BOOLEAN NOT NULL DEFAULT TRUE,
    settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES prosmet_tenants(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS prosmet_provider_connections (
    tenant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    base_url TEXT,
    model TEXT,
    status TEXT NOT NULL DEFAULT 'disconnected',
    selected BOOLEAN NOT NULL DEFAULT FALSE,
    secret_ciphertext TEXT,
    secret_iv TEXT,
    secret_tag TEXT,
    last_error TEXT,
    last_checked_at TIMESTAMPTZ,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id) REFERENCES prosmet_tenants(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_prosmet_provider_connections_selected
    ON prosmet_provider_connections(tenant_id, selected DESC, updated_at DESC);

  CREATE TABLE IF NOT EXISTS prosmet_audit_log (
    id BIGSERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES prosmet_tenants(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_prosmet_audit_tenant_created
    ON prosmet_audit_log(tenant_id, created_at DESC);

  ALTER TABLE prosmet_agent_runs
    ADD COLUMN IF NOT EXISTS error_text TEXT;
`;

export function serverDatabaseDriver(): ServerDatabaseDriver | null {
  return connectionString ? "postgres" : null;
}

export function postgresConfigured() {
  return Boolean(connectionString);
}

function getNetworkPool() {
  if (!connectionString) throw new Error("DATABASE_URL is not configured");
  globalForDatabase.prosmetPool ??= new Pool({
    connectionString,
    max: 12,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "prosmet"
  });
  return globalForDatabase.prosmetPool;
}

function networkClient(client: Pool | PoolClient): ServerSqlClient {
  return {
    async query<Row extends object>(sql: string, params: readonly unknown[] = []) {
      const result = await client.query<Row>(sql, [...params]);
      return {
        rows: result.rows,
        rowCount: result.rowCount ?? 0
      };
    }
  };
}

export async function getServerDatabase(): Promise<ServerSqlClient> {
  return networkClient(getNetworkPool());
}

export async function ensureServerSchema() {
  if (!connectionString) return;
  globalForDatabase.prosmetSchema ??= getNetworkPool()
    .query(SCHEMA_SQL)
    .then(() => undefined)
    .catch((error) => {
      globalForDatabase.prosmetSchema = undefined;
      throw error;
    });
  await globalForDatabase.prosmetSchema;
}

export async function ensureTenant(tenantId: string) {
  if (!postgresConfigured()) return;
  await ensureServerSchema();
  await (await getServerDatabase()).query(
    `INSERT INTO prosmet_tenants (id) VALUES ($1)
     ON CONFLICT (id) DO UPDATE SET updated_at = NOW()`,
    [tenantId]
  );
}

export async function withServerTransaction<T>(
  operation: (client: ServerSqlClient) => Promise<T>
): Promise<T> {
  await ensureServerSchema();
  const client = await getNetworkPool().connect();
  try {
    await client.query("BEGIN");
    const value = await operation(networkClient(client));
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function writeAuditEvent(input: {
  tenantId: string;
  actorId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: unknown;
}) {
  if (!postgresConfigured()) return;
  await ensureTenant(input.tenantId);
  await (await getServerDatabase()).query(
    `INSERT INTO prosmet_audit_log
      (tenant_id, actor_id, action, entity_type, entity_id, details_json)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      input.tenantId,
      input.actorId ?? input.tenantId,
      input.action,
      input.entityType,
      input.entityId ?? null,
      JSON.stringify(input.details ?? {})
    ]
  );
}

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
  if (!connectionString) {
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
