"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { browserUuid } from "@/lib/platform/browser-crypto";
import { getRepository, type LocalThread } from "@/lib/local/repository";

export type LocalWorkspace = {
  ready: boolean;
  error: string | null;
  currentThreadId: string;
  threads: LocalThread[];
  refresh: () => Promise<void>;
  selectThread: (id: string) => Promise<void>;
  createThread: () => Promise<string>;
  renameThread: (id: string, title: string) => Promise<void>;
  archiveThread: (id: string) => Promise<void>;
  restoreThread: (id: string) => Promise<void>;
  deleteThread: (id: string) => Promise<void>;
  togglePin: (id: string, pinned: boolean) => Promise<void>;
};

const WorkspaceContext = createContext<LocalWorkspace | null>(null);
const ACTIVE_THREAD_KEY = "workspace.active-thread";

function newThreadId() {
  return browserUuid();
}

export function LocalWorkspaceProvider({ children }: { children: ReactNode }) {
  // The optimistic assistant thread must be stable from the first render through
  // IndexedDB initialisation. Replacing it after hydration clears the composer and
  // makes the send button look permanently disabled on slower browsers.
  const [initialThreadId] = useState(newThreadId);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threads, setThreads] = useState<LocalThread[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState(initialThreadId);

  const refresh = useCallback(async () => {
    const repository = await getRepository();
    setThreads(await repository.listThreads());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const repository = await getRepository();
        const [storedThreads, remembered] = await Promise.all([
          repository.listThreads(),
          repository.getMeta(ACTIVE_THREAD_KEY)
        ]);
        if (cancelled) return;

        const rememberedThread =
          remembered &&
          storedThreads.some(
            (thread) => thread.id === remembered && thread.status === "active"
          )
            ? remembered
            : null;
        const next =
          rememberedThread ??
          storedThreads.find((thread) => thread.status === "active")?.id ??
          initialThreadId;

        setThreads(storedThreads);
        setCurrentThreadId((current) => (current === next ? current : next));
        await repository.setMeta(ACTIVE_THREAD_KEY, next);
        if (cancelled) return;
        setError(null);
        setReady(true);
      } catch (reason) {
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Не удалось открыть локальный IndexedDB-кэш"
          );
          setReady(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialThreadId]);

  const selectThread = useCallback(async (id: string) => {
    const repository = await getRepository();
    const thread = await repository.getThread(id);
    if (!thread || thread.status !== "active") throw new Error("Чат не найден");
    setCurrentThreadId(id);
    await repository.setMeta(ACTIVE_THREAD_KEY, id);
  }, []);

  const createThread = useCallback(async () => {
    const id = newThreadId();
    setCurrentThreadId(id);
    const repository = await getRepository();
    await repository.setMeta(ACTIVE_THREAD_KEY, id);
    return id;
  }, []);

  const mutate = useCallback(
    async (action: () => Promise<void>) => {
      await action();
      await refresh();
    },
    [refresh]
  );

  const value = useMemo<LocalWorkspace>(
    () => ({
      ready,
      error,
      currentThreadId,
      threads,
      refresh,
      selectThread,
      createThread,
      renameThread: (id, title) =>
        mutate(async () => (await getRepository()).renameThread(id, title)),
      archiveThread: (id) =>
        mutate(async () => {
          await (await getRepository()).updateThread(id, { status: "archived" });
          if (id === currentThreadId) await createThread();
        }),
      restoreThread: (id) =>
        mutate(async () =>
          (await getRepository()).updateThread(id, { status: "active" })
        ),
      deleteThread: (id) =>
        mutate(async () => {
          await (await getRepository()).deleteThread(id);
          if (id === currentThreadId) await createThread();
        }),
      togglePin: (id, pinned) =>
        mutate(async () => (await getRepository()).updateThread(id, { pinned }))
    }),
    [ready, error, currentThreadId, threads, refresh, selectThread, createThread, mutate]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useLocalWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useLocalWorkspace must be used inside LocalWorkspaceProvider");
  return value;
}
