"use client";

import type { EstimateDraft } from "@/lib/domain/types";

interface SqliteRow {
  json: string;
}

interface SqliteExecOptions {
  sql: string;
  bind?: readonly unknown[];
  rowMode?: "object";
  callback?: (row: SqliteRow) => void;
}

interface SqliteDatabase {
  exec(input: string | SqliteExecOptions): void;
  close(): void;
}

interface SqliteModule {
  oo1: {
    DB: new (filename: string, flags?: string) => SqliteDatabase;
  };
  capi: {
    sqlite3_js_db_export(database: SqliteDatabase): Uint8Array;
  };
}

/**
 * SQLite-WASM projection used for deterministic local querying.
 * IndexedDB remains the durable store for revisions/outbox in this slice;
 * the exported SQLite file is persisted in the `sqlite` object store by the sync layer.
 */
export class SqliteEstimateMirror {
  private db: SqliteDatabase | null = null;
  private sqlite: SqliteModule | null = null;

  async initialize() {
    if (this.db) return;
    const { default: sqlite3InitModule } = await import("@sqlite.org/sqlite-wasm");
    const sqlite = (await sqlite3InitModule()) as unknown as SqliteModule;
    const db = new sqlite.oo1.DB(":memory:", "ct");
    db.exec(`
      CREATE TABLE IF NOT EXISTS estimate_revisions (
        estimate_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        total REAL NOT NULL,
        json TEXT NOT NULL,
        PRIMARY KEY (estimate_id, revision)
      );
      CREATE INDEX IF NOT EXISTS idx_estimate_revision_updated ON estimate_revisions(updated_at);
    `);
    this.sqlite = sqlite;
    this.db = db;
  }

  async put(estimate: EstimateDraft) {
    await this.initialize();
    const db = this.db;
    if (!db) throw new Error("sqlite_not_initialized");
    db.exec({
      sql: `INSERT OR REPLACE INTO estimate_revisions
        (estimate_id, revision, updated_at, total, json)
        VALUES (?, ?, ?, ?, ?)`,
      bind: [estimate.id, estimate.revision, estimate.updatedAt, estimate.totals.grandTotal, JSON.stringify(estimate)]
    });
  }

  async latest(estimateId: string): Promise<EstimateDraft | null> {
    await this.initialize();
    const db = this.db;
    if (!db) throw new Error("sqlite_not_initialized");
    let result: EstimateDraft | null = null;
    db.exec({
      sql: "SELECT json FROM estimate_revisions WHERE estimate_id = ? ORDER BY revision DESC LIMIT 1",
      bind: [estimateId],
      rowMode: "object",
      callback: (row) => {
        result = JSON.parse(row.json) as EstimateDraft;
      }
    });
    return result;
  }

  async exportBytes(): Promise<Uint8Array> {
    await this.initialize();
    if (!this.sqlite || !this.db) throw new Error("sqlite_not_initialized");
    return this.sqlite.capi.sqlite3_js_db_export(this.db);
  }

  close() {
    this.db?.close();
    this.db = null;
    this.sqlite = null;
  }
}
