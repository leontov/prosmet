import { useEffect, useMemo, useState } from "react";
import type {
  AdminAgentSummary,
  AgentCatalog,
  AgentConfigurationInput,
  AgentKind
} from "@prosmet/contracts";
import {
  BotIcon,
  CheckCircle2Icon,
  FlaskConicalIcon,
  KeyRoundIcon,
  PlusIcon,
  RefreshCwIcon,
  SaveIcon,
  ServerCogIcon,
  Trash2Icon,
  XIcon
} from "lucide-react";
import {
  activateAgentConfiguration,
  deleteAgentConfiguration,
  loadAdminAgents,
  loadAgentCatalog,
  saveAgentConfiguration,
  selectAgent,
  testAgentConfiguration
} from "./agent-client";

const kinds: Array<{ id: AgentKind; label: string; detail: string }> = [
  { id: "openai-compatible", label: "OpenAI-compatible", detail: "OpenAI, vLLM, LM Studio и совместимые /chat/completions" },
  { id: "ollama", label: "Ollama", detail: "Нативный /api/chat на локальном или удалённом сервере" },
  { id: "codex-app-server", label: "Codex App Server", detail: "JSON-RPC/JSONL через установленный codex app-server" },
  { id: "ag-ui", label: "AG-UI", detail: "Удалённый агент с нормализованным Prosmet envelope" },
  { id: "a2a", label: "A2A", detail: "Удалённый агентный endpoint с нормализованным Prosmet envelope" }
];

const emptyForm: AgentConfigurationInput = {
  name: "",
  kind: "openai-compatible",
  enabled: true,
  makeDefault: true,
  model: "",
  baseUrl: "",
  endpoint: "",
  systemPrompt: "",
  cwd: "",
  timeoutMs: 120000,
  temperature: 0.2,
  supportsTools: true,
  apiKey: "",
  apiKeyEnv: ""
};

