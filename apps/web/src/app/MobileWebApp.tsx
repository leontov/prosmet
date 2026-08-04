import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { Estimate } from "@prosmet/contracts";
import {
  AudioWaveformIcon,
  CalendarClockIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  CircleUserRoundIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderKanbanIcon,
  MessageSquareTextIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  Settings2Icon,
  TagIcon,
  XIcon
} from "lucide-react";
import { RuntimeProvider } from "../runtime/RuntimeProvider";
import { ChatSurface } from "../features/chat/ChatSurface";
import { EstimateEditor } from "../features/estimate/EstimateEditor";
import { AccountView } from "../features/account/AccountView";
import { SettingsView } from "../features/settings/SettingsView";
import { listStoredEstimates, persistEstimate } from "../features/estimate/estimate-api";

const workspaceKey = "prosmet-workspace-v1";
const legacyEstimateKey = "prosmet-greenfield-estimate";
const pinnedProjectsKey = "prosmet-mobile-pinned-projects-v1";

type WorkspaceState = {
  estimates: Estimate[];
  activeEstimateId: string | null;
};

type AgentRegistryPreview = {
  agents?: Array<{ id?: string; active?: boolean }>;
  activeAgentId?: string | null;
};

type MobileView =
  | "chat"
  | "library"
  | "projects"
  | "project"
  | "estimates"
  | "documents"
  | "scheduled"
  | "account"
  | "settings";

type LibraryTab = "all" | "estimates" | "projects" | "documents";
type ProjectTab = "all" | "mine" | "recent";

type MobileProject = {
  id: string;
  title: string;
  estimates: Estimate[];
  updatedAt: string;
  total: number;
};

type DrawerItem = {
  id: MobileView;
  label: string;
  icon: ReactNode;
};

