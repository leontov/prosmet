"use client";

import { AuiProvider, Suggestions, Tools, useAui } from "@assistant-ui/react";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CalculatorIcon,
  ChevronRightIcon,
  CircleUserRoundIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderKanbanIcon,
  MenuIcon,
  MessageSquareTextIcon,
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
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { prosmetToolkit } from "@/app/toolkit";
import { RightInspector } from "@/components/app/right-inspector";
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
    title: "Штукатурка 358 м²",
    label: "технология, материалы и логистика",
    prompt:
      "Составь полную смету механизированной гипсовой штукатурки 358 м² в Лениногорске. Средний слой 15 мм. Сначала сделай технологическую карту. Учти защиту, грунтование, маяки, углы, смесь, доставку, подъём и уборку."
  },
  {
    title: "Кровля 160 м²",
    label: "демонтаж, основание и новое покрытие",
    prompt:
      "Составь смету замены кровли 160 м² в Казани: демонтировать старый шифер, локально отремонтировать основание и смонтировать новое покрытие. Сначала сформируй технологическую карту и покажи все допущения."
  },
  {
    title: "Отопление дома",
    label: "оборудование, монтаж и пусконаладка",
    prompt:
      "Подготовь профессиональную смету монтажа отопления частного дома 160 м² в Альметьевске. Уточни только критичные исходные данные, затем составь технологическую карту, ресурсную ведомость и смету."
  },
  {
    title: "Смета и документы",
    label: "КП, договор, счёт и акт из одной версии",
    prompt:
      "Создай пример полной сметы ремонта помещения 80 м², затем коммерческое предложение, договор, счёт и акт. Все документы свяжи с утверждённой версией сметы."
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

export function PremiumChatWorkspace() {
  const workspace = useLocalWorkspace();
  const [view, setView] = useState<WorkspaceView>("chat");
  const [leftOpen, setLeftOpen] = useState(true);
  const [leftMobileOpen, setLeftMobileOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
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

  const normalizedQuery = query.trim().toLocaleLowerCase("ru-RU");
  const matchesSearch = (thread: LocalThread) =>
    !normalizedQuery ||
    `${thread.title ?? "Новый чат"} ${thread.objectName}`
      .toLocaleLowerCase("ru-RU")
      .includes(normalizedQuery);

  const pinnedThreads = useMemo(
    () =>
      workspace.threads.filter(
        (thread) => thread.status === "active" && thread.pinned && matchesSearch(thread)
      ),
    [normalizedQuery, workspace.threads]
  );

  const historyThreads = useMemo(
    () =>
      workspace.threads.filter((thread) => {
        if (!matchesSearch(thread)) return false;
        if (showArchive) return thread.status === "archived";
        return thread.status === "active" && !thread.pinned;
      }),
    [normalizedQuery, showArchive, workspace.threads]
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

  const saveRename = async () => {
    if (!renameTarget) return;
    await workspace.renameThread(renameTarget.id, renameValue);
    setRenameTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await workspace.deleteThread(deleteTarget.id);
    setDeleteTarget(null);
    setLeftMobileOpen(false);
  };

  const renderThread = (thread: LocalThread, pinned = false) => (
    <PremiumThreadRow
      key={thread.id}
      thread={thread}
      active={thread.id === workspace.currentThreadId}
      pinned={pinned}
      menuOpen={menuId === thread.id}
      onOpen={() => void openThread(thread.id)}
      onMenu={() => setMenuId((current) => (current === thread.id ? null : thread.id))}
      onRename={() => {
        setMenuId(null);
        setRenameTarget(thread);
        setRenameValue(thread.title || "Новый чат");
      }}
      onPin={() =>
        void workspace.togglePin(thread.id, !thread.pinned).then(() => setMenuId(null))
      }
      onArchive={() =>
        void workspace.archiveThread(thread.id).then(() => {
          setMenuId(null);
          setLeftMobileOpen(false);
        })
      }
      onRestore={() =>
        void workspace.restoreThread(thread.id).then(() => setMenuId(null))
      }
      onDelete={() => {
        setMenuId(null);
        setDeleteTarget(thread);
      }}
    />
  );

  const leftSidebar = (
    <aside className="prosmet-premium-sidebar" data-testid="app-sidebar">
      <div className="prosmet-premium-brandbar">
        <button
          type="button"
          onClick={() => navigate("chat")}
          className="prosmet-premium-brand"
          aria-label="Открыть Просметчик"
        >
          <span className="prosmet-premium-brandmark">П</span>
          <span>Просметчик</span>
        </button>
        <PremiumIconButton
          label="Скрыть боковую панель"
          onClick={() => {
            setLeftOpen(false);
            setLeftMobileOpen(false);
          }}
        >
          <PanelLeftCloseIcon />
        </PremiumIconButton>
      </div>

      <div className="px-3 pb-3">
        <button type="button" onClick={() => void startNew()} className="prosmet-premium-new-chat">
          <SquarePenIcon className="size-4" />
          <span>Новый чат</span>
        </button>
      </div>

      <nav className="prosmet-premium-nav" aria-label="Рабочие разделы">
        <PremiumNavItem
          icon={<MessageSquareTextIcon />}
          label="Чаты"
          active={view === "chat"}
          onClick={() => navigate("chat")}
        />
        <PremiumNavItem
          icon={<FolderKanbanIcon />}
          label="Объекты"
          active={view === "objects"}
          onClick={() => navigate("objects")}
        />
        <PremiumNavItem
          icon={<FileSpreadsheetIcon />}
          label="Сметы"
          active={view === "estimates"}
          onClick={() => navigate("estimates")}
        />
        <PremiumNavItem
          icon={<FileTextIcon />}
          label="Документы"
          active={view === "documents"}
          onClick={() => navigate("documents")}
        />
        <PremiumNavItem
          icon={<TagIcon />}
          label="Цены"
          active={view === "prices"}
          onClick={() => navigate("prices")}
        />
      </nav>

      <div className="prosmet-premium-history-head">
        <span>{showArchive ? "Архив" : "Недавние"}</span>
        <button
          type="button"
          onClick={() => setShowArchive((value) => !value)}
          className="prosmet-premium-history-action"
        >
          {showArchive ? "Назад" : "Архив"}
        </button>
      </div>

      <div className="px-3 pb-2">
        <label className="prosmet-premium-search">
          <SearchIcon />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Поиск по чатам"
            placeholder="Поиск"
          />
        </label>
      </div>

      <div className="prosmet-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {!showArchive && pinnedThreads.length ? (
          <section className="mb-3">
            <div className="prosmet-premium-thread-section-label">Закреплённые</div>
            <div className="grid gap-0.5">{pinnedThreads.map((thread) => renderThread(thread, true))}</div>
          </section>
        ) : null}

        {historyThreads.length ? (
          <div className="grid gap-0.5">{historyThreads.map((thread) => renderThread(thread))}</div>
        ) : (
          <p className="px-3 py-4 text-xs leading-5 text-neutral-500">
            {query ? "Ничего не найдено" : showArchive ? "Архив пуст" : "Новый чат появится после первого сообщения."}
          </p>
        )}
      </div>

      <div className="prosmet-premium-account-wrap">
        <button
          type="button"
          onClick={() => navigate("profile")}
          className={cn("prosmet-premium-account", view === "profile" && "is-active")}
        >
          <span className="prosmet-premium-avatar">П</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">Просметчик</span>
            <span className="block truncate text-[11px] text-neutral-500">Профиль и организация</span>
          </span>
          <Settings2Icon className="size-4 text-neutral-400" />
        </button>
      </div>
    </aside>
  );

  const headerTitle = view === "chat" ? currentThread?.title || "Новый чат" : viewLabels[view];
  const headerSubtitle =
    view === "chat"
      ? currentThread?.objectName || "Сметы и документы из одного диалога"
      : "Рабочий раздел Просметчика";

  return (
    <AuiProvider value={aui}>
      <div className="prosmet-premium-app-shell">
        {leftOpen ? <div className="prosmet-premium-sidebar-slot hidden md:block">{leftSidebar}</div> : null}

        {leftMobileOpen ? (
          <div className="fixed inset-0 z-[180] md:hidden">
            <button
              type="button"
              aria-label="Закрыть меню"
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
              onClick={() => setLeftMobileOpen(false)}
            />
            <div className="relative h-full w-[min(88vw,292px)] shadow-2xl">{leftSidebar}</div>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1">
          <main className="prosmet-premium-main">
            <header className="prosmet-premium-topbar">
              <div className="flex min-w-0 items-center gap-2">
                {!leftOpen ? (
                  <PremiumIconButton
                    label="Показать боковую панель"
                    onClick={() => setLeftOpen(true)}
                    className="hidden md:inline-flex"
                  >
                    <MenuIcon />
                  </PremiumIconButton>
                ) : null}
                <PremiumIconButton
                  label="Открыть меню"
                  onClick={() => setLeftMobileOpen(true)}
                  className="md:hidden"
                >
                  <MenuIcon />
                </PremiumIconButton>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-neutral-950">{headerTitle}</div>
                  <div className="hidden truncate text-[11px] text-neutral-500 sm:block">{headerSubtitle}</div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {view !== "chat" ? (
                  <button type="button" onClick={() => navigate("chat")} className="prosmet-premium-back-to-chat">
                    <MessageSquareTextIcon className="size-4" />
                    <span>Чат</span>
                  </button>
                ) : null}
                <PremiumIconButton
                  label="Рабочий контекст"
                  onClick={() => {
                    if (window.matchMedia("(min-width: 1280px)").matches) setRightOpen((value) => !value);
                    else setRightMobileOpen(true);
                  }}
                  active={rightOpen}
                >
                  <PanelRightOpenIcon />
                </PremiumIconButton>
                <PremiumIconButton
                  label="Настройки"
                  active={view === "settings"}
                  onClick={() => navigate("settings")}
                >
                  <Settings2Icon />
                </PremiumIconButton>
              </div>
            </header>

            {workspace.error ? (
              <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
                Не удалось открыть локальное хранилище: {workspace.error}
              </div>
            ) : null}

            <div className="relative min-h-0 flex-1 overflow-hidden" data-testid="universal-chat-canvas">
              <div className={cn("h-full", view !== "chat" && "hidden")} aria-hidden={view !== "chat"}>
                <ProsmetThread />
              </div>

              {view !== "chat" ? (
                <section className="h-full min-h-0 bg-white" data-testid="workspace-overlay">
                  <WorkspaceLibrary
                    view={view as LibraryView}
                    onOpenThread={openThread}
                    onStartNew={startNew}
                    onNavigate={navigate}
                  />
                </section>
              ) : null}
            </div>
          </main>

          {rightOpen ? (
            <div className="hidden h-full xl:block">
              <RightInspector onClose={() => setRightOpen(false)} />
            </div>
          ) : null}
        </div>

        {rightMobileOpen ? (
          <div className="fixed inset-0 z-[190] xl:hidden">
            <button
              type="button"
              aria-label="Закрыть контекст"
              className="absolute inset-0 bg-black/25 backdrop-blur-sm"
              onClick={() => setRightMobileOpen(false)}
            />
            <div className="absolute inset-y-0 right-0 max-w-[92vw] shadow-2xl">
              <RightInspector onClose={() => setRightMobileOpen(false)} />
            </div>
          </div>
        ) : null}

        {renameTarget ? (
          <PremiumDialog title="Переименовать чат" onClose={() => setRenameTarget(null)}>
            <input
              autoFocus
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void saveRename();
              }}
              aria-label="Новое название чата"
              className="prosmet-premium-dialog-input"
            />
            <div className="mt-5 flex justify-end gap-2">
              <PremiumDialogButton onClick={() => setRenameTarget(null)}>Отмена</PremiumDialogButton>
              <PremiumDialogButton primary onClick={() => void saveRename()}>Сохранить</PremiumDialogButton>
            </div>
          </PremiumDialog>
        ) : null}

        {deleteTarget ? (
          <PremiumDialog title="Удалить чат?" onClose={() => setDeleteTarget(null)}>
            <p className="text-sm leading-6 text-neutral-600">
              История чата «{deleteTarget.title || "Новый чат"}» будет удалена. Сохранённые сметы и документы останутся в рабочих разделах.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <PremiumDialogButton onClick={() => setDeleteTarget(null)}>Отмена</PremiumDialogButton>
              <PremiumDialogButton danger onClick={() => void confirmDelete()}>Удалить</PremiumDialogButton>
            </div>
          </PremiumDialog>
        ) : null}
      </div>
    </AuiProvider>
  );
}

function PremiumThreadRow({
  thread,
  active,
  pinned,
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
  pinned: boolean;
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
    <div data-thread-menu className={cn("prosmet-premium-thread-row", active && "is-active", menuOpen && "z-50")}>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 px-2.5 py-2 text-left">
        <span className="flex min-w-0 items-center gap-2">
          {pinned ? <PinIcon className="size-3.5 shrink-0 text-neutral-400" /> : null}
          {thread.status === "archived" ? <ArchiveIcon className="size-3.5 shrink-0 text-neutral-400" /> : null}
          <span className="truncate text-[13px]">{thread.title || "Новый чат"}</span>
        </span>
        {thread.objectName ? <span className="mt-0.5 block truncate pl-[22px] text-[10px] text-neutral-500">{thread.objectName}</span> : null}
      </button>
      <button
        type="button"
        onClick={onMenu}
        className="prosmet-premium-thread-menu"
        aria-label={`Действия: ${thread.title || "Новый чат"}`}
        aria-expanded={menuOpen}
      >
        <MoreHorizontalIcon className="size-4" />
      </button>
      {menuOpen ? (
        <div className="prosmet-premium-thread-popover">
          <PremiumMenuAction onClick={onRename}><PencilLineIcon /> Переименовать</PremiumMenuAction>
          <PremiumMenuAction onClick={onPin}><PinIcon /> {thread.pinned ? "Открепить" : "Закрепить"}</PremiumMenuAction>
          {thread.status === "archived" ? (
            <PremiumMenuAction onClick={onRestore}><ArchiveRestoreIcon /> Восстановить</PremiumMenuAction>
          ) : (
            <PremiumMenuAction onClick={onArchive}><ArchiveIcon /> В архив</PremiumMenuAction>
          )}
          <PremiumMenuAction danger onClick={onDelete}><Trash2Icon /> Удалить</PremiumMenuAction>
        </div>
      ) : null}
    </div>
  );
}

function PremiumNavItem({ icon, label, active, onClick }: { icon: ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("prosmet-premium-nav-item", active && "is-active")}>
      <span className="[&_svg]:size-[17px]">{icon}</span>
      <span>{label}</span>
      {active ? <ChevronRightIcon className="ml-auto size-3.5 text-neutral-400" /> : null}
    </button>
  );
}

function PremiumIconButton({
  label,
  onClick,
  active,
  className,
  children
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn("prosmet-premium-icon-button", active && "is-active", className)}
    >
      {children}
    </button>
  );
}

function PremiumMenuAction({ children, onClick, danger }: { children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn("prosmet-premium-menu-action", danger && "is-danger")}>
      {children}
    </button>
  );
}

function PremiumDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0 bg-black/30 backdrop-blur-sm" aria-label="Закрыть" onClick={onClose} />
      <section className="relative w-full max-w-md rounded-2xl border border-black/10 bg-white p-5 shadow-2xl">
        <header className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="prosmet-premium-icon-button" aria-label="Закрыть">
            <XIcon />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function PremiumDialogButton({ children, onClick, primary, danger }: { children: ReactNode; onClick: () => void; primary?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-10 rounded-xl px-4 text-sm font-semibold transition",
        primary && "bg-neutral-950 text-white hover:bg-black",
        danger && "bg-red-600 text-white hover:bg-red-700",
        !primary && !danger && "border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
      )}
    >
      {children}
    </button>
  );
}
