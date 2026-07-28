"use client";

import { calculateEstimate, type EstimateDraft } from "@/lib/domain/estimate";
import {
  createEstimatePdfBlob,
  estimatePdfFilename,
  exportEstimatePdf
} from "@/lib/exports/estimate";
import { formatMoney } from "@/lib/utils";

export type EstimateShareChannel =
  | "native"
  | "whatsapp"
  | "email"
  | "clipboard"
  | "pdf";

export type NativeShareResult =
  | { status: "shared"; channel: "native" }
  | { status: "unsupported" }
  | { status: "cancelled" };

export function estimateShareText(draft: EstimateDraft) {
  const calculation = calculateEstimate(draft);
  const lines = [
    draft.title,
    draft.objectName ? `Объект: ${draft.objectName}` : "",
    draft.customer ? `Заказчик: ${draft.customer}` : "",
    draft.region ? `Регион: ${draft.region}` : "",
    `Итого: ${formatMoney(calculation.total, draft.currency)}`,
    `Версия: ${draft.revision}`,
    "",
    "Смета подготовлена в Просметчике. Подробный состав работ, материалов и источники цен находятся в PDF."
  ];
  return lines.filter(Boolean).join("\n");
}

export function estimateShareSubject(draft: EstimateDraft) {
  const object = draft.objectName ? ` — ${draft.objectName}` : "";
  return `Смета: ${draft.title}${object}`;
}

export function canUseNativeEstimateShare() {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

export async function shareEstimateNative(
  draft: EstimateDraft
): Promise<NativeShareResult> {
  if (!canUseNativeEstimateShare()) return { status: "unsupported" };

  try {
    const text = estimateShareText(draft);
    const title = estimateShareSubject(draft);
    const blob = await createEstimatePdfBlob(draft);
    const file = new File([blob], estimatePdfFilename(draft), {
      type: "application/pdf",
      lastModified: Date.now()
    });
    const dataWithFile: ShareData = { title, text, files: [file] };

    if (!navigator.canShare || navigator.canShare(dataWithFile)) {
      await navigator.share(dataWithFile);
    } else {
      await navigator.share({ title, text });
    }
    return { status: "shared", channel: "native" };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { status: "cancelled" };
    }
    throw error;
  }
}

export function openEstimateWhatsApp(draft: EstimateDraft) {
  const url = `https://wa.me/?text=${encodeURIComponent(estimateShareText(draft))}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function openEstimateEmail(draft: EstimateDraft) {
  const subject = encodeURIComponent(estimateShareSubject(draft));
  const body = encodeURIComponent(estimateShareText(draft));
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
}

export async function copyEstimateSummary(draft: EstimateDraft) {
  const value = estimateShareText(draft);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Не удалось скопировать текст сметы");
}

export async function downloadEstimateForSharing(draft: EstimateDraft) {
  await exportEstimatePdf(draft);
}
