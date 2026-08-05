from __future__ import annotations

import json
from pathlib import Path


def replace_once(path: Path, old: str, new: str) -> None:
    source = path.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one target, found {count}")
    path.write_text(source.replace(old, new, 1), encoding="utf-8")


def replace_between(path: Path, start: str, end: str, replacement: str) -> None:
    source = path.read_text(encoding="utf-8")
    start_index = source.find(start)
    if start_index < 0:
        raise SystemExit(f"{path}: start marker not found: {start[:80]}")
    end_index = source.find(end, start_index)
    if end_index < 0:
        raise SystemExit(f"{path}: end marker not found: {end[:80]}")
    path.write_text(source[:start_index] + replacement + source[end_index:], encoding="utf-8")


# --- App CSS entry ---------------------------------------------------------
app_entry = Path("apps/web/src/app/AppEntry.tsx")
replace_once(
    app_entry,
    'import "../mobile-brand-polish.css";\n',
    'import "../mobile-brand-polish.css";\nimport "../workspace-canvas.css";\n',
)

# --- PDF runtime: create Blob for in-app preview --------------------------
pdf = Path("apps/web/src/features/estimate/branded-pdf.ts")
replace_once(
    pdf,
    '''type PdfMake = {
  vfs?: Record<string, string>;
  createPdf: (definition: unknown) => { download: (filename: string) => void };
};''',
    '''type PdfDocument = {
  download: (filename: string) => void;
  getBlob: (callback: (blob: Blob) => void) => void;
};
type PdfMake = {
  vfs?: Record<string, string>;
  createPdf: (definition: unknown) => PdfDocument;
};''',
)
replace_between(
    pdf,
    "export async function downloadBrandedPdf(value: unknown) {",
    "\n}",
    '''async function loadPdfMake() {
  const [pdfMakeModule, fontsModule] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts")
  ]);
  const pdfMake = (pdfMakeModule.default ?? pdfMakeModule) as unknown as PdfMake;
  const fonts = (fontsModule.default ?? fontsModule) as unknown as PdfFonts;
  const vfs = fonts.pdfMake?.vfs ?? fonts.vfs ?? directFontVfs(fonts) ?? pdfMake.vfs;
  if (!vfs) throw new Error("Не удалось загрузить шрифты PDF.");
  pdfMake.vfs = vfs;
  return pdfMake;
}

export async function createBrandedPdfBlob(value: unknown) {
  const pdfMake = await loadPdfMake();
  const document = pdfMake.createPdf(buildBrandedPdfDefinition(value));
  const blob = await new Promise<Blob>((resolve) => document.getBlob(resolve));
  const signature = new TextDecoder("ascii").decode(await blob.slice(0, 5).arrayBuffer());
  if (signature !== "%PDF-") throw new Error("Сформированный файл не является PDF.");
  return blob;
}

export async function downloadBrandedPdf(value: unknown) {
  const pdfMake = await loadPdfMake();
  pdfMake.createPdf(buildBrandedPdfDefinition(value)).download(exportFileName(value, "pdf"));
''',
)

