import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppView, Estimate, SystemStatus } from "@prosmet/contracts";
import {
  BotIcon,
  ChevronRightIcon,
  CircleUserRoundIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderKanbanIcon,
  MenuIcon,
  MessageSquareTextIcon,
  PlusIcon,
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
import { fetchSystemStatus } from "../features/agents/agent-api";
import { listStoredEstimates, persistEstimate } from "../features/estimate/estimate-api";

const workspaceKey = "prosmet-workspace-v1";
const legacyEstimateKey = "prosmet-greenfield-estimate";

type WorkspaceState = {
  estimates: Estimate[];
  activeEstimateId: string | null;
};

const viewMeta: Record<AppView, { title: string; subtitle: string }> = {
  chat: { title: "Новый чат", subtitle: "Диалог, расчёт и документы" },
  projects: { title: "Объекты", subtitle: "Проекты и рабочие контексты" },
  estimates: { title: "Сметы", subtitle: "Версии и утверждённые расчёты" },
  documents: { title: "Документы", subtitle: "КП, договоры, акты и счета" },
  catalog: { title: "Каталог цен", subtitle: "Цены из сохранённых расчётов" },
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

function loadWorkspace(): WorkspaceState {
  try {
    const current = window.localStorage.getItem(workspaceKey);
    if (current) {
      const parsed = JSON.parse(current) as Partial<WorkspaceState>;
      const estimates = Array.isArray(parsed.estimates) ? parsed.estimates : [];
      const activeEstimateId = typeof parsed.activeEstimateId === "string" ? parsed.activeEstimateId : estimates[0]?.id ?? null;
      return { estimates, activeEstimateId };
    }

    const legacy = window.localStorage.getItem(legacyEstimateKey);
    if (legacy) {
      const estimate = JSON.parse(legacy) as Estimate;
      return { estimates: [estimate], activeEstimateId: estimate.id };
    }
  } catch {}
  return { estimates: [], activeEstimateId: null };
}

function useSystemStatus() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await fetchSystemStatus();
        if (!cancelled) setStatus(next);
      } catch {
        if (!cancelled) setStatus(null);
      }
    };
    void load();
    window.addEventListener("prosmet:agents-changed", load);
    return () => {
      cancelled = true;
      window.removeEventListener("prosmet:agents-changed", load);
    };
  }, []);
  return status;
}

