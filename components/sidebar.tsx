"use client";

import { MessageSquareIcon, PlusIcon, SearchIcon, SettingsIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useWorkspace } from "@/components/workspace-context";

export function Sidebar() {
  const { activeThreadId, threads, sidebarOpen, setSidebarOpen, createThread, switchThread } = useWorkspace();
  const [query, setQuery] = useState("");
  const visible = useMemo(() => threads.filter((thread) => thread.title.toLocaleLowerCase("ru-RU").includes(query.toLocaleLowerCase("ru-RU"))), [threads, query]);

  return (
    <>
      {sidebarOpen ? <button type="button" className="fixed inset-0 z-30 bg-black/25 md:hidden" onClick={() => setSidebarOpen(false)} aria-label="Закрыть меню" /> : null}
      <aside className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-40 flex w-[292px] flex-col border-r border-neutral-200 bg-[var(--sidebar)] transition-transform md:static md:translate-x-0`}>
        <div className="flex h-14 items-center justify-between px-3">
          <div className="flex items-center gap-2.5 px-1">
            <div className="grid size-8 place-items-center rounded-xl bg-neutral-900 text-sm font-bold text-white">P</div>
            <span className="font-semibold tracking-tight">ProSmet</span>
          </div>
          <button type="button" className="rounded-lg p-2 hover:bg-neutral-200/60 md:hidden" onClick={() => setSidebarOpen(false)} aria-label="Закрыть меню"><XIcon className="size-4" /></button>
        </div>
        <div className="px-3 pb-3">
          <button type="button" onClick={() => void createThread()} className="flex w-full items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm font-medium shadow-sm transition hover:bg-neutral-50">
            <PlusIcon className="size-4" /> Новая смета
          </button>
          <label className="mt-3 flex items-center gap-2 rounded-xl bg-neutral-200/55 px-3 py-2 text-sm text-neutral-500">
            <SearchIcon className="size-4" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-neutral-500" placeholder="Поиск чатов" />
          </label>
        </div>
        <nav className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2">
          <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Объекты и чаты</p>
          <div className="space-y-0.5">
            {visible.map((thread) => (
              <button key={thread.id} type="button" onClick={() => void switchThread(thread.id)} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${thread.id === activeThreadId ? "bg-neutral-200/80 font-medium" : "hover:bg-neutral-200/55"}`}>
                <MessageSquareIcon className="size-4 shrink-0 text-neutral-500" />
                <span className="min-w-0 flex-1 truncate">{thread.title}</span>
              </button>
            ))}
            {visible.length === 0 ? <p className="px-3 py-5 text-center text-xs text-neutral-500">Чатов пока нет</p> : null}
          </div>
        </nav>
        <div className="border-t border-neutral-200 p-2 safe-bottom">
          <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-neutral-200/60"><SettingsIcon className="size-4" /> Настройки и провайдеры</button>
          <div className="mt-1 flex items-center gap-2 rounded-lg px-2.5 py-2">
            <div className="grid size-7 place-items-center rounded-full bg-neutral-900 text-xs font-semibold text-white">ВК</div>
            <div className="min-w-0"><p className="truncate text-xs font-medium">Владислав</p><p className="truncate text-[11px] text-neutral-500">Локальный профиль</p></div>
          </div>
        </div>
      </aside>
    </>
  );
}
