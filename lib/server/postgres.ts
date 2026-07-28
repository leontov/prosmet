import "server-only";

import { Pool, type PoolClient } from "pg";

const connectionString = process.env.DATABASE_URL?.trim();

const globalForPostgres = globalThis as typeof globalThis & {
  prosmetPool?: Pool;
  prosmetSchema?: Promise<void>;
};

export function postgresConfigured() {
  return Boolean(connectionString);
}

export function getPostgresPool() {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }
  globalForPostgres.prosmetPool ??= new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "prosmet"
  });
  return globalForPostgres.prosmetPool;
}

export async function ensureServerSchema() {
  if (!connectionString) return;
  globalForPostgres.prosmetSchema ??= getPostgresPool()
    .query(`
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
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (tenant_id, run_id),
        FOREIGN KEY (tenant_id) REFERENCES prosmet_tenants(id) ON DELETE CASCADE
      );
    `)
    .then(() => undefined)
    .catch((error) => {
      globalForPostgres.prosmetSchema = undefined;
      throw error;
    });
  await globalForPostgres.prosmetSchema;
}

export async function withServerTransaction<T>(
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  await ensureServerSchema();
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const value = await operation(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function checkServerDatabase() {
  if (!connectionString) {
    return {
      configured: false,
      connected: false,
      latencyMs: null,
      message: "DATABASE_URL is not configured"
    };
  }
  const started = Date.now();
  try {
    await ensureServerSchema();
    await getPostgresPool().query("SELECT 1");
    return {
      configured: true,
      connected: true,
      latencyMs: Date.now() - started,
      message: null
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      latencyMs: Date.now() - started,
      message: error instanceof Error ? error.message : "PostgreSQL connection failed"
    };
  }
}
