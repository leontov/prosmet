"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  BadgeCheckIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleAlertIcon,
  DatabaseIcon,
  ExpandIcon,
  FileDownIcon,
  FileSpreadsheetIcon,
  HistoryIcon,
  LoaderCircleIcon,
  PlusIcon,
  SaveIcon,
  SendIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon
} from "lucide-react";
import {
  EstimateDraftSchema,
  ResourceTypeSchema,
  calculateEstimate,
  cloneEstimate,
  makeId,
  validateForApproval,
  type EstimateDraft,
  type EstimateItem,
  type EstimateSection,
  type PriceSource,
  type ResourceType,
  type TechnologyStep
} from "@/lib/domain/estimate";
import { exportEstimatePdf, exportEstimateXlsx } from "@/lib/exports/estimate";
import { useLocalWorkspace } from "@/lib/local/context";
import { getRepository } from "@/lib/local/repository";
import { cn, formatMoney } from "@/lib/utils";

const resourceLabels: Record<ResourceType, string> = {
  work: "Работа",
  material: "Материал",
  machine: "Машина",
  equipment: "Оборудование",
  labor: "Труд",
  service: "Услуга",
  logistics: "Логистика"
};

const statusLabels: Record<EstimateDraft["status"], string> = {
  draft: "Черновик",
  review: "На проверке",
  approved: "Утверждена",
  sent: "Передана клиенту"
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function source(value: unknown, fallbackLabel = "Источник не подтверждён"): PriceSource {
  const raw = record(value);
  const kind = [
    "personal",
    "organization",
    "previous-estimate",
    "supplier",
    "regional",
    "official",
    "external",
    "indicative",
    "unknown"
  ].includes(text(raw.kind))
    ? (text(raw.kind) as PriceSource["kind"])
    : "unknown";
  return {
    label: text(raw.label ?? raw.source, fallbackLabel),
    kind,
    region: text(raw.region),
    date: text(raw.date ?? raw.sourceDate),
    currency: text(raw.currency, "RUB"),
    vatIncluded: Boolean(raw.vatIncluded),
    deliveryIncluded: Boolean(raw.deliveryIncluded),
    confidence: Math.max(0, Math.min(100, num(raw.confidence, 0))),
    confirmed: Boolean(raw.confirmed)
  };
}

function normalizeTechnology(value: unknown): TechnologyStep[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (typeof item === "string") {
      return [
        {
          id: `technology-${index + 1}`,
          title: item,
          description: "",
          control: "",
          resources: []
        }
      ];
    }
    const raw = record(item);
    const title = text(raw.title ?? raw.name);
    if (!title) return [];
    return [
      {
        id: text(raw.id, `technology-${index + 1}`),
        title,
        description: text(raw.description),
        control: text(raw.control),
        resources: Array.isArray(raw.resources)
          ? raw.resources.filter((entry): entry is string => typeof entry === "string")
          : []
      }
    ];
  });
}