const drawerItems: DrawerItem[] = [
  { id: "estimates", label: "Сметы", icon: <FileSpreadsheetIcon /> },
  { id: "library", label: "Библиотека", icon: <TagIcon /> },
  { id: "projects", label: "Проекты", icon: <FolderKanbanIcon /> },
  { id: "scheduled", label: "Запланированные", icon: <CalendarClockIcon /> },
  { id: "settings", label: "Агенты", icon: <Settings2Icon /> },
  { id: "account", label: "Больше", icon: <MoreHorizontalIcon /> }
];

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function loadWorkspace(): WorkspaceState {
  try {
    const current = window.localStorage.getItem(workspaceKey);
    if (current) {
      const parsed = JSON.parse(current) as Partial<WorkspaceState>;
      const estimates = Array.isArray(parsed.estimates) ? parsed.estimates : [];
      const activeEstimateId = typeof parsed.activeEstimateId === "string"
        ? parsed.activeEstimateId
        : estimates[0]?.id ?? null;
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

function loadPinnedProjects() {
  try {
    const value = JSON.parse(window.localStorage.getItem(pinnedProjectsKey) || "[]") as unknown;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function calculateEstimateTotal(estimate: Estimate) {
  const direct = estimate.sections.reduce(
    (total, section) => total + section.items.reduce(
      (sectionTotal, item) => sectionTotal + Math.max(0, item.quantity) * Math.max(0, item.unitPrice),
      0
    ),
    0
  );
  const overhead = direct * Math.max(0, estimate.overheadPercent) / 100;
  const profit = (direct + overhead) * Math.max(0, estimate.profitPercent) / 100;
  const vat = (direct + overhead + profit) * Math.max(0, estimate.vatPercent) / 100;
  return direct + overhead + profit + vat;
}

function formatMoney(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function groupProjects(estimates: Estimate[]): MobileProject[] {
  const grouped = new Map<string, Estimate[]>();
  for (const estimate of estimates) {
    const title = estimate.project.trim() || "Объект без названия";
    const group = grouped.get(title) || [];
    group.push(estimate);
    grouped.set(title, group);
  }

  return [...grouped.entries()]
    .map(([title, projectEstimates]) => {
      const sorted = [...projectEstimates].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
      return {
        id: encodeURIComponent(title),
        title,
        estimates: sorted,
        updatedAt: sorted[0]?.updatedAt || new Date(0).toISOString(),
        total: sorted.reduce((sum, estimate) => sum + calculateEstimateTotal(estimate), 0)
      };
    })
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

function relativeDate(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  const elapsed = Date.now() - timestamp;
  const day = 86_400_000;
  if (elapsed < day) return "сегодня";
  if (elapsed < day * 2) return "вчера";
  if (elapsed < day * 7) return `${Math.max(2, Math.floor(elapsed / day))} дня назад`;
  if (elapsed < day * 14) return "1 неделю назад";
  if (elapsed < day * 30) return `${Math.floor(elapsed / (day * 7))} недели назад`;
  return new Date(timestamp).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function dispatchComposer(text?: string) {
  window.dispatchEvent(new CustomEvent("prosmet:set-composer-text", {
    detail: { text: text || "", focus: true }
  }));
}

export function MobileWebApp() {
  const [runtimeKey, setRuntimeKey] = useState(0);
  const [view, setView] = useState<MobileView>("chat");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dragProgress, setDragProgress] = useState<number | null>(null);
  const progressRef = useRef(0);
  const gestureRef = useRef<{
    mode: "open" | "close";
    pointerId: number;
    startX: number;
    startedAt: number;
    moved: boolean;
  } | null>(null);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [attentionCount, setAttentionCount] = useState(0);
  const [workspace, setWorkspace] = useState<WorkspaceState>(() => loadWorkspace());
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [pinnedProjectIds, setPinnedProjectIds] = useState<string[]>(() => loadPinnedProjects());
  const [chatMenuOpen, setChatMenuOpen] = useState(false);

  const projects = useMemo(() => groupProjects(workspace.estimates), [workspace.estimates]);
  const activeEstimate = useMemo(
    () => workspace.estimates.find((estimate) => estimate.id === workspace.activeEstimateId) ?? null,
    [workspace]
  );
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );
  const drawerWidth = Math.min(330, Math.max(286, viewportWidth * 0.82));
  const progress = dragProgress ?? (drawerOpen ? 1 : 0);
  progressRef.current = progress;

  useEffect(() => {
    const updateWidth = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(workspaceKey, JSON.stringify(workspace));
    window.localStorage.removeItem(legacyEstimateKey);
  }, [workspace]);

  useEffect(() => {
    window.localStorage.setItem(pinnedProjectsKey, JSON.stringify(pinnedProjectIds));
  }, [pinnedProjectIds]);

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

  useEffect(() => {
    let active = true;
    fetch("/api/agents", { cache: "no-store" })
      .then((response) => response.ok
        ? response.json() as Promise<AgentRegistryPreview>
        : Promise.reject(new Error("agents unavailable")))
      .then((catalog) => {
        if (!active) return;
        const configured = Boolean(catalog.activeAgentId || catalog.agents?.some((agent) => agent.active));
        setAttentionCount(configured ? 0 : 1);
      })
      .catch(() => { if (active) setAttentionCount(1); });
    return () => { active = false; };
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
    setDrawerOpen(false);
  }, [workspace.activeEstimateId, workspace.estimates]);

  const navigate = useCallback((next: MobileView) => {
    setView(next);
    setDrawerOpen(false);
    setDragProgress(null);
    setChatMenuOpen(false);
  }, []);

  const openProject = useCallback((projectId: string) => {
    setSelectedProjectId(projectId);
    setView("project");
    setDrawerOpen(false);
    setDragProgress(null);
  }, []);

  const startNewChat = useCallback(() => {
    setEstimateOpen(false);
    setView("chat");
    setDrawerOpen(false);
    setDragProgress(null);
    setChatMenuOpen(false);
    setRuntimeKey((value) => value + 1);
    window.requestAnimationFrame(() => dispatchComposer());
  }, []);

  const focusComposer = useCallback(() => {
    if (view !== "chat") setView("chat");
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event("prosmet:focus-composer"));
      document.getElementById("mobile-message")?.focus();
    });
  }, [view]);

  const askProject = useCallback((message: string) => {
    const title = selectedProject?.title || "текущем проекте";
    setView("chat");
    window.requestAnimationFrame(() => dispatchComposer(`В проекте «${title}»: ${message}`));
  }, [selectedProject?.title]);

  const togglePinned = useCallback((id: string) => {
    setPinnedProjectIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [id, ...current]);
  }, []);

  const beginGesture = (mode: "open" | "close", event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    gestureRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startedAt: performance.now(),
      moved: false
    };
    setDragProgress(mode === "open" ? 0 : 1);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveGesture = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const delta = event.clientX - gesture.startX;
    if (Math.abs(delta) > 4) gesture.moved = true;
    const next = gesture.mode === "open"
      ? clamp(delta / drawerWidth)
      : clamp(1 + delta / drawerWidth);
    progressRef.current = next;
    setDragProgress(next);
    if (gesture.moved) event.preventDefault();
  };

  const endGesture = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const elapsed = Math.max(1, performance.now() - gesture.startedAt);
    const velocity = (event.clientX - gesture.startX) / elapsed;
    const nextOpen = gesture.mode === "open"
      ? progressRef.current > 0.34 || velocity > 0.45
      : !(progressRef.current < 0.66 || velocity < -0.45);
    gestureRef.current = null;
    setDrawerOpen(nextOpen);
    setDragProgress(null);
  };

  const pinnedProjects = useMemo(
    () => pinnedProjectIds
      .map((id) => projects.find((project) => project.id === id))
      .filter((project): project is MobileProject => Boolean(project)),
    [pinnedProjectIds, projects]
  );

  const recent = useMemo(
    () => [...workspace.estimates]
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .slice(0, 10),
    [workspace.estimates]
  );

  return (
    <RuntimeProvider key={runtimeKey} onEstimateReady={handleEstimateReady}>
      <div
        className="prosmet-mobile-root"
        style={{ "--prosmet-drawer-width": `${drawerWidth}px`, "--prosmet-drawer-progress": progress } as CSSProperties}
        data-dragging={dragProgress === null ? "false" : "true"}
      >
        <aside
          className="prosmet-mobile-drawer"
          role="dialog"
          aria-modal={drawerOpen}
          aria-label="Навигация"
          aria-hidden={progress <= 0.001}
          style={{ transform: `translate3d(${-drawerWidth * (1 - progress)}px,0,0)` }}
        >
          <div className="prosmet-mobile-drawer-header">
            <strong>ProSmet</strong>
            <button type="button" aria-label="Поиск" onClick={() => navigate("library")}><SearchIcon /></button>
          </div>

          <div className="prosmet-mobile-drawer-scroll">
            <nav className="prosmet-mobile-drawer-primary" aria-label="Разделы">
              {drawerItems.map((item) => {
                const selected = view === item.id || (view === "project" && item.id === "projects");
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={selected ? "active" : ""}
                    aria-current={selected ? "page" : undefined}
                    onClick={() => navigate(item.id)}
                  >
                    <span>{item.icon}</span>
                    <strong>{item.label}</strong>
                  </button>
                );
              })}
            </nav>

            {pinnedProjects.length ? (
              <section className="prosmet-mobile-drawer-section">
                <h2>Закреплено</h2>
                {pinnedProjects.slice(0, 4).map((project) => (
                  <button key={project.id} type="button" onClick={() => openProject(project.id)}>
                    <FolderKanbanIcon />
                    <span>{project.title}</span>
                  </button>
                ))}
              </section>
            ) : null}

            {recent.length ? (
              <section className="prosmet-mobile-drawer-section">
                <h2>Недавнее</h2>
                {recent.map((estimate) => (
                  <button key={estimate.id} type="button" onClick={() => openEstimate(estimate.id)}>
                    <MessageSquareTextIcon />
                    <span>{estimate.title}</span>
                  </button>
                ))}
              </section>
            ) : null}
          </div>

          <div className="prosmet-mobile-drawer-dock">
            <button type="button" className="prosmet-mobile-chat-dock" aria-label="Чат" onClick={startNewChat}>
              <FileTextIcon />
              <strong>Чат</strong>
            </button>
            <button type="button" className="prosmet-mobile-settings-dock" aria-label="Настройки" onClick={() => navigate("settings")}>
              <Settings2Icon />
              {attentionCount > 0 ? <span aria-hidden="true" /> : null}
            </button>
          </div>

          <div
            className="prosmet-mobile-drawer-close-gesture"
            onPointerDown={(event) => beginGesture("close", event)}
            onPointerMove={moveGesture}
            onPointerUp={endGesture}
            onPointerCancel={endGesture}
          />
        </aside>

        <div
          className="prosmet-mobile-stage"
          style={{
            transform: `translate3d(${(drawerWidth - 8) * progress}px,0,0) scale(${1 - progress * 0.04})`,
            borderRadius: `${progress * 32}px`
          }}
        >
          <div className="chat-reference-shell" data-testid="mobile-shell">
            <MobileHeader
              view={view}
              attentionCount={attentionCount}
              project={selectedProject}
              chatMenuOpen={chatMenuOpen}
              onChatMenuChange={setChatMenuOpen}
              onMenu={() => setDrawerOpen(true)}
              onBack={() => navigate("projects")}
              onNewChat={startNewChat}
              onFocusComposer={focusComposer}
              onNavigate={navigate}
            />

            <main className="chat-reference-main">
              <MobileWorkspace
                view={view}
                estimates={workspace.estimates}
                projects={projects}
                selectedProject={selectedProject}
                pinnedProjectIds={pinnedProjectIds}
                activeEstimate={activeEstimate}
                onNavigate={navigate}
                onOpenProject={openProject}
                onOpenEstimate={openEstimate}
                onTogglePinned={togglePinned}
                onNewChat={startNewChat}
                onAskProject={askProject}
              />
            </main>

            {estimateOpen && activeEstimate ? (
              <EstimateEditor
                mobile
                estimate={activeEstimate}
                onChange={updateActiveEstimate}
                onClose={() => setEstimateOpen(false)}
              />
            ) : null}
          </div>

          {progress > 0.001 ? (
            <button
              type="button"
              className="prosmet-mobile-stage-backdrop"
              aria-label="Закрыть навигацию"
              onClick={() => setDrawerOpen(false)}
              onPointerDown={(event) => beginGesture("close", event)}
              onPointerMove={moveGesture}
              onPointerUp={endGesture}
              onPointerCancel={endGesture}
              style={{ opacity: progress * 0.24 }}
            />
          ) : null}
        </div>

        {!drawerOpen && dragProgress === null ? (
          <div
            className="prosmet-mobile-edge-gesture"
            aria-hidden="true"
            onPointerDown={(event) => beginGesture("open", event)}
            onPointerMove={moveGesture}
            onPointerUp={endGesture}
            onPointerCancel={endGesture}
          />
        ) : null}
      </div>
    </RuntimeProvider>
  );
}

