"use client";

import { EstimateDraftSchema } from "@/lib/domain/estimate";
import { browserUuid } from "@/lib/platform/browser-crypto";
import {
  LOCAL_STORES,
  getAllRecords,
  getRecord,
  putRecord,
  requestResult,
  withLocalTransaction,
  type LocalStoreName
} from "@/lib/local/idb";
import type {
  LocalDocument,
  LocalPrice,
  LocalThread,
  OutboxRecord
} from "@/lib/local/repository";

export type SyncStatus =
  | { state: "idle"; pending: number; cursor: number }
  | { state: "syncing"; pending: number; cursor: number }
  | { state: "synced"; pending: number; cursor: number; pushed: number; pulled: number }
  | { state: "offline"; pending: number; cursor: number }
  | { state: "error"; pending: number; cursor: number; message: string };

type SyncStateRecord = {
  scope: "server";
  deviceId: string;
  cursor: number;
  updatedAt: string;
};

type RemoteOperation = {
  cursor: number;
  operationId: string;
  deviceId: string;
  entityType: OutboxRecord["entityType"];
  entityId: string;
  operation: "upsert" | "delete";
  payload: unknown;
  createdAt: string;
};

type MessageRecord = {
  key: string;
  threadId: string;
  messageId: string;
  parentId: string | null;
  ordinal: number;
  message: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type EstimateRecord = {
  id: string;
  threadId?: string;
  title: string;
  status: string;
  revision: number;
  draft: unknown;
  createdAt: string;
  updatedAt: string;
};

type DocumentRecord = {
  id: string;
  threadId?: string;
  title: string;
  status: LocalDocument["status"];
  revision: number;
  document: LocalDocument;
  createdAt: string;
  updatedAt: string;
};

const PRICE_STORES = [
  LOCAL_STORES.prices,
  LOCAL_STORES.canonicalWorks,
  LOCAL_STORES.priceObservations,
  LOCAL_STORES.priceHistory,
  LOCAL_STORES.marketPriceBuckets,
  LOCAL_STORES.priceResearchEvidence
] as const satisfies readonly LocalStoreName[];

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function now() {
  return new Date().toISOString();
}

function priceStore(payload: Record<string, unknown>): LocalStoreName | null {
  switch (payload.entityKind) {
    case "canonical_work":
      return LOCAL_STORES.canonicalWorks;
    case "price_observation":
      return LOCAL_STORES.priceObservations;
    case "price_history":
      return LOCAL_STORES.priceHistory;
    case "market_price_bucket":
      return LOCAL_STORES.marketPriceBuckets;
    case "price_research_evidence":
      return LOCAL_STORES.priceResearchEvidence;
    default:
      return typeof payload.name === "string" &&
        typeof payload.unit === "string" &&
        typeof payload.price === "number"
        ? LOCAL_STORES.prices
        : null;
  }
}

async function syncIdentity() {
  const existing = await getRecord<SyncStateRecord>(LOCAL_STORES.syncState, "server");
  if (existing) return existing;

  const identity: SyncStateRecord = {
    scope: "server",
    deviceId: `device:${browserUuid()}`,
    cursor: 0,
    updatedAt: now()
  };
  await putRecord(LOCAL_STORES.syncState, identity);
  return identity;
}

export async function getSyncSummary() {
  const [identity, outbox] = await Promise.all([
    syncIdentity(),
    getAllRecords<OutboxRecord>(LOCAL_STORES.outbox)
  ]);
  return {
    pending: outbox.filter((item) => item.attempts < 8).length,
    cursor: identity.cursor,
    deviceId: identity.deviceId
  };
}

function localThread(entityId: string, payload: Record<string, unknown>): LocalThread {
  const timestamp = now();
  return {
    id: entityId,
    title:
      typeof payload.title === "string" && payload.title.trim()
        ? payload.title.trim()
        : undefined,
    objectName: typeof payload.objectName === "string" ? payload.objectName : "",
    status: payload.status === "archived" ? "archived" : "active",
    pinned: Boolean(payload.pinned),
    createdAt: typeof payload.createdAt === "string" ? payload.createdAt : timestamp,
    updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : timestamp
  };
}

async function deleteRemotePrice(transaction: IDBTransaction, entityId: string) {
  // A delete operation can arrive without its original payload. Removing the
  // same immutable ID from every price store is deterministic and idempotent,
  // and prevents a deleted observation from surviving on another device.
  for (const store of PRICE_STORES) {
    await requestResult(transaction.objectStore(store).delete(entityId));
  }
}

async function putRemotePrice(
  transaction: IDBTransaction,
  entityId: string,
  payload: Record<string, unknown>
) {
  const store = priceStore(payload);
  if (!store) return;
  await requestResult(
    transaction.objectStore(store).put({
      ...payload,
      id: typeof payload.id === "string" && payload.id ? payload.id : entityId
    })
  );
}

async function applyRemoteOperations(
  operations: readonly RemoteOperation[],
  ownDeviceId: string,
  cursor: number
) {
  const nextCursor = operations.length
    ? Math.max(cursor, ...operations.map((operation) => Number(operation.cursor) || 0))
    : cursor;

  await withLocalTransaction(
    [
      LOCAL_STORES.threads,
      LOCAL_STORES.messages,
      LOCAL_STORES.estimates,
      LOCAL_STORES.documents,
      ...PRICE_STORES,
      LOCAL_STORES.files,
      LOCAL_STORES.syncState
    ],
    "readwrite",
    async (transaction) => {
      for (const operation of operations) {
        if (operation.deviceId === ownDeviceId) continue;
        const payload = record(operation.payload);

        if (operation.operation === "delete") {
          if (operation.entityType === "thread") {
            await requestResult(
              transaction.objectStore(LOCAL_STORES.threads).delete(operation.entityId)
            );
            const messages = await requestResult<MessageRecord[]>(
              transaction
                .objectStore(LOCAL_STORES.messages)
                .index("threadId")
                .getAll(operation.entityId)
            );
            for (const message of messages) {
              await requestResult(
                transaction.objectStore(LOCAL_STORES.messages).delete(message.key)
              );
            }
          } else if (operation.entityType === "message") {
            const messages = await requestResult<MessageRecord[]>(
              transaction.objectStore(LOCAL_STORES.messages).getAll()
            );
            const message = messages.find((item) => item.messageId === operation.entityId);
            if (message) {
              await requestResult(
                transaction.objectStore(LOCAL_STORES.messages).delete(message.key)
              );
            }
          } else if (operation.entityType === "estimate") {
            await requestResult(
              transaction.objectStore(LOCAL_STORES.estimates).delete(operation.entityId)
            );
          } else if (operation.entityType === "document") {
            await requestResult(
              transaction.objectStore(LOCAL_STORES.documents).delete(operation.entityId)
            );
          } else if (operation.entityType === "price") {
            await deleteRemotePrice(transaction, operation.entityId);
          } else if (operation.entityType === "file") {
            await requestResult(
              transaction.objectStore(LOCAL_STORES.files).delete(operation.entityId)
            );
          }
          continue;
        }

        if (operation.entityType === "thread") {
          const store = transaction.objectStore(LOCAL_STORES.threads);
          const current = await requestResult<LocalThread | undefined>(
            store.get(operation.entityId)
          );
          await requestResult(
            store.put({
              ...(current ?? localThread(operation.entityId, payload)),
              ...localThread(operation.entityId, { ...(current ?? {}), ...payload }),
              updatedAt: now()
            })
          );
        } else if (operation.entityType === "message") {
          const threadId = typeof payload.threadId === "string" ? payload.threadId : "";
          const message = record(payload.message);
          if (!threadId || !Object.keys(message).length) continue;
          const key = `${threadId}:${operation.entityId}`;
          const store = transaction.objectStore(LOCAL_STORES.messages);
          const current = await requestResult<MessageRecord | undefined>(store.get(key));
          await requestResult(
            store.put({
              key,
              threadId,
              messageId: operation.entityId,
              parentId: typeof payload.parentId === "string" ? payload.parentId : null,
              ordinal: Number(payload.ordinal) || current?.ordinal || Date.now(),
              message,
              createdAt: current?.createdAt ?? operation.createdAt ?? now(),
              updatedAt: now()
            } satisfies MessageRecord)
          );
        } else if (operation.entityType === "estimate") {
          const parsed = EstimateDraftSchema.safeParse(payload);
          if (!parsed.success) continue;
          const store = transaction.objectStore(LOCAL_STORES.estimates);
          const current = await requestResult<EstimateRecord | undefined>(
            store.get(operation.entityId)
          );
          await requestResult(
            store.put({
              id: operation.entityId,
              threadId:
                typeof payload.threadId === "string" ? payload.threadId : current?.threadId,
              title: parsed.data.title,
              status: parsed.data.status,
              revision: parsed.data.revision,
              draft: parsed.data,
              createdAt: current?.createdAt ?? operation.createdAt ?? now(),
              updatedAt: now()
            } satisfies EstimateRecord)
          );
        } else if (operation.entityType === "document") {
          if (
            typeof payload.title !== "string" ||
            typeof payload.content !== "string" ||
            typeof payload.id !== "string"
          ) {
            continue;
          }
          const document: LocalDocument = {
            id: payload.id,
            threadId: typeof payload.threadId === "string" ? payload.threadId : undefined,
            type: typeof payload.type === "string" ? payload.type : "document",
            title: payload.title,
            status: payload.status === "approved" ? "approved" : "draft",
            revision: Math.max(1, Number(payload.revision) || 1),
            content: payload.content,
            missingFields: Array.isArray(payload.missingFields)
              ? payload.missingFields.filter(
                  (item): item is string => typeof item === "string"
                )
              : [],
            updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : now()
          };
          const store = transaction.objectStore(LOCAL_STORES.documents);
          const current = await requestResult<DocumentRecord | undefined>(
            store.get(operation.entityId)
          );
          await requestResult(
            store.put({
              id: operation.entityId,
              threadId: document.threadId ?? current?.threadId,
              title: document.title,
              status: document.status,
              revision: document.revision,
              document,
              createdAt: current?.createdAt ?? operation.createdAt ?? now(),
              updatedAt: now()
            } satisfies DocumentRecord)
          );
        } else if (operation.entityType === "price") {
          await putRemotePrice(transaction, operation.entityId, payload);
        }
      }

      await requestResult(
        transaction.objectStore(LOCAL_STORES.syncState).put({
          scope: "server",
          deviceId: ownDeviceId,
          cursor: nextCursor,
          updatedAt: now()
        } satisfies SyncStateRecord)
      );
    }
  );

  return nextCursor;
}

export async function syncWorkspace(): Promise<SyncStatus> {
  const summary = await getSyncSummary();
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { state: "offline", pending: summary.pending, cursor: summary.cursor };
  }

  const outbox = (await getAllRecords<OutboxRecord>(LOCAL_STORES.outbox))
    .filter((item) => item.attempts < 8)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .slice(0, 250);

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
          operations: outbox.map((item) => ({
            id: item.id,
            entityType: item.entityType,
            entityId: item.entityId,
            operation: item.operation,
            payload: item.payload,
            createdAt: item.createdAt
          }))
        })
      });
      if (!response.ok) throw new Error(`Sync push HTTP ${response.status}`);
      const result = (await response.json()) as { accepted?: number; cursor?: number };
      pushed = Number(result.accepted) || 0;
      cursor = Math.max(cursor, Number(result.cursor) || 0);

      await withLocalTransaction(LOCAL_STORES.outbox, "readwrite", async (transaction) => {
        const store = transaction.objectStore(LOCAL_STORES.outbox);
        for (const item of outbox) await requestResult(store.delete(item.id));
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
    await withLocalTransaction(LOCAL_STORES.outbox, "readwrite", async (transaction) => {
      const store = transaction.objectStore(LOCAL_STORES.outbox);
      for (const item of outbox) {
        await requestResult(
          store.put({
            ...item,
            attempts: item.attempts + 1,
            lastError:
              error instanceof Error ? error.message.slice(0, 500) : "Sync failed"
          })
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
