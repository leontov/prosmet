from pathlib import Path


def replace_once(path: Path, old: str, new: str) -> None:
    source = path.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one replacement, found {count}")
    path.write_text(source.replace(old, new, 1), encoding="utf-8")


path = Path("apps/web/src/features/estimate/EstimateEditor.tsx")
replace_once(
    path,
    'import { buildBrandedExcelHtml, buildBrandedPrintHtml, downloadHtmlFile, exportFileName } from "./branded-export";',
    'import { buildBrandedExcelHtml, downloadHtmlFile, exportFileName } from "./branded-export";\nimport { downloadBrandedPdf } from "./branded-pdf";'
)
replace_once(
    path,
    '''  const calculation = useMemo(() => calculateEstimate(estimate), [estimate]);
  const [shareOpen, setShareOpen] = useState(false);''',
    '''  const calculation = useMemo(() => calculateEstimate(estimate), [estimate]);
  const [shareOpen, setShareOpen] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const runExport = async (kind: "pdf" | "excel", operation: () => void | Promise<void>) => {
    setExporting(kind);
    setExportNotice(null);
    try {
      await operation();
      setExportNotice(kind === "pdf"
        ? "PDF создан и отправлен в загрузки."
        : "Excel создан в фирменных цветах ProSmet.");
    } catch (error) {
      setExportNotice(error instanceof Error ? error.message : "Не удалось сформировать файл.");
    } finally {
      setExporting(null);
    }
  };'''
)
replace_once(
    path,
    '''    onPrint: () => printEstimate(estimate, calculation),
    onExcel: () => downloadExcel(estimate, calculation)''',
    '''    onPrint: () => void runExport("pdf", () => downloadBrandedPdf({ ...estimate, totals: calculation })),
    onExcel: () => void runExport("excel", () => downloadExcel(estimate, calculation)),
    exporting,
    exportNotice'''
)
replace_once(
    path,
    '''  onPrint: () => void;
  onExcel: () => void;''',
    '''  onPrint: () => void;
  onExcel: () => void;
  exporting: "pdf" | "excel" | null;
  exportNotice: string | null;'''
)
replace_once(
    path,
    '''  const { estimate, calculation, onChange, updateItem, removeItem, addItem, onClose, onSave, onApprove, onDeliver, onPrint, onExcel } = props;''',
    '''  const { estimate, calculation, onChange, updateItem, removeItem, addItem, onClose, onSave, onApprove, onDeliver, onPrint, onExcel, exporting, exportNotice } = props;'''
)
replace_once(
    path,
    '''          <button type="button" className="icon-button" aria-label="Печать или PDF" onClick={onPrint}><FileTextIcon /></button>
          <button type="button" className="icon-button" aria-label="Скачать Excel" onClick={onExcel}><FileSpreadsheetIcon /></button>''',
    '''          <button type="button" className="icon-button" aria-label="Скачать PDF" onClick={onPrint} disabled={exporting === "pdf"}><FileTextIcon /></button>
          <button type="button" className="icon-button" aria-label="Скачать Excel" onClick={onExcel} disabled={exporting === "excel"}><FileSpreadsheetIcon /></button>'''
)
replace_once(
    path,
    '''          <p>Сохранение версии, утверждение и передача клиенту — три разных действия.</p>''',
    '''          {exportNotice
            ? <p className="estimate-export-notice" role="status">{exportNotice}</p>
            : <p>Сохранение версии, утверждение и передача клиенту — три разных действия.</p>}'''
)
replace_once(
    path,
    '''function MobileEditor(props: EditorProps) {
  const { estimate, calculation, onChange, updateItem, removeItem, addItem, onClose, onSave, onApprove, onDeliver } = props;''',
    '''function MobileEditor(props: EditorProps) {
  const { estimate, calculation, onChange, updateItem, removeItem, addItem, onClose, onSave, onApprove, onDeliver, onPrint, onExcel, exporting, exportNotice } = props;'''
)
replace_once(
    path,
    '''        </section>

        <details className="mobile-meta">''',
    '''        </section>

        <section className="mobile-export-panel" aria-label="Экспорт сметы">
          <button type="button" onClick={onPrint} disabled={exporting === "pdf"} aria-label="Скачать PDF">
            <FileTextIcon />
            <span><strong>{exporting === "pdf" ? "Создаём PDF…" : "PDF"}</strong><small>Фирменная форма ProSmet</small></span>
          </button>
          <button type="button" onClick={onExcel} disabled={exporting === "excel"} aria-label="Скачать Excel">
            <FileSpreadsheetIcon />
            <span><strong>{exporting === "excel" ? "Создаём Excel…" : "Excel"}</strong><small>Редактируемая таблица</small></span>
          </button>
        </section>
        {exportNotice ? <p className="mobile-export-notice" role="status">{exportNotice}</p> : null}

        <details className="mobile-meta">'''
)
replace_once(
    path,
    '''function printEstimate(estimate: Estimate, calculation: Calculation) {
const html = buildBrandedPrintHtml(estimate);
  const popup = window.open("", "_blank", "noopener,noreferrer,width=920,height=1200");
  if (popup) { popup.document.open(); popup.document.write(html); popup.document.close(); popup.focus(); window.setTimeout(() => popup.print(), 350); return; }
  downloadHtmlFile(html, exportFileName(estimate, "pdf").replace(/\\.pdf$/, "-print.html"), "text/html");
}''',
    '''function printEstimate(estimate: Estimate, calculation: Calculation) {
  return downloadBrandedPdf({ ...estimate, totals: calculation });
}'''
)