function MobileHeader({
  view,
  attentionCount,
  project,
  chatMenuOpen,
  onChatMenuChange,
  onMenu,
  onBack,
  onNewChat,
  onFocusComposer,
  onNavigate
}: {
  view: MobileView;
  attentionCount: number;
  project: MobileProject | null;
  chatMenuOpen: boolean;
  onChatMenuChange: (value: boolean) => void;
  onMenu: () => void;
  onBack: () => void;
  onNewChat: () => void;
  onFocusComposer: () => void;
  onNavigate: (view: MobileView) => void;
}) {
  if (view === "chat") {
    return (
      <header className="chat-reference-topbar">
        <MenuButton attentionCount={attentionCount} onClick={onMenu} />
        <button type="button" className="chat-reference-title" aria-label="Выбрать раздел" onClick={onMenu}>
          <span>Чат</span>
          <ChevronDownIcon />
        </button>
        <button type="button" className="chat-reference-voice" aria-label="Голосовой режим" onClick={onFocusComposer}>
          <AudioWaveformIcon />
        </button>
        <div className="chat-reference-chat-actions">
          <button type="button" aria-label="Новый чат" onClick={onNewChat}><FileTextIcon /></button>
          <button type="button" aria-label="Больше действий" onClick={() => onChatMenuChange(!chatMenuOpen)}><MoreHorizontalIcon /></button>
        </div>
        {chatMenuOpen ? (
          <div className="prosmet-chat-header-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => onNavigate("library")}><TagIcon /> Библиотека</button>
            <button type="button" role="menuitem" onClick={() => onNavigate("settings")}><Settings2Icon /> Настройки</button>
            <button type="button" role="menuitem" onClick={onNewChat}><PlusIcon /> Новый чат</button>
          </div>
        ) : null}
      </header>
    );
  }

  const title = view === "library"
    ? "Библиотека"
    : view === "projects"
      ? "Проекты"
      : view === "project"
        ? project?.title || "Проект"
        : view === "estimates"
          ? "Сметы"
          : view === "documents"
            ? "Документы"
            : view === "scheduled"
              ? "Запланированные"
              : view === "account"
                ? "Профиль"
                : "Настройки";

  const rightAction = view === "projects" || view === "scheduled"
    ? { label: "Создать", icon: <PlusIcon />, action: onNewChat }
    : view === "account"
      ? { label: "Открыть настройки", icon: <Settings2Icon />, action: () => onNavigate("settings") }
      : { label: "Больше действий", icon: <MoreHorizontalIcon />, action: () => window.dispatchEvent(new Event("prosmet:screen-more")) };

  return (
    <header className="prosmet-screen-header">
      <CircleHeaderButton
        label={view === "project" ? "Назад к проектам" : "Открыть навигацию"}
        onClick={view === "project" ? onBack : onMenu}
      >
        {view === "project" ? <ChevronLeftIcon /> : <MenuLines />}
        {view !== "project" && attentionCount > 0 ? <span className="chat-reference-badge">{attentionCount}</span> : null}
      </CircleHeaderButton>
      <h1>{title}</h1>
      <CircleHeaderButton label={rightAction.label} onClick={rightAction.action}>{rightAction.icon}</CircleHeaderButton>
    </header>
  );
}

