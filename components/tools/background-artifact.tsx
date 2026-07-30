"use client";

import { LoaderCircleIcon } from "lucide-react";

export type BackgroundArtifactKind =
  | "project"
  | "technology"
  | "resources"
  | "prices"
  | "review";

const labels: Record<BackgroundArtifactKind, string> = {
  project: "Уточняю задачу и объект",
  technology: "Собираю технологическую последовательность",
  resources: "Формирую ресурсы и объёмы",
  prices: "Проверяю цены и источники",
  review: "Проверяю смету перед выдачей"
};

/**
 * Domain tools remain persisted in the assistant thread and AG-UI state, but
 * completed service artifacts must not turn the customer conversation into a
 * long technical report. While a tool is running we show one quiet status row;
 * after completion it occupies no visual space and can still be inspected from
 * the estimate document, the right inspector and persisted thread data.
 */
export function BackgroundArtifact({
  kind,
  status
}: {
  kind: BackgroundArtifactKind;
  status?: { type?: string };
}) {
  const running = status?.type === "running" || status?.type === "incomplete";

  if (!running) {
    return <span hidden data-prosmet-background-artifact={kind} />;
  }

  return (
    <div
      className="my-1 inline-flex max-w-full items-center gap-2 rounded-lg bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-500"
      data-prosmet-background-artifact={kind}
      aria-live="polite"
    >
      <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin" />
      <span className="truncate">{labels[kind]}</span>
    </div>
  );
}
