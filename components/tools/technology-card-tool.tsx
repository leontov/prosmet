"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { CheckCircle2Icon, CircleDashedIcon, TriangleAlertIcon } from "lucide-react";
import type { TechnologyCard } from "@/lib/domain/types";

interface Args { card?: TechnologyCard }
interface Result { card?: TechnologyCard; status?: string }

export const TechnologyCardTool: ToolCallMessagePartComponent<Args, Result> = ({ args, result, status }) => {
  const card = result?.card ?? args.card;
  if (!card || status.type === "running") {
    return <div className="my-3 flex items-center gap-2 rounded-xl border border-neutral-200 p-4 text-sm text-neutral-600"><CircleDashedIcon className="size-4 animate-spin" /> Формирую технологическую карту…</div>;
  }
  return (
    <article className="my-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <header className="border-b border-neutral-200 bg-neutral-50/80 px-4 py-3 sm:px-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Технологическая карта</p>
        <h3 className="mt-1 text-base font-semibold">{card.title}</h3>
        <p className="mt-1 text-xs text-neutral-500">Регион: {card.region}</p>
      </header>
      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1fr_260px]">
        <ol className="space-y-2">
          {card.operations.map((operation, index) => (
            <li key={operation.id} className="flex gap-3 rounded-xl border border-neutral-100 p-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-neutral-900 text-[11px] font-semibold text-white">{index + 1}</span>
              <div><p className="text-sm font-medium">{operation.stage}</p><p className="mt-0.5 text-xs leading-relaxed text-neutral-600">{operation.description}</p></div>
            </li>
          ))}
        </ol>
        <aside className="space-y-3">
          <div className="rounded-xl bg-amber-50 p-3.5 text-amber-950">
            <div className="flex items-center gap-2 text-sm font-semibold"><TriangleAlertIcon className="size-4" /> Нужны уточнения</div>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed">{card.missingCriticalData.map((value) => <li key={value}>• {value}</li>)}</ul>
          </div>
          <div className="rounded-xl bg-emerald-50 p-3.5 text-emerald-950">
            <div className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2Icon className="size-4" /> Допущения показаны</div>
            <p className="mt-1.5 text-xs leading-relaxed">Смета продолжает формироваться без лишней остановки, но влияние неопределённости остаётся видимым.</p>
          </div>
        </aside>
      </div>
    </article>
  );
};
