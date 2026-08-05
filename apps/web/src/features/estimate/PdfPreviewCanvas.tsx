import { useEffect, useMemo, useState } from "react";
import type { Estimate } from "@prosmet/contracts";
import { ArrowLeftIcon, DownloadIcon, FileTextIcon, LoaderCircleIcon } from "lucide-react";
import { calculateEstimate, formatMoney } from "../../lib/estimate";
import { exportFileName } from "./branded-export";

type Props = {
  blob: Blob;
  filename: string;
  onBack: () => void;
};

type EstimateListResponse = {
  estimates?: Estimate[];
};

function statusLabel(status: Estimate["status"]) {
  return ({
    draft: "Черновик",
    review: "Версия сохранена",
    sent: "Передана клиенту",
    approved: "Утверждена"
  })[status];
}

export function PdfPreviewCanvas({ blob, filename, onBack }: Props) {
  const objectUrl = useMemo(() => URL.createObjectURL(blob), [blob]);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl]);

  useEffect(() => {
    let active = true;
    fetch("/api/estimates", { cache: "no-store", credentials: "same-origin" })
      .then((response) => response.ok ? response.json() as Promise<EstimateListResponse> : Promise.reject(new Error("estimate preview unavailable")))
      .then((payload) => {
        if (!active) return;
        const rows = Array.isArray(payload.estimates) ? payload.estimates : [];
        const matched = rows.find((row) => exportFileName(row, "pdf") === filename) || rows[0] || null;
        setEstimate(matched);
      })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filename]);

  const calculation = useMemo(() => estimate ? calculateEstimate(estimate) : null, [estimate]);

  const download = () => {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  };

  return (
    <section className="pdf-preview-canvas" role="region" aria-label="Предпросмотр PDF">
      <header>
        <button type="button" aria-label="Вернуться к смете" onClick={onBack}><ArrowLeftIcon /></button>
        <div>
          <FileTextIcon />
          <span><strong>PDF</strong><small>{filename}</small></span>
        </div>
        <button type="button" className="pdf-preview-download" aria-label="Скачать PDF" onClick={download}><DownloadIcon /> Скачать</button>
      </header>
      <div className="pdf-preview-frame loaded">
        {loading ? (
          <div className="pdf-preview-loading" role="status">
            <span><LoaderCircleIcon /></span>
            <strong>Подготавливаем предпросмотр PDF</strong>
            <small>Фирменный документ остаётся внутри рабочего канваса.</small>
          </div>
        ) : estimate && calculation ? (
          <div className="pdf-preview-scroll">
            <article className="pdf-preview-page" aria-label={`Страница PDF: ${estimate.title}`}>
              <div className="pdf-preview-brand-line" />
              <header className="pdf-preview-page-header">
                <div className="pdf-preview-brand"><span>PS</span><strong>ProSmet</strong></div>
                <div><span>Смета</span><strong>Версия {estimate.revision}</strong><small>{statusLabel(estimate.status)}</small></div>
              </header>

              <section className="pdf-preview-title-block">
                <h1>{estimate.title}</h1>
                <p>Профессиональная строительная смета</p>
              </section>

              <section className="pdf-preview-meta-grid">
                <div><span>Объект</span><strong>{estimate.project || "Не указан"}</strong></div>
                <div><span>Заказчик</span><strong>{estimate.customer || "Не указан"}</strong></div>
                <div><span>Регион</span><strong>{estimate.region || "Не указан"}</strong></div>
              </section>

              <div className="pdf-preview-table" role="table" aria-label="Позиции сметы">
                <div className="pdf-preview-table-head" role="row">
                  <span>№</span><span>Наименование</span><span>Ед.</span><span>Кол-во</span><span>Цена</span><span>Сумма</span>
                </div>
                {estimate.sections.flatMap((section) => [
                  <div className="pdf-preview-section-row" role="row" key={`section:${section.id}`}>
                    <strong>{section.title}</strong><span>{formatMoney(calculation.sectionTotals[section.id] || 0)}</span>
                  </div>,
                  ...section.items.map((item, index) => (
                    <div className="pdf-preview-item-row" role="row" key={item.id}>
                      <span>{index + 1}</span>
                      <strong>{item.name}</strong>
                      <span>{item.unit}</span>
                      <span>{item.quantity.toLocaleString("ru-RU")}</span>
                      <span>{formatMoney(item.unitPrice)}</span>
                      <b>{formatMoney(calculation.itemTotals[item.id] || 0)}</b>
                    </div>
                  ))
                ])}
              </div>

              <section className="pdf-preview-summary">
                <div><span>Прямые затраты</span><strong>{formatMoney(calculation.direct)}</strong></div>
                <div><span>Накладные</span><strong>{formatMoney(calculation.overhead)}</strong></div>
                <div><span>Сметная прибыль</span><strong>{formatMoney(calculation.profit)}</strong></div>
                <div><span>НДС</span><strong>{formatMoney(calculation.vat)}</strong></div>
                <div className="total"><span>Итого</span><strong>{formatMoney(calculation.total)}</strong></div>
              </section>

              <footer className="pdf-preview-page-footer">
                Документ сформирован в ProSmet. Перед передачей заказчику проверьте исходные данные, реквизиты и условия договора.
              </footer>
            </article>
          </div>
        ) : (
          <div className="pdf-preview-loading" role="status">
            <span><FileTextIcon /></span>
            <strong>PDF сформирован</strong>
            <small>Скачайте фирменный документ. Содержимое сметы сохранено в рабочем пространстве ProSmet.</small>
          </div>
        )}
        <iframe
          className="pdf-preview-technical-frame"
          src={objectUrl}
          title={`Предпросмотр ${filename}`}
        />
      </div>
    </section>
  );
}
