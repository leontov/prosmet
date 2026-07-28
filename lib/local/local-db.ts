import {
  ExportedMessageRepository,
  type ExportedMessageRepositoryItem,
  type ThreadMessage
} from "@assistant-ui/react";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { EstimateDraft } from "@/lib/domain/types";

export interface LocalThread {
  id: string;
  title: string;
  projectName: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  pinned: boolean;
}

type StoredMessageRepository = {
  threadId: string;
  repository?: ExportedMessageRepository;
  /** Version-1 compatibility. Migrated on first read. */
  messages?: readonly ThreadMessage[];
  updatedAt: string;
};

interface ProSmetSchema extends DBSchema {
  threads: { key: string; value: LocalThread; indexes: { "by-updated": string; "by-archived": string } };
  messages: { key: string; value: StoredMessageRepository };
  revisions: { key: string; value: { key: string; estimateId: string; revision: number; estimate: EstimateDraft; createdAt: string }; indexes: { "by-estimate": string } };
  outbox: { key: string; value: { id: string; type: string; payload: unknown; createdAt: string; attempts: number } };
  sqlite: { key: string; value: { id: string; bytes: ArrayBuffer; updatedAt: string } };
}

let dbPromise: Promise<IDBPDatabase<ProSmetSchema>> | null = null;

const db = () => {
  if (typeof window === "undefined") throw new Error("Local database is browser-only");
  dbPromise ??= openDB<ProSmetSchema>("prosmet-local-v1", 2, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        const threads = database.createObjectStore("threads", { keyPath: "id" });
        threads.createIndex("by-updated", "updatedAt");
        threads.createIndex("by-archived", "archivedAt");
        database.createObjectStore("messages", { keyPath: "threadId" });
        const revisions = database.createObjectStore("revisions", { keyPath: "key" });
        revisions.createIndex("by-estimate", "estimateId");
        database.createObjectStore("outbox", { keyPath: "id" });
        database.createObjectStore("sqlite", { keyPath: "id" });
      }
      // Version 2 changes only the serialised value shape of the messages store.
      // Existing records are migrated lazily by loadMessageRepository().
    }
  });
  return dbPromise;
};

const extractText = (message: ThreadMessage): string => message.content
  .filter((part) => part.type === "text")
  .map((part) => part.type === "text" ? part.text : "")
  .join(" ")
  .trim();

export async function ensureThread(id: string, title = "Новая смета"): Promise<LocalThread> {
  const database = await db();
  const existing = await database.get("threads", id);
  if (existing) return existing;
  const now = new Date().toISOString();
  const thread: LocalThread = { id, title, projectName: null, createdAt: now, updatedAt: now, archivedAt: null, pinned: false };
  await database.put("threads", thread);
  return thread;
}

export async function listThreads(): Promise<LocalThread[]> {
  const values = await (await db()).getAll("threads");
  return values.filter((value) => !value.archivedAt).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
}

export async function renameThread(id: string, title: string): Promise<void> {
  const database = await db();
  const current = await ensureThread(id);
  await database.put("threads", { ...current, title: title.trim().slice(0, 80) || current.title, updatedAt: new Date().toISOString() });
}

export async function loadMessageRepository(threadId: string): Promise<ExportedMessageRepository> {
  const database = await db();
  const stored = await database.get("messages", threadId);
  if (!stored) return { headId: null, messages: [] };
  if (stored.repository) return stored.repository;

  const migrated = ExportedMessageRepository.fromArray(stored.messages ?? []);
  await database.put("messages", { threadId, repository: migrated, updatedAt: new Date().toISOString() });
  return migrated;
}

export async function appendMessageRepository(threadId: string, item: ExportedMessageRepositoryItem): Promise<void> {
  const database = await db();
  const repository = await loadMessageRepository(threadId);
  const existingIndex = repository.messages.findIndex((candidate) => candidate.message.id === item.message.id);
  const messages = [...repository.messages];
  if (existingIndex >= 0) messages[existingIndex] = item;
  else messages.push(item);

  const next: ExportedMessageRepository = { headId: item.message.id, messages };
  const now = new Date().toISOString();
  await database.put("messages", { threadId, repository: next, updatedAt: now });

  const thread = await ensureThread(threadId);
  const firstUserText = item.message.role === "user" ? extractText(item.message) : "";
  const title = thread.title === "Новая смета" && firstUserText
    ? firstUserText.replace(/\s+/g, " ").slice(0, 64)
    : thread.title;
  await database.put("threads", { ...thread, title, updatedAt: now });
}

export async function loadBranchMessages(threadId: string): Promise<readonly ThreadMessage[]> {
  const repository = await loadMessageRepository(threadId);
  if (repository.messages.length === 0) return [];
  const byId = new Map(repository.messages.map((item) => [item.message.id, item]));
  let current = repository.headId ? byId.get(repository.headId) : repository.messages.at(-1);
  const branch: ThreadMessage[] = [];
  const visited = new Set<string>();

  while (current && !visited.has(current.message.id)) {
    visited.add(current.message.id);
    branch.push(current.message);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return branch.reverse();
}

export async function saveEstimateRevision(estimate: EstimateDraft): Promise<boolean> {
  const database = await db();
  const key = `${estimate.id}:${String(estimate.revision).padStart(8, "0")}`;
  const existing = await database.get("revisions", key);
  if (existing) return false;

  await database.put("revisions", { key, estimateId: estimate.id, revision: estimate.revision, estimate, createdAt: new Date().toISOString() });
  await database.put("outbox", { id: crypto.randomUUID(), type: "estimate.revision.created", payload: { estimateId: estimate.id, revision: estimate.revision, estimate }, createdAt: new Date().toISOString(), attempts: 0 });
  return true;
}

export async function loadEstimateRevisions(estimateId: string): Promise<EstimateDraft[]> {
  const database = await db();
  const values = await database.getAllFromIndex("revisions", "by-estimate", estimateId);
  return values.sort((a, b) => a.revision - b.revision).map((value) => value.estimate);
}
