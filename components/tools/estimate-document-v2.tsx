"use client";

import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronUpIcon,
  CircleAlertIcon,
  Clock3Icon,
  EllipsisIcon,
  FileSpreadsheetIcon,
  GripVerticalIcon,
  HistoryIcon,
  InfoIcon,
  LoaderCircleIcon,
  PlusIcon,
  Redo2Icon,
  RotateCcwIcon,
  SaveIcon,
  Trash2Icon,
  Undo2Icon,
  XIcon
} from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  calculateEstimate,
  cloneEstimate,
  makeId,
  type EstimateDraft,
  type EstimateItem,
  type EstimateSection,
  type ResourceType
} from "@/lib/domain/estimate";
import type { PriceResolution } from "@/lib/domain/price-intelligence";
import {
  listPriceHistory,
  priceContextFromEstimate,
  recordPriceEdit,
  resolveLocalPrice
} from "@/lib/local/price-intelligence";
import { cn, formatMoney } from "@/lib/utils";

export type EstimateDocumentSaveState = "saving" | "saved" | "error";

export type EstimateDocumentEditorProps = {
  draft: EstimateDraft;
  saveState: EstimateDocumentSaveState;
  onChange: (draft: EstimateDraft) => void;
  onDone: (draft: EstimateDraft) => Promise<void> | void;
  onClose: () => void;
  onDelete: (draft: EstimateDraft) => Promise<void> | void;
};

const resourceLabels: Record<ResourceType, string> = {
  work: "Работа",
  material: "Материал",
  machine: "Машина",
  equipment: "Оборудование",
  labor: "Труд",
  service: "Услуга",
  logistics: "Логистика"
};

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
      label: "Цена пользователя",
      kind: "personal",
      region: "",
      date: new Date().toISOString().slice(0, 10),
      currency: "RUB",
      vatIncluded: false,
      deliveryIncluded: false,
      confidence: 70,
      confirmed: false
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

function priceBadge(item: EstimateItem) {
  if (item.source.kind === "personal") return "Личная";
  if (item.source.kind === "organization") return "Организация";
  if (item.source.kind === "previous-estimate") return "Предыдущая смета";
  if (item.source.kind === "regional") return "Рынок региона";
  if (item.source.kind === "official") return "Официальная";
  if (item.source.kind === "supplier") return "Поставщик";
  if (item.source.kind === "external") return "Исследование";
  return "Ориентир";
}

