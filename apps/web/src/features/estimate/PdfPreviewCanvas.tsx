import { useEffect, useMemo, useState } from "react";
import { ArrowLeftIcon, DownloadIcon, FileTextIcon, LoaderCircleIcon } from "lucide-react";

type Props = {
  blob: Blob;
  filename: string;
  onBack: () => void;
};

export function PdfPreviewCanvas({ blob, filename, onBack }: Props) {
  const objectUrl = useMemo(() => URL.createObjectURL(blob), [blob]);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const reader = new FileReader();
    let active = true;
    reader.addEventListener("load", () => {
      if (active && typeof reader.result === "string") setDataUrl(reader.result);
    });
    reader.readAsDataURL(blob);
    return () => {
      active = false;
      reader.abort();
    };
  }, [blob]);

  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl]);

  const source = dataUrl ? `${dataUrl}#toolbar=0&navpanes=0&view=FitH` : null;

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
        <button type="button" className="pdf-preview-download" onClick={download}><DownloadIcon /> Скачать</button>
      </header>
      <div className={`pdf-preview-frame${loaded ? " loaded" : " loading"}`}>
        {!loaded ? (
          <div className="pdf-preview-loading" role="status">
            <span><LoaderCircleIcon /></span>
            <strong>Подготавливаем предпросмотр PDF</strong>
            <small>Фирменный документ остаётся внутри рабочего канваса.</small>
          </div>
        ) : null}
        {source ? (
          <iframe
            src={source}
            title={`Предпросмотр ${filename}`}
            onLoad={() => setLoaded(true)}
          />
        ) : null}
      </div>
    </section>
  );
}
