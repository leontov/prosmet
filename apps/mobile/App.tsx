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
import { ChevronGlyph, MenuGlyph, VoiceGlyph } from "./src/ReferenceIcons";
import { demoEstimate } from "./src/data";
import { theme } from "./src/theme";

const screenTitles: Record<Exclude<MobileScreen, "projects">, string> = {
  chat: "Чат",
  account: "Профиль",
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
  const title = screenTitles[screen as Exclude<MobileScreen, "projects">];

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
                <Pressable
                  style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Открыть навигацию"
                  accessibilityState={{ expanded: menuOpen }}
                  onPress={() => setMenuOpen(true)}
                >
                  <MenuGlyph />
                  <View style={styles.badge}><Text style={styles.badgeText}>1</Text></View>
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
                  accessibilityLabel="Голосовой режим"
                  onPress={() => navigate("chat")}
                >
                  <VoiceGlyph />
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
  content: { flex: 1, minHeight: 0 }
});
