import { useEffect, useState, type ReactNode } from "react";
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
  mobileAdminApiFetch,
  mobileApiFetch,
  setMobileAdminToken,
  setMobileApiBaseUrl
} from "../agent-session";

const labels: Record<AgentProviderKind, string> = {
  "openai-compatible": "OpenAI-compatible",
  ollama: "Ollama",
  "codex-app-server": "Codex App Server",
  "http-agent": "HTTP agent"
};

const labelFor = (type: AgentProviderKind) => labels[type] ?? type;

async function json<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | T | null;
  if (!response.ok) throw new Error((body as { error?: { message?: string } } | null)?.error?.message || `HTTP ${response.status}`);
  return body as T;
}

export function SettingsScreen() {
  const [apiUrl, setApiUrl] = useState("https://kolibriai.online");
  const [token, setToken] = useState("");
  const [registry, setRegistry] = useState<AgentRegistryResponse | null>(null);
  const [busy, setBusy] = useState<string | null>("load");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, AgentTestResult>>({});
  const [type, setType] = useState<AgentProviderKind>("openai-compatible");
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [model, setModel] = useState("");
  const [secret, setSecret] = useState("");
  const [command, setCommand] = useState("codex");
  const [cwd, setCwd] = useState("");

  const load = async () => {
    setBusy("load");
    setError(null);
    try {
      const storedAdminToken = await getMobileAdminToken();
      const response = storedAdminToken
        ? await mobileAdminApiFetch("/api/agents")
        : await mobileApiFetch("/api/agents");
      setRegistry(await json<AgentRegistryResponse>(response));
    } catch (cause) {
      setRegistry(null);
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить агентов");
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    let mounted = true;
    void Promise.all([getMobileApiBaseUrl(), getMobileAdminToken()]).then(([url, storedToken]) => {
      if (!mounted) return;
      setApiUrl(url);
      setToken(storedToken ?? "");
      return load();
    });
    return () => { mounted = false; };
  }, []);

  const saveConnection = async () => {
    setBusy("credentials");
    setError(null);
    try {
      await setMobileApiBaseUrl(apiUrl);
      await setMobileAdminToken(token || null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить соединение");
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
        baseUrl: endpoint.trim() || null,
        command: type === "codex-app-server" ? command.trim() || "codex" : null,
        args: type === "codex-app-server" ? ["app-server", "--listen", "stdio://"] : [],
        cwd: type === "codex-app-server" ? cwd.trim() || null : null,
        timeoutMs: 120000,
        secret: secret.trim() || null
      };
      await json<AgentDescriptor>(await mobileAdminApiFetch("/api/agents", { method: "POST", body: JSON.stringify(payload) }));
      setName(""); setEndpoint(""); setModel(""); setSecret("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось подключить агента");
    } finally {
      setBusy(null);
    }
  };

  const test = async (agent: AgentDescriptor) => {
    setBusy(`test:${agent.id}`);
    setError(null);
    try {
      const result = await json<AgentTestResult>(await mobileAdminApiFetch(`/api/agents/${encodeURIComponent(agent.id)}/test`, { method: "POST" }));
      setResults((current) => ({ ...current, [agent.id]: result }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Проверка агента завершилась ошибкой");
    } finally {
      setBusy(null);
    }
  };

  const activate = async (agent: AgentDescriptor) => {
    setBusy(`activate:${agent.id}`);
    setError(null);
    try {
      await json<AgentDescriptor>(await mobileAdminApiFetch(`/api/agents/${encodeURIComponent(agent.id)}/activate`, { method: "POST" }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось активировать агента");
    } finally {
      setBusy(null);
    }
  };

  const remove = (agent: AgentDescriptor) => Alert.alert("Удалить подключение?", agent.name, [
    { text: "Отмена", style: "cancel" },
    {
      text: "Удалить",
      style: "destructive",
      onPress: () => void (async () => {
        setBusy(`delete:${agent.id}`);
        try {
          await json<{ deleted: true }>(await mobileAdminApiFetch(`/api/agents/${encodeURIComponent(agent.id)}`, { method: "DELETE" }));
          await load();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Не удалось удалить агента");
        } finally {
          setBusy(null);
        }
      })()
    }
  ]);

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>Настройки</Text>
      <Text style={s.subtitle}>Сервер, защищённый доступ и реальные подключения агентов.</Text>
      {error ? <View style={s.error}><Text style={s.errorText}>{error}</Text></View> : null}

      <Section title="Соединение с сервером">
        <Field label="API URL"><Input value={apiUrl} onChangeText={setApiUrl} keyboardType="url" placeholder="https://kolibriai.online" /></Field>
        <Field label="Токен супер-администратора"><Input value={token} onChangeText={setToken} secureTextEntry placeholder="Хранится в SecureStore" /></Field>
        <Primary busy={busy === "credentials"} label="Сохранить и проверить" onPress={saveConnection} />
      </Section>

      <Section title={`Подключения · ${registry?.agents.length ?? 0}`}>
        {busy === "load" ? <ActivityIndicator color={theme.text} style={s.loader} /> : null}
        {registry?.agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} result={results[agent.id]} busy={busy} onTest={test} onActivate={activate} onDelete={remove} />
        ))}
        {!busy && !registry?.agents.length ? <Text style={s.empty}>Подключений пока нет.</Text> : null}
      </Section>

      <Section title="Новое подключение">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>
          {(Object.keys(labels) as AgentProviderKind[]).map((provider) => (
            <Pressable key={provider} style={[s.tab, type === provider && s.tabActive]} onPress={() => setType(provider)}>
              <Text style={[s.tabText, type === provider && s.tabTextActive]}>{labelFor(provider)}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Field label="Название"><Input value={name} onChangeText={setName} placeholder="Например, Codex Primary" /></Field>
        {type === "codex-app-server" ? (
          <>
            <Field label="Команда"><Input value={command} onChangeText={setCommand} placeholder="codex" /></Field>
            <Field label="Рабочая директория"><Input value={cwd} onChangeText={setCwd} placeholder="/srv/workspaces/prosmet" /></Field>
          </>
        ) : <Field label={type === "http-agent" ? "Endpoint" : "Base URL"}><Input value={endpoint} onChangeText={setEndpoint} keyboardType="url" placeholder={type === "ollama" ? "http://127.0.0.1:11434" : "https://api.example.com/v1"} /></Field>}
        {type !== "http-agent" ? <Field label="Модель"><Input value={model} onChangeText={setModel} placeholder={type === "ollama" ? "qwen3:32b" : "gpt-5.4"} /></Field> : null}
        <Field label="API key / token — необязательно"><Input value={secret} onChangeText={setSecret} secureTextEntry placeholder="Шифруется на сервере" /></Field>
        <Primary busy={busy === "create"} disabled={!name.trim()} label="Подключить агента" onPress={create} />
      </Section>
    </ScrollView>
  );
}

function AgentCard({ agent, result, busy, onTest, onActivate, onDelete }: {
  agent: AgentDescriptor;
  result: AgentTestResult | undefined;
  busy: string | null;
  onTest: (agent: AgentDescriptor) => Promise<void>;
  onActivate: (agent: AgentDescriptor) => Promise<void>;
  onDelete: (agent: AgentDescriptor) => void;
}) {
  return <View style={[s.card, agent.active && s.cardActive]}>
    <View style={s.cardHead}><View style={[s.dot, agent.active && s.dotActive]} /><View style={s.cardCopy}><Text style={s.cardName}>{agent.name}</Text><Text style={s.cardMeta}>{labelFor(agent.type)}{agent.model ? ` · ${agent.model}` : ""}</Text></View>{agent.active ? <Text style={s.active}>Активен</Text> : null}</View>
    <Text style={s.endpoint} numberOfLines={3}>{agent.type === "codex-app-server" ? `${agent.command ?? "codex"} ${(agent.args ?? []).join(" ")}` : agent.baseUrl}</Text>
    {result ? <Text style={s.result}>✓ {result.latencyMs} мс · {result.message}</Text> : null}
    <View style={s.actions}><Action busy={busy === `test:${agent.id}`} label="Проверить" onPress={() => onTest(agent)} />{!agent.active ? <Action label="Активировать" onPress={() => onActivate(agent)} /> : null}<Action danger label="Удалить" onPress={() => Promise.resolve(onDelete(agent))} /></View>
  </View>;
}

function Input(props: React.ComponentProps<typeof TextInput>) {
  return <TextInput {...props} style={s.input} autoCapitalize="none" autoCorrect={false} placeholderTextColor={theme.faint} />;
}
function Section({ title, children }: { title: string; children: ReactNode }) { return <View style={s.section}><Text style={s.sectionTitle}>{title}</Text>{children}</View>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <View style={s.field}><Text style={s.fieldLabel}>{label}</Text>{children}</View>; }
function Primary({ busy, label, disabled = false, onPress }: { busy: boolean; label: string; disabled?: boolean; onPress: () => Promise<void> }) { return <Pressable style={s.primary} disabled={busy || disabled} onPress={() => void onPress()}>{busy ? <ActivityIndicator color="white" /> : <Text style={s.primaryText}>{label}</Text>}</Pressable>; }
function Action({ label, busy = false, danger = false, onPress }: { label: string; busy?: boolean; danger?: boolean; onPress: () => Promise<void> }) { return <Pressable style={[s.action, danger && s.actionDanger]} disabled={busy} onPress={() => void onPress()}>{busy ? <ActivityIndicator size="small" color={theme.text} /> : <Text style={[s.actionText, danger && s.dangerText]}>{label}</Text>}</Pressable>; }

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.canvas }, content: { paddingHorizontal: 16, paddingTop: 28, paddingBottom: 60 },
  title: { color: theme.text, fontSize: 32, fontWeight: "700", letterSpacing: -1.2 }, subtitle: { marginTop: 8, color: theme.muted, fontSize: 16, lineHeight: 24 },
  error: { marginTop: 18, borderWidth: 1, borderColor: "rgba(180,35,24,.22)", borderRadius: 15, backgroundColor: "#fff6f5", padding: 13 }, errorText: { color: "#8f2118", fontSize: 13, lineHeight: 19 },
  section: { marginTop: 28, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 18 }, sectionTitle: { color: theme.text, fontSize: 18, fontWeight: "700", letterSpacing: -0.4 },
  field: { marginTop: 14 }, fieldLabel: { marginBottom: 7, color: theme.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: .5 }, input: { minHeight: 52, borderWidth: 1, borderColor: theme.border, borderRadius: 15, backgroundColor: theme.canvas, paddingHorizontal: 13, color: theme.text, fontSize: 16 },
  primary: { minHeight: 52, alignItems: "center", justifyContent: "center", marginTop: 15, borderRadius: 15, backgroundColor: theme.text, paddingHorizontal: 18 }, primaryText: { color: "white", fontSize: 15, fontWeight: "700" }, loader: { marginTop: 20 }, empty: { marginTop: 16, color: theme.muted, fontSize: 14 },
  tabs: { gap: 8, paddingTop: 14, paddingRight: 16 }, tab: { minHeight: 42, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.border, borderRadius: 13, paddingHorizontal: 12 }, tabActive: { borderColor: theme.text, backgroundColor: theme.text }, tabText: { color: theme.muted, fontSize: 12, fontWeight: "700" }, tabTextActive: { color: "white" },
  card: { marginTop: 12, borderWidth: 1, borderColor: theme.border, borderRadius: 18, padding: 14 }, cardActive: { borderColor: theme.text }, cardHead: { flexDirection: "row", alignItems: "center", gap: 10 }, dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.faint }, dotActive: { backgroundColor: theme.success }, cardCopy: { flex: 1 }, cardName: { color: theme.text, fontSize: 16, fontWeight: "700" }, cardMeta: { marginTop: 4, color: theme.muted, fontSize: 12, lineHeight: 17 }, active: { color: theme.success, fontSize: 11, fontWeight: "700" }, endpoint: { marginTop: 12, borderRadius: 12, backgroundColor: theme.soft, padding: 10, color: theme.muted, fontSize: 11, lineHeight: 17 }, result: { marginTop: 10, color: theme.success, fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }, action: { minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.border, borderRadius: 13, paddingHorizontal: 12 }, actionDanger: { borderColor: "rgba(180,35,24,.2)" }, actionText: { color: theme.text, fontSize: 13, fontWeight: "700" }, dangerText: { color: "#a32920" }
});
