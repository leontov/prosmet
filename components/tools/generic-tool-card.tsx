"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";

export const GenericToolCard: ToolCallMessagePartComponent<Record<string, unknown>, Record<string, unknown>> = ({ args, result, status }) => (
  <div className="my-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm font-semibold">Профессиональный инструмент</p>
      <span className="rounded-full bg-neutral-100 px-2 py-1 text-[11px] text-neutral-600">{status.type}</span>
    </div>
    <pre className="mt-3 max-h-56 overflow-auto rounded-lg bg-neutral-50 p-3 text-xs text-neutral-700">{JSON.stringify(result ?? args, null, 2)}</pre>
  </div>
);
