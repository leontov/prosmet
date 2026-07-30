"use client";

import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  SendIcon,
  Share2Icon,
  ShieldCheckIcon,
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

export type PremiumEstimateWorkspaceMode = "edit" | "preview";
export type PremiumEstimateWorkspaceSaveState = "saved" | "saving" | "offline" | "error";
export type PremiumEstimateWorkspaceBusy = "finish" | "approve" | "pdf" | "xlsx" | "share" | null;

type ChangeEstimate = (updater: (draft: EstimateDraft) => EstimateDraft) => void;
type ActiveRow = { sectionId: string; itemId: string } | null;

type Props = {
  draft: EstimateDraft;
  mode: PremiumEstimateWorkspaceMode;
  saveState: PremiumEstimateWorkspaceSaveState;
  busy: PremiumEstimateWorkspaceBusy;
  error: string | null;
  onChange: ChangeEstimate;
  onClose: () => void;
  onSaveVersion: () => void;
  onApprove: () => void;
  onEdit: () => void;
  onExportPdf: () => void;
  onExportXlsx: () => void;
  onShare: () => void;
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
  return { id: makeId("section"), title: "Новый раздел", items: [blankItem()] };
}

function parseDecimal(value: string) {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function formatDateRu(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value || "Дата не указана";
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function itemCount(draft: EstimateDraft) {
  return draft.sections.reduce((total, section) => total + section.items.length, 0);
}

function pluralPositions(value: number) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value} позиция`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${value} позиции`;
  return `${value} позиций`;
}