# --- Estimate editor: embedded canvas, PDF preview, XLSX ------------------
editor = Path("apps/web/src/features/estimate/EstimateEditor.tsx")
replace_once(
    editor,
    'import { buildBrandedExcelHtml, downloadHtmlFile, exportFileName } from "./branded-export";\nimport { downloadBrandedPdf } from "./branded-pdf";',
    'import { exportFileName } from "./branded-export";\nimport { createBrandedPdfBlob } from "./branded-pdf";\nimport { downloadBrandedXlsx } from "./branded-xlsx";\nimport { PdfPreviewCanvas } from "./PdfPreviewCanvas";',
)
replace_once(
    editor,
    '''type Props = {
  mobile: boolean;
  estimate: Estimate;
  onChange: (estimate: Estimate) => void;
  onClose: () => void;
};''',
    '''type Props = {
  mobile: boolean;
  estimate: Estimate;
  onChange: (estimate: Estimate) => void;
  onClose: () => void;
  embedded?: boolean;
};''',
)
replace_once(
    editor,
    'export function EstimateEditor({ mobile, estimate, onChange, onClose }: Props) {',
    'export function EstimateEditor({ mobile, estimate, onChange, onClose, embedded = false }: Props) {',
)
replace_once(
    editor,
    '''  const [shareOpen, setShareOpen] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);''',
    '''  const [shareOpen, setShareOpen] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<{ blob: Blob; filename: string } | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);''',
)
replace_once(
    editor,
    '''      setExportNotice(kind === "pdf"
        ? "PDF создан и отправлен в загрузки."
        : "Excel создан в фирменных цветах ProSmet.");''',
    '''      setExportNotice(kind === "pdf"
        ? "PDF сформирован и открыт в рабочей области."
        : "Excel .xlsx создан в фирменных цветах ProSmet.");''',
)
replace_once(
    editor,
    '''    onDeliver: deliver,
    onPrint: () => void runExport("pdf", () => downloadBrandedPdf({ ...estimate, totals: calculation })),
    onExcel: () => void runExport("excel", () => downloadExcel(estimate, calculation)),
    exporting,''',
    '''    onDeliver: deliver,
    onPrint: () => void runExport("pdf", async () => {
      const value = { ...estimate, totals: calculation };
      setPdfPreview({
        blob: await createBrandedPdfBlob(value),
        filename: exportFileName(value, "pdf")
      });
    }),
    onExcel: () => void runExport("excel", () => downloadBrandedXlsx({ ...estimate, totals: calculation })),
    exporting,''',
)
replace_between(
    editor,
    '  return (\n    <div className="estimate-overlay"',
    '\n}\n\ntype EditorProps',
    '''  return (
    <div className={embedded ? "estimate-canvas-surface" : "estimate-page-surface"} role="region" aria-label="Редактор сметы">
      {pdfPreview ? (
        <PdfPreviewCanvas blob={pdfPreview.blob} filename={pdfPreview.filename} onBack={() => setPdfPreview(null)} />
      ) : shareOpen ? (
        <ShareDialog
          estimate={estimate}
          total={calculation.total}
          onClose={() => setShareOpen(false)}
          onSent={() => {
            onChange({ ...estimate, status: "sent", updatedAt: new Date().toISOString() });
            setShareOpen(false);
          }}
        />
      ) : mobile ? <MobileEditor {...editorProps} /> : <DesktopEditor {...editorProps} />}
    </div>
  );''',
)
replace_once(
    editor,
    '<button type="button" className="icon-button" aria-label="Скачать PDF" onClick={onPrint} disabled={exporting === "pdf"}><FileTextIcon /></button>',
    '<button type="button" className="icon-button estimate-export-pdf" aria-label="Скачать PDF" onClick={onPrint} disabled={exporting === "pdf"}><FileTextIcon /></button>',
)
replace_once(
    editor,
    '<button type="button" className="icon-button" aria-label="Скачать Excel" onClick={onExcel} disabled={exporting === "excel"}><FileSpreadsheetIcon /></button>',
    '<button type="button" className="icon-button estimate-export-excel" aria-label="Скачать Excel" onClick={onExcel} disabled={exporting === "excel"}><FileSpreadsheetIcon /></button>',
)
replace_once(
    editor,
    '<button type="button" onClick={onPrint} disabled={exporting === "pdf"} aria-label="Скачать PDF">',
    '<button type="button" className="estimate-export-pdf" onClick={onPrint} disabled={exporting === "pdf"} aria-label="Скачать PDF">',
)
replace_once(
    editor,
    '<button type="button" onClick={onExcel} disabled={exporting === "excel"} aria-label="Скачать Excel">',
    '<button type="button" className="estimate-export-excel" onClick={onExcel} disabled={exporting === "excel"} aria-label="Скачать Excel">',
)
replace_between(
    editor,
    '  return (\n    <div className="share-dialog-layer">',
    '\n  );\n}\n\nfunction estimateSummary',
    '''  return (
    <section className="share-canvas-surface" role="region" aria-label="Передача сметы клиенту">
      <header><div><h2>Передать клиенту</h2><p>Выберите реальный канал передачи. Статус обновится после запуска действия.</p></div><button type="button" onClick={onClose} aria-label="Закрыть"><XIcon /></button></header>
      <button type="button" onClick={() => void webShare()}><span className="share-channel"><Share2Icon /></span><span><strong>Системное меню</strong><small>AirDrop, сообщения и установленные приложения</small></span></button>
      <button type="button" onClick={whatsapp}><span className="share-channel whatsapp"><SendIcon /></span><span><strong>WhatsApp</strong><small>Открыть готовое сообщение</small></span></button>
      <button type="button" onClick={email}><span className="share-channel"><MailIcon /></span><span><strong>Электронная почта</strong><small>Открыть письмо с суммой и объектом</small></span></button>
      <button type="button" onClick={() => void copy()}><span className="share-channel"><CopyIcon /></span><span><strong>Копировать описание</strong><small>Скопировать состав и итог сметы</small></span></button>
    </section>''',
)
source = editor.read_text(encoding="utf-8")
cut = source.find("\nfunction downloadExcel")
if cut < 0:
    raise SystemExit("EstimateEditor: obsolete export helpers not found")
editor.write_text(source[:cut] + "\n", encoding="utf-8")

