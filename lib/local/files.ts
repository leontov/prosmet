"use client";

import { browserUuid, sha256Hex } from "@/lib/platform/browser-crypto";
import {
  LOCAL_STORES,
  getAllRecords,
  getRecord,
  requestResult,
  withLocalTransaction
} from "@/lib/local/idb";
import type { OutboxRecord } from "@/lib/local/repository";

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

function outbox(
  entityId: string,
  operation: "upsert" | "delete",
  payload: unknown
): OutboxRecord {
  return {
    id: browserUuid(),
    entityType: "file",
    entityId,
    operation,
    payload,
    attempts: 0,
    createdAt: now()
  };
}

export async function storeFile(
  file: File,
  threadId?: string,
  id = `file_${browserUuid()}`
) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const checksum = await sha256Hex(bytes);
  const timestamp = now();
  const stored: StoredFile = {
    id,
    threadId,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: bytes.byteLength,
    checksum,
    bytes,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  await withLocalTransaction(
    [LOCAL_STORES.files, LOCAL_STORES.outbox],
    "readwrite",
    async (transaction) => {
      await requestResult(transaction.objectStore(LOCAL_STORES.files).put(stored));
      await requestResult(
        transaction.objectStore(LOCAL_STORES.outbox).put(
          outbox(id, "upsert", {
            id,
            threadId,
            name: stored.name,
            mimeType: stored.mimeType,
            sizeBytes: stored.sizeBytes,
            checksum: stored.checksum,
            updatedAt: stored.updatedAt
          })
        )
      );
    }
  );

  return stored;
}

export async function loadFile(id: string) {
  return (await getRecord<StoredFile>(LOCAL_STORES.files, id)) ?? null;
}

export async function deleteFile(id: string) {
  await withLocalTransaction(
    [LOCAL_STORES.files, LOCAL_STORES.outbox],
    "readwrite",
    async (transaction) => {
      await requestResult(transaction.objectStore(LOCAL_STORES.files).delete(id));
      await requestResult(
        transaction.objectStore(LOCAL_STORES.outbox).put(outbox(id, "delete", null))
      );
    }
  );
}

export async function listFiles() {
  const files = await getAllRecords<StoredFile>(LOCAL_STORES.files);
  return files
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map(({ bytes: _bytes, ...metadata }) => metadata);
}

export function toDataUrl(bytes: Uint8Array, mimeType: string) {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}
