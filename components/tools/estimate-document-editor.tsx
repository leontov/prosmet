"use client";

import {
  ArrowLeftIcon,
  BadgeCheckIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  CopyIcon,
  FileTextIcon,
  GripVerticalIcon,
  HistoryIcon,
  LoaderCircleIcon,
  MoreHorizontalIcon,
  PlusIcon,
  Redo2Icon,
  RotateCcwIcon,
  SaveIcon,
  Trash2Icon,
  Undo2Icon,
  XIcon
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  calculateEstimate,
  cloneEstimate,
  makeId,
  type EstimateDraft,
  type EstimateItem,
  type EstimateSection,
  type PriceSource,
  type ResourceType
} from "@/lib/domain/estimate";
import {
  candidatePriceSource,
  listPriceHistory,
  recordPriceEdit,
  resolveLocalPrice,
  type LocalPriceResolution
} from "@/lib/local/price-intelligence";
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

const sourceLabels: Record<PriceSource["kind"], string> = {
  personal: "Личная",
  organization: "Организация",
  "previous-estimate": "Предыдущая смета",
  supplier: "Поставщик",
  regional: "Рынок региона",
  official: "Официальная",
  external: "Внешнее исследование",
  indicative: "Ориентировочная",
  unknown: "Не подтверждена"
};

const statusLabels: Record<EstimateDraft["status"], string> = {
  draft: "Черновик",
  review: "Готова к просмотру",
  approved: "Утверждена",
  sent: "Передана клиенту"
};

function editableClass(extra = "") {
  return cn(
    "min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1 outline-none transition hover:border-neutral-200 hover:bg-neutral-50 focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100",
    extra
  );
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
    source: {
      label: "Цена не подтверждена",
      kind: "unknown",
      region: "",
      date: new Date().toISOString().slice(0, 10),
      currency: "RUB",
      vatIncluded: false,
      deliveryIncluded: false,
      confidence: 0,
      confirmed: false,
      status: "edited"
    },
    comment: "",
    warning: ""
  };
}

function emptySection(): EstimateSection {
  return {
    id: makeId("section"),
    title: "Новый раздел",
    items: [emptyItem()]
  };
}

export type EstimateDocumentEditorProps = {
  draft: EstimateDraft;
  threadId: string;
  open: boolean;
  onClose: () => void;
  onVersionCreated: (draft: EstimateDraft) => void;
  onDeleted: (draft: EstimateDraft) => void;
};