# --- Workflow API: editable document content ------------------------------
workflow_api = Path("apps/web/src/features/workflow/workflow-api.ts")
replace_once(
    workflow_api,
    '''export async function updateDocumentStatus(
  documentId: string,
  action: "send" | "sign" | "approve"
): Promise<ConstructionDocument> {
  return api<ConstructionDocument>(`/api/workflows/documents/${encodeURIComponent(documentId)}/actions`, {
    method: "POST",
    body: JSON.stringify({ action })
  });
}
''',
    '''export async function updateDocumentStatus(
  documentId: string,
  action: "send" | "sign" | "approve"
): Promise<ConstructionDocument> {
  return api<ConstructionDocument>(`/api/workflows/documents/${encodeURIComponent(documentId)}/actions`, {
    method: "POST",
    body: JSON.stringify({ action })
  });
}

export async function updateDocumentContent(
  documentId: string,
  content: Pick<ConstructionDocument["content"], "heading" | "introduction" | "clauses" | "notes">
): Promise<ConstructionDocument> {
  return api<ConstructionDocument>(`/api/workflows/documents/${encodeURIComponent(documentId)}`, {
    method: "PUT",
    body: JSON.stringify({ content })
  });
}
''',
)

# --- Workflow/document surfaces: embedded, editable, legal readiness ------
inspector = Path("apps/web/src/features/workflow/WorkflowInspector.tsx")
replace_once(
    inspector,
    '''export function WorkflowInspector({
  workflow,
  mobile,
  open,''',
    '''export function WorkflowInspector({
  workflow,
  mobile,
  open,
  embedded = false,''',
)
replace_once(
    inspector,
    '''  workflow: WorkflowDetail | null;
  mobile: boolean;
  open: boolean;
  busy: string | null;''',
    '''  workflow: WorkflowDetail | null;
  mobile: boolean;
  open: boolean;
  embedded?: boolean;
  busy: string | null;''',
)
replace_once(
    inspector,
    '''    <div className={mobile ? "pro-flow-layer pro-flow-mobile" : "pro-flow-layer"} role="dialog" aria-modal="true" aria-label="Процесс проекта">
      <button type="button" className="pro-flow-backdrop" onClick={onClose} aria-label="Закрыть процесс проекта" />
      <aside className="pro-flow-panel">''',
    '''    <div className={embedded ? "pro-flow-canvas" : mobile ? "pro-flow-layer pro-flow-mobile" : "pro-flow-layer"} role="region" aria-label="Процесс проекта">
      {embedded ? null : <button type="button" className="pro-flow-backdrop" onClick={onClose} aria-label="Закрыть процесс проекта" />}
      <aside className={embedded ? "pro-flow-panel pro-flow-panel-embedded" : "pro-flow-panel"}>''',
)
replace_once(
    inspector,
    '''export function DocumentViewer({ document, mobile, onClose, onStatus }: {
  document: ConstructionDocument | null;
  mobile: boolean;
  onClose: () => void;
  onStatus: (document: ConstructionDocument, action: "send" | "sign" | "approve") => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!document) return null;
  const total = document.content.totals.total;''',
    '''export function DocumentViewer({ document, mobile, embedded = false, onClose, onStatus, onContent }: {
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
    setClausesText(document.content.clauses.join("\\n\\n"));
    setNotesText(document.content.notes.join("\\n\\n"));
  }, [document]);

  if (!document) return null;
  const total = document.content.totals.total;
  const clauses = paragraphs(clausesText);
  const notes = paragraphs(notesText);
  const readiness = contractReadiness(document, { heading, introduction, clauses, notes });''',
)
replace_once(
    inspector,
    '''  const share = async () => {
    const text = `${document.content.heading}\n${document.content.introduction}\nИтого: ${money(total)}`;''',
    '''  const share = async () => {
    const text = `${heading}\n${introduction}\nИтого: ${money(total)}`;''',
)
replace_once(
    inspector,
    '''  return (
    <div className={mobile ? "pro-document-layer pro-document-mobile" : "pro-document-layer"} role="dialog" aria-modal="true" aria-label={document.title}>
      <button type="button" className="pro-document-backdrop" onClick={onClose} aria-label="Закрыть документ" />
      <article className="pro-document-viewer">''',
    '''  const saveContent = async () => {
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
      <article className={embedded ? "pro-document-viewer pro-document-viewer-embedded" : "pro-document-viewer"}>''',
)
replace_once(
    inspector,
    '<button type="button" onClick={() => printDocument(document)} aria-label="Печать или PDF"><PrinterIcon /></button>',
    '<button type="button" onClick={() => setPreview((value) => !value)} aria-label={preview ? "Вернуться к документу" : "Предпросмотр печати или PDF"}><PrinterIcon /></button>',
)
replace_once(
    inspector,
    '''        <div className="pro-document-scroll">
          <div className="pro-document-paper">
            <header><small>{document.number}</small><h1>{document.content.heading}</h1><p>{document.content.introduction}</p></header>''',
    '''        <div className="pro-document-scroll">
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
            </section>''',
)
replace_once(
    inspector,
    '''            {document.content.clauses.length ? <section className="pro-document-clauses"><h2>Условия</h2>{document.content.clauses.map((clause) => <p key={clause}>{clause}</p>)}</section> : null}
            <section className="pro-document-notes"><h2>Примечания</h2>{document.content.notes.map((note) => <p key={note}>{note}</p>)}</section>
            <footer><div><span>Исполнитель</span><i /></div><div><span>Заказчик</span><i /></div></footer>
          </div>
        </div>''',
    '''            {clauses.length ? <section className="pro-document-clauses"><h2>Условия</h2>{clauses.map((clause) => <p key={clause}>{clause}</p>)}</section> : null}
            <section className="pro-document-notes"><h2>Примечания</h2>{notes.map((note) => <p key={note}>{note}</p>)}</section>
            <footer><div><span>Исполнитель</span><i /></div><div><span>Заказчик</span><i /></div></footer>
          </div>
          )}
        </div>''',
)
replace_between(
    inspector,
    "function printDocument(document: ConstructionDocument) {",
    "\n}",
    '''function paragraphs(value: string) {
  return value.split(/\\n\\s*\\n/u).map((entry) => entry.trim()).filter(Boolean).slice(0, 80);
}

function contractReadiness(
  document: ConstructionDocument,
  content: Pick<ConstructionDocument["content"], "heading" | "introduction" | "clauses" | "notes">
) {
  const text = [content.heading, content.introduction, ...content.clauses, ...content.notes].join(" ");
  const hasPlaceholder = /\\[(?:УКАЗАТЬ|ВЫБРАТЬ|ЗАПОЛНИТЬ)[^\\]]*\\]/iu.test(text);
  const checks = [
    { label: "Предмет и состав работ закреплены сметой", complete: document.content.sections.some((section) => section.lines.length > 0) && /предмет|состав работ/iu.test(text) },
    { label: "Начальный и конечный сроки заполнены", complete: /начальн[^.]{0,80}срок/iu.test(text) && /конечн[^.]{0,80}срок/iu.test(text) && !/срок[^.]*\\[/iu.test(text) },
    { label: "Цена и статус сметы определены", complete: document.content.totals.total > 0 && /цен|смет/iu.test(text) },
    { label: "Порядок оплаты определён", complete: /порядок оплаты|аванс|оплат/iu.test(text) && !/оплат[^.]*\\[/iu.test(text) },
    { label: "Порядок сдачи и приёмки определён", complete: /при[её]мк/iu.test(text) },
    { label: "Гарантийный срок заполнен", complete: /гарант/iu.test(text) && !/гарант[^.]*\\[/iu.test(text) },
    { label: "Реквизиты и подписанты заполнены", complete: /реквизит/iu.test(text) && !/реквизит[^.]*\\[/iu.test(text) }
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
''',
)

