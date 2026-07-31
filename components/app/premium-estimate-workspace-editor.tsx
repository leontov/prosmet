"use client";

import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleUserRoundIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderKanbanIcon,
  LoaderCircleIcon,
  MapPinIcon,
  PencilIcon,
  PlusIcon,
  SendIcon,
  Share2Icon,
  ShieldCheckIcon,
  TagIcon,
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

function statusLabel(status: EstimateDraft["status"]) {
  if (status === "approved") return "Утверждена";
  if (status === "sent") return "Передана клиенту";
  if (status === "review") return "Версия сохранена";
  return "Черновик";
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

  const updateItem = <K extends keyof EstimateItem>(sectionId: string, itemId: string, key: K, value: EstimateItem[K]) => {
    onChange((current) => ({
      ...current,
      sections: current.sections.map((section) => section.id === sectionId
        ? { ...section, items: section.items.map((item) => item.id === itemId ? { ...item, [key]: value } : item) }
        : section)
    }));
  };

  const deleteItem = (sectionId: string, itemId: string) => {
    onChange((current) => ({
      ...current,
      sections: current.sections.map((section) => section.id === sectionId
        ? { ...section, items: section.items.filter((item) => item.id !== itemId) }
        : section)
    }));
    setActiveRow(null);
  };

  const deleteSection = (sectionId: string) => {
    onChange((current) => ({ ...current, sections: current.sections.filter((section) => section.id !== sectionId) }));
  };

  return (
    <div className="prosmet-estimate-layer prosmet-v2-estimate-layer" data-testid="estimate-workspace-layer">
      <button type="button" className="prosmet-estimate-backdrop" aria-label="Закрыть редактор сметы" onClick={onClose} />

      <section className="prosmet-v2-estimate-shell" data-testid="estimate-document-overlay" aria-label="Редактор сметы">
        <header className="prosmet-v2-estimate-topbar no-print">
          <button type="button" onClick={onClose} className="prosmet-v2-estimate-back" aria-label="Закрыть редактор">
            <ArrowLeftIcon />
          </button>

          <div className="prosmet-v2-estimate-topbar-copy">
            <strong>{draft.title}</strong>
            <span><SaveIndicator state={saveState} /> · Версия {draft.revision} · {pluralPositions(itemCount(draft))}</span>
          </div>

          <div className="prosmet-v2-estimate-topbar-actions">
            <ToolbarIcon label="Скачать PDF" onClick={onExportPdf} disabled={busy !== null}>
              {busy === "pdf" ? <LoaderCircleIcon className="animate-spin" /> : <FileTextIcon />}
            </ToolbarIcon>
            <ToolbarIcon label="Скачать Excel" onClick={onExportXlsx} disabled={busy !== null}>
              {busy === "xlsx" ? <LoaderCircleIcon className="animate-spin" /> : <FileSpreadsheetIcon />}
            </ToolbarIcon>
            <ToolbarIcon label="Передать клиенту" onClick={onShare} disabled={busy !== null}>
              {busy === "share" ? <LoaderCircleIcon className="animate-spin" /> : <Share2Icon />}
            </ToolbarIcon>
            {mode === "preview" ? (
              <button type="button" className="prosmet-v2-secondary-action hidden sm:inline-flex" onClick={onEdit}><PencilIcon /> Редактировать</button>
            ) : (
              <button type="button" className="prosmet-v2-primary-action hidden sm:inline-flex" onClick={onSaveVersion} disabled={busy !== null}>
                {busy === "finish" ? <LoaderCircleIcon className="animate-spin" /> : <CheckIcon />}
                Сохранить версию
              </button>
            )}
          </div>
        </header>

        <div className="prosmet-v2-estimate-layout">
          <main className="prosmet-v2-estimate-scroll prosmet-scrollbar">
            {mode === "preview" ? (
              <div className="prosmet-v2-version-banner" data-testid="estimate-revision-preview">
                <span><CheckIcon /></span>
                <div><strong>Версия {draft.revision} сохранена</strong><small>Расчёт зафиксирован и готов к утверждению или передаче клиенту.</small></div>
              </div>
            ) : null}

            <PremiumEstimateCanvas
              draft={draft}
              editable={mode === "edit"}
              calculation={calculation}
              onChange={onChange}
              updateItem={updateItem}
              deleteItem={deleteItem}
              deleteSection={deleteSection}
              onOpenRow={setActiveRow}
            />
          </main>

          <aside className="prosmet-v2-estimate-summary no-print" aria-label="Итоги сметы">
            <div className="prosmet-v2-summary-status"><span className={cn("prosmet-v2-status-dot", draft.status)} /> {statusLabel(draft.status)}</div>
            <span className="prosmet-v2-summary-label">Итого по смете</span>
            <strong className="prosmet-v2-summary-total">{formatMoney(calculation.total, draft.currency)}</strong>
            <div className="prosmet-v2-summary-lines">
              <TotalLine label="Прямые затраты" value={calculation.directCost} currency={draft.currency} />
              <PercentField label="Накладные" value={draft.overheadPercent} amount={calculation.overhead} currency={draft.currency} editable={mode === "edit"} onChange={(value) => onChange((current) => ({ ...current, overheadPercent: value }))} />
              <PercentField label="Прибыль" value={draft.profitPercent} amount={calculation.profit} currency={draft.currency} editable={mode === "edit"} onChange={(value) => onChange((current) => ({ ...current, profitPercent: value }))} />
              <PercentField label="Скидка" value={draft.discountPercent} amount={-calculation.discount} currency={draft.currency} editable={mode === "edit"} onChange={(value) => onChange((current) => ({ ...current, discountPercent: value }))} />
              <PercentField label="НДС" value={draft.vatPercent} amount={calculation.vat} currency={draft.currency} editable={mode === "edit"} onChange={(value) => onChange((current) => ({ ...current, vatPercent: value }))} />
            </div>
            <div className="prosmet-v2-summary-actions">
              {mode === "edit" ? (
                <button type="button" onClick={onSaveVersion} disabled={busy !== null} className="prosmet-v2-primary-action">
                  {busy === "finish" ? <LoaderCircleIcon className="animate-spin" /> : <CheckIcon />}
                  Сохранить версию
                </button>
              ) : (
                <button type="button" onClick={onApprove} disabled={busy !== null || draft.status === "approved"} className="prosmet-v2-primary-action">
                  {busy === "approve" ? <LoaderCircleIcon className="animate-spin" /> : <ShieldCheckIcon />}
                  {draft.status === "approved" ? "Утверждена" : "Утвердить"}
                </button>
              )}
              <button type="button" onClick={onShare} disabled={busy !== null} className="prosmet-v2-secondary-action"><SendIcon /> Передать клиенту</button>
            </div>
            <p className="prosmet-v2-summary-note">Сохранение версии, утверждение и передача клиенту — отдельные действия.</p>
          </aside>
        </div>

        <div className="prosmet-v2-mobile-actionbar no-print">
          <button type="button" onClick={onShare} disabled={busy !== null} className="prosmet-v2-mobile-share" aria-label="Передать клиенту"><Share2Icon /></button>
          {mode === "edit" ? (
            <button type="button" onClick={onSaveVersion} disabled={busy !== null} className="prosmet-v2-mobile-primary">
              {busy === "finish" ? <LoaderCircleIcon className="animate-spin" /> : <CheckIcon />}
              Сохранить версию
            </button>
          ) : (
            <>
              <button type="button" onClick={onEdit} className="prosmet-v2-mobile-secondary"><PencilIcon /> Изменить</button>
              <button type="button" onClick={onApprove} disabled={busy !== null || draft.status === "approved"} className="prosmet-v2-mobile-primary">
                {busy === "approve" ? <LoaderCircleIcon className="animate-spin" /> : <ShieldCheckIcon />}
                {draft.status === "approved" ? "Утверждена" : "Утвердить"}
              </button>
            </>
          )}
        </div>

        {error ? <div className="prosmet-v2-estimate-error">{error}</div> : null}
      </section>

      {activeRow ? (
        <PremiumEstimateRowEditor draft={draft} row={activeRow} onClose={() => setActiveRow(null)} onChange={updateItem} onDelete={deleteItem} />
      ) : null}
    </div>
  );
}

