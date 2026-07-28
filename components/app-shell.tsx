"use client";

import { MenuIcon } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { EstimateThread } from "@/components/thread";
import { useWorkspace } from "@/components/workspace-context";

export function AppShell() {
  const { setSidebarOpen } = useWorkspace();
  return (
    <main className="flex h-dvh w-full overflow-hidden bg-white">
      <Sidebar />
      <section className="relative flex min-w-0 flex-1 flex-col bg-white">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 px-3 md:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 hover:bg-neutral-100 md:hidden" aria-label="Открыть список чатов">
              <MenuIcon className="size-5" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">ProSmet</p>
              <p className="truncate text-[11px] text-neutral-500">Главный инженер-сметчик · AG-UI</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span className="hidden rounded-full border border-neutral-200 px-2.5 py-1 sm:inline">Локальное сохранение</span>
            <span className="size-2 rounded-full bg-emerald-500" aria-label="Сервис доступен" />
          </div>
        </header>
        <div className="min-h-0 flex-1"><EstimateThread /></div>
      </section>
    </main>
  );
}
