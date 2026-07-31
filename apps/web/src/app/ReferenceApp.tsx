import { useCallback, useEffect, useState } from "react";
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
import { demoEstimate } from "../data/demo";

const storageKey = "prosmet-greenfield-estimate";

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
  { id: "catalog" as const, label: "Каталог цен", description: "Личные и региональные цены", icon: <TagIcon /> },
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

function loadEstimate(): Estimate | null {
  try {
    const value = window.localStorage.getItem(storageKey);
    return value ? JSON.parse(value) as Estimate : null;
  } catch {
    return null;
  }
}

export function ReferenceApp() {
  const mobile = useMediaQuery("(max-width: 767px)");
  return mobile ? <MobileReferenceApplication /> : <DesktopApplication />;
}

function MobileReferenceApplication() {
  const [view, setView] = useState<AppView>("chat");
  const [menuOpen, setMenuOpen] = useState(false);
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

  const navigate = (nextView: AppView) => {
    setView(nextView);
    setMenuOpen(false);
  };

  const focusComposer = () => {
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
            <span className="chat-reference-badge" aria-label="1 уведомление">1</span>
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
          <Workspace view={view} estimate={estimate} onOpenEstimate={openEstimate} />
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

        {estimateOpen && estimate ? (
          <EstimateEditor
            mobile
            estimate={estimate}
            onChange={setEstimate}
            onClose={() => setEstimateOpen(false)}
          />
        ) : null}
      </div>
    </RuntimeProvider>
  );
}

function Workspace({ view, estimate, onOpenEstimate }: { view: AppView; estimate: Estimate | null; onOpenEstimate: () => void }) {
  if (view === "chat") return <ChatSurface mobile hasEstimate={Boolean(estimate)} onOpenEstimate={onOpenEstimate} />;
  if (view === "account") return <AccountView mobile />;
  if (view === "settings") return <SettingsView mobile />;
  return <LibraryView view={view} mobile onOpenEstimate={onOpenEstimate} />;
}
