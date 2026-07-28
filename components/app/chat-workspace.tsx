"use client";

import {
  AuiProvider,
  Suggestions,
  Tools,
  useAui
} from "@assistant-ui/react";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BotIcon,
  CalculatorIcon,
  ChevronDownIcon,
  CircleUserRoundIcon,
  DatabaseIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderKanbanIcon,
  FolderOpenIcon,
  MenuIcon,
  MoreHorizontalIcon,
  PanelLeftCloseIcon,
  PanelRightOpenIcon,
  PinIcon,
  SearchIcon,
  Settings2Icon,
  SquarePenIcon,
  TagIcon,
  Trash2Icon,
  XIcon
} from "lucide-react";
import { useMemo, useState } from "react";
import { prosmetToolkit } from "@/app/toolkit";
import { RightInspector } from "@/components/app/right-inspector";
import { useRuntimeStatus } from "@/components/app/runtime-status";
import { ProsmetThread } from "@/components/chat/prosmet-thread";
import { useLocalWorkspace } from "@/lib/local/context";
import { cn } from "@/lib/utils";

const suggestions = Suggestions([
  {
    title: "Механизированная штукатурка 358 м²",
    label: "с технологической картой, материалами и логистикой",
    prompt:
      "Составь полную смету механизированной гипсовой штукатурки 358 м² в Лениногорске. Средний слой 15 мм. Сначала сделай технологическую карту. Учти защиту, грунтование, маяки, углы, смесь, доставку, подъём и уборку."
  },
  {
    title: "Кровля с демонтажом шифера",
    label: "ремонт основания, профлист, доборные элементы",
    prompt:
      "Составь смету замены кровли: демонтировать старый шифер, локально отремонтировать основание и смонтировать профлист. Сначала сформируй технологическую карту и покажи допущения."
  },
  {
    title: "Монтаж отопления дома",
    label: "оборудование, материалы, работы и пусконаладка",
    prompt:
      "Подготовь профессиональную смету монтажа отопления частного дома. Уточни только критичные исходные данные, затем составь технологическую карту, ресурсную ведомость и смету."
  },
  {
    title: "Смета → КП → договор",
    label: "полный комплект документов в одном чате",
    prompt:
      "Создай пример полной сметы ремонта помещения, затем коммерческое предложение и договор. Все результаты покажи как редактируемые документы в этом чате."
  }
]);

