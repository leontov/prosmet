import { useEffect, useMemo, useState } from "react";
import type {
  ConstructionDocument,
  WorkflowAction,
  WorkflowDetail,
  WorkProgressItem,
  WorkProgressStatus
} from "@prosmet/contracts";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  ClipboardCheckIcon,
  FileCheck2Icon,
  FileClockIcon,
  FilePlus2Icon,
  FileSpreadsheetIcon,
  FileTextIcon,
  HammerIcon,
  LoaderCircleIcon,
  LockKeyholeIcon,
  PlayIcon,
  PrinterIcon,
  SendIcon,
  Share2Icon,
  ShieldCheckIcon,
  XIcon
} from "lucide-react";
import { workflowLabels } from "./ProfessionalViews";

const stages = [
  { id: "estimate", label: "Смета", statuses: ["estimate_draft", "estimate_review"] },
  { id: "approval", label: "Согласование", statuses: ["estimate_sent", "estimate_approved"] },
  { id: "documents", label: "КП и договор", statuses: ["proposal_ready", "contract_ready", "contracted"] },
  { id: "work", label: "Выполнение", statuses: ["in_progress"] },
  { id: "closing", label: "Приёмка", statuses: ["completion_review"] },
  { id: "complete", label: "Завершено", statuses: ["completed"] }
] as const;

