import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppView, Estimate } from "@prosmet/contracts";
import {
  AudioWaveformIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleUserRoundIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderKanbanIcon,
  MessageSquareTextIcon,
  Settings2Icon,
  TagIcon,
  XIcon
} from "lucide-react";
import { App as DesktopApplication } from "./App";
import { RuntimeProvider } from "../runtime/RuntimeProvider";
import { ChatSurface } from "../features/chat/ChatSurface";
import { EstimateEditor } from "../features/estimate/EstimateEditor";
import { LibraryView } from "../features/library/LibraryView";
import { AccountView } from "../features/account/AccountView";
import { SettingsView } from "../features/settings/SettingsView";
import { listStoredEstimates, persistEstimate } from "../features/estimate/estimate-api";

const workspaceKey = "prosmet-workspace-v1";
const legacyEstimateKey = "prosmet-greenfield-estimate";

type WorkspaceState = {
  estimates: Estimate[];
  activeEstimateId: string | null;
};

type AgentRegistryPreview = {
  agents?: Array<{ id?: string; active?: boolean }>;
  activeAgentId?: string | null;
};

const viewMeta: Record<AppView, { title: string; subtitle: string }> = {
  chat: { title: "Чат", subtitle: "Новый диалог и расчёт" },
  projects: { title: "Объекты", subtitle: "Проекты и рабочие контексты" },
  estimates: { title: "Сметы", subtitle: "Версии и утверждённые расчёты" },
  documents: { title: "Документы", subtitle: "КП, договоры, акты и счета" },
  catalog: { title: "Каталог цен", subtitle: "Личные и региональные цены" },
  account: { title: "Профиль", subtitle: "Кабинет и организация" },
  settings: { title: "Настройки", subtitle: "Агенты, данные и безопасность" }
};

const navigation = [
  { id: "chat" as const, label: "Чат", description: "Новый диалог и расчёт", icon: <MessageSquareTextIcon /> },
  { id: "projects" as const, label: "Объекты", description: "Проекты и рабочие контексты", icon: <FolderKanbanIcon /> },
  { id: "estimates" as const, label: "Сметы", description: "Версии и утверждённые расчёты", icon: <FileSpreadsheetIcon /> },
  { id: "documents" as const, label: "Документы", description: "КП, договоры, акты и счета", icon: <FileTextIcon /> },
  { id: "catalog" as const, label: "Каталог цен", description: "Цены из сохранённых смет", icon: <TagIcon /> },
  { id: "account" as const, label: "Профиль", description: "Кабинет и организация", icon: <CircleUserRoundIcon /> },
  { id: "settings" as const, label: "Настройки", description: "Агенты, данные и безопасность", icon: <Settings2Icon /> }
];

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

export function ReferenceApp() {
  const mobile = useMediaQuery("(max-width: 767px)");
  return mobile ? <MobileReferenceApplication /> : <DesktopApplication />;
}

function MobileReferenceApplication() {
  const [view, setView] = useState<AppView>("chat");
  const [menuOpen, setMenuOpen] = useState(false);
  const [attentionCount, setAttentionCount] = useState(0);
  const [workspace, setWorkspace] = useState<WorkspaceState>(() => typeof window === "undefined"
    ? { estimates: [], activeEstimateId: null }
    : loadWorkspace());
  const [estimateOpen, setEstimateOpen] = useState(false);

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
  }, [workspace.activeEstimateId, workspace.estimates]);

  const navigate = (nextView: AppView) => {
    setView(nextView);
    setMenuOpen(false);
  };

  const focusComposer = () => {
    if (view !== "chat") setView("chat");
    window.requestAnimationFrame(() => document.getElementById("mobile-message")?.focus());
  };

  return (
    <RuntimeProvider onEstimateReady={handleEstimateReady}>
      <div className="chat-reference-shell" data-testid="mobile-shell">
        <header className="chat-reference-topbar">
          <button
            type="button"
            className="chat-reference-menu"
            aria-label="Открыть навигацию"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <span className="chat-reference-menu-lines" aria-hidden="true"><i /><i /></span>
            {attentionCount > 0 ? (
              <span className="chat-reference-badge" aria-label={`${attentionCount} действие требует внимания`}>
                {attentionCount}
              </span>
            ) : null}
          </button>

          <button type="button" className="chat-reference-title" aria-label="Выбрать раздел" onClick={() => setMenuOpen(true)}>
            <span>{viewMeta[view].title}</span>
            <ChevronDownIcon />
          </button>

          <button type="button" className="chat-reference-voice" aria-label="Голосовой режим" onClick={focusComposer}>
            <AudioWaveformIcon />
          </button>
        </header>

        <main className="chat-reference-main">
          <Workspace
            view={view}
            estimates={workspace.estimates}
            activeEstimate={activeEstimate}
            onOpenEstimate={openEstimate}
            onCreate={() => navigate("chat")}
          />
        </main>

        {menuOpen ? (
          <div className="mobile-navigation-layer">
            <button type="button" className="mobile-navigation-backdrop" aria-label="Закрыть навигацию" onClick={() => setMenuOpen(false)} />
            <section className="mobile-navigation-drawer" role="dialog" aria-modal="true" aria-label="Навигация">
              <header className="mobile-navigation-header">
                <div><strong>Разделы</strong><span>{viewMeta[view].subtitle}</span></div>
                <button type="button" aria-label="Закрыть" onClick={() => setMenuOpen(false)}><XIcon /></button>
              </header>
              <nav className="mobile-navigation-list" aria-label="Мобильная навигация">
                {navigation.map((item) => (
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

        {estimateOpen && activeEstimate ? (
          <EstimateEditor
            mobile
            estimate={activeEstimate}
            onChange={updateActiveEstimate}
            onClose={() => setEstimateOpen(false)}
          />
        ) : null}
      </div>
    </RuntimeProvider>
  );
}

function Workspace({ view, estimates, activeEstimate, onOpenEstimate, onCreate }: {
  view: AppView;
  estimates: Estimate[];
  activeEstimate: Estimate | null;
  onOpenEstimate: (id?: string) => void;
  onCreate: () => void;
}) {
  if (view === "chat") {
    return <ChatSurface mobile hasEstimate={Boolean(activeEstimate)} onOpenEstimate={() => onOpenEstimate(activeEstimate?.id)} />;
  }
  if (view === "account") return <AccountView mobile />;
  if (view === "settings") return <SettingsView mobile />;
  return <LibraryView view={view} mobile estimates={estimates} onOpenEstimate={onOpenEstimate} onCreate={onCreate} />;
}
