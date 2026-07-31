import { ScrollView, StyleSheet, Text, View } from "react-native";
import { theme } from "../theme";

export function AccountScreen() {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Кабинет</Text>
      <Text style={styles.subtitle}>Профиль, организация и устройства.</Text>
      <View style={styles.profile}><View style={styles.avatar}><Text style={styles.avatarText}>ВК</Text></View><View style={styles.profileCopy}><Text style={styles.name}>Владислав Кочуров</Text><Text style={styles.role}>Владелец · супер-администратор</Text></View></View>
      <Card title="Организация" value="Просметчик" detail="Республика Татарстан" />
      <Card title="Тариф" value="Founder" detail="Все функции и агентские адаптеры" />
      <View style={styles.block}><Text style={styles.blockTitle}>Состояние данных</Text><Row label="Локальная база" value="Готова" /><Row label="Серверная копия" value="PostgreSQL" /><Row label="Синхронизация" value="только что" /></View>
      <View style={styles.block}><Text style={styles.blockTitle}>Устройства</Text><Row label="MacBook Air" value="Сейчас" /><Row label="iPhone" value="12 мин" /></View>
    </ScrollView>
  );
}

function Card({ title, value, detail }: { title: string; value: string; detail: string }) { return <View style={styles.card}><Text style={styles.cardLabel}>{title}</Text><Text style={styles.cardValue}>{value}</Text><Text style={styles.cardDetail}>{detail}</Text></View>; }
function Row({ label, value }: { label: string; value: string }) { return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowValue}>{value}</Text></View>; }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.canvas },
  content: { paddingHorizontal: 16, paddingTop: 28, paddingBottom: 36 },
  title: { color: theme.text, fontSize: 32, fontWeight: "700", letterSpacing: -1.2 },
  subtitle: { marginTop: 8, color: theme.muted, fontSize: 16, lineHeight: 24 },
  profile: { marginTop: 28, flexDirection: "row", alignItems: "center", gap: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border, paddingBottom: 22 },
  avatar: { width: 60, height: 60, alignItems: "center", justifyContent: "center", borderRadius: 30, backgroundColor: theme.soft },
  avatarText: { color: theme.text, fontSize: 17, fontWeight: "700" },
  profileCopy: { flex: 1 },
  name: { color: theme.text, fontSize: 18, fontWeight: "700" },
  role: { marginTop: 5, color: theme.muted, fontSize: 13 },
  card: { minHeight: 126, marginTop: 12, borderWidth: 1, borderColor: theme.border, borderRadius: 19, padding: 18 },
  cardLabel: { color: theme.faint, fontSize: 10, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  cardValue: { marginTop: 10, color: theme.text, fontSize: 19, fontWeight: "700" },
  cardDetail: { marginTop: 6, color: theme.muted, fontSize: 14, lineHeight: 20 },
  block: { marginTop: 26, borderTopWidth: 1, borderTopColor: theme.border },
  blockTitle: { minHeight: 60, color: theme.text, fontSize: 17, fontWeight: "700", textAlignVertical: "center" },
  row: { minHeight: 62, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
  rowLabel: { color: theme.muted, fontSize: 15 },
  rowValue: { color: theme.text, fontSize: 14, fontWeight: "700" }
});
