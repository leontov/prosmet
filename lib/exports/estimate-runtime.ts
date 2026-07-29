"use client";

import type { EstimateDraft } from "@/lib/domain/estimate";
import {
  createEstimatePdfBlob,
  estimatePdfFilename,
  exportEstimateXlsx
} from "./estimate";

export { createEstimatePdfBlob, estimatePdfFilename, exportEstimateXlsx };

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
    // Keep both the browsing context and the object URL alive while Chromium
    // finalises the asynchronous download. If a browser ignores `download`,
    // the blob is opened only inside the hidden frame, never in the chat tab.
    window.setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(objectUrl);
    }, 30_000);
  }
}

export async function exportEstimatePdf(draft: EstimateDraft) {
  const blob = await createEstimatePdfBlob(draft);
  downloadBlobWithoutNavigating(blob, estimatePdfFilename(draft));
}
