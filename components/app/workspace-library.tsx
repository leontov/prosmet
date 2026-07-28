"use client";

import {
  ArrowRightIcon,
  BadgeCheckIcon,
  Building2Icon,
  CheckIcon,
  CircleDollarSignIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderKanbanIcon,
  LoaderCircleIcon,
  MessageSquareTextIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Settings2Icon,
  UserRoundIcon
} from "lucide-react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState
} from "react";
import { calculateEstimate } from "@/lib/domain/estimate";
import {
  listEstimateEntries,
  type LocalEstimateEntry
} from "@/lib/local/catalog";
import { useLocalWorkspace } from "@/lib/local/context";
import {
  getRepository,
  type LocalDocument,
  type LocalPrice,
  type LocalThread
} from "@/lib/local/repository";
import { cn, formatDate, formatMoney } from "@/lib/utils";

export type WorkspaceView =
  | "chat"
  | "objects"
  | "estimates"
  | "documents"
  | "prices"
  | "settings"
  | "profile";

export type LibraryView = Exclude<WorkspaceView, "chat">;

type DataState = {
  estimates: LocalEstimateEntry[];
  documents: LocalDocument[];
  prices: LocalPrice[];
  loading: boolean;
  error: string | null;
};

type ObjectEntry = {
  thread: LocalThread;
  title: string;
  estimates: number;
  documents: number;
  total: number;
  currency: string;
  updatedAt: string;
};

const inputClass =
  "h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400 focus:bg-white";

const viewText = {
  objects: {
    title: "Объекты",
    description:
      "Объект создаётся из первого сообщения и связывает исходный чат, сметы и документы.",
    action: "Новый объект в чате"
  },
  estimates: {
    title: "Сметы",
    description: "Все сметы, версии, статусы, суммы и исходные диалоги.",
    action: "Создать смету в чате"
  },
  documents: {
    title: "Документы",
    description: "Коммерческие предложения, договоры, акты и печатные формы.",
    action: "Создать документ в чате"
  },
  prices: {
    title: "Каталог цен",
    description:
      "Подтверждённые личные цены автоматически повторно используются в новых сметах.",
    action: "Подобрать цены в чате"
  }
} as const;

export function WorkspaceLibrary({
  view,
  onOpenThread,
  onStartNew,
  onNavigate
}: {
  view: LibraryView;
  onOpenThread: (threadId: string) => Promise<void> | void;
  onStartNew: () => Promise<void> | void;
  onNavigate: (view: WorkspaceView) => void;
}) {
  if (view === "profile") {
    return <ProfileView onBack={() => onNavigate("chat")} />;
  }
  if (view === "settings") {
    return <SettingsView onBack={() => onNavigate("chat")} />;
  }
  return (
    <CollectionView
      view={view}
      onOpenThread={onOpenThread}
      onStartNew={onStartNew}
    />
  );
}

