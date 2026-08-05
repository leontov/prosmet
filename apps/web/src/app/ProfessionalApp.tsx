import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from "react";
import type {
  ConstructionDocument,
  ConstructionProject,
  Estimate,
  PriceCatalogEntry,
  WorkflowAction,
  WorkflowDetail,
  WorkProgressItem,
  WorkProgressStatus
} from "@prosmet/contracts";
import {
  AudioWaveformIcon,
  BotIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  CircleUserRoundIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderKanbanIcon,
  LayoutDashboardIcon,
  MenuIcon,
  MessageSquareTextIcon,
  MoreHorizontalIcon,
  PlusIcon,
  RefreshCwIcon,
  Settings2Icon,
  SparklesIcon,
  TagIcon,
  XIcon
} from "lucide-react";
import { RuntimeProvider } from "../runtime/RuntimeProvider";
import { ChatSurface } from "../features/chat/ChatSurface";
import { EstimateEditor } from "../features/estimate/EstimateEditor";
import { AccountView } from "../features/account/AccountView";
import { SettingsView } from "../features/settings/SettingsView";
import {
  DocumentsView,
  EstimatesView,
  PriceCatalogView,
  ProjectsView
} from "../features/workflow/ProfessionalViews";
import {
  DocumentViewer,
  WorkflowInspector
} from "../features/workflow/WorkflowInspector";
import { WorkspaceCanvasFrame } from "../features/workspace/WorkspaceCanvasFrame";
import {
  fetchWorkflowByEstimate,
  fetchWorkflowByProject,
  listDocuments,
  listEstimates,
  listPrices,
  listProjects,
  runWorkflowAction,
  saveEstimate,
  updateDocumentContent,
  updateDocumentStatus,
  updateProgress
} from "../features/workflow/workflow-api";

type WorkspaceView = "chat" | "projects" | "estimates" | "documents" | "prices" | "account" | "settings";

type SystemPreview = {
  activeAgent?: { name?: string; model?: string | null; type?: string } | null;
  configuredAgents?: number;
  workflowSchema?: string;
  qwen?: { provisioned?: boolean; model?: string | null; testedAt?: string | null };
};

type NavigationItem = {
  id: WorkspaceView;
  label: string;
  icon: ReactNode;
};

const navigation: NavigationItem[] = [
  { id: "chat", label: "Чаты", icon: <MessageSquareTextIcon /> },
  { id: "projects", label: "Проекты", icon: <FolderKanbanIcon /> },
  { id: "estimates", label: "Сметы", icon: <FileSpreadsheetIcon /> },
  { id: "documents", label: "Документы", icon: <FileTextIcon /> },
  { id: "prices", label: "Справочник цен", icon: <TagIcon /> }
];

const mobileNavigation: NavigationItem[] = [
  { id: "chat", label: "Чат", icon: <MessageSquareTextIcon /> },
  { id: "projects", label: "Проекты", icon: <FolderKanbanIcon /> },
  { id: "estimates", label: "Сметы", icon: <FileSpreadsheetIcon /> },
  { id: "documents", label: "Документы", icon: <FileTextIcon /> },
  { id: "prices", label: "Цены", icon: <TagIcon /> },
  { id: "account", label: "Профиль", icon: <CircleUserRoundIcon /> },
  { id: "settings", label: "Настройки", icon: <Settings2Icon /> }
];

const viewMeta: Record<WorkspaceView, { title: string; subtitle: string }> = {
  chat: { title: "Новый чат", subtitle: "Смета создаётся только после полноценного расчёта" },
  projects: { title: "Проекты", subtitle: "Смета → договор → выполнение → закрывающие документы" },
  estimates: { title: "Сметы", subtitle: "Версии, согласование и исходные значения" },
  documents: { title: "Документы", subtitle: "КП, счёт, договор, акт, КС-2 и КС-3" },
  prices: { title: "Справочник цен", subtitle: "Региональные данные из проверенных расчётов" },
  account: { title: "Кабинет", subtitle: "Организация, реквизиты и состояние сервиса" },
  settings: { title: "Настройки", subtitle: "ИИ-агенты, Qwen, безопасность и данные" }
};

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

