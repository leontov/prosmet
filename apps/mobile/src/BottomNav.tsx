import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "./theme";

export type MobileTab = "chat" | "projects" | "account" | "settings";

type Props = { tab: MobileTab; onChange: (tab: MobileTab) => void };

const items: Array<{ id: MobileTab; label: string; icon: string }> = [
  { id: "chat", label: "Чат", icon: "✦" },
  { id: "projects", label: "Сметы", icon: "▤" },
  { id: "account", label: "Профиль", icon: "◯" },
  { id: "settings", label: "Настройки", icon: "⚙" }
];

export function BottomNav({ tab, onChange }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 8) }]} accessibilityRole="tablist">
      {items.map((item) => (
        <Pressable key={item.id} onPress={() => onChange(item.id)} style={styles.item} accessibilityRole="tab" accessibilityState={{ selected: tab === item.id }}>
          <Text style={[styles.icon, tab === item.id && styles.active]}>{item.icon}</Text>
          <Text style={[styles.label, tab === item.id && styles.active]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { minHeight: 72, flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border, backgroundColor: theme.canvas, paddingTop: 7 },
  item: { minHeight: 56, flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  icon: { color: theme.faint, fontSize: 20, lineHeight: 22 },
  label: { color: theme.faint, fontSize: 11, fontWeight: "600" },
  active: { color: theme.text }
});
