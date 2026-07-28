import "server-only";

import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Pool, type PoolClient } from "pg";

export type ServerDatabaseDriver = "postgres" | "pglite";

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
const requestedDriver = process.env.PROSMET_DATABASE_DRIVER?.trim().toLowerCase();
const configuredPgliteDir = process.env.PROSMET_PGLITE_DIR?.trim();

const globalForDatabase = globalThis as typeof globalThis & {
  prosmetPool?: Pool;
  prosmetPglite?: Promise<PGlite>;
  prosmetSchema?: Promise<void>;
  prosmetSchemaDriver?: ServerDatabaseDriver;
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

  ALTER TABLE prosmet_agent_runs
    ADD COLUMN IF NOT EXISTS error_text TEXT;
`;

function resolveDriver(): ServerDatabaseDriver | null {
  if (requestedDriver === "pglite") return "pglite";
  if (requestedDriver === "postgres") return connectionString ? "postgres" : null;
  if (connectionString?.startsWith("pglite:")) return "pglite";
  if (connectionString) return "postgres";
  if (configuredPgliteDir) return "pglite";
  if (process.env.NODE_ENV !== "production") return "pglite";
  return null;
}

export function serverDatabaseDriver() {
  return resolveDriver();
}

export function postgresConfigured() {
  return resolveDriver() !== null;
}

function getNetworkPool() {
  if (!connectionString || resolveDriver() !== "postgres") {
    throw new Error("Network PostgreSQL is not configured");
  }
  globalForDatabase.prosmetPool ??= new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "prosmet"
  });
  return globalForDatabase.prosmetPool;
}

async function getEmbeddedPostgres() {
  if (resolveDriver() !== "pglite") {
    throw new Error("Embedded PostgreSQL is not configured");
  }
  globalForDatabase.prosmetPglite ??= (async () => {
    const dataDir =
      configuredPgliteDir ||
      (connectionString?.startsWith("pglite:")
        ? connectionString.slice("pglite:".length)
        : ".prosmet-server-pg");
    const absoluteDir = resolve(dataDir || ".prosmet-server-pg");
    await mkdir(dirname(absoluteDir), { recursive: true });
    return PGlite.create(absoluteDir);
  })().catch((error) => {
    globalForDatabase.prosmetPglite = undefined;
    throw error;
  });
  return globalForDatabase.prosmetPglite;
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

function embeddedClient(client: Pick<PGlite, "query">): ServerSqlClient {
  return {
    async query<Row extends object>(sql: string, params: readonly unknown[] = []) {
      const result = await client.query<Row>(sql, [...params]);
      return {
        rows: result.rows,
        rowCount: result.affectedRows ?? 0
      };
    }
  };
}

export async function getServerDatabase(): Promise<ServerSqlClient> {
  const driver = resolveDriver();
  if (driver === "postgres") return networkClient(getNetworkPool());
  if (driver === "pglite") return embeddedClient(await getEmbeddedPostgres());
  throw new Error("Server database is not configured");
}

export async function ensureServerSchema() {
  const driver = resolveDriver();
  if (!driver) return;

  if (
    globalForDatabase.prosmetSchema &&
    globalForDatabase.prosmetSchemaDriver === driver
  ) {
    return globalForDatabase.prosmetSchema;
  }

  globalForDatabase.prosmetSchemaDriver = driver;
  globalForDatabase.prosmetSchema = (async () => {
    if (driver === "postgres") {
      await getNetworkPool().query(SCHEMA_SQL);
    } else {
      await (await getEmbeddedPostgres()).exec(SCHEMA_SQL);
    }
  })().catch((error) => {
    globalForDatabase.prosmetSchema = undefined;
    globalForDatabase.prosmetSchemaDriver = undefined;
    throw error;
  });

  await globalForDatabase.prosmetSchema;
}

export async function withServerTransaction<T>(
  operation: (client: ServerSqlClient) => Promise<T>
): Promise<T> {
  await ensureServerSchema();
  const driver = resolveDriver();

  if (driver === "postgres") {
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

  if (driver === "pglite") {
    const database = await getEmbeddedPostgres();
    return database.transaction(async (transaction) =>
      operation(embeddedClient(transaction))
    );
  }

  throw new Error("Server database is not configured");
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
  await ensureServerSchema();
  const database = await getServerDatabase();
  await database.query(
    `INSERT INTO prosmet_tenants (id) VALUES ($1)
     ON CONFLICT (id) DO UPDATE SET updated_at = NOW()`,
    [input.tenantId]
  );
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
  const driver = resolveDriver();
  if (!driver) {
    return {
      configured: false,
      connected: false,
      driver: null,
      latencyMs: null,
      message: "Server database is not configured"
    };
  }

  const started = Date.now();
  try {
    await ensureServerSchema();
    await (await getServerDatabase()).query("SELECT 1");
    return {
      configured: true,
      connected: true,
      driver,
      latencyMs: Date.now() - started,
      message: null
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      driver,
      latencyMs: Date.now() - started,
      message: error instanceof Error ? error.message : "PostgreSQL connection failed"
    };
  }
}