export function AgentSettingsPanel() {
  const [catalog, setCatalog] = useState<AgentCatalog | null>(null);
  const [adminToken, setAdminToken] = useState("");
  const [agents, setAgents] = useState<AdminAgentSummary[] | null>(null);
  const [configPath, setConfigPath] = useState("");
  const [form, setForm] = useState<AgentConfigurationInput>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refreshPublic = async () => {
    const next = await loadAgentCatalog();
    setCatalog(next);
  };

  useEffect(() => {
    void refreshPublic().catch((reason) => setError(reason instanceof Error ? reason.message : "Не удалось загрузить агентов"));
  }, []);

  const unlock = async () => {
    setBusy("unlock");
    setError("");
    setMessage("");
    try {
      const result = await loadAdminAgents(adminToken);
      setAgents(result.agents);
      setConfigPath(result.configPath);
      setMessage("Режим супер-администратора открыт только на время этой вкладки.");
    } catch (reason) {
      setAgents(null);
      setError(reason instanceof Error ? reason.message : "Не удалось открыть настройки агентов");
    } finally {
      setBusy("");
    }
  };

  const refreshAdmin = async () => {
    if (!adminToken) return;
    const result = await loadAdminAgents(adminToken);
    setAgents(result.agents);
    setConfigPath(result.configPath);
    await refreshPublic();
  };

  const edit = (agent: AdminAgentSummary) => {
    setForm({
      id: agent.id,
      name: agent.name,
      kind: agent.kind,
      enabled: agent.enabled,
      makeDefault: agent.isDefault,
      model: agent.model,
      baseUrl: agent.baseUrl,
      endpoint: agent.endpoint,
      cwd: agent.cwd,
      timeoutMs: agent.timeoutMs,
      temperature: 0.2,
      supportsTools: agent.supportsTools,
      apiKey: "",
      apiKeyEnv: agent.apiKeyEnv,
      systemPrompt: ""
    });
    setFormOpen(true);
    setError("");
    setMessage("");
  };

  const create = () => {
    setForm({ ...emptyForm });
    setFormOpen(true);
    setError("");
    setMessage("");
  };

  const save = async () => {
    setBusy("save");
    setError("");
    try {
      const result = await saveAgentConfiguration(form, adminToken);
      setMessage(`Агент «${result.agent.name}» сохранён.`);
      setFormOpen(false);
      await refreshAdmin();
      if (form.makeDefault) selectAgent(result.agent.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить агента");
    } finally {
      setBusy("");
    }
  };

  const activate = async (agent: AdminAgentSummary) => {
    setBusy(`activate:${agent.id}`);
    setError("");
    try {
      await activateAgentConfiguration(agent.id, adminToken);
      selectAgent(agent.id);
      setMessage(`Агент «${agent.name}» назначен по умолчанию.`);
      await refreshAdmin();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось активировать агента");
    } finally {
      setBusy("");
    }
  };

  const test = async (agent: AdminAgentSummary) => {
    setBusy(`test:${agent.id}`);
    setError("");
    setMessage("");
    try {
      const result = await testAgentConfiguration(agent.id, adminToken);
      if (!result.ok) throw new Error(`Агент ответил, но не прошёл контрольную фразу: ${result.text}`);
      setMessage(`PASS · ${agent.name} · ${result.latencyMs} мс`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Проверка агента не прошла");
    } finally {
      setBusy("");
    }
  };

  const remove = async (agent: AdminAgentSummary) => {
    if (agent.source !== "stored") return;
    if (!window.confirm(`Удалить подключение «${agent.name}»? Секрет будет удалён из серверной конфигурации.`)) return;
    setBusy(`delete:${agent.id}`);
    setError("");
    try {
      await deleteAgentConfiguration(agent.id, adminToken);
      setMessage(`Подключение «${agent.name}» удалено.`);
      await refreshAdmin();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось удалить агента");
    } finally {
      setBusy("");
    }
  };

  const visibleAgents = useMemo(() => agents ?? catalog?.agents ?? [], [agents, catalog]);

  return (
    <section className="agent-integration" aria-labelledby="agent-integration-title">
      <header className="agent-integration-header">
        <div className="agent-integration-heading">
          <span><BotIcon /></span>
          <div><h2 id="agent-integration-title">Интеграция агентов</h2><p>Секреты остаются на сервере. Браузер получает только безопасные метаданные.</p></div>
        </div>
        <button type="button" className="secondary-button" onClick={() => void refreshPublic()}><RefreshCwIcon /> Обновить</button>
      </header>

      <div className="admin-unlock">
        <label htmlFor="agent-admin-token"><KeyRoundIcon /><span><strong>Токен супер-администратора</strong><small>Не записывается в localStorage и исчезает после закрытия вкладки.</small></span></label>
        <div>
          <input
            id="agent-admin-token"
            name="agent-admin-token"
            type="password"
            autoComplete="off"
            value={adminToken}
            onChange={(event) => setAdminToken(event.target.value)}
            placeholder="PROSMET_ADMIN_TOKEN"
          />
          <button type="button" className="primary-button" disabled={!adminToken || busy === "unlock"} onClick={() => void unlock()}>
            <ServerCogIcon /> Открыть
          </button>
        </div>
      </div>

      {message ? <p className="agent-notice success"><CheckCircle2Icon /> {message}</p> : null}
      {error ? <p className="agent-notice error">{error}</p> : null}

      <div className="agent-list">
        {visibleAgents.map((agent) => {
          const adminAgent = "source" in agent ? agent as AdminAgentSummary : null;
          return (
            <article key={agent.id} className={agent.isDefault ? "agent-card active" : "agent-card"}>
              <div className="agent-card-main">
                <span className="agent-card-icon"><BotIcon /></span>
                <div>
                  <div className="agent-card-title"><strong>{agent.name}</strong>{agent.isDefault ? <b>По умолчанию</b> : null}</div>
                  <small>{kindLabel(agent.kind)}{agent.model ? ` · ${agent.model}` : ""}</small>
                  {adminAgent ? <em>{adminAgent.source === "environment" ? "Из переменных окружения" : "Зашифрованная серверная конфигурация"}{adminAgent.credentialConfigured ? " · ключ настроен" : ""}</em> : null}
                </div>
              </div>
              {adminAgent ? (
                <div className="agent-card-actions">
                  <button type="button" disabled={busy !== "" || agent.isDefault} onClick={() => void activate(adminAgent)}>Сделать основным</button>
                  <button type="button" disabled={busy !== ""} onClick={() => void test(adminAgent)}><FlaskConicalIcon /> Проверить</button>
                  {adminAgent.source === "stored" ? <button type="button" disabled={busy !== ""} onClick={() => edit(adminAgent)}>Изменить</button> : null}
                  {adminAgent.source === "stored" ? <button type="button" className="danger" disabled={busy !== ""} onClick={() => void remove(adminAgent)}><Trash2Icon /></button> : null}
                </div>
              ) : null}
            </article>
          );
        })}

        {!visibleAgents.length ? (
          <div className="agent-empty">
            <BotIcon />
            <strong>Агенты ещё не подключены</strong>
            <p>Откройте режим супер-администратора и добавьте Codex, Ollama, OpenAI-compatible, AG-UI или A2A endpoint.</p>
          </div>
        ) : null}
      </div>

      {agents ? (
        <div className="agent-admin-footer">
          <button type="button" className="primary-button" onClick={create}><PlusIcon /> Подключить агента</button>
          <small>Конфигурация: {configPath}</small>
        </div>
      ) : null}

      {formOpen ? (
        <AgentForm form={form} setForm={setForm} busy={busy === "save"} onClose={() => setFormOpen(false)} onSave={() => void save()} />
      ) : null}
    </section>
  );
}

function AgentForm({ form, setForm, busy, onClose, onSave }: {
  form: AgentConfigurationInput;
  setForm: (value: AgentConfigurationInput) => void;
  busy: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const httpKind = form.kind !== "codex-app-server";
  const modelKind = form.kind === "openai-compatible" || form.kind === "ollama";
  const set = <K extends keyof AgentConfigurationInput>(key: K, value: AgentConfigurationInput[K]) => setForm({ ...form, [key]: value });

  return (
    <div className="agent-form-layer">
      <button type="button" className="agent-form-backdrop" aria-label="Закрыть форму" onClick={onClose} />
      <form className="agent-form" onSubmit={(event) => { event.preventDefault(); onSave(); }}>
        <header><div><h3>{form.id ? "Изменить агента" : "Подключить агента"}</h3><p>Сохранение происходит только на сервере.</p></div><button type="button" aria-label="Закрыть" onClick={onClose}><XIcon /></button></header>

        <div className="agent-form-grid">
          <Field label="Название"><input id="agent-name" name="agent-name" required value={form.name} onChange={(event) => set("name", event.target.value)} /></Field>
          <Field label="Адаптер"><select id="agent-kind" name="agent-kind" value={form.kind} onChange={(event) => set("kind", event.target.value as AgentKind)}>{kinds.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}</select></Field>
          <p className="agent-kind-detail">{kinds.find((kind) => kind.id === form.kind)?.detail}</p>

          {httpKind ? <Field label="Base URL"><input id="agent-base-url" name="agent-base-url" type="url" required value={form.baseUrl || ""} onChange={(event) => set("baseUrl", event.target.value)} placeholder="https://agent.example.com/v1" /></Field> : null}
          {httpKind && (form.kind === "ag-ui" || form.kind === "a2a") ? <Field label="Endpoint, если отличается"><input id="agent-endpoint" name="agent-endpoint" value={form.endpoint || ""} onChange={(event) => set("endpoint", event.target.value)} placeholder="/run" /></Field> : null}
          {modelKind || form.kind === "codex-app-server" ? <Field label={form.kind === "codex-app-server" ? "Модель, необязательно" : "Модель"}><input id="agent-model" name="agent-model" required={modelKind} value={form.model || ""} onChange={(event) => set("model", event.target.value)} placeholder="gpt-5.6-codex / llama3.3" /></Field> : null}
          {form.kind === "codex-app-server" ? <Field label="Рабочая директория"><input id="agent-cwd" name="agent-cwd" value={form.cwd || ""} onChange={(event) => set("cwd", event.target.value)} placeholder="/srv/prosmet/workspaces" /></Field> : null}

          {httpKind ? <Field label="API key"><input id="agent-api-key" name="agent-api-key" type="password" autoComplete="new-password" value={form.apiKey || ""} onChange={(event) => set("apiKey", event.target.value)} placeholder={form.id ? "Оставьте пустым, чтобы не менять" : "Секрет будет зашифрован"} /></Field> : null}
          {httpKind ? <Field label="Или переменная окружения"><input id="agent-api-key-env" name="agent-api-key-env" value={form.apiKeyEnv || ""} onChange={(event) => set("apiKeyEnv", event.target.value)} placeholder="OPENAI_API_KEY" /></Field> : null}
          <Field label="Таймаут, мс"><input id="agent-timeout" name="agent-timeout" type="number" min="5000" max="600000" value={form.timeoutMs || 120000} onChange={(event) => set("timeoutMs", Number(event.target.value))} /></Field>
          {modelKind ? <Field label="Температура"><input id="agent-temperature" name="agent-temperature" type="number" min="0" max="2" step="0.1" value={form.temperature ?? 0.2} onChange={(event) => set("temperature", Number(event.target.value))} /></Field> : null}
          <Field wide label="Дополнительная системная инструкция"><textarea id="agent-system-prompt" name="agent-system-prompt" rows={4} value={form.systemPrompt || ""} onChange={(event) => set("systemPrompt", event.target.value)} /></Field>
        </div>

        <div className="agent-form-switches">
          <label><input type="checkbox" checked={form.enabled} onChange={(event) => set("enabled", event.target.checked)} /> Включён</label>
          <label><input type="checkbox" checked={Boolean(form.makeDefault)} onChange={(event) => set("makeDefault", event.target.checked)} /> Использовать по умолчанию</label>
          {modelKind ? <label><input type="checkbox" checked={Boolean(form.supportsTools)} onChange={(event) => set("supportsTools", event.target.checked)} /> Поддерживает tools/function calling</label> : null}
        </div>

        <footer><button type="button" className="secondary-button" onClick={onClose}>Отмена</button><button type="submit" className="primary-button" disabled={busy}><SaveIcon /> Сохранить</button></footer>
      </form>
    </div>
  );
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "agent-field wide" : "agent-field"}><span>{label}</span>{children}</label>;
}

function kindLabel(kind: AgentKind) {
  return kinds.find((entry) => entry.id === kind)?.label || kind;
}
