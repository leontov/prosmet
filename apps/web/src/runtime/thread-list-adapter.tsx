import {
  RuntimeAdapterProvider,
  useAui,
  type RemoteThreadListAdapter,
  type ThreadHistoryAdapter
} from "@assistant-ui/react";
import { useMemo } from "react";

type StoredMessage = {
  id: string;
  parent_id: string | null;
  format: string;
  content: unknown;
};

type StoredThread = {
  id: string;
  title: string;
  status: "regular" | "archived";
  createdAt: string;
  updatedAt: string;
  messages: StoredMessage[];
};

const STORAGE_KEY = "prosmet.assistant.threads.v1";
const DEFAULT_TITLE = "Новый чат";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readThreads(): StoredThread[] {
  if (!canUseStorage()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is StoredThread => Boolean(item && typeof item.id === "string"));
  } catch {
    return [];
  }
}

function writeThreads(threads: StoredThread[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
}

function patchThread(id: string, patch: Partial<StoredThread>) {
  const now = new Date().toISOString();
  const threads = readThreads().map((thread) =>
    thread.id === id ? { ...thread, ...patch, updatedAt: patch.updatedAt || now } : thread
  );
  writeThreads(threads);
}

function messageTitle(message: unknown) {
  const value = message as { role?: string; content?: unknown };
  if (value.role !== "user") return "";
  if (typeof value.content === "string") return value.content.trim();
  if (Array.isArray(value.content)) {
    const text = value.content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const candidate = part as { type?: string; text?: string };
        return candidate.type === "text" ? candidate.text || "" : "";
      })
      .join(" ")
      .trim();
    return text;
  }
  return "";
}

export const threadListAdapter: RemoteThreadListAdapter = {
  async list() {
    return {
      threads: readThreads()
        .filter((thread) => thread.status === "regular")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((thread) => ({
          status: thread.status,
          remoteId: thread.id,
          title: thread.title || DEFAULT_TITLE
        }))
    };
  },

  async initialize(localId) {
    const id = localId || crypto.randomUUID();
    const now = new Date().toISOString();
    const threads = readThreads();
    if (!threads.some((thread) => thread.id === id)) {
      threads.unshift({
        id,
        title: DEFAULT_TITLE,
        status: "regular",
        createdAt: now,
        updatedAt: now,
        messages: []
      });
      writeThreads(threads);
    }
    return { remoteId: id };
  },

  async rename(remoteId, title) {
    patchThread(remoteId, { title: title.trim() || DEFAULT_TITLE });
  },

  async archive(remoteId) {
    patchThread(remoteId, { status: "archived" });
  },

  async unarchive(remoteId) {
    patchThread(remoteId, { status: "regular" });
  },

  async delete(remoteId) {
    writeThreads(readThreads().filter((thread) => thread.id !== remoteId));
  },

  async fetch(remoteId) {
    const thread = readThreads().find((item) => item.id === remoteId);
    if (!thread) throw new Error("Чат не найден");
    return {
      status: thread.status,
      remoteId: thread.id,
      title: thread.title || DEFAULT_TITLE
    };
  },

  unstable_Provider({ children }) {
    const aui = useAui();
    const history = useMemo<ThreadHistoryAdapter>(
      () => ({
        async load() {
          return { messages: [] };
        },
        async append() {},
        withFormat(fmt) {
          return {
            async load() {
              const { remoteId } = aui.threadListItem.getState();
              if (!remoteId) return { messages: [] };
              const thread = readThreads().find((item) => item.id === remoteId);
              if (!thread) return { messages: [] };
              return {
                messages: thread.messages.map((row) =>
                  fmt.decode({
                    id: row.id,
                    parent_id: row.parent_id,
                    format: row.format,
                    content: row.content
                  })
                )
              };
            },
            async append(item) {
              const { remoteId } = await aui.threadListItem.initialize();
              if (!remoteId) return;

              const threads = readThreads();
              const existing = threads.find((thread) => thread.id === remoteId);
              if (!existing) {
                await threadListAdapter.initialize(remoteId);
              }

              const current = readThreads();
              const thread = current.find((candidate) => candidate.id === remoteId);
              if (!thread) return;

              const row: StoredMessage = {
                id: fmt.getId(item.message),
                parent_id: item.parentId,
                format: fmt.format,
                content: fmt.encode(item)
              };
              const withoutDuplicate = thread.messages.filter((message) => message.id !== row.id);
              const title = thread.title === DEFAULT_TITLE ? messageTitle(item.message) : thread.title;
              const now = new Date().toISOString();
              patchThread(remoteId, {
                title: title ? title.slice(0, 72) : thread.title,
                updatedAt: now,
                messages: [...withoutDuplicate, row]
              });
            }
          };
        }
      }),
      [aui]
    );

    return <RuntimeAdapterProvider adapters={{ history }}>{children}</RuntimeAdapterProvider>;
  }
};
