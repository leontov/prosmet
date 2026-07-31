import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import type {
  AgentConfigInput,
  AgentDescriptor,
  AgentProviderKind,
  AgentRegistryResponse,
  AgentTestResult
} from "@prosmet/contracts";
import { theme } from "../theme";
import {
  getMobileAdminToken,
  getMobileApiBaseUrl,
  mobileApiFetch,
  setMobileAdminToken,
  setMobileApiBaseUrl
} from "../agent-session";

const providerLabels: Record<AgentProviderKind, string> = {
  "openai-compatible": "OpenAI-compatible",
  ollama: "Ollama",
  "codex-app-server": "Codex App Server",
  "http-agent": "HTTP agent"
};

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | T | null;
  if (!response.ok) {
    throw new Error((body as { error?: { message?: string } } | null)?.error?.message || `HTTP ${response.status}`);
  }
  return body as T;
}

export function SettingsScreen() {
  const [apiUrl, setApiUrl] = useState("https://kolibriai.online");
  const [token, setToken] = useState("");
  const [registry, setRegistry] = useState<AgentRegistryResponse | null>(null);
  const [busy, setBusy] = useState<string | null>("load");
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<AgentProviderKind>("openai-compatible");
  const [name, setName] = useState("");
  const [agentUrl, setAgentUrl] = useState("");
  const [model, setModel] = useState("");
  const [secret, setSecret] = useState("");
  const [command, setCommand] = useState("codex");
  const [cwd, setCwd] = useState("");
  const [testResults, setTestResults] = useState<Record<string, AgentTestResult>>({});

  const load = async () => {
    setBusy("load");
    setError(null);
    try {
      const response = await mobileApiFetch("/api/agents");
      setRegistry(await responseJson<AgentRegistryResponse>(response));
    } catch (loadError) {
      setRegistry(null);
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить агентов");
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    let active = true;
    void Promise.all([getMobileApiBaseUrl(), getMobileAdminToken()]).then(([storedUrl, storedToken]) => {
      if (!active) return;
      setApiUrl(storedUrl);
      setToken(storedToken || "");
      return load();
    });
    return () => { active = false; };
  }, []);

  const saveConnection = async () => {
    setBusy("credentials");
    setError(null);
    try {
      await setMobileApiBaseUrl(apiUrl);
      await setMobileAdminToken(token || null);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить соединение");
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    setBusy("create");
    setError(null);
    try {
      const payload: AgentConfigInput = {
        name: name.trim(),
        type,
        enabled: true,
        model: model.trim() || null,
        baseUrl: agentUrl.trim() || null,
        command: type === "codex-app-server" ? command.trim() || "codex" : null,
        args: type === "codex-app-server" ? ["app-server", "--listen", "stdio://"] : [],
        cwd: type === "codex-app-server" ? cwd.trim() || null : null,
        timeoutMs: 120000,
        secret: secret.trim() || null
      };
      const response = await mobileApiFetch("/api/agents", { method: "POST", body: JSON.stringify(payload) });
      await responseJson<AgentDescriptor>(response);
      setName("");
      setAgentUrl("");
      setModel("");
      setSecret("");
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Не удалось подключить агента");
    } finally {
      setBusy(null);
    }
  };

  const test = async (agent: AgentDescriptor) => {
    setBusy(`test:${agent.id}`);
    setError(null);
    try {
      const response = await mobileApiFetch(`/api/agents/${encodeURIComponent(agent.id)}/test`, { method: "POST" });
      const result = await responseJson<AgentTestResult>(response);
      setTestResults((current) => ({ ...current, [agent.id]: result }));
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Проверка завершилась ошибкой");
    } finally {
      setBusy(null);
    }
  };

  const activate = async (agent: AgentDescriptor) => {
    setBusy(`activate:${agent.id}`);
    setError(null);
    try {
      const response = await mobileApiFetch(`/api/agents/${encodeURIComponent(agent.id)}/activate`, { method: "POST" });
      await responseJson<AgentDescriptor>(response);
      await load();
    } catch (activateError) {
      setError(activateError instanceof Error ? activateError.message : "Не удалось активировать агента");
    } finally {
      setBusy(null);
    }
  };

  const remove = (agent: AgentDescriptor) => {
    Alert.alert("Удалить подключение?", agent.name, [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setBusy(`delete:${agent.id}`);
            try {
              const response = await mobileApiFetch(`/api/agents/${encodeURIComponent(agent.id)}`, { method: "DELETE" });
              await responseJson(response);
              await load();
            } catch (deleteError) {
              setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить агента");
            } finally {
              setBusy(null);
            }
          })();
        }
      }
    ]);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Настройки</Text>
      <Text style={styles.subtitle}>Сервер, защищённый доступ и реальные подключения агентов.</Text>

      {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}

      <Section title="Соединение с сервером">
        <Field label="API URL">
          <TextInput style={styles.input} value={apiUrl} onChangeText={setApiUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://kolibriai.online" placeholderTextColor={theme.faint} />
        </Field>
        <Field label="Токен супер-администратора">
          <TextInput style={styles.input} value={token} onChangeText={setToken} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="Хранится в SecureStore" placeholderTextColor={theme.faint} />
        </Field>
        <Pressable style={styles.primaryButton} onPress={() => void saveConnection()} disabled={busy === "credentials"}>
          {busy === "credentials" ? <ActivityIndicator color="white" /> : <Text style={styles.primaryButtonText}>Сохранить и проверить</Text>}
        </Pressable>
      </Section>

      <Section title={`Подключения · ${registry?.agents.length ?? 0}`}>
        {busy === "load" ? <ActivityIndicator color={theme.text} style={styles.loader} /> : null}
        {registry?.agents.map((agent) => (
          <View key={agent.id} style={[styles.agentCard, agent.active && styles.agentCardActive]}>
            <View style={styles.agentHeader}>
              <View style={[styles.statusDot, agent.active && styles.statusDotActive]} />
              <View style={styles.agentCopy}>
                <Text style={styles.agentName}>{agent.name}</Text>
                <Text style={styles.agentDetail}>{providerLabels[agent.type]}{agent.model ? ` · ${agent.model}` : ""}</Text>
              </View>
              {agent.active ? <Text style={styles.activeLabel}>Активен</Text> : null}
            </View>
            <Text style={styles.endpoint} numberOfLines={3}>{agent.type === "codex-app-server" ? `${agent.command} ${agent.args.join(" ")}` : agent.baseUrl}</Text>
            {testResults[agent.id] ? <Text style={styles.testResult}>✓ {testResults[agent.id].latencyMs} мс · {testResults[agent.id].message}</Text> : null}
            <View style={styles.agentActions}>
              <Pressable style={styles.actionButton} onPress={() => void test(agent)} disabled={busy === `test:${agent.id}`}>
                {busy === `test:${agent.id}` ? <ActivityIndicator color={theme.text} size="small" /> : <Text style={styles.actionText}>Проверить</Text>}
              </Pressable>
              {!agent.active ? <Pressable style={styles.actionButton} onPress={() => void activate(agent)}><Text style={styles.actionText}>Активировать</Text></Pressable> : null}
              <Pressable style={styles.deleteButton} onPress={() => remove(agent)}><Text style={styles.deleteText}>Удалить</Text></Pressable>
            </View>
          </View>
        ))}
        {!busy && !registry?.agents.length ? <Text style={styles.emptyText}>Подключений пока нет.</Text> : null}
      </Section>

      <Section title="Новое подключение">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.providerTabs}>
          {(Object.keys(providerLabels) as AgentProviderKind[]).map((provider) => (
            <Pressable key={provider} style={[styles.providerTab, type === provider && styles.providerTabActive]} onPress={() => setType(provider)}>
              <Text style={[styles.providerTabText, type === provider && styles.providerTabTextActive]}>{providerLabels[provider]}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Field label="Название">
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Например, Codex Primary" placeholderTextColor={theme.faint} />
        </Field>

        {type === "codex-app-server" ? (
          <>
            <Field label="Команда"><TextInput style={styles.input} value={command} onChangeText={setCommand} autoCapitalize="none" placeholder="codex" placeholderTextColor={theme.faint} /></Field>
            <Field label="Рабочая директория"><TextInput style={styles.input} value={cwd} onChangeText={setCwd} autoCapitalize="none" placeholder="/srv/workspaces/prosmet" placeholderTextColor={theme.faint} /></Field>
          </>
        ) : (
          <Field label={type === "http-agent" ? "Endpoint" : "Base URL"}>
            <TextInput style={styles.input} value={agentUrl} onChangeText={setAgentUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder={type === "ollama" ? "http://127.0.0.1:11434" : "https://api.example.com/v1"} placeholderTextColor={theme.faint} />
          </Field>
        )}

        {type !== "http-agent" ? <Field label="Модель"><TextInput style={styles.input} value={model} onChangeText={setModel} autoCapitalize="none" placeholder={type === "ollama" ? "qwen3:32b" : "gpt-5.4"} placeholderTextColor={theme.faint} /></Field> : null}
        <Field label="API key / token — необязательно"><TextInput style={styles.input} value={secret} onChangeText={setSecret} autoCapitalize="none" secureTextEntry placeholder="Шифруется на сервере" placeholderTextColor={theme.faint} /></Field>

        <Pressable style={styles.primaryButton} onPress={() => void create()} disabled={busy === "create" || !name.trim()}>
          {busy === "create" ? <ActivityIndicator color="white" /> : <Text style={styles.primaryButtonText}>Подключить агента</Text>}
        </Pressable>
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.canvas },
  content: { paddingHorizontal: 16, paddingTop: 28, paddingBottom: 60 },
  title: { color: theme.text, fontSize: 32, fontWeight: "700", letterSpacing: -1.2 },
  subtitle: { marginTop: 8, color: theme.muted, fontSize: 16, lineHeight: 24 },
  error: { marginTop: 18, borderWidth: 1, borderColor: "rgba(180,35,24,.22)", borderRadius: 15, backgroundColor: "#fff6f5", padding: 13 },
  errorText: { color: "#8f2118", fontSize: 13, lineHeight: 19 },
  section: { marginTop: 28, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 18 },
  sectionTitle: { color: theme.text, fontSize: 18, fontWeight: "700", letterSpacing: -0.4 },
  field: { marginTop: 14 },
  fieldLabel: { marginBottom: 7, color: theme.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  input: { minHeight: 52, borderWidth: 1, borderColor: theme.border, borderRadius: 15, backgroundColor: theme.canvas, paddingHorizontal: 13, color: theme.text, fontSize: 16 },
  primaryButton: { minHeight: 52, alignItems: "center", justifyContent: "center", marginTop: 15, borderRadius: 15, backgroundColor: theme.text, paddingHorizontal: 18 },
  primaryButtonText: { color: "white", fontSize: 15, fontWeight: "700" },
  loader: { marginTop: 20 },
  agentCard: { marginTop: 12, borderWidth: 1, borderColor: theme.border, borderRadius: 18, padding: 14 },
  agentCardActive: { borderColor: theme.text },
  agentHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.faint },
  statusDotActive: { backgroundColor: theme.success },
  agentCopy: { flex: 1 },
  agentName: { color: theme.text, fontSize: 16, fontWeight: "700" },
  agentDetail: { marginTop: 4, color: theme.muted, fontSize: 12, lineHeight: 17 },
  activeLabel: { color: theme.success, fontSize: 11, fontWeight: "700" },
  endpoint: { marginTop: 12, borderRadius: 12, backgroundColor: theme.soft, padding: 10, color: theme.muted, fontSize: 11, lineHeight: 17 },
  testResult: { marginTop: 10, color: theme.success, fontSize: 12, lineHeight: 18 },
  agentActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  actionButton: { minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.border, borderRadius: 13, paddingHorizontal: 12 },
  actionText: { color: theme.text, fontSize: 13, fontWeight: "700" },
  deleteButton: { minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(180,35,24,.2)", borderRadius: 13, paddingHorizontal: 12 },
  deleteText: { color: "#a32920", fontSize: 13, fontWeight: "700" },
  emptyText: { marginTop: 16, color: theme.muted, fontSize: 14 },
  providerTabs: { gap: 8, paddingTop: 14, paddingRight: 16 },
  providerTab: { minHeight: 42, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.border, borderRadius: 13, paddingHorizontal: 12 },
  providerTabActive: { borderColor: theme.text, backgroundColor: theme.text },
  providerTabText: { color: theme.muted, fontSize: 12, fontWeight: "700" },
  providerTabTextActive: { color: "white" }
});
