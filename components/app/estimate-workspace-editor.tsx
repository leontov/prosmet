"use client";

import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  LoaderCircleIcon,
  PlusIcon,
  Share2Icon,
  Trash2Icon,
  XIcon
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  calculateEstimate,
  makeId,
  type EstimateDraft,
  type EstimateItem,
  type EstimateSection,
  type ResourceType
} from "@/lib/domain/estimate";
import { cn, formatMoney } from "@/lib/utils";

export type EstimateWorkspaceMode = "edit" | "preview";
export type EstimateWorkspaceSaveState = "saved" | "saving" | "offline" | "error";

type ChangeEstimate = (updater: (draft: EstimateDraft) => EstimateDraft) => void;

type Props = {
  draft: EstimateDraft;
  mode: EstimateWorkspaceMode;
  saveState: EstimateWorkspaceSaveState;
  busy: "finish" | "pdf" | "xlsx" | "share" | null;
  error: string | null;
  onChange: ChangeEstimate;
  onClose: () => void;
  onFinish: () => void;
  onEdit: () => void;
  onExportPdf: () => void;
  onExportXlsx: () => void;
  onShare: () => void;
};

type ActiveRow = { sectionId: string; itemId: string } | null;

const resourceLabels: Record<ResourceType, string> = {
  work: "Работа",
  material: "Материал",
  machine: "Машина",
  equipment: "Оборудование",
  labor: "Труд",
  service: "Услуга",
  logistics: "Логистика"
};

function blankItem(): EstimateItem {
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
      label: "Источник не указан",
      kind: "unknown",
      region: "",
      date: "",
      currency: "RUB",
      vatIncluded: false,
      deliveryIncluded: false,
      confidence: 0,
      confirmed: false,
      status: "suggested"
    },
    comment: "",
    warning: "",
    priceContext: {
      materialsIncluded: false,
      deliveryIncluded: false,
      equipmentIncluded: false,
      vatIncluded: false,
      constrainedConditions: false,
      qualityLevel: "standard",
      urgency: "normal",
      season: ""
    }
  };
}

function blankSection(): EstimateSection {
  return {
    id: makeId("section"),
    title: "Новый раздел",
    items: [blankItem()]
  };
}

