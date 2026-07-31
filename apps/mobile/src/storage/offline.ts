import * as SQLite from "expo-sqlite";

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function database() {
  databasePromise ??= SQLite.openDatabaseAsync("prosmet-native-v1.db").then(async (db) => {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS estimate_drafts (
        id TEXT PRIMARY KEY NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `);
    return db;
  });
  return databasePromise;
}

export async function saveEstimateDraft(id: string, payload: unknown, status = "draft") {
  const db = await database();
  await db.runAsync(
    `INSERT INTO estimate_drafts (id, payload_json, status, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, status = excluded.status, updated_at = excluded.updated_at`,
    id, JSON.stringify(payload), status, new Date().toISOString()
  );
}

export async function enqueue(kind: string, payload: unknown) {
  const db = await database();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await db.runAsync(
    `INSERT INTO outbox (id, kind, payload_json, created_at) VALUES (?, ?, ?, ?)`,
    id, kind, JSON.stringify(payload), new Date().toISOString()
  );
  return id;
}

export async function pendingOutbox() {
  const db = await database();
  return db.getAllAsync<{ id: string; kind: string; payload_json: string; attempts: number }>(
    `SELECT id, kind, payload_json, attempts FROM outbox ORDER BY created_at`
  );
}