export function EstimateDocumentEditorV2({
  draft,
  saveState,
  onChange,
  onDone,
  onClose,
  onDelete
}: EstimateDocumentEditorProps) {
  const [working, setWorking] = useState(() => cloneEstimate(draft));
  const [undoStack, setUndoStack] = useState<EstimateDraft[]>([]);
  const [redoStack, setRedoStack] = useState<EstimateDraft[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [totalsOpen, setTotalsOpen] = useState(false);
  const [technologyOpen, setTechnologyOpen] = useState(false);
  const [details, setDetails] = useState<{ sectionId: string; itemId: string } | null>(null);
  const [deletedNotice, setDeletedNotice] = useState<string | null>(null);
  const [busyDone, setBusyDone] = useState(false);
  const previousBodyOverflow = useRef("");

  useEffect(() => {
    previousBodyOverflow.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow.current;
    };
  }, []);

  useEffect(() => {
    setWorking(cloneEstimate(draft));
  }, [draft.id, draft.revision]);

  const calculation = useMemo(() => calculateEstimate(working), [working]);
  const lineCount = working.sections.reduce((sum, section) => sum + section.items.length, 0);

  const commit = (next: EstimateDraft, options?: { history?: boolean }) => {
    if (options?.history !== false) {
      setUndoStack((stack) => [...stack.slice(-49), cloneEstimate(working)]);
      setRedoStack([]);
    }
    const value = { ...next, updatedAt: new Date().toISOString() };
    setWorking(value);
    onChange(value);
  };

  const update = (recipe: (current: EstimateDraft) => EstimateDraft) => {
    commit(recipe(cloneEstimate(working)));
  };

  const undo = () => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack, cloneEstimate(working)]);
    const value = { ...cloneEstimate(previous), updatedAt: new Date().toISOString() };
    setWorking(value);
    onChange(value);
  };

  const redo = () => {
    const next = redoStack.at(-1);
    if (!next) return;
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack, cloneEstimate(working)]);
    const value = { ...cloneEstimate(next), updatedAt: new Date().toISOString() };
    setWorking(value);
    onChange(value);
  };

  const updateItem = <K extends keyof EstimateItem>(
    sectionId: string,
    itemId: string,
    key: K,
    value: EstimateItem[K]
  ) => {
    update((current) => ({
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
  };

  const removeItem = (sectionId: string, itemId: string, name: string) => {
    update((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId
          ? { ...section, items: section.items.filter((item) => item.id !== itemId) }
          : section
      )
    }));
    setDeletedNotice(`Позиция «${name}» удалена`);
    window.setTimeout(() => setDeletedNotice(null), 5_000);
  };

  const finish = async () => {
    setBusyDone(true);
    try {
      await onDone(working);
    } finally {
      setBusyDone(false);
    }
  };

  const selected = details
    ? working.sections
        .find((section) => section.id === details.sectionId)
        ?.items.find((item) => item.id === details.itemId) ?? null
    : null;

  const overlay = (
    <div
      className="fixed inset-0 z-[200] flex h-dvh flex-col bg-[#ececec] text-neutral-950"
      data-testid="estimate-document-editor"
      role="dialog"
      aria-modal="true"
      aria-label="Редактор сметы"
    >
      <header className="relative z-20 flex h-14 shrink-0 items-center gap-2 border-b border-black/10 bg-white px-2 sm:px-4">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-medium hover:bg-neutral-100 sm:px-3"
          aria-label="Закрыть редактор"
        >
          <ChevronLeftIcon className="size-4" />
          <span className="hidden sm:inline">Назад</span>
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-sm font-medium">{working.title}</div>
          <SaveState state={saveState} />
        </div>
        <button
          type="button"
          onClick={undo}
          disabled={!undoStack.length}
          className="editor-toolbar-icon"
          aria-label="Отменить изменение"
        >
          <Undo2Icon />
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={!redoStack.length}
          className="editor-toolbar-icon"
          aria-label="Повторить изменение"
        >
          <Redo2Icon />
        </button>
        <button
          type="button"
          onClick={() => void finish()}
          disabled={busyDone}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-neutral-950 px-3 text-sm font-medium text-white hover:bg-black disabled:opacity-50 sm:px-4"
        >
          {busyDone ? <LoaderCircleIcon className="size-4 animate-spin" /> : <CheckIcon className="size-4" />}
          Готово
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="editor-toolbar-icon"
            aria-label="Действия со сметой"
          >
            <EllipsisIcon />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 top-11 w-56 overflow-hidden rounded-xl border border-neutral-200 bg-white p-1 shadow-xl">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setTechnologyOpen(true);
                  document.getElementById("estimate-technology")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="editor-menu-item"
              >
                <InfoIcon /> Основание расчёта
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setTotalsOpen(true);
                  document.getElementById("estimate-totals")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="editor-menu-item"
              >
                <FileSpreadsheetIcon /> Расчёт итога
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  void onDelete(working);
                }}
                className="editor-menu-item text-red-600 hover:bg-red-50"
              >
                <Trash2Icon /> Удалить смету
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <main className="prosmet-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-4 sm:px-6 sm:py-8">
        <article className="mx-auto min-h-[297mm] w-full max-w-[210mm] bg-white px-[6mm] py-[8mm] shadow-[0_8px_40px_rgba(0,0,0,0.13)] sm:px-[14mm] sm:py-[16mm] print:shadow-none">
          <div className="text-center">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
              Локальная смета
            </div>
            <input
              value={working.title}
              onChange={(event) =>
                update((current) => ({ ...current, title: event.target.value }))
              }
              aria-label="Название сметы"
              className="mt-2 w-full border-b border-transparent bg-transparent px-1 text-center text-xl font-semibold tracking-[-0.02em] outline-none hover:border-neutral-200 focus:border-neutral-500 sm:text-2xl"
            />
          </div>

          <div className="mt-8 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <DocumentField
              label="Объект"
              value={working.objectName}
              onChange={(value) => update((current) => ({ ...current, objectName: value }))}
            />
            <DocumentField
              label="Заказчик"
              value={working.customer}
              onChange={(value) => update((current) => ({ ...current, customer: value }))}
            />
            <DocumentField
              label="Регион"
              value={working.region}
              onChange={(value) => update((current) => ({ ...current, region: value }))}
            />
            <DocumentField
              label="Дата"
              value={working.date}
              type="date"
              onChange={(value) => update((current) => ({ ...current, date: value }))}
            />
          </div>

          <div className="mt-8 space-y-6">
            {working.sections.map((section, sectionIndex) => (
              <DocumentSection
                key={section.id}
                section={section}
                sectionIndex={sectionIndex}
                currency={working.currency}
                amounts={calculation.itemAmounts}
                onSectionTitle={(value) =>
                  update((current) => ({
                    ...current,
                    sections: current.sections.map((entry) =>
                      entry.id === section.id ? { ...entry, title: value } : entry
                    )
                  }))
                }
                onAddItem={() =>
                  update((current) => ({
                    ...current,
                    sections: current.sections.map((entry) =>
                      entry.id === section.id
                        ? { ...entry, items: [...entry.items, emptyItem()] }
                        : entry
                    )
                  }))
                }
                onRemoveSection={() =>
                  update((current) => ({
                    ...current,
                    sections: current.sections.filter((entry) => entry.id !== section.id)
                  }))
                }
                onUpdateItem={(itemId, key, value) =>
                  updateItem(section.id, itemId, key, value as never)
                }
                onOpenDetails={(itemId) => setDetails({ sectionId: section.id, itemId })}
                onRemoveItem={(item) => removeItem(section.id, item.id, item.name)}
                onRecordPriceEdit={(item, previousPrice) =>
                  void recordPriceEdit({ draft: working, item, previousPrice })
                }
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => update((current) => ({ ...current, sections: [...current.sections, emptySection()] }))}
            className="mt-6 inline-flex h-9 items-center gap-2 rounded-lg border border-dashed border-neutral-300 px-3 text-sm text-neutral-500 hover:border-neutral-500 hover:text-neutral-900"
          >
            <PlusIcon className="size-4" /> Добавить раздел
          </button>

          <section id="estimate-totals" className="mt-10 border-t border-neutral-300 pt-4">
            <button
              type="button"
              onClick={() => setTotalsOpen((open) => !open)}
              className="flex w-full items-center justify-between text-left"
            >
              <span className="text-sm font-medium">Расчёт итога</span>
              <span className="flex items-center gap-3">
                <strong className="text-xl tabular-nums sm:text-2xl">
                  {formatMoney(calculation.total, working.currency)}
                </strong>
                {totalsOpen ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
              </span>
            </button>
            {totalsOpen ? (
              <div className="ml-auto mt-4 grid max-w-sm gap-2 text-sm">
                <TotalRow label="Прямые затраты" value={calculation.directCost} currency={working.currency} />
                <PercentRow
                  label="Накладные"
                  value={working.overheadPercent}
                  total={calculation.overhead}
                  currency={working.currency}
                  onChange={(value) => update((current) => ({ ...current, overheadPercent: value }))}
                />
                <PercentRow
                  label="Прибыль"
                  value={working.profitPercent}
                  total={calculation.profit}
                  currency={working.currency}
                  onChange={(value) => update((current) => ({ ...current, profitPercent: value }))}
                />
                <PercentRow
                  label="Скидка"
                  value={working.discountPercent}
                  total={-calculation.discount}
                  currency={working.currency}
                  onChange={(value) => update((current) => ({ ...current, discountPercent: value }))}
                />
                <PercentRow
                  label="НДС"
                  value={working.vatPercent}
                  total={calculation.vat}
                  currency={working.currency}
                  onChange={(value) => update((current) => ({ ...current, vatPercent: value }))}
                />
              </div>
            ) : null}
          </section>

          <section id="estimate-technology" className="mt-8 border-t border-neutral-200 pt-4">
            <button
              type="button"
              onClick={() => setTechnologyOpen((open) => !open)}
              className="flex w-full items-center justify-between text-left text-sm"
            >
              <span>Основание расчёта · {working.technology.length} технологических операций</span>
              {technologyOpen ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
            </button>
            {technologyOpen ? (
              <ol className="mt-4 grid gap-2 text-sm text-neutral-600">
                {working.technology.map((step, index) => (
                  <li key={step.id} className="flex gap-3">
                    <span className="text-neutral-400">{index + 1}.</span>
                    <input
                      value={step.title}
                      onChange={(event) =>
                        update((current) => ({
                          ...current,
                          technology: current.technology.map((entry) =>
                            entry.id === step.id ? { ...entry, title: event.target.value } : entry
                          )
                        }))
                      }
                      className="min-w-0 flex-1 border-b border-transparent bg-transparent outline-none hover:border-neutral-200 focus:border-neutral-500"
                    />
                  </li>
                ))}
              </ol>
            ) : null}
          </section>

          <footer className="mt-12 flex items-center justify-between border-t border-neutral-200 pt-3 text-[10px] text-neutral-400">
            <span>Просметчик · версия {working.revision}</span>
            <span>{lineCount} позиций</span>
          </footer>
        </article>
      </main>

      {selected && details ? (
        <LineDetailsSheet
          draft={working}
          item={selected}
          onClose={() => setDetails(null)}
          onChange={(key, value) => updateItem(details.sectionId, details.itemId, key, value as never)}
          onApplyPrice={(value, source) => {
            const previousPrice = selected.unitPrice;
            updateItem(details.sectionId, details.itemId, "unitPrice", value);
            if (source) updateItem(details.sectionId, details.itemId, "source", source);
            const nextItem = { ...selected, unitPrice: value, ...(source ? { source } : {}) };
            void recordPriceEdit({ draft: working, item: nextItem, previousPrice });
          }}
          onDelete={() => {
            removeItem(details.sectionId, details.itemId, selected.name);
            setDetails(null);
          }}
        />
      ) : null}

      {deletedNotice ? (
        <div className="fixed bottom-4 left-1/2 z-[260] flex -translate-x-1/2 items-center gap-3 rounded-xl bg-neutral-950 px-4 py-3 text-sm text-white shadow-xl">
          <span>{deletedNotice}</span>
          <button type="button" onClick={undo} className="font-semibold text-white underline underline-offset-4">
            Отменить
          </button>
        </div>
      ) : null}
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(overlay, document.body);
}

function SaveState({ state }: { state: EstimateDocumentSaveState }) {
  return (
    <div className="mt-0.5 flex items-center justify-center gap-1 text-[10px] text-neutral-500">
      {state === "saving" ? (
        <><LoaderCircleIcon className="size-3 animate-spin" /> Сохраняем…</>
      ) : state === "error" ? (
        <><CircleAlertIcon className="size-3 text-red-500" /> Не сохранено</>
      ) : (
        <><CheckIcon className="size-3 text-emerald-600" /> Сохранено</>
      )}
    </div>
  );
}

function DocumentField({
  label,
  value,
  onChange,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "date";
}) {
  return (
    <label className="flex min-w-0 items-baseline gap-2">
      <span className="shrink-0 text-xs text-neutral-500">{label}:</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="min-w-0 flex-1 border-b border-transparent bg-transparent px-1 py-0.5 outline-none hover:border-neutral-200 focus:border-neutral-500"
      />
    </label>
  );
}

function DocumentSection({
  section,
  sectionIndex,
  currency,
  amounts,
  onSectionTitle,
  onAddItem,
  onRemoveSection,
  onUpdateItem,
  onOpenDetails,
  onRemoveItem,
  onRecordPriceEdit
}: {
  section: EstimateSection;
  sectionIndex: number;
  currency: string;
  amounts: Record<string, number>;
  onSectionTitle: (value: string) => void;
  onAddItem: () => void;
  onRemoveSection: () => void;
  onUpdateItem: <K extends keyof EstimateItem>(itemId: string, key: K, value: EstimateItem[K]) => void;
  onOpenDetails: (itemId: string) => void;
  onRemoveItem: (item: EstimateItem) => void;
  onRecordPriceEdit: (item: EstimateItem, previousPrice: number) => void;
}) {
  return (
    <section className="group/section">
      <div className="flex items-center gap-2 border-b-2 border-neutral-900 pb-1">
        <span className="text-xs font-semibold text-neutral-400">{sectionIndex + 1}</span>
        <input
          value={section.title}
          onChange={(event) => onSectionTitle(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold uppercase tracking-[0.04em] outline-none"
          aria-label={`Название раздела ${sectionIndex + 1}`}
        />
        <button
          type="button"
          onClick={onRemoveSection}
          className="editor-inline-danger opacity-0 transition group-hover/section:opacity-100 focus:opacity-100"
          aria-label={`Удалить раздел ${sectionIndex + 1}`}
        >
          <Trash2Icon />
        </button>
      </div>

      <div className="mt-2 hidden grid-cols-[30px_minmax(0,1fr)_58px_82px_104px_116px_30px] items-center gap-2 border-b border-neutral-200 pb-1 text-[9px] font-semibold uppercase tracking-[0.05em] text-neutral-400 md:grid">
        <span>№</span><span>Наименование</span><span>Ед.</span><span className="text-right">Кол.</span><span className="text-right">Цена</span><span className="text-right">Сумма</span><span />
      </div>

      <div className="divide-y divide-neutral-100">
        {section.items.map((item, itemIndex) => (
          <DocumentLine
            key={item.id}
            item={item}
            number={itemIndex + 1}
            currency={currency}
            amount={amounts[item.id] ?? 0}
            onChange={(key, value) => onUpdateItem(item.id, key, value as never)}
            onOpenDetails={() => onOpenDetails(item.id)}
            onRemove={() => onRemoveItem(item)}
            onRecordPriceEdit={(previousPrice) => onRecordPriceEdit(item, previousPrice)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={onAddItem}
        className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
      >
        <PlusIcon className="size-3.5" /> Добавить позицию
      </button>
    </section>
  );
}

function DocumentLine({
  item,
  number,
  currency,
  amount,
  onChange,
  onOpenDetails,
  onRemove,
  onRecordPriceEdit
}: {
  item: EstimateItem;
  number: number;
  currency: string;
  amount: number;
  onChange: <K extends keyof EstimateItem>(key: K, value: EstimateItem[K]) => void;
  onOpenDetails: () => void;
  onRemove: () => void;
  onRecordPriceEdit: (previousPrice: number) => void;
}) {
  const priceBeforeEdit = useRef(item.unitPrice);
  return (
    <div className="group/line py-2.5">
      <div className="hidden grid-cols-[30px_minmax(0,1fr)_58px_82px_104px_116px_30px] items-center gap-2 md:grid">
        <span className="relative text-xs text-neutral-400">
          <GripVerticalIcon className="absolute -left-5 top-1/2 size-3.5 -translate-y-1/2 opacity-0 group-hover/line:opacity-40" />
          {number}
        </span>
        <input
          value={item.name}
          onChange={(event) => onChange("name", event.target.value)}
          aria-label={`Наименование позиции ${number}`}
          className="editor-document-cell font-medium"
        />
        <input
          value={item.unit}
          onChange={(event) => onChange("unit", event.target.value)}
          aria-label={`Единица позиции ${number}`}
          className="editor-document-cell text-center"
        />
        <NumberCell
          label={`Количество позиции ${number}`}
          value={item.quantity}
          onChange={(value) => onChange("quantity", value)}
        />
        <div>
          <NumberCell
            label={`Цена позиции ${number}`}
            value={item.unitPrice}
            onFocus={() => { priceBeforeEdit.current = item.unitPrice; }}
            onBlur={() => onRecordPriceEdit(priceBeforeEdit.current)}
            onChange={(value) => onChange("unitPrice", value)}
          />
          <button
            type="button"
            onClick={onOpenDetails}
            className="mt-0.5 block w-full truncate text-right text-[9px] text-neutral-400 hover:text-neutral-700"
            aria-label={`Открыть источник цены позиции ${number}`}
          >
            {priceBadge(item)}
          </button>
        </div>
        <button
          type="button"
          onClick={onOpenDetails}
          className="text-right text-sm font-semibold tabular-nums hover:underline"
          aria-label={`Сумма позиции ${number}`}
        >
          {formatMoney(amount, currency)}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="editor-inline-danger opacity-0 transition group-hover/line:opacity-100 focus:opacity-100"
          aria-label={`Удалить позицию ${number}`}
        >
          <Trash2Icon />
        </button>
      </div>

      <button
        type="button"
        onClick={onOpenDetails}
        className="w-full rounded-lg px-1 py-1 text-left hover:bg-neutral-50 md:hidden"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{item.name}</div>
            <div className="mt-1 text-xs text-neutral-500">
              {item.quantity} {item.unit} × {formatMoney(item.unitPrice, currency)} · {priceBadge(item)}
            </div>
          </div>
          <div className="shrink-0 text-sm font-semibold tabular-nums">
            {formatMoney(amount, currency)}
          </div>
        </div>
      </button>
    </div>
  );
}

function NumberCell({
  label,
  value,
  onChange,
  onFocus,
  onBlur
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  return (
    <input
      type="number"
      min={0}
      step="any"
      value={value}
      onFocus={onFocus}
      onBlur={onBlur}
      onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
      aria-label={label}
      className="editor-document-cell text-right tabular-nums"
    />
  );
}

function LineDetailsSheet({
  draft,
  item,
  onClose,
  onChange,
  onApplyPrice,
  onDelete
}: {
  draft: EstimateDraft;
  item: EstimateItem;
  onClose: () => void;
  onChange: <K extends keyof EstimateItem>(key: K, value: EstimateItem[K]) => void;
  onApplyPrice: (price: number, source?: EstimateItem["source"]) => void;
  onDelete: () => void;
}) {
  const [tab, setTab] = useState<"edit" | "price">("edit");
  const [resolution, setResolution] = useState<PriceResolution | null>(null);
  const [history, setHistory] = useState<Array<{ id: string; price: number; stage: string; createdAt: string }>>([]);
  const [loadingPrice, setLoadingPrice] = useState(false);

  useEffect(() => {
    if (tab !== "price") return;
    let cancelled = false;
    setLoadingPrice(true);
    void Promise.all([
      resolveLocalPrice({
        workName: item.name,
        code: item.code,
        unit: item.unit,
        region: draft.region,
        locality: draft.objectName,
        currency: draft.currency,
        context: priceContextFromEstimate(draft)
      }),
      listPriceHistory(draft.id, item.id)
    ])
      .then(([nextResolution, nextHistory]) => {
        if (cancelled) return;
        setResolution(nextResolution);
        setHistory(nextHistory);
      })
      .finally(() => {
        if (!cancelled) setLoadingPrice(false);
      });
    return () => { cancelled = true; };
  }, [draft, item.code, item.id, item.name, item.unit, tab]);

  return (
    <div className="fixed inset-0 z-[250] flex items-end justify-end bg-black/20 sm:items-stretch" onMouseDown={onClose}>
      <aside
        className="max-h-[88dvh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-h-none sm:max-w-md sm:rounded-none"
        onMouseDown={(event) => event.stopPropagation()}
        data-testid="estimate-line-details"
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{item.name}</h3>
            <p className="mt-0.5 text-xs text-neutral-500">Детали позиции и цена</p>
          </div>
          <button type="button" onClick={onClose} className="editor-toolbar-icon" aria-label="Закрыть детали">
            <XIcon />
          </button>
        </header>
        <div className="flex border-b border-neutral-200 px-4 pt-2">
          <SheetTab active={tab === "edit"} onClick={() => setTab("edit")}>Редактирование</SheetTab>
          <SheetTab active={tab === "price"} onClick={() => setTab("price")}>Цена и рынок</SheetTab>
        </div>
        {tab === "edit" ? (
          <div className="grid gap-4 p-4">
            <SheetField label="Наименование">
              <textarea
                value={item.name}
                rows={2}
                onChange={(event) => onChange("name", event.target.value)}
                className="editor-sheet-input min-h-20 resize-y"
              />
            </SheetField>
            <div className="grid grid-cols-3 gap-3">
              <SheetField label="Количество"><NumberSheet value={item.quantity} onChange={(value) => onChange("quantity", value)} /></SheetField>
              <SheetField label="Единица"><input value={item.unit} onChange={(event) => onChange("unit", event.target.value)} className="editor-sheet-input" /></SheetField>
              <SheetField label="Цена"><NumberSheet value={item.unitPrice} onChange={(value) => onChange("unitPrice", value)} /></SheetField>
            </div>
            <details className="rounded-xl border border-neutral-200 p-3">
              <summary className="cursor-pointer text-sm font-medium">Профессиональные параметры</summary>
              <div className="mt-4 grid gap-3">
                <SheetField label="Код нормы"><input value={item.code} onChange={(event) => onChange("code", event.target.value)} className="editor-sheet-input" /></SheetField>
                <SheetField label="Тип ресурса">
                  <select value={item.resourceType} onChange={(event) => onChange("resourceType", event.target.value as ResourceType)} className="editor-sheet-input">
                    {Object.entries(resourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </SheetField>
                <div className="grid grid-cols-2 gap-3">
                  <SheetField label="Норма"><NumberSheet value={item.norm} onChange={(value) => onChange("norm", value)} /></SheetField>
                  <SheetField label="Коэффициент"><NumberSheet value={item.coefficient} onChange={(value) => onChange("coefficient", value)} /></SheetField>
                </div>
                <SheetField label="Источник цены"><input value={item.source.label} onChange={(event) => onChange("source", { ...item.source, label: event.target.value })} className="editor-sheet-input" /></SheetField>
                <SheetField label="Комментарий"><textarea value={item.comment} onChange={(event) => onChange("comment", event.target.value)} rows={3} className="editor-sheet-input resize-y" /></SheetField>
              </div>
            </details>
            <button type="button" onClick={onDelete} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50">
              <Trash2Icon className="size-4" /> Удалить позицию
            </button>
          </div>
        ) : (
          <PriceInspector
            draft={draft}
            item={item}
            resolution={resolution}
            history={history}
            loading={loadingPrice}
            onApply={onApplyPrice}
          />
        )}
      </aside>
    </div>
  );
}

function PriceInspector({
  draft,
  item,
  resolution,
  history,
  loading,
  onApply
}: {
  draft: EstimateDraft;
  item: EstimateItem;
  resolution: PriceResolution | null;
  history: Array<{ id: string; price: number; stage: string; createdAt: string }>;
  loading: boolean;
  onApply: (price: number, source?: EstimateItem["source"]) => void;
}) {
  if (loading) {
    return <div className="flex items-center gap-2 p-5 text-sm text-neutral-500"><LoaderCircleIcon className="size-4 animate-spin" /> Анализируем личные и региональные цены…</div>;
  }
  const selected = resolution?.selected;
  const market = resolution?.market;
  return (
    <div className="p-4">
      <div className="rounded-2xl bg-neutral-950 p-4 text-white">
        <div className="text-[10px] uppercase tracking-[0.08em] text-white/55">Цена в смете</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(item.unitPrice, draft.currency)} / {item.unit}</div>
        <div className="mt-1 text-xs text-white/65">{priceBadge(item)} · уверенность {Math.round(item.source.confidence)}%</div>
      </div>

      <div className="mt-4 grid gap-2">
        <PriceCandidateRow
          label="Лучшая внутренняя"
          value={selected?.price ?? null}
          detail={selected ? `${selected.sourceLabel || selected.sourceType} · ${selected.stage}` : "Пока нет"}
          currency={draft.currency}
          unit={item.unit}
          onApply={selected ? () => onApply(selected.price, {
            ...item.source,
            kind: selected.sourceType === "personal" ? "personal" : selected.sourceType === "organization" ? "organization" : selected.sourceType === "regional" ? "regional" : "previous-estimate",
            label: selected.sourceLabel || "Внутренняя база Просметчика",
            date: selected.observedAt.slice(0, 10),
            confidence: selected.confidence,
            confirmed: ["approved", "sent_to_client", "contracted", "executed"].includes(selected.stage)
          }) : undefined}
        />
        <PriceCandidateRow
          label="Медиана региона"
          value={market?.median ?? null}
          detail={market ? `${market.p25.toFixed(0)}–${market.p75.toFixed(0)} · ${market.sampleCount} наблюдений` : "Недостаточно данных"}
          currency={draft.currency}
          unit={item.unit}
          onApply={market ? () => onApply(market.median, {
            ...item.source,
            kind: "regional",
            label: `Рынок ${market.region || draft.region}`,
            date: market.updatedAt.slice(0, 10),
            confidence: market.confidence,
            confirmed: false
          }) : undefined}
        />
      </div>

      {resolution?.needsResearch ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800">
          <CircleAlertIcon className="mr-1 inline size-3.5" /> {resolution.reason}. Для точной рыночной цены нужен отдельный поиск источников.
        </div>
      ) : null}

      <div className="mt-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.05em] text-neutral-400"><HistoryIcon className="size-3.5" /> История цены</div>
        <div className="mt-2 divide-y divide-neutral-100 rounded-xl border border-neutral-200">
          {history.length ? history.slice(0, 12).map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <div>
                <div className="font-medium">{formatMoney(entry.price, draft.currency)} / {item.unit}</div>
                <div className="mt-0.5 text-[11px] text-neutral-500">{entry.stage} · {new Date(entry.createdAt).toLocaleString("ru-RU")}</div>
              </div>
            </div>
          )) : <div className="px-3 py-5 text-center text-xs text-neutral-500">История появится после первой правки или утверждения.</div>}
        </div>
      </div>
    </div>
  );
}

function PriceCandidateRow({
  label,
  value,
  detail,
  currency,
  unit,
  onApply
}: {
  label: string;
  value: number | null;
  detail: string;
  currency: string;
  unit: string;
  onApply?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-neutral-200 p-3">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-neutral-500">{label}</div>
        <div className="mt-0.5 text-sm font-semibold">{value === null ? "—" : `${formatMoney(value, currency)} / ${unit}`}</div>
        <div className="mt-0.5 truncate text-[11px] text-neutral-400">{detail}</div>
      </div>
      {onApply ? <button type="button" onClick={onApply} className="h-8 rounded-lg bg-neutral-100 px-3 text-xs font-medium hover:bg-neutral-200">Применить</button> : null}
    </div>
  );
}

function SheetField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5 text-xs font-medium text-neutral-500"><span>{label}</span>{children}</label>;
}

function NumberSheet({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <input type="number" min={0} step="any" value={value} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} className="editor-sheet-input text-right tabular-nums" />;
}

function SheetTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className={cn("border-b-2 px-3 py-2.5 text-sm font-medium", active ? "border-neutral-950 text-neutral-950" : "border-transparent text-neutral-400")}>{children}</button>;
}

function TotalRow({ label, value, currency }: { label: string; value: number; currency: string }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-neutral-500">{label}</span><span className="tabular-nums">{formatMoney(value, currency)}</span></div>;
}

function PercentRow({
  label,
  value,
  total,
  currency,
  onChange
}: {
  label: string;
  value: number;
  total: number;
  currency: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="flex items-center gap-2 text-neutral-500">
        <span>{label}</span>
        <span className="inline-flex items-center rounded-md border border-neutral-200 px-1.5">
          <input type="number" min={0} step="any" value={value} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} className="h-7 w-12 bg-transparent text-right text-xs outline-none" />
          <span className="text-[10px]">%</span>
        </span>
      </label>
      <span className="tabular-nums">{formatMoney(total, currency)}</span>
    </div>
  );
}
