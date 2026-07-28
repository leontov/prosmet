"use client";

import type { ExportedMessageRepositoryItem, ThreadMessage } from "@assistant-ui/react";
import type { Database } from "sql.js";
import { EstimateDraftSchema, type EstimateDraft, type PriceSource } from "@/lib/domain/estimate";
import { getDatabase } from "@/lib/local/database";

export type LocalThread = {
  id: string;
  title?: string;
  objectName: string;
  status: "active" | "archived";
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LocalPrice = {
  id: string;
  name: string;
  code: string;
  unit: string;
  price: number;
  currency: string;
  region: string;
  source: PriceSource;
  status: "confirmed" | "draft" | "expired";
  updatedAt: string;
};

export type LocalDocument = {
  id: string;
  threadId?: string;
  type: string;
  title: string;
  status: "draft" | "approved";
  revision: number;
  content: string;
  missingFields: string[];
  updatedAt: string;
};

type SqlValue = string | number | null | Uint8Array;

function now() {
  return new Date().toISOString();
}

function rows<T>(db: Database, sql: string, params: readonly SqlValue[] = []) {
  const statement = db.prepare(sql);
  const output: T[] = [];
  try {
    if (params.length) statement.bind(params);
    while (statement.step()) output.push(statement.getAsObject() as unknown as T);
    return output;
  } finally {
    statement.free();
  }
}

function first<T>(db: Database, sql: string, params: readonly SqlValue[] = []) {
  return rows<T>(db, sql, params)[0] ?? null;
}

function normal(value: string) {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function messageText(message: ThreadMessage) {
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const item = part as Record<string, unknown>;
      return item.type === "text" && typeof item.text === "string" ? [item.text] : [];
    })
    .join(" ")
    .trim();
}

function serializeMessage(message: ThreadMessage) {
  return JSON.stringify({
    ...message,
    createdAt:
      message.createdAt instanceof Date ? message.createdAt.toISOString() : message.createdAt
  });
}

function reviveMessage(value: string): ThreadMessage {
  const message = JSON.parse(value) as Record<string, unknown>;
  return {
    ...message,
    createdAt:
      typeof message.createdAt === "string" ? new Date(message.createdAt) : new Date()
  } as ThreadMessage;
}

