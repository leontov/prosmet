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
  return crypto.randomUUID();
}

export function LocalWorkspaceProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threads, setThreads] = useState<LocalThread[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState(newThreadId);

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
        const next =
          (remembered && storedThreads.some((thread) => thread.id === remembered && thread.status === "active")
            ? remembered
            : storedThreads.find((thread) => thread.status === "active")?.id) ?? newThreadId();
        setThreads(storedThreads);
        setCurrentThreadId(next);
        await repository.setMeta(ACTIVE_THREAD_KEY, next);
        setReady(true);
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Не удалось открыть локальную базу");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
        mutate(async () => (await getRepository()).updateThread(id, { status: "active" })),
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

  if (error) {
    return (
      <div className="grid h-dvh place-items-center bg-white px-6 text-center">
        <div className="max-w-md">
          <h1 className="text-xl font-semibold">Локальная база не открылась</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="grid h-dvh place-items-center bg-white">
        <div className="flex items-center gap-3 text-sm text-neutral-500">
          <span className="size-4 animate-spin rounded-full border-2 border-neutral-400 border-r-transparent" />
          Открываем локальную SQLite-базу…
        </div>
      </div>
    );
  }

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useLocalWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useLocalWorkspace must be used inside LocalWorkspaceProvider");
  return value;
}
