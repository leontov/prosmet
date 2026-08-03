import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type {
  AgentConfigInput,
  AgentDescriptor,
  AgentProviderKind,
  AgentRegistryResponse,
  AgentTestResult
} from "@prosmet/contracts";
import {
  BotIcon,
  CheckCircle2Icon,
  DatabaseIcon,
  DownloadIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  LockKeyholeIcon,
  LogOutIcon,
  PencilIcon,
  PlugZapIcon,
  PlusIcon,
  RefreshCwIcon,
  SaveIcon,
  ServerCogIcon,
  ShieldCheckIcon,
  Trash2Icon,
  XIcon
} from "lucide-react";
import {
  activateAgent,
  announceAgentChange,
  createAgent,
  deleteAgent,
  fetchAdminSession,
  fetchAgentRegistry,
  loginAdmin,
  logoutAdmin,
  testAgent,
  updateAgent
} from "../agents/agent-api";

const providerLabels: Record<AgentProviderKind, { title: string; detail: string }> = {
  "openai-compatible": {
    title: "OpenAI-compatible",
    detail: "OpenAI API, MiMo gateway и другие /v1/chat/completions endpoints"
  },
  ollama: {
    title: "Ollama",
    detail: "Локальная модель через нативный /api/chat"
  },
  "codex-app-server": {
    title: "Codex App Server",
    detail: "Двунаправленный JSONL/stdio runtime Codex"
  },
  "http-agent": {
    title: "HTTP agent",
    detail: "Любой агентный сервис по универсальному JSON-контракту"
  }
};

function emptyAgent(): AgentConfigInput {
  return {
    name: "",
    type: "openai-compatible",
    enabled: true,
    model: "",
    baseUrl: "",
    command: "codex",
    args: ["app-server", "--listen", "stdio://"],
    cwd: "",
    systemPrompt: "",
    timeoutMs: 180000,
    secret: ""
  };
}

function providerTitle(type: AgentProviderKind) {
  return providerLabels[type]?.title ?? type;
}

