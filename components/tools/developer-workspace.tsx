"use client";

import {
  BotIcon,
  CheckCircle2Icon,
  Code2Icon,
  GitBranchIcon,
  LoaderCircleIcon,
  LockKeyholeIcon,
  NetworkIcon,
  RocketIcon,
  SendIcon,
  ShieldCheckIcon,
  XIcon
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const fallbackPrompt =
  "Приведи рабочую область сметы в порядок, проверь desktop/mobile и подготовь проверяемый релиз.";

type RegistryAgent = {
  id: string;
  name: string;
  role: string;
  description: string;
  skills: string[];
  permissionScopes: string[];
  status: "available" | "disabled";
};

type RegistryPayload = {
  ok?: boolean;
  protocolVersion?: string;
  modeVersion?: string;
  taskCount?: number;
  agents?: RegistryAgent[];
  permissions?: {
    default?: string[];
    ownerApprovable?: string[];
    writeRequiresApproval?: boolean;
    secretsReturnedToBrowser?: boolean;
    auditRequired?: boolean;
  };
};

type DevelopmentPlan = {
  summary: string;
  selectedAgentIds: string[];
  stages: Array<{
    id: string;
    title: string;
    ownerAgentId: string;
    acceptance: string;
  }>;
  acceptanceCriteria: string[];
  requestedPermission: string;
  executionMode: "plan";
};

type DeveloperTask = {
  id: string;
  status: { state: string; timestamp: string };
  artifacts: Array<{
    artifactId: string;
    parts: Array<
      | { kind: "text"; text: string }
      | { kind: "data"; data: DevelopmentPlan }
    >;
  }>;
  metadata: {
    selectedAgentIds: string[];
    requestedPermission: string;
    ownerApprovalRequired: boolean;
  };
};

function taskPlan(task: DeveloperTask | null) {
  if (!task) return null;
  for (const artifact of task.artifacts ?? []) {
    for (const part of artifact.parts ?? []) {
      if (part.kind === "data") return part.data;
    }
  }
  return null;
}

export function DeveloperWorkspace({
  args,
  status
}: {
  args?: unknown;
  status?: { type?: string };
}) {
  const [open, setOpen] = useState(false);
  const [registry, setRegistry] = useState<RegistryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(() => {
    if (args && typeof args === "object" && typeof (args as Record<string, unknown>).focus === "string") {
      return `Продолжи разработку: ${(args as Record<string, unknown>).focus}`;
    }
    return fallbackPrompt;
  });
  const [sending, setSending] = useState(false);
  const [task, setTask] = useState<DeveloperTask | null>(null);
  const running = status?.type === "running" || status?.type === "incomplete";
  const plan = useMemo(() => taskPlan(task), [task]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void fetch("/api/a2a", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal
    })
      .then(async (response) => {
        const payload = (await response.json()) as RegistryPayload & { message?: string };
        if (!response.ok || payload.ok === false) {
          throw new Error(payload.message || "A2A registry is unavailable");
        }
        setRegistry(payload);
        setError(null);
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "Не удалось открыть команду агентов");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const createTask = async () => {
    const value = prompt.trim();
    if (!value || sending) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/a2a", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "message/send",
          params: {
            message: {
              role: "user",
              messageId: `web-${Date.now().toString(36)}`,
              parts: [{ kind: "text", text: value }]
            }
          }
        })
      });
      const payload = (await response.json()) as {
        result?: DeveloperTask;
        error?: { message?: string };
      };
      if (!response.ok || !payload.result) {
        throw new Error(payload.error?.message || "A2A-задача не создана");
      }
      setTask(payload.result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "A2A-задача не создана");
    } finally {
      setSending(false);
    }
  };

  const agents = registry?.agents ?? [];
  const selected = new Set(plan?.selectedAgentIds ?? task?.metadata.selectedAgentIds ?? []);

  return (
    <>
      <section
        className="my-3 w-full max-w-[680px] overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm"
        data-testid="developer-workspace-card"
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-neutral-50"
          disabled={running}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-neutral-950 text-white">
            {running || loading ? (
              <LoaderCircleIcon className="size-4 animate-spin" />
            ) : (
              <NetworkIcon className="size-4" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
              Режим разработчика · A2A
            </span>
            <span className="mt-0.5 block truncate text-sm font-semibold text-neutral-950">
              Команда ИИ-разработчиков Просметчика
            </span>
            <span className="mt-1 block text-xs text-neutral-500">
              {loading
                ? "Подключаем реестр…"
                : error
                  ? "Требуется проверка подключения"
                  : `${agents.length} агентов · задачи из чата · owner-approved выпуск`}
            </span>
          </span>
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-600">
            {registry?.protocolVersion ? `A2A ${registry.protocolVersion}` : "A2A"}
          </span>
        </button>
      </section>

      {open ? (
        <div
          className="fixed inset-0 z-[150] bg-black/25 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-label="Режим разработчика"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <aside className="prosmet-scrollbar absolute inset-x-0 bottom-0 flex max-h-[94dvh] flex-col overflow-hidden rounded-t-3xl border border-neutral-200 bg-[#f7f7f8] shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:h-dvh md:max-h-none md:w-[620px] md:rounded-none md:border-y-0 md:border-r-0">
            <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-4 md:px-5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-neutral-950 text-white">
                <NetworkIcon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold">Команда разработки</h2>
                <p className="mt-0.5 text-xs text-neutral-500">
                  A2A {registry?.protocolVersion || "0.3.0"} · план → проверка → owner approval → выпуск
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex size-9 items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950"
                aria-label="Закрыть режим разработчика"
              >
                <XIcon className="size-4" />
              </button>
            </header>

            <div className="prosmet-scrollbar min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
              <section className="rounded-2xl border border-neutral-200 bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Code2Icon className="size-4" /> Новая A2A-задача
                </div>
                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  Опишите наблюдаемый результат. Координатор подберёт команду, критерии приёмки и требуемые права.
                </p>
                <textarea
                  className="prosmet-input mt-3 min-h-28 resize-y py-2.5"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  aria-label="Задача команде разработчиков"
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                    <LockKeyholeIcon className="size-3.5" /> Запись и деплой требуют подтверждения владельца
                  </span>
                  <button
                    type="button"
                    onClick={() => void createTask()}
                    disabled={!prompt.trim() || sending}
                    className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white hover:bg-black disabled:opacity-40"
                  >
                    {sending ? (
                      <LoaderCircleIcon className="size-4 animate-spin" />
                    ) : (
                      <SendIcon className="size-4" />
                    )}
                    Сформировать план
                  </button>
                </div>
              </section>

              {error ? (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700">
                  {error}
                </div>
              ) : null}

              {plan ? (
                <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4" data-testid="developer-task-plan">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-600">
                        План готов
                      </div>
                      <h3 className="mt-1 text-sm font-semibold leading-5">{plan.summary}</h3>
                    </div>
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700">
                      право: {plan.requestedPermission}
                    </span>
                  </div>
                  <ol className="mt-4 grid gap-2">
                    {plan.stages.map((stage, index) => (
                      <li key={stage.id} className="flex gap-3 rounded-xl bg-neutral-50 p-3">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[10px] font-semibold text-white">
                          {index + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-neutral-900">{stage.title}</span>
                          <span className="mt-1 block text-[11px] leading-5 text-neutral-500">
                            {stage.acceptance}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}

              <section className="mt-4">
                <div className="mb-2 flex items-center justify-between px-1">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
                    Агенты
                  </h3>
                  <span className="text-xs text-neutral-400">{agents.length || "—"}</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {loading
                    ? Array.from({ length: 6 }, (_, index) => (
                        <div key={index} className="h-28 animate-pulse rounded-2xl bg-neutral-200/60" />
                      ))
                    : agents.map((agent) => (
                        <article
                          key={agent.id}
                          className={`rounded-2xl border bg-white p-3.5 ${
                            selected.has(agent.id)
                              ? "border-neutral-900 ring-1 ring-neutral-900"
                              : "border-neutral-200"
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600">
                              <BotIcon className="size-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <h4 className="truncate text-xs font-semibold">{agent.name}</h4>
                                {selected.has(agent.id) ? (
                                  <CheckCircle2Icon className="size-3.5 shrink-0 text-emerald-600" />
                                ) : null}
                              </div>
                              <p className="mt-0.5 text-[10px] text-neutral-500">{agent.role}</p>
                            </div>
                          </div>
                          <p className="mt-2 line-clamp-3 text-[11px] leading-5 text-neutral-600">
                            {agent.description}
                          </p>
                        </article>
                      ))}
                </div>
              </section>

              <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheckIcon className="size-4 text-emerald-600" /> Контур прав
                </div>
                <div className="mt-3 grid gap-2 text-xs text-neutral-600 sm:grid-cols-3">
                  <Permission icon={<BotIcon />} title="По умолчанию" value="read · propose" />
                  <Permission icon={<GitBranchIcon />} title="По подтверждению" value="code · git" />
                  <Permission icon={<RocketIcon />} title="Релизный gate" value="test · deploy" />
                </div>
                <p className="mt-3 text-[11px] leading-5 text-neutral-500">
                  Секреты остаются на сервере. Любая операция изменения кода или production-релиза должна быть привязана к владельцу, задаче, точному SHA и аудиту.
                </p>
              </section>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function Permission({
  icon,
  title,
  value
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-neutral-50 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-900">
        <span className="text-neutral-500 [&_svg]:size-3.5">{icon}</span>
        {title}
      </div>
      <div className="mt-1 text-[10px] text-neutral-500">{value}</div>
    </div>
  );
}
