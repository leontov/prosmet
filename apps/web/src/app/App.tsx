import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppView, Estimate } from "@prosmet/contracts";
import {
  BotIcon,
  ChevronRightIcon,
  CircleUserRoundIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderKanbanIcon,
  MenuIcon,
  MessageSquareTextIcon,
  PanelRightIcon,
  PlusIcon,
  SearchIcon,
  Settings2Icon,
  SparklesIcon,
  TagIcon,
  XIcon
} from "lucide-react";
import { RuntimeProvider } from "../runtime/RuntimeProvider";
import { ChatSurface } from "../features/chat/ChatSurface";
import { EstimateEditor } from "../features/estimate/EstimateEditor";
import { LibraryView } from "../features/library/LibraryView";
import { AccountView } from "../features/account/AccountView";
import { SettingsView } from "../features/settings/SettingsView";
import { demoEstimate } from "../data/demo";

const storageKey = "prosmet-greenfield-estimate";

const viewMeta: Record<AppView, { title: string; subtitle: string }> = {
  chat: { title: "Новый чат", subtitle: "Диалог, расчёт и документы" },
  projects: { title: "Объекты", subtitle: "Проекты и рабочие контексты" },
  estimates: { title: "Сметы", subtitle: "Версии и утверждённые расчёты" },
  documents: { title: "Документы", subtitle: "КП, договоры, акты и счета" },
  catalog: { title: "Каталог цен", subtitle: "Личные и региональные данные" },
  account: { title: "Кабинет", subtitle: "Профиль и организация" },
  settings: { title: "Настройки", subtitle: "Приложение, агенты и данные" }
};

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

function loadEstimate(): Estimate | null {
  try {
    const value = window.localStorage.getItem(storageKey);
    return value ? JSON.parse(value) as Estimate : null;
  } catch {
    return null;
  }
}

export function App() {
  const mobile = useMediaQuery("(max-width: 767px)");
  const [view, setView] = useState<AppView>("chat");
  const [estimate, setEstimate] = useState<Estimate | null>(() => typeof window === "undefined" ? null : loadEstimate());
  const [estimateOpen, setEstimateOpen] = useState(false);

  useEffect(() => {
    if (!estimate) return;
    window.localStorage.setItem(storageKey, JSON.stringify(estimate));
  }, [estimate]);

  const handleEstimateReady = useCallback((incoming: Estimate) => {
    setEstimate(incoming);
    setEstimateOpen(true);
  }, []);

  const openEstimate = useCallback(() => {
    setEstimate((current) => current ?? demoEstimate);
    setEstimateOpen(true);
  }, []);

  return (
    <RuntimeProvider onEstimateReady={handleEstimateReady}>
      <div className="app-root">
        {mobile ? (
          <MobileShell view={view} onView={setView} estimate={estimate} onOpenEstimate={openEstimate} />
        ) : (
          <DesktopShell view={view} onView={setView} estimate={estimate} onOpenEstimate={openEstimate} />
        )}

        {estimateOpen && estimate ? (
          <EstimateEditor
            mobile={mobile}
            estimate={estimate}
            onChange={setEstimate}
            onClose={() => setEstimateOpen(false)}
          />
        ) : null}
      </div>
    </RuntimeProvider>
  );
}

type ShellProps = {
  view: AppView;
  onView: (view: AppView) => void;
  estimate: Estimate | null;
  onOpenEstimate: () => void;
};

function DesktopShell({ view, onView, estimate, onOpenEstimate }: ShellProps) {
  const navigation = useMemo(() => [
    { id: "chat" as const, label: "Чаты", icon: <MessageSquareTextIcon /> },
    { id: "projects" as const, label: "Объекты", icon: <FolderKanbanIcon /> },
    { id: "estimates" as const, label: "Сметы", icon: <FileSpreadsheetIcon /> },
    { id: "documents" as const, label: "Документы", icon: <FileTextIcon /> },
    { id: "catalog" as const, label: "Каталог цен", icon: <TagIcon /> }
  ], []);

  return (
    <div className="desktop-shell" data-testid="desktop-shell">
      <aside className="desktop-sidebar">
        <button type="button" className="brand" onClick={() => onView("chat")}>
          <span className="brand-mark"><SparklesIcon /></span>
          <span><strong>Просметчик</strong><small>AI workspace</small></span>
        </button>

        <button type="button" className="new-chat" onClick={() => { onView("chat"); window.location.reload(); }}>
          <PlusIcon /> Новый чат
        </button>

        <nav className="desktop-nav" aria-label="Основная навигация">
          {navigation.map((item) => (
            <NavButton key={item.id} active={view === item.id} label={item.label} icon={item.icon} onClick={() => onView(item.id)} />
          ))}
        </nav>

        <div className="sidebar-history">
          <header><span>Недавние</span><button type="button">Все</button></header>
          <button type="button" className="history-item active">
            <span className="history-icon"><MessageSquareTextIcon /></span>
            <span><strong>Штукатурка квартиры</strong><small>Казань · сегодня</small></span>
          </button>
          <button type="button" className="history-item">
            <span className="history-icon"><MessageSquareTextIcon /></span>
            <span><strong>Отопление дома</strong><small>Альметьевск · вчера</small></span>
          </button>
        </div>

        <div className="sidebar-footer">
          <button type="button" className={view === "account" ? "profile-button active" : "profile-button"} onClick={() => onView("account")}>
            <span className="profile-avatar-small"><CircleUserRoundIcon /></span>
            <span><strong>Владислав</strong><small>Founder</small></span>
          </button>
          <button type="button" className={view === "settings" ? "sidebar-settings active" : "sidebar-settings"} onClick={() => onView("settings")} aria-label="Настройки"><Settings2Icon /></button>
        </div>
      </aside>

      <main className="desktop-main">
        <header className="desktop-topbar">
          <div><strong>{viewMeta[view].title}</strong><span>{viewMeta[view].subtitle}</span></div>
          <div className="topbar-actions">
            <label className="topbar-search"><SearchIcon /><input id="global-search" name="global-search" placeholder="Поиск" /></label>
            <button type="button" className="agent-button"><BotIcon /><span>Codex</span></button>
            <button type="button" className="icon-button" aria-label="Рабочий контекст"><PanelRightIcon /></button>
          </div>
        </header>

        <div className="desktop-content">
          <Workspace view={view} mobile={false} estimate={estimate} onOpenEstimate={onOpenEstimate} />
        </div>
      </main>
    </div>
  );
}

