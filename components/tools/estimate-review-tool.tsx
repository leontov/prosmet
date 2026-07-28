"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { CheckCircle2Icon, CircleDashedIcon, TriangleAlertIcon, XCircleIcon } from "lucide-react";
import type { EstimateReview } from "@/lib/domain/types";

interface Args { review?: EstimateReview }
interface Result { review?: EstimateReview }

export const EstimateReviewTool: ToolCallMessagePartComponent<Args, Result> = ({ args, result, status }) => {
  const review = result?.review ?? args.review;
  if (!review || status.type === "running") return <div className="my-3 flex items-center gap-2 rounded-xl border border-neutral-200 p-4 text-sm text-neutral-600"><CircleDashedIcon className="size-4 animate-spin" /> Независимая проверка…</div>;
  const icon = (state: string) => state === "passed" ? <CheckCircle2Icon className="size-4 text-emerald-600" /> : state === "failed" ? <XCircleIcon className="size-4 text-red-600" /> : <TriangleAlertIcon className="size-4 text-amber-600" />;
  return (
    <article className="my-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Независимый reviewer</p><h3 className="mt-1 font-semibold">Проверка сметы завершена</h3></div><div className="rounded-xl bg-neutral-900 px-3 py-2 text-center text-white"><p className="text-[10px] uppercase tracking-wide text-neutral-300">Оценка</p><p className="text-xl font-semibold">{review.score}</p></div></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">{review.checks.map((check) => <div key={check.name} className="rounded-xl border border-neutral-100 p-3"><div className="flex items-center gap-2 text-sm font-medium">{icon(check.status)} {check.name}</div><p className="mt-1.5 text-xs leading-relaxed text-neutral-600">{check.detail}</p></div>)}</div>
    </article>
  );
};