function PremiumEstimateCanvas({
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
    <article className="prosmet-v2-estimate-canvas print-page" data-testid="estimate-document-canvas">
      <header className="prosmet-v2-document-hero">
        <div className="prosmet-v2-document-title-wrap">
          <span className="prosmet-v2-eyebrow">Смета</span>
          {editable ? (
            <textarea aria-label="Название сметы" value={draft.title} rows={1} onChange={(event) => onChange((current) => ({ ...current, title: event.target.value }))} className="prosmet-v2-estimate-title" />
          ) : (
            <h1 className="prosmet-v2-estimate-title-readonly">{draft.title}</h1>
          )}
          <div className="prosmet-v2-document-meta-line">
            <span>{draft.objectName || "Объект не указан"}</span>
            <span>{pluralPositions(itemCount(draft))}</span>
            <span>Версия {draft.revision}</span>
          </div>
        </div>
        <div className="prosmet-v2-mobile-total-card">
          <span>Итого</span>
          <strong>{formatMoney(calculation.total, draft.currency)}</strong>
          <small>{statusLabel(draft.status)}</small>
        </div>
      </header>

      <details className="prosmet-premium-mobile-meta prosmet-v2-mobile-meta">
        <summary>
          <span className="prosmet-v2-meta-summary-icon"><FolderKanbanIcon /></span>
          <span className="min-w-0 flex-1"><strong>{draft.objectName || "Объект не указан"}</strong><small>{[draft.customer || "Заказчик не указан", draft.region || "Регион не указан", formatDateRu(draft.date)].join(" · ")}</small></span>
          <span>Данные</span>
          <ChevronDownIcon />
        </summary>
        <div className="prosmet-v2-mobile-meta-fields">
          <MetaField icon={<FolderKanbanIcon />} label="Объект" value={draft.objectName} editable={editable} onChange={(value) => onChange((current) => ({ ...current, objectName: value }))} />
          <MetaField icon={<CircleUserRoundIcon />} label="Заказчик" value={draft.customer} editable={editable} onChange={(value) => onChange((current) => ({ ...current, customer: value }))} />
          <MetaField icon={<MapPinIcon />} label="Регион" value={draft.region} editable={editable} onChange={(value) => onChange((current) => ({ ...current, region: value }))} />
          <MetaField icon={<CalendarDaysIcon />} label="Дата" value={draft.date} editable={editable} type="date" onChange={(value) => onChange((current) => ({ ...current, date: value }))} />
        </div>
      </details>

      <div className="prosmet-v2-desktop-meta">
        <MetaField icon={<FolderKanbanIcon />} label="Объект" value={draft.objectName} editable={editable} onChange={(value) => onChange((current) => ({ ...current, objectName: value }))} />
        <MetaField icon={<CircleUserRoundIcon />} label="Заказчик" value={draft.customer} editable={editable} onChange={(value) => onChange((current) => ({ ...current, customer: value }))} />
        <MetaField icon={<MapPinIcon />} label="Регион" value={draft.region} editable={editable} onChange={(value) => onChange((current) => ({ ...current, region: value }))} />
        <MetaField icon={<CalendarDaysIcon />} label="Дата" value={draft.date} editable={editable} type="date" onChange={(value) => onChange((current) => ({ ...current, date: value }))} />
      </div>

      <div className="prosmet-v2-sections">
        {draft.sections.map((section) => (
          <section key={section.id} className="prosmet-v2-section-card">
            <header className="prosmet-v2-section-head">
              <span className="prosmet-v2-section-icon"><TagIcon /></span>
              <div className="min-w-0 flex-1">
                {editable ? (
                  <textarea aria-label={`Название раздела ${section.title}`} value={section.title} rows={1} onChange={(event) => onChange((current) => ({ ...current, sections: current.sections.map((entry) => entry.id === section.id ? { ...entry, title: event.target.value } : entry) }))} className="prosmet-v2-section-title-input" />
                ) : (
                  <h2 className="prosmet-v2-section-title">{section.title}</h2>
                )}
                <small>{pluralPositions(section.items.length)}</small>
              </div>
              <strong>{formatMoney(calculation.sectionTotals[section.id] ?? 0, draft.currency)}</strong>
              {editable ? <button type="button" aria-label={`Удалить раздел ${section.title}`} onClick={() => deleteSection(section.id)} className="prosmet-v2-delete-icon"><Trash2Icon /></button> : null}
            </header>

            <div className="prosmet-v2-table-head">
              <span>№</span><span>Наименование</span><span>Ед.</span><span>Количество</span><span>Цена</span><span>Сумма</span><span />
            </div>

            <div className="prosmet-v2-section-items">
              {section.items.map((item) => {
                position += 1;
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
                    onOpen={() => onOpenRow({ sectionId: section.id, itemId: item.id })}
                  />
                );
              })}
            </div>

            {editable ? (
              <button type="button" onClick={() => onChange((current) => ({ ...current, sections: current.sections.map((entry) => entry.id === section.id ? { ...entry, items: [...entry.items, blankItem()] } : entry) }))} className="prosmet-v2-add-row"><PlusIcon /> Добавить позицию</button>
            ) : null}
          </section>
        ))}
      </div>

      {editable ? <button type="button" onClick={() => onChange((current) => ({ ...current, sections: [...current.sections, blankSection()] }))} className="prosmet-v2-add-section"><PlusIcon /> Добавить раздел</button> : null}

      <div className="prosmet-v2-document-bottom">
        <details className="prosmet-v2-details-card">
          <summary><span><strong>Технология и допущения</strong><small>Этапы работ, предупреждения и основания расчёта</small></span><ChevronDownIcon /></summary>
          <div className="prosmet-v2-details-content">
            {draft.technology.length ? (
              <ol>{draft.technology.map((step, index) => <li key={step.id}><span>{index + 1}</span><p>{step.title}</p></li>)}</ol>
            ) : <p>Технологическая карта пока не заполнена.</p>}
            {draft.assumptions.length ? <DetailList title="Допущения" items={draft.assumptions} /> : null}
            {draft.warnings.length ? <DetailList title="Требует проверки" items={draft.warnings} /> : null}
          </div>
        </details>

        <div className="prosmet-v2-mobile-totals">
          <span className="prosmet-v2-eyebrow">Структура итоговой цены</span>
          <TotalLine label="Прямые затраты" value={calculation.directCost} currency={draft.currency} />
          <PercentField label="Накладные" value={draft.overheadPercent} amount={calculation.overhead} currency={draft.currency} editable={editable} onChange={(value) => onChange((current) => ({ ...current, overheadPercent: value }))} />
          <PercentField label="Прибыль" value={draft.profitPercent} amount={calculation.profit} currency={draft.currency} editable={editable} onChange={(value) => onChange((current) => ({ ...current, profitPercent: value }))} />
          <PercentField label="Скидка" value={draft.discountPercent} amount={-calculation.discount} currency={draft.currency} editable={editable} onChange={(value) => onChange((current) => ({ ...current, discountPercent: value }))} />
          <PercentField label="НДС" value={draft.vatPercent} amount={calculation.vat} currency={draft.currency} editable={editable} onChange={(value) => onChange((current) => ({ ...current, vatPercent: value }))} />
          <div className="prosmet-v2-grand-total"><span>Итого</span><strong>{formatMoney(calculation.total, draft.currency)}</strong></div>
        </div>
      </div>
    </article>
  );
}

