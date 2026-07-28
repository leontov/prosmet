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
  CalculatorIcon,
  ChevronDownIcon,
  CircleUserRoundIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderKanbanIcon,
  MenuIcon,
  MoreHorizontalIcon,
  PanelLeftCloseIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
  Settings2Icon,
  SquarePenIcon,
  TagIcon,
  Trash2Icon,
  XIcon
} from "lucide-react";
import { useMemo, useState } from "react";
import { prosmetToolkit } from "@/app/toolkit";
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
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);

  const aui = useAui({
    tools: Tools({ toolkit: prosmetToolkit }),
    suggestions
  });

  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("ru-RU");
    return workspace.threads.filter((thread) => {
      if (showArchive ? thread.status !== "archived" : thread.status !== "active") return false;
      return !search || `${thread.title ?? "Новая задача"} ${thread.objectName}`.toLocaleLowerCase("ru-RU").includes(search);
    });
  }, [query, showArchive, workspace.threads]);

  const startNew = async () => {
    await aui.threads().switchToNewThread();
    setMobileOpen(false);
  };

  const sidebar = (
    <aside className="flex h-full min-h-0 flex-col bg-[#eef1ff] text-neutral-900" data-testid="app-sidebar">
      <div className="flex h-12 shrink-0 items-center gap-1 px-3 pt-1">
        <button
          type="button"
          onClick={() => {
            setDesktopOpen(false);
            setMobileOpen(false);
          }}
          className="flex size-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-black/5 hover:text-neutral-900"
          aria-label="Скрыть боковую панель"
        >
          <PanelLeftCloseIcon className="size-4" />
        </button>
      </div>

      <div className="flex items-center justify-between px-4 pb-3 pt-1">
        <button type="button" onClick={() => void startNew()} className="flex items-center gap-2 text-[18px] font-semibold tracking-[-0.025em]">
          Просметчик <ChevronDownIcon className="size-4 text-neutral-500" />
        </button>
        <button type="button" onClick={() => document.querySelector<HTMLInputElement>('[aria-label="Поиск по чатам"]')?.focus()} className="flex size-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-black/5" aria-label="Найти чат">
          <SearchIcon className="size-4" />
        </button>
      </div>

      <nav className="grid shrink-0 gap-0.5 px-2 text-[14px]">
        <button type="button" onClick={() => void startNew()} className="flex h-9 items-center gap-2.5 rounded-lg px-2 text-left hover:bg-black/5">
          <SquarePenIcon className="size-[18px]" /> Новая задача
        </button>
        <NavItem icon={<CalculatorIcon />} label="Сметы и чаты" active />
        <NavItem icon={<FolderKanbanIcon />} label="Объекты" />
        <NavItem icon={<FileSpreadsheetIcon />} label="Сметы" />
        <NavItem icon={<FileTextIcon />} label="Документы" />
        <NavItem icon={<TagIcon />} label="Каталог цен" />
      </nav>

      <div className="mt-4 px-4 text-[12px] font-medium text-neutral-500">
        {showArchive ? "Архив" : "Чаты"}
      </div>
      <div className="px-2 pt-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-neutral-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Поиск по чатам"
            placeholder="Поиск"
            className="h-8 w-full rounded-lg border border-transparent bg-white/45 pl-8 pr-3 text-xs outline-none transition focus:border-black/10 focus:bg-white/75"
          />
        </div>
      </div>

      <div className="prosmet-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-4 pt-2">
        {filtered.length ? (
          <div className="grid gap-0.5">
            {filtered.map((thread) => {
              const active = thread.id === workspace.currentThreadId;
              return (
                <div key={thread.id} className={cn("group relative flex min-h-9 items-center rounded-lg", active ? "bg-[#dfe4fb]" : "hover:bg-black/5")}>
                  <button
                    type="button"
                    disabled={thread.status === "archived"}
                    onClick={() => {
                      void aui.threads().switchToThread(thread.id);
                      setMobileOpen(false);
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
                    className={cn("absolute right-1 flex size-6 items-center justify-center rounded-md text-neutral-500 hover:bg-white/60", menuId === thread.id ? "opacity-100" : "opacity-0 group-hover:opacity-100")}
                    aria-label="Действия с чатом"
                  >
                    <MoreHorizontalIcon className="size-3.5" />
                  </button>
                  {menuId === thread.id && (
                    <div className="absolute right-0 top-9 z-50 min-w-44 rounded-xl border border-neutral-200 bg-white p-1.5 text-sm shadow-xl">
                      {thread.status === "active" && (
                        <button type="button" onClick={() => void workspace.togglePin(thread.id, !thread.pinned).then(() => setMenuId(null))} className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left hover:bg-neutral-100"><PinIcon className="size-3.5" />{thread.pinned ? "Открепить" : "Закрепить"}</button>
                      )}
                      {thread.status === "active" ? (
                        <button type="button" onClick={() => void workspace.archiveThread(thread.id).then(() => setMenuId(null))} className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left hover:bg-neutral-100"><ArchiveIcon className="size-3.5" />В архив</button>
                      ) : (
                        <button type="button" onClick={() => void workspace.restoreThread(thread.id).then(() => setMenuId(null))} className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left hover:bg-neutral-100"><ArchiveRestoreIcon className="size-3.5" />Восстановить</button>
                      )}
                      <button type="button" onClick={() => void workspace.deleteThread(thread.id).then(() => setMenuId(null))} className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-red-600 hover:bg-red-50"><Trash2Icon className="size-3.5" />Удалить</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="px-2 py-4 text-xs leading-5 text-neutral-500">{query ? "Ничего не найдено" : showArchive ? "Архив пуст" : "Первый чат появится после сообщения."}</p>
        )}
        <button type="button" onClick={() => setShowArchive((value) => !value)} className="mt-3 flex h-8 items-center gap-2 rounded-lg px-2 text-xs text-neutral-500 hover:bg-black/5 hover:text-neutral-900">
          {showArchive ? <ArchiveRestoreIcon className="size-3.5" /> : <ArchiveIcon className="size-3.5" />}
          {showArchive ? "Вернуться к чатам" : "Показать архив"}
        </button>
      </div>

      <div className="shrink-0 border-t border-black/5 px-3 py-2.5">
        <button type="button" className="flex w-full items-center gap-2.5 rounded-xl px-1 py-1 text-left hover:bg-black/5">
          <span className="flex size-8 items-center justify-center rounded-full bg-[#ff927c] text-xs font-semibold text-white">П</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">Просметчик</span>
            <span className="block truncate text-[10px] text-neutral-500">Локальная база готова</span>
          </span>
          <Settings2Icon className="size-4 text-neutral-500" />
        </button>
      </div>
    </aside>
  );

  return (
    <AuiProvider value={aui}>
      <div className="flex h-dvh min-h-0 overflow-hidden bg-white">
        {desktopOpen && <div className="hidden h-full w-[320px] shrink-0 border-r border-black/5 md:block">{sidebar}</div>}
        {mobileOpen && (
          <div className="fixed inset-0 z-[120] md:hidden">
            <button type="button" aria-label="Закрыть меню" className="absolute inset-0 bg-black/25" onClick={() => setMobileOpen(false)} />
            <div className="relative h-full w-[min(88vw,320px)] shadow-2xl">{sidebar}</div>
            <button type="button" aria-label="Закрыть меню" onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-white shadow"><XIcon className="size-4" /></button>
          </div>
        )}

        <main className="relative flex min-w-0 flex-1 flex-col bg-white">
          <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-14 items-center justify-between px-3 sm:px-4">
            <div className="pointer-events-auto flex items-center gap-2">
              {!desktopOpen && (
                <button type="button" onClick={() => setDesktopOpen(true)} className="hidden size-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 md:flex" aria-label="Показать боковую панель"><MenuIcon className="size-4" /></button>
              )}
              <button type="button" onClick={() => setMobileOpen(true)} className="flex size-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 md:hidden" aria-label="Открыть меню"><MenuIcon className="size-4" /></button>
              <span className="text-sm font-semibold md:hidden">Просметчик</span>
            </div>
            <button type="button" className="pointer-events-auto flex size-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100" aria-label="Профиль"><CircleUserRoundIcon className="size-[18px]" /></button>
          </header>
          <div className="min-h-0 flex-1 pt-14 md:pt-0"><ProsmetThread /></div>
        </main>
      </div>
    </AuiProvider>
  );
}

function NavItem({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <button type="button" className={cn("flex h-9 items-center gap-2.5 rounded-lg px-2 text-left hover:bg-black/5 [&_svg]:size-[18px]", active && "bg-[#dfe4fb] font-medium")}>
      {icon}<span>{label}</span>
    </button>
  );
}
