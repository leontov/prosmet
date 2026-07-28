"use client";

import { useAuiState } from "@assistant-ui/react";
import {
  ActivityIcon,
  BotIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  DatabaseIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderOpenIcon,
  HardDriveIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  ServerIcon,
  XIcon
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRuntimeStatus } from "@/components/app/runtime-status";
import { useLocalWorkspace } from "@/lib/local/context";
import {
  getRepository,
  type LocalDocument,
  type LocalPrice
} from "@/lib/local/repository";
import type { EstimateDraft } from "@/lib/domain/estimate";
import { cn } from "@/lib/utils";

type InspectorTab = "context" | "artifacts" | "activity";

type ArtifactState = {
  estimates: EstimateDraft[];
  documents: LocalDocument[];
  prices: LocalPrice[];
  loading: boolean;
};

const emptyArtifacts: ArtifactState = {
  estimates: [],
  documents: [],
  prices: [],
  loading: true
};

export function RightInspector({ onClose }: { onClose: () => void }) {
  const workspace = useLocalWorkspace();
  const runtime = useRuntimeStatus();
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const messageCount = useAuiState((state) => state.thread.messages.length);
  const [tab, setTab] = useState<InspectorTab>("context");
  const [artifacts, setArtifacts] = useState<ArtifactState>(emptyArtifacts);

  const currentThread = useMemo(
    () => workspace.threads.find((thread) => thread.id === workspace.currentThreadId),
    [workspace.currentThreadId, workspace.threads]
  );

  useEffect(() => {
    if (!workspace.ready) return;
    let cancelled = false;
    setArtifacts((current) => ({ ...current, loading: true }));
    void (async () => {
      try {
        const repository = await getRepository();
        const [estimates, documents, prices] = await Promise.all([
          repository.listEstimates(),
          repository.listDocuments(),
          repository.listPrices()
        ]);
        if (!cancelled) setArtifacts({ estimates, documents, prices, loading: false });
      } catch {
        if (!cancelled) {
          setArtifacts({ estimates: [], documents: [], prices: [], loading: false });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspace.currentThreadId, workspace.ready, workspace.threads.length]);

  return (
    <aside
      className="flex h-full w-[338px] shrink-0 flex-col border-l border-neutral-200 bg-[#fbfbfc] text-neutral-900"
      data-testid="right-inspector"
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-neutral-200 px-3">
        <div className="flex items-center gap-2">
          <FolderOpenIcon className="size-4 text-neutral-500" />
          <span className="text-sm font-semibold">Рабочий контекст</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex size-8 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
          aria-label="Скрыть правую панель"
        >
          <XIcon className="size-4" />
        </button>
      </header>

      <div className="flex shrink-0 gap-1 border-b border-neutral-200 px-2 py-2">
        <InspectorTabButton active={tab === "context"} onClick={() => setTab("context")}>
          Контекст
        </InspectorTabButton>
        <InspectorTabButton active={tab === "artifacts"} onClick={() => setTab("artifacts")}>
          Артефакты
        </InspectorTabButton>
        <InspectorTabButton active={tab === "activity"} onClick={() => setTab("activity")}>
          Работа
        </InspectorTabButton>
      </div>

      <div className="prosmet-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "context" && (
          <div className="space-y-3">
            <InspectorSection title="Текущая задача">
              <div className="rounded-xl border border-neutral-200 bg-white p-3">
                <div className="truncate text-sm font-medium">
                  {currentThread?.title || "Новая задача"}
                </div>
                <div className="mt-1 truncate text-xs text-neutral-500">
                  {currentThread?.objectName || "Объект ещё не определён"}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
                  <span>Сообщений</span>
                  <span className="font-medium text-neutral-800">{messageCount}</span>
                </div>
              </div>
            </InspectorSection>

            <InspectorSection title="Сервер">
              <StatusRow
                icon={<ServerIcon />}
                title="Next.js API"
                detail="AG-UI SSE · /api/agent"
                status={runtime.backend.loading ? "loading" : runtime.backend.ok ? "ok" : "error"}
              />
              <StatusRow
                icon={<DatabaseIcon />}
                title="PostgreSQL"
                detail={
                  runtime.backend.databaseConnected
                    ? `Подключено${
                        runtime.backend.databaseLatencyMs != null
                          ? ` · ${runtime.backend.databaseLatencyMs} мс`
                          : ""
                      }`
                    : runtime.backend.databaseConfigured
                      ? runtime.backend.message || "Ошибка подключения"
                      : "Не настроено"
                }
                status={
                  runtime.backend.loading
                    ? "loading"
                    : runtime.backend.databaseConnected
                      ? "ok"
                      : runtime.backend.databaseConfigured
                        ? "error"
                        : "warning"
                }
              />
              <StatusRow
                icon={<BotIcon />}
                title="AI-провайдер"
                detail={runtime.backend.provider}
                status={runtime.backend.ok ? "ok" : "warning"}
              />
            </InspectorSection>

            <InspectorSection title="Локальный кэш">
              <StatusRow
                icon={<HardDriveIcon />}
                title="IndexedDB"
                detail={workspace.ready ? "Локальный кэш готов" : workspace.error || "Инициализация…"}
                status={workspace.ready ? "ok" : workspace.error ? "error" : "loading"}
              />
              <StatusRow
                icon={<RefreshCwIcon />}
                title="Синхронизация"
                detail={syncLabel(runtime.sync)}
                status={syncTone(runtime.sync)}
                action={() => void runtime.syncNow()}
              />
            </InspectorSection>
          </div>
        )}

        {tab === "artifacts" && (
          <div className="space-y-3">
            {artifacts.loading ? (
              <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white p-3 text-sm text-neutral-500">
                <LoaderCircleIcon className="size-4 animate-spin" /> Загружаем локальный кэш…
              </div>
            ) : (
              <>
                <ArtifactSummary
                  icon={<FileSpreadsheetIcon />}
                  title="Сметы"
                  count={artifacts.estimates.length}
                  items={artifacts.estimates.slice(0, 4).map((estimate) => estimate.title)}
                />
                <ArtifactSummary
                  icon={<FileTextIcon />}
                  title="Документы"
                  count={artifacts.documents.length}
                  items={artifacts.documents.slice(0, 4).map((document) => document.title)}
                />
                <ArtifactSummary
                  icon={<DatabaseIcon />}
                  title="Подтверждённые цены"
                  count={artifacts.prices.filter((price) => price.status === "confirmed").length}
                  items={artifacts.prices
                    .slice(0, 4)
                    .map(
                      (price) =>
                        `${price.name} · ${price.price.toLocaleString("ru-RU")} ${price.currency}`
                    )}
                />
              </>
            )}
          </div>
        )}

        {tab === "activity" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-neutral-200 bg-white p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                {isRunning ? (
                  <LoaderCircleIcon className="size-4 animate-spin text-blue-600" />
                ) : (
                  <CheckCircle2Icon className="size-4 text-emerald-600" />
                )}
                {isRunning ? "Просметчик работает" : "Нет активного запуска"}
              </div>
              <p className="mt-2 text-xs leading-5 text-neutral-500">
                Здесь отображается безопасный рабочий статус: анализ исходных данных,
                технология, цены, проверка и подготовка документов. Внутренние рассуждения
                модели не показываются.
              </p>
            </div>
            <StatusRow
              icon={<ActivityIcon />}
              title="Поток ответа"
              detail={isRunning ? "AG-UI события поступают" : "Ожидает новый запрос"}
              status={isRunning ? "loading" : "ok"}
            />
          </div>
        )}
      </div>
    </aside>
  );
}

function InspectorTabButton({
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
        "h-8 flex-1 rounded-lg px-2 text-xs font-medium transition",
        active
          ? "bg-white text-neutral-900 shadow-sm ring-1 ring-neutral-200"
          : "text-neutral-500 hover:bg-white/70 hover:text-neutral-900"
      )}
    >
      {children}
    </button>
  );
}

function InspectorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function StatusRow({
  icon,
  title,
  detail,
  status,
  action
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  status: "ok" | "loading" | "warning" | "error";
  action?: () => void;
}) {
  const marker =
    status === "loading" ? (
      <LoaderCircleIcon className="size-3.5 animate-spin text-blue-600" />
    ) : status === "ok" ? (
      <CheckCircle2Icon className="size-3.5 text-emerald-600" />
    ) : status === "warning" ? (
      <CircleAlertIcon className="size-3.5 text-amber-600" />
    ) : (
      <CircleAlertIcon className="size-3.5 text-red-600" />
    );

  return (
    <button
      type="button"
      onClick={action}
      disabled={!action}
      className="flex w-full items-start gap-3 rounded-xl border border-neutral-200 bg-white p-3 text-left disabled:cursor-default"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500 [&_svg]:size-4">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2 text-sm font-medium">
          <span className="truncate">{title}</span>
          {marker}
        </span>
        <span className="mt-1 block break-words text-xs leading-5 text-neutral-500">
          {detail}
        </span>
      </span>
    </button>
  );
}

function ArtifactSummary({
  icon,
  title,
  count,
  items
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  items: string[];
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="text-neutral-500 [&_svg]:size-4">{icon}</span>
        <span className="flex-1">{title}</span>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
          {count}
        </span>
      </div>
      <div className="mt-3 space-y-1.5">
        {items.length ? (
          items.map((item) => (
            <div
              key={item}
              className="truncate rounded-lg bg-neutral-50 px-2.5 py-2 text-xs text-neutral-600"
            >
              {item}
            </div>
          ))
        ) : (
          <p className="text-xs leading-5 text-neutral-400">Пока нет сохранённых данных.</p>
        )}
      </div>
    </section>
  );
}

function syncLabel(sync: ReturnType<typeof useRuntimeStatus>["sync"]) {
  if (sync.state === "syncing") return `Синхронизация · в очереди ${sync.pending}`;
  if (sync.state === "synced") {
    return `Синхронизировано · отправлено ${sync.pushed}, получено ${sync.pulled}`;
  }
  if (sync.state === "offline") return `Офлайн · в очереди ${sync.pending}`;
  if (sync.state === "error") return `${sync.message} · в очереди ${sync.pending}`;
  return `Готово · в очереди ${sync.pending}`;
}

function syncTone(
  sync: ReturnType<typeof useRuntimeStatus>["sync"]
): "ok" | "loading" | "warning" | "error" {
  if (sync.state === "syncing") return "loading";
  if (sync.state === "error") return "error";
  if (sync.state === "offline") return "warning";
  return "ok";
}
