"use client";

import { AuiProvider, Suggestions, Tools, useAui } from "@assistant-ui/react";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ChevronRightIcon,
  CircleUserRoundIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderKanbanIcon,
  HistoryIcon,
  MenuIcon,
  MessageSquareTextIcon,
  MoreHorizontalIcon,
  PanelRightOpenIcon,
  PencilLineIcon,
  PinIcon,
  SearchIcon,
  Settings2Icon,
  SparklesIcon,
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
import { useClientManifest } from "@/lib/client/use-client-manifest";
import { useLocalWorkspace } from "@/lib/local/context";
import type { LocalThread } from "@/lib/local/repository";
import { cn } from "@/lib/utils";

const suggestions = Suggestions([
  {
    title: "Штукатурка 358 м²",
    label: "Технология, материалы и логистика",
    prompt:
      "Составь полную смету механизированной гипсовой штукатурки 358 м² в Лениногорске. Средний слой 15 мм. Сначала сделай технологическую карту. Учти защиту, грунтование, маяки, углы, смесь, доставку, подъём и уборку."
  },
  {
    title: "Кровля 160 м²",
    label: "Демонтаж, основание и новое покрытие",
    prompt:
      "Составь смету замены кровли 160 м² в Казани: демонтировать старый шифер, локально отремонтировать основание и смонтировать новое покрытие. Сначала сформируй технологическую карту и покажи все допущения."
  },
  {
    title: "Отопление дома",
    label: "Оборудование, монтаж и пусконаладка",
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
  profile: "Профиль"
};

export function PremiumChatWorkspace() {
  const workspace = useLocalWorkspace();
  const { manifest, hasModule } = useClientManifest();
  const [view, setView] = useState<WorkspaceView>("chat");
  const [historyOpen, setHistoryOpen] = useState(false);
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
    () => workspace.threads.filter((thread) => thread.status === "active" && thread.pinned && matchesSearch(thread)),
    [normalizedQuery, workspace.threads]
  );

  const historyThreads = useMemo(
    () => workspace.threads.filter((thread) => {
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
      setHistoryOpen(false);
      setRightMobileOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const navigate = (next: WorkspaceView) => {
    setView(next);
    setMenuId(null);
    setHistoryOpen(false);
  };

  const startNew = async () => {
    setView("chat");
    setShowArchive(false);
    setMenuId(null);
    await aui.threads().switchToNewThread();
    setHistoryOpen(false);
  };

  const openThread = async (threadId: string) => {
    const thread = workspace.threads.find((item) => item.id === threadId);
    if (thread?.status === "archived") await workspace.restoreThread(threadId);
    await aui.threads().switchToThread(threadId);
    setView("chat");
    setShowArchive(false);
    setMenuId(null);
    setHistoryOpen(false);
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
    setHistoryOpen(false);
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
      onPin={() => void workspace.togglePin(thread.id, !thread.pinned).then(() => setMenuId(null))}
      onArchive={() => void workspace.archiveThread(thread.id).then(() => {
        setMenuId(null);
        setHistoryOpen(false);
      })}
      onRestore={() => void workspace.restoreThread(thread.id).then(() => setMenuId(null))}
      onDelete={() => {
        setMenuId(null);
        setDeleteTarget(thread);
      }}
    />
  );

  const navigation = [
    hasModule("chat") ? { view: "chat" as WorkspaceView, label: "Чаты", icon: <MessageSquareTextIcon /> } : null,
    hasModule("objects") ? { view: "objects" as WorkspaceView, label: manifest.terminology.objects || "Объекты", icon: <FolderKanbanIcon /> } : null,
    hasModule("estimates") ? { view: "estimates" as WorkspaceView, label: manifest.terminology.estimates || "Сметы", icon: <FileSpreadsheetIcon /> } : null,
    hasModule("documents") ? { view: "documents" as WorkspaceView, label: manifest.terminology.documents || "Документы", icon: <FileTextIcon /> } : null,
    hasModule("prices") ? { view: "prices" as WorkspaceView, label: manifest.terminology.prices || "Цены", icon: <TagIcon /> } : null
  ].filter(Boolean) as Array<{ view: WorkspaceView; label: string; icon: ReactNode }>;

  const sidebar = (
    <aside className="prosmet-v2-sidebar" data-testid="app-sidebar">
      <div className="prosmet-v2-brandbar">
        <button type="button" onClick={() => navigate("chat")} className="prosmet-v2-brand" aria-label="Открыть Просметчик">
          <span className="prosmet-v2-brandmark"><SparklesIcon /></span>
          <span className="min-w-0">
            <strong>{manifest.productName}</strong>
            <small>AI workspace</small>
          </span>
        </button>
      </div>

      <div className="prosmet-v2-sidebar-actions">
        <button type="button" onClick={() => void startNew()} className="prosmet-v2-new-chat">
          <SquarePenIcon />
          <span>Новый чат</span>
        </button>
      </div>

      <nav className="prosmet-v2-nav" aria-label="Рабочие разделы">
        {navigation.map((item) => (
          <PremiumNavItem key={item.view} icon={item.icon} label={item.label} active={view === item.view} onClick={() => navigate(item.view)} />
        ))}
      </nav>

      <div className="prosmet-v2-history-head">
        <div>
          <span>{showArchive ? "Архив" : "Недавние"}</span>
          <small>{showArchive ? "Сохранённые диалоги" : "Продолжите с места остановки"}</small>
        </div>
        <button type="button" onClick={() => setShowArchive((value) => !value)}>{showArchive ? "Назад" : "Архив"}</button>
      </div>

      <div className="prosmet-v2-search-wrap">
        <label className="prosmet-v2-search">
          <SearchIcon />
          <input id="prosmet-chat-search" name="prosmet-chat-search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Поиск по чатам" placeholder="Найти чат" />
        </label>
      </div>

      <div className="prosmet-v2-thread-list prosmet-scrollbar">
        {!showArchive && pinnedThreads.length ? (
          <section className="prosmet-v2-thread-section">
            <div className="prosmet-v2-thread-section-label">Закреплённые</div>
            {pinnedThreads.map((thread) => renderThread(thread, true))}
          </section>
        ) : null}
        {historyThreads.length ? historyThreads.map((thread) => renderThread(thread)) : (
          <div className="prosmet-v2-empty-history">
            <HistoryIcon />
            <p>{query ? "Ничего не найдено" : showArchive ? "Архив пуст" : "Первый диалог появится здесь автоматически."}</p>
          </div>
        )}
      </div>

      <div className="prosmet-v2-account-wrap">
        <button type="button" onClick={() => navigate("profile")} className={cn("prosmet-v2-account", view === "profile" && "is-active")}>
          <span className="prosmet-v2-avatar"><CircleUserRoundIcon /></span>
          <span className="min-w-0 flex-1">
            <strong>{manifest.organizationName || manifest.productName}</strong>
            <small>Профиль и организация</small>
          </span>
          <Settings2Icon />
        </button>
      </div>
    </aside>
  );

  const headerTitle = view === "chat" ? currentThread?.title || "Новый чат" : viewLabels[view];
  const headerSubtitle = view === "chat"
    ? currentThread?.objectName || "Диалог, расчёт и документы"
    : "Рабочий раздел";

  return (
    <AuiProvider value={aui}>
      <div className="prosmet-v2-app-shell">
        <div className="prosmet-v2-sidebar-slot hidden md:block">{sidebar}</div>

        {historyOpen ? (
          <div className="fixed inset-0 z-[180] md:hidden">
            <button type="button" aria-label="Закрыть историю" className="absolute inset-0 bg-black/35 backdrop-blur-sm" onClick={() => setHistoryOpen(false)} />
            <div className="relative h-full w-[min(88vw,336px)] shadow-2xl">{sidebar}</div>
          </div>
        ) : null}

        <main className="prosmet-v2-main">
          <header className="prosmet-v2-topbar">
            <div className="prosmet-v2-topbar-leading">
              <PremiumIconButton label="Открыть историю" onClick={() => setHistoryOpen(true)} className="md:hidden"><MenuIcon /></PremiumIconButton>
              <div className="prosmet-v2-title-block">
                <strong>{headerTitle}</strong>
                <span>{headerSubtitle}</span>
              </div>
            </div>
            <div className="prosmet-v2-topbar-actions">
              {view !== "chat" ? (
                <button type="button" onClick={() => navigate("chat")} className="prosmet-v2-back-to-chat">
                  <MessageSquareTextIcon />
                  <span>Чат</span>
                </button>
              ) : null}
              <PremiumIconButton
                label="Рабочий контекст"
                active={rightOpen}
                onClick={() => {
                  if (window.matchMedia("(min-width: 1280px)").matches) setRightOpen((value) => !value);
                  else setRightMobileOpen(true);
                }}
              >
                <PanelRightOpenIcon />
              </PremiumIconButton>
              <PremiumIconButton label="Настройки" active={view === "settings"} onClick={() => navigate("settings")}><Settings2Icon /></PremiumIconButton>
            </div>
          </header>

          {workspace.error ? <div className="prosmet-v2-storage-error">Не удалось открыть локальное хранилище: {workspace.error}</div> : null}

          <div className="prosmet-v2-canvas" data-testid="universal-chat-canvas">
            <div className={cn("h-full", view !== "chat" && "hidden")} aria-hidden={view !== "chat"}>
              <ProsmetThread />
            </div>
            {view !== "chat" ? (
              <section className="h-full min-h-0 bg-white" data-testid="workspace-overlay">
                <WorkspaceLibrary view={view as LibraryView} onOpenThread={openThread} onStartNew={startNew} onNavigate={navigate} />
              </section>
            ) : null}
          </div>

          <nav className="prosmet-v2-mobile-nav md:hidden" aria-label="Основная навигация">
            {navigation.slice(0, 4).map((item) => (
              <button key={item.view} type="button" onClick={() => navigate(item.view)} className={cn(view === item.view && "is-active")}>
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
            <button type="button" onClick={() => navigate("profile")} className={cn(view === "profile" && "is-active")}>
              <CircleUserRoundIcon />
              <span>Профиль</span>
            </button>
          </nav>
        </main>

        {rightOpen ? <div className="hidden h-full xl:block"><RightInspector onClose={() => setRightOpen(false)} /></div> : null}

        {rightMobileOpen ? (
          <div className="fixed inset-0 z-[190] xl:hidden">
            <button type="button" aria-label="Закрыть контекст" className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setRightMobileOpen(false)} />
            <div className="absolute inset-y-0 right-0 max-w-[94vw] shadow-2xl"><RightInspector onClose={() => setRightMobileOpen(false)} /></div>
          </div>
        ) : null}

        {renameTarget ? (
          <PremiumDialog title="Переименовать чат" onClose={() => setRenameTarget(null)}>
            <input id="prosmet-chat-rename" name="prosmet-chat-rename" autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveRename(); }} aria-label="Новое название чата" className="prosmet-v2-dialog-input" />
            <div className="mt-5 flex justify-end gap-2">
              <PremiumDialogButton onClick={() => setRenameTarget(null)}>Отмена</PremiumDialogButton>
              <PremiumDialogButton primary onClick={() => void saveRename()}>Сохранить</PremiumDialogButton>
            </div>
          </PremiumDialog>
        ) : null}

        {deleteTarget ? (
          <PremiumDialog title="Удалить чат?" onClose={() => setDeleteTarget(null)}>
            <p className="text-sm leading-6 text-neutral-600">История чата «{deleteTarget.title || "Новый чат"}» будет удалена. Сохранённые сметы и документы останутся в рабочих разделах.</p>
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
    <div data-thread-menu className={cn("prosmet-v2-thread-row", active && "is-active", menuOpen && "z-50")}>
      <button type="button" onClick={onOpen} className="prosmet-v2-thread-open">
        <span className="prosmet-v2-thread-icon">{pinned ? <PinIcon /> : thread.status === "archived" ? <ArchiveIcon /> : <MessageSquareTextIcon />}</span>
        <span className="min-w-0 flex-1">
          <strong>{thread.title || "Новый чат"}</strong>
          <small>{thread.objectName || "Диалог"}</small>
        </span>
      </button>
      <button type="button" onClick={onMenu} className="prosmet-v2-thread-menu" aria-label={`Действия: ${thread.title || "Новый чат"}`} aria-expanded={menuOpen}><MoreHorizontalIcon /></button>
      {menuOpen ? (
        <div className="prosmet-v2-thread-popover">
          <PremiumMenuAction onClick={onRename}><PencilLineIcon /> Переименовать</PremiumMenuAction>
          <PremiumMenuAction onClick={onPin}><PinIcon /> {thread.pinned ? "Открепить" : "Закрепить"}</PremiumMenuAction>
          {thread.status === "archived" ? <PremiumMenuAction onClick={onRestore}><ArchiveRestoreIcon /> Восстановить</PremiumMenuAction> : <PremiumMenuAction onClick={onArchive}><ArchiveIcon /> В архив</PremiumMenuAction>}
          <PremiumMenuAction danger onClick={onDelete}><Trash2Icon /> Удалить</PremiumMenuAction>
        </div>
      ) : null}
    </div>
  );
}

function PremiumNavItem({ icon, label, active, onClick }: { icon: ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("prosmet-v2-nav-item", active && "is-active")}>
      <span className="prosmet-v2-nav-icon">{icon}</span>
      <span>{label}</span>
      {active ? <ChevronRightIcon className="ml-auto" /> : null}
    </button>
  );
}

function PremiumIconButton({ label, onClick, active, className, children }: { label: string; onClick: () => void; active?: boolean; className?: string; children: ReactNode }) {
  return <button type="button" aria-label={label} title={label} aria-pressed={active} onClick={onClick} className={cn("prosmet-v2-icon-button", active && "is-active", className)}>{children}</button>;
}

function PremiumMenuAction({ children, onClick, danger }: { children: ReactNode; onClick: () => void; danger?: boolean }) {
  return <button type="button" onClick={onClick} className={cn("prosmet-v2-menu-action", danger && "is-danger")}>{children}</button>;
}

function PremiumDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[260] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0 bg-black/35 backdrop-blur-sm" aria-label="Закрыть" onClick={onClose} />
      <section className="prosmet-v2-dialog">
        <header><h2>{title}</h2><button type="button" onClick={onClose} className="prosmet-v2-icon-button" aria-label="Закрыть"><XIcon /></button></header>
        {children}
      </section>
    </div>
  );
}

function PremiumDialogButton({ children, onClick, primary, danger }: { children: ReactNode; onClick: () => void; primary?: boolean; danger?: boolean }) {
  return <button type="button" onClick={onClick} className={cn("prosmet-v2-dialog-button", primary && "is-primary", danger && "is-danger")}>{children}</button>;
}