const mobileNavigation = [
  { id: "chat" as const, label: "Чат", description: "Новый диалог и расчёт", icon: <MessageSquareTextIcon /> },
  { id: "projects" as const, label: "Объекты", description: "Проекты и рабочие контексты", icon: <FolderKanbanIcon /> },
  { id: "estimates" as const, label: "Сметы", description: "Версии и утверждённые расчёты", icon: <FileSpreadsheetIcon /> },
  { id: "documents" as const, label: "Документы", description: "КП, договоры, акты и счета", icon: <FileTextIcon /> },
  { id: "catalog" as const, label: "Каталог цен", description: "Личные и региональные цены", icon: <TagIcon /> },
  { id: "account" as const, label: "Профиль", description: "Кабинет и организация", icon: <CircleUserRoundIcon /> },
  { id: "settings" as const, label: "Настройки", description: "Агенты, данные и безопасность", icon: <Settings2Icon /> }
];

function MobileShell({ view, onView, estimate, onOpenEstimate }: ShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const navigate = (nextView: AppView) => {
    onView(nextView);
    setMenuOpen(false);
  };

  return (
    <div className="mobile-shell" data-testid="mobile-shell">
      <header className="mobile-topbar">
        <button type="button" className="mobile-brand" onClick={() => navigate("chat")}>
          <span><SparklesIcon /></span>
          <strong>Просметчик</strong>
        </button>
        <button
          type="button"
          className="mobile-menu-button"
          aria-label="Открыть навигацию"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <MenuIcon />
        </button>
      </header>

      <main className="mobile-main">
        <Workspace view={view} mobile estimate={estimate} onOpenEstimate={onOpenEstimate} />
      </main>

      {menuOpen ? (
        <div className="mobile-navigation-layer">
          <button type="button" className="mobile-navigation-backdrop" aria-label="Закрыть навигацию" onClick={() => setMenuOpen(false)} />
          <section className="mobile-navigation-drawer" role="dialog" aria-modal="true" aria-label="Навигация">
            <header className="mobile-navigation-header">
              <div><strong>Разделы</strong><span>{viewMeta[view].title}</span></div>
              <button type="button" aria-label="Закрыть" onClick={() => setMenuOpen(false)}><XIcon /></button>
            </header>
            <nav className="mobile-navigation-list" aria-label="Мобильная навигация">
              {mobileNavigation.map((item) => (
                <button key={item.id} type="button" className={view === item.id ? "active" : ""} onClick={() => navigate(item.id)}>
                  <span className="mobile-navigation-icon">{item.icon}</span>
                  <span className="mobile-navigation-copy"><strong>{item.label}</strong><small>{item.description}</small></span>
                  <ChevronRightIcon />
                </button>
              ))}
            </nav>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function Workspace({ view, mobile, estimate, onOpenEstimate }: { view: AppView; mobile: boolean; estimate: Estimate | null; onOpenEstimate: () => void }) {
  if (view === "chat") return <ChatSurface mobile={mobile} hasEstimate={Boolean(estimate)} onOpenEstimate={onOpenEstimate} />;
  if (view === "account") return <AccountView mobile={mobile} />;
  if (view === "settings") return <SettingsView mobile={mobile} />;
  return <LibraryView view={view} mobile={mobile} onOpenEstimate={onOpenEstimate} />;
}

function NavButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: React.ReactNode; onClick: () => void }) {
  return <button type="button" className={active ? "desktop-nav-item active" : "desktop-nav-item"} onClick={onClick}>{icon}<span>{label}</span></button>;
}