function enqueue(
  db: Database,
  entityType: string,
  entityId: string,
  operation: "upsert" | "delete",
  payload: unknown
) {
  db.run(
    `INSERT INTO outbox
      (id, entity_type, entity_id, operation, payload_json, attempts, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [crypto.randomUUID(), entityType, entityId, operation, JSON.stringify(payload), now()]
  );
}

export class ProsmetRepository {
  async listThreads() {
    const db = await getDatabase();
    return db.read<{
      id: string;
      title: string | null;
      objectName: string;
      status: LocalThread["status"];
      pinned: number;
      createdAt: string;
      updatedAt: string;
    }>(
      `SELECT id, title, object_name AS objectName, status, pinned,
              created_at AS createdAt, updated_at AS updatedAt
       FROM threads
       ORDER BY pinned DESC, updated_at DESC`
    ).map((row) => ({
      ...row,
      title: row.title ?? undefined,
      pinned: Boolean(row.pinned)
    }));
  }

  async ensureThread(id: string) {
    const db = await getDatabase();
    const timestamp = now();
    return db.write((sqlite) => {
      sqlite.run(
        `INSERT OR IGNORE INTO threads
          (id, title, object_name, status, pinned, created_at, updated_at)
         VALUES (?, NULL, '', 'active', 0, ?, ?)`,
        [id, timestamp, timestamp]
      );
      return first<LocalThread>(
        sqlite,
        `SELECT id, title, object_name AS objectName, status,
                pinned, created_at AS createdAt, updated_at AS updatedAt
         FROM threads WHERE id = ?`,
        [id]
      );
    });
  }

  async getThread(id: string) {
    const db = await getDatabase();
    const row = db.first<{
      id: string;
      title: string | null;
      objectName: string;
      status: LocalThread["status"];
      pinned: number;
      createdAt: string;
      updatedAt: string;
    }>(
      `SELECT id, title, object_name AS objectName, status, pinned,
              created_at AS createdAt, updated_at AS updatedAt
       FROM threads WHERE id = ?`,
      [id]
    );
    return row ? { ...row, title: row.title ?? undefined, pinned: Boolean(row.pinned) } : null;
  }

  async renameThread(id: string, title: string) {
    const db = await getDatabase();
    const clean = title.replace(/\s+/g, " ").trim().slice(0, 120);
    await db.write((sqlite) => {
      sqlite.run("UPDATE threads SET title = ?, updated_at = ? WHERE id = ?", [
        clean || null,
        now(),
        id
      ]);
      enqueue(sqlite, "thread", id, "upsert", { title: clean });
    });
  }

  async updateThread(id: string, patch: Partial<Pick<LocalThread, "objectName" | "status" | "pinned">>) {
    const db = await getDatabase();
    await db.write((sqlite) => {
      const current = first<{
        objectName: string;
        status: LocalThread["status"];
        pinned: number;
      }>(
        sqlite,
        "SELECT object_name AS objectName, status, pinned FROM threads WHERE id = ?",
        [id]
      );
      if (!current) return;
      const next = {
        objectName: patch.objectName ?? current.objectName,
        status: patch.status ?? current.status,
        pinned: patch.pinned ?? Boolean(current.pinned)
      };
      sqlite.run(
        `UPDATE threads SET object_name = ?, status = ?, pinned = ?, updated_at = ? WHERE id = ?`,
        [next.objectName, next.status, next.pinned ? 1 : 0, now(), id]
      );
      enqueue(sqlite, "thread", id, "upsert", next);
    });
  }

  async deleteThread(id: string) {
    const db = await getDatabase();
    await db.write((sqlite) => {
      sqlite.run("DELETE FROM messages WHERE thread_id = ?", [id]);
      sqlite.run("UPDATE estimates SET thread_id = NULL WHERE thread_id = ?", [id]);
      sqlite.run("UPDATE documents SET thread_id = NULL WHERE thread_id = ?", [id]);
      sqlite.run("UPDATE files SET thread_id = NULL WHERE thread_id = ?", [id]);
      sqlite.run("DELETE FROM threads WHERE id = ?", [id]);
      enqueue(sqlite, "thread", id, "delete", null);
    });
  }

  async appendMessage(threadId: string, item: ExportedMessageRepositoryItem) {
    const db = await getDatabase();
    const timestamp = now();
    await db.write((sqlite) => {
      sqlite.run(
        `INSERT OR IGNORE INTO threads
          (id, title, object_name, status, pinned, created_at, updated_at)
         VALUES (?, NULL, '', 'active', 0, ?, ?)`,
        [threadId, timestamp, timestamp]
      );
      const existing = first<{ ordinal: number }>(
        sqlite,
        "SELECT ordinal FROM messages WHERE thread_id = ? AND message_id = ?",
        [threadId, item.message.id]
      );
      const ordinal =
        existing?.ordinal ??
        (first<{ value: number }>(
          sqlite,
          "SELECT COALESCE(MAX(ordinal), 0) + 1 AS value FROM messages WHERE thread_id = ?",
          [threadId]
        )?.value ?? 1);
      sqlite.run(
        `INSERT INTO messages
          (thread_id, message_id, parent_id, ordinal, payload_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(thread_id, message_id) DO UPDATE SET
           parent_id = excluded.parent_id,
           payload_json = excluded.payload_json,
           updated_at = excluded.updated_at`,
        [
          threadId,
          item.message.id,
          item.parentId,
          ordinal,
          serializeMessage(item.message),
          timestamp,
          timestamp
        ]
      );
      const title = item.message.role === "user" ? messageText(item.message).slice(0, 72) : "";
      sqlite.run(
        `UPDATE threads SET
          title = CASE WHEN (title IS NULL OR title = '') AND ? <> '' THEN ? ELSE title END,
          updated_at = ?
         WHERE id = ?`,
        [title, title, timestamp, threadId]
      );
      enqueue(sqlite, "message", item.message.id, "upsert", {
        threadId,
        parentId: item.parentId,
        message: item.message
      });
    });
  }

  async loadMessages(threadId: string) {
    const db = await getDatabase();
    const messages = db.read<{ parentId: string | null; payloadJson: string }>(
      `SELECT parent_id AS parentId, payload_json AS payloadJson
       FROM messages WHERE thread_id = ? ORDER BY ordinal ASC`,
      [threadId]
    ).map((row) => ({ parentId: row.parentId, message: reviveMessage(row.payloadJson) }));
    return { headId: messages.at(-1)?.message.id ?? null, messages };
  }

  async saveEstimate(threadId: string | undefined, draft: EstimateDraft, snapshot = false) {
    const parsed = EstimateDraftSchema.parse(draft);
    const db = await getDatabase();
    const timestamp = now();
    await db.write((sqlite) => {
      const previous = first<{ revision: number; payloadJson: string }>(
        sqlite,
        "SELECT revision, payload_json AS payloadJson FROM estimates WHERE id = ?",
        [parsed.id]
      );
      if (snapshot && previous) {
        sqlite.run(
          `INSERT OR IGNORE INTO estimate_revisions
            (estimate_id, revision, payload_json, created_at)
           VALUES (?, ?, ?, ?)`,
          [parsed.id, previous.revision, previous.payloadJson, timestamp]
        );
      }
      sqlite.run(
        `INSERT INTO estimates
          (id, thread_id, title, status, revision, payload_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           thread_id = COALESCE(excluded.thread_id, estimates.thread_id),
           title = excluded.title,
           status = excluded.status,
           revision = excluded.revision,
           payload_json = excluded.payload_json,
           updated_at = excluded.updated_at`,
        [
          parsed.id,
          threadId ?? null,
          parsed.title,
          parsed.status,
          parsed.revision,
          JSON.stringify(parsed),
          timestamp,
          timestamp
        ]
      );
      enqueue(sqlite, "estimate", parsed.id, "upsert", parsed);
    });
  }

  async getEstimate(id: string) {
    const db = await getDatabase();
    const row = db.first<{ payloadJson: string }>(
      "SELECT payload_json AS payloadJson FROM estimates WHERE id = ?",
      [id]
    );
    return row ? EstimateDraftSchema.parse(JSON.parse(row.payloadJson)) : null;
  }

  async listEstimates() {
    const db = await getDatabase();
    return db.read<{ payloadJson: string }>(
      "SELECT payload_json AS payloadJson FROM estimates ORDER BY updated_at DESC"
    ).flatMap((row) => {
      try {
        return [EstimateDraftSchema.parse(JSON.parse(row.payloadJson))];
      } catch {
        return [];
      }
    });
  }

  async saveConfirmedPrices(draft: EstimateDraft) {
    const db = await getDatabase();
    const timestamp = now();
    await db.write((sqlite) => {
      for (const section of draft.sections) {
        for (const item of section.items) {
          if (!(item.unitPrice > 0) || !item.name.trim()) continue;
          const id = `estimate:${draft.id}:${item.id}`;
          const source = {
            ...item.source,
            kind: "personal" as const,
            confirmed: true,
            label: item.source.label || `Утверждённая смета «${draft.title}»`
          };
          sqlite.run(
            `INSERT INTO prices
              (id, normalized_name, name, code, unit, price, currency, region,
               source_json, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               normalized_name = excluded.normalized_name,
               name = excluded.name,
               code = excluded.code,
               unit = excluded.unit,
               price = excluded.price,
               currency = excluded.currency,
               region = excluded.region,
               source_json = excluded.source_json,
               status = 'confirmed',
               updated_at = excluded.updated_at`,
            [
              id,
              normal(item.name),
              item.name,
              item.code,
              item.unit,
              item.unitPrice,
              draft.currency,
              draft.region,
              JSON.stringify(source),
              timestamp,
              timestamp
            ]
          );
          enqueue(sqlite, "price", id, "upsert", { ...item, source });
        }
      }
    });
  }

  async findPrice(name: string, unit: string, region = "") {
    const db = await getDatabase();
    const key = normal(name);
    const token = key.split(" ").find((item) => item.length >= 4) ?? key;
    const rows = db.read<{
      id: string;
      name: string;
      code: string;
      unit: string;
      price: number;
      currency: string;
      region: string;
      sourceJson: string;
      status: LocalPrice["status"];
      updatedAt: string;
    }>(
      `SELECT id, name, code, unit, price, currency, region,
              source_json AS sourceJson, status, updated_at AS updatedAt
       FROM prices
       WHERE status = 'confirmed'
         AND unit = ?
         AND (normalized_name = ? OR normalized_name LIKE ?)
       ORDER BY (normalized_name = ?) DESC, (region = ?) DESC, updated_at DESC
       LIMIT 10`,
      [unit, key, `%${token}%`, key, region]
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      unit: row.unit,
      price: Number(row.price),
      currency: row.currency,
      region: row.region,
      source: JSON.parse(row.sourceJson) as PriceSource,
      status: row.status,
      updatedAt: row.updatedAt
    }));
  }

  async listPrices() {
    const db = await getDatabase();
    return db.read<{
      id: string;
      name: string;
      code: string;
      unit: string;
      price: number;
      currency: string;
      region: string;
      sourceJson: string;
      status: LocalPrice["status"];
      updatedAt: string;
    }>(
      `SELECT id, name, code, unit, price, currency, region,
              source_json AS sourceJson, status, updated_at AS updatedAt
       FROM prices ORDER BY updated_at DESC`
    ).map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      unit: row.unit,
      price: Number(row.price),
      currency: row.currency,
      region: row.region,
      source: JSON.parse(row.sourceJson) as PriceSource,
      status: row.status,
      updatedAt: row.updatedAt
    }));
  }

  async saveDocument(document: LocalDocument, snapshot = false) {
    const db = await getDatabase();
    const timestamp = now();
    await db.write((sqlite) => {
      const previous = first<{ revision: number; payloadJson: string }>(
        sqlite,
        "SELECT revision, payload_json AS payloadJson FROM documents WHERE id = ?",
        [document.id]
      );
      if (snapshot && previous) {
        sqlite.run(
          `INSERT OR IGNORE INTO document_revisions
            (document_id, revision, payload_json, created_at)
           VALUES (?, ?, ?, ?)`,
          [document.id, previous.revision, previous.payloadJson, timestamp]
        );
      }
      sqlite.run(
        `INSERT INTO documents
          (id, thread_id, type, title, status, revision, payload_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           thread_id = COALESCE(excluded.thread_id, documents.thread_id),
           type = excluded.type,
           title = excluded.title,
           status = excluded.status,
           revision = excluded.revision,
           payload_json = excluded.payload_json,
           updated_at = excluded.updated_at`,
        [
          document.id,
          document.threadId ?? null,
          document.type,
          document.title,
          document.status,
          document.revision,
          JSON.stringify(document),
          timestamp,
          timestamp
        ]
      );
      enqueue(sqlite, "document", document.id, "upsert", document);
    });
  }

  async getDocument(id: string) {
    const db = await getDatabase();
    const row = db.first<{ payloadJson: string }>(
      "SELECT payload_json AS payloadJson FROM documents WHERE id = ?",
      [id]
    );
    return row ? (JSON.parse(row.payloadJson) as LocalDocument) : null;
  }

  async listDocuments() {
    const db = await getDatabase();
    return db.read<{ payloadJson: string }>(
      "SELECT payload_json AS payloadJson FROM documents ORDER BY updated_at DESC"
    ).map((row) => JSON.parse(row.payloadJson) as LocalDocument);
  }

  async getMeta(key: string) {
    const db = await getDatabase();
    return db.first<{ value: string }>("SELECT value FROM meta WHERE key = ?", [key])?.value ?? null;
  }

  async setMeta(key: string, value: string) {
    const db = await getDatabase();
    await db.write((sqlite) => {
      sqlite.run(
        `INSERT INTO meta(key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, value, now()]
      );
    });
  }
}

let repositoryPromise: Promise<ProsmetRepository> | null = null;
export function getRepository() {
  repositoryPromise ??= getDatabase().then(() => new ProsmetRepository());
  return repositoryPromise;
}
