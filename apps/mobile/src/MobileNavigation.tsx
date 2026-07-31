import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "./theme";

export type MobileScreen = "chat" | "projects" | "account" | "settings";

type Props = {
  screen: MobileScreen;
  onNavigate: (screen: MobileScreen) => void;
  onClose: () => void;
};

const items: Array<{ id: MobileScreen; label: string; detail: string; icon: string }> = [
  { id: "chat", label: "Чат", detail: "Новый диалог и расчёт", icon: "✦" },
  { id: "projects", label: "Смета", detail: "Открыть текущий расчёт", icon: "▤" },
  { id: "account", label: "Профиль", detail: "Кабинет и организация", icon: "◯" },
  { id: "settings", label: "Настройки", detail: "Агенты, данные и безопасность", icon: "⚙" }
];

export function MobileNavigation({ screen, onNavigate, onClose }: Props) {
  return (
    <View style={styles.layer} accessibilityViewIsModal>
      <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Закрыть навигацию" onPress={onClose} />
      <View style={styles.panel}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Разделы</Text>
            <Text style={styles.subtitle}>Навигация открывается только по запросу</Text>
          </View>
          <Pressable style={styles.close} accessibilityLabel="Закрыть" onPress={onClose}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>

        <View style={styles.list} accessibilityRole="menu">
          {items.map((item) => (
            <Pressable
              key={item.id}
              style={[styles.item, screen === item.id && styles.itemActive]}
              accessibilityRole="menuitem"
              accessibilityState={{ selected: screen === item.id }}
              onPress={() => onNavigate(item.id)}
            >
              <View style={[styles.icon, screen === item.id && styles.iconActive]}>
                <Text style={[styles.iconText, screen === item.id && styles.iconTextActive]}>{item.icon}</Text>
              </View>
              <View style={styles.copy}>
                <Text style={styles.label}>{item.label}</Text>
                <Text style={styles.detail}>{item.detail}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 100,
    flexDirection: "row",
    justifyContent: "flex-end",
    backgroundColor: "rgba(20,20,23,0.28)"
  },
  panel: {
    width: "88%",
    maxWidth: 360,
    height: "100%",
    backgroundColor: theme.canvas,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 18,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: -10, height: 0 },
    elevation: 18
  },
  header: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
    paddingHorizontal: 6,
    paddingBottom: 10
  },
  title: { color: theme.text, fontSize: 20, fontWeight: "700", letterSpacing: -0.6 },
  subtitle: { marginTop: 4, color: theme.muted, fontSize: 12 },
  close: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: theme.soft
  },
  closeText: { color: theme.muted, fontSize: 28, lineHeight: 30 },
  list: { paddingTop: 12, gap: 3 },
  item: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  itemActive: { backgroundColor: theme.soft },
  icon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    borderRadius: 14,
    backgroundColor: theme.canvas
  },
  iconActive: { borderColor: theme.text, backgroundColor: theme.text },
  iconText: { color: theme.muted, fontSize: 20 },
  iconTextActive: { color: "white" },
  copy: { flex: 1 },
  label: { color: theme.text, fontSize: 16, fontWeight: "700" },
  detail: { marginTop: 4, color: theme.muted, fontSize: 12, lineHeight: 17 },
  chevron: { color: theme.faint, fontSize: 26, lineHeight: 28 }
});