function replaceEstimate(estimates: Estimate[], incoming: Estimate) {
  const found = estimates.some((estimate) => estimate.id === incoming.id);
  return found
    ? estimates.map((estimate) => estimate.id === incoming.id ? incoming : estimate)
    : [incoming, ...estimates];
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function ProfessionalApp() {
  const mobile = useMediaQuery("(max-width: 767px)");
  const [runtimeKey, setRuntimeKey] = useState(0);
  const [view, setView] = useState<WorkspaceView>("chat");
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [projects, setProjects] = useState<ConstructionProject[]>([]);
  const [documents, setDocuments] = useState<ConstructionDocument[]>([]);
  const [prices, setPrices] = useState<PriceCatalogEntry[]>([]);
  const [system, setSystem] = useState<SystemPreview | null>(null);
  const [activeEstimateId, setActiveEstimateId] = useState<string | null>(null);
  const [chatArtifactId, setChatArtifactId] = useState<string | null>(null);
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [documentOpen, setDocumentOpen] = useState<ConstructionDocument | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const activeEstimate = useMemo(
    () => estimates.find((estimate) => estimate.id === activeEstimateId) || null,
    [activeEstimateId, estimates]
  );

  const loadSystem = useCallback(async () => {
    const response = await fetch("/api/system", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new Error("Состояние системы недоступно");
    return response.json() as Promise<SystemPreview>;
  }, []);

  const refresh = useCallback(async () => {
    const [estimateResult, projectResult, documentResult, priceResult, systemResult] = await Promise.allSettled([
      listEstimates(),
      listProjects(),
      listDocuments(),
      listPrices(),
      loadSystem()
    ]);
    if (estimateResult.status === "fulfilled") {
      setEstimates(estimateResult.value);
      setActiveEstimateId((current) => current && estimateResult.value.some((estimate) => estimate.id === current)
        ? current
        : estimateResult.value[0]?.id || null);
    }
    if (projectResult.status === "fulfilled") setProjects(projectResult.value);
    if (documentResult.status === "fulfilled") setDocuments(documentResult.value);
    if (priceResult.status === "fulfilled") setPrices(priceResult.value);
    if (systemResult.status === "fulfilled") setSystem(systemResult.value);
  }, [loadSystem]);

  useEffect(() => {
    let active = true;
    void refresh().finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);

  const applyWorkflow = useCallback((next: WorkflowDetail) => {
    setWorkflow(next);
    setEstimates((current) => replaceEstimate(current, next.estimate));
    setActiveEstimateId(next.estimate.id);
    setProjects((current) => {
      const found = current.some((project) => project.id === next.project.id);
      return found
        ? current.map((project) => project.id === next.project.id ? next.project : project)
        : [next.project, ...current];
    });
    setDocuments((current) => {
      const unrelated = current.filter((document) => document.projectId !== next.project.id);
      return [...next.documents, ...unrelated];
    });
  }, []);

  const loadWorkflowForEstimate = useCallback(async (estimateId: string, show = false) => {
    try {
      const next = await fetchWorkflowByEstimate(estimateId);
      applyWorkflow(next);
      if (show) {
        setEstimateOpen(false);
        setDocumentOpen(null);
        setWorkflowOpen(true);
      }
      return next;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить процесс проекта");
      return null;
    }
  }, [applyWorkflow]);

  const handleEstimateReady = useCallback((incoming: Estimate) => {
    setEstimates((current) => replaceEstimate(current, incoming));
    setActiveEstimateId(incoming.id);
    setChatArtifactId(incoming.id);
    setWorkflowOpen(false);
    setDocumentOpen(null);
    setEstimateOpen(true);
    setError(null);
    void loadWorkflowForEstimate(incoming.id).then(() => refresh());
  }, [loadWorkflowForEstimate, refresh]);

  const handleEstimateChange = useCallback(async (incoming: Estimate) => {
    setEstimates((current) => replaceEstimate(current, incoming));
    setActiveEstimateId(incoming.id);
    try {
      const persisted = await saveEstimate(incoming);
      setEstimates((current) => replaceEstimate(current, persisted));
      await loadWorkflowForEstimate(persisted.id);
      await refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить смету");
    }
  }, [loadWorkflowForEstimate, refresh]);

  const openEstimate = useCallback((estimate: Estimate) => {
    setActiveEstimateId(estimate.id);
    setWorkflowOpen(false);
    setDocumentOpen(null);
    setEstimateOpen(true);
    setError(null);
    void loadWorkflowForEstimate(estimate.id);
  }, [loadWorkflowForEstimate]);

  const openProject = useCallback(async (project: ConstructionProject) => {
    setBusy("project");
    setError(null);
    try {
      const next = await fetchWorkflowByProject(project.id);
      applyWorkflow(next);
      setEstimateOpen(false);
      setDocumentOpen(null);
      setWorkflowOpen(true);
    } catch (projectError) {
      setError(projectError instanceof Error ? projectError.message : "Не удалось открыть проект");
    } finally {
      setBusy(null);
    }
  }, [applyWorkflow]);

  const newChat = useCallback(() => {
    setView("chat");
    setEstimateOpen(false);
    setWorkflowOpen(false);
    setDocumentOpen(null);
    setChatArtifactId(null);
    setError(null);
    setRuntimeKey((value) => value + 1);
    window.requestAnimationFrame(() => window.dispatchEvent(new Event("prosmet:focus-composer")));
  }, []);

  const runAction = useCallback(async (action: WorkflowAction) => {
    if (!activeEstimateId) return;
    setBusy(action);
    setError(null);
    try {
      const next = await runWorkflowAction(activeEstimateId, action);
      applyWorkflow(next);
      setEstimateOpen(false);
      setDocumentOpen(null);
      setWorkflowOpen(true);
      await refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Действие не выполнено");
    } finally {
      setBusy(null);
    }
  }, [activeEstimateId, applyWorkflow, refresh]);

  const saveProgress = useCallback(async (item: WorkProgressItem, patch: { actualQuantity: number; status: WorkProgressStatus; note?: string }) => {
    setBusy(`progress:${item.itemId}`);
    setError(null);
    try {
      const result = await updateProgress(item.projectId, item.itemId, patch);
      applyWorkflow(result.workflow);
      await refresh();
    } catch (progressError) {
      setError(progressError instanceof Error ? progressError.message : "Не удалось сохранить фактический объём");
      throw progressError;
    } finally {
      setBusy(null);
    }
  }, [applyWorkflow, refresh]);

  const updateDocument = useCallback(async (document: ConstructionDocument, action: "send" | "sign" | "approve") => {
    try {
      const updated = await updateDocumentStatus(document.id, action);
      setDocumentOpen(updated);
      setDocuments((current) => current.map((item) => item.id === updated.id ? updated : item));
      if (activeEstimateId) await loadWorkflowForEstimate(activeEstimateId);
    } catch (documentError) {
      setError(documentError instanceof Error ? documentError.message : "Не удалось обновить документ");
      throw documentError;
    }
  }, [activeEstimateId, loadWorkflowForEstimate]);

  const openDocument = useCallback((document: ConstructionDocument) => {
    setEstimateOpen(false);
    setWorkflowOpen(false);
    setDocumentOpen(document);
  }, []);

  const saveDocumentContent = useCallback(async (
    document: ConstructionDocument,
    content: Pick<ConstructionDocument["content"], "heading" | "introduction" | "clauses" | "notes">
  ) => {
    const updated = await updateDocumentContent(document.id, content);
    setDocumentOpen(updated);
    setDocuments((current) => current.map((item) => item.id === updated.id ? updated : item));
  }, []);

  const refreshPrices = useCallback(async (query: string, region: string) => {
    setBusy("prices");
    try { setPrices(await listPrices(query, region)); } finally { setBusy(null); }
  }, []);

  const workspace = (
    <Workspace
      view={view}
      mobile={mobile}
      estimates={estimates}
      projects={projects}
      documents={documents}
      prices={prices}
      activeEstimate={activeEstimate}
      chatArtifactId={chatArtifactId}
      loading={loading}
      onCreate={newChat}
      onOpenEstimate={openEstimate}
      onOpenProject={(project) => void openProject(project)}
      onOpenDocument={openDocument}
      onRefreshPrices={refreshPrices}
      onView={setView}
      onOpenCurrentWorkflow={() => activeEstimateId && void loadWorkflowForEstimate(activeEstimateId, true)}
    />
  );

  const desktopCanvas = !mobile
    ? documentOpen ? (
      <DocumentViewer
        document={documentOpen}
        mobile={false}
        embedded
        onClose={() => setDocumentOpen(null)}
        onStatus={updateDocument}
        onContent={saveDocumentContent}
      />
    ) : workflowOpen && workflow ? (
      <WorkflowInspector
        workflow={workflow}
        mobile={false}
        embedded
        open
        busy={busy}
        error={error}
        onClose={() => setWorkflowOpen(false)}
        onAction={(action) => void runAction(action)}
        onProgress={saveProgress}
        onOpenEstimate={() => {
          setWorkflowOpen(false);
          setEstimateOpen(true);
        }}
        onOpenDocument={openDocument}
      />
    ) : estimateOpen && activeEstimate ? (
      <EstimateEditor
        mobile={false}
        embedded
        estimate={activeEstimate}
        onChange={(next) => { void handleEstimateChange(next); }}
        onClose={() => setEstimateOpen(false)}
      />
    ) : null
    : null;

  const desktopCanvasTitle = documentOpen
    ? documentOpen.title
    : workflowOpen && workflow
      ? workflow.project.title
      : estimateOpen && activeEstimate
        ? activeEstimate.title
        : "Рабочая область";
  const desktopCanvasSubtitle = documentOpen
    ? `${documentOpen.number} · ${documentOpen.status}`
    : workflowOpen && workflow
      ? `Процесс · ${workflow.project.progress.percent}%`
      : estimateOpen && activeEstimate
        ? `Смета · версия ${activeEstimate.revision}`
        : null;

  const closeDesktopCanvas = () => {
    if (documentOpen) {
      setDocumentOpen(null);
      if (workflow) setWorkflowOpen(true);
      return;
    }
    if (workflowOpen) {
      setWorkflowOpen(false);
      return;
    }
    setEstimateOpen(false);
  };

  return (
    <RuntimeProvider key={runtimeKey} onEstimateReady={handleEstimateReady}>
      {mobile ? (
        <MobileShell
          view={view}
          onView={setView}
          onNewChat={newChat}
          estimates={estimates}
          projects={projects}
          system={system}
        >{workspace}</MobileShell>
      ) : (
        <WorkspaceCanvasFrame
          canvas={desktopCanvas}
          canvasTitle={desktopCanvasTitle}
          canvasSubtitle={desktopCanvasSubtitle}
          onCloseCanvas={closeDesktopCanvas}
        >
          <DesktopShell
            view={view}
            onView={setView}
            onNewChat={newChat}
            estimates={estimates}
            activeEstimate={activeEstimate}
            system={system}
            onOpenEstimate={openEstimate}
          >{workspace}</DesktopShell>
        </WorkspaceCanvasFrame>
      )}

      {mobile && estimateOpen && activeEstimate ? (
        <EstimateEditor
          mobile
          estimate={activeEstimate}
          onChange={(next) => { void handleEstimateChange(next); }}
          onClose={() => setEstimateOpen(false)}
        />
      ) : null}

      {mobile && estimateOpen && workflow ? (
        <button type="button" className="pro-editor-workflow-trigger" onClick={() => setWorkflowOpen(true)}>
          <LayoutDashboardIcon /> Процесс
          <span>{workflow.project.progress.percent}%</span>
        </button>
      ) : null}

      {mobile ? (
        <WorkflowInspector
          workflow={workflow}
          mobile
          open={workflowOpen}
          busy={busy}
          error={error}
          onClose={() => setWorkflowOpen(false)}
          onAction={(action) => void runAction(action)}
          onProgress={saveProgress}
          onOpenEstimate={() => setEstimateOpen(true)}
          onOpenDocument={openDocument}
        />
      ) : null}

      {mobile ? (
        <DocumentViewer
          document={documentOpen}
          mobile
          onClose={() => setDocumentOpen(null)}
          onStatus={updateDocument}
          onContent={saveDocumentContent}
        />
      ) : null}

      {error && !workflowOpen ? <div className="pro-global-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError(null)}><XIcon /></button></div> : null}
    </RuntimeProvider>
  );
}

function Workspace({
  view,
  mobile,
  estimates,
  projects,
  documents,
  prices,
  activeEstimate,
  chatArtifactId,
  loading,
  onCreate,
  onOpenEstimate,
  onOpenProject,
  onOpenDocument,
  onRefreshPrices,
  onView,
  onOpenCurrentWorkflow
}: {
  view: WorkspaceView;
  mobile: boolean;
  estimates: Estimate[];
  projects: ConstructionProject[];
  documents: ConstructionDocument[];
  prices: PriceCatalogEntry[];
  activeEstimate: Estimate | null;
  chatArtifactId: string | null;
  loading: boolean;
  onCreate: () => void;
  onOpenEstimate: (estimate: Estimate) => void;
  onOpenProject: (project: ConstructionProject) => void;
  onOpenDocument: (document: ConstructionDocument) => void;
  onRefreshPrices: (query: string, region: string) => void;
  onView: (view: WorkspaceView) => void;
  onOpenCurrentWorkflow: () => void;
}) {
  if (view === "chat") {
    return (
      <div className="pro-chat-workspace">
        <ChatSurface
          mobile={mobile}
          hasEstimate={Boolean(chatArtifactId && activeEstimate?.id === chatArtifactId)}
          onOpenEstimate={() => activeEstimate && onOpenEstimate(activeEstimate)}
        />
        {activeEstimate && !chatArtifactId ? (
          <button type="button" className="pro-current-project-link" onClick={onOpenCurrentWorkflow}>
            <FolderKanbanIcon />
            <span><strong>{activeEstimate.project || activeEstimate.title}</strong><small>Открыть текущий проект и процесс</small></span>
          </button>
        ) : null}
      </div>
    );
  }
  if (loading) return <div className="pro-loading"><RefreshCwIcon className="spin" /><span>Загружаем рабочие данные</span></div>;
  if (view === "projects") return <ProjectsView projects={projects} mobile={mobile} onOpen={onOpenProject} onCreate={onCreate} />;
  if (view === "estimates") return <EstimatesView estimates={estimates} mobile={mobile} onOpen={onOpenEstimate} onCreate={onCreate} />;
  if (view === "documents") return <DocumentsView documents={documents} mobile={mobile} onOpen={onOpenDocument} onCreate={() => onView("projects")} />;
  if (view === "prices") return <PriceCatalogView prices={prices} mobile={mobile} onRefresh={onRefreshPrices} />;
  if (view === "account") return <div className="pro-embedded-view"><AccountView mobile={mobile} /></div>;
  return <div className="pro-embedded-view"><SystemIntegrationBanner /><SettingsView mobile={mobile} /></div>;
}

function SystemIntegrationBanner() {
  const [system, setSystem] = useState<SystemPreview | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/system", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<SystemPreview> : Promise.reject())
      .then((value) => { if (active) setSystem(value); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  return (
    <section className="pro-integration-banner">
      <span className={system?.activeAgent ? "online" : "offline"}><BotIcon /></span>
      <div><small>Активный расчётный агент</small><strong>{system?.activeAgent?.name || "Агент не подключён"}</strong><p>{system?.qwen?.provisioned ? `Qwen проверен · ${system.qwen.model || "qwen-plus"}` : "Подключения хранятся на сервере в зашифрованном виде."}</p></div>
    </section>
  );
}

function DesktopShell({
  view,
  onView,
  onNewChat,
  estimates,
  activeEstimate,
  system,
  onOpenEstimate,
  children
}: {
  view: WorkspaceView;
  onView: (view: WorkspaceView) => void;
  onNewChat: () => void;
  estimates: Estimate[];
  activeEstimate: Estimate | null;
  system: SystemPreview | null;
  onOpenEstimate: (estimate: Estimate) => void;
  children: ReactNode;
}) {
  return (
    <div className="pro-desktop-shell" data-testid="desktop-shell">
      <aside className="pro-desktop-sidebar">
        <button type="button" className="pro-brand" onClick={onNewChat}>
          <span><SparklesIcon /></span><span><strong>Просметчик</strong><small>construction workspace</small></span>
        </button>
        <button type="button" className="pro-new-chat" onClick={onNewChat}><PlusIcon /> Новый чат</button>
        <nav className="pro-desktop-nav" aria-label="Основная навигация">
          {navigation.map((item) => (
            <button type="button" key={item.id} className={view === item.id ? "active" : ""} onClick={() => onView(item.id)}>
              {item.icon}<span>{item.label}</span>
            </button>
          ))}
        </nav>
        <section className="pro-sidebar-history">
          <header><span>Последние сметы</span><button type="button" onClick={() => onView("estimates")}>Все</button></header>
          {estimates.slice(0, 7).map((estimate) => (
            <button type="button" key={estimate.id} className={activeEstimate?.id === estimate.id ? "history-item active" : "history-item"} onClick={() => onOpenEstimate(estimate)}>
              <FileSpreadsheetIcon /><span><strong>{estimate.title}</strong><small>{estimate.project || estimate.region || `Версия ${estimate.revision}`}</small></span>
            </button>
          ))}
          {!estimates.length ? <p>Сметы появятся после полноценного расчёта.</p> : null}
        </section>
        <footer className="pro-sidebar-footer">
          <button type="button" className={view === "account" ? "active" : ""} onClick={() => onView("account")}><CircleUserRoundIcon /><span><strong>Кабинет</strong><small>Организация и реквизиты</small></span></button>
          <button type="button" className={view === "settings" ? "active settings" : "settings"} onClick={() => onView("settings")} aria-label="Настройки"><Settings2Icon /></button>
        </footer>
      </aside>
      <main className="pro-desktop-main">
        <header className="pro-desktop-topbar">
          <div><h1>{viewMeta[view].title}</h1><p>{viewMeta[view].subtitle}</p></div>
          <button type="button" className="pro-agent-state" onClick={() => onView("settings")}>
            <span className={system?.activeAgent ? "online" : "offline"}><BotIcon /></span>
            <span><strong>{system?.activeAgent?.name || "Агент не подключён"}</strong><small>{system?.activeAgent?.model || "Открыть настройки"}</small></span>
          </button>
        </header>
        <div className="pro-desktop-content">{children}</div>
      </main>
    </div>
  );
}

function MobileShell({ view, onView, onNewChat, estimates, projects, system, children }: {
  view: WorkspaceView;
  onView: (view: WorkspaceView) => void;
  onNewChat: () => void;
  estimates: Estimate[];
  projects: ConstructionProject[];
  system: SystemPreview | null;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const progressRef = useRef(0);
  const gestureRef = useRef<{ mode: "open" | "close"; pointerId: number; startX: number; startedAt: number } | null>(null);
  const drawerWidth = Math.min(334, Math.max(292, viewportWidth * 0.84));
  const progress = drag ?? (open ? 1 : 0);
  progressRef.current = progress;

  useEffect(() => {
    const update = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const navigate = (next: WorkspaceView) => {
    onView(next);
    setOpen(false);
    setDrag(null);
  };
  const begin = (mode: "open" | "close", event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    gestureRef.current = { mode, pointerId: event.pointerId, startX: event.clientX, startedAt: performance.now() };
    setDrag(mode === "open" ? 0 : 1);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const delta = event.clientX - gesture.startX;
    const next = gesture.mode === "open" ? clamp(delta / drawerWidth) : clamp(1 + delta / drawerWidth);
    progressRef.current = next;
    setDrag(next);
    if (Math.abs(delta) > 4) event.preventDefault();
  };
  const end = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const elapsed = Math.max(1, performance.now() - gesture.startedAt);
    const velocity = (event.clientX - gesture.startX) / elapsed;
    const nextOpen = gesture.mode === "open"
      ? progressRef.current > 0.34 || velocity > 0.4
      : !(progressRef.current < 0.66 || velocity < -0.4);
    gestureRef.current = null;
    setOpen(nextOpen);
    setDrag(null);
  };

  return (
    <div className="pro-mobile-root" style={{ "--pro-drawer-width": `${drawerWidth}px`, "--pro-drawer-progress": progress } as CSSProperties}>
      <aside
        className="pro-mobile-drawer"
        role="dialog"
        aria-modal={open}
        aria-label="Навигация"
        aria-hidden={progress <= 0.001}
        style={{ transform: `translate3d(${-drawerWidth * (1 - progress)}px,0,0)` }}
      >
        <header><div><span><SparklesIcon /></span><strong>Просметчик</strong></div><button type="button" onClick={() => setOpen(false)} aria-label="Закрыть"><XIcon /></button></header>
        <nav aria-label="Разделы">
          {mobileNavigation.map((item) => (
            <button type="button" key={item.id} className={view === item.id ? "active" : ""} onClick={() => navigate(item.id)}>{item.icon}<strong>{item.label}</strong></button>
          ))}
        </nav>
        {projects.length ? <section><h2>Проекты</h2>{projects.slice(0, 4).map((project) => <button type="button" key={project.id} onClick={() => navigate("projects")}><FolderKanbanIcon /><span>{project.title}</span></button>)}</section> : null}
        {estimates.length ? <section><h2>Недавнее</h2>{estimates.slice(0, 5).map((estimate) => <button type="button" key={estimate.id} onClick={() => navigate("estimates")}><FileSpreadsheetIcon /><span>{estimate.title}</span></button>)}</section> : null}
        <footer>
          <button type="button" className="pro-mobile-drawer-chat" onClick={() => { onNewChat(); setOpen(false); }}><MessageSquareTextIcon /><strong>Новый чат</strong></button>
          <button type="button" className="pro-mobile-drawer-settings" onClick={() => navigate("settings")}><Settings2Icon />{!system?.activeAgent ? <i /> : null}</button>
        </footer>
        <div className="pro-mobile-close-gesture" onPointerDown={(event) => begin("close", event)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
      </aside>

      <div className="pro-mobile-stage" style={{ transform: `translate3d(${(drawerWidth - 7) * progress}px,0,0) scale(${1 - progress * 0.04})`, borderRadius: `${progress * 30}px` }} data-testid="mobile-shell">
        <div className="chat-reference-shell">
          <MobileHeader view={view} onMenu={() => setOpen(true)} onNewChat={onNewChat} onView={navigate} />
          <main className="chat-reference-main pro-mobile-main">{children}</main>
        </div>
        {progress > 0.001 ? <button type="button" className="pro-mobile-backdrop" aria-label="Закрыть навигацию" onClick={() => setOpen(false)} onPointerDown={(event) => begin("close", event)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} style={{ opacity: progress * 0.22 }} /> : null}
      </div>
      {!open && drag === null ? <div className="pro-mobile-edge-gesture" onPointerDown={(event) => begin("open", event)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} /> : null}
    </div>
  );
}

function MobileHeader({ view, onMenu, onNewChat, onView }: {
  view: WorkspaceView;
  onMenu: () => void;
  onNewChat: () => void;
  onView: (view: WorkspaceView) => void;
}) {
  const focusComposer = () => window.dispatchEvent(new Event("prosmet:focus-composer"));
  if (view === "chat") {
    return (
      <header className="chat-reference-topbar pro-mobile-chat-topbar">
        <button type="button" className="chat-reference-menu" aria-label="Открыть навигацию" onClick={onMenu}><span className="chat-reference-menu-lines" aria-hidden="true"><i /><i /></span></button>
        <button type="button" className="chat-reference-title" aria-label="Выбрать раздел" onClick={onMenu}><span>Чат</span><ChevronDownIcon /></button>
        <button type="button" className="chat-reference-voice" aria-label="Голосовой режим" onClick={focusComposer}><AudioWaveformIcon /></button>
        <div className="chat-reference-chat-actions">
          <button type="button" aria-label="Новый чат" onClick={onNewChat}><PlusIcon /></button>
          <button type="button" aria-label="Больше действий" onClick={() => onView("projects")}><MoreHorizontalIcon /></button>
        </div>
      </header>
    );
  }
  return (
    <header className="pro-mobile-topbar">
      <button type="button" aria-label="Открыть навигацию" onClick={onMenu}><MenuIcon /></button>
      <h1>{viewMeta[view].title}</h1>
      <button type="button" aria-label={view === "projects" || view === "estimates" ? "Создать" : "Больше действий"} onClick={view === "projects" || view === "estimates" ? onNewChat : () => onView("chat")}>
        {view === "projects" || view === "estimates" ? <PlusIcon /> : <MoreHorizontalIcon />}
      </button>
    </header>
  );
}
