import { useMemo, useState } from "react";
import type { Estimate, EstimateItem } from "@prosmet/contracts";
import {
  ArrowLeftIcon,
  CopyIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  MailIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SaveIcon,
  SendIcon,
  Share2Icon,
  ShieldCheckIcon,
  Trash2Icon,
  XIcon
} from "lucide-react";
import { calculateEstimate, formatMoney, updateEstimateItem } from "../../lib/estimate";

type Props = {
  mobile: boolean;
  estimate: Estimate;
  onChange: (estimate: Estimate) => void;
  onClose: () => void;
};

export function EstimateEditor({ mobile, estimate, onChange, onClose }: Props) {
  const calculation = useMemo(() => calculateEstimate(estimate), [estimate]);
  const [shareOpen, setShareOpen] = useState(false);

  const saveVersion = () => onChange({
    ...estimate,
    revision: estimate.revision + 1,
    status: "review",
    updatedAt: new Date().toISOString()
  });

  const approve = () => onChange({ ...estimate, status: "approved", updatedAt: new Date().toISOString() });
  const deliver = () => setShareOpen(true);

  const addItem = (sectionId: string) => {
    const item: EstimateItem = {
      id: crypto.randomUUID(),
      name: "Новая позиция",
      unit: "шт",
      quantity: 1,
      unitPrice: 0,
      category: "work"
    };
    onChange({
      ...estimate,
      updatedAt: new Date().toISOString(),
      sections: estimate.sections.map((section) => section.id === sectionId ? { ...section, items: [...section.items, item] } : section)
    });
  };

  const removeItem = (sectionId: string, itemId: string) => onChange({
    ...estimate,
    updatedAt: new Date().toISOString(),
    sections: estimate.sections.map((section) => section.id === sectionId ? { ...section, items: section.items.filter((item) => item.id !== itemId) } : section)
  });

  const updateItem = (sectionId: string, itemId: string, patch: Partial<EstimateItem>) => onChange(updateEstimateItem(estimate, sectionId, itemId, patch));

  return (
    <div className="estimate-overlay" role="dialog" aria-modal="true" aria-label="Редактор сметы">
      {mobile ? (
        <MobileEditor
          estimate={estimate}
          calculation={calculation}
          onChange={onChange}
          updateItem={updateItem}
          removeItem={removeItem}
          addItem={addItem}
          onClose={onClose}
          onSave={saveVersion}
          onApprove={approve}
          onDeliver={deliver}
        />
      ) : (
        <DesktopEditor
          estimate={estimate}
          calculation={calculation}
          onChange={onChange}
          updateItem={updateItem}
          removeItem={removeItem}
          addItem={addItem}
          onClose={onClose}
          onSave={saveVersion}
          onApprove={approve}
          onDeliver={deliver}
        />
      )}
      {shareOpen ? <ShareDialog estimate={estimate} total={calculation.total} onClose={() => setShareOpen(false)} onSent={() => { onChange({ ...estimate, status: "sent", updatedAt: new Date().toISOString() }); setShareOpen(false); }} /> : null}
    </div>
  );
}

type EditorProps = {
  estimate: Estimate;
  calculation: ReturnType<typeof calculateEstimate>;
  onChange: (estimate: Estimate) => void;
  updateItem: (sectionId: string, itemId: string, patch: Partial<EstimateItem>) => void;
  removeItem: (sectionId: string, itemId: string) => void;
  addItem: (sectionId: string) => void;
  onClose: () => void;
  onSave: () => void;
  onApprove: () => void;
  onDeliver: () => void;
};

