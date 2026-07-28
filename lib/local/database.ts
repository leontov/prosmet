"use client";

import type { Database, SqlJsStatic } from "sql.js";
import { readSqliteFile, requestPersistentStorage, writeSqliteFile } from "@/lib/local/idb";

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  title TEXT,
  object_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_threads_updated ON threads(updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  thread_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  parent_id TEXT,
  ordinal INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(thread_id, message_id),
  FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, ordinal ASC);

CREATE TABLE IF NOT EXISTS estimates (
  id TEXT PRIMARY KEY,
  thread_id TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_estimates_thread ON estimates(thread_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS estimate_revisions (
  estimate_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(estimate_id, revision),
  FOREIGN KEY(estimate_id) REFERENCES estimates(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  thread_id TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS document_revisions (
  document_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(document_id, revision),
  FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS prices (
  id TEXT PRIMARY KEY,
  normalized_name TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL,
  price REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RUB',
  region TEXT NOT NULL DEFAULT '',
  source_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prices_lookup ON prices(normalized_name, unit, updated_at DESC);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  thread_id TEXT,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  blob_data BLOB,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_outbox_created ON outbox(created_at ASC);

CREATE TABLE IF NOT EXISTS sync_state (
  scope TEXT PRIMARY KEY,
  cursor TEXT,
  device_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

PRAGMA user_version = 1;
`;

type SqlValue = string | number | null | Uint8Array;

function sqlJsAssetUrl(file: string) {
  if (file === "sql-wasm-browser.wasm") return "/sql-wasm-browser.wasm";
  if (file.endsWith(".wasm")) return "/sql-wasm.wasm";
  return `/${file}`;
}

export class ProsmetDatabase {
  private tail: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();

  private constructor(private readonly db: Database) {}

  static async open() {
    const module = await import("sql.js");
    const initialize = module.default;
    const SQL: SqlJsStatic = await initialize({ locateFile: sqlJsAssetUrl });
    const bytes = await readSqliteFile();
    const db = bytes ? new SQL.Database(bytes) : new SQL.Database();
    db.run(SCHEMA);
    const instance = new ProsmetDatabase(db);
    await instance.persist();
    void requestPersistentStorage();
    return instance;
  }

  read<T>(sql: string, params: readonly SqlValue[] = []): T[] {
    const statement = this.db.prepare(sql);
    const rows: T[] = [];
    try {
      if (params.length) statement.bind(params);
      while (statement.step()) rows.push(statement.getAsObject() as unknown as T);
      return rows;
    } finally {
      statement.free();
    }
  }

  first<T>(sql: string, params: readonly SqlValue[] = []) {
    return this.read<T>(sql, params)[0] ?? null;
  }

  async write<T>(operation: (db: Database) => T): Promise<T> {
    const pending = this.tail.then(async () => {
      this.db.run("BEGIN IMMEDIATE");
      try {
        const value = operation(this.db);
        this.db.run("COMMIT");
        await this.persist();
        for (const listener of this.listeners) listener();
        return value;
      } catch (error) {
        try {
          this.db.run("ROLLBACK");
        } catch {
          // Keep the original error.
        }
        throw error;
      }
    });
    this.tail = pending.then(() => undefined, () => undefined);
    return pending;
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async flush() {
    await this.tail;
    await this.persist();
  }

  private async persist() {
    await writeSqliteFile(this.db.export());
  }
}

let databasePromise: Promise<ProsmetDatabase> | null = null;

export function getDatabase() {
  databasePromise ??= ProsmetDatabase.open();
  return databasePromise;
}
