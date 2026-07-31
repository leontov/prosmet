import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import type { AccountProfile, SystemStatus } from "@prosmet/contracts";
import { mobileApiFetch } from "../agent-session";
import { theme } from "../theme";

const emptyProfile: AccountProfile = {
  name: "",
  email: "",
  organization: "",
  region: "",
  role: "super_admin",
  updatedAt: ""
};

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | T | null;
  if (!response.ok) throw new Error((body as { error?: { message?: string } } | null)?.error?.message || `HTTP ${response.status}`);
  return body as T;
}

export function AccountScreen() {
  const [profile, setProfile] = useState<AccountProfile>(emptyProfile);
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const [systemResponse, accountResponse] = await Promise.all([
        mobileApiFetch("/api/system"),
        mobileApiFetch("/api/account")
      ]);
      setSystem(await readJson<SystemStatus>(systemResponse));
      setProfile(await readJson<AccountProfile>(accountResponse));
      setAuthorized(true);
    } catch (error) {
      const systemResponse = await mobileApiFetch("/api/system").catch(() => null);
      if (systemResponse?.ok) setSystem(await readJson<SystemStatus>(systemResponse));
      setAuthorized(false);
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить кабинет");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await mobileApiFetch("/api/account", {
        method: "PUT",
        body: JSON.stringify({
          name: profile.name,
          email: profile.email,
          organization: profile.organization,
          region: profile.region
        })
      });
      setProfile(await readJson<AccountProfile>(response));
      setAuthorized(true);
      setMessage("Профиль сохранён.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить профиль");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Кабинет</Text>
      <Text style={styles.subtitle}>Профиль владельца и фактическое состояние системы.</Text>

      {busy && authorized === null ? <ActivityIndicator color={theme.text} style={styles.loader} /> : null}
      {message ? <View style={authorized === false ? styles.error : styles.notice}><Text style={authorized === false ? styles.errorText : styles.noticeText}>{message}</Text></View> : null}

      {authorized === false ? (
        <View style={styles.authRequired}>
          <Text style={styles.authIcon}>◇</Text>
          <Text style={styles.authTitle}>Требуется доступ супер-администратора</Text>
          <Text style={styles.authText}>Откройте настройки, сохраните серверный токен и вернитесь в кабинет.</Text>
          <Pressable style={styles.secondaryButton} onPress={() => void load()}><Text style={styles.secondaryButtonText}>Проверить снова</Text></Pressable>
        </View>
      ) : (
        <>
          <View style={styles.profile}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{initials(profile.name)}</Text></View>
            <View style={styles.profileCopy}>
              <Text style={styles.name}>{profile.name || "Профиль не заполнен"}</Text>
              <Text style={styles.role}>super_admin</Text>
            </View>
          </View>

          <Field label="Имя"><TextInput style={styles.input} value={profile.name} onChangeText={(value) => setProfile((current) => ({ ...current, name: value }))} autoCapitalize="words" placeholder="Имя владельца" placeholderTextColor={theme.faint} /></Field>
          <Field label="Электронная почта"><TextInput style={styles.input} value={profile.email} onChangeText={(value) => setProfile((current) => ({ ...current, email: value }))} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="owner@example.com" placeholderTextColor={theme.faint} /></Field>
          <Field label="Организация"><TextInput style={styles.input} value={profile.organization} onChangeText={(value) => setProfile((current) => ({ ...current, organization: value }))} placeholder="Название организации" placeholderTextColor={theme.faint} /></Field>
          <Field label="Регион"><TextInput style={styles.input} value={profile.region} onChangeText={(value) => setProfile((current) => ({ ...current, region: value }))} placeholder="Республика Татарстан" placeholderTextColor={theme.faint} /></Field>

          <Pressable style={styles.primaryButton} onPress={() => void save()} disabled={busy}>
            {busy ? <ActivityIndicator color="white" /> : <Text style={styles.primaryButtonText}>Сохранить профиль</Text>}
          </Pressable>
        </>
      )}

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Состояние системы</Text>
        <Row label="Production SHA" value={shortSha(system?.releaseSha)} mono />
        <Row label="Активный агент" value={system?.activeAgent?.name || "Не подключён"} />
        <Row label="Подключено агентов" value={String(system?.configuredAgents ?? 0)} />
        <Row label="Хранилище" value={system?.persistence || "Недоступно"} />
      </View>
    </ScrollView>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "—";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function shortSha(value?: string) {
  if (!value) return "Недоступно";
  return value.length > 14 ? value.slice(0, 12) : value;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text>{children}</View>;
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={[styles.rowValue, mono && styles.mono]} numberOfLines={1}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.canvas },
  content: { paddingHorizontal: 16, paddingTop: 28, paddingBottom: 60 },
  title: { color: theme.text, fontSize: 32, fontWeight: "700", letterSpacing: -1.2 },
  subtitle: { marginTop: 8, color: theme.muted, fontSize: 16, lineHeight: 24 },
  loader: { marginTop: 28 },
  notice: { marginTop: 18, borderRadius: 15, backgroundColor: "#f1f8f4", padding: 13 },
  noticeText: { color: theme.success, fontSize: 13, lineHeight: 19 },
  error: { marginTop: 18, borderWidth: 1, borderColor: "rgba(180,35,24,.22)", borderRadius: 15, backgroundColor: "#fff6f5", padding: 13 },
  errorText: { color: "#8f2118", fontSize: 13, lineHeight: 19 },
  authRequired: { alignItems: "center", marginTop: 28, borderWidth: 1, borderColor: theme.border, borderRadius: 20, padding: 24 },
  authIcon: { color: theme.text, fontSize: 28 },
  authTitle: { marginTop: 14, color: theme.text, fontSize: 18, fontWeight: "700", textAlign: "center" },
  authText: { marginTop: 8, color: theme.muted, fontSize: 14, lineHeight: 21, textAlign: "center" },
  profile: { marginTop: 28, flexDirection: "row", alignItems: "center", gap: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border, paddingBottom: 22 },
  avatar: { width: 60, height: 60, alignItems: "center", justifyContent: "center", borderRadius: 30, backgroundColor: theme.soft },
  avatarText: { color: theme.text, fontSize: 17, fontWeight: "700" },
  profileCopy: { flex: 1 },
  name: { color: theme.text, fontSize: 18, fontWeight: "700" },
  role: { marginTop: 5, color: theme.muted, fontSize: 13 },
  field: { marginTop: 14 },
  fieldLabel: { marginBottom: 7, color: theme.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  input: { minHeight: 52, borderWidth: 1, borderColor: theme.border, borderRadius: 15, backgroundColor: theme.canvas, paddingHorizontal: 13, color: theme.text, fontSize: 16 },
  primaryButton: { minHeight: 52, alignItems: "center", justifyContent: "center", marginTop: 16, borderRadius: 15, backgroundColor: theme.text },
  primaryButtonText: { color: "white", fontSize: 15, fontWeight: "700" },
  secondaryButton: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 18, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 16 },
  secondaryButtonText: { color: theme.text, fontSize: 14, fontWeight: "700" },
  block: { marginTop: 30, borderTopWidth: 1, borderTopColor: theme.border },
  blockTitle: { minHeight: 60, color: theme.text, fontSize: 17, fontWeight: "700", textAlignVertical: "center" },
  row: { minHeight: 62, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
  rowLabel: { color: theme.muted, fontSize: 15 },
  rowValue: { maxWidth: "55%", color: theme.text, fontSize: 14, fontWeight: "700", textAlign: "right" },
  mono: { fontFamily: "monospace", fontSize: 12 }
});
