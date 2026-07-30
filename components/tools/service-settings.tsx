"use client";

import {
  BotIcon,
  Building2Icon,
  CheckCircle2Icon,
  CircleAlertIcon,
  DatabaseIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  PlugIcon,
  RefreshCwIcon,
  SaveIcon,
  ServerIcon,
  Settings2Icon,
  ShieldCheckIcon,
  Trash2Icon,
  UserRoundIcon
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type ToolStatus = { type?: string };

type WorkspaceSnapshot = {
  tenantId: string;
  guest: boolean;
  storage: "postgres" | "unavailable";
  updatedAt: string | null;
  profile: {
    displayName: string;
    legalForm: "organization" | "ip" | "self-employed" | "specialist";
    organizationName: string;
    region: string;
  };
  settings: {
    region: string;
    method: "commercial" | "resource" | "resource-index" | "base-index" | "mixed";
    currency: "RUB" | "EUR" | "USD";
    vatPercent: number;
    autoSync: boolean;
  };
};

type ProviderKind = "rules" | "mimo" | "openai-compatible" | "ollama" | "codex-cli" | "codex-app-server" | "a2a" | "ag-ui";

type ProviderConnection = {
  id: string;
  kind: ProviderKind;
  name: string;
  baseUrl: string;
  model: string;
  status: "connected" | "disconnected" | "error" | "unchecked";
  selected: boolean;
  hasSecret: boolean;
  lastError: string | null;
  lastCheckedAt: string | null;
  updatedAt: string;
};

const inputClass =
  "h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400 focus:bg-white";

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers
    },
    credentials: "same-origin",
    cache: "no-store"
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || payload.ok === false) {
    throw new Error(
      typeof payload.message === "string"
        ? payload.message
        : `Сервис ответил ${response.status}`
    );
  }
  return payload as T;
}