# --- Professional app: right canvas instead of overlays -------------------
professional = Path("apps/web/src/app/ProfessionalApp.tsx")
replace_once(
    professional,
    '''  updateDocumentStatus,
  updateProgress
} from "../features/workflow/workflow-api";''',
    '''  updateDocumentContent,
  updateDocumentStatus,
  updateProgress
} from "../features/workflow/workflow-api";''',
)
replace_once(
    professional,
    '''import {
  DocumentViewer,
  WorkflowInspector
} from "../features/workflow/WorkflowInspector";''',
    '''import {
  DocumentViewer,
  WorkflowInspector
} from "../features/workflow/WorkflowInspector";
import { WorkspaceCanvasFrame } from "../features/workspace/WorkspaceCanvasFrame";''',
)
replace_once(
    professional,
    '''      applyWorkflow(next);
      if (show) setWorkflowOpen(true);''',
    '''      applyWorkflow(next);
      if (show) {
        setEstimateOpen(false);
        setDocumentOpen(null);
        setWorkflowOpen(true);
      }''',
)
replace_once(
    professional,
    '''    setChatArtifactId(incoming.id);
    setEstimateOpen(true);
    setError(null);''',
    '''    setChatArtifactId(incoming.id);
    setWorkflowOpen(false);
    setDocumentOpen(null);
    setEstimateOpen(true);
    setError(null);''',
)
replace_once(
    professional,
    '''  const openEstimate = useCallback((estimate: Estimate) => {
    setActiveEstimateId(estimate.id);
    setEstimateOpen(true);
    setError(null);
    void loadWorkflowForEstimate(estimate.id);
  }, [loadWorkflowForEstimate]);''',
    '''  const openEstimate = useCallback((estimate: Estimate) => {
    setActiveEstimateId(estimate.id);
    setWorkflowOpen(false);
    setDocumentOpen(null);
    setEstimateOpen(true);
    setError(null);
    void loadWorkflowForEstimate(estimate.id);
  }, [loadWorkflowForEstimate]);''',
)
replace_once(
    professional,
    '''      const next = await fetchWorkflowByProject(project.id);
      applyWorkflow(next);
      setWorkflowOpen(true);''',
    '''      const next = await fetchWorkflowByProject(project.id);
      applyWorkflow(next);
      setEstimateOpen(false);
      setDocumentOpen(null);
      setWorkflowOpen(true);''',
)
replace_once(
    professional,
    '''    setEstimateOpen(false);
    setWorkflowOpen(false);
    setChatArtifactId(null);''',
    '''    setEstimateOpen(false);
    setWorkflowOpen(false);
    setDocumentOpen(null);
    setChatArtifactId(null);''',
)
replace_once(
    professional,
    '''      const next = await runWorkflowAction(activeEstimateId, action);
      applyWorkflow(next);
      setWorkflowOpen(true);''',
    '''      const next = await runWorkflowAction(activeEstimateId, action);
      applyWorkflow(next);
      setEstimateOpen(false);
      setDocumentOpen(null);
      setWorkflowOpen(true);''',
)
replace_once(
    professional,
    '''  const refreshPrices = useCallback(async (query: string, region: string) => {''',
    '''  const openDocument = useCallback((document: ConstructionDocument) => {
    setEstimateOpen(false);
    setWorkflowOpen(false);
    setDocumentOpen(document);
  }, []);

  const saveDocumentContent = useCallback(async (
    document: ConstructionDocument,
    content: Pick<ConstructionDocument["content"], "heading" | "introduction" | "clauses" | "notes">
  ) => {
    const updated = await updateDocumentContent(document.id, content);
    setDocumentOpen(updated);
    setDocuments((current) => current.map((item) => item.id === updated.id ? updated : item));
  }, []);

  const refreshPrices = useCallback(async (query: string, region: string) => {''',
)
replace_once(professional, "      onOpenDocument={setDocumentOpen}", "      onOpenDocument={openDocument}")