function MenuButton({ attentionCount, onClick }: { attentionCount: number; onClick: () => void }) {
  return (
    <button
      type="button"
      className="chat-reference-menu"
      aria-label="Открыть навигацию"
      aria-expanded="false"
      onClick={onClick}
    >
      <MenuLines />
      {attentionCount > 0 ? (
        <span className="chat-reference-badge" aria-label={`${attentionCount} действие требует внимания`}>
          {attentionCount}
        </span>
      ) : null}
    </button>
  );
}

function MenuLines() {
  return <span className="chat-reference-menu-lines" aria-hidden="true"><i /><i /></span>;
}

function CircleHeaderButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="prosmet-screen-circle" aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}

function MobileWorkspace({
  view,
  estimates,
  projects,
  selectedProject,
  pinnedProjectIds,
  activeEstimate,
  onNavigate,
  onOpenProject,
  onOpenEstimate,
  onTogglePinned,
  onNewChat,
  onAskProject
}: {
  view: MobileView;
  estimates: Estimate[];
  projects: MobileProject[];
  selectedProject: MobileProject | null;
  pinnedProjectIds: string[];
  activeEstimate: Estimate | null;
  onNavigate: (view: MobileView) => void;
  onOpenProject: (id: string) => void;
  onOpenEstimate: (id?: string) => void;
  onTogglePinned: (id: string) => void;
  onNewChat: () => void;
  onAskProject: (message: string) => void;
}) {
  if (view === "chat") {
    return <ChatSurface mobile hasEstimate={Boolean(activeEstimate)} onOpenEstimate={() => onOpenEstimate(activeEstimate?.id)} />;
  }
  if (view === "library" || view === "estimates" || view === "documents") {
    return (
      <MobileLibrary
        estimates={estimates}
        projects={projects}
        initialTab={view === "estimates" ? "estimates" : view === "documents" ? "documents" : "all"}
        onOpenProject={onOpenProject}
        onOpenEstimate={(id) => onOpenEstimate(id)}
      />
    );
  }
  if (view === "projects") {
    return (
      <MobileProjects
        projects={projects}
        pinnedProjectIds={pinnedProjectIds}
        onOpenProject={onOpenProject}
        onTogglePinned={onTogglePinned}
      />
    );
  }
  if (view === "project") {
    return selectedProject ? (
      <MobileProjectScreen
        project={selectedProject}
        onOpenEstimate={(id) => onOpenEstimate(id)}
        onAsk={onAskProject}
      />
    ) : (
      <MobileProjects
        projects={projects}
        pinnedProjectIds={pinnedProjectIds}
        onOpenProject={onOpenProject}
        onTogglePinned={onTogglePinned}
      />
    );
  }
  if (view === "scheduled") return <MobileScheduled onCreate={onNewChat} />;
  if (view === "account") return <AccountView mobile />;
  if (view === "settings") return <SettingsView mobile />;
  return (
    <div className="prosmet-mobile-empty">
      <strong>Раздел недоступен</strong>
      <button type="button" onClick={() => onNavigate("chat")}>Вернуться в чат</button>
    </div>
  );
}

