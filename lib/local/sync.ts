"use client";

import { getDatabase } from "@/lib/local/database";

export type SyncStatus =
  | { state: "idle"; pending: number; cursor: number }
  | { state: "syncing"; pending: number; cursor: number }
  | { state: "synced"; pending: number; cursor: number; pushed: number; pulled: number }
  | { state: "offline"; pending: number; cursor: number }
  | { state: "error"; pending: number; cursor: number; message: string };

type OutboxRow = {
  id: string;
  entityType: string;
  entityId: string;
  operation: "upsert" | "delete";
  payloadJson: string;
  createdAt: string;
};

type RemoteOperation = {
  cursor: number;
  operationId: string;
  deviceId: string;
  entityType: string;
  entityId: string;
  operation: "upsert" | "delete";
  payload: unknown;
  createdAt: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function now() {
  return new Date().toISOString();
}

async function syncIdentity() {
  const database = await getDatabase();
  const row = database.first<{ deviceId: string; cursor: string | null }>(
    `SELECT device_id AS deviceId, cursor FROM sync_state WHERE scope = 'server'`
  );
  if (row) {
    return { deviceId: row.deviceId, cursor: Number(row.cursor) || 0 };
  }

  const deviceId = `device:${crypto.randomUUID()}`;
  await database.write((sqlite) => {
    sqlite.run(
      `INSERT INTO sync_state (scope, cursor, device_id, updated_at)
       VALUES ('server', '0', ?, ?)`,
      [deviceId, now()]
    );
  });
  return { deviceId, cursor: 0 };
}

export async function getSyncSummary() {
  const database = await getDatabase();
  const pending =
    database.first<{ value: number }>("SELECT COUNT(*) AS value FROM outbox")?.value ?? 0;
  const identity = await syncIdentity();
  return { pending: Number(pending), cursor: identity.cursor, deviceId: identity.deviceId };
}

function applyThread(
  sqlite: import("sql.js").Database,
  entityId: string,
  payload: Record<string, unknown>
) {
  const timestamp = now();
  sqlite.run(
    `INSERT OR IGNORE INTO threads
      (id, title, object_name, status, pinned, created_at, updated_at)
     VALUES (?, NULL, '', 'active', 0, ?, ?)`,
    [entityId, timestamp, timestamp]
  );

  if (Object.hasOwn(payload, "title")) {
    sqlite.run("UPDATE threads SET title = ?, updated_at = ? WHERE id = ?", [
      typeof payload.title === "string" && payload.title.trim() ? payload.title : null,
      timestamp,
      entityId
    ]);
  }
  if (Object.hasOwn(payload, "objectName")) {
    sqlite.run("UPDATE threads SET object_name = ?, updated_at = ? WHERE id = ?", [
      typeof payload.objectName === "string" ? payload.objectName : "",
      timestamp,
      entityId
    ]);
  }
  if (Object.hasOwn(payload, "status")) {
    sqlite.run("UPDATE threads SET status = ?, updated_at = ? WHERE id = ?", [
      payload.status === "archived" ? "archived" : "active",
      timestamp,
      entityId
    ]);
  }
  if (Object.hasOwn(payload, "pinned")) {
    sqlite.run("UPDATE threads SET pinned = ?, updated_at = ? WHERE id = ?", [
      payload.pinned ? 1 : 0,
      timestamp,
      entityId
    ]);
  }
}

function applyMessage(
  sqlite: import("sql.js").Database,
  entityId: string,
  payload: Record<string, unknown>
) {
  const threadId = typeof payload.threadId === "string" ? payload.threadId : "";
  const message = record(payload.message);
  if (!threadId || !Object.keys(message).length) return;
  const timestamp = now();
  applyThread(sqlite, threadId, {});
  const ordinal =
    sqlite
      .prepare("SELECT COALESCE(MAX(ordinal), 0) + 1 AS value FROM messages WHERE thread_id = ?")
      .getAsObject([threadId]).value ?? 1;
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
      entityId,
      typeof payload.parentId === "string" ? payload.parentId : null,
      Number(ordinal) || 1,
      JSON.stringify(message),
      timestamp,
      timestamp
    ]
  );
}

function applyEstimate(
  sqlite: import("sql.js").Database,
  entityId: string,
  payload: Record<string, unknown>
) {
  const timestamp = now();
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
      entityId,
      typeof payload.threadId === "string" ? payload.threadId : null,
      typeof payload.title === "string" ? payload.title : "Смета",
      typeof payload.status === "string" ? payload.status : "draft",
      Number(payload.revision) || 1,
      JSON.stringify(payload),
      timestamp,
      timestamp
    ]
  );
}