function DesktopEditor(props: EditorProps) {
  const { estimate, calculation, onChange, updateItem, removeItem, addItem, onClose, onSave, onApprove, onDeliver } = props;
  return (
    <div className="desktop-estimate-editor" data-testid="desktop-estimate-editor">
      <header className="estimate-topbar">
        <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть смету"><ArrowLeftIcon /></button>
        <div className="estimate-topbar-title"><strong>{estimate.title}</strong><span>Версия {estimate.revision} · {statusLabel(estimate.status)} · сохранено локально</span></div>
        <div className="estimate-topbar-actions">
          <button type="button" className="icon-button" aria-label="Скачать PDF"><FileTextIcon /></button>
          <button type="button" className="icon-button" aria-label="Скачать Excel"><FileSpreadsheetIcon /></button>
          <button type="button" className="secondary-button" onClick={onDeliver}><Share2Icon /> Передать</button>
          <button type="button" className="primary-button" onClick={onSave}><SaveIcon /> Сохранить версию</button>
        </div>
      </header>

      <div className="desktop-estimate-layout">
        <main className="estimate-canvas-scroll">
          <article className="estimate-document">
            <header className="document-header">
              <div>
                <span>Смета</span>
                <input id="estimate-title" name="estimate-title" value={estimate.title} onChange={(event) => onChange({ ...estimate, title: event.target.value })} />
                <p>{estimate.project} · {estimate.region}</p>
              </div>
              <button type="button" className="more-button" aria-label="Дополнительно"><MoreHorizontalIcon /></button>
            </header>

            <div className="document-meta-grid">
              <MetaInput id="project" label="Объект" value={estimate.project} onChange={(value) => onChange({ ...estimate, project: value })} />
              <MetaInput id="customer" label="Заказчик" value={estimate.customer} onChange={(value) => onChange({ ...estimate, customer: value })} />
              <MetaInput id="region" label="Регион" value={estimate.region} onChange={(value) => onChange({ ...estimate, region: value })} />
              <div className="meta-static"><small>Обновлено</small><strong>{new Date(estimate.updatedAt).toLocaleDateString("ru-RU")}</strong></div>
            </div>

            <div className="estimate-sections">
              {estimate.sections.map((section) => (
                <section key={section.id} className="estimate-section">
                  <header><div><h2>{section.title}</h2><span>{section.items.length} позиций</span></div><strong>{formatMoney(calculation.sectionTotals[section.id] ?? 0)}</strong></header>
                  <div className="estimate-table-head"><span>№</span><span>Наименование</span><span>Ед.</span><span>Количество</span><span>Цена</span><span>Сумма</span><span /></div>
                  {section.items.map((item, index) => (
                    <div className="estimate-table-row" key={item.id}>
                      <span className="row-number">{index + 1}</span>
                      <input id={`name-${item.id}`} name={`name-${item.id}`} value={item.name} onChange={(event) => updateItem(section.id, item.id, { name: event.target.value })} />
                      <input id={`unit-${item.id}`} name={`unit-${item.id}`} value={item.unit} onChange={(event) => updateItem(section.id, item.id, { unit: event.target.value })} />
                      <input id={`quantity-${item.id}`} name={`quantity-${item.id}`} inputMode="decimal" type="number" min="0" value={item.quantity} onChange={(event) => updateItem(section.id, item.id, { quantity: Math.max(0, Number(event.target.value)) })} />
                      <input id={`price-${item.id}`} name={`price-${item.id}`} inputMode="decimal" type="number" min="0" value={item.unitPrice} onChange={(event) => updateItem(section.id, item.id, { unitPrice: Math.max(0, Number(event.target.value)) })} />
                      <strong>{formatMoney(calculation.itemTotals[item.id] ?? 0)}</strong>
                      <button type="button" aria-label={`Удалить ${item.name}`} onClick={() => removeItem(section.id, item.id)}><Trash2Icon /></button>
                    </div>
                  ))}
                  <button type="button" className="add-position" onClick={() => addItem(section.id)}><PlusIcon /> Добавить позицию</button>
                </section>
              ))}
            </div>

            <details className="document-details">
              <summary>Технология и основания расчёта <span>Открыть</span></summary>
              <div>
                <p>Подготовка основания, грунтование, установка маяков и уголков, нанесение смеси, выравнивание и контроль качества.</p>
                <p>Цены приведены для Республики Татарстан и доступны для редактирования перед утверждением.</p>
              </div>
            </details>
          </article>
        </main>

        <aside className="estimate-summary">
          <span className={`status ${estimate.status}`}>{statusLabel(estimate.status)}</span>
          <small>Итого по смете</small>
          <strong className="summary-total">{formatMoney(calculation.total)}</strong>
          <div className="summary-lines">
            <SummaryLine label="Прямые затраты" value={calculation.direct} />
            <PercentInput label="Накладные" value={estimate.overheadPercent} amount={calculation.overhead} onChange={(value) => onChange({ ...estimate, overheadPercent: value })} />
            <PercentInput label="Прибыль" value={estimate.profitPercent} amount={calculation.profit} onChange={(value) => onChange({ ...estimate, profitPercent: value })} />
            <PercentInput label="НДС" value={estimate.vatPercent} amount={calculation.vat} onChange={(value) => onChange({ ...estimate, vatPercent: value })} />
          </div>
          <div className="summary-actions">
            <button type="button" className="primary-button" onClick={onSave}><SaveIcon /> Сохранить версию</button>
            <button type="button" className="secondary-button" onClick={onApprove} disabled={estimate.status === "approved"}><ShieldCheckIcon /> {estimate.status === "approved" ? "Утверждена" : "Утвердить"}</button>
            <button type="button" className="secondary-button" onClick={onDeliver}><SendIcon /> Передать клиенту</button>
          </div>
          <p>Сохранение версии, утверждение и передача клиенту — три разных действия.</p>
        </aside>
      </div>
    </div>
  );
}

