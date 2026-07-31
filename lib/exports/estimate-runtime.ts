"use client";

import { cloneEstimate, type EstimateDraft } from "@/lib/domain/estimate";

function safeName(value: string) {
  return value
    .replace(/[^a-zA-Zа-яА-Я0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "prosmet-estimate";
}

export function estimatePdfFilename(draft: EstimateDraft) {
  return `${safeName(draft.title)}-v${draft.revision}.pdf`;
}

function estimateXlsxFilename(draft: EstimateDraft) {
  return `${safeName(draft.title)}-v${draft.revision}.xlsx`;
}

async function requestEstimateExport(draft: EstimateDraft, format: "pdf" | "xlsx") {
  const response = await fetch(`/api/export/estimate?format=${format}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cloneEstimate(draft))
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || `Экспорт ${format.toUpperCase()} не выполнен`);
  }
  return response.blob();
}

export async function createEstimatePdfBlob(draft: EstimateDraft) {
  return requestEstimateExport(draft, "pdf");
}

function downloadBlobWithoutNavigating(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const frameName = `prosmet-download-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const frame = document.createElement("iframe");
  frame.name = frameName;
  frame.title = "Загрузка файла";
  frame.hidden = true;
  frame.setAttribute("aria-hidden", "true");
  frame.style.display = "none";
  document.body.appendChild(frame);

  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.target = frameName;
  anchor.rel = "noopener noreferrer";
  anchor.style.display = "none";
  document.body.appendChild(anchor);

  try {
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(objectUrl);
    }, 30_000);
  }
}

export async function exportEstimatePdf(draft: EstimateDraft) {
  downloadBlobWithoutNavigating(await createEstimatePdfBlob(draft), estimatePdfFilename(draft));
}

export async function exportEstimateXlsx(draft: EstimateDraft) {
  downloadBlobWithoutNavigating(await requestEstimateExport(draft, "xlsx"), estimateXlsxFilename(draft));
}