function MobileLibrary({
  estimates,
  projects,
  initialTab,
  onOpenProject,
  onOpenEstimate
}: {
  estimates: Estimate[];
  projects: MobileProject[];
  initialTab: LibraryTab;
  onOpenProject: (id: string) => void;
  onOpenEstimate: (id: string) => void;
}) {
  const [tab, setTab] = useState<LibraryTab>(initialTab);
  const [query, setQuery] = useState("");
  const [newestFirst, setNewestFirst] = useState(true);

  useEffect(() => setTab(initialTab), [initialTab]);

  useEffect(() => {
    const toggle = () => setNewestFirst((value) => !value);
    window.addEventListener("prosmet:screen-more", toggle);
    return () => window.removeEventListener("prosmet:screen-more", toggle);
  }, []);

  const cards = useMemo(() => {
    const projectCards = projects.map((project) => ({
      id: `project:${project.id}`,
      type: "project" as const,
      targetId: project.id,
      title: project.title,
      subtitle: `${project.estimates.length} ${project.estimates.length === 1 ? "смета" : "сметы"}`
    }));
    const estimateCards = [...estimates]
      .sort((left, right) => (newestFirst ? 1 : -1) * (Date.parse(right.updatedAt) - Date.parse(left.updatedAt)))
      .map((estimate) => ({
        id: `estimate:${estimate.id}`,
        type: estimate.status === "approved" || estimate.status === "sent" ? "document" as const : "estimate" as const,
        targetId: estimate.id,
        title: estimate.title,
        subtitle: estimate.project || estimate.region || relativeDate(estimate.updatedAt)
      }));

    let source = tab === "projects"
      ? projectCards
      : tab === "estimates"
        ? estimateCards.filter((card) => card.type === "estimate")
        : tab === "documents"
          ? estimateCards.filter((card) => card.type === "document")
          : [...projectCards, ...estimateCards];

    const normalized = query.trim().toLowerCase();
    if (normalized) source = source.filter((card) => `${card.title} ${card.subtitle}`.toLowerCase().includes(normalized));
    return source;
  }, [estimates, newestFirst, projects, query, tab]);

  const tabs: Array<{ id: LibraryTab; label: string }> = [
    { id: "all", label: "Все" },
    { id: "estimates", label: "Сметы" },
    { id: "projects", label: "Проекты" },
    { id: "documents", label: "Документы" }
  ];

  return (
    <section className="prosmet-mobile-library" data-testid="mobile-library">
      <div className="prosmet-mobile-tabs" role="tablist">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? "active" : ""}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="prosmet-mobile-library-grid">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            aria-label={card.title}
            onClick={() => card.type === "project" ? onOpenProject(card.targetId) : onOpenEstimate(card.targetId)}
          >
            <span>
              <strong>{card.title}</strong>
              <small>{card.subtitle}</small>
            </span>
            {card.type === "project"
              ? <FolderKanbanIcon />
              : <FileTextIcon className={card.type === "document" ? "document" : ""} />}
          </button>
        ))}
      </div>

      {!cards.length ? (
        <div className="prosmet-mobile-empty">
          <strong>{query ? "Ничего не найдено" : "Библиотека пока пуста"}</strong>
          <span>{query ? "Измените поисковый запрос." : "Сметы и проекты появятся здесь после работы с агентом."}</span>
        </div>
      ) : null}

      <SearchDock value={query} onChange={setQuery} placeholder="Поиск в библиотеке" />
    </section>
  );
}

