import { useCallback, useState } from "react";
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
import { demoEstimate } from "./src/data";
import { theme } from "./src/theme";

const screenTitles: Record<Exclude<MobileScreen, "projects">, string> = {
  chat: "Просметчик",
  account: "Кабинет",
  settings: "Настройки"
};

export default function App() {
  const [screen, setScreen] = useState<MobileScreen>("chat");
  const [menuOpen, setMenuOpen] = useState(false);
  const [estimate, setEstimate] = useState<Estimate>(demoEstimate);
  const [estimateOpen, setEstimateOpen] = useState(false);

  const onEstimateReady = useCallback((incoming: Estimate) => {
    setEstimate(incoming);
    setEstimateOpen(true);
  }, []);

  const navigate = (next: MobileScreen) => {
    setScreen(next);
    setMenuOpen(false);
  };

  const showEstimate = estimateOpen || screen === "projects";

  return (
    <SafeAreaProvider>
      <RuntimeProvider onEstimateReady={onEstimateReady}>
        <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
          <StatusBar style="dark" />
          {showEstimate ? (
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
                <Pressable style={styles.brand} accessibilityRole="button" onPress={() => navigate("chat")}>
                  <View style={styles.mark}><Text style={styles.markText}>✦</Text></View>
                  <Text style={styles.title}>{screenTitles[screen as Exclude<MobileScreen, "projects">]}</Text>
                </Pressable>
                <Pressable
                  style={styles.menuButton}
                  accessibilityRole="button"
                  accessibilityLabel="Открыть навигацию"
                  accessibilityState={{ expanded: menuOpen }}
                  onPress={() => setMenuOpen(true)}
                >
                  <Text style={styles.menuGlyph}>☰</Text>
                </Pressable>
              </View>

              <View style={styles.content}>
                {screen === "chat" ? <ChatScreen hasEstimate={Boolean(estimate)} onOpenEstimate={() => setEstimateOpen(true)} /> : null}
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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.canvas },
  shell: { flex: 1, backgroundColor: theme.canvas },
  topbar: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
    paddingHorizontal: 12
  },
  brand: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 13, paddingHorizontal: 2 },
  mark: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: theme.text },
  markText: { color: "white", fontSize: 17 },
  title: { color: theme.text, fontSize: 16, fontWeight: "700", letterSpacing: -0.35 },
  menuButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: theme.soft },
  menuGlyph: { color: theme.text, fontSize: 22, lineHeight: 24 },
  content: { flex: 1 }
});