export function PremiumEstimateWorkspaceEditor({
  draft,
  mode,
  saveState,
  busy,
  error,
  onChange,
  onClose,
  onSaveVersion,
  onApprove,
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

  return (
    <div className="prosmet-estimate-layer prosmet-premium-estimate-layer" data-testid="estimate-workspace-layer">
      <button
        type="button"
        className="prosmet-estimate-backdrop"
        aria-label="Закрыть редактор сметы"
        onClick={onClose}
      />

      <section
        className="prosmet-estimate-sheet prosmet-premium-estimate-sheet"
        data-testid="estimate-document-overlay"
        aria-label="Редактор сметы"
      >
        <header className="prosmet-premium-estimate-toolbar no-print">
          <button type="button" onClick={onClose} className="prosmet-premium-estimate-back" aria-label="Закрыть редактор">
            <ArrowLeftIcon className="size-4" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="prosmet-premium-toolbar-title">{draft.title}</div>
            <div className="prosmet-premium-toolbar-meta">
              <SaveIndicator state={saveState} />
              <span>Версия {draft.revision}</span>
              <span className="hidden sm:inline">· {pluralPositions(itemCount(draft))}</span>
            </div>
          </div>

          <div className="prosmet-premium-toolbar-actions">
            <ToolbarIcon label="Скачать PDF" onClick={onExportPdf} disabled={busy !== null}>
              {busy === "pdf" ? <LoaderCircleIcon className="size-4 animate-spin" /> : <FileTextIcon className="size-4" />}
            </ToolbarIcon>
            <ToolbarIcon label="Скачать Excel" onClick={onExportXlsx} disabled={busy !== null}>
              {busy === "xlsx" ? <LoaderCircleIcon className="size-4 animate-spin" /> : <FileSpreadsheetIcon className="size-4" />}
            </ToolbarIcon>
            <ToolbarIcon label="Передать клиенту" onClick={onShare} disabled={busy !== null}>
              {busy === "share" ? <LoaderCircleIcon className="size-4 animate-spin" /> : <Share2Icon className="size-4" />}
            </ToolbarIcon>

            {mode === "preview" ? (
              <button type="button" className="prosmet-premium-secondary-action hidden sm:inline-flex" onClick={onEdit}>
                <PencilIcon className="size-4" /> Редактировать
              </button>
            ) : null}

            {mode === "edit" ? (
              <button
                type="button"
                className="prosmet-premium-primary-action hidden sm:inline-flex"
                onClick={onSaveVersion}
                disabled={busy !== null}
              >
                {busy === "finish" ? <LoaderCircleIcon className="size-4 animate-spin" /> : <CheckIcon className="size-4" />}
                Сохранить версию
              </button>
            ) : (
              <button
                type="button"
                className="prosmet-premium-primary-action hidden sm:inline-flex"
                onClick={onApprove}
                disabled={busy !== null || draft.status === "approved"}
              >
                {busy === "approve" ? <LoaderCircleIcon className="size-4 animate-spin" /> : <ShieldCheckIcon className="size-4" />}
                {draft.status === "approved" ? "Утверждена" : "Утвердить"}
              </button>
            )}
          </div>
        </header>

        <div className="prosmet-estimate-scroll prosmet-premium-estimate-scroll prosmet-scrollbar">
          {mode === "preview" ? (
            <section className="mx-auto w-full max-w-[1080px]" data-testid="estimate-revision-preview">
              <div className="prosmet-premium-version-banner">
                <span className="flex size-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <CheckIcon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm">Версия {draft.revision} сохранена</strong>
                  <span className="block text-xs text-emerald-700">Изменения зафиксированы и готовы к утверждению</span>
                </span>
              </div>
              <PremiumEstimatePaper
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
            <PremiumEstimatePaper
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

        <div className="prosmet-premium-mobile-actionbar no-print">
          {mode === "edit" ? (
            <button type="button" onClick={onSaveVersion} disabled={busy !== null} className="prosmet-premium-mobile-primary">
              {busy === "finish" ? <LoaderCircleIcon className="size-4 animate-spin" /> : <CheckIcon className="size-4" />}
              Сохранить версию
            </button>
          ) : (
            <>
              <button type="button" onClick={onEdit} className="prosmet-premium-mobile-secondary">
                <PencilIcon className="size-4" /> Изменить
              </button>
              <button type="button" onClick={onApprove} disabled={busy !== null || draft.status === "approved"} className="prosmet-premium-mobile-primary">
                {busy === "approve" ? <LoaderCircleIcon className="size-4 animate-spin" /> : <ShieldCheckIcon className="size-4" />}
                {draft.status === "approved" ? "Утверждена" : "Утвердить"}
              </button>
            </>
          )}
        </div>

        {error ? <div className="prosmet-premium-estimate-error">{error}</div> : null}
      </section>

      {activeRow ? (
        <PremiumEstimateRowEditor
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

function PremiumEstimatePaper({
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
  updateItem: <K extends keyof EstimateItem>(sectionId: string, itemId: string, key: K, value: EstimateItem[K]) => void;
  deleteItem: (sectionId: string, itemId: string) => void;
  deleteSection: (sectionId: string) => void;
  onOpenRow: (row: ActiveRow) => void;
}) {
  let position = 0;

  return (
    <article className="prosmet-estimate-paper prosmet-premium-estimate-paper print-page" data-testid="estimate-document-canvas">
      <header className="prosmet-premium-document-head">
        <div className="min-w-0 flex-1">
          <div className="prosmet-premium-eyebrow">Смета</div>
          {editable ? (
            <textarea
              aria-label="Название сметы"
              value={draft.title}
              rows={1}
              onChange={(event) => onChange((current) => ({ ...current, title: event.target.value }))}
              className="prosmet-premium-estimate-title"
            />
          ) : (
            <h1 className="prosmet-premium-estimate-title-readonly">{draft.title}</h1>
          )}
          <p className="mt-2 text-sm text-neutral-500">
            {draft.objectName || "Объект не указан"} · {pluralPositions(itemCount(draft))}
          </p>
        </div>
        <div className="prosmet-premium-total-card">
          <span>Итого</span>
          <strong>{formatMoney(calculation.total, draft.currency)}</strong>
        </div>
      </header>

      <details className="prosmet-premium-mobile-meta">
        <summary>
          <span className="min-w-0 flex-1">
            <strong className="block truncate">{draft.objectName || "Объект не указан"}</strong>
            <span className="mt-0.5 block truncate text-xs text-neutral-500">
              {[draft.customer || "Заказчик не указан", draft.region || "Регион не указан", formatDateRu(draft.date)].join(" · ")}
            </span>
          </span>
          <span className="text-xs font-medium text-neutral-500">Изменить</span>
          <ChevronDownIcon className="size-4 text-neutral-400" />
        </summary>
        <div className="grid gap-3 pt-4">
          <MetaField label="Объект" value={draft.objectName} editable={editable} onChange={(value) => onChange((current) => ({ ...current, objectName: value }))} />
          <MetaField label="Заказчик" value={draft.customer} editable={editable} onChange={(value) => onChange((current) => ({ ...current, customer: value }))} />
          <MetaField label="Регион" value={draft.region} editable={editable} onChange={(value) => onChange((current) => ({ ...current, region: value }))} />
          <MetaField label="Дата" value={draft.date} editable={editable} type="date" onChange={(value) => onChange((current) => ({ ...current, date: value }))} />
        </div>
      </details>

      <div className="prosmet-premium-desktop-meta">
        <MetaField label="Объект" value={draft.objectName} editable={editable} onChange={(value) => onChange((current) => ({ ...current, objectName: value }))} />
        <MetaField label="Заказчик" value={draft.customer} editable={editable} onChange={(value) => onChange((current) => ({ ...current, customer: value }))} />
        <MetaField label="Регион" value={draft.region} editable={editable} onChange={(value) => onChange((current) => ({ ...current, region: value }))} />
        <MetaField label="Дата" value={draft.date} editable={editable} type="date" onChange={(value) => onChange((current) => ({ ...current, date: value }))} />
      </div>

      <div className="prosmet-premium-table-head">
        <span className="text-center">№</span>
        <span>Наименование</span>
        <span className="text-center">Ед.</span>
        <span className="text-right">Количество</span>
        <span className="text-right">Цена</span>
        <span className="text-right">Сумма</span>
        <span />
      </div>

      <div className="prosmet-premium-sections">
        {draft.sections.map((section) => (
          <section key={section.id} className="prosmet-premium-section">
            <div className="prosmet-premium-section-head">
              {editable ? (
                <textarea
                  aria-label={`Название раздела ${section.title}`}
                  value={section.title}
                  rows={1}
                  onChange={(event) =>
                    onChange((current) => ({
                      ...current,
                      sections: current.sections.map((entry) => entry.id === section.id ? { ...entry, title: event.target.value } : entry)
                    }))
                  }
                  className="prosmet-premium-section-title-input"
                />
              ) : (
                <h2 className="prosmet-premium-section-title">{section.title}</h2>
              )}
              <strong>{formatMoney(calculation.sectionTotals[section.id] ?? 0, draft.currency)}</strong>
              {editable ? (
                <button type="button" aria-label={`Удалить раздел ${section.title}`} onClick={() => deleteSection(section.id)} className="prosmet-premium-delete-icon">
                  <Trash2Icon className="size-4" />
                </button>
              ) : null}
            </div>

            {section.items.map((item) => {
              position += 1;
              const row = { sectionId: section.id, itemId: item.id };
              return (
                <PremiumEstimateRow
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
                    sections: current.sections.map((entry) => entry.id === section.id ? { ...entry, items: [...entry.items, blankItem()] } : entry)
                  }))
                }
                className="prosmet-premium-add-row"
              >
                <PlusIcon className="size-4" /> Добавить позицию
              </button>
            ) : null}
          </section>
        ))}
      </div>

      {editable ? (
        <button type="button" onClick={() => onChange((current) => ({ ...current, sections: [...current.sections, blankSection()] }))} className="prosmet-premium-add-section">
          <PlusIcon className="size-4" /> Добавить раздел
        </button>
      ) : null}

      <footer className="prosmet-premium-document-footer">
        <details className="prosmet-premium-details-card">
          <summary>
            <span>Технология и подробности расчёта</span>
            <ChevronDownIcon className="size-4" />
          </summary>
          <div className="space-y-4 pt-4 text-sm leading-6 text-neutral-600">
            {draft.technology.length ? (
              <ol className="space-y-2">
                {draft.technology.map((step, index) => (
                  <li key={step.id} className="flex gap-3"><span className="font-semibold text-neutral-400">{index + 1}.</span><span>{step.title}</span></li>
                ))}
              </ol>
            ) : <p>Технологическая карта пока не заполнена.</p>}
            {draft.assumptions.length ? <DetailList title="Допущения" items={draft.assumptions} /> : null}
            {draft.warnings.length ? <DetailList title="Требует проверки" items={draft.warnings} /> : null}
          </div>
        </details>

        <div className="prosmet-premium-totals-card">
          <TotalLine label="Прямые затраты" value={calculation.directCost} currency={draft.currency} />
          <PercentField label="Накладные" value={draft.overheadPercent} amount={calculation.overhead} currency={draft.currency} editable={editable} onChange={(value) => onChange((current) => ({ ...current, overheadPercent: value }))} />
          <PercentField label="Прибыль" value={draft.profitPercent} amount={calculation.profit} currency={draft.currency} editable={editable} onChange={(value) => onChange((current) => ({ ...current, profitPercent: value }))} />
          <PercentField label="Скидка" value={draft.discountPercent} amount={-calculation.discount} currency={draft.currency} editable={editable} onChange={(value) => onChange((current) => ({ ...current, discountPercent: value }))} />
          <PercentField label="НДС" value={draft.vatPercent} amount={calculation.vat} currency={draft.currency} editable={editable} onChange={(value) => onChange((current) => ({ ...current, vatPercent: value }))} />
          <div className="prosmet-premium-grand-total"><span>Итого</span><strong>{formatMoney(calculation.total, draft.currency)}</strong></div>
        </div>
      </footer>
    </article>
  );
}

function PremiumEstimateRow({
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
    <div className="prosmet-premium-estimate-row">
      <div className="prosmet-premium-desktop-row">
        <span className="text-center text-xs text-neutral-400">{position}</span>
        {editable ? <input aria-label={`Наименование позиции ${position}`} value={item.name} onChange={(event) => onChange("name", event.target.value)} className="prosmet-premium-cell is-name" /> : <span className="prosmet-premium-cell-readonly is-name">{item.name}</span>}
        {editable ? <input aria-label={`Единица позиции ${position}`} value={item.unit} onChange={(event) => onChange("unit", event.target.value)} className="prosmet-premium-cell text-center" /> : <span className="prosmet-premium-cell-readonly text-center">{item.unit}</span>}
        {editable ? <input aria-label={`Количество позиции ${position}`} inputMode="decimal" value={String(item.quantity)} onChange={(event) => onChange("quantity", parseDecimal(event.target.value))} className="prosmet-premium-cell text-right" /> : <span className="prosmet-premium-cell-readonly text-right tabular-nums">{item.quantity.toLocaleString("ru-RU")}</span>}
        {editable ? <input aria-label={`Цена позиции ${position}`} inputMode="decimal" value={String(item.unitPrice)} onChange={(event) => onChange("unitPrice", parseDecimal(event.target.value))} className="prosmet-premium-cell text-right font-medium" /> : <span className="prosmet-premium-cell-readonly text-right tabular-nums">{formatMoney(item.unitPrice, currency)}</span>}
        <strong className="px-2 text-right text-sm tabular-nums">{formatMoney(amount, currency)}</strong>
        {editable ? <button type="button" onClick={onDelete} aria-label={`Удалить позицию ${item.name}`} className="prosmet-premium-delete-icon"><Trash2Icon className="size-4" /></button> : <span />}
      </div>

      <button type="button" onClick={onOpen} aria-label={`${item.name} — открыть позицию`} className="prosmet-premium-mobile-row">
        <span className="prosmet-premium-row-number">{position}</span>
        <span className="min-w-0 flex-1">
          <strong className="block text-[15px] font-medium leading-5 text-neutral-950">{item.name}</strong>
          <span className="mt-1 block text-xs text-neutral-500">{item.quantity.toLocaleString("ru-RU")} {item.unit} × {formatMoney(item.unitPrice, currency)}</span>
        </span>
        <strong className="shrink-0 text-sm tabular-nums">{formatMoney(amount, currency)}</strong>
      </button>
    </div>
  );
}

function PremiumEstimateRowEditor({
  draft,
  row,
  onClose,
  onChange,
  onDelete
}: {
  draft: EstimateDraft;
  row: NonNullable<ActiveRow>;
  onClose: () => void;
  onChange: <K extends keyof EstimateItem>(sectionId: string, itemId: string, key: K, value: EstimateItem[K]) => void;
  onDelete: (sectionId: string, itemId: string) => void;
}) {
  const section = draft.sections.find((entry) => entry.id === row.sectionId);
  const item = section?.items.find((entry) => entry.id === row.itemId);
  const amount = item ? item.quantity * item.norm * item.coefficient * item.unitPrice : 0;
  if (!item) return null;

  return (
    <div className="fixed inset-0 z-[280]" role="dialog" aria-modal="true" aria-label="Редактирование позиции">
      <button type="button" className="absolute inset-0 bg-black/30 backdrop-blur-sm" aria-label="Закрыть редактор позиции" onClick={onClose} />
      <section className="prosmet-row-sheet prosmet-premium-row-sheet prosmet-scrollbar">
        <div className="prosmet-premium-sheet-grabber" />
        <header className="prosmet-premium-row-sheet-head">
          <div className="min-w-0 flex-1">
            <div className="prosmet-premium-eyebrow">Позиция сметы</div>
            <h3 className="mt-1 line-clamp-2 text-lg font-semibold leading-6">{item.name}</h3>
            <div className="mt-1 text-sm font-semibold tabular-nums">{formatMoney(amount, draft.currency)}</div>
          </div>
          <button type="button" onClick={onClose} className="prosmet-premium-icon-button" aria-label="Закрыть"><XIcon /></button>
        </header>

        <div className="prosmet-premium-row-form">
          <Field label="Наименование" wide>
            <input className="prosmet-input" value={item.name} onChange={(event) => onChange(row.sectionId, row.itemId, "name", event.target.value)} />
          </Field>
          <Field label="Количество">
            <input className="prosmet-input" inputMode="decimal" value={String(item.quantity)} onChange={(event) => onChange(row.sectionId, row.itemId, "quantity", parseDecimal(event.target.value))} />
          </Field>
          <Field label="Единица">
            <input className="prosmet-input" value={item.unit} onChange={(event) => onChange(row.sectionId, row.itemId, "unit", event.target.value)} list="prosmet-units" />
            <datalist id="prosmet-units"><option value="м²" /><option value="м³" /><option value="пог. м" /><option value="шт" /><option value="кг" /><option value="компл." /></datalist>
          </Field>
          <Field label="Цена">
            <input className="prosmet-input" inputMode="decimal" value={String(item.unitPrice)} onChange={(event) => onChange(row.sectionId, row.itemId, "unitPrice", parseDecimal(event.target.value))} />
          </Field>

          <details className="prosmet-premium-advanced-fields">
            <summary><span>Дополнительно</span><ChevronDownIcon className="size-4" /></summary>
            <div className="grid gap-4 pt-4 sm:grid-cols-2">
              <Field label="Тип ресурса">
                <select className="prosmet-input" value={item.resourceType} onChange={(event) => onChange(row.sectionId, row.itemId, "resourceType", event.target.value as ResourceType)}>
                  {Object.entries(resourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <Field label="Код нормы">
                <input className="prosmet-input" value={item.code} onChange={(event) => onChange(row.sectionId, row.itemId, "code", event.target.value)} />
              </Field>
              <Field label="Комментарий" wide>
                <textarea className="prosmet-input" value={item.comment} onChange={(event) => onChange(row.sectionId, row.itemId, "comment", event.target.value)} />
              </Field>
            </div>
          </details>
        </div>

        <footer className="prosmet-premium-row-sheet-footer">
          <button type="button" onClick={() => onDelete(row.sectionId, row.itemId)} className="prosmet-premium-danger-action"><Trash2Icon className="size-4" /> Удалить</button>
          <button type="button" onClick={onClose} className="prosmet-premium-mobile-primary"><CheckIcon className="size-4" /> Готово</button>
        </footer>
      </section>
    </div>
  );
}

function SaveIndicator({ state }: { state: PremiumEstimateWorkspaceSaveState }) {
  if (state === "saving") return <span className="inline-flex items-center gap-1.5"><LoaderCircleIcon className="size-3 animate-spin" /> Сохраняем…</span>;
  if (state === "offline") return <span>Сохранено на устройстве</span>;
  if (state === "error") return <span className="text-red-600">Ошибка сохранения</span>;
  return <span className="inline-flex items-center gap-1.5"><CheckIcon className="size-3" /> Автосохранено</span>;
}

function ToolbarIcon({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="prosmet-premium-icon-button">{children}</button>;
}

function MetaField({ label, value, editable, type = "text", onChange }: { label: string; value: string; editable: boolean; type?: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1.5">
      <span className="prosmet-premium-field-label">{label}</span>
      {editable ? (
        <input aria-label={label} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="prosmet-premium-meta-input" />
      ) : (
        <span className="prosmet-premium-meta-readonly">{type === "date" ? formatDateRu(value) : value || "Не указано"}</span>
      )}
    </label>
  );
}

function PercentField({ label, value, amount, currency, editable, onChange }: { label: string; value: number; amount: number; currency: string; editable: boolean; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-neutral-600">
      <span className="flex items-center gap-2">
        {label}
        {editable ? <span className="prosmet-premium-percent-input"><input aria-label={`${label}, процентов`} inputMode="decimal" value={String(value)} onChange={(event) => onChange(parseDecimal(event.target.value))} /><span>%</span></span> : <span className="text-xs text-neutral-400">{value}%</span>}
      </span>
      <span className={cn("tabular-nums", amount < 0 && "text-red-600")}>{amount < 0 ? "− " : ""}{formatMoney(Math.abs(amount), currency)}</span>
    </div>
  );
}

function TotalLine({ label, value, currency }: { label: string; value: number; currency: string }) {
  return <div className="flex items-center justify-between gap-3 text-sm text-neutral-600"><span>{label}</span><span className="tabular-nums">{formatMoney(value, currency)}</span></div>;
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return <div><h3 className="font-semibold text-neutral-900">{title}</h3><ul className="mt-1 list-disc space-y-1 pl-5">{items.map((item) => <li key={item}>{item}</li>)}</ul></div>;
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <label className={cn("grid gap-1.5 text-sm", wide && "sm:col-span-2")}><span className="font-medium text-neutral-700">{label}</span>{children}</label>;
}