function MobileProjects({
  projects,
  pinnedProjectIds,
  onOpenProject,
  onTogglePinned
}: {
  projects: MobileProject[];
  pinnedProjectIds: string[];
  onOpenProject: (id: string) => void;
  onTogglePinned: (id: string) => void;
}) {
  const [tab, setTab] = useState<ProjectTab>("all");
  const [query, setQuery] = useState("");
  const tabs: Array<{ id: ProjectTab; label: string }> = [
    { id: "all", label: "Все" },
    { id: "mine", label: "Созданные вами" },
    { id: "recent", label: "Недавние" }
  ];

  const rows = useMemo(() => {
    let source = [...projects];
    if (tab === "recent") source = source.slice(0, 5);
    const normalized = query.trim().toLowerCase();
    if (normalized) source = source.filter((project) => project.title.toLowerCase().includes(normalized));
    return source;
  }, [projects, query, tab]);

  return (
    <section className="prosmet-mobile-projects">
      <div className="prosmet-mobile-tabs" role="tablist">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? "active" : ""}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="prosmet-mobile-project-list">
        {rows.map((project) => {
          const pinned = pinnedProjectIds.includes(project.id);
          return (
            <article key={project.id}>
              <button type="button" className="prosmet-project-open" aria-label={project.title} onClick={() => onOpenProject(project.id)}>
                <span className="prosmet-project-folder"><FolderKanbanIcon /></span>
                <span>
                  <strong>{project.title}</strong>
                  <small>{relativeDate(project.updatedAt)}</small>
                </span>
              </button>
              <button
                type="button"
                className={pinned ? "prosmet-project-pin active" : "prosmet-project-pin"}
                aria-label={pinned ? `Открепить ${project.title}` : `Закрепить ${project.title}`}
                aria-pressed={pinned}
                onClick={() => onTogglePinned(project.id)}
              >
                <span>◆</span>
              </button>
            </article>
          );
        })}
      </div>

      {!rows.length ? (
        <div className="prosmet-mobile-empty">
          <strong>{query ? "Проекты не найдены" : "Проектов пока нет"}</strong>
          <span>Новая смета автоматически создаст проект.</span>
        </div>
      ) : null}

      <SearchDock value={query} onChange={setQuery} placeholder="Поиск проектов" />
    </section>
  );
}