source = professional.read_text(encoding="utf-8")
return_start = source.find("  return (\n    <RuntimeProvider key={runtimeKey}")
return_end = source.find("\n}\n\nfunction Workspace", return_start)
if return_start < 0 or return_end < 0:
    raise SystemExit("ProfessionalApp return block markers not found")
new_return = '''  const desktopCanvas = !mobile
    ? documentOpen ? (
      <DocumentViewer
        document={documentOpen}
        mobile={false}
        embedded
        onClose={() => setDocumentOpen(null)}
        onStatus={updateDocument}
        onContent={saveDocumentContent}
      />
    ) : workflowOpen && workflow ? (
      <WorkflowInspector
        workflow={workflow}
        mobile={false}
        embedded
        open
        busy={busy}
        error={error}
        onClose={() => setWorkflowOpen(false)}
        onAction={(action) => void runAction(action)}
        onProgress={saveProgress}
        onOpenEstimate={() => {
          setWorkflowOpen(false);
          setEstimateOpen(true);
        }}
        onOpenDocument={openDocument}
      />
    ) : estimateOpen && activeEstimate ? (
      <EstimateEditor
        mobile={false}
        embedded
        estimate={activeEstimate}
        onChange={(next) => { void handleEstimateChange(next); }}
        onClose={() => setEstimateOpen(false)}
      />
    ) : null
    : null;

  const desktopCanvasTitle = documentOpen
    ? documentOpen.title
    : workflowOpen && workflow
      ? workflow.project.title
      : estimateOpen && activeEstimate
        ? activeEstimate.title
        : "Рабочая область";
  const desktopCanvasSubtitle = documentOpen
    ? `${documentOpen.number} · ${documentOpen.status}`
    : workflowOpen && workflow
      ? `Процесс · ${workflow.project.progress.percent}%`
      : estimateOpen && activeEstimate
        ? `Смета · версия ${activeEstimate.revision}`
        : null;

  const closeDesktopCanvas = () => {
    if (documentOpen) {
      setDocumentOpen(null);
      if (workflow) setWorkflowOpen(true);
      return;
    }
    if (workflowOpen) {
      setWorkflowOpen(false);
      return;
    }
    setEstimateOpen(false);
  };

  return (
    <RuntimeProvider key={runtimeKey} onEstimateReady={handleEstimateReady}>
      {mobile ? (
        <MobileShell
          view={view}
          onView={setView}
          onNewChat={newChat}
          estimates={estimates}
          projects={projects}
          system={system}
        >{workspace}</MobileShell>
      ) : (
        <WorkspaceCanvasFrame
          canvas={desktopCanvas}
          canvasTitle={desktopCanvasTitle}
          canvasSubtitle={desktopCanvasSubtitle}
          onCloseCanvas={closeDesktopCanvas}
        >
          <DesktopShell
            view={view}
            onView={setView}
            onNewChat={newChat}
            estimates={estimates}
            activeEstimate={activeEstimate}
            system={system}
            onOpenEstimate={openEstimate}
          >{workspace}</DesktopShell>
        </WorkspaceCanvasFrame>
      )}

      {mobile && estimateOpen && activeEstimate ? (
        <EstimateEditor
          mobile
          estimate={activeEstimate}
          onChange={(next) => { void handleEstimateChange(next); }}
          onClose={() => setEstimateOpen(false)}
        />
      ) : null}

      {mobile && estimateOpen && workflow ? (
        <button type="button" className="pro-editor-workflow-trigger" onClick={() => setWorkflowOpen(true)}>
          <LayoutDashboardIcon /> Процесс
          <span>{workflow.project.progress.percent}%</span>
        </button>
      ) : null}

      {mobile ? (
        <WorkflowInspector
          workflow={workflow}
          mobile
          open={workflowOpen}
          busy={busy}
          error={error}
          onClose={() => setWorkflowOpen(false)}
          onAction={(action) => void runAction(action)}
          onProgress={saveProgress}
          onOpenEstimate={() => setEstimateOpen(true)}
          onOpenDocument={openDocument}
        />
      ) : null}

      {mobile ? (
        <DocumentViewer
          document={documentOpen}
          mobile
          onClose={() => setDocumentOpen(null)}
          onStatus={updateDocument}
          onContent={saveDocumentContent}
        />
      ) : null}

      {error && !workflowOpen ? <div className="pro-global-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError(null)}><XIcon /></button></div> : null}
    </RuntimeProvider>
  );'''