function applyDocument(
  sqlite: import("sql.js").Database,
  entityId: string,
  payload: Record<string, unknown>
) {
  const timestamp = now();
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
      entityId,
      typeof payload.threadId === "string" ? payload.threadId : null,
      typeof payload.type === "string" ? payload.type : "document",
      typeof payload.title === "string" ? payload.title : "Документ",
      typeof payload.status === "string" ? payload.status : "draft",
      Number(payload.revision) || 1,
      JSON.stringify(payload),
      timestamp,
      timestamp
    ]
  );
}

async function applyRemoteOperations(
  operations: readonly RemoteOperation[],
  ownDeviceId: string,
  cursor: number
) {
  if (!operations.length) return cursor;
  const database = await getDatabase();
  const nextCursor = Math.max(cursor, ...operations.map((operation) => operation.cursor));

  await database.write((sqlite) => {
    for (const operation of operations) {
      if (operation.deviceId === ownDeviceId) continue;
      const payload = record(operation.payload);
      if (operation.operation === "delete") {
        const table =
          operation.entityType === "thread"
            ? "threads"
            : operation.entityType === "message"
              ? "messages"
              : operation.entityType === "estimate"
                ? "estimates"
                : operation.entityType === "document"
                  ? "documents"
                  : null;
        if (table === "messages") {
          sqlite.run("DELETE FROM messages WHERE message_id = ?", [operation.entityId]);
        } else if (table) {
          sqlite.run(`DELETE FROM ${table} WHERE id = ?`, [operation.entityId]);
        }
        continue;
      }

      if (operation.entityType === "thread") applyThread(sqlite, operation.entityId, payload);
      else if (operation.entityType === "message") applyMessage(sqlite, operation.entityId, payload);
      else if (operation.entityType === "estimate") applyEstimate(sqlite, operation.entityId, payload);
      else if (operation.entityType === "document") applyDocument(sqlite, operation.entityId, payload);
    }

    sqlite.run(
      `INSERT INTO sync_state (scope, cursor, device_id, updated_at)
       VALUES ('server', ?, ?, ?)
       ON CONFLICT(scope) DO UPDATE SET
         cursor = excluded.cursor,
         device_id = excluded.device_id,
         updated_at = excluded.updated_at`,
      [String(nextCursor), ownDeviceId, now()]
    );
  });
  return nextCursor;
}

export async function syncWorkspace(): Promise<SyncStatus> {
  const summary = await getSyncSummary();
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { state: "offline", pending: summary.pending, cursor: summary.cursor };
  }

  const database = await getDatabase();
  const outbox = database.read<OutboxRow>(
    `SELECT id,
            entity_type AS entityType,
            entity_id AS entityId,
            operation,
            payload_json AS payloadJson,
            created_at AS createdAt
       FROM outbox
      WHERE attempts < 8
      ORDER BY created_at ASC
      LIMIT 250`
  );

  try {
    let pushed = 0;
    let cursor = summary.cursor;
    if (outbox.length) {
      const response = await fetch("/api/sync", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: summary.deviceId,
          operations: outbox.map((row) => ({
            id: row.id,
            entityType: row.entityType,
            entityId: row.entityId,
            operation: row.operation,
            payload: JSON.parse(row.payloadJson),
            createdAt: row.createdAt
          }))
        })
      });
      if (!response.ok) throw new Error(`Sync push HTTP ${response.status}`);
      const result = (await response.json()) as { accepted?: number; cursor?: number };
      pushed = Number(result.accepted) || 0;
      cursor = Math.max(cursor, Number(result.cursor) || 0);
      await database.write((sqlite) => {
        const placeholders = outbox.map(() => "?").join(",");
        sqlite.run(`DELETE FROM outbox WHERE id IN (${placeholders})`, outbox.map((row) => row.id));
      });
    }

    const pull = await fetch(`/api/sync?cursor=${cursor}&limit=250`, {
      credentials: "same-origin",
      cache: "no-store"
    });
    if (!pull.ok) throw new Error(`Sync pull HTTP ${pull.status}`);
    const payload = (await pull.json()) as {
      cursor?: number;
      operations?: RemoteOperation[];
    };
    const operations = payload.operations ?? [];
    const nextCursor = await applyRemoteOperations(
      operations,
      summary.deviceId,
      Math.max(cursor, Number(payload.cursor) || 0)
    );
    const final = await getSyncSummary();
    return {
      state: "synced",
      pending: final.pending,
      cursor: nextCursor,
      pushed,
      pulled: operations.filter((operation) => operation.deviceId !== summary.deviceId).length
    };
  } catch (error) {
    await database.write((sqlite) => {
      for (const row of outbox) {
        sqlite.run(
          "UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?",
          [error instanceof Error ? error.message.slice(0, 500) : "Sync failed", row.id]
        );
      }
    });
    return {
      state: "error",
      pending: outbox.length,
      cursor: summary.cursor,
      message: error instanceof Error ? error.message : "Sync failed"
    };
  }
}