function money(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function currentStageIndex(status: WorkflowDetail["project"]["status"]) {
  const found = stages.findIndex((stage) => (stage.statuses as readonly string[]).includes(status));
  return found < 0 ? 0 : found;
}

function documentSet(workflow: WorkflowDetail) {
  return new Set(workflow.documents.map((document) => document.type));
}

function ActionButton({ label, icon, action, tone = "secondary", busy, onClick }: {
  label: string;
  icon: React.ReactNode;
  action: WorkflowAction;
  tone?: "primary" | "secondary" | "quiet";
  busy: string | null;
  onClick: (action: WorkflowAction) => void;
}) {
  const loading = busy === action;
  return (
    <button type="button" className={`pro-flow-action pro-flow-${tone}`} onClick={() => onClick(action)} disabled={Boolean(busy)}>
      {loading ? <LoaderCircleIcon className="spin" /> : icon}
      <span>{label}</span>
    </button>
  );
}

export function WorkflowInspector({
  workflow,
  mobile,
  open,
  embedded = false,
  busy,
  error,
  onClose,
  onAction,
  onProgress,
  onOpenEstimate,
  onOpenDocument
}: {
  workflow: WorkflowDetail | null;
  mobile: boolean;
  open: boolean;
  embedded?: boolean;
  busy: string | null;
  error: string | null;
  onClose: () => void;
  onAction: (action: WorkflowAction) => void;
  onProgress: (item: WorkProgressItem, patch: { actualQuantity: number; status: WorkProgressStatus; note?: string }) => Promise<void>;
  onOpenEstimate: () => void;
  onOpenDocument: (document: ConstructionDocument) => void;
}) {
  if (!open || !workflow) return null;
  const stageIndex = currentStageIndex(workflow.project.status);
  const docs = documentSet(workflow);
  const status = workflow.project.status;
  const estimateStatus = workflow.estimate.status;
  const canEditProgress = status === "in_progress" || status === "completion_review";

  return (
    <div className={embedded ? "pro-flow-canvas" : mobile ? "pro-flow-layer pro-flow-mobile" : "pro-flow-layer"} role="region" aria-label="Процесс проекта">
      {embedded ? null : <button type="button" className="pro-flow-backdrop" onClick={onClose} aria-label="Закрыть процесс проекта" />}
      <aside className={embedded ? "pro-flow-panel pro-flow-panel-embedded" : "pro-flow-panel"}>
        <header className="pro-flow-header">
          <button type="button" onClick={onClose} aria-label="Закрыть"><XIcon /></button>
          <div><small>Процесс проекта</small><h2>{workflow.project.title}</h2><p>{workflowLabels.projectStatusLabels[workflow.project.status]}</p></div>
          <button type="button" onClick={onOpenEstimate} aria-label="Открыть смету"><FileSpreadsheetIcon /></button>
        </header>

        <div className="pro-flow-scroll">
          <section className="pro-flow-timeline" aria-label="Этапы проекта">
            {stages.map((stage, index) => (
              <div key={stage.id} className={index < stageIndex ? "complete" : index === stageIndex ? "current" : "pending"}>
                <span>{index < stageIndex ? <CheckCircle2Icon /> : index + 1}</span>
                <strong>{stage.label}</strong>
              </div>
            ))}
          </section>

          {error ? <div className="pro-flow-error" role="alert">{error}</div> : null}

          <section className="pro-flow-summary">
            <div><small>Смета</small><strong>{money(workflow.project.totals.estimate)}</strong><span>Версия {workflow.estimate.revision} · {workflowLabels.estimateStatusLabels[workflow.estimate.status]}</span></div>
            <div><small>Факт</small><strong>{money(workflow.project.totals.actual)}</strong><span>{workflow.project.progress.percent}% позиций закрыто</span></div>
          </section>

          <section className="pro-flow-section">
            <header><div><small>Следующее действие</small><h3>Управление этапом</h3></div><FileClockIcon /></header>
            <div className="pro-flow-actions">
              {estimateStatus === "draft" ? <ActionButton label="Сохранить проверенную версию" icon={<FileCheck2Icon />} action="save-version" tone="primary" busy={busy} onClick={onAction} /> : null}
              {estimateStatus === "review" ? <ActionButton label="Передать клиенту" icon={<SendIcon />} action="send-client" tone="primary" busy={busy} onClick={onAction} /> : null}
              {estimateStatus === "sent" ? <ActionButton label="Зафиксировать согласование" icon={<ShieldCheckIcon />} action="approve" tone="primary" busy={busy} onClick={onAction} /> : null}
              {new Set(["sent", "approved"]).has(estimateStatus) && !docs.has("commercial-proposal") ? <ActionButton label="Сформировать КП" icon={<FilePlus2Icon />} action="generate-proposal" busy={busy} onClick={onAction} /> : null}
              {new Set(["sent", "approved"]).has(estimateStatus) && !docs.has("invoice") ? <ActionButton label="Сформировать счёт" icon={<FileTextIcon />} action="generate-invoice" busy={busy} onClick={onAction} /> : null}
              {estimateStatus === "approved" && !docs.has("contract") ? <ActionButton label="Сформировать договор" icon={<LockKeyholeIcon />} action="generate-contract" tone="primary" busy={busy} onClick={onAction} /> : null}
              {status === "contract_ready" ? <ActionButton label="Договор подписан" icon={<FileCheck2Icon />} action="sign-contract" tone="primary" busy={busy} onClick={onAction} /> : null}
              {status === "contracted" ? <ActionButton label="Запустить работы" icon={<PlayIcon />} action="start-work" tone="primary" busy={busy} onClick={onAction} /> : null}
              {status === "in_progress" ? <ActionButton label="Передать на приёмку" icon={<ClipboardCheckIcon />} action="complete-work" tone="primary" busy={busy} onClick={onAction} /> : null}
              {status === "completion_review" && !docs.has("act") ? <ActionButton label="Сформировать акт" icon={<ClipboardCheckIcon />} action="generate-act" tone="primary" busy={busy} onClick={onAction} /> : null}
              {status === "completion_review" && docs.has("act") && !docs.has("ks-2") ? <ActionButton label="Сформировать КС-2" icon={<FileSpreadsheetIcon />} action="generate-ks2" busy={busy} onClick={onAction} /> : null}
              {status === "completion_review" && docs.has("ks-2") && !docs.has("ks-3") ? <ActionButton label="Сформировать КС-3" icon={<FileSpreadsheetIcon />} action="generate-ks3" busy={busy} onClick={onAction} /> : null}
              {status === "completion_review" && docs.has("act") && docs.has("ks-2") && docs.has("ks-3") ? <ActionButton label="Завершить проект" icon={<CheckCircle2Icon />} action="close-project" tone="primary" busy={busy} onClick={onAction} /> : null}
              {status === "completed" ? <div className="pro-flow-complete"><CheckCircle2Icon /><span><strong>Проект завершён</strong><small>Смета, факт и закрывающие документы сохранены.</small></span></div> : null}
            </div>
          </section>

          {canEditProgress ? (
            <section className="pro-flow-section pro-progress-section">
              <header><div><small>Фактическое выполнение</small><h3>Объёмы работ</h3></div><HammerIcon /></header>
              <p>План не меняется. Фактический объём и статус записываются отдельно и используются в акте, КС-2 и КС-3.</p>
              <div className="pro-progress-list">
                {workflow.progress.map((item) => <ProgressRow key={item.itemId} item={item} busy={Boolean(busy)} onSave={onProgress} />)}
              </div>
            </section>
          ) : null}

          <section className="pro-flow-section">
            <header><div><small>Связанные файлы</small><h3>Документы</h3></div><FileTextIcon /></header>
            {workflow.documents.length ? (
              <div className="pro-flow-documents">
                {workflow.documents.map((document) => (
                  <button type="button" key={document.id} onClick={() => onOpenDocument(document)}>
                    <span>{document.status === "signed" || document.status === "approved" ? <FileCheck2Icon /> : <FileTextIcon />}</span>
                    <span><strong>{workflowLabels.documentTypeLabels[document.type]}</strong><small>{document.number} · {workflowLabels.documentStatusLabels[document.status]}</small></span>
                    <Share2Icon />
                  </button>
                ))}
              </div>
            ) : <p className="pro-flow-empty-copy">Документы появятся после согласования сметы.</p>}
          </section>

          <section className="pro-flow-section pro-revision-section">
            <header><div><small>Неизменяемая история</small><h3>Версии сметы</h3></div><FileCheck2Icon /></header>
            {workflow.revisions.length ? workflow.revisions.slice(0, 8).map((revision) => (
              <div key={revision.id}><span>v{revision.revision}</span><strong>{revision.event}</strong><time>{new Date(revision.createdAt).toLocaleString("ru-RU")}</time></div>
            )) : <p className="pro-flow-empty-copy">История начнётся после формирования сметы.</p>}
          </section>
        </div>
      </aside>
    </div>
  );
}

function ProgressRow({ item, busy, onSave }: {
  item: WorkProgressItem;
  busy: boolean;
  onSave: (item: WorkProgressItem, patch: { actualQuantity: number; status: WorkProgressStatus; note?: string }) => Promise<void>;
}) {
  const [actual, setActual] = useState(String(item.actualQuantity));
  const [status, setStatus] = useState<WorkProgressStatus>(item.status);
  const [note, setNote] = useState(item.note);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setActual(String(item.actualQuantity));
    setStatus(item.status);
    setNote(item.note);
  }, [item]);

  const changed = Number(actual) !== item.actualQuantity || status !== item.status || note !== item.note;
  const save = async () => {
    if (!changed || saving || busy) return;
    setSaving(true);
    try {
      await onSave(item, { actualQuantity: Math.max(0, Number(actual) || 0), status, note });
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="pro-progress-row">
      <header><span className={`pro-progress-state pro-progress-${status}`} /> <strong>{item.name}</strong><small>{money(item.unitPrice)}/{item.unit}</small></header>
      <div className="pro-progress-fields">
        <label><span>План</span><b>{item.plannedQuantity.toLocaleString("ru-RU")} {item.unit}</b></label>
        <label><span>Факт</span><input type="number" min="0" step="any" value={actual} onChange={(event) => setActual(event.target.value)} /></label>
        <label><span>Статус</span><select value={status} onChange={(event) => setStatus(event.target.value as WorkProgressStatus)}><option value="planned">Запланировано</option><option value="started">В работе</option><option value="done">Выполнено</option><option value="excluded">Исключено</option></select></label>
      </div>
      <div className="pro-progress-note"><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Комментарий по факту" /><button type="button" disabled={!changed || saving || busy} onClick={() => void save()}>{saving ? <LoaderCircleIcon className="spin" /> : <FileCheck2Icon />} Сохранить</button></div>
    </article>
  );
}

