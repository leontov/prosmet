"use client";

import { useAui } from "@assistant-ui/react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalculatorIcon,
  ChevronDownIcon,
  CircleHelpIcon,
  DatabaseIcon,
  FileSpreadsheetIcon,
  FolderKanbanIcon,
  MenuIcon,
  MessageSquareMoreIcon,
  MoreHorizontalIcon,
  PanelLeftCloseIcon,
  SearchIcon,
  Settings2Icon,
  SquarePenIcon,
  UserRoundIcon,
  XIcon
} from "lucide-react";
import { useMemo, useState } from "react";
import { ProsmetThread } from "@/components/chat/prosmet-thread";
import { useLocalWorkspace } from "@/lib/local/context";
import { cn } from "@/lib/utils";

export function ProsmetShell() {
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-dvh min-h-0 overflow-hidden bg-white">
      {desktopOpen && (
        <div className="hidden h-full md:block">
          <Sidebar onClose={() => setDesktopOpen(false)} />
        </div>
      )}

      {mobileOpen && (
        <div className="fixed inset-0 z-[100] md:hidden">
          <button
            type="button"
            aria-label="Закрыть меню"
            className="absolute inset-0 border-0 bg-black/25 backdrop-blur-[1px]"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative h-full w-[min(88vw,330px)] shadow-2xl">
            <Sidebar onClose={() => setMobileOpen(false)} />
          </div>
          <button
            type="button"
            aria-label="Закрыть меню"
            onClick={() => setMobileOpen(false)}
            className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 shadow-sm"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      )}

      <div className="relative flex min-w-0 flex-1 flex-col bg-white">
        <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-14 items-center justify-between px-3 md:px-5">
          <div className="pointer-events-auto flex items-center gap-1">
            {!desktopOpen && (
              <button
                type="button"
                onClick={() => setDesktopOpen(true)}
                className="hidden size-9 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 md:flex"
                aria-label="Показать боковую панель"
              >
                <MenuIcon className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="flex size-9 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 md:hidden"
              aria-label="Открыть боковое меню"
            >
              <MenuIcon className="size-4" />
            </button>
          </div>
          <button
            type="button"
            className="pointer-events-auto flex size-9 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
            aria-label="Профиль"
          >
            <UserRoundIcon className="size-[18px]" />
          </button>
        </header>

        <main className="min-h-0 flex-1 pt-14 md:pt-0">
          <ProsmetThread />
        </main>
      </div>
    </div>
  );
}

function Sidebar({ onClose }: { onClose: () => void }) {
  const workspace = useLocalWorkspace();
  const aui = useAui();
  const [query, setQuery] = useState("");
  const [menuThreadId, setMenuThreadId] = useState<string | null>(null);

  const threads = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ru-RU");
    return workspace.threads.filter((thread) => {
      if (thread.status !== "active") return false;
      return (
        !needle ||
        `${thread.title ?? "Новая задача"} ${thread.objectName}`
          .toLocaleLowerCase("ru-RU")
          .includes(needle)
      );
    });
  }, [query, workspace.threads]);

  const newThread = async () => {
    await aui.threads().switchToNewThread();
    onClose();
  };

  const selectThread = async (id: string) => {
    await aui.threads().switchToThread(id);
    onClose();
  };

  return (
    <aside className="flex h-full min-h-0 w-[330px] shrink-0 flex-col border-r border-[#e1e4f1] bg-[#eef1ff] text-[#30333b]">
      <div className="flex h-12 shrink-0 items-center gap-1 px-3 pt-1">
        <SidebarIcon label="Скрыть боковую панель" onClick={onClose}>
          <PanelLeftCloseIcon />
        </SidebarIcon>
        <SidebarIcon label="Назад" onClick={() => history.back()}>
          <ArrowLeftIcon />
        </SidebarIcon>
        <SidebarIcon label="Вперёд" onClick={() => history.forward()}>
          <ArrowRightIcon />
        </SidebarIcon>
      </div>

      <div className="flex shrink-0 items-center justify-between px-4 pb-3 pt-1">
        <button
          type="button"
          className="flex items-center gap-2 border-0 bg-transparent py-1 text-[18px] font-semibold tracking-[-0.03em]"
        >
          Просметчик
          <ChevronDownIcon className="size-4 text-neutral-500" />
        </button>
        <SidebarIcon
          label="Поиск по чатам"
          onClick={() =>
            document
              .querySelector<HTMLInputElement>('[aria-label="Поиск по чатам"]')
              ?.focus()
          }
        >
          <SearchIcon />
        </SidebarIcon>
      </div>

      <nav className="grid shrink-0 gap-0.5 px-2 text-[15px]">
        <button type="button" onClick={() => void newThread()} className="prosmet-sidebar-row">
          <SquarePenIcon className="size-[18px]" />
          <span>Новая задача</span>
        </button>
        <div className="prosmet-sidebar-row bg-white/45 font-medium" aria-current="page">
          <CalculatorIcon className="size-[18px]" />
          <span>Сметы и чаты</span>
        </div>
      </nav>

      <div className="mt-5 shrink-0 px-4 text-[13px] font-medium text-[#858a99]">
        Закреплённые
      </div>

      <div className="prosmet-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-4 pt-2">
        <div className="mb-2 rounded-xl bg-[#dfe4f6] px-3 py-2.5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <FolderKanbanIcon className="size-4" />
            Просметчик
          </div>
          <div className="mt-1 pl-6 text-xs text-[#747a8a]">
            Цифровая сметная контора
          </div>
        </div>

        <div className="relative mb-1 px-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#9297a5]" />
          <input
            aria-label="Поиск по чатам"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по чатам"
            className="h-8 w-full rounded-lg border border-transparent bg-white/35 pl-8 pr-3 text-[13px] outline-none transition focus:border-[#d5d9e7] focus:bg-white/65"
          />
        </div>

        <div className="grid gap-0.5 pl-3">
          {threads.length ? (
            threads.map((thread) => (
              <div
                key={thread.id}
                className={cn(
                  "group relative flex min-h-8 items-center rounded-lg transition hover:bg-white/45",
                  thread.id === workspace.currentThreadId && "bg-white/50"
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate border-0 bg-transparent px-2 py-1.5 pr-8 text-left text-[13px]"
                  onClick={() => void selectThread(thread.id)}
                >
                  <span className="block truncate">
                    {thread.title || "Новая задача"}
                  </span>
                  {thread.objectName && (
                    <span className="mt-0.5 block truncate text-[11px] text-[#7b8190]">
                      {thread.objectName}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className="absolute right-1 flex size-6 items-center justify-center rounded-md border-0 bg-transparent text-[#858b99] opacity-0 transition hover:bg-white/60 group-hover:opacity-100"
                  onClick={() =>
                    setMenuThreadId(menuThreadId === thread.id ? null : thread.id)
                  }
                  aria-label="Действия с чатом"
                >
                  <MoreHorizontalIcon className="size-3.5" />
                </button>
                {menuThreadId === thread.id && (
                  <div className="absolute right-0 top-8 z-50 min-w-44 rounded-xl border border-neutral-200 bg-white p-1.5 text-sm shadow-xl">
                    <button
                      type="button"
                      className="flex h-8 w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2.5 text-left hover:bg-neutral-100"
                      onClick={() => {
                        void workspace.togglePin(thread.id, !thread.pinned);
                        setMenuThreadId(null);
                      }}
                    >
                      <FileSpreadsheetIcon className="size-3.5" />
                      {thread.pinned ? "Открепить" : "Закрепить"}
                    </button>
                    <button
                      type="button"
                      className="flex h-8 w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2.5 text-left hover:bg-neutral-100"
                      onClick={() => {
                        void workspace.archiveThread(thread.id);
                        setMenuThreadId(null);
                      }}
                    >
                      В архив
                    </button>
                    <button
                      type="button"
                      className="flex h-8 w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2.5 text-left text-red-600 hover:bg-red-50"
                      onClick={() => {
                        void workspace.deleteThread(thread.id);
                        setMenuThreadId(null);
                      }}
                    >
                      Удалить
                    </button>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="px-2 py-4 text-xs leading-5 text-[#858b99]">
              {query
                ? "Ничего не найдено"
                : "Первый чат появится после отправки сообщения."}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-[#dfe3f0] px-3 py-2.5">
        <div className="mb-1 flex min-h-8 items-center gap-2.5 rounded-lg px-2 text-[12px] text-[#747a89]">
          <DatabaseIcon className="size-3.5" />
          <span className="min-w-0 flex-1 truncate">Локальная SQLite готова</span>
          <span className="size-2 rounded-full bg-emerald-500" />
        </div>
        <div className="mb-2 flex min-h-8 items-center gap-2.5 rounded-lg px-2 text-[12px] text-[#747a89]">
          <MessageSquareMoreIcon className="size-3.5" />
          <span className="min-w-0 flex-1 truncate">AG-UI streaming</span>
          <span className="size-2 rounded-full bg-emerald-500" />
        </div>
        <div className="flex items-center gap-2.5 rounded-xl px-1 py-1">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#ff947d] text-xs font-semibold text-white">
            В
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium">Владислав</span>
            <span className="block truncate text-[11px] text-[#858b99]">
              Владелец организации
            </span>
          </span>
          <SidebarIcon label="Настройки" onClick={() => undefined}>
            <Settings2Icon />
          </SidebarIcon>
          <SidebarIcon label="Помощь" onClick={() => undefined}>
            <CircleHelpIcon />
          </SidebarIcon>
        </div>
      </div>
    </aside>
  );
}

function SidebarIcon({
  label,
  onClick,
  children
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-lg border-0 bg-transparent text-[#747a89] transition hover:bg-white/55 hover:text-[#30333b] [&_svg]:size-4"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
