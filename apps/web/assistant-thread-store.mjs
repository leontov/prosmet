import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const defaultDatabasePath = join(
  process.env.PROSMET_CONFIG_DIR || join(homedir(), ".prosmet-greenfield", "config"),
  "prosmet.sqlite"
);

function nowIso() {
  return new Date().toISOString();
}

function normalizeOwnerId(value) {
  const ownerId = String(value || "").trim();
  if (!ownerId || ownerId.length > 320) throw new Error("Invalid thread owner");
  return ownerId;
}

function normalizeText(value, max = 4096) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeStatus(value) {
  return value === "archived" ? "archived" : "regular";
}

export function createAssistantThreadStore(databasePath = process.env.PROSMET_DATABASE_PATH || defaultDatabasePath) {
  mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS assistant_threads (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('regular', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_assistant_threads_owner_updated
      ON assistant_threads(owner_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS assistant_thread_messages (
      row_id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      parent_id TEXT,
      format TEXT NOT NULL,
      content_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(thread_id, message_id),
      FOREIGN KEY(thread_id) REFERENCES assistant_threads(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_assistant_thread_messages_thread_created
      ON assistant_thread_messages(thread_id, created_at ASC, row_id ASC);
  `);

  const selectThread = db.prepare(`
    SELECT id, owner_id, title, status, created_at, updated_at
      FROM assistant_threads
     WHERE id = ? AND owner_id = ?
  `);
  const selectThreads = db.prepare(`
    SELECT id, owner_id, title, status, created_at, updated_at
      FROM assistant_threads
     WHERE owner_id = ?
     ORDER BY updated_at DESC, created_at DESC
  `);
  const selectMessages = db.prepare(`
    SELECT message_id, parent_id, format, content_json, created_at
      FROM assistant_thread_messages
     WHERE thread_id = ? AND owner_id = ?
     ORDER BY created_at ASC, row_id ASC
  `);
  const insertThread = db.prepare(`
    INSERT INTO assistant_threads (id, owner_id, title, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const updateThread = db.prepare(`
    UPDATE assistant_threads
       SET title = ?, status = ?, updated_at = ?
     WHERE id = ? AND owner_id = ?
  `);
  const insertMessage = db.prepare(`
    INSERT INTO assistant_thread_messages
      (thread_id, owner_id, message_id, parent_id, format, content_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(thread_id, message_id) DO UPDATE SET
      parent_id = excluded.parent_id,
      format = excluded.format,
      content_json = excluded.content_json
  `);
  const deleteThread = db.prepare("DELETE FROM assistant_threads WHERE id = ? AND owner_id = ?");

  function getThread(id, ownerId) {
    const owner = normalizeOwnerId(ownerId);
    const row = selectThread.get(String(id), owner);
    if (!row) return null;
    return {
      id: String(row.id),
      ownerId: String(row.owner_id),
      title: String(row.title),
      status: normalizeStatus(row.status),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  function listThreads(ownerId) {
    const owner = normalizeOwnerId(ownerId);
    return selectThreads.all(owner).map((row) => ({
      id: String(row.id),
      ownerId: String(row.owner_id),
      title: String(row.title),
      status: normalizeStatus(row.status),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    }));
  }

  function initialize(id, ownerId, title = "Новый чат") {
    const owner = normalizeOwnerId(ownerId);
    const threadId = normalizeText(id, 160) || crypto.randomUUID();
    const existing = getThread(threadId, owner);
    if (existing) return existing;
    const now = nowIso();
    insertThread.run(threadId, owner, normalizeText(title, 160) || "Новый чат", "regular", now, now);
    return getThread(threadId, owner);
  }

  function rename(id, ownerId, title) {
    const owner = normalizeOwnerId(ownerId);
    const thread = getThread(id, owner);
    if (!thread) return null;
    const now = nowIso();
    updateThread.run(normalizeText(title, 160) || "Новый чат", thread.status, now, thread.id, owner);
    return getThread(id, owner);
  }

  function setStatus(id, ownerId, status) {
    const owner = normalizeOwnerId(ownerId);
    const thread = getThread(id, owner);
    if (!thread) return null;
    const now = nowIso();
    updateThread.run(thread.title, normalizeStatus(status), now, thread.id, owner);
    return getThread(id, owner);
  }

  function appendMessage(id, ownerId, message) {
    const owner = normalizeOwnerId(ownerId);
    const thread = getThread(id, owner) || initialize(id, owner);
    if (!thread) throw new Error("Unable to initialize assistant thread");
    const messageId = normalizeText(message?.id, 320);
    if (!messageId) throw new Error("Thread message id is required");
    const format = normalizeText(message?.format, 120) || "json";
    const parentId = message?.parent_id == null ? null : normalizeText(message.parent_id, 320) || null;
    const contentJson = JSON.stringify(message?.content ?? null);
    const createdAt = nowIso();
    const nextTitle = thread.title === "Новый чат" && typeof message?.title === "string"
      ? normalizeText(message.title, 160) || thread.title
      : thread.title;
    db.exec("BEGIN IMMEDIATE");
    try {
      insertMessage.run(thread.id, owner, messageId, parentId, format, contentJson, createdAt);
      updateThread.run(nextTitle, thread.status, createdAt, thread.id, owner);
      db.exec("COMMIT");
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch {}
      throw error;
    }
    return getThread(id, owner);
  }

  function messages(id, ownerId) {
    const owner = normalizeOwnerId(ownerId);
    if (!getThread(id, owner)) return null;
    return selectMessages.all(id, owner).map((row) => ({
      id: String(row.message_id),
      parent_id: row.parent_id == null ? null : String(row.parent_id),
      format: String(row.format),
      content: JSON.parse(String(row.content_json))
    }));
  }

  function remove(id, ownerId) {
    const owner = normalizeOwnerId(ownerId);
    return Number(deleteThread.run(String(id), owner).changes) > 0;
  }

  function close() {
    db.close();
  }

  return { databasePath, getThread, listThreads, initialize, rename, setStatus, appendMessage, messages, remove, close };
}
