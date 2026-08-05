import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Estimate, EstimateItem } from "@prosmet/contracts";
import {
  ArrowLeftIcon,
  CopyIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  MailIcon,
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

type Calculation = ReturnType<typeof calculateEstimate>;

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

  const editorProps: EditorProps = {
    estimate,
    calculation,
    onChange,
    updateItem,
    removeItem,
    addItem,
    onClose,
    onSave: saveVersion,
    onApprove: approve,
    onDeliver: deliver,
    onPrint: () => printEstimate(estimate, calculation),
    onExcel: () => downloadExcel(estimate, calculation)
  };

  return (
    <div className="estimate-overlay" role="dialog" aria-modal="true" aria-label="Редактор сметы">
      {mobile ? <MobileEditor {...editorProps} /> : <DesktopEditor {...editorProps} />}
      {shareOpen ? (
        <ShareDialog
          estimate={estimate}
          total={calculation.total}
          onClose={() => setShareOpen(false)}
          onSent={() => {
            onChange({ ...estimate, status: "sent", updatedAt: new Date().toISOString() });
            setShareOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

type EditorProps = {
  estimate: Estimate;
  calculation: Calculation;
  onChange: (estimate: Estimate) => void;
  updateItem: (sectionId: string, itemId: string, patch: Partial<EstimateItem>) => void;
  removeItem: (sectionId: string, itemId: string) => void;
  addItem: (sectionId: string) => void;
  onClose: () => void;
  onSave: () => void;
  onApprove: () => void;
  onDeliver: () => void;
  onPrint: () => void;
  onExcel: () => void;
};

function DesktopEditor(props: EditorProps) {
  const { estimate, calculation, onChange, updateItem, removeItem, addItem, onClose, onSave, onApprove, onDeliver, onPrint, onExcel } = props;
  return (
    <div className="desktop-estimate-editor" data-testid="desktop-estimate-editor">
      <header className="estimate-topbar">
        <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть смету"><ArrowLeftIcon /></button>
        <div className="estimate-topbar-title"><strong>{estimate.title}</strong><span>Версия {estimate.revision} · {statusLabel(estimate.status)} · сохранено в базе данных</span></div>
        <div className="estimate-topbar-actions">
          <button type="button" className="icon-button" aria-label="Печать или PDF" onClick={onPrint}><FileTextIcon /></button>
          <button type="button" className="icon-button" aria-label="Скачать Excel" onClick={onExcel}><FileSpreadsheetIcon /></button>
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
                <input id="estimate-title" name="estimate-title" value={estimate.title} onChange={(event) => onChange({ ...estimate, title: event.target.value, updatedAt: new Date().toISOString() })} />
                <p>{[estimate.project, estimate.region].filter(Boolean).join(" · ")}</p>
              </div>
            </header>

            <div className="document-meta-grid">
              <MetaInput id="project" label="Объект" value={estimate.project} onChange={(value) => onChange({ ...estimate, project: value, updatedAt: new Date().toISOString() })} />
              <MetaInput id="customer" label="Заказчик" value={estimate.customer} onChange={(value) => onChange({ ...estimate, customer: value, updatedAt: new Date().toISOString() })} />
              <MetaInput id="region" label="Регион" value={estimate.region} onChange={(value) => onChange({ ...estimate, region: value, updatedAt: new Date().toISOString() })} />
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
          </article>
        </main>

        <aside className="estimate-summary">
          <span className={`status ${estimate.status}`}>{statusLabel(estimate.status)}</span>
          <small>Итого по смете</small>
          <strong className="summary-total">{formatMoney(calculation.total)}</strong>
          <div className="summary-lines">
            <SummaryLine label="Прямые затраты" value={calculation.direct} />
            <PercentInput label="Накладные" value={estimate.overheadPercent} amount={calculation.overhead} onChange={(value) => onChange({ ...estimate, overheadPercent: value, updatedAt: new Date().toISOString() })} />
            <PercentInput label="Прибыль" value={estimate.profitPercent} amount={calculation.profit} onChange={(value) => onChange({ ...estimate, profitPercent: value, updatedAt: new Date().toISOString() })} />
            <PercentInput label="НДС" value={estimate.vatPercent} amount={calculation.vat} onChange={(value) => onChange({ ...estimate, vatPercent: value, updatedAt: new Date().toISOString() })} />
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

function resizeTextarea(field: HTMLTextAreaElement | null) {
  if (!field) return;
  field.style.maxHeight = "none";
  field.style.height = "0px";
  field.style.height = `${field.scrollHeight}px`;
}

function AutoResizeTextarea({
  id,
  name,
  ariaLabel,
  value,
  onChange
}: {
  id: string;
  name: string;
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const field = fieldRef.current;
    resizeTextarea(field);
    const frame = window.requestAnimationFrame(() => resizeTextarea(field));
    return () => window.cancelAnimationFrame(frame);
  }, [value]);

  return (
    <textarea
      ref={fieldRef}
      id={id}
      name={name}
      aria-label={ariaLabel}
      rows={1}
      value={value}
      onChange={(event) => {
        const field = event.currentTarget;
        onChange(field.value);
        resizeTextarea(field);
      }}
    />
  );
}

function MobileEditor(props: EditorProps) {
  const { estimate, calculation, onChange, updateItem, removeItem, addItem, onClose, onSave, onApprove, onDeliver } = props;
  return (
    <div className="mobile-estimate-editor" data-testid="mobile-estimate-editor">
      <header className="mobile-estimate-topbar">
        <button type="button" onClick={onClose} aria-label="Закрыть смету"><ArrowLeftIcon /></button>
        <div><strong>Смета</strong><span>Версия {estimate.revision}</span></div>
        <button type="button" aria-label="Передать смету" onClick={onDeliver}><Share2Icon /></button>
      </header>

      <main className="mobile-estimate-scroll">
        <section className="mobile-estimate-hero">
          <span className={`status ${estimate.status}`}>{statusLabel(estimate.status)}</span>
          <h1>{estimate.title}</h1>
          <p>{estimate.project}<br />{estimate.region}</p>
          <div><span>Итого</span><strong>{formatMoney(calculation.total)}</strong></div>
        </section>

        <details className="mobile-meta">
          <summary>Данные объекта <span>{estimate.customer || "Не указан"}</span></summary>
          <div>
            <MetaInput id="mobile-project" label="Объект" value={estimate.project} onChange={(value) => onChange({ ...estimate, project: value, updatedAt: new Date().toISOString() })} />
            <MetaInput id="mobile-customer" label="Заказчик" value={estimate.customer} onChange={(value) => onChange({ ...estimate, customer: value, updatedAt: new Date().toISOString() })} />
            <MetaInput id="mobile-region" label="Регион" value={estimate.region} onChange={(value) => onChange({ ...estimate, region: value, updatedAt: new Date().toISOString() })} />
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
                    <AutoResizeTextarea
                      id={`mobile-name-${item.id}`}
                      name={`mobile-name-${item.id}`}
                      ariaLabel={`Название позиции ${index + 1}`}
                      value={item.name}
                      onChange={(value) => updateItem(section.id, item.id, { name: value })}
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
          <PercentInput label="Накладные" value={estimate.overheadPercent} amount={calculation.overhead} onChange={(value) => onChange({ ...estimate, overheadPercent: value, updatedAt: new Date().toISOString() })} />
          <PercentInput label="Прибыль" value={estimate.profitPercent} amount={calculation.profit} onChange={(value) => onChange({ ...estimate, profitPercent: value, updatedAt: new Date().toISOString() })} />
          <PercentInput label="НДС" value={estimate.vatPercent} amount={calculation.vat} onChange={(value) => onChange({ ...estimate, vatPercent: value, updatedAt: new Date().toISOString() })} />
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
  const summary = estimateSummary(estimate, total);
  const webShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: estimate.title, text: summary });
    } else {
      await navigator.clipboard.writeText(summary);
    }
    onSent();
  };
  const copy = async () => {
    await navigator.clipboard.writeText(summary);
    onSent();
  };
  const email = () => {
    window.location.href = `mailto:?subject=${encodeURIComponent(estimate.title)}&body=${encodeURIComponent(summary)}`;
    onSent();
  };
  const whatsapp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(summary)}`, "_blank", "noopener,noreferrer");
    onSent();
  };
  return (
    <div className="share-dialog-layer">
      <button type="button" className="share-backdrop" aria-label="Закрыть передачу" onClick={onClose} />
      <section className="share-dialog" role="dialog" aria-modal="true" aria-label="Передача сметы клиенту">
        <header><div><h2>Передать клиенту</h2><p>Выберите реальный канал передачи. Статус обновится после запуска действия.</p></div><button type="button" onClick={onClose} aria-label="Закрыть"><XIcon /></button></header>
        <button type="button" onClick={() => void webShare()}><span className="share-channel"><Share2Icon /></span><span><strong>Системное меню</strong><small>AirDrop, сообщения и установленные приложения</small></span></button>
        <button type="button" onClick={whatsapp}><span className="share-channel whatsapp"><SendIcon /></span><span><strong>WhatsApp</strong><small>Открыть готовое сообщение</small></span></button>
        <button type="button" onClick={email}><span className="share-channel"><MailIcon /></span><span><strong>Электронная почта</strong><small>Открыть письмо с суммой и объектом</small></span></button>
        <button type="button" onClick={() => void copy()}><span className="share-channel"><CopyIcon /></span><span><strong>Копировать описание</strong><small>Скопировать состав и итог сметы</small></span></button>
      </section>
    </div>
  );
}

function estimateSummary(estimate: Estimate, total: number) {
  const lines = [estimate.title, estimate.project, estimate.customer, estimate.region].filter(Boolean);
  for (const section of estimate.sections) {
    lines.push("", section.title);
    for (const item of section.items) {
      lines.push(`• ${item.name}: ${item.quantity} ${item.unit} × ${item.unitPrice.toLocaleString("ru-RU")} ₽`);
    }
  }
  lines.push("", `Итого: ${formatMoney(total)}`);
  return lines.join("\n");
}

function downloadExcel(estimate: Estimate, calculation: Calculation) {
  const rows = estimate.sections.flatMap((section) => [
    `<tr><th colspan="6">${escapeHtml(section.title)}</th></tr>`,
    ...section.items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.unit)}</td><td>${item.quantity}</td><td>${item.unitPrice}</td><td>${calculation.itemTotals[item.id] ?? 0}</td><td>${escapeHtml(item.category)}</td></tr>`)
  ]).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table><tr><th>Наименование</th><th>Ед.</th><th>Количество</th><th>Цена</th><th>Сумма</th><th>Категория</th></tr>${rows}<tr><th colspan="4">Итого</th><th>${calculation.total}</th><th></th></tr></table></body></html>`;
  downloadBlob(new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" }), `${safeFileName(estimate.title)}-v${estimate.revision}.xls`);
}

function printEstimate(estimate: Estimate, calculation: Calculation) {
  const popup = window.open("", "_blank", "noopener,noreferrer");
  if (!popup) throw new Error("Браузер заблокировал окно печати");
  const rows = estimate.sections.flatMap((section) => [
    `<tr class="section"><th colspan="5">${escapeHtml(section.title)}</th></tr>`,
    ...section.items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.unit)}</td><td>${item.quantity}</td><td>${item.unitPrice.toLocaleString("ru-RU")} ₽</td><td>${formatMoney(calculation.itemTotals[item.id] ?? 0)}</td></tr>`)
  ]).join("");
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(estimate.title)}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:32px;color:#171719}h1{font-size:24px;margin:0 0 8px}p{color:#666;margin:4px 0}table{width:100%;border-collapse:collapse;margin-top:24px;font-size:12px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}.section th{padding-top:14px;background:#eee}.total{margin-top:20px;text-align:right;font-size:20px;font-weight:700}@page{size:A4;margin:16mm}</style></head><body><h1>${escapeHtml(estimate.title)}</h1><p>${escapeHtml(estimate.project)}</p><p>${escapeHtml(estimate.customer)} · ${escapeHtml(estimate.region)}</p><table><thead><tr><th>Наименование</th><th>Ед.</th><th>Количество</th><th>Цена</th><th>Сумма</th></tr></thead><tbody>${rows}</tbody></table><div class="total">Итого: ${formatMoney(calculation.total)}</div><script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();};<\/script></body></html>`);
  popup.document.close();
}

function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}

function safeFileName(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").slice(0, 80) || "estimate";
}

function escapeHtml(value: string) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}