function PremiumEstimateRow({ position, item, amount, currency, editable, onChange, onDelete, onOpen }: {
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
    <div className="prosmet-v2-estimate-row">
      <div className="prosmet-v2-desktop-row">
        <span className="prosmet-v2-position">{position}</span>
        {editable ? <input aria-label={`Наименование позиции ${position}`} value={item.name} onChange={(event) => onChange("name", event.target.value)} className="prosmet-v2-cell is-name" /> : <span className="prosmet-v2-cell-readonly is-name">{item.name}</span>}
        {editable ? <input aria-label={`Единица позиции ${position}`} value={item.unit} onChange={(event) => onChange("unit", event.target.value)} className="prosmet-v2-cell text-center" /> : <span className="prosmet-v2-cell-readonly text-center">{item.unit}</span>}
        {editable ? <input aria-label={`Количество позиции ${position}`} inputMode="decimal" value={String(item.quantity)} onChange={(event) => onChange("quantity", parseDecimal(event.target.value))} className="prosmet-v2-cell text-right" /> : <span className="prosmet-v2-cell-readonly text-right tabular-nums">{item.quantity.toLocaleString("ru-RU")}</span>}
        {editable ? <input aria-label={`Цена позиции ${position}`} inputMode="decimal" value={String(item.unitPrice)} onChange={(event) => onChange("unitPrice", parseDecimal(event.target.value))} className="prosmet-v2-cell text-right font-medium" /> : <span className="prosmet-v2-cell-readonly text-right tabular-nums">{formatMoney(item.unitPrice, currency)}</span>}
        <strong className="prosmet-v2-row-amount">{formatMoney(amount, currency)}</strong>
        {editable ? <button type="button" onClick={onDelete} aria-label={`Удалить позицию ${item.name}`} className="prosmet-v2-delete-icon"><Trash2Icon /></button> : <span />}
      </div>

      <button type="button" onClick={onOpen} aria-label={`${item.name} — открыть позицию`} className="prosmet-v2-mobile-row">
        <span className="prosmet-v2-row-number">{position}</span>
        <span className="prosmet-v2-mobile-row-copy">
          <strong>{item.name}</strong>
          <span><b>{item.quantity.toLocaleString("ru-RU")} {item.unit}</b><i />{formatMoney(item.unitPrice, currency)} за ед.</span>
        </span>
        <span className="prosmet-v2-mobile-row-total"><small>Сумма</small><strong>{formatMoney(amount, currency)}</strong></span>
      </button>
    </div>
  );
}