professional.write_text(source[:return_start] + new_return + source[return_end:], encoding="utf-8")

# --- Server: richer RU contract and editable document endpoint ------------
server = Path("apps/web/server.mjs")
replace_once(
    server,
    '''    contract: [
      "Предмет: выполнение строительных работ по утверждённой смете и технологической карте.",
      "Цена, состав и объёмы работ меняются только оформленной версией сметы или дополнительным соглашением.",
      "Сроки, порядок оплаты, порядок приёмки, гарантийные обязательства и ответственность сторон требуют заполнения до подписания.",
      "Проект договора должен пройти проверку юриста с учётом статуса сторон и конкретного объекта."
    ],''',
    '''    contract: [
      `1. Предмет договора. ${organization} (Подрядчик) обязуется выполнить для ${customer} (Заказчик) строительные работы по объекту «${project.title}» в составе, объёмах и по ценам утверждённой сметы версии ${estimate.revision}, являющейся Приложением № 1 к договору, а Заказчик обязуется создать необходимые условия, принять результат и оплатить его.`,
      "2. Сроки выполнения работ. Начальный срок: [УКАЗАТЬ ДАТУ ИЛИ УСЛОВИЕ НАЧАЛА]. Конечный срок: [УКАЗАТЬ ДАТУ]. Промежуточные этапы и порядок изменения сроков: [УКАЗАТЬ].",
      `3. Цена договора. Стоимость работ по утверждённой смете составляет ${Math.round(totals.total).toLocaleString("ru-RU")} ₽. Цена является [ВЫБРАТЬ: ТВЁРДОЙ / ПРИБЛИЗИТЕЛЬНОЙ]. Дополнительные работы и изменение цены допускаются только после письменного согласования и оформления дополнительного соглашения или новой утверждённой версии сметы.`,
      "4. Порядок оплаты. Аванс: [УКАЗАТЬ ПРОЦЕНТ И СРОК]. Промежуточные платежи: [УКАЗАТЬ]. Окончательный расчёт: [УКАЗАТЬ СРОК ПОСЛЕ ПРИЁМКИ]. Способ оплаты и банковские реквизиты сторон: [УКАЗАТЬ РЕКВИЗИТЫ].",
      "5. Материалы и оборудование. Сторона, предоставляющая материалы, их перечень, качество, сроки передачи, порядок учёта остатков и ответственность за сохранность: [УКАЗАТЬ].",
      "6. Сдача и приёмка. Подрядчик уведомляет Заказчика о готовности результата. Заказчик осматривает и принимает работы в согласованный срок с оформлением акта; замечания и обнаруженные недостатки фиксируются в акте или мотивированном отказе.",
      "7. Качество и гарантия. Работы должны соответствовать договору, технической документации и обязательным требованиям. Гарантийный срок: [УКАЗАТЬ СРОК]. Порядок уведомления и устранения недостатков: [УКАЗАТЬ].",
      "8. Права, обязанности и ответственность сторон. Ответственность за просрочку, нарушение качества, непредоставление фронта работ и задержку оплаты: [УКАЗАТЬ НЕУСТОЙКУ И ПОРЯДОК РАСЧЁТА].",
      "9. Изменение и расторжение. Изменения оформляются письменно. Односторонний отказ и расчёты за фактически выполненную часть допускаются в случаях и порядке, предусмотренных законом и договором.",
      "10. Обстоятельства непреодолимой силы. Сторона уведомляет другую сторону о наступлении и прекращении таких обстоятельств в срок [УКАЗАТЬ] рабочих дней и подтверждает их документами компетентного органа, когда это применимо.",
      "11. Споры. Претензионный порядок: [УКАЗАТЬ СРОК ОТВЕТА]. Подсудность определяется применимым законодательством; условие о территориальной подсудности не должно ограничивать права потребителя, если Заказчик является гражданином-потребителем.",
      "12. Особый режим для потребителя. Если работы выполняются для личных, семейных или бытовых нужд гражданина, применяются императивные гарантии законодательства о защите прав потребителей; условия договора не могут уменьшать установленные законом права Заказчика.",
      "13. Заключительные положения. Неотъемлемые приложения: утверждённая смета, техническое задание/технологическая карта, график работ, перечень материалов и акт передачи объекта. Реквизиты, подписанты и основания полномочий сторон: [УКАЗАТЬ РЕКВИЗИТЫ И ПОДПИСАНТОВ]."
    ],''',
)
replace_once(
    server,
    '''      "Рыночные цены являются коммерческими ориентирами на дату расчёта и могут требовать подтверждения счетами поставщиков."
    ];''',
    '''      "Рыночные цены являются коммерческими ориентирами на дату расчёта и могут требовать подтверждения счетами поставщиков.",
      "Правовая основа шаблона договора: общие положения о подряде и строительном подряде ГК РФ (включая статьи 702, 708, 709, 720, 740, 743, 746, 753–755); для гражданина-потребителя дополнительно применяется Закон РФ № 2300-1. Шаблон не заменяет проверку конкретного договора юристом."
    ];''',
)
replace_once(
    server,
    '''  const documentRoute = url.pathname.match(/^\/api\/workflows\/documents\/([^/]+)$/);
  if (documentRoute && request.method === "GET") {
    const document = workflowStore.document(decodeURIComponent(documentRoute[1]));
    if (!document) return sendError(response, 404, "DOCUMENT_NOT_FOUND", "Документ не найден");
    return sendJson(response, 200, document);
  }''',
    '''  const documentRoute = url.pathname.match(/^\/api\/workflows\/documents\/([^/]+)$/);
  if (documentRoute) {
    const documentId = decodeURIComponent(documentRoute[1]);
    const document = workflowStore.document(documentId);
    if (!document) return sendError(response, 404, "DOCUMENT_NOT_FOUND", "Документ не найден");
    if (request.method === "GET") return sendJson(response, 200, document);
    if (request.method === "PUT") {
      const body = await readJsonBody(request);
      const content = body?.content && typeof body.content === "object" ? body.content : {};
      const cleanParagraphs = (value, fallback) => Array.isArray(value)
        ? value.map((entry) => optionalString(entry, 4000)).filter(Boolean).slice(0, 80)
        : fallback;
      const updated = workflowStore.saveDocument({
        projectId: document.projectId,
        estimateId: document.estimateId,
        type: document.type,
        status: document.status,
        number: document.number,
        title: document.title,
        content: {
          ...document.content,
          heading: optionalString(content.heading, 500) || document.content.heading,
          introduction: optionalString(content.introduction, 6000) || "",
          clauses: cleanParagraphs(content.clauses, document.content.clauses),
          notes: cleanParagraphs(content.notes, document.content.notes)
        }
      });
      return sendJson(response, 200, updated);
    }
  }''',
)
replace_once(
    server,
    '''        "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",''',
    '''        "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",''',
)

