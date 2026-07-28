"use client";

import { getDatabase } from "@/lib/local/database";
import { browserUuid, sha256Hex } from "@/lib/platform/browser-crypto";

function now() {
  return new Date().toISOString();
}

export type StoredFile = {
  id: string;
  threadId?: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  bytes: Uint8Array;
  createdAt: string;
  updatedAt: string;
};

export async function storeFile(file: File, threadId?: string, id = `file_${browserUuid()}`) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const checksum = await sha256Hex(bytes);
  const timestamp = now();
  const database = await getDatabase();
  await database.write((sqlite) => {
    sqlite.run(
      `INSERT INTO files
        (id, thread_id, name, mime_type, size_bytes, sha256, blob_data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         thread_id = COALESCE(excluded.thread_id, files.thread_id),
         name = excluded.name,
         mime_type = excluded.mime_type,
         size_bytes = excluded.size_bytes,
         sha256 = excluded.sha256,
         blob_data = excluded.blob_data,
         updated_at = excluded.updated_at`,
      [
        id,
        threadId ?? null,
        file.name,
        file.type || "application/octet-stream",
        bytes.byteLength,
        checksum,
        bytes,
        timestamp,
        timestamp
      ]
    );
    sqlite.run(
      `INSERT INTO outbox
        (id, entity_type, entity_id, operation, payload_json, attempts, created_at)
       VALUES (?, 'file', ?, 'upsert', ?, 0, ?)`,
      [
        browserUuid(),
        id,
        JSON.stringify({
          id,
          threadId,
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: bytes.byteLength,
          checksum
        }),
        timestamp
      ]
    );
  });
  return {
    id,
    threadId,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: bytes.byteLength,
    checksum,
    bytes,
    createdAt: timestamp,
    updatedAt: timestamp
  } satisfies StoredFile;
}

export async function loadFile(id: string) {
  const database = await getDatabase();
  const row = database.first<{
    id: string;
    threadId: string | null;
    name: string;
    mimeType: string;
    sizeBytes: number;
    checksum: string;
    bytes: Uint8Array | null;
    createdAt: string;
    updatedAt: string;
  }>(
    `SELECT id, thread_id AS threadId, name, mime_type AS mimeType,
            size_bytes AS sizeBytes, sha256 AS checksum, blob_data AS bytes,
            created_at AS createdAt, updated_at AS updatedAt
     FROM files WHERE id = ?`,
    [id]
  );
  if (!row) return null;
  return {
    ...row,
    threadId: row.threadId ?? undefined,
    sizeBytes: Number(row.sizeBytes),
    bytes: row.bytes instanceof Uint8Array ? row.bytes : new Uint8Array()
  } satisfies StoredFile;
}

export async function deleteFile(id: string) {
  const database = await getDatabase();
  const timestamp = now();
  await database.write((sqlite) => {
    sqlite.run("DELETE FROM files WHERE id = ?", [id]);
    sqlite.run(
      `INSERT INTO outbox
        (id, entity_type, entity_id, operation, payload_json, attempts, created_at)
       VALUES (?, 'file', ?, 'delete', 'null', 0, ?)`,
      [browserUuid(), id, timestamp]
    );
  });
}

export async function listFiles() {
  const database = await getDatabase();
  return database
    .read<{
      id: string;
      threadId: string | null;
      name: string;
      mimeType: string;
      sizeBytes: number;
      checksum: string;
      createdAt: string;
      updatedAt: string;
    }>(
      `SELECT id, thread_id AS threadId, name, mime_type AS mimeType,
              size_bytes AS sizeBytes, sha256 AS checksum,
              created_at AS createdAt, updated_at AS updatedAt
       FROM files ORDER BY updated_at DESC`
    )
    .map((row) => ({
      ...row,
      threadId: row.threadId ?? undefined,
      sizeBytes: Number(row.sizeBytes)
    }));
}

export function toDataUrl(bytes: Uint8Array, mimeType: string) {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}