export function ChatWorkspace() {
  const workspace = useLocalWorkspace();
  const runtime = useRuntimeStatus();
  const [leftOpen, setLeftOpen] = useState(true);
  const [leftMobileOpen, setLeftMobileOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(true);
  const [rightMobileOpen, setRightMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);

  const aui = useAui({
    tools: Tools({ toolkit: prosmetToolkit }),
    suggestions
  });

  const currentThread = useMemo(
    () => workspace.threads.find((thread) => thread.id === workspace.currentThreadId),
    [workspace.currentThreadId, workspace.threads]
  );

  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("ru-RU");
    return workspace.threads.filter((thread) => {
      if (showArchive ? thread.status !== "archived" : thread.status !== "active") return false;
      return (
        !search ||
        `${thread.title ?? "Новая задача"} ${thread.objectName}`
          .toLocaleLowerCase("ru-RU")
          .includes(search)
      );
    });
  }, [query, showArchive, workspace.threads]);

  const startNew = async () => {
    await aui.threads().switchToNewThread();
    setLeftMobileOpen(false);
  };

  const leftSidebar = (
    <aside
      className="flex h-full min-h-0 w-[322px] flex-col bg-[#eef1ff] text-[#2e323b]"
      data-testid="app-sidebar"
    >
      <div className="flex h-12 shrink-0 items-center gap-1 px-3 pt-1">
        <HeaderIcon label="Скрыть боковую панель" onClick={() => {
          setLeftOpen(false);
          setLeftMobileOpen(false);
        }}>
          <PanelLeftCloseIcon />
        </HeaderIcon>
        <HeaderIcon label="Назад" onClick={() => window.history.back()}>
          <ArrowLeftIcon />
        </HeaderIcon>
        <HeaderIcon label="Вперёд" onClick={() => window.history.forward()}>
          <ArrowRightIcon />
        </HeaderIcon>
      </div>

      <div className="flex items-center justify-between px-4 pb-3 pt-1">
        <button
          type="button"
          onClick={() => void startNew()}
          className="flex min-w-0 items-center gap-2 text-[18px] font-semibold tracking-[-0.03em]"
        >
          <span className="truncate">Просметчик</span>
          <ChevronDownIcon className="size-4 text-neutral-500" />
        </button>
        <HeaderIcon
          label="Найти чат"
          onClick={() =>
            document.querySelector<HTMLInputElement>('[aria-label="Поиск по чатам"]')?.focus()
          }
        >
          <SearchIcon />
        </HeaderIcon>
      </div>

      <nav className="grid shrink-0 gap-0.5 px-2 text-[14px]">
        <button
          type="button"
          onClick={() => void startNew()}
          className="prosmet-nav-row"
        >
          <SquarePenIcon className="size-[18px]" /> Новая задача
        </button>
        <NavItem icon={<CalculatorIcon />} label="Сметы и чаты" active />
        <NavItem icon={<FolderKanbanIcon />} label="Объекты" />
        <NavItem icon={<FileSpreadsheetIcon />} label="Сметы" />
        <NavItem icon={<FileTextIcon />} label="Документы" />
        <NavItem icon={<TagIcon />} label="Каталог цен" />
      </nav>

      <div className="mt-5 px-4 text-[12px] font-medium text-[#858a99]">
        Закреплённые
      </div>
      <div className="mx-2 mt-2 rounded-xl bg-[#dfe4f6] px-3 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FolderOpenIcon className="size-4" />
          Сметная контора
        </div>
        <div className="mt-1 pl-6 text-[11px] text-[#747a8a]">
          Чаты, сметы и документы
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between px-4 text-[12px] font-medium text-[#858a99]">
        <span>{showArchive ? "Архив" : "Чаты"}</span>
        <span>{filtered.length}</span>
      </div>

      <div className="px-2 pt-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-neutral-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Поиск по чатам"
            placeholder="Поиск по чатам"
            className="h-8 w-full rounded-lg border border-transparent bg-white/40 pl-8 pr-3 text-xs outline-none transition focus:border-black/10 focus:bg-white/75"
          />
        </div>
      </div>

      <div className="prosmet-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-4 pt-2">
        {filtered.length ? (
          <div className="grid gap-0.5">
            {filtered.map((thread) => {
              const active = thread.id === workspace.currentThreadId;
              return (
                <div
                  key={thread.id}
                  className={cn(
                    "group relative flex min-h-9 items-center rounded-lg transition",
                    active ? "bg-[#dfe4fb]" : "hover:bg-black/5"
                  )}
                >
                  <button
                    type="button"
                    disabled={thread.status === "archived"}
                    onClick={() => {
                      void aui.threads().switchToThread(thread.id);
                      setLeftMobileOpen(false);
                    }}
                    className="min-w-0 flex-1 truncate px-2 py-2 pr-8 text-left text-[13px]"
                    title={thread.title ?? "Новая задача"}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      {thread.pinned && <PinIcon className="size-3 shrink-0" />}
                      <span className="truncate">{thread.title ?? "Новая задача"}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMenuId((current) => (current === thread.id ? null : thread.id))}
                    className={cn(
                      "absolute right-1 flex size-6 items-center justify-center rounded-md text-neutral-500 transition hover:bg-white/60",
                      menuId === thread.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    )}
                    aria-label="Действия с чатом"
                  >
                    <MoreHorizontalIcon className="size-3.5" />
                  </button>
                  {menuId === thread.id && (
                    <div className="absolute right-0 top-9 z-50 min-w-44 rounded-xl border border-neutral-200 bg-white p-1.5 text-sm shadow-xl">
                      {thread.status === "active" && (
                        <MenuAction onClick={() => void workspace.togglePin(thread.id, !thread.pinned).then(() => setMenuId(null))}>
                          <PinIcon className="size-3.5" />
                          {thread.pinned ? "Открепить" : "Закрепить"}
                        </MenuAction>
                      )}
                      {thread.status === "active" ? (
                        <MenuAction onClick={() => void workspace.archiveThread(thread.id).then(() => setMenuId(null))}>
                          <ArchiveIcon className="size-3.5" /> В архив
                        </MenuAction>
                      ) : (
                        <MenuAction onClick={() => void workspace.restoreThread(thread.id).then(() => setMenuId(null))}>
                          <ArchiveRestoreIcon className="size-3.5" /> Восстановить
                        </MenuAction>
                      )}
                      <MenuAction danger onClick={() => void workspace.deleteThread(thread.id).then(() => setMenuId(null))}>
                        <Trash2Icon className="size-3.5" /> Удалить
                      </MenuAction>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="px-2 py-4 text-xs leading-5 text-neutral-500">
            {query
              ? "Ничего не найдено"
              : showArchive
                ? "Архив пуст"
                : "Первый чат появится после сообщения."}
          </p>
        )}

        <button
          type="button"
          onClick={() => setShowArchive((value) => !value)}
          className="mt-3 flex h-8 items-center gap-2 rounded-lg px-2 text-xs text-neutral-500 transition hover:bg-black/5 hover:text-neutral-900"
        >
          {showArchive ? (
            <ArchiveRestoreIcon className="size-3.5" />
          ) : (
            <ArchiveIcon className="size-3.5" />
          )}
          {showArchive ? "Вернуться к чатам" : "Показать архив"}
        </button>
      </div>

      <div className="shrink-0 border-t border-black/5 px-3 py-2.5">
        <div className="mb-1 flex min-h-8 items-center gap-2.5 rounded-lg px-2 text-[11px] text-neutral-500">
          <DatabaseIcon className="size-3.5" />
          <span className="min-w-0 flex-1 truncate">
            {workspace.ready
              ? "SQLite WASM готова"
              : workspace.error || "Открываем SQLite WASM…"}
          </span>
          <StatusDot ok={workspace.ready} loading={!workspace.ready && !workspace.error} />
        </div>
        <div className="mb-2 flex min-h-8 items-center gap-2.5 rounded-lg px-2 text-[11px] text-neutral-500">
          <BotIcon className="size-3.5" />
          <span className="min-w-0 flex-1 truncate">
            {runtime.backend.loading
              ? "Проверяем backend…"
              : runtime.backend.ok
                ? `Backend · ${runtime.backend.provider}`
                : "Backend недоступен"}
          </span>
          <StatusDot ok={runtime.backend.ok} loading={runtime.backend.loading} />
        </div>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-xl px-1 py-1 text-left transition hover:bg-black/5"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-[#ff927c] text-xs font-semibold text-white">
            П
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">Просметчик</span>
            <span className="block truncate text-[10px] text-neutral-500">Владелец организации</span>
          </span>
          <Settings2Icon className="size-4 text-neutral-500" />
        </button>
      </div>
    </aside>
  );

  return (
    <AuiProvider value={aui}>
      <div className="flex h-dvh min-h-0 overflow-hidden bg-white">
        {leftOpen && (
          <div className="hidden h-full w-[322px] shrink-0 border-r border-[#e1e4f1] md:block">
            {leftSidebar}
          </div>
        )}

        {leftMobileOpen && (
          <div className="fixed inset-0 z-[120] md:hidden">
            <button
              type="button"
              aria-label="Закрыть меню"
              className="absolute inset-0 bg-black/25 backdrop-blur-[1px]"
              onClick={() => setLeftMobileOpen(false)}
            />
            <div className="relative h-full w-[min(88vw,322px)] shadow-2xl">{leftSidebar}</div>
            <button
              type="button"
              aria-label="Закрыть меню"
              onClick={() => setLeftMobileOpen(false)}
              className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-white shadow"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        )}

        <div className="flex min-w-0 flex-1">
          <main className="relative flex min-w-0 flex-1 flex-col bg-white">
            <header className="flex h-12 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-2.5 sm:px-3">
              <div className="flex min-w-0 items-center gap-1">
                {!leftOpen && (
                  <HeaderIcon label="Показать боковую панель" onClick={() => setLeftOpen(true)} className="hidden md:flex">
                    <MenuIcon />
                  </HeaderIcon>
                )}
                <HeaderIcon label="Открыть меню" onClick={() => setLeftMobileOpen(true)} className="md:hidden">
                  <MenuIcon />
                </HeaderIcon>
                <span className="mx-1 h-5 w-px bg-neutral-200" />
                <FolderOpenIcon className="size-4 shrink-0 text-neutral-500" />
                <div className="min-w-0 px-1">
                  <div className="truncate text-sm font-medium">
                    {currentThread?.title || "Новая задача"}
                  </div>
                  <div className="hidden truncate text-[10px] text-neutral-400 sm:block">
                    {currentThread?.objectName || "Просметчик · AI-сметная контора"}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <HeaderIcon
                  label="Рабочий контекст"
                  onClick={() => {
                    if (window.matchMedia("(min-width: 1024px)").matches) setRightOpen(true);
                    else setRightMobileOpen(true);
                  }}
                >
                  <PanelRightOpenIcon />
                </HeaderIcon>
                <HeaderIcon label="Настройки" onClick={() => undefined}>
                  <Settings2Icon />
                </HeaderIcon>
                <HeaderIcon label="Профиль" onClick={() => undefined}>
                  <CircleUserRoundIcon />
                </HeaderIcon>
              </div>
            </header>

            {workspace.error && (
              <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
                Локальная база не открылась: {workspace.error}
              </div>
            )}

            <div className="min-h-0 flex-1">
              <ProsmetThread />
            </div>
          </main>

          {rightOpen && (
            <div className="hidden h-full lg:block">
              <RightInspector onClose={() => setRightOpen(false)} />
            </div>
          )}
        </div>

        {rightMobileOpen && (
          <div className="fixed inset-0 z-[130] lg:hidden">
            <button
              type="button"
              aria-label="Закрыть контекст"
              className="absolute inset-0 bg-black/20 backdrop-blur-[1px]"
              onClick={() => setRightMobileOpen(false)}
            />
            <div className="absolute inset-y-0 right-0 shadow-2xl">
              <RightInspector onClose={() => setRightMobileOpen(false)} />
            </div>
          </div>
        )}
      </div>
    </AuiProvider>
  );
}

function HeaderIcon({
  label,
  onClick,
  children,
  className
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex size-8 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-black/5 hover:text-neutral-900 [&_svg]:size-4",
        className
      )}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function NavItem({
  icon,
  label,
  active = false
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn("prosmet-nav-row", active && "bg-[#dfe4fb] font-medium")}
    >
      <span className="[&_svg]:size-[18px]">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function MenuAction({
  onClick,
  danger = false,
  children
}: {
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left transition hover:bg-neutral-100",
        danger && "text-red-600 hover:bg-red-50"
      )}
    >
      {children}
    </button>
  );
}

function StatusDot({ ok, loading }: { ok: boolean; loading: boolean }) {
  return (
    <span
      className={cn(
        "size-2 rounded-full",
        loading ? "animate-pulse bg-blue-500" : ok ? "bg-emerald-500" : "bg-red-500"
      )}
    />
  );
}
