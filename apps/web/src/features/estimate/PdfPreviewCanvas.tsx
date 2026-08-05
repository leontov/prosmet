import { useEffect, useState } from "react";
import { ArrowLeftIcon, DownloadIcon, FileTextIcon } from "lucide-react";

type Props = {
  blob: Blob;
  filename: string;
  onBack: () => void;
};

export function PdfPreviewCanvas({ blob, filename, onBack }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);

  const download = () => {
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
  };

  return (
    <section className="pdf-preview-canvas" role="region" aria-label="Предпросмотр PDF">
      <header>
        <button type="button" onClick={onBack} aria-label="Вернуться к смете"><ArrowLeftIcon /></button>
        <div><FileTextIcon /><span><strong>PDF</strong><small>{filename}</small></span></div>
        <button type="button" className="pdf-preview-download" onClick={download} disabled={!url} aria-label="Скачать PDF"><DownloadIcon /> Скачать</button>
      </header>
      <div className="pdf-preview-frame">
        {url ? <iframe title={`Предпросмотр ${filename}`} src={url} /> : <div role="status">Готовим PDF…</div>}
      </div>
    </section>
  );
}
