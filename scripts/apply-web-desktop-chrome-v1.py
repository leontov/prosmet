from pathlib import Path
import re

path = Path("apps/web/src/app/ProfessionalApp.tsx")
source = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global source
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one target, found {count}")
    source = source.replace(old, new, 1)


replace_once(
    '''  MoreHorizontalIcon,
  PlusIcon,
  RefreshCwIcon,
  Settings2Icon,
  SparklesIcon,
  TagIcon,
  XIcon''',
    '''  MoreHorizontalIcon,
  MoonIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Settings2Icon,
  SparklesIcon,
  SunIcon,
  TagIcon,
  XIcon''',
    "lucide imports",
)
replace_once(
    '''import { WorkspaceCanvasFrame } from "../features/workspace/WorkspaceCanvasFrame";''',
    '''import {
  WorkspaceCanvasFrame,
  type WorkspaceThemeMode
} from "../features/workspace/WorkspaceCanvasFrame";''',
    "workspace import",
)
replace_once(
    '''const viewMeta: Record<WorkspaceView, { title: string; subtitle: string }> = {
  chat: { title: "Новый чат", subtitle: "Смета создаётся только после полноценного расчёта" },
  projects: { title: "Проекты", subtitle: "Смета → договор → выполнение → закрывающие документы" },
  estimates: { title: "Сметы", subtitle: "Версии, согласование и исходные значения" },
  documents: { title: "Документы", subtitle: "КП, счёт, договор, акт, КС-2 и КС-3" },
  prices: { title: "Справочник цен", subtitle: "Региональные данные из проверенных расчётов" },
  account: { title: "Кабинет", subtitle: "Организация, реквизиты и состояние сервиса" },
  settings: { title: "Настройки", subtitle: "ИИ-агенты, Qwen, безопасность и данные" }
};''',
    '''const viewMeta: Record<WorkspaceView, { title: string; subtitle: string }> = {
  chat: { title: "Новый чат", subtitle: "Смета создаётся только после полноценного расчёта" },
  projects: { title: "Проекты", subtitle: "Смета → договор → выполнение → закрывающие документы" },
  estimates: { title: "Сметы", subtitle: "Версии, согласование и исходные значения" },
  documents: { title: "Документы", subtitle: "КП, счёт, договор, акт, КС-2 и КС-3" },
  prices: { title: "Справочник цен", subtitle: "Региональные данные из проверенных расчётов" },
  account: { title: "Кабинет", subtitle: "Организация, реквизиты и состояние сервиса" },
  settings: { title: "Настройки", subtitle: "ИИ-агенты, Qwen, безопасность и данные" }
};

const workspaceThemeKey = "prosmet.workspace.theme.v1";
const workspaceSidebarCollapsedKey = "prosmet.workspace.sidebar-collapsed.v1";

function readWorkspaceTheme(): WorkspaceThemeMode {
  const value = window.localStorage.getItem(workspaceThemeKey);
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

function readSidebarCollapsed() {
  return window.localStorage.getItem(workspaceSidebarCollapsedKey) === "true";
}''',
    "workspace preferences",
)
replace_once(
    '''  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);''',
    '''  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [themeMode, setThemeMode] = useState<WorkspaceThemeMode>(() => readWorkspaceTheme());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readSidebarCollapsed());''',
    "workspace states",
)
replace_once(
    '''  useEffect(() => {
    let active = true;
    void refresh().finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);''',
    '''  useEffect(() => {
    let active = true;
    void refresh().finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);

  useEffect(() => {
    document.documentElement.dataset.prosmetTheme = themeMode;
    window.localStorage.setItem(workspaceThemeKey, themeMode);
  }, [themeMode]);

  useEffect(() => {
    window.localStorage.setItem(workspaceSidebarCollapsedKey, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const cycleTheme = useCallback(() => {
    setThemeMode((current) => current === "system" ? "light" : current === "light" ? "dark" : "system");
  }, []);''',
    "workspace effects",
)
replace_once(
    '''        <WorkspaceCanvasFrame
          canvas={desktopCanvas}
          canvasTitle={desktopCanvasTitle}
          canvasSubtitle={desktopCanvasSubtitle}
          onCloseCanvas={closeDesktopCanvas}
        >''',
    '''        <WorkspaceCanvasFrame
          canvas={desktopCanvas}
          canvasTitle={desktopCanvasTitle}
          canvasSubtitle={desktopCanvasSubtitle}
          sidebarCollapsed={sidebarCollapsed}
          themeMode={themeMode}
          onCloseCanvas={closeDesktopCanvas}
          onCycleTheme={cycleTheme}
        >''',
    "workspace frame props",
)
replace_once(
    '''            system={system}
            onOpenEstimate={openEstimate}
          >{workspace}</DesktopShell>''',
    '''            system={system}
            sidebarCollapsed={sidebarCollapsed}
            themeMode={themeMode}
            onOpenEstimate={openEstimate}
            onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
            onCycleTheme={cycleTheme}
          >{workspace}</DesktopShell>''',
    "desktop shell props",
)
replace_once(
    '''  return (
    <RuntimeProvider key={runtimeKey} onEstimateReady={handleEstimateReady}>
      {mobile ? (''',
    '''  return (
    <RuntimeProvider key={runtimeKey} onEstimateReady={handleEstimateReady}>
      <a className="pro-skip-link" href="#prosmet-main">Перейти к основной рабочей области</a>
      {mobile ? (''',
    "skip link",
)
replace_once(
    '''          <main className="chat-reference-main pro-mobile-main">{children}</main>''',
    '''          <main id="prosmet-main" className="chat-reference-main pro-mobile-main">{children}</main>''',
    "mobile main id",
)