export function WorkspaceSettingsTool({
  args,
  status
}: {
  args: unknown;
  status?: ToolStatus;
}) {
  const requestedSection = record(args).section === "estimating" ? "estimating" : "profile";
  const [section, setSection] = useState<"profile" | "estimating">(requestedSection);
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await jsonRequest<{ ok: true; workspace: WorkspaceSnapshot }>(
        "/api/workspace"
      );
      setWorkspace(payload.workspace);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить профиль.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status?.type === "running") return;
    void load();
    // The tool instance owns one server-backed settings session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.type]);

  const save = async () => {
    if (!workspace) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const body =
        section === "profile"
          ? { profile: workspace.profile }
          : { settings: workspace.settings };
      const payload = await jsonRequest<{ ok: true; workspace: WorkspaceSnapshot }>(
        "/api/workspace",
        { method: "PUT", body: JSON.stringify(body) }
      );
      setWorkspace(payload.workspace);
      setMessage(
        section === "profile"
          ? "Профиль и организация сохранены на сервере."
          : "Сметные настройки сохранены на сервере."
      );
      window.dispatchEvent(new Event("prosmet:workspace-service-changed"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить настройки.");
    } finally {
      setSaving(false);
    }
  };

  if (status?.type === "running" || loading) {
    return <ServiceLoading label="Загружаем рабочее пространство…" />;
  }

  return (
    <section
      className="my-3 w-full max-w-(--thread-max-width) overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm"
      data-testid="workspace-settings-tool"
    >
      <header className="flex flex-col gap-3 border-b border-neutral-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#eef1ff] text-[#4457a8]">
            <Building2Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-neutral-950">Рабочее пространство</h3>
            <p className="mt-0.5 text-xs text-neutral-500">
              Tenant-scoped PostgreSQL · используется сметами и документами
            </p>
          </div>
        </div>
        <div className="flex rounded-xl bg-neutral-100 p-1 text-xs font-medium">
          <TabButton active={section === "profile"} onClick={() => setSection("profile")}>
            Профиль
          </TabButton>
          <TabButton active={section === "estimating"} onClick={() => setSection("estimating")}>
            Смета
          </TabButton>
        </div>
      </header>

      {workspace ? (
        <div className="p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
              <DatabaseIcon className="size-3" /> {workspace.storage === "postgres" ? "PostgreSQL" : "Недоступно"}
            </span>
            <span className="rounded-full bg-neutral-100 px-2 py-1">
              {workspace.guest ? "Гостевое пространство" : "Аккаунт"}
            </span>
            {workspace.updatedAt ? (
              <span>Обновлено {new Date(workspace.updatedAt).toLocaleString("ru-RU")}</span>
            ) : null}
          </div>

          {section === "profile" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Имя">
                <input
                  aria-label="Имя в рабочем пространстве"
                  value={workspace.profile.displayName}
                  onChange={(event) =>
                    setWorkspace((current) =>
                      current
                        ? {
                            ...current,
                            profile: { ...current.profile, displayName: event.target.value }
                          }
                        : current
                    )
                  }
                  className={inputClass}
                  placeholder="Владислав"
                />
              </Field>
              <Field label="Статус">
                <select
                  aria-label="Правовая форма"
                  value={workspace.profile.legalForm}
                  onChange={(event) =>
                    setWorkspace((current) =>
                      current
                        ? {
                            ...current,
                            profile: {
                              ...current.profile,
                              legalForm: event.target.value as WorkspaceSnapshot["profile"]["legalForm"]
                            }
                          }
                        : current
                    )
                  }
                  className={inputClass}
                >
                  <option value="organization">Организация</option>
                  <option value="ip">Индивидуальный предприниматель</option>
                  <option value="self-employed">Самозанятый</option>
                  <option value="specialist">Частный специалист</option>
                </select>
              </Field>
              <Field label="Организация или бренд">
                <input
                  aria-label="Организация или бренд"
                  value={workspace.profile.organizationName}
                  onChange={(event) =>
                    setWorkspace((current) =>
                      current
                        ? {
                            ...current,
                            profile: {
                              ...current.profile,
                              organizationName: event.target.value
                            }
                          }
                        : current
                    )
                  }
                  className={inputClass}
                  placeholder="Просметчик"
                />
              </Field>
              <Field label="Основной регион">
                <input
                  aria-label="Основной регион организации"
                  value={workspace.profile.region}
                  onChange={(event) =>
                    setWorkspace((current) =>
                      current
                        ? {
                            ...current,
                            profile: { ...current.profile, region: event.target.value }
                          }
                        : current
                    )
                  }
                  className={inputClass}
                  placeholder="Республика Татарстан"
                />
              </Field>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Регион по умолчанию">
                <input
                  aria-label="Регион смет по умолчанию"
                  value={workspace.settings.region}
                  onChange={(event) =>
                    setWorkspace((current) =>
                      current
                        ? {
                            ...current,
                            settings: { ...current.settings, region: event.target.value }
                          }
                        : current
                    )
                  }
                  className={inputClass}
                  placeholder="Республика Татарстан"
                />
              </Field>
              <Field label="Метод расчёта">
                <select
                  aria-label="Метод расчёта по умолчанию"
                  value={workspace.settings.method}
                  onChange={(event) =>
                    setWorkspace((current) =>
                      current
                        ? {
                            ...current,
                            settings: {
                              ...current.settings,
                              method: event.target.value as WorkspaceSnapshot["settings"]["method"]
                            }
                          }
                        : current
                    )
                  }
                  className={inputClass}
                >
                  <option value="commercial">Коммерческий</option>
                  <option value="resource">Ресурсный</option>
                  <option value="resource-index">Ресурсно-индексный</option>
                  <option value="base-index">Базисно-индексный</option>
                  <option value="mixed">Смешанный</option>
                </select>
              </Field>
              <Field label="Валюта">
                <select
                  aria-label="Валюта по умолчанию"
                  value={workspace.settings.currency}
                  onChange={(event) =>
                    setWorkspace((current) =>
                      current
                        ? {
                            ...current,
                            settings: {
                              ...current.settings,
                              currency: event.target.value as WorkspaceSnapshot["settings"]["currency"]
                            }
                          }
                        : current
                    )
                  }
                  className={inputClass}
                >
                  <option value="RUB">RUB</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                </select>
              </Field>
              <Field label="НДС, %">
                <input
                  aria-label="НДС по умолчанию"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={workspace.settings.vatPercent}
                  onChange={(event) =>
                    setWorkspace((current) =>
                      current
                        ? {
                            ...current,
                            settings: {
                              ...current.settings,
                              vatPercent: Number(event.target.value) || 0
                            }
                          }
                        : current
                    )
                  }
                  className={inputClass}
                />
              </Field>
              <label className="flex items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm sm:col-span-2">
                <span>
                  <span className="block font-medium text-neutral-900">Автоматическая синхронизация</span>
                  <span className="mt-0.5 block text-xs text-neutral-500">
                    Outbox → PostgreSQL → другие устройства
                  </span>
                </span>
                <input
                  aria-label="Автоматическая синхронизация"
                  type="checkbox"
                  checked={workspace.settings.autoSync}
                  onChange={(event) =>
                    setWorkspace((current) =>
                      current
                        ? {
                            ...current,
                            settings: { ...current.settings, autoSync: event.target.checked }
                          }
                        : current
                    )
                  }
                  className="size-4 accent-neutral-900"
                />
              </label>
            </div>
          )}

          <ToolFeedback message={message} error={error} />
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
            >
              {saving ? <LoaderCircleIcon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
              {saving ? "Сохраняем…" : "Сохранить на сервере"}
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4 sm:p-5">
          <ToolFeedback message={message} error={error || "Рабочее пространство не загружено."} />
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-neutral-200 px-3 text-sm font-medium"
          >
            <RefreshCwIcon className="size-4" /> Повторить
          </button>
        </div>
      )}
    </section>
  );
}

