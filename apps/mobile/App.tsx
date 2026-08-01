import { useCallback, useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import type { Estimate } from "@prosmet/contracts";
import { RuntimeProvider } from "./src/runtime/RuntimeProvider";
import { ChatScreen } from "./src/screens/ChatScreen";
import { EstimateScreen } from "./src/screens/EstimateScreen";
import { AccountScreen } from "./src/screens/AccountScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { MobileNavigation, type MobileScreen } from "./src/MobileNavigation";
import { ChevronGlyph, MenuGlyph, VoiceGlyph } from "./src/ReferenceIcons";
import { theme } from "./src/theme";

type AgentRegistryPreview = {
  agents?: Array<{ active?: boolean }>;
  activeAgentId?: string | null;
};

const screenTitles: Record<MobileScreen, string> = {
  chat: "Чат",
  projects: "Смета",
  account: "Профиль",
  settings: "Настройки"
};

export default function App() {
  const [screen, setScreen] = useState<MobileScreen>("chat");
  const [menuOpen, setMenuOpen] = useState(false);
  const [attentionCount, setAttentionCount] = useState(0);
  const [focusRequest, setFocusRequest] = useState(0);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [estimateOpen, setEstimateOpen] = useState(false);

  const baseUrl = process.env.EXPO_PUBLIC_PROSMET_API_URL || "https://kolibriai.online";

  useEffect(() => {
    let active = true;
    fetch(`${baseUrl}/api/agents`)
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
  }, [baseUrl]);

  const onEstimateReady = useCallback((incoming: Estimate) => {
    setEstimate(incoming);
    setEstimateOpen(true);
  }, []);

  const navigate = (next: MobileScreen) => {
    setScreen(next);
    setMenuOpen(false);
  };

  const showEstimate = Boolean(estimate && (estimateOpen || screen === "projects"));
  const title = screenTitles[screen];

  return (
    <SafeAreaProvider>
      <RuntimeProvider onEstimateReady={onEstimateReady}>
        <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
          <StatusBar style="dark" />
          {showEstimate && estimate ? (
            <EstimateScreen
              estimate={estimate}
              onChange={setEstimate}
              onClose={() => {
                setEstimateOpen(false);
                setScreen("chat");
              }}
              libraryMode={screen === "projects" && !estimateOpen}
            />
          ) : (
            <View style={styles.shell}>
              <View style={styles.topbar}>
                <Pressable
                  style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Открыть навигацию"
                  accessibilityState={{ expanded: menuOpen }}
                  onPress={() => setMenuOpen(true)}
                >
                  <MenuGlyph />
                  {attentionCount > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{attentionCount}</Text></View> : null}
                </Pressable>

                <Pressable
                  style={({ pressed }) => [styles.titleButton, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Выбрать раздел"
                  onPress={() => setMenuOpen(true)}
                >
                  <View style={styles.titleUnderline}><Text style={styles.title}>{title}</Text></View>
                  <ChevronGlyph />
                </Pressable>

                <Pressable
                  style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Перейти к голосовому вводу"
                  onPress={() => {
                    navigate("chat");
                    setFocusRequest((value) => value + 1);
                  }}
                >
                  <VoiceGlyph />
                </Pressable>
              </View>

              <View style={styles.content}>
                {screen === "chat" ? (
                  <ChatScreen
                    hasEstimate={Boolean(estimate)}
                    onOpenEstimate={() => estimate && setEstimateOpen(true)}
                    focusRequest={focusRequest}
                  />
                ) : null}
                {screen === "projects" ? <EmptyEstimate onCreate={() => navigate("chat")} /> : null}
                {screen === "account" ? <AccountScreen /> : null}
                {screen === "settings" ? <SettingsScreen /> : null}
              </View>

              {menuOpen ? (
                <MobileNavigation screen={screen} onNavigate={navigate} onClose={() => setMenuOpen(false)} />
              ) : null}
            </View>
          )}
        </SafeAreaView>
      </RuntimeProvider>
    </SafeAreaProvider>
  );
}

function EmptyEstimate({ onCreate }: { onCreate: () => void }) {
  return (
    <View style={styles.emptyEstimate}>
      <Text style={styles.emptyEstimateTitle}>Смета ещё не создана</Text>
      <Text style={styles.emptyEstimateText}>Начните реальный диалог с подключённым агентом. Демонстрационная смета в приложении не используется.</Text>
      <Pressable style={styles.emptyEstimateButton} accessibilityRole="button" onPress={onCreate}>
        <Text style={styles.emptyEstimateButtonText}>Перейти в чат</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.canvas },
  shell: { flex: 1, backgroundColor: theme.canvas },
  topbar: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: theme.canvas,
    paddingHorizontal: 16,
    paddingBottom: 8
  },
  circleButton: {
    width: 54,
    height: 54,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.25,
    borderColor: "rgba(17,18,20,0.82)",
    borderRadius: 27,
    backgroundColor: theme.canvas,
    shadowColor: "#111214",
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5
  },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.82 },
  badge: {
    position: "absolute",
    top: -9,
    right: -6,
    minWidth: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: theme.canvas,
    borderRadius: 14,
    backgroundColor: "#f0182d"
  },
  badgeText: { color: "white", fontSize: 16, lineHeight: 19, fontWeight: "800" },
  titleButton: {
    minHeight: 54,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 8
  },
  titleUnderline: { borderBottomWidth: 2, borderBottomColor: "#111214", paddingBottom: 4 },
  title: { color: "#111214", fontSize: 23, lineHeight: 28, fontWeight: "800", letterSpacing: -0.8 },
  content: { flex: 1, minHeight: 0 },
  emptyEstimate: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  emptyEstimateTitle: { color: theme.text, fontSize: 24, fontWeight: "700", letterSpacing: -0.7, textAlign: "center" },
  emptyEstimateText: { marginTop: 10, color: theme.muted, fontSize: 15, lineHeight: 23, textAlign: "center" },
  emptyEstimateButton: { minWidth: 190, minHeight: 50, alignItems: "center", justifyContent: "center", marginTop: 24, borderRadius: 16, backgroundColor: theme.text, paddingHorizontal: 20 },
  emptyEstimateButtonText: { color: "white", fontSize: 15, fontWeight: "700" }
});
