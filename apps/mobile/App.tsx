import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import type { Estimate, EstimateListResponse } from "@prosmet/contracts";
import { RuntimeProvider } from "./src/runtime/RuntimeProvider";
import { ChatScreen, type PendingPrompt } from "./src/screens/ChatScreen";
import { EstimateScreen } from "./src/screens/EstimateScreen";
import { AccountScreen } from "./src/screens/AccountScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { LibraryScreen } from "./src/screens/LibraryScreen";
import { ProjectsScreen } from "./src/screens/ProjectsScreen";
import { ProjectScreen } from "./src/screens/ProjectScreen";
import { ScheduledScreen } from "./src/screens/ScheduledScreen";
import { MobileNavigation, type MobileScreen } from "./src/MobileNavigation";
import { CircleButton, ScreenHeader, mobileChromeStyles } from "./src/MobileChrome";
import { MenuGlyph, MoreGlyph } from "./src/ReferenceIcons";
import { mobileApiFetch } from "./src/agent-session";
import { groupProjects } from "./src/mobile-data";
import { theme } from "./src/theme";

type AgentRegistryPreview = {
  agents?: Array<{ active?: boolean }>;
  activeAgentId?: string | null;
};

export default function App() {
  const [runtimeKey, setRuntimeKey] = useState(0);
  const [screen, setScreen] = useState<MobileScreen>("chat");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [attentionCount, setAttentionCount] = useState(0);
  const [focusRequest, setFocusRequest] = useState(0);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt>(null);

  const projects = useMemo(() => groupProjects(estimates), [estimates]);
  const selectedProject = useMemo(() => projects.find((project) => project.id === selectedProjectId) || null, [projects, selectedProjectId]);
  const recent = useMemo(() => [...estimates]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 12), [estimates]);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      mobileApiFetch("/api/agents").then(async (response) => {
        if (!response.ok) throw new Error("agents unavailable");
        return response.json() as Promise<AgentRegistryPreview>;
      }),
      mobileApiFetch("/api/estimates").then(async (response) => {
        if (!response.ok) throw new Error("estimates unavailable");
        return response.json() as Promise<EstimateListResponse>;
      })
    ]).then(([agentsResult, estimatesResult]) => {
      if (!active) return;
      if (agentsResult.status === "fulfilled") {
        const catalog = agentsResult.value;
        const configured = Boolean(catalog.activeAgentId || catalog.agents?.some((agent) => agent.active));
        setAttentionCount(configured ? 0 : 1);
      } else {
        setAttentionCount(1);
      }
      if (estimatesResult.status === "fulfilled") setEstimates(estimatesResult.value.estimates);
    });
    return () => { active = false; };
  }, []);

  const replaceEstimate = useCallback((incoming: Estimate) => {
    setEstimate(incoming);
    setEstimates((current) => {
      const existing = current.findIndex((item) => item.id === incoming.id);
      if (existing < 0) return [incoming, ...current];
      return current.map((item) => item.id === incoming.id ? incoming : item);
    });
  }, []);

  const onEstimateReady = useCallback((incoming: Estimate) => {
    replaceEstimate(incoming);
    setDrawerOpen(false);
    setEstimateOpen(true);
  }, [replaceEstimate]);

  const navigate = useCallback((next: MobileScreen) => {
    setScreen(next);
    setDrawerOpen(false);
  }, []);

  const startNewChat = useCallback(() => {
    setPendingPrompt(null);
    setEstimateOpen(false);
    setScreen("chat");
    setDrawerOpen(false);
    setRuntimeKey((value) => value + 1);
    setFocusRequest((value) => value + 1);
  }, []);

  const openEstimate = useCallback(async (id: string) => {
    const local = estimates.find((item) => item.id === id);
    if (local) {
      setEstimate(local);
      setEstimateOpen(true);
      setDrawerOpen(false);
      return;
    }
    const response = await mobileApiFetch(`/api/estimates/${encodeURIComponent(id)}`);
    if (!response.ok) return;
    const incoming = await response.json() as Estimate;
    replaceEstimate(incoming);
    setEstimateOpen(true);
    setDrawerOpen(false);
  }, [estimates, replaceEstimate]);

  const openProject = useCallback((id: string) => {
    setSelectedProjectId(id);
    setScreen("project");
    setDrawerOpen(false);
  }, []);

  const askProject = useCallback((message: string) => {
    const projectTitle = selectedProject?.title || "текущем проекте";
    setPendingPrompt({ id: Date.now(), text: `В проекте «${projectTitle}»: ${message}` });
    setScreen("chat");
    setDrawerOpen(false);
  }, [selectedProject?.title]);

  return (
    <SafeAreaProvider>
      <RuntimeProvider key={runtimeKey} onEstimateReady={onEstimateReady}>
        <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
          <StatusBar style="dark" />
          {estimateOpen && estimate ? (
            <EstimateScreen estimate={estimate} onChange={replaceEstimate} onClose={() => setEstimateOpen(false)} />
          ) : (
            <MobileNavigation
              open={drawerOpen}
              screen={screen}
              attentionCount={attentionCount}
              projects={projects.map((project) => ({ id: project.id, title: project.title }))}
              recent={recent.map((item) => ({ id: item.id, title: item.title }))}
              onOpenChange={setDrawerOpen}
              onNavigate={navigate}
              onOpenProject={openProject}
              onOpenRecent={(id) => { void openEstimate(id); }}
              onNewChat={startNewChat}
            >
              {screen === "chat" ? (
                <ChatScreen
                  hasEstimate={Boolean(estimate)}
                  onOpenEstimate={() => estimate && setEstimateOpen(true)}
                  focusRequest={focusRequest}
                  attentionCount={attentionCount}
                  pendingPrompt={pendingPrompt}
                  onPromptConsumed={() => setPendingPrompt(null)}
                  onOpenMenu={() => setDrawerOpen(true)}
                  onNewChat={startNewChat}
                  onOpenLibrary={() => navigate("library")}
                  onOpenSettings={() => navigate("settings")}
                />
              ) : null}
              {screen === "library" || screen === "estimates" ? (
                <LibraryScreen
                  estimates={estimates}
                  initialTab={screen === "estimates" ? "estimates" : "all"}
                  attentionCount={attentionCount}
                  onMenu={() => setDrawerOpen(true)}
                  onOpenProject={openProject}
                  onOpenEstimate={(id) => { void openEstimate(id); }}
                />
              ) : null}
              {screen === "projects" ? (
                <ProjectsScreen
                  estimates={estimates}
                  attentionCount={attentionCount}
                  onMenu={() => setDrawerOpen(true)}
                  onCreate={startNewChat}
                  onOpenProject={openProject}
                />
              ) : null}
              {screen === "project" && selectedProject ? (
                <ProjectScreen
                  project={selectedProject}
                  onBack={() => navigate("projects")}
                  onOpenEstimate={(id) => { void openEstimate(id); }}
                  onAsk={askProject}
                  onOpenSettings={() => navigate("settings")}
                />
              ) : null}
              {screen === "project" && !selectedProject ? (
                <ProjectsScreen estimates={estimates} attentionCount={attentionCount} onMenu={() => setDrawerOpen(true)} onCreate={startNewChat} onOpenProject={openProject} />
              ) : null}
              {screen === "scheduled" ? <ScheduledScreen attentionCount={attentionCount} onMenu={() => setDrawerOpen(true)} onCreate={startNewChat} /> : null}
              {screen === "account" ? <WrappedScreen title="Профиль" attentionCount={attentionCount} onMenu={() => setDrawerOpen(true)} onMore={() => navigate("settings")}><AccountScreen /></WrappedScreen> : null}
              {screen === "settings" ? <WrappedScreen title="Настройки" attentionCount={attentionCount} onMenu={() => setDrawerOpen(true)}><SettingsScreen /></WrappedScreen> : null}
            </MobileNavigation>
          )}
        </SafeAreaView>
      </RuntimeProvider>
    </SafeAreaProvider>
  );
}

function WrappedScreen({ title, attentionCount, onMenu, onMore, children }: { title: string; attentionCount: number; onMenu: () => void; onMore?: () => void; children: React.ReactNode }) {
  return (
    <View style={mobileChromeStyles.screen}>
      <ScreenHeader
        title={title}
        left={<CircleButton accessibilityLabel="Открыть навигацию" onPress={onMenu} badge={attentionCount}><MenuGlyph /></CircleButton>}
        right={onMore ? <CircleButton accessibilityLabel="Больше действий" onPress={onMore}><MoreGlyph /></CircleButton> : undefined}
      />
      <View style={styles.wrappedBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.canvas },
  wrappedBody: { flex: 1, minHeight: 0 }
});
