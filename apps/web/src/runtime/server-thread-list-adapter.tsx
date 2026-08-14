import {
  RuntimeAdapterProvider,
  useAui,
  type RemoteThreadListAdapter,
  type ThreadHistoryAdapter
} from "@assistant-ui/react";
import { createAssistantStream } from "assistant-stream";
import { useMemo } from "react";

type StoredMessage = { id: string; parent_id: string | null; format: string; content: Record<string, unknown> };

const LOCAL_KEY = "prosmet.assistant.threads.v1";
const DEFAULT_TITLE = "Новый чат";

function localThreads(): Array<{ id: string; title: string; status: "regular" | "archived"; messages: StoredMessage[] }> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.id === "string") : [];
  } catch {
    return [];
  }
}

function saveLocal(threads: unknown[]) {
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(threads));
}

function fallbackInitialize(id?: string | null) {
  const remoteId = id || crypto.randomUUID();
  const threads = localThreads();
  if (!threads.some((thread) => thread.id === remoteId)) {
    threads.unshift({ id: remoteId, title: DEFAULT_TITLE, status: "regular", messages: [] });
    saveLocal(threads);
  }
  return remoteId;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(init?.headers || {}) }
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.error?.message || `HTTP ${response.status}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return body as T;
}

function unauthorized(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error && (error as { status?: number }).status === 401;
}

function titleFromMessages(messages: readonly unknown[]) {
  const firstUser = messages.find((message) => typeof message === "object" && message !== null && (message as { role?: unknown }).role === "user") as { content?: unknown } | undefined;
  const text = Array.isArray(firstUser?.content)
    ? firstUser.content.find((part) => typeof part === "object" && part !== null && (part as { type?: unknown }).type === "text") as { text?: unknown } | undefined
    : undefined;
  const value = typeof text?.text === "string" ? text.text.trim() : "";
  return value ? value.slice(0, 50) : DEFAULT_TITLE;
}

export const serverThreadListAdapter: RemoteThreadListAdapter = {
  async list() {
    try {
      const result = await api<{ threads: Array<{ status: "regular" | "archived"; remoteId: string; title: string }> }>("/api/threads");
      return { threads: result.threads };
    } catch (error) {
      if (!unauthorized(error)) throw error;
      return { threads: localThreads().filter((thread) => thread.status === "regular").map((thread) => ({ status: thread.status, remoteId: thread.id, title: thread.title })) };
    }
  },

  async initialize(localId) {
    try {
      const result = await api<{ remoteId: string }>("/api/threads", { method: "POST", body: JSON.stringify({ id: localId || undefined, title: DEFAULT_TITLE }) });
      return { remoteId: result.remoteId };
    } catch (error) {
      if (!unauthorized(error)) throw error;
      return { remoteId: fallbackInitialize(localId) };
    }
  },

  async rename(remoteId, title) {
    try {
      await api(`/api/threads/${encodeURIComponent(remoteId)}`, { method: "PATCH", body: JSON.stringify({ title }) });
    } catch (error) {
      if (!unauthorized(error)) throw error;
      saveLocal(localThreads().map((thread) => thread.id === remoteId ? { ...thread, title: title.trim() || DEFAULT_TITLE } : thread));
    }
  },

  async archive(remoteId) {
    try {
      await api(`/api/threads/${encodeURIComponent(remoteId)}`, { method: "PATCH", body: JSON.stringify({ status: "archived" }) });
    } catch (error) {
      if (!unauthorized(error)) throw error;
    }
  },

  async unarchive(remoteId) {
    try {
      await api(`/api/threads/${encodeURIComponent(remoteId)}`, { method: "PATCH", body: JSON.stringify({ status: "regular" }) });
    } catch (error) {
      if (!unauthorized(error)) throw error;
    }
  },

  async delete(remoteId) {
    try {
      await api(`/api/threads/${encodeURIComponent(remoteId)}`, { method: "DELETE" });
    } catch (error) {
      if (!unauthorized(error)) throw error;
      saveLocal(localThreads().filter((thread) => thread.id !== remoteId));
    }
  },

  async fetch(remoteId) {
    try {
      return await api<{ status: "regular" | "archived"; remoteId: string; title: string }>(`/api/threads/${encodeURIComponent(remoteId)}`);
    } catch (error) {
      if (!unauthorized(error)) throw error;
      const thread = localThreads().find((candidate) => candidate.id === remoteId);
      if (!thread) throw new Error("Чат не найден");
      return { status: thread.status, remoteId: thread.id, title: thread.title };
    }
  },

  async generateTitle(_remoteId, messages) {
    const title = titleFromMessages(messages);
    return createAssistantStream(async (controller) => {
      controller.appendText(title);
    });
  },

  unstable_Provider({ children }) {
    const aui = useAui();
    const history = useMemo<ThreadHistoryAdapter>(() => ({
      async load() { return { messages: [] }; },
      async append() {},
      withFormat(fmt) {
        type FormatEntry = Parameters<typeof fmt.decode>[0];
        return {
          async load() {
            const { remoteId } = aui.threadListItem.getState();
            if (!remoteId) return { messages: [] };
            try {
              const result = await api<{ messages: StoredMessage[] }>(`/api/threads/${encodeURIComponent(remoteId)}/messages`);
              return { messages: result.messages.map((row) => fmt.decode(row as FormatEntry)) };
            } catch (error) {
              if (!unauthorized(error)) throw error;
              const thread = localThreads().find((candidate) => candidate.id === remoteId);
              return { messages: thread ? thread.messages.map((row) => fmt.decode(row as FormatEntry)) : [] };
            }
          },
          async append(item) {
            const { remoteId } = await aui.threadListItem.initialize();
            if (!remoteId) return;
            const row = {
              id: fmt.getId(item.message),
              parent_id: item.parentId,
              format: fmt.format,
              content: fmt.encode(item)
            };
            try {
              await api(`/api/threads/${encodeURIComponent(remoteId)}/messages`, { method: "POST", body: JSON.stringify({ message: row }) });
            } catch (error) {
              if (!unauthorized(error)) throw error;
              const threads = localThreads();
              const thread = threads.find((candidate) => candidate.id === remoteId);
              if (!thread) return;
              thread.messages = [...thread.messages.filter((message) => message.id !== row.id), row];
              saveLocal(threads);
            }
          }
        };
      }
    }), [aui]);
    return <RuntimeAdapterProvider adapters={{ history }}>{children}</RuntimeAdapterProvider>;
  }
};