start = source.find("function DesktopShell(")
end = source.find("\nfunction MobileShell(", start)
if start < 0 or end < 0:
    raise SystemExit("DesktopShell block not found")

replacement = r'''function DesktopShell({
  view,
  onView,
  onNewChat,
  estimates,
  activeEstimate,
  system,
  sidebarCollapsed,
  themeMode,
  onOpenEstimate,
  onToggleSidebar,
  onCycleTheme,
  children
}: {
  view: WorkspaceView;
  onView: (view: WorkspaceView) => void;
  onNewChat: () => void;
  estimates: Estimate[];
  activeEstimate: Estimate | null;
  system: SystemPreview | null;
  sidebarCollapsed: boolean;
  themeMode: WorkspaceThemeMode;
  onOpenEstimate: (estimate: Estimate) => void;
  onToggleSidebar: () => void;
  onCycleTheme: () => void;
  children: ReactNode;
}) {
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");

  const runCommand = useCallback((action: () => void) => {
    action();
    setCommandOpen(false);
    setCommandQuery("");
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
      if ((event.metaKey || event.ctrlKey) && key === "n") {
        event.preventDefault();
        runCommand(onNewChat);
      }
      if (event.key === "Escape" && commandOpen) {
        event.preventDefault();
        setCommandOpen(false);
        setCommandQuery("");
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [commandOpen, onNewChat, runCommand]);

  const commands = [
    { id: "new-chat", title: "Новый чат", copy: "Начать новый расчёт или консультацию", icon: <PlusIcon />, shortcut: "⌘N", action: onNewChat },
    { id: "projects", title: "Открыть проекты", copy: "Объекты, статусы и выполнение", icon: <FolderKanbanIcon />, action: () => onView("projects") },
    { id: "estimates", title: "Открыть сметы", copy: "Версии, согласование и редактор", icon: <FileSpreadsheetIcon />, action: () => onView("estimates") },
    { id: "documents", title: "Открыть документы", copy: "КП, договор, акт, КС-2 и КС-3", icon: <FileTextIcon />, action: () => onView("documents") },
    { id: "prices", title: "Открыть справочник цен", copy: "Региональная история и медианы", icon: <TagIcon />, action: () => onView("prices") },
    { id: "account", title: "Открыть кабинет", copy: "Профиль и реквизиты организации", icon: <CircleUserRoundIcon />, action: () => onView("account") },
    { id: "settings", title: "Открыть настройки", copy: "Агенты, тема и системный статус", icon: <Settings2Icon />, shortcut: "⌘,", action: () => onView("settings") },
    ...(activeEstimate ? [{
      id: "active-estimate",
      title: "Открыть текущую смету",
      copy: activeEstimate.title,
      icon: <FileSpreadsheetIcon />,
      action: () => onOpenEstimate(activeEstimate)
    }] : [])
  ];
  const normalizedQuery = commandQuery.trim().toLocaleLowerCase("ru-RU");
  const visibleCommands = commands.filter((command) => !normalizedQuery || `${command.title} ${command.copy}`.toLocaleLowerCase("ru-RU").includes(normalizedQuery));

  return (
    <div className={`pro-desktop-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`} data-testid="desktop-shell">
      <aside className="pro-desktop-sidebar">
        <button type="button" className="pro-brand" onClick={onNewChat} title="ProSmet">
          <span><SparklesIcon /></span><span><strong>Просметчик</strong><small>construction workspace</small></span>
        </button>
        <button type="button" className="pro-new-chat" onClick={onNewChat} title="Новый чат">
          <PlusIcon /><span>Новый чат</span><kbd>⌘N</kbd>
        </button>
        <nav className="pro-desktop-nav" aria-label="Основная навигация">
          {navigation.map((item) => (
            <button type="button" key={item.id} className={view === item.id ? "active" : ""} onClick={() => onView(item.id)} title={item.label}>
              {item.icon}<span>{item.label}</span>
            </button>
          ))}
        </nav>
        <section className="pro-sidebar-history">
          <header><span>Последние сметы</span><button type="button" onClick={() => onView("estimates")}>Все</button></header>
          {estimates.slice(0, 7).map((estimate) => (
            <button type="button" key={estimate.id} className={activeEstimate?.id === estimate.id ? "history-item active" : "history-item"} onClick={() => onOpenEstimate(estimate)} title={estimate.title}>
              <FileSpreadsheetIcon /><span><strong>{estimate.title}</strong><small>{estimate.project || estimate.region || `Версия ${estimate.revision}`}</small></span>
            </button>
          ))}
          {!estimates.length ? <p>Сметы появятся после полноценного расчёта.</p> : null}
        </section>
        <footer className="pro-sidebar-footer">
          <button type="button" className={view === "account" ? "active" : ""} onClick={() => onView("account")} title="Кабинет"><CircleUserRoundIcon /><span><strong>Кабинет</strong><small>Организация и реквизиты</small></span></button>
          <button type="button" className={view === "settings" ? "active settings" : "settings"} onClick={() => onView("settings")} aria-label="Настройки" title="Настройки"><Settings2Icon /></button>
        </footer>
      </aside>
      <main id="prosmet-main" className="pro-desktop-main">
        <header className="pro-desktop-topbar">
          <div className="pro-topbar-left">
            <button type="button" className="pro-sidebar-toggle" onClick={onToggleSidebar} aria-label={sidebarCollapsed ? "Развернуть левый сайдбар" : "Свернуть левый сайдбар"} title={sidebarCollapsed ? "Развернуть сайдбар" : "Свернуть сайдбар"}>
              {sidebarCollapsed ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
            </button>
            <div className="pro-topbar-title"><h1>{viewMeta[view].title}</h1><p>{viewMeta[view].subtitle}</p></div>
          </div>
          <div className="pro-topbar-tools">
            <button type="button" className="pro-command-trigger" onClick={() => setCommandOpen((value) => !value)} aria-expanded={commandOpen}>
              <SearchIcon /><span>Команды и поиск</span><kbd>⌘K</kbd>
            </button>
            <button type="button" className="pro-theme-toggle" onClick={onCycleTheme} aria-label={`Тема: ${themeMode}`} title={`Тема: ${themeMode}`}>
              {themeMode === "dark" ? <MoonIcon /> : <SunIcon />}
            </button>
            <button type="button" className="pro-agent-state" onClick={() => onView("settings")}>
              <span className={system?.activeAgent ? "online" : "offline"}><BotIcon /></span>
              <span><strong>{system?.activeAgent?.name || "Агент не подключён"}</strong><small>{system?.activeAgent?.model || "Открыть настройки"}</small></span>
            </button>
          </div>
        </header>
        {commandOpen ? (
          <section className="pro-command-surface" aria-label="Команды и поиск">
            <label className="pro-command-search">
              <SearchIcon />
              <input autoFocus value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} placeholder="Перейти к разделу или выполнить действие" />
              <kbd>Esc</kbd>
            </label>
            <div className="pro-command-list">
              <p>Рабочее пространство</p>
              {visibleCommands.map((command) => (
                <button type="button" key={command.id} className="pro-command-item" onClick={() => runCommand(command.action)}>
                  <span>{command.icon}</span>
                  <span><strong>{command.title}</strong><small>{command.copy}</small></span>
                  {command.shortcut ? <kbd>{command.shortcut}</kbd> : null}
                </button>
              ))}
              {!visibleCommands.length ? <div className="pro-command-empty">Ничего не найдено</div> : null}
            </div>
          </section>
        ) : null}
        <div className="pro-desktop-content">{children}</div>
      </main>
    </div>
  );
}
'''

source = source[:start] + replacement + source[end:]
path.write_text(source, encoding="utf-8")
