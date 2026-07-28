"use client";

import type { ExportedMessageRepositoryItem, ThreadMessage } from "@assistant-ui/react";
import { EstimateDraftSchema, type EstimateDraft, type PriceSource } from "@/lib/domain/estimate";
import { browserUuid } from "@/lib/browser/crypto";
import {
  LOCAL_STORES,
  getAllByIndex,
  getAllRecords,
  getRecord,
  openLocalDatabase,
  putRecord,
  requestPersistentStorage,
  requestResult,
  withLocalTransaction
} from "@/lib/local/idb";

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
  normalizedName: string;
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

export type OutboxRecord = {
  id: string;
  entityType: "thread" | "message" | "estimate" | "document" | "file" | "price";
  entityId: string;
  operation: "upsert" | "delete";
  payload: unknown;
  attempts: number;
  createdAt: string;
  lastError?: string;
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
  status: EstimateDraft["status"];
  revision: number;
  draft: EstimateDraft;
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

type MetaRecord = { key: string; value: string; updatedAt: string };

function now() {
  return new Date().toISOString();
}

function normal(value: string) {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function messageKey(threadId: string, messageId: string) {
  return `${threadId}:${messageId}`;
}

function serializeMessage(message: ThreadMessage) {
  return {
    ...message,
    createdAt:
      message.createdAt instanceof Date ? message.createdAt.toISOString() : message.createdAt
  } as unknown as Record<string, unknown>;
}

function reviveMessage(message: Record<string, unknown>): ThreadMessage {
  return {
    ...message,
    createdAt:
      typeof message.createdAt === "string" ? new Date(message.createdAt) : new Date()
  } as ThreadMessage;
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

function outboxRecord(
  entityType: OutboxRecord["entityType"],
  entityId: string,
  operation: OutboxRecord["operation"],
  payload: unknown
): OutboxRecord {
  return {
    id: browserUuid(),
    entityType,
    entityId,
    operation,
    payload,
    attempts: 0,
    createdAt: now()
  };
}

async function putOutbox(
  transaction: IDBTransaction,
  entityType: OutboxRecord["entityType"],
  entityId: string,
  operation: OutboxRecord["operation"],
  payload: unknown
) {
  await requestResult(
    transaction.objectStore(LOCAL_STORES.outbox).put(
      outboxRecord(entityType, entityId, operation, payload)
    )
  );
}

function sortUpdated<T extends { updatedAt: string }>(items: T[]) {
  return items.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export class ProsmetRepository {
  async ready() {
    await openLocalDatabase();
    void requestPersistentStorage();
  }

  async listThreads() {
    const threads = await getAllRecords<LocalThread>(LOCAL_STORES.threads);
    return threads.sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
      return right.updatedAt.localeCompare(left.updatedAt);
    });
  }

  async ensureThread(id: string) {
    const existing = await this.getThread(id);
    if (existing) return existing;
    const timestamp = now();
    const thread: LocalThread = {
      id,
      objectName: "",
      status: "active",
      pinned: false,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    await withLocalTransaction(
      [LOCAL_STORES.threads, LOCAL_STORES.outbox],
      "readwrite",
      async (transaction) => {
        await requestResult(transaction.objectStore(LOCAL_STORES.threads).put(thread));
        await putOutbox(transaction, "thread", id, "upsert", thread);
      }
    );
    return thread;
  }

  async getThread(id: string) {
    return (await getRecord<LocalThread>(LOCAL_STORES.threads, id)) ?? null;
  }

  async renameThread(id: string, title: string) {
    const clean = title.replace(/\s+/g, " ").trim().slice(0, 120);
    await withLocalTransaction(
      [LOCAL_STORES.threads, LOCAL_STORES.outbox],
      "readwrite",
      async (transaction) => {
        const store = transaction.objectStore(LOCAL_STORES.threads);
        const current = await requestResult<LocalThread | undefined>(store.get(id));
        if (!current) return;
        const next = { ...current, title: clean || undefined, updatedAt: now() };
        await requestResult(store.put(next));
        await putOutbox(transaction, "thread", id, "upsert", next);
      }
    );
  }

  async updateThread(
    id: string,
    patch: Partial<Pick<LocalThread, "objectName" | "status" | "pinned">>
  ) {
    await withLocalTransaction(
      [LOCAL_STORES.threads, LOCAL_STORES.outbox],
      "readwrite",
      async (transaction) => {
        const store = transaction.objectStore(LOCAL_STORES.threads);
        const current = await requestResult<LocalThread | undefined>(store.get(id));
        if (!current) return;
        const next: LocalThread = {
          ...current,
          objectName: patch.objectName ?? current.objectName,
          status: patch.status ?? current.status,
          pinned: patch.pinned ?? current.pinned,
          updatedAt: now()
        };
        await requestResult(store.put(next));
        await putOutbox(transaction, "thread", id, "upsert", next);
      }
    );
  }

  async deleteThread(id: string) {
    await withLocalTransaction(
      [
        LOCAL_STORES.threads,
        LOCAL_STORES.messages,
        LOCAL_STORES.estimates,
        LOCAL_STORES.documents,
        LOCAL_STORES.files,
        LOCAL_STORES.outbox
      ],
      "readwrite",
      async (transaction) => {
        await requestResult(transaction.objectStore(LOCAL_STORES.threads).delete(id));

        const messages = await requestResult<MessageRecord[]>(
          transaction.objectStore(LOCAL_STORES.messages).index("threadId").getAll(id)
        );
        for (const message of messages) {
          await requestResult(transaction.objectStore(LOCAL_STORES.messages).delete(message.key));
        }

        const estimates = await requestResult<EstimateRecord[]>(
          transaction.objectStore(LOCAL_STORES.estimates).index("threadId").getAll(id)
        );
        for (const record of estimates) {
          await requestResult(
            transaction.objectStore(LOCAL_STORES.estimates).put({
              ...record,
              threadId: undefined,
              updatedAt: now()
            })
          );
        }

        const documents = await requestResult<DocumentRecord[]>(
          transaction.objectStore(LOCAL_STORES.documents).index("threadId").getAll(id)
        );
        for (const record of documents) {
          await requestResult(
            transaction.objectStore(LOCAL_STORES.documents).put({
              ...record,
              threadId: undefined,
              document: { ...record.document, threadId: undefined },
              updatedAt: now()
            })
          );
        }

        const files = await requestResult<Array<{ id: string }>>(
          transaction.objectStore(LOCAL_STORES.files).index("threadId").getAll(id)
        );
        for (const file of files) {
          const record = await requestResult<Record<string, unknown> | undefined>(
            transaction.objectStore(LOCAL_STORES.files).get(file.id)
          );
          if (record) {
            await requestResult(
              transaction.objectStore(LOCAL_STORES.files).put({
                ...record,
                threadId: undefined,
                updatedAt: now()
              })
            );
          }
        }

        await putOutbox(transaction, "thread", id, "delete", null);
      }
    );
  }

  async appendMessage(threadId: string, item: ExportedMessageRepositoryItem) {
    const timestamp = now();
    await withLocalTransaction(
      [LOCAL_STORES.threads, LOCAL_STORES.messages, LOCAL_STORES.outbox],
      "readwrite",
      async (transaction) => {
        const threadStore = transaction.objectStore(LOCAL_STORES.threads);
        const messageStore = transaction.objectStore(LOCAL_STORES.messages);
        const key = messageKey(threadId, item.message.id);
        let thread = await requestResult<LocalThread | undefined>(threadStore.get(threadId));
        const createdThread = !thread;
        thread ??= {
          id: threadId,
          objectName: "",
          status: "active",
          pinned: false,
          createdAt: timestamp,
          updatedAt: timestamp
        };

        const existing = await requestResult<MessageRecord | undefined>(messageStore.get(key));
        const siblings = await requestResult<MessageRecord[]>(
          messageStore.index("threadId").getAll(threadId)
        );
        const ordinal =
          existing?.ordinal ??
          siblings.reduce((maximum, entry) => Math.max(maximum, entry.ordinal), 0) + 1;
        const title =
          item.message.role === "user" ? messageText(item.message).slice(0, 72) : "";
        const nextThread: LocalThread = {
          ...thread,
          title: thread.title || title || undefined,
          updatedAt: timestamp
        };
        const record: MessageRecord = {
          key,
          threadId,
          messageId: item.message.id,
          parentId: item.parentId,
          ordinal,
          message: serializeMessage(item.message),
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp
        };

        await requestResult(threadStore.put(nextThread));
        await requestResult(messageStore.put(record));
        if (createdThread || title) {
          await putOutbox(transaction, "thread", threadId, "upsert", nextThread);
        }
        await putOutbox(transaction, "message", item.message.id, "upsert", {
          threadId,
          parentId: item.parentId,
          ordinal,
          message: record.message
        });
      }
    );
  }

  async loadMessages(threadId: string) {
    const messages = await getAllByIndex<MessageRecord>(
      LOCAL_STORES.messages,
      "threadId",
      threadId
    );
    const ordered = messages.sort((left, right) => left.ordinal - right.ordinal);
    return {
      headId: ordered.at(-1)?.messageId ?? null,
      messages: ordered.map((entry) => ({
        parentId: entry.parentId,
        message: reviveMessage(entry.message)
      }))
    };
  }

  async saveEstimate(threadId: string | undefined, draft: EstimateDraft, snapshot = false) {
    const parsed = EstimateDraftSchema.parse(draft);
    const timestamp = now();
    await withLocalTransaction(
      [LOCAL_STORES.estimates, LOCAL_STORES.estimateRevisions, LOCAL_STORES.outbox],
      "readwrite",
      async (transaction) => {
        const store = transaction.objectStore(LOCAL_STORES.estimates);
        const previous = await requestResult<EstimateRecord | undefined>(store.get(parsed.id));
        if (snapshot && previous) {
          await requestResult(
            transaction.objectStore(LOCAL_STORES.estimateRevisions).put({
              key: `${parsed.id}:${previous.revision}`,
              estimateId: parsed.id,
              revision: previous.revision,
              draft: previous.draft,
              createdAt: previous.updatedAt
            })
          );
        }
        const record: EstimateRecord = {
          id: parsed.id,
          threadId: threadId ?? previous?.threadId,
          title: parsed.title,
          status: parsed.status,
          revision: parsed.revision,
          draft: parsed,
          createdAt: previous?.createdAt ?? timestamp,
          updatedAt: timestamp
        };
        await requestResult(store.put(record));
        await putOutbox(transaction, "estimate", parsed.id, "upsert", {
          ...parsed,
          threadId: record.threadId
        });
      }
    );
  }

  async getEstimate(id: string) {
    const record = await getRecord<EstimateRecord>(LOCAL_STORES.estimates, id);
    return record ? EstimateDraftSchema.parse(record.draft) : null;
  }

  async listEstimates() {
    const records = sortUpdated(await getAllRecords<EstimateRecord>(LOCAL_STORES.estimates));
    return records.flatMap((record) => {
      const parsed = EstimateDraftSchema.safeParse(record.draft);
      return parsed.success ? [parsed.data] : [];
    });
  }

  async saveConfirmedPrices(draft: EstimateDraft) {
    const timestamp = now();
    await withLocalTransaction(
      [LOCAL_STORES.prices, LOCAL_STORES.outbox],
      "readwrite",
      async (transaction) => {
        const priceStore = transaction.objectStore(LOCAL_STORES.prices);
        for (const section of draft.sections) {
          for (const item of section.items) {
            if (!(item.unitPrice > 0) || !item.name.trim()) continue;
            const id = `estimate:${draft.id}:${item.id}`;
            const price: LocalPrice = {
              id,
              name: item.name,
              normalizedName: normal(item.name),
              code: item.code,
              unit: item.unit,
              price: item.unitPrice,
              currency: draft.currency,
              region: draft.region,
              source: {
                ...item.source,
                kind: "personal",
                confirmed: true,
                label: item.source.label || `Утверждённая смета «${draft.title}»`
              },
              status: "confirmed",
              updatedAt: timestamp
            };
            await requestResult(priceStore.put(price));
            await putOutbox(transaction, "price", id, "upsert", price);
          }
        }
      }
    );
  }

  async findPrice(name: string, unit: string, region = "") {
    const key = normal(name);
    const token = key.split(" ").find((item) => item.length >= 4) ?? key;
    const prices = await getAllRecords<LocalPrice>(LOCAL_STORES.prices);
    return prices
      .filter(
        (price) =>
          price.status === "confirmed" &&
          price.unit === unit &&
          (price.normalizedName === key || price.normalizedName.includes(token))
      )
      .sort((left, right) => {
        const exact = Number(right.normalizedName === key) - Number(left.normalizedName === key);
        if (exact) return exact;
        const regional = Number(right.region === region) - Number(left.region === region);
        if (regional) return regional;
        return right.updatedAt.localeCompare(left.updatedAt);
      })
      .slice(0, 10);
  }

  async listPrices() {
    return sortUpdated(await getAllRecords<LocalPrice>(LOCAL_STORES.prices));
  }

  async saveDocument(document: LocalDocument, snapshot = false) {
    const timestamp = now();
    await withLocalTransaction(
      [LOCAL_STORES.documents, LOCAL_STORES.documentRevisions, LOCAL_STORES.outbox],
      "readwrite",
      async (transaction) => {
        const store = transaction.objectStore(LOCAL_STORES.documents);
        const previous = await requestResult<DocumentRecord | undefined>(store.get(document.id));
        if (snapshot && previous) {
          await requestResult(
            transaction.objectStore(LOCAL_STORES.documentRevisions).put({
              key: `${document.id}:${previous.revision}`,
              documentId: document.id,
              revision: previous.revision,
              document: previous.document,
              createdAt: previous.updatedAt
            })
          );
        }
        const record: DocumentRecord = {
          id: document.id,
          threadId: document.threadId ?? previous?.threadId,
          title: document.title,
          status: document.status,
          revision: document.revision,
          document,
          createdAt: previous?.createdAt ?? timestamp,
          updatedAt: timestamp
        };
        await requestResult(store.put(record));
        await putOutbox(transaction, "document", document.id, "upsert", {
          ...document,
          threadId: record.threadId
        });
      }
    );
  }

  async getDocument(id: string) {
    return (await getRecord<DocumentRecord>(LOCAL_STORES.documents, id))?.document ?? null;
  }

  async listDocuments() {
    return sortUpdated(await getAllRecords<DocumentRecord>(LOCAL_STORES.documents)).map(
      (record) => record.document
    );
  }

  async getMeta(key: string) {
    return (await getRecord<MetaRecord>(LOCAL_STORES.meta, key))?.value ?? null;
  }

  async setMeta(key: string, value: string) {
    await putRecord<MetaRecord>(LOCAL_STORES.meta, { key, value, updatedAt: now() });
  }
}

let repositoryPromise: Promise<ProsmetRepository> | null = null;

export function getRepository() {
  repositoryPromise ??= (async () => {
    const repository = new ProsmetRepository();
    await repository.ready();
    return repository;
  })();
  return repositoryPromise;
}