export function EstimateWorkspaceEditor({
  draft,
  mode,
  saveState,
  busy,
  error,
  onChange,
  onClose,
  onFinish,
  onEdit,
  onExportPdf,
  onExportXlsx,
  onShare
}: Props) {
  const calculation = useMemo(() => calculateEstimate(draft), [draft]);
  const [activeRow, setActiveRow] = useState<ActiveRow>(null);

  const updateItem = <K extends keyof EstimateItem>(
    sectionId: string,
    itemId: string,
    key: K,
    value: EstimateItem[K]
  ) => {
    onChange((current) => ({
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

  const deleteItem = (sectionId: string, itemId: string) => {
    onChange((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId
          ? { ...section, items: section.items.filter((item) => item.id !== itemId) }
          : section
      )
    }));
    setActiveRow(null);
  };

  const deleteSection = (sectionId: string) => {
    onChange((current) => ({
      ...current,
      sections: current.sections.filter((section) => section.id !== sectionId)
    }));
  };

  let position = 0;

  return (
    <div
      className="prosmet-estimate-layer"
      data-testid="estimate-workspace-layer"
      role="presentation"
    >
      <button
        type="button"
        className="prosmet-estimate-backdrop"
        aria-label="Закрыть редактор сметы"
        onClick={onClose}
      />

      <section
        className="prosmet-estimate-sheet"
        data-testid="estimate-document-overlay"
        aria-label="Редактор сметы"
      >
        <header className="prosmet-estimate-toolbar no-print">
          <button
            type="button"
            onClick={onClose}
            className="prosmet-toolbar-button"
            aria-label="Закрыть редактор"
          >
            <ArrowLeftIcon className="size-4" />
            <span className="hidden xl:inline">Назад</span>
          </button>

          <div className="min-w-0 flex-1 px-1">
            <div className="truncate text-sm font-semibold text-neutral-950">
              {draft.title}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-neutral-500">
              <SaveIndicator state={saveState} />
              <span className="hidden sm:inline">Версия {draft.revision}</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <ToolbarIcon label="Скачать PDF" onClick={onExportPdf} disabled={busy !== null}>
              {busy === "pdf" ? (
                <LoaderCircleIcon className="size-4 animate-spin" />
              ) : (
                <FileTextIcon className="size-4" />
              )}
            </ToolbarIcon>
            <ToolbarIcon label="Скачать Excel" onClick={onExportXlsx} disabled={busy !== null}>
              {busy === "xlsx" ? (
                <LoaderCircleIcon className="size-4 animate-spin" />
              ) : (
                <FileSpreadsheetIcon className="size-4" />
              )}
            </ToolbarIcon>
            <ToolbarIcon label="Поделиться" onClick={onShare} disabled={busy !== null}>
              {busy === "share" ? (
                <LoaderCircleIcon className="size-4 animate-spin" />
              ) : (
                <Share2Icon className="size-4" />
              )}
            </ToolbarIcon>

            {mode === "preview" ? (
              <button type="button" className="prosmet-primary-action" onClick={onEdit}>
                Редактировать
              </button>
            ) : (
              <button
                type="button"
                className="prosmet-primary-action"
                onClick={onFinish}
                disabled={busy !== null}
              >
                {busy === "finish" ? (
                  <LoaderCircleIcon className="size-4 animate-spin" />
                ) : (
                  <CheckIcon className="size-4" />
                )}
                <span>Готово</span>
              </button>
            )}
          </div>
        </header>

        <div className="prosmet-estimate-scroll prosmet-scrollbar">
          {mode === "preview" ? (
            <section
              className="mx-auto w-full max-w-[960px]"
              data-testid="estimate-revision-preview"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <CheckIcon className="size-4" />
                <strong>Смета · Версия {draft.revision} · Сохранена</strong>
                <span className="ml-auto text-xs text-emerald-700">
                  Все изменения уже записаны
                </span>
              </div>
              <EstimatePaper
                draft={draft}
                editable={false}
                calculation={calculation}
                onChange={onChange}
                updateItem={updateItem}
                deleteItem={deleteItem}
                deleteSection={deleteSection}
                onOpenRow={setActiveRow}
              />
            </section>
          ) : (
            <EstimatePaper
              draft={draft}
              editable
              calculation={calculation}
              onChange={onChange}
              updateItem={updateItem}
              deleteItem={deleteItem}
              deleteSection={deleteSection}
              onOpenRow={setActiveRow}
            />
          )}
        </div>

        {error ? (
          <div className="absolute bottom-4 left-1/2 z-30 w-[min(92%,620px)] -translate-x-1/2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-lg">
            {error}
          </div>
        ) : null}
      </section>

      {activeRow ? (
        <EstimateRowEditor
          draft={draft}
          row={activeRow}
          onClose={() => setActiveRow(null)}
          onChange={updateItem}
          onDelete={deleteItem}
        />
      ) : null}
    </div>
  );
}

function EstimatePaper({
  draft,
  editable,
  calculation,
  onChange,
  updateItem,
  deleteItem,
  deleteSection,
  onOpenRow
}: {
  draft: EstimateDraft;
  editable: boolean;
  calculation: ReturnType<typeof calculateEstimate>;
  onChange: ChangeEstimate;
  updateItem: <K extends keyof EstimateItem>(
    sectionId: string,
    itemId: string,
    key: K,
    value: EstimateItem[K]
  ) => void;
  deleteItem: (sectionId: string, itemId: string) => void;
  deleteSection: (sectionId: string) => void;
  onOpenRow: (row: ActiveRow) => void;
}) {
  let position = 0;

  return (
    <article
      className="prosmet-estimate-paper print-page"
      data-testid="estimate-document-canvas"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-200 pb-5">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
            Смета
          </div>
          {editable ? (
            <input
              aria-label="Название сметы"
              value={draft.title}
              onChange={(event) =>
                onChange((current) => ({ ...current, title: event.target.value }))
              }
              className="mt-1 w-full bg-transparent text-2xl font-semibold tracking-[-0.035em] outline-none sm:text-3xl"
            />
          ) : (
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
              {draft.title}
            </h1>
          )}
        </div>
        <div className="rounded-2xl bg-neutral-950 px-5 py-4 text-right text-white shadow-sm">
          <div className="text-[10px] uppercase tracking-[0.12em] text-white/55">Итого</div>
          <div className="mt-1 text-2xl font-semibold tracking-[-0.04em]">
            {formatMoney(calculation.total, draft.currency)}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetaField
          label="Объект"
          value={draft.objectName}
          editable={editable}
          onChange={(value) => onChange((current) => ({ ...current, objectName: value }))}
        />
        <MetaField
          label="Заказчик"
          value={draft.customer}
          editable={editable}
          onChange={(value) => onChange((current) => ({ ...current, customer: value }))}
        />
        <MetaField
          label="Регион"
          value={draft.region}
          editable={editable}
          onChange={(value) => onChange((current) => ({ ...current, region: value }))}
        />
        <MetaField
          label="Дата"
          value={draft.date}
          editable={editable}
          type="date"
          onChange={(value) => onChange((current) => ({ ...current, date: value }))}
        />
      </div>

      <div className="mt-7 hidden grid-cols-[42px_minmax(230px,1fr)_70px_92px_112px_120px_40px] border-y border-neutral-900 bg-neutral-50 text-[10px] font-semibold uppercase tracking-[0.06em] text-neutral-500 sm:grid">
        <span className="px-2 py-3 text-center">№</span>
        <span className="px-2 py-3">Наименование</span>
        <span className="px-2 py-3 text-center">Ед.</span>
        <span className="px-2 py-3 text-right">Кол.</span>
        <span className="px-2 py-3 text-right">Цена</span>
        <span className="px-2 py-3 text-right">Сумма</span>
        <span />
      </div>

      <div className="border-b border-neutral-900">
        {draft.sections.map((section) => (
          <section key={section.id} className="group/section">
            <div className="flex items-center gap-2 border-b border-neutral-300 bg-neutral-100 px-3 py-2.5">
              {editable ? (
                <input
                  aria-label={`Название раздела ${section.title}`}
                  value={section.title}
                  onChange={(event) =>
                    onChange((current) => ({
                      ...current,
                      sections: current.sections.map((entry) =>
                        entry.id === section.id
                          ? { ...entry, title: event.target.value }
                          : entry
                      )
                    }))
                  }
                  className="min-w-0 flex-1 bg-transparent text-xs font-semibold uppercase tracking-[0.06em] outline-none"
                />
              ) : (
                <h2 className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-[0.06em]">
                  {section.title}
                </h2>
              )}
              <span className="text-xs font-semibold text-neutral-500">
                {formatMoney(calculation.sectionTotals[section.id] ?? 0, draft.currency)}
              </span>
              {editable ? (
                <button
                  type="button"
                  aria-label={`Удалить раздел ${section.title}`}
                  onClick={() => deleteSection(section.id)}
                  className="flex size-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2Icon className="size-4" />
                </button>
              ) : null}
            </div>

            {section.items.map((item) => {
              position += 1;
              const row = { sectionId: section.id, itemId: item.id };
              return (
                <EstimateRow
                  key={item.id}
                  position={position}
                  item={item}
                  amount={calculation.itemAmounts[item.id] ?? 0}
                  currency={draft.currency}
                  editable={editable}
                  onChange={(key, value) => updateItem(section.id, item.id, key, value)}
                  onDelete={() => deleteItem(section.id, item.id)}
                  onOpen={() => onOpenRow(row)}
                />
              );
            })}

            {editable ? (
              <button
                type="button"
                onClick={() =>
                  onChange((current) => ({
                    ...current,
                    sections: current.sections.map((entry) =>
                      entry.id === section.id
                        ? { ...entry, items: [...entry.items, blankItem()] }
                        : entry
                    )
                  }))
                }
                className="flex min-h-11 w-full items-center gap-2 border-t border-dashed border-neutral-200 px-3 text-sm text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"
              >
                <PlusIcon className="size-4" /> Добавить позицию
              </button>
            ) : null}
          </section>
        ))}
      </div>

      {editable ? (
        <button
          type="button"
          onClick={() =>
            onChange((current) => ({
              ...current,
              sections: [...current.sections, blankSection()]
            }))
          }
          className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 text-sm font-medium text-neutral-500 hover:border-neutral-500 hover:text-neutral-900"
        >
          <PlusIcon className="size-4" /> Добавить раздел
        </button>
      ) : null}

      <div className="mt-8 grid gap-5 border-t border-neutral-200 pt-5 lg:grid-cols-[1fr_360px]">
        <details className="group rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">
            <span>Технология и подробности расчёта</span>
            <ChevronDownIcon className="size-4 transition group-open:rotate-180" />
          </summary>
          <div className="mt-4 space-y-4 text-sm leading-6 text-neutral-600">
            {draft.technology.length ? (
              <ol className="space-y-2">
                {draft.technology.map((step, index) => (
                  <li key={step.id} className="flex gap-3">
                    <span className="font-semibold text-neutral-400">{index + 1}.</span>
                    <span>{step.title}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p>Технологическая карта пока не заполнена.</p>
            )}
            {draft.assumptions.length ? (
              <DetailList title="Допущения" items={draft.assumptions} />
            ) : null}
            {draft.warnings.length ? (
              <DetailList title="Требует проверки" items={draft.warnings} />
            ) : null}
          </div>
        </details>

        <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4 text-sm">
          <TotalLine label="Прямые затраты" value={calculation.directCost} currency={draft.currency} />
          <PercentField
            label="Накладные"
            value={draft.overheadPercent}
            amount={calculation.overhead}
            currency={draft.currency}
            editable={editable}
            onChange={(value) =>
              onChange((current) => ({ ...current, overheadPercent: value }))
            }
          />
          <PercentField
            label="Прибыль"
            value={draft.profitPercent}
            amount={calculation.profit}
            currency={draft.currency}
            editable={editable}
            onChange={(value) =>
              onChange((current) => ({ ...current, profitPercent: value }))
            }
          />
          <PercentField
            label="Скидка"
            value={draft.discountPercent}
            amount={-calculation.discount}
            currency={draft.currency}
            editable={editable}
            onChange={(value) =>
              onChange((current) => ({ ...current, discountPercent: value }))
            }
          />
          <PercentField
            label="НДС"
            value={draft.vatPercent}
            amount={calculation.vat}
            currency={draft.currency}
            editable={editable}
            onChange={(value) =>
              onChange((current) => ({ ...current, vatPercent: value }))
            }
          />
          <div className="mt-3 flex items-end justify-between border-t-2 border-neutral-950 pt-4">
            <strong className="uppercase tracking-[0.08em]">Итого</strong>
            <strong className="text-xl tracking-[-0.03em]">
              {formatMoney(calculation.total, draft.currency)}
            </strong>
          </div>
        </div>
      </div>
    </article>
  );
}

function EstimateRow({
  position,
  item,
  amount,
  currency,
  editable,
  onChange,
  onDelete,
  onOpen
}: {
  position: number;
  item: EstimateItem;
  amount: number;
  currency: string;
  editable: boolean;
  onChange: <K extends keyof EstimateItem>(key: K, value: EstimateItem[K]) => void;
  onDelete: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="border-b border-neutral-200 last:border-b-0">
      <div className="hidden min-h-12 grid-cols-[42px_minmax(230px,1fr)_70px_92px_112px_120px_40px] items-center sm:grid">
        <span className="px-2 text-center text-sm text-neutral-500">{position}</span>
        {editable ? (
          <input
            aria-label={`Наименование позиции ${position}`}
            value={item.name}
            onChange={(event) => onChange("name", event.target.value)}
            className="prosmet-inline-cell px-2 text-sm font-medium"
          />
        ) : (
          <span className="px-2 py-3 text-sm font-medium">{item.name}</span>
        )}
        {editable ? (
          <input
            aria-label={`Единица позиции ${position}`}
            value={item.unit}
            onChange={(event) => onChange("unit", event.target.value)}
            className="prosmet-inline-cell px-2 text-center text-sm"
          />
        ) : (
          <span className="px-2 text-center text-sm">{item.unit}</span>
        )}
        {editable ? (
          <input
            aria-label={`Количество позиции ${position}`}
            type="number"
            min="0"
            step="any"
            value={item.quantity}
            onChange={(event) => onChange("quantity", Math.max(0, Number(event.target.value) || 0))}
            className="prosmet-inline-cell px-2 text-right text-sm"
          />
        ) : (
          <span className="px-2 text-right text-sm tabular-nums">{item.quantity}</span>
        )}
        {editable ? (
          <input
            aria-label={`Цена позиции ${position}`}
            type="number"
            min="0"
            step="any"
            value={item.unitPrice}
            onChange={(event) => onChange("unitPrice", Math.max(0, Number(event.target.value) || 0))}
            className="prosmet-inline-cell px-2 text-right text-sm font-medium"
          />
        ) : (
          <span className="px-2 text-right text-sm tabular-nums">
            {formatMoney(item.unitPrice, currency)}
          </span>
        )}
        <span className="px-2 text-right text-sm font-semibold tabular-nums">
          {formatMoney(amount, currency)}
        </span>
        {editable ? (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Удалить позицию ${item.name}`}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2Icon className="size-4" />
          </button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onOpen}
        aria-label={`${item.name} — открыть позицию`}
        className="grid w-full gap-2 px-3 py-3 text-left sm:hidden"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-xs font-semibold text-neutral-500">
            {position}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium leading-5 text-neutral-950">{item.name}</div>
            <div className="mt-1 text-xs text-neutral-500">
              {item.quantity} {item.unit} × {formatMoney(item.unitPrice, currency)}
            </div>
          </div>
          <strong className="shrink-0 text-sm tabular-nums">
            {formatMoney(amount, currency)}
          </strong>
        </div>
      </button>
    </div>
  );
}

function EstimateRowEditor({
  draft,
  row,
  onClose,
  onChange,
  onDelete
}: {
  draft: EstimateDraft;
  row: NonNullable<ActiveRow>;
  onClose: () => void;
  onChange: <K extends keyof EstimateItem>(
    sectionId: string,
    itemId: string,
    key: K,
    value: EstimateItem[K]
  ) => void;
  onDelete: (sectionId: string, itemId: string) => void;
}) {
  const section = draft.sections.find((entry) => entry.id === row.sectionId);
  const item = section?.items.find((entry) => entry.id === row.itemId);
  if (!item) return null;

  return (
    <div className="fixed inset-0 z-[240]" role="dialog" aria-modal="true" aria-label="Редактирование позиции">
      <button
        type="button"
        className="absolute inset-0 bg-black/25 backdrop-blur-[1px]"
        aria-label="Закрыть редактор позиции"
        onClick={onClose}
      />
      <section className="prosmet-row-sheet prosmet-scrollbar">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-neutral-200 lg:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-400">
              Позиция сметы
            </div>
            <h3 className="mt-1 text-lg font-semibold">{item.name}</h3>
          </div>
          <button type="button" onClick={onClose} className="prosmet-toolbar-icon" aria-label="Закрыть">
            <XIcon className="size-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Наименование" wide>
            <input
              className="prosmet-input"
              value={item.name}
              onChange={(event) => onChange(row.sectionId, row.itemId, "name", event.target.value)}
            />
          </Field>
          <Field label="Количество">
            <input
              className="prosmet-input"
              type="number"
              min="0"
              step="any"
              value={item.quantity}
              onChange={(event) =>
                onChange(row.sectionId, row.itemId, "quantity", Math.max(0, Number(event.target.value) || 0))
              }
            />
          </Field>
          <Field label="Единица">
            <input
              className="prosmet-input"
              value={item.unit}
              onChange={(event) => onChange(row.sectionId, row.itemId, "unit", event.target.value)}
            />
          </Field>
          <Field label="Цена">
            <input
              className="prosmet-input"
              type="number"
              min="0"
              step="any"
              value={item.unitPrice}
              onChange={(event) =>
                onChange(row.sectionId, row.itemId, "unitPrice", Math.max(0, Number(event.target.value) || 0))
              }
            />
          </Field>
          <Field label="Тип ресурса">
            <select
              className="prosmet-input"
              value={item.resourceType}
              onChange={(event) =>
                onChange(row.sectionId, row.itemId, "resourceType", event.target.value as ResourceType)
              }
            >
              {Object.entries(resourceLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Код нормы">
            <input
              className="prosmet-input"
              value={item.code}
              onChange={(event) => onChange(row.sectionId, row.itemId, "code", event.target.value)}
            />
          </Field>
          <Field label="Комментарий" wide>
            <textarea
              className="prosmet-input"
              value={item.comment}
              onChange={(event) => onChange(row.sectionId, row.itemId, "comment", event.target.value)}
            />
          </Field>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onDelete(row.sectionId, row.itemId)}
            className="inline-flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <Trash2Icon className="size-4" /> Удалить
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-xl bg-neutral-950 px-6 text-sm font-semibold text-white hover:bg-black"
          >
            Готово
          </button>
        </div>
      </section>
    </div>
  );
}

function SaveIndicator({ state }: { state: EstimateWorkspaceSaveState }) {
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <LoaderCircleIcon className="size-3 animate-spin" /> Сохраняем…
      </span>
    );
  }
  if (state === "offline") return <span>Сохранено локально</span>;
  if (state === "error") return <span className="text-red-600">Ошибка сохранения</span>;
  return <span className="inline-flex items-center gap-1.5"><CheckIcon className="size-3" /> Автосохранено</span>;
}

function ToolbarIcon({
  label,
  onClick,
  disabled,
  children
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="prosmet-toolbar-icon"
    >
      {children}
    </button>
  );
}

function MetaField({
  label,
  value,
  editable,
  type = "text",
  onChange
}: {
  label: string;
  value: string;
  editable: boolean;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
        {label}
      </span>
      {editable ? (
        <input
          aria-label={label}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 min-w-0 rounded-lg border border-transparent bg-neutral-50 px-3 text-sm outline-none transition hover:border-neutral-200 focus:border-neutral-300 focus:bg-white"
        />
      ) : (
        <span className="min-h-9 rounded-lg bg-neutral-50 px-3 py-2 text-sm">
          {value || "Не указано"}
        </span>
      )}
    </label>
  );
}

function PercentField({
  label,
  value,
  amount,
  currency,
  editable,
  onChange
}: {
  label: string;
  value: number;
  amount: number;
  currency: string;
  editable: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-neutral-600">
      <span className="flex items-center gap-1.5">
        {label}
        {editable ? (
          <span className="inline-flex items-center rounded-md bg-neutral-100 px-1.5">
            <input
              aria-label={`${label}, процентов`}
              type="number"
              min="0"
              step="any"
              value={value}
              onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
              className="h-7 w-12 bg-transparent text-right text-xs outline-none"
            />
            <span className="text-xs">%</span>
          </span>
        ) : (
          <span className="text-xs text-neutral-400">{value}%</span>
        )}
      </span>
      <span className={cn("tabular-nums", amount < 0 && "text-red-600") }>
        {amount < 0 ? "− " : ""}{formatMoney(Math.abs(amount), currency)}
      </span>
    </div>
  );
}

function TotalLine({ label, value, currency }: { label: string; value: number; currency: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-neutral-600">
      <span>{label}</span>
      <span className="tabular-nums">{formatMoney(value, currency)}</span>
    </div>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="font-semibold text-neutral-900">{title}</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={cn("grid gap-1.5 text-sm", wide && "sm:col-span-2")}>
      <span className="font-medium text-neutral-700">{label}</span>
      {children}
    </label>
  );
}