export function DocumentViewer({ document, mobile, embedded = false, onClose, onStatus, onContent }: {
  document: ConstructionDocument | null;
  mobile: boolean;
  embedded?: boolean;
  onClose: () => void;
  onStatus: (document: ConstructionDocument, action: "send" | "sign" | "approve") => Promise<void>;
  onContent: (
    document: ConstructionDocument,
    content: Pick<ConstructionDocument["content"], "heading" | "introduction" | "clauses" | "notes">
  ) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [heading, setHeading] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [clausesText, setClausesText] = useState("");
  const [notesText, setNotesText] = useState("");

  useEffect(() => {
    if (!document) return;
    setPreview(false);
    setHeading(document.content.heading);
    setIntroduction(document.content.introduction);
    setClausesText(document.content.clauses.join("\n\n"));
    setNotesText(document.content.notes.join("\n\n"));
  }, [document]);

  if (!document) return null;
  const total = document.content.totals.total;
  const clauses = paragraphs(clausesText);
  const notes = paragraphs(notesText);
  const readiness = contractReadiness(document, { heading, introduction, clauses, notes });

  const update = async (action: "send" | "sign" | "approve") => {
    setBusy(action);
    try { await onStatus(document, action); } finally { setBusy(null); }
  };

  const share = async () => {
    const text = `${heading}\n${introduction}\nИтого: ${money(total)}`;
    if (navigator.share) await navigator.share({ title: document.title, text }).catch(() => undefined);
    else await navigator.clipboard?.writeText(text);
  };

  const saveContent = async () => {
    setBusy("content");
    try {
      await onContent(document, { heading, introduction, clauses, notes });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={embedded ? "pro-document-canvas" : mobile ? "pro-document-layer pro-document-mobile" : "pro-document-layer"} role="region" aria-label={document.title}>
      {embedded ? null : <button type="button" className="pro-document-backdrop" onClick={onClose} aria-label="Закрыть документ" />}
      <article className={embedded ? "pro-document-viewer pro-document-viewer-embedded" : "pro-document-viewer"}>
        <header className="pro-document-toolbar">
          <button type="button" onClick={onClose} aria-label="Назад"><ArrowLeftIcon /></button>
          <div><strong>{workflowLabels.documentTypeLabels[document.type]}</strong><span>{document.number} · {workflowLabels.documentStatusLabels[document.status]}</span></div>
          <button type="button" onClick={() => setPreview((value) => !value)} aria-label={preview ? "Вернуться к документу" : "Предпросмотр печати или PDF"}><PrinterIcon /></button>
          <button type="button" onClick={() => void share()} aria-label="Поделиться"><Share2Icon /></button>
        </header>
        <div className="pro-document-scroll">
          {preview ? (
            <iframe className="pro-document-print-preview" title={`Предпросмотр ${document.title}`} srcDoc={buildDocumentPrintHtml({ ...document, content: { ...document.content, heading, introduction, clauses, notes } })} />
          ) : (
          <div className="pro-document-paper">
            <header><small>{document.number}</small><h1>{heading}</h1><p>{introduction}</p></header>
            {document.type === "contract" ? <ContractReadiness readiness={readiness} /> : null}
            <section className="pro-document-editable" aria-label="Редактирование документа">
              <label>Заголовок<input value={heading} onChange={(event) => setHeading(event.target.value)} /></label>
              <label>Вводная часть<textarea rows={3} value={introduction} onChange={(event) => setIntroduction(event.target.value)} /></label>
              <label>Условия — один пункт через пустую строку<textarea rows={10} value={clausesText} onChange={(event) => setClausesText(event.target.value)} /></label>
              <label>Примечания — один пункт через пустую строку<textarea rows={5} value={notesText} onChange={(event) => setNotesText(event.target.value)} /></label>
              <button type="button" className="pro-document-save-content" onClick={() => void saveContent()} disabled={Boolean(busy)}>{busy === "content" ? <LoaderCircleIcon className="spin" /> : <FileCheck2Icon />} Сохранить документ</button>
            </section>
            {document.content.sections.map((section) => (
              <section key={section.title}>
                <h2>{section.title}</h2>
                <div className="pro-document-table">
                  <div><b>Наименование</b><b>Ед.</b><b>Кол-во</b><b>Цена</b><b>Сумма</b></div>
                  {section.lines.map((line, index) => (
                    <div key={`${section.title}:${line.name}:${index}`}><span>{line.name}</span><span>{line.unit}</span><span>{line.quantity.toLocaleString("ru-RU")}</span><span>{money(line.unitPrice)}</span><strong>{money(line.total)}</strong></div>
                  ))}
                </div>
              </section>
            ))}
            <section className="pro-document-totals">
              <div><span>Прямые затраты</span><b>{money(document.content.totals.direct)}</b></div>
              <div><span>Накладные расходы</span><b>{money(document.content.totals.overhead)}</b></div>
              <div><span>Прибыль</span><b>{money(document.content.totals.profit)}</b></div>
              <div><span>НДС</span><b>{money(document.content.totals.vat)}</b></div>
              <div className="total"><span>Итого</span><strong>{money(total)}</strong></div>
            </section>
            {clauses.length ? <section className="pro-document-clauses"><h2>Условия</h2>{clauses.map((clause) => <p key={clause}>{clause}</p>)}</section> : null}
            <section className="pro-document-notes"><h2>Примечания</h2>{notes.map((note) => <p key={note}>{note}</p>)}</section>
            <footer><div><span>Исполнитель</span><i /></div><div><span>Заказчик</span><i /></div></footer>
          </div>
          )}
        </div>
        <footer className="pro-document-actions">
          {document.status === "ready" ? <button type="button" onClick={() => void update("send")} disabled={Boolean(busy)}>{busy === "send" ? <LoaderCircleIcon className="spin" /> : <SendIcon />} Передать</button> : null}
          {document.type === "contract" && new Set(["ready", "sent"]).has(document.status) ? <button type="button" className="primary" onClick={() => void update("sign")} disabled={Boolean(busy)}>{busy === "sign" ? <LoaderCircleIcon className="spin" /> : <FileCheck2Icon />} Подписан</button> : null}
          {new Set(["act", "ks-2", "ks-3"]).has(document.type) && new Set(["ready", "sent"]).has(document.status) ? <button type="button" className="primary" onClick={() => void update("approve")} disabled={Boolean(busy)}>{busy === "approve" ? <LoaderCircleIcon className="spin" /> : <ShieldCheckIcon />} Утвердить</button> : null}
        </footer>
      </article>
    </div>
  );
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}

function paragraphs(value: string) {
  return value.split(/\n\s*\n/u).map((entry) => entry.trim()).filter(Boolean).slice(0, 80);
}

function contractReadiness(
  document: ConstructionDocument,
  content: Pick<ConstructionDocument["content"], "heading" | "introduction" | "clauses" | "notes">
) {
  const text = [content.heading, content.introduction, ...content.clauses, ...content.notes].join(" ");
  const hasPlaceholder = /\[(?:УКАЗАТЬ|ВЫБРАТЬ|ЗАПОЛНИТЬ)[^\]]*\]/iu.test(text);
  const checks = [
    { label: "Предмет и состав работ закреплены сметой", complete: document.content.sections.some((section) => section.lines.length > 0) && /предмет|состав работ/iu.test(text) },
    { label: "Начальный и конечный сроки заполнены", complete: /начальн[^.]{0,80}срок/iu.test(text) && /конечн[^.]{0,80}срок/iu.test(text) && !/срок[^.]*\[/iu.test(text) },
    { label: "Цена и статус сметы определены", complete: document.content.totals.total > 0 && /цен|смет/iu.test(text) },
    { label: "Порядок оплаты определён", complete: /порядок оплаты|аванс|оплат/iu.test(text) && !/оплат[^.]*\[/iu.test(text) },
    { label: "Порядок сдачи и приёмки определён", complete: /при[её]мк/iu.test(text) },
    { label: "Гарантийный срок заполнен", complete: /гарант/iu.test(text) && !/гарант[^.]*\[/iu.test(text) },
    { label: "Реквизиты и подписанты заполнены", complete: /реквизит/iu.test(text) && !/реквизит[^.]*\[/iu.test(text) }
  ];
  return { checks, ready: checks.every((check) => check.complete) && !hasPlaceholder };
}

function ContractReadiness({ readiness }: { readiness: ReturnType<typeof contractReadiness> }) {
  return (
    <section className={readiness.ready ? "pro-contract-readiness ready" : "pro-contract-readiness"}>
      <header><div><h2>Юридическая готовность договора</h2><p>Шаблон учитывает структуру подряда по ГК РФ, но становится готовым к подписанию только после заполнения конкретных условий и реквизитов сторон.</p></div><strong>{readiness.ready ? "Готов" : "Нужно заполнить"}</strong></header>
      <ul>{readiness.checks.map((check) => <li key={check.label} className={check.complete ? "complete" : "incomplete"}>{check.complete ? "✓" : "○"} {check.label}</li>)}</ul>
    </section>
  );
}

function buildDocumentPrintHtml(document: ConstructionDocument) {
  const rows = document.content.sections.map((section) => `<h2>${escapeHtml(section.title)}</h2><table><thead><tr><th>Наименование</th><th>Ед.</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead><tbody>${section.lines.map((line) => `<tr><td>${escapeHtml(line.name)}</td><td>${escapeHtml(line.unit)}</td><td>${line.quantity}</td><td>${money(line.unitPrice)}</td><td>${money(line.total)}</td></tr>`).join("")}</tbody></table>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(document.title)}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#111;margin:28px}h1{font-size:25px}h2{font-size:16px;margin-top:26px}p{line-height:1.55}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #ccc;padding:7px;text-align:left}.total{font-size:20px;font-weight:700;text-align:right;margin-top:24px}@page{size:A4;margin:14mm}</style></head><body><small>${escapeHtml(document.number)}</small><h1>${escapeHtml(document.content.heading)}</h1><p>${escapeHtml(document.content.introduction)}</p>${rows}<div class="total">Итого: ${money(document.content.totals.total)}</div>${document.content.clauses.map((clause) => `<p>${escapeHtml(clause)}</p>`).join("")}</body></html>`;

}