function normalizeDraft(args: unknown, fallbackId: string): EstimateDraft | null {
  const root = record(args);
  if (!Array.isArray(root.sections)) return null;
  const sections: EstimateSection[] = root.sections.flatMap((sectionValue, sectionIndex) => {
    const section = record(sectionValue);
    const title = text(section.title ?? section.name, `Раздел ${sectionIndex + 1}`);
    const rawItems = Array.isArray(section.items)
      ? section.items
      : Array.isArray(section.lines)
        ? section.lines
        : [];
    const items: EstimateItem[] = rawItems.flatMap((itemValue, itemIndex) => {
      const item = record(itemValue);
      const name = text(item.name ?? item.title);
      if (!name) return [];
      const resourceTypeValue = text(item.resourceType ?? item.type, "work");
      const resourceType = ResourceTypeSchema.safeParse(resourceTypeValue).success
        ? (resourceTypeValue as ResourceType)
        : "work";
      return [
        {
          id: text(item.id, `item-${sectionIndex + 1}-${itemIndex + 1}`),
          code: text(item.code),
          name,
          unit: text(item.unit, "шт"),
          quantity: Math.max(0, num(item.quantity ?? item.volume, 0)),
          norm: Math.max(0.000001, num(item.norm, 1)),
          coefficient: Math.max(0.000001, num(item.coefficient, 1)),
          unitPrice: Math.max(0, num(item.unitPrice ?? item.price, 0)),
          resourceType,
          source: source(item.source ?? item.priceSource),
          comment: text(item.comment),
          warning: text(item.warning)
        }
      ];
    });
    return [
      {
        id: text(section.id, `section-${sectionIndex + 1}`),
        title,
        items
      }
    ];
  });

  const candidate = {
    id: text(root.id, fallbackId),
    title: text(root.title, "Новая смета"),
    objectName: text(root.objectName ?? root.object),
    customer: text(root.customer),
    contractor: text(root.contractor),
    region: text(root.region),
    date: text(root.date, new Date().toISOString().slice(0, 10)),
    method: text(root.method, "commercial"),
    currency: text(root.currency, "RUB"),
    status: text(root.status, "draft"),
    revision: Math.max(1, Math.floor(num(root.revision, 1))),
    technology: normalizeTechnology(root.technology ?? root.technologyCard),
    sections,
    overheadPercent: Math.max(0, num(root.overheadPercent, 0)),
    profitPercent: Math.max(0, num(root.profitPercent, 0)),
    discountPercent: Math.max(0, num(root.discountPercent, 0)),
    vatPercent: Math.max(0, num(root.vatPercent, 0)),
    assumptions: Array.isArray(root.assumptions)
      ? root.assumptions.filter((entry): entry is string => typeof entry === "string")
      : [],
    warnings: Array.isArray(root.warnings)
      ? root.warnings.filter((entry): entry is string => typeof entry === "string")
      : [],
    reviewerNotes: Array.isArray(root.reviewerNotes)
      ? root.reviewerNotes.filter((entry): entry is string => typeof entry === "string")
      : [],
    updatedAt: new Date().toISOString()
  };
  const parsed = EstimateDraftSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function emptyItem(): EstimateItem {
  return {
    id: makeId("item"),
    code: "",
    name: "Новая позиция",
    unit: "шт",
    quantity: 1,
    norm: 1,
    coefficient: 1,
    unitPrice: 0,
    resourceType: "work",
    source: source(null),
    comment: "",
    warning: ""
  };
}

function emptySection(): EstimateSection {
  return { id: makeId("section"), title: "Новый раздел", items: [emptyItem()] };
}

export function EstimateEditor({
  args,
  status
}: {
  args: unknown;
  status?: { type?: string };
}) {
  const fallbackId = useRef(`estimate_${crypto.randomUUID()}`).current;
  const incoming = useMemo(() => normalizeDraft(args, fallbackId), [args, fallbackId]);
  const workspace = useLocalWorkspace();
  const [draft, setDraft] = useState<EstimateDraft | null>(incoming);
  const [saved, setSaved] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [technologyOpen, setTechnologyOpen] = useState(true);
  const [history, setHistory] = useState<EstimateDraft[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [busy, setBusy] = useState<"save" | "pdf" | "xlsx" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef<string | null>(null);
  const edited = useRef(false);

  useEffect(() => {
    if (!incoming || initialized.current === incoming.id) return;
    let cancelled = false;
    void (async () => {
      const repository = await getRepository();
      const stored = await repository.getEstimate(incoming.id);
      if (cancelled) return;
      initialized.current = incoming.id;
      setDraft(stored ?? incoming);
      if (!stored) await repository.saveEstimate(workspace.currentThreadId, incoming);
      setSaved(true);
    })().catch((reason) =>
      setError(reason instanceof Error ? reason.message : "Не удалось открыть смету")
    );
    return () => {
      cancelled = true;
    };
  }, [incoming, workspace.currentThreadId]);

  useEffect(() => {
    if (!fullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [fullscreen]);

  useEffect(() => {
    if (!draft || !edited.current) return;
    const timer = window.setTimeout(() => {
      void getRepository()
        .then((repository) => repository.saveEstimate(workspace.currentThreadId, draft))
        .then(() => setSaved(true))
        .catch((reason) =>
          setError(reason instanceof Error ? reason.message : "Автосохранение не выполнено")
        );
    }, 600);
    return () => window.clearTimeout(timer);
  }, [draft, workspace.currentThreadId]);

  const calculation = useMemo(() => (draft ? calculateEstimate(draft) : null), [draft]);
  const running = status?.type === "running" || !draft;

  const change = (updater: (current: EstimateDraft) => EstimateDraft) => {
    edited.current = true;
    setSaved(false);
    setError(null);
    setDraft((current) =>
      current
        ? { ...updater(current), status: current.status === "sent" ? "draft" : current.status, updatedAt: new Date().toISOString() }
        : current
    );
  };

  const updateItem = <K extends keyof EstimateItem>(
    sectionId: string,
    itemId: string,
    key: K,
    value: EstimateItem[K]
  ) =>
    change((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              items: section.items.map((item) =>
                item.id === itemId ? { ...item, [key]: value } : item
              )
            }
          : section
      )
    }));

  const saveRevision = async (nextStatus: EstimateDraft["status"] = draft?.status ?? "draft") => {
    if (!draft) return;
    setBusy("save");
    setError(null);
    try {
      if (nextStatus === "approved" || nextStatus === "sent") {
        const report = validateForApproval(draft);
        if (!report.canApprove) {
          throw new Error(`Смету нельзя утвердить:\n${report.blockers.map((item) => `• ${item}`).join("\n")}`);
        }
      }
      const previous = cloneEstimate(draft);
      const next = {
        ...cloneEstimate(draft),
        status: nextStatus,
        revision: draft.revision + 1,
        updatedAt: new Date().toISOString()
      };
      const repository = await getRepository();
      await repository.saveEstimate(workspace.currentThreadId, next, true);
      if (nextStatus === "approved" || nextStatus === "sent") {
        await repository.saveConfirmedPrices(next);
      }
      setHistory((current) => [previous, ...current].slice(0, 30));
      setDraft(next);
      setSaved(true);
      edited.current = false;
      window.dispatchEvent(new Event("prosmet:local-data-changed"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить смету");
    } finally {
      setBusy(null);
    }
  };

  if (running) {
    return (
      <div className="mt-3 w-full max-w-(--thread-max-width) rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3 text-sm text-neutral-600">
          <LoaderCircleIcon className="size-4 animate-spin" />
          Формируем технологическую карту и позиции сметы…
        </div>
        <div className="mt-4 grid gap-2">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="h-11 animate-pulse rounded-xl bg-neutral-100" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <section
      className={cn(
        "flex overflow-hidden border border-neutral-200 bg-neutral-50 shadow-sm",
        fullscreen
          ? "fixed inset-0 z-[100] h-dvh flex-col rounded-none"
          : "mt-3 w-full max-w-(--thread-max-width) flex-col rounded-2xl"
      )}
      data-testid="estimate-editor"
    >
      <header className="border-b border-neutral-200 bg-white px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
              <FileSpreadsheetIcon className="size-4" />
              <span>Интерактивная смета</span>
              <span className="rounded-full border border-neutral-200 px-2 py-0.5">Версия {draft.revision}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5",
                  draft.status === "approved" || draft.status === "sent"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-neutral-100"
                )}
              >
                {statusLabels[draft.status]}
              </span>
              {saved && (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <DatabaseIcon className="size-3.5" /> SQLite
                </span>
              )}
            </div>
            <input
              value={draft.title}
              onChange={(event) => change((current) => ({ ...current, title: event.target.value }))}
              aria-label="Название сметы"
              className="w-full bg-transparent text-lg font-semibold tracking-[-0.02em] outline-none"
            />
            <div className="mt-1 flex flex-wrap gap-x-2 text-sm text-neutral-500">
              <span>{draft.objectName || "Объект не указан"}</span>
              {draft.region && <span>· {draft.region}</span>}
              <span>· {draft.sections.reduce((total, section) => total + section.items.length, 0)} позиций</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Action label="История" onClick={() => setHistoryOpen((value) => !value)} icon={<HistoryIcon />} />
            <Action
              label="PDF"
              disabled={busy !== null}
              onClick={() => {
                setBusy("pdf");
                void exportEstimatePdf(draft).finally(() => setBusy(null));
              }}
              icon={busy === "pdf" ? <LoaderCircleIcon className="animate-spin" /> : <FileDownIcon />}
            />
            <Action
              label="XLSX"
              disabled={busy !== null}
              onClick={() => {
                setBusy("xlsx");
                void exportEstimateXlsx(draft).finally(() => setBusy(null));
              }}
              icon={busy === "xlsx" ? <LoaderCircleIcon className="animate-spin" /> : <FileSpreadsheetIcon />}
            />
            <Action
              label={fullscreen ? "Свернуть" : "Развернуть"}
              onClick={() => setFullscreen((value) => !value)}
              icon={fullscreen ? <XIcon /> : <ExpandIcon />}
            />
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void saveRevision("approved")}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            >
              <BadgeCheckIcon className="size-4" /> Утвердить
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void saveRevision()}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
            >
              {busy === "save" ? <LoaderCircleIcon className="size-4 animate-spin" /> : saved ? <CheckIcon className="size-4" /> : <SaveIcon className="size-4" />}
              {saved ? "Сохранено" : "Сохранить"}
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="whitespace-pre-line border-b border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700 sm:px-5">
          <span className="inline-flex items-start gap-2"><CircleAlertIcon className="mt-1 size-4 shrink-0" />{error}</span>
        </div>
      )}

      {historyOpen && (
        <div className="border-b border-neutral-200 bg-white px-4 py-4 sm:px-5">
          {history.length ? (
            <div className="flex gap-2 overflow-x-auto">
              {history.map((revision) => (
                <button
                  key={`${revision.id}:${revision.revision}`}
                  type="button"
                  onClick={() => {
                    setDraft(cloneEstimate(revision));
                    setSaved(false);
                    edited.current = true;
                    setHistoryOpen(false);
                  }}
                  className="min-w-44 rounded-xl border border-neutral-200 p-3 text-left hover:bg-neutral-50"
                >
                  <div className="text-sm font-medium">Версия {revision.revision}</div>
                  <div className="mt-1 text-xs text-neutral-500">{statusLabels[revision.status]}</div>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-500">История появится после сохранения новой версии.</p>
          )}
        </div>
      )}

      <div className="prosmet-scrollbar min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0 space-y-4">
            <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
              <button
                type="button"
                onClick={() => setTechnologyOpen((value) => !value)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span className="flex items-center gap-2 text-sm font-semibold"><SparklesIcon className="size-4" />Технологическая карта</span>
                {technologyOpen ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
              </button>
              {technologyOpen && (
                <div className="border-t border-neutral-100 px-4 py-4">
                  {draft.technology.length ? (
                    <ol className="grid gap-2">
                      {draft.technology.map((step, index) => (
                        <li key={step.id} className="flex items-start gap-2.5">
                          <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[10px] font-semibold">{index + 1}</span>
                          <textarea
                            value={step.title}
                            rows={1}
                            onChange={(event) =>
                              change((current) => ({
                                ...current,
                                technology: current.technology.map((item) =>
                                  item.id === step.id ? { ...item, title: event.target.value } : item
                                )
                              }))
                            }
                            className="min-h-8 flex-1 resize-y rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm leading-6 outline-none hover:border-neutral-200 focus:border-neutral-300"
                          />
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-amber-700">Технологическая карта не заполнена. Утверждение будет заблокировано.</p>
                  )}
                </div>
              )}
            </section>

            {draft.sections.map((section, sectionIndex) => (
              <section key={section.id} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                <header className="flex items-center gap-2 border-b border-neutral-100 bg-neutral-50 px-3 py-2.5 sm:px-4">
                  <span className="text-xs font-semibold text-neutral-500">{sectionIndex + 1}</span>
                  <input
                    value={section.title}
                    onChange={(event) =>
                      change((current) => ({
                        ...current,
                        sections: current.sections.map((entry) =>
                          entry.id === section.id ? { ...entry, title: event.target.value } : entry
                        )
                      }))
                    }
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                  />
                  <span className="hidden text-xs tabular-nums text-neutral-500 sm:block">
                    {formatMoney(calculation?.sectionTotals[section.id] ?? 0, draft.currency)}
                  </span>
                  <button
                    type="button"
                    aria-label="Удалить раздел"
                    onClick={() =>
                      change((current) => ({ ...current, sections: current.sections.filter((entry) => entry.id !== section.id) }))
                    }
                    className="flex size-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                </header>

                <div className="hidden grid-cols-[78px_86px_minmax(220px,1fr)_60px_86px_72px_72px_104px_110px_30px] gap-2 border-b border-neutral-100 px-3 py-2 text-[9px] font-medium uppercase tracking-[0.04em] text-neutral-500 xl:grid">
                  <span>Тип</span><span>Код</span><span>Позиция</span><span>Ед.</span><span>Кол-во</span><span>Норма</span><span>Коэф.</span><span>Цена</span><span>Сумма</span><span />
                </div>
                <div className="divide-y divide-neutral-100">
                  {section.items.map((item, itemIndex) => (
                    <div key={item.id} className="p-3">
                      <div className="grid gap-2 xl:grid-cols-[78px_86px_minmax(220px,1fr)_60px_86px_72px_72px_104px_110px_30px] xl:items-center">
                        <select
                          value={item.resourceType}
                          onChange={(event) => updateItem(section.id, item.id, "resourceType", event.target.value as ResourceType)}
                          aria-label={`Тип ресурса позиции ${itemIndex + 1}`}
                          className="prosmet-cell"
                        >
                          {Object.entries(resourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                        <input value={item.code} onChange={(event) => updateItem(section.id, item.id, "code", event.target.value)} aria-label={`Код позиции ${itemIndex + 1}`} className="prosmet-cell" />
                        <input value={item.name} onChange={(event) => updateItem(section.id, item.id, "name", event.target.value)} aria-label={`Наименование позиции ${itemIndex + 1}`} className="prosmet-cell font-medium" />
                        <input value={item.unit} onChange={(event) => updateItem(section.id, item.id, "unit", event.target.value)} aria-label={`Единица позиции ${itemIndex + 1}`} className="prosmet-cell" />
                        <NumberInput value={item.quantity} label={`Количество позиции ${itemIndex + 1}`} onChange={(value) => updateItem(section.id, item.id, "quantity", value)} />
                        <NumberInput value={item.norm} label={`Норма позиции ${itemIndex + 1}`} onChange={(value) => updateItem(section.id, item.id, "norm", value)} />
                        <NumberInput value={item.coefficient} label={`Коэффициент позиции ${itemIndex + 1}`} onChange={(value) => updateItem(section.id, item.id, "coefficient", value)} />
                        <NumberInput value={item.unitPrice} label={`Цена позиции ${itemIndex + 1}`} onChange={(value) => updateItem(section.id, item.id, "unitPrice", value)} />
                        <div className="px-2 text-right text-sm font-medium tabular-nums">
                          {formatMoney(calculation?.itemAmounts[item.id] ?? 0, draft.currency)}
                        </div>
                        <button
                          type="button"
                          aria-label={`Удалить позицию ${itemIndex + 1}`}
                          onClick={() =>
                            change((current) => ({
                              ...current,
                              sections: current.sections.map((entry) =>
                                entry.id === section.id ? { ...entry, items: entry.items.filter((line) => line.id !== item.id) } : entry
                              )
                            }))
                          }
                          className="flex size-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2Icon className="size-3.5" />
                        </button>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_100px]">
                        <input
                          value={item.source.label}
                          onChange={(event) => updateItem(section.id, item.id, "source", { ...item.source, label: event.target.value, kind: item.source.kind === "unknown" ? "indicative" : item.source.kind })}
                          placeholder="Источник цены"
                          aria-label={`Источник цены позиции ${itemIndex + 1}`}
                          className="prosmet-cell border-neutral-100 text-xs text-neutral-600"
                        />
                        <input
                          type="date"
                          value={item.source.date}
                          onChange={(event) => updateItem(section.id, item.id, "source", { ...item.source, date: event.target.value })}
                          aria-label={`Дата цены позиции ${itemIndex + 1}`}
                          className="prosmet-cell border-neutral-100 text-xs text-neutral-600"
                        />
                        <div className="flex items-center gap-2 rounded-lg px-2 text-xs text-neutral-500">
                          <span className={cn("size-1.5 rounded-full", item.source.confidence >= 80 ? "bg-emerald-500" : item.source.confidence >= 60 ? "bg-amber-500" : "bg-red-500")} />
                          {Math.round(item.source.confidence)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    change((current) => ({
                      ...current,
                      sections: current.sections.map((entry) =>
                        entry.id === section.id ? { ...entry, items: [...entry.items, emptyItem()] } : entry
                      )
                    }))
                  }
                  className="m-3 inline-flex h-8 items-center gap-2 rounded-lg border border-neutral-200 px-3 text-xs font-medium hover:bg-neutral-50"
                >
                  <PlusIcon className="size-3.5" /> Добавить позицию
                </button>
              </section>
            ))}

            <button
              type="button"
              onClick={() => change((current) => ({ ...current, sections: [...current.sections, emptySection()] }))}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-white text-sm font-medium text-neutral-500 hover:border-neutral-400 hover:text-neutral-900"
            >
              <PlusIcon className="size-4" /> Добавить раздел
            </button>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-0 xl:self-start">
            <section className="rounded-2xl border border-neutral-200 bg-white p-4">
              <h4 className="text-sm font-semibold">Параметры проекта</h4>
              <div className="mt-3 grid gap-3">
                <Field label="Объект"><input value={draft.objectName} onChange={(event) => change((current) => ({ ...current, objectName: event.target.value }))} className="prosmet-input" /></Field>
                <Field label="Регион"><input value={draft.region} onChange={(event) => change((current) => ({ ...current, region: event.target.value }))} className="prosmet-input" /></Field>
                <Field label="Заказчик"><input value={draft.customer} onChange={(event) => change((current) => ({ ...current, customer: event.target.value }))} className="prosmet-input" /></Field>
                <Field label="Подрядчик"><input value={draft.contractor} onChange={(event) => change((current) => ({ ...current, contractor: event.target.value }))} className="prosmet-input" /></Field>
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-200 bg-white p-4">
              <h4 className="text-sm font-semibold">Начисления</h4>
              <div className="mt-3 grid gap-2">
                <Percent label="Накладные" value={draft.overheadPercent} onChange={(value) => change((current) => ({ ...current, overheadPercent: value }))} />
                <Percent label="Прибыль" value={draft.profitPercent} onChange={(value) => change((current) => ({ ...current, profitPercent: value }))} />
                <Percent label="Скидка" value={draft.discountPercent} onChange={(value) => change((current) => ({ ...current, discountPercent: value }))} />
                <Percent label="НДС" value={draft.vatPercent} onChange={(value) => change((current) => ({ ...current, vatPercent: value }))} />
              </div>
            </section>

            <section className="rounded-2xl bg-neutral-900 p-4 text-white shadow-sm">
              <div className="space-y-2 text-sm text-white/70">
                <Total label="Прямые затраты" value={formatMoney(calculation?.directCost ?? 0, draft.currency)} />
                <Total label="Накладные" value={formatMoney(calculation?.overhead ?? 0, draft.currency)} />
                <Total label="Прибыль" value={formatMoney(calculation?.profit ?? 0, draft.currency)} />
                <Total label="Скидка" value={`− ${formatMoney(calculation?.discount ?? 0, draft.currency)}`} />
                <Total label="НДС" value={formatMoney(calculation?.vat ?? 0, draft.currency)} />
              </div>
              <div className="mt-4 border-t border-white/15 pt-4">
                <div className="text-[10px] uppercase tracking-[0.08em] text-white/55">Итого</div>
                <div className="mt-1 text-2xl font-semibold tracking-[-0.035em]">{formatMoney(calculation?.total ?? 0, draft.currency)}</div>
              </div>
            </section>

            {draft.status === "approved" && (
              <button
                type="button"
                onClick={() => void saveRevision("sent")}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white text-sm font-medium hover:bg-neutral-50"
              >
                <SendIcon className="size-4" /> Передать клиенту
              </button>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}

function Action({ label, onClick, icon, disabled = false }: { label: string; onClick: () => void; icon: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="inline-flex h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 [&_svg]:size-4">
      {icon}{label}
    </button>
  );
}

function NumberInput({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  return <input type="number" min={0} step="any" value={value} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} aria-label={label} className="prosmet-cell text-right tabular-nums" />;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5"><span className="text-xs font-medium text-neutral-500">{label}</span>{children}</label>;
}

function Percent({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <span className="flex w-24 items-center gap-1 rounded-lg border border-neutral-200 px-2">
        <input type="number" min={0} step="any" value={value} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} className="h-8 min-w-0 flex-1 bg-transparent text-right tabular-nums outline-none" />
        <span className="text-xs text-neutral-500">%</span>
      </span>
    </label>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3"><span>{label}</span><span className="tabular-nums text-white">{value}</span></div>;
}
