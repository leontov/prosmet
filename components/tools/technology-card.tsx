"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClipboardCheckIcon,
  LoaderCircleIcon,
  WrenchIcon
} from "lucide-react";
import { TechnologyStepSchema, type TechnologyStep } from "@/lib/domain/estimate";

function normalizeSteps(args: unknown): TechnologyStep[] {
  const root = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const raw = Array.isArray(root.steps)
    ? root.steps
    : Array.isArray(root.technology)
      ? root.technology
      : [];
  return raw.flatMap((item, index) => {
    const parsed = TechnologyStepSchema.safeParse({
      id:
        item && typeof item === "object" && typeof (item as Record<string, unknown>).id === "string"
          ? (item as Record<string, unknown>).id
          : `step-${index + 1}`,
      ...(item && typeof item === "object" ? item : {})
    });
    return parsed.success ? [parsed.data] : [];
  });
}

export function TechnologyCard({
  args,
  status
}: {
  args: unknown;
  status?: { type?: string };
}) {
  const steps = useMemo(() => normalizeSteps(args), [args]);
  const [expanded, setExpanded] = useState(true);
  const running = status?.type === "running" || steps.length === 0;

  return (
    <section className="mt-3 w-full max-w-(--thread-max-width) overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <header className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3.5 sm:px-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-600">
          {running ? (
            <LoaderCircleIcon className="size-4 animate-spin" />
          ) : (
            <WrenchIcon className="size-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium uppercase tracking-[0.07em] text-neutral-500">
            Технологическая карта
          </div>
          <h3 className="mt-0.5 truncate text-sm font-semibold">
            {running ? "Формируем полный состав операций…" : `${steps.length} технологических операций`}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex size-8 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
          aria-label={expanded ? "Свернуть технологическую карту" : "Развернуть технологическую карту"}
        >
          {expanded ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
        </button>
      </header>

      {expanded && (
        <div className="px-4 py-4 sm:px-5">
          {running ? (
            <div className="grid gap-2">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="h-12 animate-pulse rounded-xl bg-neutral-100" />
              ))}
            </div>
          ) : (
            <ol className="grid gap-3">
              {steps.map((step, index) => (
                <li key={step.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                  <span className="flex size-7 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-semibold text-white">
                    {index + 1}
                  </span>
                  <div className="rounded-xl border border-neutral-100 bg-neutral-50/60 px-3.5 py-3">
                    <div className="text-sm font-medium">{step.title}</div>
                    {step.description && (
                      <p className="mt-1 text-xs leading-5 text-neutral-600">{step.description}</p>
                    )}
                    {step.resources.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {step.resources.map((resource) => (
                          <span
                            key={resource}
                            className="rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[10px] text-neutral-600"
                          >
                            {resource}
                          </span>
                        ))}
                      </div>
                    )}
                    {step.control && (
                      <div className="mt-2 flex items-start gap-1.5 text-[11px] leading-5 text-emerald-700">
                        <ClipboardCheckIcon className="mt-0.5 size-3.5 shrink-0" />
                        {step.control}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
          {!running && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800">
              <CheckCircle2Icon className="size-4" />
              Подготовил технологическую карту: состав работ сформирован до расчёта сметы.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
