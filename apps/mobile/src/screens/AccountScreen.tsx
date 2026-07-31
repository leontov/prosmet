import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { theme } from "../theme";

type Identity = {
  authenticated: boolean;
  role: string;
  superAdminConfigured: boolean;
  agentConfiguration: string;
};

type Health = {
  ok: boolean;
  releaseSha: string;
  runtime: string;
  agents?: { configured: boolean; enabled: number; defaultAgentId: string };
};

export function AccountScreen() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState("");
  const baseUrl = process.env.EXPO_PUBLIC_PROSMET_API_URL || "https://kolibriai.online";

  useEffect(() => {
    let active = true;
    Promise.all([fetch(`${baseUrl}/api/identity`), fetch(`${baseUrl}/api/health`)])
      .then(async ([identityResponse, healthResponse]) => {
        if (!identityResponse.ok || !healthResponse.ok) throw new Error("Сервер не вернул состояние кабинета");
        return Promise.all([identityResponse.json() as Promise<Identity>, healthResponse.json() as Promise<Health>]);
      })
      .then(([nextIdentity, nextHealth]) => {
        if (!active) return;
        setIdentity(nextIdentity);
        setHealth(nextHealth);
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Не удалось загрузить кабинет"); });
    return () => { active = false; };
  }, [baseUrl]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Кабинет</Text>
      <Text style={styles.subtitle}>Фактическое состояние текущего приложения и production-сервера.</Text>

      <View style={styles.profile}>
        <View style={styles.avatar}><Text style={styles.avatarText}>◯</Text></View>
        <View style={styles.profileCopy}>
          <Text style={styles.name}>{identity?.authenticated ? "Авторизованный пользователь" : "Гостевой сеанс"}</Text>
          <Text style={styles.role}>{identity?.role || "Состояние загружается"}</Text>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Card title="Production" value={health?.ok ? "Доступен" : "Нет подтверждения"} detail={health?.releaseSha ? health.releaseSha.slice(0, 12) : "Release SHA не получен"} />
      <Card title="Агенты" value={health?.agents?.configured ? `${health.agents.enabled} подключено` : "Не подключены"} detail={health?.agents?.defaultAgentId || "Основной агент не выбран"} />

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Доступ</Text>
        <Row label="Текущая роль" value={identity?.role || "—"} />
        <Row label="Super-admin" value={identity?.superAdminConfigured ? "Настроен на сервере" : "Не настроен"} />
        <Row label="Конфигурация агентов" value={identity?.agentConfiguration || "—"} />
        <Row label="Runtime" value={health?.runtime || "—"} />
      </View>
    </ScrollView>
  );
}

function Card({ title, value, detail }: { title: string; value: string; detail: string }) {
  return <View style={styles.card}><Text style={styles.cardLabel}>{title}</Text><Text style={styles.cardValue}>{value}</Text><Text style={styles.cardDetail}>{detail}</Text></View>;
}

function Row({ label, value }: { label: string; value: string }) {
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.canvas },
  content: { paddingHorizontal: 16, paddingTop: 28, paddingBottom: 40 },
  title: { color: theme.text, fontSize: 32, fontWeight: "700", letterSpacing: -1.2 },
  subtitle: { marginTop: 8, color: theme.muted, fontSize: 16, lineHeight: 24 },
  profile: { marginTop: 28, flexDirection: "row", alignItems: "center", gap: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border, paddingBottom: 22 },
  avatar: { width: 60, height: 60, alignItems: "center", justifyContent: "center", borderRadius: 30, backgroundColor: theme.soft },
  avatarText: { color: theme.text, fontSize: 24, fontWeight: "700" },
  profileCopy: { flex: 1 },
  name: { color: theme.text, fontSize: 18, fontWeight: "700" },
  role: { marginTop: 5, color: theme.muted, fontSize: 13 },
  error: { marginTop: 16, borderRadius: 14, backgroundColor: "#fff0ef", color: "#b42318", padding: 14, fontSize: 13, lineHeight: 19 },
  card: { minHeight: 126, marginTop: 12, borderWidth: 1, borderColor: theme.border, borderRadius: 19, padding: 18 },
  cardLabel: { color: theme.faint, fontSize: 10, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  cardValue: { marginTop: 10, color: theme.text, fontSize: 19, fontWeight: "700" },
  cardDetail: { marginTop: 6, color: theme.muted, fontSize: 14, lineHeight: 20 },
  block: { marginTop: 26, borderTopWidth: 1, borderTopColor: theme.border },
  blockTitle: { minHeight: 60, color: theme.text, fontSize: 17, fontWeight: "700", textAlignVertical: "center" },
  row: { minHeight: 62, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
  rowLabel: { flex: 1, color: theme.muted, fontSize: 15 },
  rowValue: { maxWidth: "52%", color: theme.text, fontSize: 14, fontWeight: "700", textAlign: "right" }
});