export function EstimateDocumentEditor({
  draft,
  threadId,
  open,
  onClose,
  onVersionCreated,
  onDeleted
}: EstimateDocumentEditorProps) {
  const [working, setWorking] = useState(() => cloneEstimate(draft));
  const [undoStack, setUndoStack] = useState<EstimateDraft[]>([]);
  const [redoStack, setRedoStack] = useState<EstimateDraft[]>([]);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [savedAt, setSavedAt] = useState(draft.updatedAt);
  const [busy, setBusy] = useState<"done" | "delete" | "duplicate" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailsItem, setDetailsItem] = useState<{ sectionId: string; itemId: string } | null>(null);
  const [priceItem, setPriceItem] = useState<{ sectionId: string; itemId: string } | null>(null);
  const [notice, setNotice] = useState<{ message: string; undo?: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autosaveStarted = useRef(false);

  useEffect(() => {
    if (!open) return;
    setWorking(cloneEstimate(draft));
    setUndoStack([]);
    setRedoStack([]);
    setSaveState("saved");
    setSavedAt(draft.updatedAt);
    setError(null);
    setMenuOpen(false);
    setDetailsItem(null);
    setPriceItem(null);
    autosaveStarted.current = false;
  }, [draft, open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !autosaveStarted.current) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      const next = { ...cloneEstimate(working), updatedAt: new Date().toISOString() };
      void getRepository()
        .then((repository) => repository.saveEstimate(threadId, next))
        .then(() => {
          setSaveState("saved");
          setSavedAt(next.updatedAt);
          window.dispatchEvent(new Event("prosmet:local-data-changed"));
        })
        .catch((reason) => {
          setSaveState("error");
          setError(reason instanceof Error ? reason.message : "Автосохранение не выполнено");
        });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [open, threadId, working]);

  const calculation = useMemo(() => calculateEstimate(working), [working]);
  const itemCount = useMemo(
    () => working.sections.reduce((total, section) => total + section.items.length, 0),
    [working.sections]
  );

  const commitChange = useCallback(
    (updater: (current: EstimateDraft) => EstimateDraft) => {
      autosaveStarted.current = true;
      setError(null);
      setSaveState("saving");
      setWorking((current) => {
        setUndoStack((history) => [...history.slice(-49), cloneEstimate(current)]);
        setRedoStack([]);
        return {
          ...updater(cloneEstimate(current)),
          status: current.status === "sent" ? "draft" : current.status,
          updatedAt: new Date().toISOString()
        };
      });
    },
    []
  );

  const undo = useCallback(() => {
    setUndoStack((history) => {
      const previous = history.at(-1);
      if (!previous) return history;
      autosaveStarted.current = true;
      setRedoStack((future) => [cloneEstimate(working), ...future].slice(0, 50));
      setWorking(cloneEstimate(previous));
      setSaveState("saving");
      return history.slice(0, -1);
    });
  }, [working]);

  const redo = useCallback(() => {
    setRedoStack((future) => {
      const next = future[0];
      if (!next) return future;
      autosaveStarted.current = true;
      setUndoStack((history) => [...history.slice(-49), cloneEstimate(working)]);
      setWorking(cloneEstimate(next));
      setSaveState("saving");
      return future.slice(1);
    });
  }, [working]);

  const updateItem = useCallback(
    <K extends keyof EstimateItem>(
      sectionId: string,
      itemId: string,
      key: K,
      value: EstimateItem[K]
    ) => {
      commitChange((current) => ({
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
    },
    [commitChange]
  );

  const updatePrice = useCallback(
    (sectionId: string, itemId: string, nextPrice: number, nextSource?: PriceSource) => {
      const item = working.sections
        .find((section) => section.id === sectionId)
        ?.items.find((entry) => entry.id === itemId);
      if (!item) return;
      const previousPrice = item.unitPrice;
      commitChange((current) => ({
        ...current,
        sections: current.sections.map((section) =>
          section.id === sectionId
            ? {
                ...section,
                items: section.items.map((entry) =>
                  entry.id === itemId
                    ? {
                        ...entry,
                        unitPrice: nextPrice,
                        suggestedUnitPrice: entry.suggestedUnitPrice ?? previousPrice,
                        source:
                          nextSource ?? {
                            ...entry.source,
                            kind: "personal",
                            label: "Изменено пользователем",
                            date: new Date().toISOString().slice(0, 10),
                            confirmed: false,
                            status: "edited"
                          }
                      }
                    : entry
                )
              }
            : section
        )
      }));
      void recordPriceEdit({
        draft: working,
        item,
        previousPrice,
        acceptedPrice: nextPrice
      }).catch((reason) =>
        setError(reason instanceof Error ? reason.message : "История цены не сохранена")
      );
    },
    [commitChange, working]
  );

  const removeItem = useCallback(
    (sectionId: string, itemId: string) => {
      const before = cloneEstimate(working);
      commitChange((current) => ({
        ...current,
        sections: current.sections.map((section) =>
          section.id === sectionId
            ? { ...section, items: section.items.filter((item) => item.id !== itemId) }
            : section
        )
      }));
      setDetailsItem(null);
      setPriceItem(null);
      setNotice({
        message: "Позиция удалена",
        undo: () => {
          autosaveStarted.current = true;
          setWorking(before);
          setSaveState("saving");
          setNotice(null);
        }
      });
    },
    [commitChange, working]
  );

  const finish = async () => {
    setBusy("done");
    setError(null);
    try {
      const next: EstimateDraft = {
        ...cloneEstimate(working),
        revision: working.revision + 1,
        status: working.status === "draft" ? "review" : working.status,
        updatedAt: new Date().toISOString()
      };
      await (await getRepository()).saveEstimate(threadId, next, true);
      setWorking(next);
      setSaveState("saved");
      setSavedAt(next.updatedAt);
      onVersionCreated(next);
      window.dispatchEvent(new Event("prosmet:local-data-changed"));
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось создать версию сметы");
    } finally {
      setBusy(null);
    }
  };

  const duplicate = async () => {
    setBusy("duplicate");
    setError(null);
    try {
      const next: EstimateDraft = {
        ...cloneEstimate(working),
        id: makeId("estimate"),
        title: `${working.title} — копия`,
        revision: 1,
        status: "draft",
        updatedAt: new Date().toISOString(),
        deletedAt: null
      };
      await (await getRepository()).saveEstimate(threadId, next, true);
      onVersionCreated(next);
      setNotice({ message: "Копия сметы создана" });
      setMenuOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось дублировать смету");
    } finally {
      setBusy(null);
    }
  };

  const deleteEstimate = async () => {
    setBusy("delete");
    setError(null);
    try {
      const deleted: EstimateDraft = {
        ...cloneEstimate(working),
        deletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await (await getRepository()).saveEstimate(threadId, deleted, true);
      onDeleted(deleted);
      window.dispatchEvent(new Event("prosmet:local-data-changed"));
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось удалить смету");
    } finally {
      setBusy(null);
    }
  };

  if (!open) return null;

  const selectedDetails = detailsItem
    ? working.sections
        .find((section) => section.id === detailsItem.sectionId)
        ?.items.find((item) => item.id === detailsItem.itemId) ?? null
    : null;
  const selectedPrice = priceItem
    ? working.sections
        .find((section) => section.id === priceItem.sectionId)
        ?.items.find((item) => item.id === priceItem.itemId) ?? null
    : null;

  return (
    <div
      className="fixed inset-0 z-[120] flex h-dvh flex-col bg-[#ececeb]"
      data-testid="estimate-document-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Редактор сметы"
    >
      <header className="relative z-20 flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            <ArrowLeftIcon className="size-4" />
            <span className="hidden sm:inline">Назад в чат</span>
          </button>
          <div className="hidden h-5 w-px bg-neutral-200 sm:block" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-neutral-900">{working.title}</div>
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
              {saveState === "saving" ? (
                <><LoaderCircleIcon className="size-3 animate-spin" /> Сохраняем…</>
              ) : saveState === "error" ? (
                <><CircleAlertIcon className="size-3 text-red-600" /> Ошибка сохранения</>
              ) : (
                <><SaveIcon className="size-3" /> Сохранено {new Date(savedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <IconButton label="Отменить изменение" onClick={undo} disabled={!undoStack.length}>
            <Undo2Icon />
          </IconButton>
          <IconButton label="Вернуть изменение" onClick={redo} disabled={!redoStack.length}>
            <Redo2Icon />
          </IconButton>
          <button
            type="button"
            onClick={() => void finish()}
            disabled={busy !== null}
            className="ml-1 inline-flex h-9 items-center gap-2 rounded-lg bg-neutral-900 px-3.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
          >
            {busy === "done" ? <LoaderCircleIcon className="size-4 animate-spin" /> : <BadgeCheckIcon className="size-4" />}
            Готово
          </button>
          <div className="relative">
            <IconButton label="Дополнительные действия" onClick={() => setMenuOpen((value) => !value)}>
              <MoreHorizontalIcon />
            </IconButton>
            {menuOpen ? (
              <div className="absolute right-0 top-11 z-30 w-56 overflow-hidden rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl">
                <MenuButton icon={<CopyIcon />} onClick={() => void duplicate()} disabled={busy !== null}>
                  Дублировать смету
                </MenuButton>
                <MenuButton icon={<HistoryIcon />} onClick={() => setNotice({ message: `Открыта версия ${working.revision}. История версий хранится неизменно.` })}>
                  Показать версии
                </MenuButton>
                <div className="my-1 h-px bg-neutral-100" />
                <MenuButton danger icon={<Trash2Icon />} onClick={() => void deleteEstimate()} disabled={busy !== null}>
                  Удалить смету
                </MenuButton>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {error ? (
        <div className="relative z-10 flex items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
          <span className="whitespace-pre-line">{error}</span>
          <button type="button" aria-label="Закрыть ошибку" className="ml-auto" onClick={() => setError(null)}>
            <XIcon className="size-4" />
          </button>
        </div>
      ) : null}

      <main className="prosmet-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-4 sm:px-5 sm:py-8">
        <article
          className="mx-auto min-h-[1120px] w-full max-w-[900px] bg-white px-4 py-7 shadow-[0_18px_70px_rgba(0,0,0,0.13)] sm:px-10 sm:py-12 lg:px-14"
          data-testid="estimate-document-canvas"
        >
          <div className="mb-8 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Локальная смета
            </div>
            <input
              aria-label="Название сметы"
              value={working.title}
              onChange={(event) => commitChange((current) => ({ ...current, title: event.target.value }))}
              className={editableClass("mt-2 w-full text-center text-xl font-semibold tracking-[-0.025em] sm:text-2xl")}
            />
          </div>

          <div className="mb-7 grid gap-x-8 gap-y-1.5 border-y border-neutral-200 py-4 text-sm sm:grid-cols-2">
            <DocumentField label="Объект" value={working.objectName} onChange={(value) => commitChange((current) => ({ ...current, objectName: value }))} />
            <DocumentField label="Заказчик" value={working.customer} onChange={(value) => commitChange((current) => ({ ...current, customer: value }))} />
            <DocumentField label="Регион" value={working.region} onChange={(value) => commitChange((current) => ({ ...current, region: value }))} />
            <DocumentField label="Дата" value={working.date} type="date" onChange={(value) => commitChange((current) => ({ ...current, date: value }))} />
          </div>

          <div className="hidden grid-cols-[40px_minmax(220px,1fr)_66px_96px_112px_124px_32px] border-b-2 border-neutral-900 px-1 py-2 text-[10px] font-semibold uppercase tracking-[0.05em] text-neutral-500 md:grid">
            <span>№</span><span>Наименование</span><span>Ед.</span><span className="text-right">Кол-во</span><span className="text-right">Цена</span><span className="text-right">Сумма</span><span />
          </div>

          <div className="space-y-6">
            {working.sections.map((section, sectionIndex) => (
              <section key={section.id} data-testid="estimate-document-section">
                <div className="group flex items-center gap-2 border-b border-neutral-300 bg-neutral-50 px-2 py-2">
                  <span className="text-xs font-semibold text-neutral-400">{sectionIndex + 1}</span>
                  <input
                    aria-label={`Название раздела ${sectionIndex + 1}`}
                    value={section.title}
                    onChange={(event) =>
                      commitChange((current) => ({
                        ...current,
                        sections: current.sections.map((entry) =>
                          entry.id === section.id ? { ...entry, title: event.target.value } : entry
                        )
                      }))
                    }
                    className={editableClass("flex-1 text-sm font-semibold uppercase tracking-[0.035em]")}
                  />
                  <button
                    type="button"
                    aria-label={`Удалить раздел ${sectionIndex + 1}`}
                    onClick={() => {
                      const before = cloneEstimate(working);
                      commitChange((current) => ({ ...current, sections: current.sections.filter((entry) => entry.id !== section.id) }));
                      setNotice({ message: "Раздел удалён", undo: () => { setWorking(before); setNotice(null); } });
                    }}
                    className="flex size-7 items-center justify-center rounded-md text-neutral-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus:opacity-100"
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                </div>
                <div className="divide-y divide-neutral-100">
                  {section.items.map((item, itemIndex) => (
                    <EstimateLine
                      key={item.id}
                      item={item}
                      index={working.sections
                        .slice(0, sectionIndex)
                        .reduce((total, entry) => total + entry.items.length, 0) + itemIndex + 1}
                      amount={calculation.itemAmounts[item.id] ?? 0}
                      currency={working.currency}
                      onChange={(key, value) => updateItem(section.id, item.id, key, value)}
                      onPrice={(value) => updatePrice(section.id, item.id, value)}
                      onDetails={() => setDetailsItem({ sectionId: section.id, itemId: item.id })}
                      onPriceInspector={() => setPriceItem({ sectionId: section.id, itemId: item.id })}
                      onDelete={() => removeItem(section.id, item.id)}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => commitChange((current) => ({
                    ...current,
                    sections: current.sections.map((entry) =>
                      entry.id === section.id ? { ...entry, items: [...entry.items, emptyItem()] } : entry
                    )
                  }))}
                  className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                >
                  <PlusIcon className="size-3.5" /> Добавить позицию
                </button>
              </section>
            ))}
          </div>

          <button
            type="button"
            onClick={() => commitChange((current) => ({ ...current, sections: [...current.sections, emptySection()] }))}
            className="mt-7 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-300 text-sm font-medium text-neutral-500 hover:border-neutral-500 hover:text-neutral-900"
          >
            <PlusIcon className="size-4" /> Добавить раздел
          </button>

          <div className="mt-9 flex justify-end">
            <div className="w-full max-w-sm border-t-2 border-neutral-900 pt-3">
              <div className="flex items-end justify-between gap-5">
                <span className="text-sm font-semibold uppercase tracking-[0.08em]">Итого</span>
                <span className="text-2xl font-semibold tabular-nums tracking-[-0.035em]">
                  {formatMoney(calculation.total, working.currency)}
                </span>
              </div>
              <details className="mt-3 border-t border-neutral-200 pt-2 text-sm">
                <summary className="cursor-pointer select-none py-1 text-neutral-600">Расчёт итога</summary>
                <div className="mt-2 space-y-1.5 pb-2 text-neutral-600">
                  <TotalLine label="Прямые затраты" value={formatMoney(calculation.directCost, working.currency)} />
                  <PercentLine label="Накладные" value={working.overheadPercent} onChange={(value) => commitChange((current) => ({ ...current, overheadPercent: value }))} amount={formatMoney(calculation.overhead, working.currency)} />
                  <PercentLine label="Прибыль" value={working.profitPercent} onChange={(value) => commitChange((current) => ({ ...current, profitPercent: value }))} amount={formatMoney(calculation.profit, working.currency)} />
                  <PercentLine label="Скидка" value={working.discountPercent} onChange={(value) => commitChange((current) => ({ ...current, discountPercent: value }))} amount={`− ${formatMoney(calculation.discount, working.currency)}`} />
                  <PercentLine label="НДС" value={working.vatPercent} onChange={(value) => commitChange((current) => ({ ...current, vatPercent: value }))} amount={formatMoney(calculation.vat, working.currency)} />
                </div>
              </details>
            </div>
          </div>

          <details className="mt-8 border-t border-neutral-200 py-3 text-sm">
            <summary className="cursor-pointer select-none font-medium text-neutral-700">
              Основание расчёта · {working.technology.length} технологических операций
            </summary>
            <ol className="mt-3 space-y-2 pl-5 text-neutral-600">
              {working.technology.map((step, index) => (
                <li key={step.id} className="list-decimal">
                  <input
                    value={step.title}
                    aria-label={`Технологическая операция ${index + 1}`}
                    onChange={(event) => commitChange((current) => ({
                      ...current,
                      technology: current.technology.map((entry) => entry.id === step.id ? { ...entry, title: event.target.value } : entry)
                    }))}
                    className={editableClass("w-full text-sm")}
                  />
                </li>
              ))}
            </ol>
          </details>

          <details className="border-t border-neutral-200 py-3 text-sm">
            <summary className="cursor-pointer select-none font-medium text-neutral-700">
              Допущения и замечания · {working.assumptions.length + working.warnings.length}
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <ListEditor title="Допущения" values={working.assumptions} onChange={(values) => commitChange((current) => ({ ...current, assumptions: values }))} />
              <ListEditor title="Предупреждения" values={working.warnings} onChange={(values) => commitChange((current) => ({ ...current, warnings: values }))} />
            </div>
          </details>

          <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4 text-[11px] text-neutral-400">
            <span>Версия {working.revision} · {statusLabels[working.status]}</span>
            <span>{itemCount} позиций · Просметчик</span>
          </footer>
        </article>
      </main>

      {notice ? (
        <div className="fixed bottom-4 left-1/2 z-[150] flex -translate-x-1/2 items-center gap-3 rounded-xl bg-neutral-900 px-4 py-3 text-sm text-white shadow-xl">
          <span>{notice.message}</span>
          {notice.undo ? (
            <button type="button" onClick={notice.undo} className="font-semibold text-white underline underline-offset-2">
              Отменить
            </button>
          ) : null}
          <button type="button" aria-label="Закрыть уведомление" onClick={() => setNotice(null)}>
            <XIcon className="size-4" />
          </button>
        </div>
      ) : null}

      {selectedDetails && detailsItem ? (
        <ItemDetailsSheet
          item={selectedDetails}
          onClose={() => setDetailsItem(null)}
          onChange={(key, value) => updateItem(detailsItem.sectionId, detailsItem.itemId, key, value)}
          onDelete={() => removeItem(detailsItem.sectionId, detailsItem.itemId)}
        />
      ) : null}

      {selectedPrice && priceItem ? (
        <PriceInspector
          draft={working}
          item={selectedPrice}
          onClose={() => setPriceItem(null)}
          onApply={(price, source) => updatePrice(priceItem.sectionId, priceItem.itemId, price, source)}
        />
      ) : null}
    </div>
  );
}

function EstimateLine({
  item,
  index,
  amount,
  currency,
  onChange,
  onPrice,
  onDetails,
  onPriceInspector,
  onDelete
}: {
  item: EstimateItem;
  index: number;
  amount: number;
  currency: string;
  onChange: <K extends keyof EstimateItem>(key: K, value: EstimateItem[K]) => void;
  onPrice: (value: number) => void;
  onDetails: () => void;
  onPriceInspector: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group py-2.5" data-testid="estimate-document-line">
      <div className="hidden grid-cols-[40px_minmax(220px,1fr)_66px_96px_112px_124px_32px] items-center gap-0.5 md:grid">
        <span className="flex items-center gap-1 text-xs text-neutral-400"><GripVerticalIcon className="size-3 opacity-0 group-hover:opacity-100" />{index}</span>
        <input aria-label={`Наименование позиции ${index}`} value={item.name} onChange={(event) => onChange("name", event.target.value)} className={editableClass("text-sm font-medium")} />
        <input aria-label={`Единица позиции ${index}`} value={item.unit} onChange={(event) => onChange("unit", event.target.value)} className={editableClass("text-center text-sm")} />
        <NumberCell label={`Количество позиции ${index}`} value={item.quantity} onChange={(value) => onChange("quantity", value)} />
        <div className="relative">
          <NumberCell label={`Цена позиции ${index}`} value={item.unitPrice} onChange={onPrice} />
          <button type="button" onClick={onPriceInspector} className="mx-auto mt-0.5 block max-w-full truncate rounded-full bg-neutral-100 px-2 py-0.5 text-[9px] font-medium text-neutral-500 hover:bg-blue-50 hover:text-blue-700">
            {sourceLabels[item.source.kind]}
          </button>
        </div>
        <span className="px-1.5 text-right text-sm font-medium tabular-nums">{formatMoney(amount, currency)}</span>
        <button type="button" aria-label={`Действия позиции ${index}`} onClick={onDetails} className="flex size-7 items-center justify-center rounded-md text-neutral-300 opacity-0 transition hover:bg-neutral-100 hover:text-neutral-700 group-hover:opacity-100 focus:opacity-100">
          <MoreHorizontalIcon className="size-4" />
        </button>
      </div>

      <button type="button" onClick={onDetails} className="w-full rounded-xl border border-neutral-200 px-3 py-3 text-left md:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-neutral-900">{item.name}</div>
            <div className="mt-1 text-xs text-neutral-500">{item.quantity} {item.unit} × {formatMoney(item.unitPrice, currency)}</div>
            <button type="button" onClick={(event) => { event.stopPropagation(); onPriceInspector(); }} className="mt-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600">
              {sourceLabels[item.source.kind]}
            </button>
          </div>
          <div className="shrink-0 text-right text-sm font-semibold tabular-nums">{formatMoney(amount, currency)}</div>
        </div>
      </button>
      <button type="button" aria-label={`Удалить позицию ${index}`} onClick={onDelete} className="hidden" />
    </div>
  );
}

function PriceInspector({
  draft,
  item,
  onClose,
  onApply
}: {
  draft: EstimateDraft;
  item: EstimateItem;
  onClose: () => void;
  onApply: (price: number, source: PriceSource) => void;
}) {
  const [state, setState] = useState<{ loading: boolean; resolution?: LocalPriceResolution; history?: Awaited<ReturnType<typeof listPriceHistory>>; error?: string }>({ loading: true });

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      resolveLocalPrice({ item, region: draft.region, currency: draft.currency }),
      listPriceHistory(draft.id, item.id)
    ])
      .then(([resolution, history]) => {
        if (!cancelled) setState({ loading: false, resolution, history });
      })
      .catch((reason) => {
        if (!cancelled) setState({ loading: false, error: reason instanceof Error ? reason.message : "Не удалось получить историю цены" });
      });
    return () => { cancelled = true; };
  }, [draft.currency, draft.id, draft.region, item]);

  const resolution = state.resolution;
  return (
    <SideSheet title="Цена позиции" subtitle={item.name} onClose={onClose} testId="price-inspector">
      {state.loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-neutral-500"><LoaderCircleIcon className="size-4 animate-spin" /> Анализируем личные и рыночные цены…</div>
      ) : state.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.error}</div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-2xl bg-neutral-900 p-4 text-white">
            <div className="text-xs text-white/55">Текущая цена</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(item.unitPrice, draft.currency)} / {item.unit}</div>
            <div className="mt-2 text-xs text-white/65">{sourceLabels[item.source.kind]} · уверенность {Math.round(item.source.confidence)}%</div>
          </div>

          <div className="space-y-2">
            <PriceChoice label="Ваша последняя" candidate={resolution?.personal} currency={draft.currency} unit={item.unit} onApply={onApply} />
            <PriceChoice label="Организация" candidate={resolution?.organization} currency={draft.currency} unit={item.unit} onApply={onApply} />
            <PriceChoice label="Предыдущая смета" candidate={resolution?.previousEstimate} currency={draft.currency} unit={item.unit} onApply={onApply} />
            {resolution?.market ? (
              <button type="button" onClick={() => onApply(resolution.market!.median, {
                ...item.source,
                kind: "regional",
                label: `Медиана рынка · ${resolution.market!.sampleCount} наблюдений`,
                region: resolution.market!.region,
                date: resolution.market!.updatedAt.slice(0, 10),
                confidence: resolution.market!.confidence,
                confirmed: false,
                status: "suggested",
                marketRange: { p25: resolution.market!.p25, median: resolution.market!.median, p75: resolution.market!.p75 },
                sampleCount: resolution.market!.sampleCount,
                uniqueOrganizations: resolution.market!.uniqueOrganizations
              })} className="flex w-full items-center justify-between rounded-xl border border-neutral-200 p-3 text-left hover:border-blue-300 hover:bg-blue-50/40">
                <span><span className="block text-sm font-medium">Рынок региона</span><span className="mt-0.5 block text-xs text-neutral-500">{formatMoney(resolution.market.p25, draft.currency)}–{formatMoney(resolution.market.p75, draft.currency)} · {resolution.market.sampleCount} наблюдений</span></span>
                <span className="text-sm font-semibold tabular-nums">{formatMoney(resolution.market.median, draft.currency)}</span>
              </button>
            ) : null}
            <PriceChoice label="Официальный ориентир" candidate={resolution?.official} currency={draft.currency} unit={item.unit} onApply={onApply} />
            <PriceChoice label="Внешнее исследование" candidate={resolution?.external} currency={draft.currency} unit={item.unit} onApply={onApply} />
          </div>

          {resolution?.needsResearch ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
              Для этой позиции недостаточно свежих сопоставимых наблюдений. При следующем AI-запуске следует отдельно исследовать рынок региона.
            </div>
          ) : null}

          <div>
            <h4 className="text-sm font-semibold text-neutral-900">История изменений</h4>
            <div className="mt-2 space-y-2">
              {state.history?.length ? state.history.slice(0, 10).map((event) => (
                <div key={event.id} className="flex items-center justify-between rounded-xl bg-neutral-50 px-3 py-2 text-xs">
                  <span><span className="block font-medium text-neutral-800">{formatMoney(event.previousPrice, draft.currency)} → {formatMoney(event.acceptedPrice, draft.currency)}</span><span className="text-neutral-500">{new Date(event.changedAt).toLocaleString("ru-RU")}</span></span>
                  <span className="rounded-full bg-white px-2 py-1 text-neutral-600">{event.status}</span>
                </div>
              )) : <p className="text-xs text-neutral-500">Цена ещё не изменялась вручную.</p>}
            </div>
          </div>
        </div>
      )}
    </SideSheet>
  );
}

function PriceChoice({ label, candidate, currency, unit, onApply }: {
  label: string;
  candidate: LocalPriceResolution["selected"] | undefined;
  currency: string;
  unit: string;
  onApply: (price: number, source: PriceSource) => void;
}) {
  if (!candidate) return null;
  return (
    <button type="button" onClick={() => onApply(candidate.observation.price, candidatePriceSource(candidate))} className="flex w-full items-center justify-between rounded-xl border border-neutral-200 p-3 text-left hover:border-blue-300 hover:bg-blue-50/40">
      <span><span className="block text-sm font-medium">{label}</span><span className="mt-0.5 block text-xs text-neutral-500">{candidate.observation.region || "Регион не указан"} · score {Math.round(candidate.score * 100)}%</span></span>
      <span className="text-sm font-semibold tabular-nums">{formatMoney(candidate.observation.price, currency)} / {unit}</span>
    </button>
  );
}

function ItemDetailsSheet({ item, onClose, onChange, onDelete }: {
  item: EstimateItem;
  onClose: () => void;
  onChange: <K extends keyof EstimateItem>(key: K, value: EstimateItem[K]) => void;
  onDelete: () => void;
}) {
  return (
    <SideSheet title="Параметры позиции" subtitle={item.name} onClose={onClose} testId="estimate-row-details">
      <div className="grid gap-4">
        <SheetField label="Наименование"><input value={item.name} onChange={(event) => onChange("name", event.target.value)} className="prosmet-input" /></SheetField>
        <div className="grid grid-cols-2 gap-3">
          <SheetField label="Количество"><input type="number" min="0" step="any" value={item.quantity} onChange={(event) => onChange("quantity", Math.max(0, Number(event.target.value) || 0))} className="prosmet-input text-right" /></SheetField>
          <SheetField label="Единица"><input value={item.unit} onChange={(event) => onChange("unit", event.target.value)} className="prosmet-input" /></SheetField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SheetField label="Код / норма"><input value={item.code} onChange={(event) => onChange("code", event.target.value)} className="prosmet-input" /></SheetField>
          <SheetField label="Тип ресурса"><select value={item.resourceType} onChange={(event) => onChange("resourceType", event.target.value as ResourceType)} className="prosmet-input">{Object.entries(resourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></SheetField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SheetField label="Норма расхода"><input type="number" min="0.000001" step="any" value={item.norm} onChange={(event) => onChange("norm", Math.max(0.000001, Number(event.target.value) || 1))} className="prosmet-input text-right" /></SheetField>
          <SheetField label="Коэффициент"><input type="number" min="0.000001" step="any" value={item.coefficient} onChange={(event) => onChange("coefficient", Math.max(0.000001, Number(event.target.value) || 1))} className="prosmet-input text-right" /></SheetField>
        </div>
        <SheetField label="Источник цены"><input value={item.source.label} onChange={(event) => onChange("source", { ...item.source, label: event.target.value })} className="prosmet-input" /></SheetField>
        <SheetField label="Комментарий"><textarea rows={3} value={item.comment} onChange={(event) => onChange("comment", event.target.value)} className="prosmet-input min-h-20 resize-y py-2" /></SheetField>
        <details className="rounded-xl border border-neutral-200 p-3 text-sm">
          <summary className="cursor-pointer font-medium">Контекст цены</summary>
          <div className="mt-3 grid gap-2 text-xs text-neutral-600">
            <ContextToggle label="Материалы включены" checked={item.priceContext?.materialsIncluded ?? false} onChange={(checked) => onChange("priceContext", { materialsIncluded: checked, deliveryIncluded: item.priceContext?.deliveryIncluded ?? false, equipmentIncluded: item.priceContext?.equipmentIncluded ?? false, vatIncluded: item.priceContext?.vatIncluded ?? false, constrainedConditions: item.priceContext?.constrainedConditions ?? false, qualityLevel: item.priceContext?.qualityLevel ?? "standard", urgency: item.priceContext?.urgency ?? "normal", season: item.priceContext?.season ?? "", layerThicknessMm: item.priceContext?.layerThicknessMm, floor: item.priceContext?.floor })} />
            <ContextToggle label="Доставка включена" checked={item.priceContext?.deliveryIncluded ?? false} onChange={(checked) => onChange("priceContext", { materialsIncluded: item.priceContext?.materialsIncluded ?? false, deliveryIncluded: checked, equipmentIncluded: item.priceContext?.equipmentIncluded ?? false, vatIncluded: item.priceContext?.vatIncluded ?? false, constrainedConditions: item.priceContext?.constrainedConditions ?? false, qualityLevel: item.priceContext?.qualityLevel ?? "standard", urgency: item.priceContext?.urgency ?? "normal", season: item.priceContext?.season ?? "", layerThicknessMm: item.priceContext?.layerThicknessMm, floor: item.priceContext?.floor })} />
            <ContextToggle label="Стеснённые условия" checked={item.priceContext?.constrainedConditions ?? false} onChange={(checked) => onChange("priceContext", { materialsIncluded: item.priceContext?.materialsIncluded ?? false, deliveryIncluded: item.priceContext?.deliveryIncluded ?? false, equipmentIncluded: item.priceContext?.equipmentIncluded ?? false, vatIncluded: item.priceContext?.vatIncluded ?? false, constrainedConditions: checked, qualityLevel: item.priceContext?.qualityLevel ?? "standard", urgency: item.priceContext?.urgency ?? "normal", season: item.priceContext?.season ?? "", layerThicknessMm: item.priceContext?.layerThicknessMm, floor: item.priceContext?.floor })} />
          </div>
        </details>
        <button type="button" onClick={onDelete} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50">
          <Trash2Icon className="size-4" /> Удалить позицию
        </button>
      </div>
    </SideSheet>
  );
}

function SideSheet({ title, subtitle, onClose, children, testId }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; testId: string }) {
  return (
    <div className="fixed inset-0 z-[140] flex justify-end bg-black/20" data-testid={testId}>
      <button type="button" aria-label="Закрыть панель" onClick={onClose} className="absolute inset-0 cursor-default" />
      <aside className="prosmet-scrollbar relative mt-auto max-h-[88dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:mt-0 sm:h-full sm:max-h-none sm:max-w-md sm:rounded-none sm:p-5">
        <header className="mb-5 flex items-start justify-between gap-3 border-b border-neutral-200 pb-4">
          <div className="min-w-0"><h3 className="text-base font-semibold text-neutral-950">{title}</h3>{subtitle ? <p className="mt-1 truncate text-xs text-neutral-500">{subtitle}</p> : null}</div>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="flex size-8 items-center justify-center rounded-lg hover:bg-neutral-100"><XIcon className="size-4" /></button>
        </header>
        {children}
      </aside>
    </div>
  );
}

function DocumentField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-2"><span className="text-xs font-medium text-neutral-500">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className={editableClass("w-full text-sm")} /></label>;
}

function NumberCell({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <input aria-label={label} type="number" min="0" step="any" value={value} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} className={editableClass("w-full text-right text-sm tabular-nums")} />;
}

function PercentLine({ label, value, onChange, amount }: { label: string; value: number; onChange: (value: number) => void; amount: string }) {
  return <div className="grid grid-cols-[1fr_70px_130px] items-center gap-2"><span>{label}</span><span className="flex items-center rounded-md border border-neutral-200 px-1"><input aria-label={`${label}, процент`} type="number" min="0" step="any" value={value} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} className="h-7 min-w-0 flex-1 bg-transparent text-right outline-none" /><span className="text-xs text-neutral-400">%</span></span><span className="text-right tabular-nums">{amount}</span></div>;
}

function TotalLine({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4"><span>{label}</span><span className="tabular-nums">{value}</span></div>;
}

function ListEditor({ title, values, onChange }: { title: string; values: string[]; onChange: (values: string[]) => void }) {
  return <div><div className="mb-2 text-xs font-semibold text-neutral-500">{title}</div><div className="space-y-1.5">{values.map((value, index) => <div key={`${title}:${index}`} className="flex gap-1"><textarea rows={1} value={value} onChange={(event) => onChange(values.map((entry, position) => position === index ? event.target.value : entry))} className={editableClass("min-h-8 flex-1 resize-y text-sm")} /><button type="button" aria-label={`Удалить: ${value}`} onClick={() => onChange(values.filter((_, position) => position !== index))} className="flex size-8 items-center justify-center rounded-md text-neutral-300 hover:bg-red-50 hover:text-red-600"><Trash2Icon className="size-3.5" /></button></div>)}</div><button type="button" onClick={() => onChange([...values, ""])} className="mt-2 inline-flex h-7 items-center gap-1 text-xs font-medium text-neutral-500"><PlusIcon className="size-3" /> Добавить</button></div>;
}

function SheetField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5"><span className="text-xs font-medium text-neutral-500">{label}</span>{children}</label>;
}

function ContextToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex items-center justify-between gap-3 rounded-lg bg-neutral-50 px-3 py-2"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-neutral-900" /></label>;
}

function IconButton({ label, onClick, disabled = false, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return <button type="button" aria-label={label} onClick={onClick} disabled={disabled} className="flex size-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 disabled:opacity-25 [&_svg]:size-4">{children}</button>;
}

function MenuButton({ icon, children, onClick, danger = false, disabled = false }: { icon: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={cn("flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm hover:bg-neutral-100 disabled:opacity-50 [&_svg]:size-4", danger && "text-red-600 hover:bg-red-50")}>{icon}{children}</button>;
}
