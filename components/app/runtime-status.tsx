"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useLocalWorkspace } from "@/lib/local/context";
import { getSyncSummary, syncWorkspace, type SyncStatus } from "@/lib/local/sync";

type BackendStatus = {
  loading: boolean;
  ok: boolean;
  runtime: string;
  provider: string;
  databaseConfigured: boolean;
  databaseConnected: boolean;
  databaseLatencyMs: number | null;
  message: string | null;
};

type RuntimeStatusValue = {
  backend: BackendStatus;
  sync: SyncStatus;
  refreshBackend: () => Promise<void>;
  syncNow: () => Promise<void>;
};

const RuntimeStatusContext = createContext<RuntimeStatusValue | null>(null);

const initialBackend: BackendStatus = {
  loading: true,
  ok: false,
  runtime: "next-node",
  provider: "unknown",
  databaseConfigured: false,
  databaseConnected: false,
  databaseLatencyMs: null,
  message: null
};

const initialSync: SyncStatus = { state: "idle", pending: 0, cursor: 0 };

export function RuntimeStatusProvider({ children }: { children: ReactNode }) {
  const workspace = useLocalWorkspace();
  const [backend, setBackend] = useState<BackendStatus>(initialBackend);
  const [sync, setSync] = useState<SyncStatus>(initialSync);
  const syncing = useRef(false);

  const refreshBackend = useCallback(async () => {
    setBackend((current) => ({ ...current, loading: true }));
    try {
      const response = await fetch("/api/backend/status", {
        credentials: "same-origin",
        cache: "no-store"
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        runtime?: string;
        agent?: { provider?: string };
        database?: {
          configured?: boolean;
          connected?: boolean;
          latencyMs?: number | null;
          message?: string | null;
        };
      };
      setBackend({
        loading: false,
        ok: Boolean(payload.ok && response.ok),
        runtime: payload.runtime || "next-node",
        provider: payload.agent?.provider || "unknown",
        databaseConfigured: Boolean(payload.database?.configured),
        databaseConnected: Boolean(payload.database?.connected),
        databaseLatencyMs:
          typeof payload.database?.latencyMs === "number"
            ? payload.database.latencyMs
            : null,
        message: payload.database?.message || null
      });
    } catch (error) {
      setBackend({
        ...initialBackend,
        loading: false,
        message: error instanceof Error ? error.message : "Backend unavailable"
      });
    }
  }, []);

  const syncNow = useCallback(async () => {
    if (!workspace.ready || syncing.current) return;
    syncing.current = true;
    try {
      const summary = await getSyncSummary();
      setSync({ state: "syncing", pending: summary.pending, cursor: summary.cursor });
      const result = await syncWorkspace();
      setSync(result);
      await workspace.refresh();
    } finally {
      syncing.current = false;
    }
  }, [workspace.ready, workspace.refresh]);

  useEffect(() => {
    void refreshBackend();
    const timer = window.setInterval(() => void refreshBackend(), 30_000);
    return () => window.clearInterval(timer);
  }, [refreshBackend]);

  useEffect(() => {
    if (!workspace.ready) return;
    void syncNow();
    const timer = window.setInterval(() => void syncNow(), 30_000);
    const onOnline = () => void syncNow();
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncNow();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [workspace.ready, syncNow]);

  const value = useMemo<RuntimeStatusValue>(
    () => ({ backend, sync, refreshBackend, syncNow }),
    [backend, sync, refreshBackend, syncNow]
  );

  return (
    <RuntimeStatusContext.Provider value={value}>
      {children}
    </RuntimeStatusContext.Provider>
  );
}

export function useRuntimeStatus() {
  const value = useContext(RuntimeStatusContext);
  if (!value) {
    throw new Error("useRuntimeStatus must be used inside RuntimeStatusProvider");
  }
  return value;
}