export function App() {
  const mobile = useMediaQuery("(max-width: 767px)");
  const [view, setView] = useState<AppView>("chat");
  const [workspace, setWorkspace] = useState<WorkspaceState>(() => typeof window === "undefined" ? { estimates: [], activeEstimateId: null } : loadWorkspace());
  const [estimateOpen, setEstimateOpen] = useState(false);
  const systemStatus = useSystemStatus();

  const activeEstimate = useMemo(
    () => workspace.estimates.find((estimate) => estimate.id === workspace.activeEstimateId) ?? null,
    [workspace]
  );

  useEffect(() => {
    window.localStorage.setItem(workspaceKey, JSON.stringify(workspace));
    window.localStorage.removeItem(legacyEstimateKey);
  }, [workspace]);

  useEffect(() => {
    let cancelled = false;
    void listStoredEstimates()
      .then(({ estimates }) => {
        if (cancelled || !estimates.length) return;
        setWorkspace((current) => {
          const localById = new Map(current.estimates.map((estimate) => [estimate.id, estimate]));
          for (const estimate of estimates) localById.set(estimate.id, estimate);
          const merged = [...localById.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
          const activeEstimateId = current.activeEstimateId && localById.has(current.activeEstimateId)
            ? current.activeEstimateId
            : merged[0]?.id ?? null;
          return { estimates: merged, activeEstimateId };
        });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const handleEstimateReady = useCallback((incoming: Estimate) => {
    setWorkspace((current) => {
      const index = current.estimates.findIndex((estimate) => estimate.id === incoming.id);
      const estimates = index < 0
        ? [incoming, ...current.estimates]
        : current.estimates.map((estimate, itemIndex) => itemIndex === index ? incoming : estimate);
      return { estimates, activeEstimateId: incoming.id };
    });
    setEstimateOpen(true);
  }, []);

  const updateActiveEstimate = useCallback((incoming: Estimate) => {
    setWorkspace((current) => ({
      ...current,
      estimates: current.estimates.some((estimate) => estimate.id === incoming.id)
        ? current.estimates.map((estimate) => estimate.id === incoming.id ? incoming : estimate)
        : [incoming, ...current.estimates],
      activeEstimateId: incoming.id
    }));
    void persistEstimate(incoming)
      .then((persisted) => {
        setWorkspace((current) => ({
          ...current,
          estimates: current.estimates.map((estimate) => estimate.id === persisted.id ? persisted : estimate),
          activeEstimateId: persisted.id
        }));
      })
      .catch((error) => console.error("Failed to persist estimate", error));
  }, []);

  const openEstimate = useCallback((id?: string) => {
    const targetId = id || workspace.activeEstimateId;
    if (!targetId || !workspace.estimates.some((estimate) => estimate.id === targetId)) return;
    setWorkspace((current) => ({ ...current, activeEstimateId: targetId }));
    setEstimateOpen(true);
  }, [workspace.activeEstimateId, workspace.estimates]);

  return (
    <RuntimeProvider onEstimateReady={handleEstimateReady}>
      <div className="app-root">
        {mobile ? (
          <MobileShell
            view={view}
            onView={setView}
            estimates={workspace.estimates}
            activeEstimate={activeEstimate}
            onOpenEstimate={openEstimate}
          />
        ) : (
          <DesktopShell
            view={view}
            onView={setView}
            estimates={workspace.estimates}
            activeEstimate={activeEstimate}
            onOpenEstimate={openEstimate}
            activeAgentName={systemStatus?.activeAgent?.name || null}
          />
        )}

        {estimateOpen && activeEstimate ? (
          <EstimateEditor
            mobile={mobile}
            estimate={activeEstimate}
            onChange={updateActiveEstimate}
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
  estimates: Estimate[];
  activeEstimate: Estimate | null;
  onOpenEstimate: (id?: string) => void;
};

function DesktopShell({ view, onView, estimates, activeEstimate, onOpenEstimate, activeAgentName }: ShellProps & { activeAgentName: string | null }) {
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
          <header><span>Сметы</span><button type="button" onClick={() => onView("estimates")}>Все</button></header>
          {estimates.length ? estimates.slice(0, 5).map((estimate) => (
            <button type="button" key={estimate.id} className={activeEstimate?.id === estimate.id ? "history-item active" : "history-item"} onClick={() => onOpenEstimate(estimate.id)}>
              <span className="history-icon"><FileSpreadsheetIcon /></span>
              <span><strong>{estimate.title}</strong><small>{estimate.region || "Регион не указан"}</small></span>
            </button>
          )) : <p className="sidebar-empty">Сохранённых смет пока нет</p>}
        </div>

        <div className="sidebar-footer">
          <button type="button" className={view === "account" ? "profile-button active" : "profile-button"} onClick={() => onView("account")}>
            <span className="profile-avatar-small"><CircleUserRoundIcon /></span>
            <span><strong>Кабинет</strong><small>Профиль и организация</small></span>
          </button>
          <button type="button" className={view === "settings" ? "sidebar-settings active" : "sidebar-settings"} onClick={() => onView("settings")} aria-label="Настройки"><Settings2Icon /></button>
        </div>
      </aside>

      <main className="desktop-main">
        <header className="desktop-topbar">
          <div><strong>{viewMeta[view].title}</strong><span>{viewMeta[view].subtitle}</span></div>
          <div className="topbar-actions">
            <button type="button" className="agent-button" onClick={() => onView("settings")}><BotIcon /><span>{activeAgentName || "Агент не подключён"}</span></button>
          </div>
        </header>

        <div className="desktop-content">
          <Workspace view={view} mobile={false} estimates={estimates} activeEstimate={activeEstimate} onView={onView} onOpenEstimate={onOpenEstimate} />
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
  { id: "catalog" as const, label: "Каталог цен", description: "Цены из сохранённых смет", icon: <TagIcon /> },
  { id: "account" as const, label: "Профиль", description: "Кабинет и организация", icon: <CircleUserRoundIcon /> },
  { id: "settings" as const, label: "Настройки", description: "Агенты, данные и безопасность", icon: <Settings2Icon /> }
];

function MobileShell({ view, onView, estimates, activeEstimate, onOpenEstimate }: ShellProps) {
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
        <Workspace view={view} mobile estimates={estimates} activeEstimate={activeEstimate} onView={onView} onOpenEstimate={onOpenEstimate} />
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

function Workspace({
  view,
  mobile,
  estimates,
  activeEstimate,
  onView,
  onOpenEstimate
}: {
  view: AppView;
  mobile: boolean;
  estimates: Estimate[];
  activeEstimate: Estimate | null;
  onView: (view: AppView) => void;
  onOpenEstimate: (id?: string) => void;
}) {
  if (view === "chat") return <ChatSurface mobile={mobile} hasEstimate={Boolean(activeEstimate)} onOpenEstimate={() => onOpenEstimate(activeEstimate?.id)} />;
  if (view === "account") return <AccountView mobile={mobile} />;
  if (view === "settings") return <SettingsView mobile={mobile} />;
  return <LibraryView view={view} mobile={mobile} estimates={estimates} onCreate={() => onView("chat")} onOpenEstimate={onOpenEstimate} />;
}

function NavButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: React.ReactNode; onClick: () => void }) {
  return <button type="button" className={active ? "desktop-nav-item active" : "desktop-nav-item"} onClick={onClick}>{icon}<span>{label}</span></button>;
}