# --- Tauri CSP allows only local Blob PDF preview frames ------------------
tauri = Path("apps/desktop/src-tauri/tauri.conf.json")
data = json.loads(tauri.read_text(encoding="utf-8"))
data["app"]["security"]["csp"] = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob:; font-src 'self' data:; "
    "connect-src 'self' https://kolibriai.online; frame-src 'self' blob:; "
    "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
)
tauri.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# --- E2E: canvas, preview and real XLSX -----------------------------------
e2e = Path("apps/web/e2e/app.spec.ts")
replace_once(
    e2e,
    '  const editor = page.getByRole("dialog", { name: "Редактор сметы" });',
    '  const editor = page.getByRole("region", { name: "Редактор сметы" });',
)
replace_once(
    e2e,
    '''    await expect(editor.locator(".estimate-summary")).toBeVisible();
    expect((await desktopEditor.boundingBox())?.width ?? 0).toBeGreaterThan(1200);''',
    '''    await expect(editor.locator(".estimate-summary")).toBeVisible();
    expect((await desktopEditor.boundingBox())?.width ?? 0).toBeGreaterThan(440);
    await expect(page.getByRole("separator", { name: "Изменить ширину левого сайдбара" })).toBeVisible();
    await expect(page.getByRole("separator", { name: "Изменить ширину правого канваса" })).toBeVisible();
    await expect(page.locator('[aria-modal="true"][aria-label="Редактор сметы"]')).toHaveCount(0);''',
)
replace_once(
    e2e,
    '''  const pdfDownloadPromise = page.waitForEvent("download", { timeout: 45_000 });
  await editor.getByRole("button", { name: "Скачать PDF" }).first().click();
  const pdfDownload = await pdfDownloadPromise;''',
    '''  await editor.getByRole("button", { name: "Скачать PDF" }).first().click();
  const pdfPreview = page.getByRole("region", { name: "Предпросмотр PDF" });
  await expect(pdfPreview).toBeVisible({ timeout: 45_000 });
  await expect(pdfPreview.locator("iframe")).toBeVisible();
  const pdfDownloadPromise = page.waitForEvent("download", { timeout: 45_000 });
  await pdfPreview.getByRole("button", { name: "Скачать PDF" }).click();
  const pdfDownload = await pdfDownloadPromise;''',
)
replace_once(
    e2e,
    '''  const excelDownloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await editor.getByRole("button", { name: "Скачать Excel" }).first().click();''',
    '''  await pdfPreview.getByRole("button", { name: "Вернуться к смете" }).click();
  await expect(editor.locator("#estimate-title").or(editor.locator(".mobile-estimate-hero"))).toBeVisible();

  const excelDownloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await editor.getByRole("button", { name: "Скачать Excel" }).first().click();''',
)
replace_once(
    e2e,
    '''  expect(excelDownload.suggestedFilename()).toMatch(/\.xls$/);
  const excelPath = await excelDownload.path();
  if (excelPath) {
    const excelBytes = await readFile(excelPath);
    expect(excelBytes.length).toBeGreaterThan(1_000);
    expect(excelBytes.toString("utf8")).toContain("ProSmet");
  }''',
    '''  expect(excelDownload.suggestedFilename()).toMatch(/\.xlsx$/);
  const excelPath = await excelDownload.path();
  if (excelPath) {
    const excelBytes = await readFile(excelPath);
    expect(excelBytes.length).toBeGreaterThan(5_000);
    expect(excelBytes.subarray(0, 2).toString("ascii")).toBe("PK");
    expect(excelBytes.toString("utf8")).toContain("xl/worksheets/sheet1.xml");
    expect(excelBytes.toString("utf8")).toContain("ProSmet");
  }''',
)