export function SettingsView({ mobile }: { mobile: boolean }) {
  const [offline, setOffline] = usePersistentBoolean("prosmet-setting-offline", true);
  const [autoSave, setAutoSave] = usePersistentBoolean("prosmet-setting-autosave", true);
  const [compact, setCompact] = usePersistentBoolean("prosmet-setting-compact", false);
  const [registry, setRegistry] = useState<AgentRegistryResponse | null>(null);
  const [adminToken, setAdminToken] = useState("");
  const [form, setForm] = useState<AgentConfigInput>(() => emptyAgent());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, AgentTestResult>>({});

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [agents, session] = await Promise.all([fetchAgentRegistry(), fetchAdminSession()]);
      setRegistry({
        ...agents,
        adminAuthenticated: session.authenticated,
        bootstrapRequired: session.bootstrapRequired
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить настройки агентов");
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const active = useMemo(
    () => registry?.agents.find((agent) => agent.active) ?? null,
    [registry]
  );

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyAgent());
  };

  const editAgent = (agent: AgentDescriptor) => {
    setEditingId(agent.id);
    setForm({
      name: agent.name,
      type: agent.type,
      enabled: agent.enabled,
      model: agent.model ?? "",
      baseUrl: agent.baseUrl ?? "",
      command: agent.command ?? "codex",
      args: agent.args,
      cwd: agent.cwd ?? "",
      systemPrompt: agent.systemPrompt ?? "",
      timeoutMs: agent.timeoutMs,
      secret: ""
    });
    document.querySelector(".agent-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submitAgent = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("save");
    setError(null);
    try {
      const payload: AgentConfigInput = {
        name: form.name.trim(),
        type: form.type,
        enabled: form.enabled ?? true,
        model: form.model?.trim() || null,
        baseUrl: form.baseUrl?.trim() || null,
        command: form.command?.trim() || null,
        args: form.type === "codex-app-server" ? (form.args ?? []) : [],
        cwd: form.cwd?.trim() || null,
        systemPrompt: form.systemPrompt?.trim() || null,
        timeoutMs: form.timeoutMs ?? 180000,
        ...(form.secret?.trim()
          ? { secret: form.secret.trim() }
          : editingId
            ? {}
            : { secret: null })
      };

      if (editingId) await updateAgent(editingId, payload);
      else await createAgent(payload);
      resetForm();
      await reload();
      announceAgentChange();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить агента");
    } finally {
      setBusy(null);
    }
  };

  const authenticate = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("login");
    setError(null);
    try {
      await loginAdmin(adminToken);
      setAdminToken("");
      await reload();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Не удалось войти");
    } finally {
      setBusy(null);
    }
  };

  const runTest = async (agent: AgentDescriptor) => {
    setBusy(`test:${agent.id}`);
    setError(null);
    try {
      const result = await testAgent(agent.id);
      setTestResults((current) => ({ ...current, [agent.id]: result }));
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Проверка агента завершилась ошибкой");
    } finally {
      setBusy(null);
    }
  };

  const makeActive = async (agent: AgentDescriptor) => {
    setBusy(`activate:${agent.id}`);
    setError(null);
    try {
      await activateAgent(agent.id);
      await reload();
      announceAgentChange();
    } catch (activateError) {
      setError(activateError instanceof Error ? activateError.message : "Не удалось активировать агента");
    } finally {
      setBusy(null);
    }
  };

  const removeAgent = async (agent: AgentDescriptor) => {
    if (!window.confirm(`Удалить подключение «${agent.name}»?`)) return;
    setBusy(`delete:${agent.id}`);
    setError(null);
    try {
      await deleteAgent(agent.id);
      if (editingId === agent.id) resetForm();
      await reload();
      announceAgentChange();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить агента");
    } finally {
      setBusy(null);
    }
  };

  const exportLocalData = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      workspace: JSON.parse(window.localStorage.getItem("prosmet-workspace-v1") || "null"),
      settings: { offline, autoSave, compact }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `prosmet-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(href);
  };

  return (
    <section className={mobile ? "settings mobile-settings" : "settings desktop-settings"}>
      <header className="section-title">
        <h1>Настройки</h1>
        <p>Реальные подключения агентов, локальные данные и безопасность.</p>
      </header>

      {error ? <div className="settings-error" role="alert">{error}</div> : null}

      <div className="settings-layout agent-control-layout">
        <div className="settings-main">
          <SettingsSection icon={<ServerCogIcon />} title="Активный агент">
            <div className="active-agent-summary">
              <span className={active ? "agent-health online" : "agent-health offline"} />
              <div>
                <strong>{active?.name || "Агент не подключён"}</strong>
                <small>{active ? `${providerTitle(active.type)}${active.model ? ` · ${active.model}` : ""}` : "Добавьте первое подключение ниже"}</small>
              </div>
              <button type="button" onClick={() => void reload()} aria-label="Обновить состояние"><RefreshCwIcon /></button>
            </div>
          </SettingsSection>

          <SettingsSection icon={<DatabaseIcon />} title="Данные и интерфейс">
            <ToggleRow title="Автосохранение" description="Сохранять изменения сметы в локальном workspace" checked={autoSave} onChange={setAutoSave} />
            <ToggleRow title="Локальный режим" description="Сохранять рабочие данные в браузере при отсутствии сети" checked={offline} onChange={setOffline} />
            <ToggleRow title="Компактная плотность" description="Уменьшить отступы на больших экранах" checked={compact} onChange={setCompact} />
            <button type="button" className="settings-action" onClick={exportLocalData}>
              <span><strong>Экспорт локальных данных</strong><small>Скачать фактические сметы и настройки этого устройства</small></span>
              <b><DownloadIcon /> Экспортировать</b>
            </button>
          </SettingsSection>

          <SettingsSection icon={<LockKeyholeIcon />} title="Супер-администратор">
            {registry?.adminAuthenticated ? (
              <div className="admin-session-row">
                <span><ShieldCheckIcon /><span><strong>Сессия активна</strong><small>Можно добавлять, проверять и переключать агентов</small></span></span>
                <button type="button" onClick={async () => { await logoutAdmin(); await reload(); }}><LogOutIcon /> Выйти</button>
              </div>
            ) : (
              <form className="admin-login" onSubmit={authenticate}>
                <label htmlFor="admin-token"><span>Токен супер-администратора</span><input id="admin-token" name="admin-token" type="password" autoComplete="current-password" value={adminToken} onChange={(event) => setAdminToken(event.target.value)} required /></label>
                <button type="submit" disabled={busy === "login"}>{busy === "login" ? <LoaderCircleIcon className="spin" /> : <KeyRoundIcon />} Войти</button>
                {registry?.bootstrapRequired ? <p>Сервер использует bootstrap-токен, сохранённый в защищённом конфигурационном каталоге.</p> : null}
              </form>
            )}
          </SettingsSection>

          {registry?.adminAuthenticated ? (
            <SettingsSection icon={<PlugZapIcon />} title={editingId ? "Изменить подключение" : "Подключить агента"}>
              <form className="agent-form" onSubmit={submitAgent}>
                <div className="agent-form-grid">
                  <Field label="Название" id="agent-name"><input id="agent-name" name="agent-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Например, Codex Primary" required /></Field>
                  <Field label="Тип интеграции" id="agent-type">
                    <select id="agent-type" name="agent-type" value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as AgentProviderKind }))}>
                      {(Object.keys(providerLabels) as AgentProviderKind[]).map((type) => <option key={type} value={type}>{providerTitle(type)}</option>)}
                    </select>
                  </Field>

                  {form.type === "codex-app-server" ? (
                    <>
                      <Field label="Команда" id="agent-command"><input id="agent-command" name="agent-command" value={form.command ?? ""} onChange={(event) => setForm((current) => ({ ...current, command: event.target.value }))} placeholder="codex" required /></Field>
                      <Field label="Аргументы" id="agent-args"><input id="agent-args" name="agent-args" value={(form.args ?? []).join(" ")} onChange={(event) => setForm((current) => ({ ...current, args: event.target.value.split(/\s+/).filter(Boolean) }))} placeholder="app-server --listen stdio://" required /></Field>
                      <Field label="Рабочая директория" id="agent-cwd"><input id="agent-cwd" name="agent-cwd" value={form.cwd ?? ""} onChange={(event) => setForm((current) => ({ ...current, cwd: event.target.value }))} placeholder="/srv/workspaces/prosmet" /></Field>
                    </>
                  ) : (
                    <Field label={form.type === "http-agent" ? "Endpoint" : "Base URL"} id="agent-base-url"><input id="agent-base-url" name="agent-base-url" type="url" value={form.baseUrl ?? ""} onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))} placeholder={form.type === "ollama" ? "http://127.0.0.1:11434" : form.type === "http-agent" ? "https://agent.example.com/run" : "https://api.openai.com/v1"} required /></Field>
                  )}

                  {form.type !== "http-agent" ? <Field label="Модель" id="agent-model"><input id="agent-model" name="agent-model" value={form.model ?? ""} onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} placeholder={form.type === "ollama" ? "qwen3:32b" : "gpt-5.4"} required={form.type !== "codex-app-server"} /></Field> : null}
                  <Field label={editingId ? "Новый секрет — необязательно" : "API key / token — необязательно"} id="agent-secret"><input id="agent-secret" name="agent-secret" type="password" autoComplete="new-password" value={form.secret ?? ""} onChange={(event) => setForm((current) => ({ ...current, secret: event.target.value }))} placeholder={editingId ? "Оставьте пустым, чтобы сохранить текущий" : "Сохраняется на сервере в зашифрованном виде"} /></Field>
                  <Field label="Тайм-аут, мс" id="agent-timeout"><input id="agent-timeout" name="agent-timeout" type="number" min="5000" max="600000" step="1000" value={form.timeoutMs ?? 120000} onChange={(event) => setForm((current) => ({ ...current, timeoutMs: Number(event.target.value) }))} /></Field>
                  <Field label="Системные инструкции — необязательно" id="agent-system-prompt" wide><textarea id="agent-system-prompt" name="agent-system-prompt" rows={4} value={form.systemPrompt ?? ""} onChange={(event) => setForm((current) => ({ ...current, systemPrompt: event.target.value }))} placeholder="Пустое поле использует системный контракт Просметчика" /></Field>
                </div>
                <div className="agent-form-actions">
                  {editingId ? <button type="button" className="secondary-button" onClick={resetForm}><XIcon /> Отмена</button> : null}
                  <button type="submit" className="primary-button" disabled={busy === "save"}>{busy === "save" ? <LoaderCircleIcon className="spin" /> : editingId ? <SaveIcon /> : <PlusIcon />} {editingId ? "Сохранить" : "Подключить"}</button>
                </div>
              </form>
            </SettingsSection>
          ) : null}
        </div>

        <aside className="agent-settings live-agent-list">
          <div className="agent-settings-title"><BotIcon /><span><strong>Подключения</strong><small>{registry?.agents.length ?? 0} настроено</small></span></div>
          {registry?.agents.length ? registry.agents.map((agent) => (
            <article key={agent.id} className={agent.active ? "agent-connection active" : "agent-connection"}>
              <header>
                <span className={agent.active ? "agent-health online" : "agent-health idle"} />
                <span><strong>{agent.name}</strong><small>{providerTitle(agent.type)}{agent.model ? ` · ${agent.model}` : ""}</small></span>
                {agent.active ? <CheckCircle2Icon /> : null}
              </header>
              <p>{agent.type === "codex-app-server" ? `${agent.command ?? "codex"} ${(agent.args ?? []).join(" ")}` : agent.baseUrl}</p>
              {agent.hasSecret ? <small className="secret-state"><KeyRoundIcon /> Секрет сохранён</small> : null}
              {testResults[agent.id] ? <div className="agent-test-result"><CheckCircle2Icon /> {testResults[agent.id]!.latencyMs} мс · {testResults[agent.id]!.message}</div> : null}
              {registry.adminAuthenticated ? (
                <footer>
                  <button type="button" onClick={() => void runTest(agent)} disabled={busy === `test:${agent.id}`}>{busy === `test:${agent.id}` ? <LoaderCircleIcon className="spin" /> : <PlugZapIcon />} Проверить</button>
                  {!agent.active ? <button type="button" onClick={() => void makeActive(agent)} disabled={busy === `activate:${agent.id}`}>Активировать</button> : null}
                  <button type="button" aria-label={`Изменить ${agent.name}`} onClick={() => editAgent(agent)}><PencilIcon /></button>
                  <button type="button" aria-label={`Удалить ${agent.name}`} onClick={() => void removeAgent(agent)} disabled={busy === `delete:${agent.id}`}><Trash2Icon /></button>
                </footer>
              ) : null}
            </article>
          )) : <div className="agent-empty"><BotIcon /><strong>Нет подключений</strong><p>Войдите как супер-администратор и добавьте реального агента.</p></div>}
        </aside>
      </div>
    </section>
  );
}

function SettingsSection({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <section className="settings-section"><header><span>{icon}</span><h2>{title}</h2></header><div>{children}</div></section>;
}

function ToggleRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <button type="button" className="toggle-row" onClick={() => onChange(!checked)} aria-pressed={checked}><span><strong>{title}</strong><small>{description}</small></span><i className={checked ? "toggle active" : "toggle"}><b /></i></button>;
}

function Field({ label, id, wide = false, children }: { label: string; id: string; wide?: boolean; children: ReactNode }) {
  return <label className={wide ? "agent-field wide" : "agent-field"} htmlFor={id}><span>{label}</span>{children}</label>;
}

function usePersistentBoolean(key: string, initialValue: boolean) {
  const [value, setValue] = useState(() => {
    const stored = window.localStorage.getItem(key);
    return stored === null ? initialValue : stored === "true";
  });
  const update = (next: boolean) => {
    setValue(next);
    window.localStorage.setItem(key, String(next));
  };
  return [value, update] as const;
}