function PremiumEstimateRowEditor({ draft, row, onClose, onChange, onDelete }: {
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
      <button type="button" className="absolute inset-0 bg-black/35 backdrop-blur-sm" aria-label="Закрыть редактор позиции" onClick={onClose} />
      <section className="prosmet-v2-row-sheet prosmet-scrollbar">
        <div className="prosmet-v2-sheet-grabber" />
        <header className="prosmet-v2-row-sheet-head">
          <div className="min-w-0 flex-1"><span className="prosmet-v2-eyebrow">Позиция сметы</span><h3>{item.name}</h3><strong>{formatMoney(amount, draft.currency)}</strong></div>
          <button type="button" onClick={onClose} className="prosmet-v2-icon-button" aria-label="Закрыть"><XIcon /></button>
        </header>

        <div className="prosmet-v2-row-form">
          <Field label="Наименование" wide><input className="prosmet-v2-input" value={item.name} onChange={(event) => onChange(row.sectionId, row.itemId, "name", event.target.value)} /></Field>
          <Field label="Количество"><input className="prosmet-v2-input" inputMode="decimal" value={String(item.quantity)} onChange={(event) => onChange(row.sectionId, row.itemId, "quantity", parseDecimal(event.target.value))} /></Field>
          <Field label="Единица"><input className="prosmet-v2-input" value={item.unit} onChange={(event) => onChange(row.sectionId, row.itemId, "unit", event.target.value)} list="prosmet-units" /><datalist id="prosmet-units"><option value="м²" /><option value="м³" /><option value="пог. м" /><option value="шт" /><option value="кг" /><option value="компл." /></datalist></Field>
          <Field label="Цена"><input className="prosmet-v2-input" inputMode="decimal" value={String(item.unitPrice)} onChange={(event) => onChange(row.sectionId, row.itemId, "unitPrice", parseDecimal(event.target.value))} /></Field>

          <details className="prosmet-v2-advanced-fields">
            <summary><span>Дополнительно</span><ChevronDownIcon /></summary>
            <div className="prosmet-v2-advanced-grid">
              <Field label="Тип ресурса"><select className="prosmet-v2-input" value={item.resourceType} onChange={(event) => onChange(row.sectionId, row.itemId, "resourceType", event.target.value as ResourceType)}>{Object.entries(resourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              <Field label="Код нормы"><input className="prosmet-v2-input" value={item.code} onChange={(event) => onChange(row.sectionId, row.itemId, "code", event.target.value)} /></Field>
              <Field label="Комментарий" wide><textarea className="prosmet-v2-input" value={item.comment} onChange={(event) => onChange(row.sectionId, row.itemId, "comment", event.target.value)} /></Field>
            </div>
          </details>
        </div>

        <footer className="prosmet-v2-row-sheet-footer">
          <button type="button" onClick={() => onDelete(row.sectionId, row.itemId)} className="prosmet-v2-danger-action"><Trash2Icon /> Удалить</button>
          <button type="button" onClick={onClose} className="prosmet-v2-mobile-primary"><CheckIcon /> Готово</button>
        </footer>
      </section>
    </div>
  );
}

function SaveIndicator({ state }: { state: PremiumEstimateWorkspaceSaveState }) {
  if (state === "saving") return <span className="inline-flex items-center gap-1.5"><LoaderCircleIcon className="animate-spin" /> Сохраняем…</span>;
  if (state === "offline") return <span>Сохранено на устройстве</span>;
  if (state === "error") return <span className="text-red-600">Ошибка сохранения</span>;
  return <span className="inline-flex items-center gap-1.5"><CheckIcon /> Автосохранено</span>;
}

function ToolbarIcon({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="prosmet-v2-icon-button">{children}</button>;
}

function MetaField({ icon, label, value, editable, type = "text", onChange }: { icon: ReactNode; label: string; value: string; editable: boolean; type?: string; onChange: (value: string) => void }) {
  return (
    <label className="prosmet-v2-meta-field">
      <span className="prosmet-v2-meta-icon">{icon}</span>
      <span className="min-w-0 flex-1"><small>{label}</small>{editable ? <input aria-label={label} type={type} value={value} onChange={(event) => onChange(event.target.value)} /> : <strong>{type === "date" ? formatDateRu(value) : value || "Не указано"}</strong>}</span>
    </label>
  );
}

function PercentField({ label, value, amount, currency, editable, onChange }: { label: string; value: number; amount: number; currency: string; editable: boolean; onChange: (value: number) => void }) {
  return (
    <div className="prosmet-v2-total-line">
      <span>{label}{editable ? <span className="prosmet-v2-percent-input"><input aria-label={`${label}, процентов`} inputMode="decimal" value={String(value)} onChange={(event) => onChange(parseDecimal(event.target.value))} /><b>%</b></span> : <small>{value}%</small>}</span>
      <strong className={cn(amount < 0 && "text-red-600")}>{amount < 0 ? "− " : ""}{formatMoney(Math.abs(amount), currency)}</strong>
    </div>
  );
}

function TotalLine({ label, value, currency }: { label: string; value: number; currency: string }) {
  return <div className="prosmet-v2-total-line"><span>{label}</span><strong>{formatMoney(value, currency)}</strong></div>;
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return <div><h3>{title}</h3><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></div>;
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <label className={cn("prosmet-v2-field", wide && "is-wide")}><span>{label}</span>{children}</label>;
}