# Source contract protects the new architecture.
contract = Path("scripts/greenfield-contract.mjs")
source = contract.read_text(encoding="utf-8")
if '"apps/web/src/features/workspace/WorkspaceCanvasFrame.tsx"' not in source:
    source = source.replace(
        '  "apps/web/src/mobile-brand-polish.css",',
        '  "apps/web/src/mobile-brand-polish.css",\n  "apps/web/src/workspace-canvas.css",\n  "apps/web/src/features/workspace/WorkspaceCanvasFrame.tsx",\n  "apps/web/src/features/estimate/PdfPreviewCanvas.tsx",\n  "apps/web/src/features/estimate/branded-xlsx.ts",',
        1,
    )
    guard = '''\nfor (const token of ["WorkspaceCanvasFrame", "canvasFullscreen", "prosmet.workspace.sidebar-width.v1"]) {\n  if (!professionalApp.includes(token)) failures.push(`workspace:canvas-contract-missing:${token}`);\n}\nfor (const token of ["buildBrandedXlsxBytes", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"]) {\n  if (!allSource.includes(token)) failures.push(`exports:xlsx-contract-missing:${token}`);\n}\nif (!server.includes("frame-src 'self' blob:")) failures.push("security:pdf-preview-frame-csp-missing");\n'''
    source = source.replace("if (failures.length) {", guard + "\nif (failures.length) {", 1)
contract.write_text(source, encoding="utf-8")