export function ProviderSettingsTool({
  args,
  status
}: {
  args: unknown;
  status?: ToolStatus;
}) {
  const hint = record(args).providerHint;
  const initialKind: ProviderKind =
    hint === "ollama" || hint === "openai-compatible" || hint === "codex-cli" || hint === "codex-app-server" || hint === "a2a" || hint === "ag-ui" || hint === "rules"
      ? hint
      : "mimo";
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(() => providerDefaults(initialKind));

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await jsonRequest<{
        ok: true;
        providers: {
          selectedId: string | null;
          connections: ProviderConnection[];
        };
      }>("/api/providers");
      setConnections(payload.providers.connections);
      setSelectedId(payload.providers.selectedId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить AI-провайдеры.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status?.type === "running") return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.type]);

  const connect = async () => {
    setBusy("connect");
    setMessage(null);
    setError(null);
    try {
      const payload = await jsonRequest<{ ok: true; connection: ProviderConnection }>(
        "/api/providers",
        {
          method: "POST",
          body: JSON.stringify({
            kind: form.kind,
            name: form.name,
            baseUrl: form.baseUrl,
            model: form.model,
            apiKey: form.apiKey || undefined,
            selected: form.selected,
            test: true
          })
        }
      );
      setForm((current) => ({ ...current, apiKey: "" }));
      setMessage(
        payload.connection.status === "connected"
          ? "Соединение проверено и сохранено server-side."
          : "Подключение сохранено, но проверка вернула ошибку."
      );
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось подключить провайдера.");
    } finally {
      setBusy(null);
    }
  };

  const select = async (id: string) => {
    setBusy(`select:${id}`);
    setMessage(null);
    setError(null);
    try {
      await jsonRequest("/api/providers", {
        method: "PATCH",
        body: JSON.stringify({ id })
      });
      setMessage("AI-провайдер выбран для следующих запусков.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось выбрать провайдера.");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (id: string) => {
    setBusy(`delete:${id}`);
    setMessage(null);
    setError(null);
    try {
      await jsonRequest("/api/providers", {
        method: "DELETE",
        body: JSON.stringify({ id })
      });
      setMessage("AI-провайдер отключён, зашифрованный секрет удалён.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось отключить провайдера.");
    } finally {
      setBusy(null);
    }
  };

  if (status?.type === "running" || loading) {
    return <ServiceLoading label="Загружаем AI-провайдеры…" />;
  }

  return (
    <section
      className="my-3 w-full max-w-(--thread-max-width) overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm"
      data-testid="provider-settings-tool"
    >
      <header className="flex items-start gap-3 border-b border-neutral-200 px-4 py-4 sm:px-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
          <PlugIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-neutral-950">AI-провайдеры</h3>
          <p className="mt-0.5 text-xs leading-5 text-neutral-500">
            Проверка выполняется с Primary. Секреты шифруются server-side и не попадают в IndexedDB.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="flex size-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100"
          aria-label="Обновить AI-провайдеры"
        >
          <RefreshCwIcon className="size-4" />
        </button>
      </header>

      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)]">
        <div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Тип провайдера">
              <select
                aria-label="Тип AI-провайдера"
                value={form.kind}
                onChange={(event) =>
                  setForm(providerDefaults(event.target.value as ProviderKind))
                }
                className={inputClass}
              >
                <option value="mimo">MiMo direct API</option>
                <option value="openai-compatible">OpenAI-compatible API</option>
                <option value="ollama">Ollama на сервере</option>
                <option value="codex-app-server">Codex App Server · ChatGPT</option>
                <option value="codex-cli">Codex Exec · совместимость</option>
                <option value="a2a">A2A v1 agent</option>
                <option value="ag-ui">AG-UI agent</option>
                <option value="rules">Встроенный сметный сервис</option>
              </select>
            </Field>
            <Field label="Название подключения">
              <input
                aria-label="Название подключения AI"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className={inputClass}
              />
            </Field>
            {form.kind !== "rules" && form.kind !== "codex-cli" && form.kind !== "codex-app-server" && form.kind !== "codex-app-server" ? (
              <Field label="Server-side endpoint">
                <input
                  aria-label="Endpoint AI-провайдера"
                  value={form.baseUrl}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, baseUrl: event.target.value }))
                  }
                  className={inputClass}
                  placeholder={form.kind === "ollama" ? "http://127.0.0.1:11434" : "https://api.example.com/v1"}
                />
              </Field>
            ) : null}
            {form.kind !== "rules" ? (
              <Field label="Модель">
                <input
                  aria-label="Модель AI-провайдера"
                  value={form.model}
                  onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
                  className={inputClass}
                  placeholder="model-name"
                />
              </Field>
            ) : null}
            {form.kind === "mimo" || form.kind === "openai-compatible" ? (
              <Field label="API-ключ (одноразовый ввод)">
                <input
                  aria-label="API-ключ AI-провайдера"
                  type="password"
                  autoComplete="off"
                  value={form.apiKey}
                  onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))}
                  className={inputClass}
                  placeholder="Ключ не возвращается браузеру"
                />
              </Field>
            ) : null}
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-neutral-600">
            <input
              aria-label="Выбрать подключение после проверки"
              type="checkbox"
              checked={form.selected}
              onChange={(event) => setForm((current) => ({ ...current, selected: event.target.checked }))}
              className="size-4 accent-neutral-900"
            />
            Выбрать после успешной проверки
          </label>
          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs leading-5 text-blue-800">
            <ShieldCheckIcon className="mr-1 inline size-3.5" />
            MiMo, OpenAI-compatible и Ollama работают server-side. Codex CLI запускается только в изолированном read-only workspace Primary и использует server-side вход ChatGPT.
          </div>
          <ToolFeedback message={message} error={error} />
          <button
            type="button"
            onClick={() => void connect()}
            disabled={busy === "connect"}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
          >
            {busy === "connect" ? <LoaderCircleIcon className="size-4 animate-spin" /> : <KeyRoundIcon className="size-4" />}
            Проверить и подключить
          </button>
        </div>

        <div className="space-y-2">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-neutral-400">
            Подключения
          </div>
          {connections.length ? (
            connections.map((connection) => (
              <ProviderRow
                key={connection.id}
                connection={connection}
                selected={selectedId === connection.id}
                busy={busy}
                onSelect={select}
                onDelete={disconnect}
              />
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-neutral-200 px-3 py-5 text-center text-xs leading-5 text-neutral-500">
              AI-провайдеры ещё не подключены.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function ServiceStatusTool({ status }: { args?: unknown; status?: ToolStatus }) {
  const [state, setState] = useState<{
    loading: boolean;
    backend?: Record<string, unknown>;
    workspace?: WorkspaceSnapshot;
    providers?: { selectedId: string | null; connections: ProviderConnection[] };
    error?: string;
  }>({ loading: true });

  const load = async () => {
    setState({ loading: true });
    try {
      const [backend, workspace, providers] = await Promise.all([
        jsonRequest<{ ok: true } & Record<string, unknown>>("/api/backend/status"),
        jsonRequest<{ ok: true; workspace: WorkspaceSnapshot }>("/api/workspace"),
        jsonRequest<{
          ok: true;
          providers: { selectedId: string | null; connections: ProviderConnection[] };
        }>("/api/providers")
      ]);
      setState({
        loading: false,
        backend,
        workspace: workspace.workspace,
        providers: providers.providers
      });
    } catch (reason) {
      setState({
        loading: false,
        error: reason instanceof Error ? reason.message : "Не удалось проверить сервисы."
      });
    }
  };

  useEffect(() => {
    if (status?.type === "running") return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.type]);

  const selected = useMemo(
    () => state.providers?.connections.find((connection) => connection.id === state.providers?.selectedId),
    [state.providers]
  );
  const database = record(state.backend?.database);
  const localFirst = record(state.backend?.localFirst);

  if (status?.type === "running" || state.loading) {
    return <ServiceLoading label="Проверяем подкапотные сервисы…" />;
  }

  return (
    <section
      className="my-3 w-full max-w-(--thread-max-width) rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5"
      data-testid="service-status-tool"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <ServerIcon className="size-5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-neutral-950">Подкапотные сервисы</h3>
            <p className="mt-0.5 text-xs text-neutral-500">Один чат · отдельные tenant-scoped сервисы</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          aria-label="Повторить проверку сервисов"
          className="flex size-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100"
        >
          <RefreshCwIcon className="size-4" />
        </button>
      </div>
      {state.error ? (
        <ToolFeedback error={state.error} message={null} />
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <ServiceRow
            icon={<DatabaseIcon />}
            title="PostgreSQL"
            detail={database.connected === true ? "Подключён" : String(database.message || "Недоступен")}
            ok={database.connected === true}
          />
          <ServiceRow
            icon={<UserRoundIcon />}
            title="Рабочее пространство"
            detail={state.workspace?.storage === "postgres" ? "Сохраняется на сервере" : "Хранилище недоступно"}
            ok={state.workspace?.storage === "postgres"}
          />
          <ServiceRow
            icon={<BotIcon />}
            title="AI-провайдер"
            detail={selected ? `${selected.name} · ${selected.model || selected.kind}` : "Не выбран"}
            ok={selected?.status === "connected"}
          />
          <ServiceRow
            icon={<Settings2Icon />}
            title="Local-first"
            detail={localFirst.browserCache === "IndexedDB" ? "IndexedDB + outbox" : "Проверьте backend status"}
            ok={localFirst.browserCache === "IndexedDB" && localFirst.wasm === false}
          />
        </div>
      )}
    </section>
  );
}

function providerDefaults(kind: ProviderKind) {
  if (kind === "ollama") {
    return {
      kind,
      name: "Ollama на Primary",
      baseUrl: "http://127.0.0.1:11434",
      model: "gpt-oss:20b",
      apiKey: "",
      selected: true
    };
  }
  if (kind === "openai-compatible") {
    return {
      kind,
      name: "OpenAI-compatible API",
      baseUrl: "https://api.openai.com/v1",
      model: "",
      apiKey: "",
      selected: true
    };
  }
  if (kind === "codex-cli" || kind === "codex-app-server") {
    return {
      kind,
      name: kind === "codex-app-server" ? "Codex App Server · ChatGPT" : "Codex Exec · ChatGPT",
      baseUrl: "",
      model: "",
      apiKey: "",
      selected: true
    };
  }
  if (kind === "rules") {
    return {
      kind,
      name: "Встроенный сметный сервис",
      baseUrl: "",
      model: "prosmet-chief-estimator-v2",
      apiKey: "",
      selected: true
    };
  }
  return {
    kind: "mimo" as const,
    name: "MiMo direct API",
    baseUrl: "",
    model: "mimo-v2.5",
    apiKey: "",
    selected: true
  };
}

function ProviderRow({
  connection,
  selected,
  busy,
  onSelect,
  onDelete
}: {
  connection: ProviderConnection;
  selected: boolean;
  busy: string | null;
  onSelect: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const ok = connection.status === "connected";
  return (
    <article className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
      <div className="flex items-start gap-2">
        <span className={cn("mt-0.5", ok ? "text-emerald-600" : "text-amber-600")}>
          {ok ? <CheckCircle2Icon className="size-4" /> : <CircleAlertIcon className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-medium text-neutral-900">{connection.name}</span>
            {selected ? (
              <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] text-white">Выбран</span>
            ) : null}
          </div>
          <div className="mt-1 truncate text-[11px] text-neutral-500">
            {connection.kind} · {connection.model || "без модели"}
          </div>
          {connection.lastError ? (
            <div className="mt-2 line-clamp-2 text-[11px] leading-4 text-red-600">{connection.lastError}</div>
          ) : null}
          <div className="mt-3 flex gap-2">
            {!selected ? (
              <button
                type="button"
                onClick={() => void onSelect(connection.id)}
                disabled={!ok || busy === `select:${connection.id}`}
                className="h-8 rounded-lg border border-neutral-200 bg-white px-2.5 text-xs font-medium disabled:opacity-40"
              >
                {busy === `select:${connection.id}` ? "Выбираем…" : "Выбрать"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void onDelete(connection.id)}
              disabled={busy === `delete:${connection.id}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
            >
              <Trash2Icon className="size-3.5" /> Отключить
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function ServiceRow({
  icon,
  title,
  detail,
  ok
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-neutral-500 [&_svg]:size-4">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2 text-sm font-medium text-neutral-900">
          <span>{title}</span>
          {ok ? (
            <CheckCircle2Icon className="size-3.5 text-emerald-600" />
          ) : (
            <CircleAlertIcon className="size-3.5 text-amber-600" />
          )}
        </span>
        <span className="mt-1 block text-xs leading-5 text-neutral-500">{detail}</span>
      </span>
    </div>
  );
}

function ServiceLoading({ label }: { label: string }) {
  return (
    <div className="my-3 flex w-full max-w-(--thread-max-width) items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600 shadow-sm">
      <LoaderCircleIcon className="size-4 animate-spin" /> {label}
    </div>
  );
}

function ToolFeedback({ message, error }: { message: string | null; error: string | null }) {
  if (!message && !error) return null;
  return (
    <div
      className={cn(
        "mt-4 rounded-xl border px-3 py-2.5 text-xs leading-5",
        error
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
      )}
    >
      {error || message}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 rounded-lg px-3 transition",
        active ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-900"
      )}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-neutral-600">
      <span className="mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}
