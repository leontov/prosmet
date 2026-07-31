import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { theme } from "../theme";

export function SettingsScreen() {
  const [autosave, setAutosave] = useState(true);
  const [offline, setOffline] = useState(true);
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Настройки</Text>
      <Text style={styles.subtitle}>Приложение, агенты, данные и безопасность.</Text>
      <Section title="Интерфейс"><Toggle title="Автосохранение" detail="Сохранять изменения сметы автоматически" value={autosave} onChange={setAutosave} /></Section>
      <Section title="Данные"><Toggle title="Локальный режим" detail="Работать без сети и синхронизировать позже" value={offline} onChange={setOffline} /></Section>
      <Section title="Агенты"><Provider name="Codex" detail="App Server" active /><Provider name="MiMo" detail="Control plane" /><Provider name="Local" detail="Ollama / OpenAI-compatible" /></Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>; }
function Toggle({ title, detail, value, onChange }: { title: string; detail: string; value: boolean; onChange: (value: boolean) => void }) { return <Pressable style={styles.toggleRow} onPress={() => onChange(!value)}><View style={styles.copy}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowDetail}>{detail}</Text></View><View style={[styles.toggle, value && styles.toggleActive]}><View style={[styles.knob, value && styles.knobActive]} /></View></Pressable>; }
function Provider({ name, detail, active = false }: { name: string; detail: string; active?: boolean }) { return <View style={styles.provider}><View><Text style={styles.rowTitle}>{name}</Text><Text style={styles.rowDetail}>{detail}</Text></View><Text style={active ? styles.providerActive : styles.providerIdle}>{active ? "✓" : "○"}</Text></View>; }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.canvas },
  content: { paddingHorizontal: 16, paddingTop: 28, paddingBottom: 36 },
  title: { color: theme.text, fontSize: 32, fontWeight: "700", letterSpacing: -1.2 },
  subtitle: { marginTop: 8, color: theme.muted, fontSize: 16, lineHeight: 24 },
  section: { marginTop: 26, borderTopWidth: 1, borderTopColor: theme.border },
  sectionTitle: { minHeight: 60, color: theme.text, fontSize: 17, fontWeight: "700", textAlignVertical: "center" },
  toggleRow: { minHeight: 84, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
  copy: { flex: 1 },
  rowTitle: { color: theme.text, fontSize: 16, fontWeight: "700" },
  rowDetail: { marginTop: 5, color: theme.muted, fontSize: 13, lineHeight: 19 },
  toggle: { width: 46, height: 28, justifyContent: "center", borderRadius: 14, backgroundColor: "#d8d9dc", padding: 3 },
  toggleActive: { backgroundColor: theme.text },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: "white" },
  knobActive: { transform: [{ translateX: 18 }] },
  provider: { minHeight: 70, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
  providerActive: { color: theme.success, fontSize: 19, fontWeight: "700" },
  providerIdle: { color: theme.faint, fontSize: 18 }
});