function MobileProjectScreen({
  project,
  onOpenEstimate,
  onAsk
}: {
  project: MobileProject;
  onOpenEstimate: (id: string) => void;
  onAsk: (message: string) => void;
}) {
  const [mode, setMode] = useState<"chat" | "work">("chat");
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [message, setMessage] = useState("");

  const submit = () => {
    const value = message.trim();
    if (!value) return;
    setMessage("");
    onAsk(value);
  };

  return (
    <section className="prosmet-mobile-project-screen">
      <div className="prosmet-project-mode-wrap">
        <button
          type="button"
          className="prosmet-project-mode-button"
          aria-label="Выбрать режим проекта"
          aria-expanded={modeMenuOpen}
          onClick={() => setModeMenuOpen((value) => !value)}
        >
          <span>{mode === "chat" ? "Чат" : "Работа"}</span>
          <ChevronDownIcon />
        </button>
        {modeMenuOpen ? (
          <div className="prosmet-project-mode-menu" role="menu">
            <button type="button" role="menuitemradio" aria-checked={mode === "chat"} onClick={() => { setMode("chat"); setModeMenuOpen(false); }}>
              <span>{mode === "chat" ? "✓" : ""}</span> Чат
            </button>
            <button type="button" role="menuitemradio" aria-checked={mode === "work"} onClick={() => { setMode("work"); setModeMenuOpen(false); }}>
              <span>{mode === "work" ? "✓" : ""}</span> Работа
            </button>
          </div>
        ) : null}
      </div>

      {mode === "chat" ? (
        <div className="prosmet-project-conversations">
          {project.estimates.map((estimate) => (
            <button key={estimate.id} type="button" onClick={() => onOpenEstimate(estimate.id)}>
              <strong>{estimate.title}</strong>
              <span>{estimate.region || estimate.customer || "Редактируемая смета"}</span>
            </button>
          ))}
          {!project.estimates.length ? <div className="prosmet-mobile-empty"><strong>Диалогов пока нет</strong></div> : null}
        </div>
      ) : (
        <div className="prosmet-project-work">
          {project.estimates.map((estimate) => (
            <button key={estimate.id} type="button" onClick={() => onOpenEstimate(estimate.id)}>
              <span><FileSpreadsheetIcon /></span>
              <span><strong>{estimate.title}</strong><small>{relativeDate(estimate.updatedAt)}</small></span>
              <b>{formatMoney(calculateEstimateTotal(estimate))}</b>
            </button>
          ))}
        </div>
      )}

      <div className="prosmet-project-composer">
        <button type="button" aria-label="Добавить"><PlusIcon /></button>
        <textarea
          rows={1}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={`Сообщение ${project.title}`}
        />
        <button type="button" aria-label="Отправить" className="send" onClick={submit}><AudioWaveformIcon /></button>
      </div>
    </section>
  );
}

function MobileScheduled({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="prosmet-mobile-scheduled">
      <div className="prosmet-mobile-empty">
        <CalendarClockIcon />
        <strong>Запланированных задач нет</strong>
        <span>Создайте новый запрос и укажите дату или период выполнения.</span>
        <button type="button" onClick={onCreate}>Создать задачу</button>
      </div>
    </section>
  );
}

function SearchDock({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="prosmet-mobile-search-dock">
      <SearchIcon />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}