function CollectionView({
  view,
  onOpenThread,
  onStartNew
}: {
  view: "objects" | "estimates" | "documents" | "prices";
  onOpenThread: (threadId: string) => Promise<void> | void;
  onStartNew: () => Promise<void> | void;
}) {
  const workspace = useLocalWorkspace();
  const [data, setData] = useState<DataState>({
    estimates: [],
    documents: [],
    prices: [],
    loading: true,
    error: null
  });
  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase("ru-RU"));

  const load = useCallback(async () => {
    if (!workspace.ready) return;
    setData((current) => ({ ...current, loading: true, error: null }));
    try {
      const repository = await getRepository();
      const [estimates, documents, prices] = await Promise.all([
        listEstimateEntries(),
        repository.listDocuments(),
        repository.listPrices()
      ]);
      setData({ estimates, documents, prices, loading: false, error: null });
    } catch (error) {
      setData((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "Не удалось прочитать локальные данные"
      }));
    }
  }, [workspace.ready]);

  useEffect(() => {
    void load();
  }, [load, view, workspace.threads.length]);

  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("prosmet:local-data-changed", refresh);
    return () => window.removeEventListener("prosmet:local-data-changed", refresh);
  }, [load]);

  const estimatesById = useMemo(
    () => new Map(data.estimates.map((entry) => [entry.id, entry])),
    [data.estimates]
  );

  const objects = useMemo<ObjectEntry[]>(() => {
    const map = new Map<string, ObjectEntry>();
    for (const thread of workspace.threads) {
      map.set(thread.id, {
        thread,
        title: thread.objectName || thread.title || "Объект без названия",
        estimates: 0,
        documents: 0,
        total: 0,
        currency: "RUB",
        updatedAt: thread.updatedAt
      });
    }
    for (const estimate of data.estimates) {
      if (!estimate.threadId) continue;
      const current = map.get(estimate.threadId);
      const thread =
        current?.thread ??
        ({
          id: estimate.threadId,
          title: estimate.title,
          objectName: estimate.draft.objectName,
          status: "active",
          pinned: false,
          createdAt: estimate.createdAt,
          updatedAt: estimate.updatedAt
        } satisfies LocalThread);
      map.set(estimate.threadId, {
        thread,
        title:
          thread.objectName ||
          estimate.draft.objectName ||
          current?.title ||
          estimate.title,
        estimates: (current?.estimates ?? 0) + 1,
        documents: current?.documents ?? 0,
        total: (current?.total ?? 0) + calculateEstimate(estimate.draft).total,
        currency: estimate.draft.currency,
        updatedAt:
          estimate.updatedAt > (current?.updatedAt ?? "")
            ? estimate.updatedAt
            : current?.updatedAt ?? estimate.updatedAt
      });
    }
    for (const documentValue of data.documents) {
      if (!documentValue.threadId) continue;
      const current = map.get(documentValue.threadId);
      if (!current) continue;
      map.set(documentValue.threadId, {
        ...current,
        documents: current.documents + 1,
        updatedAt:
          documentValue.updatedAt > current.updatedAt
            ? documentValue.updatedAt
            : current.updatedAt
      });
    }
    return [...map.values()].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt)
    );
  }, [data.documents, data.estimates, workspace.threads]);

  const filteredObjects = useMemo(
    () => objects.filter((entry) => match(deferredQuery, entry.title, entry.thread.title)),
    [deferredQuery, objects]
  );
  const filteredEstimates = useMemo(
    () =>
      data.estimates.filter((entry) =>
        match(
          deferredQuery,
          entry.title,
          entry.draft.objectName,
          entry.draft.region,
          entry.draft.status
        )
      ),
    [data.estimates, deferredQuery]
  );
  const filteredDocuments = useMemo(
    () =>
      data.documents.filter((entry) =>
        match(deferredQuery, entry.title, entry.type, entry.status)
      ),
    [data.documents, deferredQuery]
  );
  const filteredPrices = useMemo(
    () =>
      data.prices.filter((entry) =>
        match(
          deferredQuery,
          entry.name,
          entry.code,
          entry.region,
          entry.source.label,
          entry.status
        )
      ),
    [data.prices, deferredQuery]
  );

  const count =
    view === "objects"
      ? filteredObjects.length
      : view === "estimates"
        ? filteredEstimates.length
        : view === "documents"
          ? filteredDocuments.length
          : filteredPrices.length;
  const copy = viewText[view];

  const exportEstimate = async (
    entry: LocalEstimateEntry,
    format: "pdf" | "xlsx"
  ) => {
    const key = `${entry.id}:${format}`;
    setExporting(key);
    try {
      const exports = await import("@/lib/exports/estimate");
      if (format === "pdf") await exports.exportEstimatePdf(entry.draft);
      else await exports.exportEstimateXlsx(entry.draft);
    } finally {
      setExporting(null);
    }
  };

  return (
    <section
      className="prosmet-scrollbar h-full overflow-y-auto bg-[#fafafa]"
      data-testid={`${view}-view`}
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-600 shadow-sm">
              {viewIcon(view)}
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-[-0.035em] text-neutral-950">
                {copy.title}
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-500">
                {copy.description}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void onStartNew()}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-black"
          >
            <PlusIcon className="size-4" /> {copy.action}
          </button>
        </header>

        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Поиск: ${copy.title.toLocaleLowerCase("ru-RU")}`}
              aria-label={`Поиск: ${copy.title.toLocaleLowerCase("ru-RU")}`}
              className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-10 pr-3 text-sm outline-none transition focus:border-neutral-400 focus:bg-white"
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span className="rounded-full bg-neutral-100 px-2.5 py-1">Найдено: {count}</span>
            <button
              type="button"
              onClick={() => void load()}
              disabled={data.loading}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 transition hover:bg-neutral-100 disabled:opacity-50"
            >
              <RefreshCwIcon className={cn("size-3.5", data.loading && "animate-spin")} />
              Обновить
            </button>
          </div>
        </div>

        {data.error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {data.error}
          </div>
        ) : null}

        {data.loading ? (
          <LoadingCard label="Загружаем локальные данные…" />
        ) : view === "objects" ? (
          <ObjectsGrid entries={filteredObjects} onOpenThread={onOpenThread} onStartNew={onStartNew} />
        ) : view === "estimates" ? (
          <EstimatesList
            entries={filteredEstimates}
            exporting={exporting}
            onOpenThread={onOpenThread}
            onExport={exportEstimate}
          />
        ) : view === "documents" ? (
          <DocumentsList entries={filteredDocuments} onOpenThread={onOpenThread} />
        ) : (
          <PricesList
            entries={filteredPrices}
            estimatesById={estimatesById}
            onOpenThread={onOpenThread}
          />
        )}
      </div>
    </section>
  );
}

function ObjectsGrid({
  entries,
  onOpenThread,
  onStartNew
}: {
  entries: ObjectEntry[];
  onOpenThread: (threadId: string) => Promise<void> | void;
  onStartNew: () => Promise<void> | void;
}) {
  if (!entries.length) {
    return (
      <EmptyState
        icon={<FolderKanbanIcon />}
        title="Объектов пока нет"
        detail="Напишите первое сообщение о работах — объект появится здесь автоматически."
        action="Создать объект в чате"
        onAction={onStartNew}
      />
    );
  }
  return (
    <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {entries.map((entry) => (
        <button
          key={entry.thread.id}
          type="button"
          onClick={() => void onOpenThread(entry.thread.id)}
          className="group rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md"
        >
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#eef1ff] text-[#4457a8]">
              <Building2Icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-neutral-900">
                {entry.title}
              </span>
              <span className="mt-1 block truncate text-xs text-neutral-500">
                {entry.thread.title || "Чат объекта"}
              </span>
            </span>
            <ArrowRightIcon className="mt-1 size-4 text-neutral-300 transition group-hover:translate-x-0.5 group-hover:text-neutral-700" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Metric label="Сметы" value={entry.estimates} />
            <Metric label="Документы" value={entry.documents} />
            <Metric
              label="Статус"
              value={entry.thread.status === "archived" ? "Архив" : "Активен"}
            />
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3 text-xs text-neutral-500">
            <span>{entry.total > 0 ? formatMoney(entry.total, entry.currency) : "Без расчёта"}</span>
            <span>{formatDate(entry.updatedAt)}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function EstimatesList({
  entries,
  exporting,
  onOpenThread,
  onExport
}: {
  entries: LocalEstimateEntry[];
  exporting: string | null;
  onOpenThread: (threadId: string) => Promise<void> | void;
  onExport: (entry: LocalEstimateEntry, format: "pdf" | "xlsx") => Promise<void>;
}) {
  if (!entries.length) {
    return (
      <EmptyState
        icon={<FileSpreadsheetIcon />}
        title="Смет пока нет"
        detail="Создайте смету сообщением. Она сохранится здесь и останется связанной с исходным чатом."
      />
    );
  }
  return (
    <div className="mt-6 space-y-3">
      {entries.map((entry) => (
        <article key={entry.id} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <FileSpreadsheetIcon className="size-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-sm font-semibold text-neutral-900">{entry.title}</h2>
                  <EstimateStatus status={entry.status} />
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">
                    Версия {entry.revision}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-neutral-500">
                  {entry.draft.objectName || "Объект не указан"} · {entry.draft.region || "Регион не указан"}
                </p>
                <p className="mt-2 text-lg font-semibold tracking-[-0.02em] text-neutral-950">
                  {formatMoney(calculateEstimate(entry.draft).total, entry.draft.currency)}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton
                label="PDF"
                busy={exporting === `${entry.id}:pdf`}
                onClick={() => void onExport(entry, "pdf")}
              />
              <ActionButton
                label="XLSX"
                busy={exporting === `${entry.id}:xlsx`}
                onClick={() => void onExport(entry, "xlsx")}
              />
              <button
                type="button"
                disabled={!entry.threadId}
                onClick={() => entry.threadId && void onOpenThread(entry.threadId)}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                <MessageSquareTextIcon className="size-4" /> Открыть в чате
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
            <span>Разделов: {entry.draft.sections.length}</span>
            <span>
              Позиций: {entry.draft.sections.reduce((sum, section) => sum + section.items.length, 0)}
            </span>
            <span>Изменено: {formatDate(entry.updatedAt)}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function DocumentsList({
  entries,
  onOpenThread
}: {
  entries: LocalDocument[];
  onOpenThread: (threadId: string) => Promise<void> | void;
}) {
  if (!entries.length) {
    return (
      <EmptyState
        icon={<FileTextIcon />}
        title="Документов пока нет"
        detail="После сметы попросите в том же чате сделать коммерческое предложение, договор или акт."
      />
    );
  }
  return (
    <div className="mt-6 grid gap-3 lg:grid-cols-2">
      {entries.map((entry) => (
        <article key={entry.id} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <FileTextIcon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-sm font-semibold text-neutral-900">{entry.title}</h2>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px]",
                    entry.status === "approved"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-neutral-100 text-neutral-600"
                  )}
                >
                  {entry.status === "approved" ? "Утверждён" : "Черновик"}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                {documentType(entry.type)} · версия {entry.revision}
              </p>
              <p className="mt-3 line-clamp-3 text-xs leading-5 text-neutral-500">
                {stripHtml(entry.content) || "Документ без текста"}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-3">
            <span className="text-xs text-neutral-500">{formatDate(entry.updatedAt)}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => downloadDocument(entry)}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-neutral-200 px-3 text-sm font-medium hover:bg-neutral-50"
              >
                <DownloadIcon className="size-4" /> DOC
              </button>
              <button
                type="button"
                disabled={!entry.threadId}
                onClick={() => entry.threadId && void onOpenThread(entry.threadId)}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                <MessageSquareTextIcon className="size-4" /> Открыть чат
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function PricesList({
  entries,
  estimatesById,
  onOpenThread
}: {
  entries: LocalPrice[];
  estimatesById: Map<string, LocalEstimateEntry>;
  onOpenThread: (threadId: string) => Promise<void> | void;
}) {
  if (!entries.length) {
    return (
      <EmptyState
        icon={<CircleDollarSignIcon />}
        title="Каталог цен пуст"
        detail="Утвердите смету — её проверенные позиции автоматически попадут в личный каталог."
      />
    );
  }
  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div className="hidden grid-cols-[minmax(0,1.6fr)_90px_120px_minmax(0,1fr)_120px] gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-neutral-400 md:grid">
        <span>Позиция</span>
        <span>Единица</span>
        <span>Цена</span>
        <span>Источник</span>
        <span>Статус</span>
      </div>
      <div className="divide-y divide-neutral-100">
        {entries.map((entry) => {
          const estimateId = entry.id.startsWith("estimate:")
            ? entry.id.split(":")[1]
            : undefined;
          const estimate = estimateId ? estimatesById.get(estimateId) : undefined;
          return (
            <article
              key={entry.id}
              className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.6fr)_90px_120px_minmax(0,1fr)_120px] md:items-center"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-neutral-900">{entry.name}</div>
                <div className="mt-1 truncate text-xs text-neutral-500">
                  {entry.region || "Регион не указан"} · {formatDate(entry.updatedAt)}
                </div>
              </div>
              <div className="text-sm text-neutral-600">{entry.unit}</div>
              <div className="text-sm font-semibold text-neutral-900">
                {formatMoney(entry.price, entry.currency)}
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs text-neutral-700">{entry.source.label}</div>
                <div className="mt-1 text-[11px] text-neutral-500">
                  Уверенность {entry.source.confidence}%
                </div>
              </div>
              <div>
                <span
                  className={cn(
                    "inline-flex rounded-full px-2 py-1 text-[11px] font-medium",
                    entry.status === "confirmed"
                      ? "bg-emerald-50 text-emerald-700"
                      : entry.status === "expired"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-neutral-100 text-neutral-600"
                  )}
                >
                  {entry.status === "confirmed"
                    ? "Подтверждена"
                    : entry.status === "expired"
                      ? "Устарела"
                      : "Черновик"}
                </span>
                {estimate?.threadId ? (
                  <button
                    type="button"
                    onClick={() => void onOpenThread(estimate.threadId!)}
                    className="mt-2 block text-xs font-medium text-neutral-700 underline decoration-neutral-300 underline-offset-4 hover:text-black"
                  >
                    Исходная смета
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ProfileView({ onBack }: { onBack: () => void }) {
  const [form, setForm] = useState({
    name: "",
    legalForm: "organization",
    organization: "",
    region: ""
  });
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const repository = await getRepository();
      const [name, legalForm, organization, region] = await Promise.all([
        repository.getMeta("profile.name"),
        repository.getMeta("profile.legal-form"),
        repository.getMeta("profile.organization"),
        repository.getMeta("profile.region")
      ]);
      if (!cancelled) {
        setForm({
          name: name ?? "",
          legalForm: legalForm ?? "organization",
          organization: organization ?? "",
          region: region ?? ""
        });
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    const repository = await getRepository();
    await Promise.all([
      repository.setMeta("profile.name", form.name.trim()),
      repository.setMeta("profile.legal-form", form.legalForm),
      repository.setMeta("profile.organization", form.organization.trim()),
      repository.setMeta("profile.region", form.region.trim())
    ]);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  return (
    <FormShell
      testId="profile-view"
      icon={<UserRoundIcon />}
      title="Профиль и организация"
      description="Данные рабочего пространства используются при подготовке смет и документов."
      onBack={onBack}
    >
      {loading ? (
        <LoadingCard label="Загружаем профиль…" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <FormCard title="Пользователь">
            <Field label="Имя">
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className={inputClass}
                placeholder="Владислав"
              />
            </Field>
            <Field label="Статус">
              <select
                value={form.legalForm}
                onChange={(event) =>
                  setForm((current) => ({ ...current, legalForm: event.target.value }))
                }
                className={inputClass}
              >
                <option value="organization">Организация</option>
                <option value="ip">Индивидуальный предприниматель</option>
                <option value="self-employed">Самозанятый</option>
                <option value="specialist">Частный специалист</option>
              </select>
            </Field>
          </FormCard>
          <FormCard title="Рабочее пространство">
            <Field label="Название организации или бренда">
              <input
                value={form.organization}
                onChange={(event) =>
                  setForm((current) => ({ ...current, organization: event.target.value }))
                }
                className={inputClass}
                placeholder="Просметчик"
              />
            </Field>
            <Field label="Основной регион">
              <input
                value={form.region}
                onChange={(event) => setForm((current) => ({ ...current, region: event.target.value }))}
                className={inputClass}
                placeholder="Республика Татарстан"
              />
            </Field>
          </FormCard>
          <SaveButton saved={saved} onClick={save} label="Сохранить профиль" />
        </div>
      )}
    </FormShell>
  );
}

function SettingsView({ onBack }: { onBack: () => void }) {
  const [form, setForm] = useState({
    region: "",
    method: "commercial",
    currency: "RUB",
    vat: "0",
    autoSync: true
  });
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const repository = await getRepository();
      const [region, method, currency, vat, autoSync] = await Promise.all([
        repository.getMeta("settings.region"),
        repository.getMeta("settings.method"),
        repository.getMeta("settings.currency"),
        repository.getMeta("settings.vat"),
        repository.getMeta("settings.auto-sync")
      ]);
      if (!cancelled) {
        setForm({
          region: region ?? "",
          method: method ?? "commercial",
          currency: currency ?? "RUB",
          vat: vat ?? "0",
          autoSync: autoSync !== "false"
        });
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    const repository = await getRepository();
    await Promise.all([
      repository.setMeta("settings.region", form.region.trim()),
      repository.setMeta("settings.method", form.method),
      repository.setMeta("settings.currency", form.currency),
      repository.setMeta("settings.vat", form.vat),
      repository.setMeta("settings.auto-sync", String(form.autoSync))
    ]);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  return (
    <FormShell
      testId="settings-view"
      icon={<Settings2Icon />}
      title="Настройки Просметчика"
      description="Значения по умолчанию для новых смет и синхронизации."
      onBack={onBack}
    >
      {loading ? (
        <LoadingCard label="Загружаем настройки…" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <FormCard title="Сметные настройки">
            <Field label="Регион по умолчанию">
              <input
                value={form.region}
                onChange={(event) => setForm((current) => ({ ...current, region: event.target.value }))}
                className={inputClass}
                placeholder="Республика Татарстан"
              />
            </Field>
            <Field label="Метод расчёта">
              <select
                value={form.method}
                onChange={(event) => setForm((current) => ({ ...current, method: event.target.value }))}
                className={inputClass}
              >
                <option value="commercial">Коммерческий</option>
                <option value="resource">Ресурсный</option>
                <option value="resource-index">Ресурсно-индексный</option>
                <option value="base-index">Базисно-индексный</option>
                <option value="mixed">Смешанный</option>
              </select>
            </Field>
          </FormCard>
          <FormCard title="Финансы и синхронизация">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Валюта">
                <select
                  value={form.currency}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, currency: event.target.value }))
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
                  value={form.vat}
                  onChange={(event) => setForm((current) => ({ ...current, vat: event.target.value }))}
                  inputMode="decimal"
                  className={inputClass}
                />
              </Field>
            </div>
            <label className="flex items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm">
              <span>
                <span className="block font-medium text-neutral-900">Автоматическая синхронизация</span>
                <span className="mt-0.5 block text-xs text-neutral-500">
                  Отправлять outbox в PostgreSQL при наличии сети
                </span>
              </span>
              <input
                type="checkbox"
                checked={form.autoSync}
                onChange={(event) =>
                  setForm((current) => ({ ...current, autoSync: event.target.checked }))
                }
                className="size-4 accent-neutral-900"
              />
            </label>
          </FormCard>
          <SaveButton saved={saved} onClick={save} label="Сохранить настройки" />
        </div>
      )}
    </FormShell>
  );
}

function FormShell({
  testId,
  icon,
  title,
  description,
  onBack,
  children
}: {
  testId: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="prosmet-scrollbar h-full overflow-y-auto bg-[#fafafa]" data-testid={testId}>
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
        <header className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-600 shadow-sm [&_svg]:size-5">
              {icon}
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-[-0.035em] text-neutral-950">{title}</h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-500">{description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="h-9 shrink-0 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium hover:bg-neutral-50"
          >
            Вернуться в чат
          </button>
        </header>
        <div className="mt-6">{children}</div>
      </div>
    </section>
  );
}

function FormCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
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

function SaveButton({
  saved,
  onClick,
  label
}: {
  saved: boolean;
  onClick: () => Promise<void>;
  label: string;
}) {
  return (
    <div className="flex justify-end lg:col-span-2">
      <button
        type="button"
        onClick={() => void onClick()}
        className="inline-flex h-10 items-center gap-2 rounded-xl bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-black"
      >
        {saved ? <CheckIcon className="size-4" /> : <BadgeCheckIcon className="size-4" />}
        {saved ? "Сохранено" : label}
      </button>
    </div>
  );
}

function LoadingCard({ label }: { label: string }) {
  return (
    <div className="mt-6 flex min-h-52 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-sm text-neutral-500">
      <LoaderCircleIcon className="mr-2 size-4 animate-spin" /> {label}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  detail,
  action,
  onAction
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  action?: string;
  onAction?: () => Promise<void> | void;
}) {
  return (
    <div className="mt-6 flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white px-6 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500 [&_svg]:size-5">
        {icon}
      </span>
      <h2 className="mt-4 text-base font-semibold text-neutral-900">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-neutral-500">{detail}</p>
      {action && onAction ? (
        <button
          type="button"
          onClick={() => void onAction()}
          className="mt-5 inline-flex h-9 items-center gap-2 rounded-lg bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-black"
        >
          <PlusIcon className="size-4" /> {action}
        </button>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="rounded-xl bg-neutral-50 px-2 py-2">
      <span className="block text-sm font-semibold text-neutral-900">{value}</span>
      <span className="mt-0.5 block text-[10px] text-neutral-500">{label}</span>
    </span>
  );
}

function ActionButton({
  label,
  busy,
  onClick
}: {
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
    >
      {busy ? <LoaderCircleIcon className="size-4 animate-spin" /> : <DownloadIcon className="size-4" />}
      {label}
    </button>
  );
}

function EstimateStatus({ status }: { status: LocalEstimateEntry["status"] }) {
  const label =
    status === "approved"
      ? "Утверждена"
      : status === "sent"
        ? "Отправлена"
        : status === "review"
          ? "На проверке"
          : "Черновик";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px]",
        status === "approved" || status === "sent"
          ? "bg-emerald-50 text-emerald-700"
          : status === "review"
            ? "bg-blue-50 text-blue-700"
            : "bg-neutral-100 text-neutral-600"
      )}
    >
      {label}
    </span>
  );
}

function viewIcon(view: "objects" | "estimates" | "documents" | "prices") {
  if (view === "objects") return <FolderKanbanIcon className="size-5" />;
  if (view === "estimates") return <FileSpreadsheetIcon className="size-5" />;
  if (view === "documents") return <FileTextIcon className="size-5" />;
  return <CircleDollarSignIcon className="size-5" />;
}

function match(query: string, ...values: Array<string | undefined>) {
  if (!query) return true;
  return values.join(" ").toLocaleLowerCase("ru-RU").includes(query);
}

function stripHtml(value: string) {
  if (typeof document === "undefined") {
    return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  const container = document.createElement("div");
  container.innerHTML = value;
  return (container.textContent ?? "").replace(/\s+/g, " ").trim();
}

function documentType(type: string) {
  if (type === "contract") return "Договор";
  if (type === "commercial_proposal") return "Коммерческое предложение";
  if (type === "act") return "Акт";
  if (type === "ks2") return "КС-2";
  if (type === "ks3") return "КС-3";
  return "Документ";
}

function safeName(value: string) {
  return (
    value
      .replace(/[^a-zA-Zа-яА-Я0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90) || "prosmet-document"
  );
}

function downloadDocument(entry: LocalDocument) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${entry.title}</title><style>@page{size:A4;margin:20mm}body{font-family:Arial,sans-serif;font-size:12pt;line-height:1.5;color:#111}h1{text-align:center;font-size:18pt}h2{font-size:13pt;margin-top:16pt}table{width:100%;border-collapse:collapse}td,th{border:1px solid #333;padding:5pt}</style></head><body><h1>${entry.title}</h1>${entry.content}</body></html>`;
  const url = URL.createObjectURL(
    new Blob([html], { type: "application/msword;charset=utf-8" })
  );
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeName(entry.title)}-v${entry.revision}.doc`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}