function MobileEditor(props: EditorProps) {
  const { estimate, calculation, onChange, updateItem, removeItem, addItem, onClose, onSave, onApprove, onDeliver } = props;
  return (
    <div className="mobile-estimate-editor" data-testid="mobile-estimate-editor">
      <header className="mobile-estimate-topbar">
        <button type="button" onClick={onClose} aria-label="Закрыть смету"><ArrowLeftIcon /></button>
        <div><strong>Смета</strong><span>Версия {estimate.revision}</span></div>
        <button type="button" aria-label="Дополнительно"><MoreHorizontalIcon /></button>
      </header>

      <main className="mobile-estimate-scroll">
        <section className="mobile-estimate-hero">
          <span className={`status ${estimate.status}`}>{statusLabel(estimate.status)}</span>
          <h1>{estimate.title}</h1>
          <p>{estimate.project}<br />{estimate.region}</p>
          <div><span>Итого</span><strong>{formatMoney(calculation.total)}</strong></div>
        </section>

        <details className="mobile-meta">
          <summary>Данные объекта <span>{estimate.customer}</span></summary>
          <div>
            <MetaInput id="mobile-project" label="Объект" value={estimate.project} onChange={(value) => onChange({ ...estimate, project: value })} />
            <MetaInput id="mobile-customer" label="Заказчик" value={estimate.customer} onChange={(value) => onChange({ ...estimate, customer: value })} />
            <MetaInput id="mobile-region" label="Регион" value={estimate.region} onChange={(value) => onChange({ ...estimate, region: value })} />
          </div>
        </details>

        {estimate.sections.map((section) => (
          <section key={section.id} className="mobile-estimate-section">
            <header><div><h2>{section.title}</h2><span>{section.items.length} позиций</span></div><strong>{formatMoney(calculation.sectionTotals[section.id] ?? 0)}</strong></header>
            <div className="mobile-estimate-items">
              {section.items.map((item, index) => (
                <article key={item.id} className="mobile-estimate-item">
                  <div className="mobile-item-head">
                    <span>{index + 1}</span>
                    <textarea
                      id={`mobile-name-${item.id}`}
                      name={`mobile-name-${item.id}`}
                      aria-label={`Название позиции ${index + 1}`}
                      rows={2}
                      value={item.name}
                      onChange={(event) => updateItem(section.id, item.id, { name: event.target.value })}
                    />
                    <button type="button" onClick={() => removeItem(section.id, item.id)} aria-label={`Удалить ${item.name}`}><Trash2Icon /></button>
                  </div>
                  <div className="mobile-item-fields">
                    <label><span>Количество</span><div><input id={`mobile-quantity-${item.id}`} name={`mobile-quantity-${item.id}`} type="number" min="0" inputMode="decimal" value={item.quantity} onChange={(event) => updateItem(section.id, item.id, { quantity: Math.max(0, Number(event.target.value)) })} /><b>{item.unit}</b></div></label>
                    <label><span>Цена</span><div><input id={`mobile-price-${item.id}`} name={`mobile-price-${item.id}`} type="number" min="0" inputMode="decimal" value={item.unitPrice} onChange={(event) => updateItem(section.id, item.id, { unitPrice: Math.max(0, Number(event.target.value)) })} /><b>₽</b></div></label>
                  </div>
                  <footer><span>Сумма</span><strong>{formatMoney(calculation.itemTotals[item.id] ?? 0)}</strong></footer>
                </article>
              ))}
            </div>
            <button type="button" className="mobile-add-position" onClick={() => addItem(section.id)}><PlusIcon /> Добавить позицию</button>
          </section>
        ))}

        <section className="mobile-price-summary">
          <h2>Структура цены</h2>
          <SummaryLine label="Прямые затраты" value={calculation.direct} />
          <PercentInput label="Накладные" value={estimate.overheadPercent} amount={calculation.overhead} onChange={(value) => onChange({ ...estimate, overheadPercent: value })} />
          <PercentInput label="Прибыль" value={estimate.profitPercent} amount={calculation.profit} onChange={(value) => onChange({ ...estimate, profitPercent: value })} />
          <PercentInput label="НДС" value={estimate.vatPercent} amount={calculation.vat} onChange={(value) => onChange({ ...estimate, vatPercent: value })} />
          <div className="mobile-grand-total"><span>Итого</span><strong>{formatMoney(calculation.total)}</strong></div>
        </section>
      </main>

      <footer className="mobile-estimate-actions">
        <button type="button" className="mobile-share-button" onClick={onDeliver} aria-label="Передать клиенту"><Share2Icon /></button>
        {estimate.status === "review" || estimate.status === "approved" ? (
          <button type="button" className="mobile-secondary-action" onClick={onApprove} disabled={estimate.status === "approved"}><ShieldCheckIcon /> {estimate.status === "approved" ? "Утверждена" : "Утвердить"}</button>
        ) : null}
        <button type="button" className="mobile-primary-action" onClick={onSave}><SaveIcon /> Сохранить версию</button>
      </footer>
    </div>
  );
}

