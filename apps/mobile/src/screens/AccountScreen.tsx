import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import type {
  AccountProfile,
  SystemStatus,
  UserLoginInput,
  UserRegistrationInput,
  UserSessionStatus
} from "@prosmet/contracts";
import {
  loginMobileUser,
  logoutMobileUser,
  registerMobileUser,
  restoreUserSession
} from "../application/user-session";
import {
  emptyRegistrationInput,
  validateLoginInput,
  validateRegistrationInput,
  type AuthFieldErrors,
  type AuthMode
} from "../domain/user-session";
import { mobileAdminApiFetch, mobileApiFetch } from "../agent-session";
import { theme } from "../theme";

const emptyProfile: AccountProfile = {
  name: "",
  email: "",
  organization: "",
  region: "",
  role: "super_admin",
  updatedAt: ""
};

type Notice = { kind: "success" | "error" | "info"; text: string } | null;

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | T | null;
  if (!response.ok) {
    throw new Error((body as { error?: { message?: string } } | null)?.error?.message || `HTTP ${response.status}`);
  }
  return body as T;
}

export function AccountScreen() {
  const [session, setSession] = useState<UserSessionStatus | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("register");
  const [registration, setRegistration] = useState<UserRegistrationInput>(emptyRegistrationInput);
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [profile, setProfile] = useState<AccountProfile>(emptyProfile);
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [adminAuthorized, setAdminAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const initials = useMemo(() => userInitials(session?.user?.name || ""), [session?.user?.name]);

  const load = async () => {
    setLoading(true);
    setNotice(null);
    const [sessionResult, systemResult, accountResult] = await Promise.allSettled([
      restoreUserSession(),
      mobileApiFetch("/api/system").then((response) => readJson<SystemStatus>(response)),
      mobileAdminApiFetch("/api/account").then((response) => readJson<AccountProfile>(response))
    ]);

    if (sessionResult.status === "fulfilled") {
      setSession(sessionResult.value);
    } else {
      setSession({ authenticated: false, user: null });
      setNotice({ kind: "info", text: "Пользовательская сессия не восстановлена. Можно зарегистрироваться или войти." });
    }
    if (systemResult.status === "fulfilled") setSystem(systemResult.value);
    if (accountResult.status === "fulfilled") {
      setProfile(accountResult.value);
      setAdminAuthorized(true);
    } else {
      setAdminAuthorized(false);
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const submitAuth = async () => {
    const loginInput: UserLoginInput = {
      email: registration.email,
      password: registration.password
    };
    const errors = authMode === "register"
      ? validateRegistrationInput(registration)
      : validateLoginInput(loginInput);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setAuthBusy(true);
    setNotice(null);
    try {
      const next = authMode === "register"
        ? await registerMobileUser(registration)
        : await loginMobileUser(loginInput);
      setSession(next);
      setRegistration((current) => ({ ...current, password: "" }));
      setNotice({
        kind: "success",
        text: authMode === "register" ? "Аккаунт ProSmet создан. Сессия восстановится при следующем запуске." : "Вход выполнен."
      });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Не удалось выполнить вход." });
    } finally {
      setAuthBusy(false);
    }
  };

  const logout = async () => {
    setAuthBusy(true);
    setNotice(null);
    try {
      setSession(await logoutMobileUser());
      setRegistration(emptyRegistrationInput);
      setNotice({ kind: "success", text: "Пользовательская сессия завершена." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Не удалось выйти." });
    } finally {
      setAuthBusy(false);
    }
  };

  const saveAdminProfile = async () => {
    setAdminBusy(true);
    setNotice(null);
    try {
      const response = await mobileAdminApiFetch("/api/account", {
        method: "PUT",
        body: JSON.stringify({
          name: profile.name,
          email: profile.email,
          organization: profile.organization,
          region: profile.region
        })
      });
      setProfile(await readJson<AccountProfile>(response));
      setAdminAuthorized(true);
      setNotice({ kind: "success", text: "Технический профиль организации сохранён." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Не удалось сохранить профиль." });
    } finally {
      setAdminBusy(false);
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Text style={styles.title}>Личный кабинет</Text>
      <Text style={styles.subtitle}>Пользовательская сессия отделена от технического доступа супер-администратора.</Text>

      {loading ? <ActivityIndicator accessibilityLabel="Загрузка кабинета" color={theme.text} style={styles.loader} /> : null}
      {notice ? (
        <View
          accessibilityRole="alert"
          style={notice.kind === "error" ? styles.error : notice.kind === "success" ? styles.success : styles.info}
        >
          <Text style={notice.kind === "error" ? styles.errorText : notice.kind === "success" ? styles.successText : styles.infoText}>
            {notice.text}
          </Text>
        </View>
      ) : null}

      {!loading && session?.authenticated && session.user ? (
        <View style={styles.sessionCard}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
          <View style={styles.sessionCopy}>
            <Text style={styles.sessionName}>{session.user.name}</Text>
            <Text style={styles.sessionEmail}>{session.user.email}</Text>
            <Text style={styles.sessionCompany}>{session.user.company} · {roleLabel(session.user.role)}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Выйти из аккаунта"
            accessibilityState={{ disabled: authBusy }}
            style={styles.logoutButton}
            onPress={() => void logout()}
            disabled={authBusy}
          >
            {authBusy ? <ActivityIndicator color={theme.text} /> : <Text style={styles.logoutButtonText}>Выйти</Text>}
          </Pressable>
        </View>
      ) : null}

      {!loading && !session?.authenticated ? (
        <View style={styles.authCard}>
          <View style={styles.modeSwitch} accessibilityRole="tablist">
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: authMode === "register" }}
              style={[styles.modeButton, authMode === "register" && styles.modeButtonActive]}
              onPress={() => { setAuthMode("register"); setFieldErrors({}); setNotice(null); }}
            >
              <Text style={[styles.modeButtonText, authMode === "register" && styles.modeButtonTextActive]}>Регистрация</Text>
            </Pressable>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: authMode === "login" }}
              style={[styles.modeButton, authMode === "login" && styles.modeButtonActive]}
              onPress={() => { setAuthMode("login"); setFieldErrors({}); setNotice(null); }}
            >
              <Text style={[styles.modeButtonText, authMode === "login" && styles.modeButtonTextActive]}>Вход</Text>
            </Pressable>
          </View>

          <Text style={styles.authTitle}>{authMode === "register" ? "Создать аккаунт ProSmet" : "Войти в ProSmet"}</Text>
          <Text style={styles.authDescription}>
            {authMode === "register"
              ? "Пароль передаётся только по HTTPS, хранится на сервере как scrypt-хеш и не сохраняется на телефоне."
              : "Используется защищённая серверная сессия. Административный токен не участвует в обычном входе."}
          </Text>

          {authMode === "register" ? (
            <AuthField label="Имя" error={fieldErrors.name}>
              <TextInput
                accessibilityLabel="Имя пользователя"
                style={[styles.input, fieldErrors.name && styles.inputInvalid]}
                value={registration.name}
                onChangeText={(name) => setRegistration((current) => ({ ...current, name }))}
                autoComplete="name"
                textContentType="name"
                autoCapitalize="words"
                placeholder="Как к вам обращаться"
                placeholderTextColor={theme.faint}
              />
            </AuthField>
          ) : null}

          <AuthField label="Email" error={fieldErrors.email}>
            <TextInput
              accessibilityLabel="Электронная почта пользователя"
              style={[styles.input, fieldErrors.email && styles.inputInvalid]}
              value={registration.email}
              onChangeText={(email) => setRegistration((current) => ({ ...current, email }))}
              autoComplete="email"
              textContentType="emailAddress"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="name@example.com"
              placeholderTextColor={theme.faint}
            />
          </AuthField>

          {authMode === "register" ? (
            <AuthField label="Организация" error={fieldErrors.company}>
              <TextInput
                accessibilityLabel="Организация пользователя"
                style={[styles.input, fieldErrors.company && styles.inputInvalid]}
                value={registration.company}
                onChangeText={(company) => setRegistration((current) => ({ ...current, company }))}
                autoComplete="organization"
                textContentType="organizationName"
                placeholder="Название компании или ИП"
                placeholderTextColor={theme.faint}
              />
            </AuthField>
          ) : null}

          <AuthField label="Пароль" error={fieldErrors.password}>
            <TextInput
              accessibilityLabel="Пароль пользователя"
              style={[styles.input, fieldErrors.password && styles.inputInvalid]}
              value={registration.password}
              onChangeText={(password) => setRegistration((current) => ({ ...current, password }))}
              autoComplete={authMode === "register" ? "new-password" : "current-password"}
              textContentType={authMode === "register" ? "newPassword" : "password"}
              secureTextEntry
              placeholder={authMode === "register" ? "Минимум 8 символов" : "Введите пароль"}
              placeholderTextColor={theme.faint}
              onSubmitEditing={() => void submitAuth()}
            />
          </AuthField>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={authMode === "register" ? "Создать аккаунт" : "Войти"}
            accessibilityState={{ disabled: authBusy }}
            style={styles.primaryButton}
            onPress={() => void submitAuth()}
            disabled={authBusy}
          >
            {authBusy
              ? <ActivityIndicator color="white" />
              : <Text style={styles.primaryButtonText}>{authMode === "register" ? "Создать аккаунт" : "Войти"}</Text>}
          </Pressable>
        </View>
      ) : null}

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Состояние сервиса</Text>
        <Row label="Production SHA" value={shortSha(system?.releaseSha)} mono />
        <Row label="Активный агент" value={system?.activeAgent?.name || "Не подключён"} />
        <Row label="Подключено агентов" value={String(system?.configuredAgents ?? 0)} />
        <Row label="Хранилище" value={system?.persistence || "Недоступно"} />
      </View>

      <View style={styles.adminBlock}>
        <Text style={styles.adminLabel}>Технический контур</Text>
        <Text style={styles.adminTitle}>Профиль супер-администратора</Text>
        <Text style={styles.adminDescription}>Этот доступ нужен только владельцу сервера для агентов и системных реквизитов. Обычная пользовательская сессия от него не зависит.</Text>

        {adminAuthorized ? (
          <>
            <AdminField label="Имя владельца" value={profile.name} onChange={(name) => setProfile((current) => ({ ...current, name }))} />
            <AdminField label="Email владельца" value={profile.email} onChange={(email) => setProfile((current) => ({ ...current, email }))} keyboardType="email-address" />
            <AdminField label="Организация" value={profile.organization} onChange={(organization) => setProfile((current) => ({ ...current, organization }))} />
            <AdminField label="Регион" value={profile.region} onChange={(region) => setProfile((current) => ({ ...current, region }))} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Сохранить технический профиль"
              style={styles.secondaryButton}
              onPress={() => void saveAdminProfile()}
              disabled={adminBusy}
            >
              {adminBusy ? <ActivityIndicator color={theme.text} /> : <Text style={styles.secondaryButtonText}>Сохранить технический профиль</Text>}
            </Pressable>
          </>
        ) : (
          <View style={styles.adminRequired}>
            <Text style={styles.adminRequiredText}>Административный токен не настроен или сессия истекла. Его можно указать только в разделе «Настройки».</Text>
            <Pressable accessibilityRole="button" style={styles.retryButton} onPress={() => void load()}>
              <Text style={styles.retryButtonText}>Проверить снова</Text>
            </Pressable>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function AuthField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {error ? <Text accessibilityRole="alert" style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function AdminField({
  label,
  value,
  onChange,
  keyboardType = "default"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  keyboardType?: "default" | "email-address";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={styles.input}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === "email-address" ? "none" : "sentences"}
        placeholderTextColor={theme.faint}
      />
    </View>
  );
}

function userInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") : "PS";
}

function roleLabel(role: "owner" | "member") {
  return role === "owner" ? "владелец" : "участник";
}

function shortSha(value?: string) {
  if (!value) return "Недоступно";
  return value.length > 14 ? value.slice(0, 12) : value;
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.mono]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.canvas },
  content: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 72 },
  title: { color: theme.text, fontSize: 30, fontWeight: "750", letterSpacing: -1.1 },
  subtitle: { marginTop: 7, color: theme.muted, fontSize: 15, lineHeight: 22 },
  loader: { marginTop: 28 },
  info: { marginTop: 16, borderRadius: 14, backgroundColor: "#f3f6fa", padding: 12 },
  infoText: { color: theme.muted, fontSize: 13, lineHeight: 19 },
  success: { marginTop: 16, borderRadius: 14, backgroundColor: "#edf8f2", padding: 12 },
  successText: { color: theme.success, fontSize: 13, lineHeight: 19 },
  error: { marginTop: 16, borderWidth: 1, borderColor: "rgba(180,35,24,.22)", borderRadius: 14, backgroundColor: "#fff6f5", padding: 12 },
  errorText: { color: "#8f2118", fontSize: 13, lineHeight: 19 },
  sessionCard: { marginTop: 22, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: "rgba(10,132,255,.18)", borderRadius: 20, backgroundColor: "#f7fbff", padding: 14 },
  avatar: { width: 52, height: 52, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: "#0a84ff" },
  avatarText: { color: "white", fontSize: 16, fontWeight: "800" },
  sessionCopy: { flex: 1, minWidth: 0 },
  sessionName: { color: theme.text, fontSize: 17, fontWeight: "750" },
  sessionEmail: { marginTop: 3, color: theme.muted, fontSize: 12 },
  sessionCompany: { marginTop: 4, color: "#0a6c54", fontSize: 12, fontWeight: "650" },
  logoutButton: { minWidth: 66, minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.border, borderRadius: 13, backgroundColor: "white", paddingHorizontal: 10 },
  logoutButtonText: { color: theme.text, fontSize: 12, fontWeight: "750" },
  authCard: { marginTop: 22, borderWidth: 1, borderColor: "rgba(10,132,255,.16)", borderRadius: 22, backgroundColor: "#f8fbff", padding: 16 },
  modeSwitch: { flexDirection: "row", borderRadius: 14, backgroundColor: "#e9eef5", padding: 3 },
  modeButton: { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  modeButtonActive: { backgroundColor: "white", shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  modeButtonText: { color: theme.muted, fontSize: 13, fontWeight: "700" },
  modeButtonTextActive: { color: theme.text },
  authTitle: { marginTop: 20, color: theme.text, fontSize: 22, fontWeight: "780", letterSpacing: -0.6 },
  authDescription: { marginTop: 7, color: theme.muted, fontSize: 13, lineHeight: 19 },
  field: { marginTop: 13 },
  fieldLabel: { marginBottom: 6, color: theme.muted, fontSize: 11, fontWeight: "750", textTransform: "uppercase", letterSpacing: 0.45 },
  input: { minHeight: 52, borderWidth: 1, borderColor: theme.border, borderRadius: 15, backgroundColor: "white", paddingHorizontal: 13, color: theme.text, fontSize: 16 },
  inputInvalid: { borderColor: "#b42318" },
  fieldError: { marginTop: 5, color: "#b42318", fontSize: 11 },
  primaryButton: { minHeight: 52, alignItems: "center", justifyContent: "center", marginTop: 17, borderRadius: 16, backgroundColor: "#0a84ff" },
  primaryButtonText: { color: "white", fontSize: 15, fontWeight: "800" },
  block: { marginTop: 28, borderTopWidth: 1, borderTopColor: theme.border },
  blockTitle: { minHeight: 58, color: theme.text, fontSize: 17, fontWeight: "750", textAlignVertical: "center" },
  row: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
  rowLabel: { color: theme.muted, fontSize: 14 },
  rowValue: { maxWidth: "58%", color: theme.text, fontSize: 13, fontWeight: "700", textAlign: "right" },
  mono: { fontFamily: "monospace", fontSize: 11 },
  adminBlock: { marginTop: 28, borderWidth: 1, borderColor: theme.border, borderRadius: 20, padding: 16 },
  adminLabel: { color: "#9a6700", fontSize: 10, fontWeight: "800", letterSpacing: 0.7, textTransform: "uppercase" },
  adminTitle: { marginTop: 7, color: theme.text, fontSize: 19, fontWeight: "760" },
  adminDescription: { marginTop: 7, color: theme.muted, fontSize: 13, lineHeight: 19 },
  secondaryButton: { minHeight: 50, alignItems: "center", justifyContent: "center", marginTop: 16, borderWidth: 1, borderColor: theme.border, borderRadius: 15, backgroundColor: "white" },
  secondaryButtonText: { color: theme.text, fontSize: 14, fontWeight: "750" },
  adminRequired: { marginTop: 14, borderRadius: 14, backgroundColor: "#fff8e8", padding: 13 },
  adminRequiredText: { color: "#785200", fontSize: 12, lineHeight: 18 },
  retryButton: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 10, borderRadius: 12, backgroundColor: "white" },
  retryButtonText: { color: theme.text, fontSize: 13, fontWeight: "750" }
});
