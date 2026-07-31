import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { AgentCatalog, AgentSummary } from "@prosmet/contracts";
import { theme } from "../theme";

export function SettingsScreen() {
  const [catalog, setCatalog] = useState<AgentCatalog | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const baseUrl = process.env.EXPO_PUBLIC_PROSMET_API_URL || "https://kolibriai.online";

  const refresh = async () => {
    setRefreshing(true);
    setError("");
    try {
      const response = await fetch(`${baseUrl}/api/agents`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setCatalog(await response.json() as AgentCatalog);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить агентов");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => { void refresh(); }, [baseUrl]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Настройки</Text>
      <Text style={styles.subtitle}>Мобильное приложение использует тот же серверный реестр агентов, что и web-версия.</Text>

      <Section title="Агенты">
        {catalog?.agents.map((agent) => <Provider key={agent.id} agent={agent} />)}
        {!catalog?.agents.length ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Агенты не подключены</Text>
            <Text style={styles.emptyText}>Подключение выполняется супер-администратором в защищённых web-настройках. Секреты не хранятся в мобильном приложении.</Text>
          </View>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.action} accessibilityRole="button" disabled={refreshing} onPress={() => void refresh()}>
          <Text style={styles.actionText}>{refreshing ? "Проверка…" : "Обновить список"}</Text>
        </Pressable>
        <Pressable style={styles.primaryAction} accessibilityRole="link" onPress={() => void Linking.openURL(`${baseUrl}/`)}>
          <Text style={styles.primaryActionText}>Открыть web-настройки</Text>
        </Pressable>
      </Section>

      <Section title="Подключение">
        <Row label="API" value={baseUrl} />
        <Row label="Основной агент" value={catalog?.defaultAgentId || "Не выбран"} />
        <Row label="Статус" value={catalog?.configured ? "Настроено" : "Требуется настройка"} />
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

function Provider({ agent }: { agent: AgentSummary }) {
  return (
    <View style={styles.provider}>
      <View style={styles.providerCopy}>
        <Text style={styles.rowTitle}>{agent.name}</Text>
        <Text style={styles.rowDetail}>{agent.kind}{agent.model ? ` · ${agent.model}` : ""}</Text>
      </View>
      <View style={agent.isDefault ? styles.defaultBadge : styles.readyBadge}>
        <Text style={agent.isDefault ? styles.defaultBadgeText : styles.readyBadgeText}>{agent.isDefault ? "Основной" : "Готов"}</Text>
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.canvas },
  content: { paddingHorizontal: 16, paddingTop: 28, paddingBottom: 40 },
  title: { color: theme.text, fontSize: 32, fontWeight: "700", letterSpacing: -1.2 },
  subtitle: { marginTop: 8, color: theme.muted, fontSize: 16, lineHeight: 24 },
  section: { marginTop: 26, borderTopWidth: 1, borderTopColor: theme.border },
  sectionTitle: { minHeight: 60, color: theme.text, fontSize: 17, fontWeight: "700", textAlignVertical: "center" },
  provider: { minHeight: 76, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
  providerCopy: { flex: 1 },
  rowTitle: { color: theme.text, fontSize: 16, fontWeight: "700" },
  rowDetail: { marginTop: 5, color: theme.muted, fontSize: 13, lineHeight: 19 },
  defaultBadge: { borderRadius: 99, backgroundColor: theme.text, paddingHorizontal: 10, paddingVertical: 6 },
  defaultBadgeText: { color: "white", fontSize: 10, fontWeight: "700" },
  readyBadge: { borderRadius: 99, backgroundColor: theme.soft, paddingHorizontal: 10, paddingVertical: 6 },
  readyBadgeText: { color: theme.muted, fontSize: 10, fontWeight: "700" },
  empty: { borderWidth: 1, borderStyle: "dashed", borderColor: theme.border, borderRadius: 18, padding: 18 },
  emptyTitle: { color: theme.text, fontSize: 16, fontWeight: "700" },
  emptyText: { marginTop: 7, color: theme.muted, fontSize: 13, lineHeight: 20 },
  error: { marginTop: 12, borderRadius: 14, backgroundColor: "#fff0ef", color: "#b42318", padding: 13, fontSize: 13 },
  action: { minHeight: 50, alignItems: "center", justifyContent: "center", marginTop: 12, borderWidth: 1, borderColor: theme.border, borderRadius: 15 },
  actionText: { color: theme.text, fontSize: 14, fontWeight: "700" },
  primaryAction: { minHeight: 50, alignItems: "center", justifyContent: "center", marginTop: 8, borderRadius: 15, backgroundColor: theme.text },
  primaryActionText: { color: "white", fontSize: 14, fontWeight: "700" },
  row: { minHeight: 66, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
  rowLabel: { color: theme.muted, fontSize: 14 },
  rowValue: { maxWidth: "62%", color: theme.text, fontSize: 13, fontWeight: "700", textAlign: "right" }
});