function MetaInput({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return <label className="meta-input"><small>{label}</small><input id={id} name={id} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function SummaryLine({ label, value }: { label: string; value: number }) {
  return <div className="summary-line"><span>{label}</span><strong>{formatMoney(value)}</strong></div>;
}

function PercentInput({ label, value, amount, onChange }: { label: string; value: number; amount: number; onChange: (value: number) => void }) {
  const id = `percent-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return <div className="summary-line percent-line"><label htmlFor={id}>{label}</label><span><input id={id} name={id} type="number" min="0" inputMode="decimal" value={value} onChange={(event) => onChange(Math.max(0, Number(event.target.value)))} /><b>%</b></span><strong>{formatMoney(amount)}</strong></div>;
}

function statusLabel(status: Estimate["status"]) {
  if (status === "approved") return "Утверждена";
  if (status === "sent") return "Передана клиенту";
  if (status === "review") return "Версия сохранена";
  return "Черновик";
}

function ShareDialog({ estimate, total, onClose, onSent }: { estimate: Estimate; total: number; onClose: () => void; onSent: () => void }) {
  const summary = `${estimate.title}\n${estimate.project}\nИтого: ${formatMoney(total)}`;
  const copy = async () => {
    await navigator.clipboard.writeText(summary);
    onSent();
  };
  return (
    <div className="share-dialog-layer">
      <button type="button" className="share-backdrop" aria-label="Закрыть передачу" onClick={onClose} />
      <section className="share-dialog" role="dialog" aria-modal="true" aria-label="Передача сметы клиенту">
        <header><div><h2>Передать клиенту</h2><p>Выберите канал. Утверждение сметы остаётся отдельным действием.</p></div><button type="button" onClick={onClose} aria-label="Закрыть"><XIcon /></button></header>
        <button type="button" onClick={onSent}><span className="share-channel whatsapp"><SendIcon /></span><span><strong>WhatsApp</strong><small>Отправить ссылку и PDF</small></span></button>
        <button type="button" onClick={onSent}><span className="share-channel"><MailIcon /></span><span><strong>Электронная почта</strong><small>Письмо с вложениями</small></span></button>
        <button type="button" onClick={() => void copy()}><span className="share-channel"><CopyIcon /></span><span><strong>Копировать краткое описание</strong><small>Сумма и сведения об объекте</small></span></button>
      </section>
    </div>
  );
}
