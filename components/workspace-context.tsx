"use client";

import { createContext, useContext } from "react";
import type { LocalThread } from "@/lib/local/local-db";

export interface WorkspaceContextValue {
  activeThreadId: string;
  threads: LocalThread[];
  sidebarOpen: boolean;
  setSidebarOpen: (value: boolean) => void;
  createThread: () => Promise<void>;
  switchThread: (id: string) => Promise<void>;
  refreshThreads: () => Promise<void>;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside KolibriRuntimeProvider");
  return value;
}
