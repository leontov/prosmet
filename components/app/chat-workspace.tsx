"use client";

import { AuiProvider, Suggestions, Tools, useAui } from "@assistant-ui/react";
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
  PencilLineIcon,
  PinIcon,
  SearchIcon,
  Settings2Icon,
  SquarePenIcon,
  TagIcon,
  Trash2Icon,
  XIcon
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { prosmetToolkit } from "@/app/toolkit";
import { RightInspector } from "@/components/app/right-inspector";
import { useRuntimeStatus } from "@/components/app/runtime-status";
import {
  WorkspaceLibrary,
  type LibraryView,
  type WorkspaceView
} from "@/components/app/workspace-library";
import { ProsmetThread } from "@/components/chat/prosmet-thread";
import { useLocalWorkspace } from "@/lib/local/context";
import type { LocalThread } from "@/lib/local/repository";
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

const viewLabels: Record<Exclude<WorkspaceView, "chat">, string> = {
  objects: "Объекты",
  estimates: "Сметы",
  documents: "Документы",
  prices: "Каталог цен",
  settings: "Настройки",
  profile: "Профиль и организация"
};

export function ChatWorkspace() {
  const workspace = useLocalWorkspace();
  const runtime = useRuntimeStatus();
  const [view, setView] = useState<WorkspaceView>("chat");
  const [leftOpen, setLeftOpen] = useState(true);
  const [leftMobileOpen, setLeftMobileOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(true);
  const [rightMobileOpen, setRightMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<LocalThread | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<LocalThread | null>(null);

  const aui = useAui({
    tools: Tools({ toolkit: prosmetToolkit }),
    suggestions
  });

  const currentThread = useMemo(
    () => workspace.threads.find((thread) => thread.id === workspace.currentThreadId),
    [workspace.currentThreadId, workspace.threads]
  );

  const search = query.trim().toLocaleLowerCase("ru-RU");
  const matchesSearch = (thread: LocalThread) =>
    !search ||
    `${thread.title ?? "Новая задача"} ${thread.objectName}`
      .toLocaleLowerCase("ru-RU")
      .includes(search);

  const pinnedThreads = useMemo(
    () =>
      workspace.threads.filter(
        (thread) => thread.status === "active" && thread.pinned && matchesSearch(thread)
      ),
    [search, workspace.threads]
  );

  const historyThreads = useMemo(
    () =>
      workspace.threads.filter((thread) => {
        if (!matchesSearch(thread)) return false;
        if (showArchive) return thread.status === "archived";
        return thread.status === "active" && !thread.pinned;
      }),
    [search, showArchive, workspace.threads]
  );

  useEffect(() => {
    const closeMenu = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-thread-menu]")) return;
      setMenuId(null);
    };
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuId(null);
      setRenameTarget(null);
      setDeleteTarget(null);
      setLeftMobileOpen(false);
      setRightMobileOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const navigate = (next: WorkspaceView) => {
    setView(next);
    setMenuId(null);
    setLeftMobileOpen(false);
  };

  const startNew = async () => {
    setView("chat");
    setShowArchive(false);
    setMenuId(null);
    await aui.threads().switchToNewThread();
    setLeftMobileOpen(false);
  };

  const openThread = async (threadId: string) => {
    const thread = workspace.threads.find((item) => item.id === threadId);
    if (thread?.status === "archived") await workspace.restoreThread(threadId);
    await aui.threads().switchToThread(threadId);
    setView("chat");
    setShowArchive(false);
    setMenuId(null);
    setLeftMobileOpen(false);
  };

  const beginRename = (thread: LocalThread) => {
    setMenuId(null);
    setRenameTarget(thread);
    setRenameValue(thread.title || "Новая задача");
  };

  const saveRename = async () => {
    if (!renameTarget) return;
    await workspace.renameThread(renameTarget.id, renameValue);
    setRenameTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await workspace.deleteThread(deleteTarget.id);
    setDeleteTarget(null);
  };

  const leftSidebar = (
    <aside
      className="flex h-full min-h-0 w-[322px] flex-col bg-[#eef1ff] text-[#2e323b]"
      data-testid="app-sidebar"
    >
      <div className="flex h-12 shrink-0 items-center gap-1 px-3 pt-1">
        <HeaderIcon
          label="Скрыть боковую панель"
          onClick={() => {
            setLeftOpen(false);
            setLeftMobileOpen(false);
          }}
        >
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
          onClick={() => navigate("chat")}
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
        <button type="button" onClick={() => void startNew()} className="prosmet-nav-row">
          <SquarePenIcon className="size-[18px]" /> Новая задача
        </button>
        <NavItem
          icon={<CalculatorIcon />}
          label="Сметы и чаты"
          active={view === "chat"}
          onClick={() => navigate("chat")}
        />
        <NavItem
          icon={<FolderKanbanIcon />}
          label="Объекты"
          active={view === "objects"}
          onClick={() => navigate("objects")}
        />
        <NavItem
          icon={<FileSpreadsheetIcon />}
          label="Сметы"
          active={view === "estimates"}
          onClick={() => navigate("estimates")}
        />
        <NavItem
          icon={<FileTextIcon />}
          label="Документы"
          active={view === "documents"}
          onClick={() => navigate("documents")}
        />
        <NavItem
          icon={<TagIcon />}
          label="Каталог цен"
          active={view === "prices"}
          onClick={() => navigate("prices")}
        />
      </nav>

      {!showArchive ? (
        <>
          <div className="mt-5 flex items-center justify-between px-4 text-[12px] font-medium text-[#858a99]">
            <span>Закреплённые</span>
            <span>{pinnedThreads.length}</span>
          </div>
          <div className="px-2 pt-2">
            {pinnedThreads.length ? (
              <div className="grid gap-1">
                {pinnedThreads.map((thread) => (
                  <ThreadRow
                    key={thread.id}
                    thread={thread}
                    active={thread.id === workspace.currentThreadId && view === "chat"}
                    pinned
                    menuOpen={menuId === thread.id}
                    onOpen={() => void openThread(thread.id)}
                    onMenu={() => setMenuId((current) => (current === thread.id ? null : thread.id))}
                    onRename={() => beginRename(thread)}
                    onPin={() =>
                      void workspace.togglePin(thread.id, false).then(() => setMenuId(null))
                    }
                    onArchive={() =>
                      void workspace.archiveThread(thread.id).then(() => setMenuId(null))
                    }
                    onRestore={() => undefined}
                    onDelete={() => {
                      setMenuId(null);
                      setDeleteTarget(thread);
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[#cfd5e7] px-3 py-3 text-[11px] leading-5 text-[#7b8190]">
                Закрепите важный чат через меню <strong>•••</strong> — он появится здесь.
              </div>
            )}
          </div>
        </>
      ) : null}

      <div className="mt-4 flex items-center justify-between px-4 text-[12px] font-medium text-[#858a99]">
        <span>{showArchive ? "Архив" : "История чатов"}</span>
        <span>{historyThreads.length}</span>
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
        {historyThreads.length ? (
          <div className="grid gap-0.5">
            {historyThreads.map((thread) => (
              <ThreadRow
                key={thread.id}
                thread={thread}
                active={thread.id === workspace.currentThreadId && view === "chat"}
                menuOpen={menuId === thread.id}
                onOpen={() => void openThread(thread.id)}
                onMenu={() => setMenuId((current) => (current === thread.id ? null : thread.id))}
                onRename={() => beginRename(thread)}
                onPin={() =>
                  void workspace.togglePin(thread.id, !thread.pinned).then(() => setMenuId(null))
                }
                onArchive={() =>
                  void workspace.archiveThread(thread.id).then(() => setMenuId(null))
                }
                onRestore={() =>
                  void workspace.restoreThread(thread.id).then(() => setMenuId(null))
                }
                onDelete={() => {
                  setMenuId(null);
                  setDeleteTarget(thread);
                }}
              />
            ))}
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
          onClick={() => {
            setShowArchive((value) => !value);
            setMenuId(null);
          }}
          className="mt-3 flex h-8 items-center gap-2 rounded-lg px-2 text-xs text-neutral-500 transition hover:bg-black/5 hover:text-neutral-900"
        >
          {showArchive ? (
            <ArchiveRestoreIcon className="size-3.5" />
          ) : (
            <ArchiveIcon className="size-3.5" />
          )}
          {showArchive ? "Вернуться к истории" : "Показать архив"}
        </button>
      </div>

      <div className="shrink-0 border-t border-black/5 px-3 py-2.5">
        <div className="mb-1 flex min-h-8 items-center gap-2.5 rounded-lg px-2 text-[11px] text-neutral-500">
          <DatabaseIcon className="size-3.5" />
          <span className="min-w-0 flex-1 truncate">
            {workspace.ready
              ? "IndexedDB-кэш готов"
              : workspace.error || "Открываем IndexedDB-кэш…"}
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
          onClick={() => navigate("profile")}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-xl px-1 py-1 text-left transition hover:bg-black/5",
            view === "profile" && "bg-white/55"
          )}
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-[#ff927c] text-xs font-semibold text-white">
            П
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">Просметчик</span>
            <span className="block truncate text-[10px] text-neutral-500">
              Профиль и организация
            </span>
          </span>
          <Settings2Icon className="size-4 text-neutral-500" />
        </button>
      </div>
    </aside>
  );

  const headerTitle = view === "chat" ? currentThread?.title || "Новая задача" : viewLabels[view];
  const headerSubtitle =
    view === "chat"
      ? currentThread?.objectName || "Просметчик · AI-сметная контора"
      : "Просметчик · рабочее пространство";

  return (
    <AuiProvider value={aui}>
      <div className="flex h-dvh min-h-0 overflow-hidden bg-white">
        {leftOpen ? (
          <div className="hidden h-full w-[322px] shrink-0 border-r border-[#e1e4f1] md:block">
            {leftSidebar}
          </div>
        ) : null}

        {leftMobileOpen ? (
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
        ) : null}

        <div className="flex min-w-0 flex-1">
          <main className="relative flex min-w-0 flex-1 flex-col bg-white">
            <header className="flex h-12 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-2.5 sm:px-3">
              <div className="flex min-w-0 items-center gap-1">
                {!leftOpen ? (
                  <HeaderIcon
                    label="Показать боковую панель"
                    onClick={() => setLeftOpen(true)}
                    className="hidden md:flex"
                  >
                    <MenuIcon />
                  </HeaderIcon>
                ) : null}
                <HeaderIcon
                  label="Открыть меню"
                  onClick={() => setLeftMobileOpen(true)}
                  className="md:hidden"
                >
                  <MenuIcon />
                </HeaderIcon>
                <span className="mx-1 h-5 w-px bg-neutral-200" />
                <span className="shrink-0 text-neutral-500">{headerIcon(view)}</span>
                <div className="min-w-0 px-1">
                  <div className="truncate text-sm font-medium">{headerTitle}</div>
                  <div className="hidden truncate text-[10px] text-neutral-400 sm:block">
                    {headerSubtitle}
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
                <HeaderIcon
                  label="Настройки"
                  active={view === "settings"}
                  onClick={() => navigate("settings")}
                >
                  <Settings2Icon />
                </HeaderIcon>
                <HeaderIcon
                  label="Профиль"
                  active={view === "profile"}
                  onClick={() => navigate("profile")}
                >
                  <CircleUserRoundIcon />
                </HeaderIcon>
              </div>
            </header>

            {workspace.error ? (
              <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
                Локальный кэш не открылся: {workspace.error}
              </div>
            ) : null}

            <div className="min-h-0 flex-1">
              {view === "chat" ? (
                <ProsmetThread />
              ) : (
                <WorkspaceLibrary
                  view={view as LibraryView}
                  onOpenThread={openThread}
                  onStartNew={startNew}
                  onNavigate={navigate}
                />
              )}
            </div>
          </main>

          {rightOpen ? (
            <div className="hidden h-full lg:block">
              <RightInspector onClose={() => setRightOpen(false)} />
            </div>
          ) : null}
        </div>

        {rightMobileOpen ? (
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
        ) : null}

        {renameTarget ? (
          <Dialog title="Переименовать чат" onClose={() => setRenameTarget(null)}>
            <input
              autoFocus
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void saveRename();
              }}
              aria-label="Новое название чата"
              className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-sm outline-none focus:border-neutral-400 focus:bg-white"
            />
            <div className="mt-4 flex justify-end gap-2">
              <DialogButton onClick={() => setRenameTarget(null)}>Отмена</DialogButton>
              <DialogButton primary onClick={() => void saveRename()}>
                Сохранить
              </DialogButton>
            </div>
          </Dialog>
        ) : null}

        {deleteTarget ? (
          <Dialog title="Удалить историю чата?" onClose={() => setDeleteTarget(null)}>
            <p className="text-sm leading-6 text-neutral-600">
              Чат «{deleteTarget.title || "Новая задача"}» и его сообщения будут удалены.
              Сохранённые сметы, документы и подтверждённые цены останутся в рабочих разделах.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <DialogButton onClick={() => setDeleteTarget(null)}>Отмена</DialogButton>
              <DialogButton danger onClick={() => void confirmDelete()}>
                Удалить
              </DialogButton>
            </div>
          </Dialog>
        ) : null}
      </div>
    </AuiProvider>
  );
}

function ThreadRow({
  thread,
  active,
  pinned = false,
  menuOpen,
  onOpen,
  onMenu,
  onRename,
  onPin,
  onArchive,
  onRestore,
  onDelete
}: {
  thread: LocalThread;
  active: boolean;
  pinned?: boolean;
  menuOpen: boolean;
  onOpen: () => void;
  onMenu: () => void;
  onRename: () => void;
  onPin: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      data-thread-menu
      className={cn(
        "group relative flex min-h-9 items-center rounded-lg transition",
        pinned ? "bg-[#dfe4f6]" : active ? "bg-[#dfe4fb]" : "hover:bg-black/5",
        menuOpen && "z-[70]"
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 truncate px-2 py-2 pr-8 text-left text-[13px]"
        title={thread.title ?? "Новая задача"}
      >
        <span className="flex items-center gap-1.5 truncate">
          {thread.pinned ? <PinIcon className="size-3 shrink-0" /> : null}
          {thread.status === "archived" ? <ArchiveIcon className="size-3 shrink-0" /> : null}
          <span className="truncate">{thread.title ?? "Новая задача"}</span>
        </span>
        {thread.objectName ? (
          <span className="mt-0.5 block truncate pl-[18px] text-[10px] text-neutral-500">
            {thread.objectName}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        onClick={onMenu}
        className={cn(
          "absolute right-1 flex size-6 items-center justify-center rounded-md text-neutral-500 transition hover:bg-white/60",
          menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
        aria-label={`Действия: ${thread.title || "Новая задача"}`}
        aria-expanded={menuOpen}
      >
        <MoreHorizontalIcon className="size-3.5" />
      </button>
      {menuOpen ? (
        <div className="absolute right-0 top-9 z-[80] min-w-48 rounded-xl border border-neutral-200 bg-white p-1.5 text-sm shadow-xl">
          <MenuAction onClick={onRename}>
            <PencilLineIcon className="size-3.5" /> Переименовать
          </MenuAction>
          {thread.status === "active" ? (
            <MenuAction onClick={onPin}>
              <PinIcon className="size-3.5" /> {thread.pinned ? "Открепить" : "Закрепить"}
            </MenuAction>
          ) : null}
          {thread.status === "active" ? (
            <MenuAction onClick={onArchive}>
              <ArchiveIcon className="size-3.5" /> В архив
            </MenuAction>
          ) : (
            <MenuAction onClick={onRestore}>
              <ArchiveRestoreIcon className="size-3.5" /> Восстановить
            </MenuAction>
          )}
          <MenuAction danger onClick={onDelete}>
            <Trash2Icon className="size-3.5" /> Удалить
          </MenuAction>
        </div>
      ) : null}
    </div>
  );
}

function HeaderIcon({
  label,
  onClick,
  children,
  className,
  active = false
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex size-8 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-black/5 hover:text-neutral-900 [&_svg]:size-4",
        active && "bg-neutral-100 text-neutral-900",
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
  active,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
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

function Dialog({
  title,
  onClose,
  children
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="Закрыть диалог"
        className="absolute inset-0 bg-black/25 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex size-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100"
          >
            <XIcon className="size-4" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function DialogButton({
  onClick,
  children,
  primary = false,
  danger = false
}: {
  onClick: () => void;
  children: React.ReactNode;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-9 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium hover:bg-neutral-50",
        primary && "border-neutral-900 bg-neutral-900 text-white hover:bg-black",
        danger && "border-red-600 bg-red-600 text-white hover:bg-red-700"
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
        loading ? "animate-pulse bg-blue-400" : ok ? "bg-emerald-500" : "bg-red-500"
      )}
    />
  );
}

function headerIcon(view: WorkspaceView) {
  if (view === "objects") return <FolderKanbanIcon className="size-4" />;
  if (view === "estimates") return <FileSpreadsheetIcon className="size-4" />;
  if (view === "documents") return <FileTextIcon className="size-4" />;
  if (view === "prices") return <TagIcon className="size-4" />;
  if (view === "settings") return <Settings2Icon className="size-4" />;
  if (view === "profile") return <CircleUserRoundIcon className="size-4" />;
  return <FolderOpenIcon className="size-4" />;
}
