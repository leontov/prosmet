import { useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ChatGlyph,
  ClockGlyph,
  ComposeGlyph,
  DocumentGlyph,
  FolderGlyph,
  LibraryGlyph,
  MoreGlyph,
  RemoteGlyph,
  SearchGlyph,
  SettingsGlyph
} from "./ReferenceIcons";
import { theme } from "./theme";

export type MobileScreen =
  | "chat"
  | "estimates"
  | "library"
  | "projects"
  | "project"
  | "scheduled"
  | "account"
  | "settings";

export type DrawerProject = { id: string; title: string };
export type DrawerRecent = { id: string; title: string };

type Props = {
  open: boolean;
  screen: MobileScreen;
  attentionCount: number;
  projects: DrawerProject[];
  recent: DrawerRecent[];
  children: ReactNode;
  onOpenChange: (open: boolean) => void;
  onNavigate: (screen: MobileScreen) => void;
  onOpenProject: (id: string) => void;
  onOpenRecent: (id: string) => void;
  onNewChat: () => void;
};

const primaryItems: Array<{
  id: MobileScreen;
  label: string;
  icon: "estimate" | "library" | "project" | "scheduled" | "remote" | "more";
}> = [
  { id: "estimates", label: "Сметы", icon: "estimate" },
  { id: "library", label: "Библиотека", icon: "library" },
  { id: "projects", label: "Проекты", icon: "project" },
  { id: "scheduled", label: "Запланированные", icon: "scheduled" },
  { id: "settings", label: "Агенты", icon: "remote" },
  { id: "account", label: "Больше", icon: "more" }
];

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function MobileNavigation({
  open,
  screen,
  attentionCount,
  projects,
  recent,
  children,
  onOpenChange,
  onNavigate,
  onOpenProject,
  onOpenRecent,
  onNewChat
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(330, Math.max(286, width * 0.81));
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;
  const progressValue = useRef(open ? 1 : 0);
  const gestureStart = useRef(open ? 1 : 0);

  useEffect(() => {
    const subscription = progress.addListener(({ value }) => { progressValue.current = value; });
    return () => progress.removeListener(subscription);
  }, [progress]);

  useEffect(() => {
    Animated.spring(progress, {
      toValue: open ? 1 : 0,
      damping: 26,
      stiffness: 260,
      mass: 0.84,
      useNativeDriver: false
    }).start();
  }, [open, progress]);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 7 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderGrant: () => {
      gestureStart.current = progressValue.current;
      progress.stopAnimation();
    },
    onPanResponderMove: (_event, gesture) => {
      progress.setValue(clamp(gestureStart.current + gesture.dx / drawerWidth));
    },
    onPanResponderRelease: (_event, gesture) => {
      const shouldOpen = gesture.vx > 0.48 || (gesture.vx > -0.48 && progressValue.current >= 0.46);
      onOpenChange(shouldOpen);
    },
    onPanResponderTerminate: () => onOpenChange(progressValue.current >= 0.5)
  }), [drawerWidth, onOpenChange, progress]);

  const drawerTranslate = progress.interpolate({ inputRange: [0, 1], outputRange: [-drawerWidth, 0] });
  const contentTranslate = progress.interpolate({ inputRange: [0, 1], outputRange: [0, drawerWidth - 8] });
  const contentScale = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] });
  const overlayOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.24] });

  const navigate = (next: MobileScreen) => {
    onNavigate(next);
    onOpenChange(false);
  };

  return (
    <View style={styles.root}>
      <Animated.View
        pointerEvents={open ? "auto" : "none"}
        accessibilityViewIsModal={open}
        style={[styles.drawer, { width: drawerWidth, transform: [{ translateX: drawerTranslate }] }]}
        {...panResponder.panHandlers}
      >
        <View style={styles.drawerHeader}>
          <Text style={styles.brand}>ProSmet</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Поиск" onPress={() => navigate("library")} style={({ pressed }) => [styles.searchButton, pressed && styles.pressed]}>
            <SearchGlyph />
          </Pressable>
        </View>

        <ScrollView
          style={styles.drawerScroll}
          contentContainerStyle={[styles.drawerContent, { paddingBottom: 118 + Math.max(insets.bottom, 8) }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.primaryList} accessibilityRole="menu">
            {primaryItems.map((item) => {
              const selected = screen === item.id || (screen === "project" && item.id === "projects");
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected }}
                  onPress={() => navigate(item.id)}
                  style={({ pressed }) => [styles.primaryRow, selected && styles.primaryRowSelected, pressed && styles.pressed]}
                >
                  <View style={styles.primaryIcon}><PrimaryIcon name={item.icon} /></View>
                  <Text style={styles.primaryLabel}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {projects.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Закреплено</Text>
              {projects.slice(0, 4).map((project) => (
                <Pressable key={project.id} onPress={() => { onOpenProject(project.id); onOpenChange(false); }} style={({ pressed }) => [styles.compactRow, pressed && styles.pressed]}>
                  <View style={styles.compactIcon}><FolderGlyph /></View>
                  <Text style={styles.compactLabel} numberOfLines={1}>{project.title}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {recent.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Недавнее</Text>
              {recent.slice(0, 8).map((item) => (
                <Pressable key={item.id} onPress={() => { onOpenRecent(item.id); onOpenChange(false); }} style={({ pressed }) => [styles.compactRow, pressed && styles.pressed]}>
                  <View style={styles.compactIcon}><ChatGlyph /></View>
                  <Text style={styles.compactLabel} numberOfLines={1}>{item.title}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.drawerDock, { bottom: Math.max(insets.bottom, 12) }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Новый чат" onPress={() => { onNewChat(); onOpenChange(false); }} style={({ pressed }) => [styles.chatDock, pressed && styles.pressed]}>
            <ComposeGlyph />
            <Text style={styles.chatDockText}>Чат</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Настройки" onPress={() => navigate("settings")} style={({ pressed }) => [styles.settingsDock, pressed && styles.pressed]}>
            <SettingsGlyph />
            {attentionCount > 0 ? <View style={styles.settingsAttention} /> : null}
          </Pressable>
        </View>
      </Animated.View>

      <Animated.View
        style={[
          styles.content,
          open && styles.contentOpen,
          { transform: [{ translateX: contentTranslate }, { scale: contentScale }] }
        ]}
        importantForAccessibility={open ? "no-hide-descendants" : "auto"}
      >
        {children}
        <Animated.View pointerEvents={open ? "auto" : "none"} style={[styles.backdrop, { opacity: overlayOpacity }]} {...panResponder.panHandlers}>
          <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Закрыть меню" onPress={() => onOpenChange(false)} />
        </Animated.View>
      </Animated.View>

      {!open ? <View style={styles.edgeGesture} {...panResponder.panHandlers} /> : null}
    </View>
  );
}

function PrimaryIcon({ name }: { name: (typeof primaryItems)[number]["icon"] }) {
  if (name === "estimate") return <DocumentGlyph color="#111214" />;
  if (name === "library") return <LibraryGlyph />;
  if (name === "project") return <FolderGlyph />;
  if (name === "scheduled") return <ClockGlyph />;
  if (name === "remote") return <RemoteGlyph />;
  return <MoreGlyph />;
}

const styles = StyleSheet.create({
  root: { flex: 1, position: "relative", overflow: "hidden", backgroundColor: theme.canvas },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  drawer: { position: "absolute", top: 0, bottom: 0, left: 0, zIndex: 1, backgroundColor: theme.canvas },
  drawerHeader: { minHeight: 76, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24 },
  brand: { color: "#111214", fontSize: 28, lineHeight: 34, fontWeight: "800", letterSpacing: -1.1 },
  searchButton: { width: 58, height: 58, alignItems: "center", justifyContent: "center", borderWidth: 1.1, borderColor: "rgba(17,18,20,0.72)", borderRadius: 29, backgroundColor: "#ececed" },
  drawerScroll: { flex: 1 },
  drawerContent: { paddingHorizontal: 20, paddingTop: 10 },
  primaryList: { gap: 2 },
  primaryRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 17, borderRadius: 16, paddingHorizontal: 8 },
  primaryRowSelected: { backgroundColor: "#f2f2f3" },
  primaryIcon: { width: 38, alignItems: "center", justifyContent: "center" },
  primaryLabel: { flex: 1, color: "#111214", fontSize: 22, lineHeight: 28, fontWeight: "750", letterSpacing: -0.65 },
  section: { marginTop: 28 },
  sectionTitle: { marginBottom: 12, paddingHorizontal: 6, color: "#111214", fontSize: 22, lineHeight: 28, fontWeight: "800", letterSpacing: -0.65 },
  compactRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 13, borderRadius: 14, paddingHorizontal: 7 },
  compactIcon: { width: 32, alignItems: "center", justifyContent: "center", transform: [{ scale: 0.86 }] },
  compactLabel: { flex: 1, color: "#111214", fontSize: 19, lineHeight: 24, fontWeight: "600", letterSpacing: -0.35 },
  drawerDock: { position: "absolute", left: 20, right: 20, flexDirection: "row", alignItems: "center", gap: 18 },
  chatDock: { minWidth: 155, height: 68, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 15, borderWidth: 1.3, borderColor: "rgba(17,18,20,0.82)", borderRadius: 34, backgroundColor: theme.canvas, shadowColor: "#111214", shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 4 },
  chatDockText: { color: "#111214", fontSize: 21, lineHeight: 26, fontWeight: "800" },
  settingsDock: { width: 60, height: 60, position: "relative", alignItems: "center", justifyContent: "center", borderWidth: 1.2, borderColor: "rgba(17,18,20,0.78)", borderRadius: 30, backgroundColor: theme.canvas },
  settingsAttention: { position: "absolute", top: 5, right: 5, width: 10, height: 10, borderRadius: 5, backgroundColor: "#f0182d" },
  content: { flex: 1, zIndex: 2, overflow: "hidden", backgroundColor: theme.canvas },
  contentOpen: { borderRadius: 32, shadowColor: "#111214", shadowOpacity: 0.2, shadowRadius: 28, shadowOffset: { width: -10, height: 0 }, elevation: 18 },
  backdrop: { ...StyleSheet.absoluteFillObject, zIndex: 20, backgroundColor: "#ffffff" },
  edgeGesture: { position: "absolute", top: 72, bottom: 0, left: 0, width: 24, zIndex: 30 }
});
