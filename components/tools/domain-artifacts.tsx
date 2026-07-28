"use client";

import {
  AlertTriangleIcon,
  BadgeCheckIcon,
  BarChart3Icon,
  CheckCircle2Icon,
  CircleHelpIcon,
  ClipboardListIcon,
  FileSearchIcon,
  LoaderCircleIcon,
  MapPinIcon,
  PackageSearchIcon,
  ScaleIcon,
  SparklesIcon
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn, formatMoney } from "@/lib/utils";

type ToolStatus = { type?: string };

type AnyRecord = Record<string, unknown>;

function record(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as AnyRecord)
    : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function rows(value: unknown) {
  return Array.isArray(value) ? value.map(record) : [];
}

function isRunning(status?: ToolStatus) {
  return status?.type === "running" || status?.type === "incomplete";
}

function Card({
  icon,
  eyebrow,
  title,
  status,
  tone = "neutral",
  children
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  status?: ToolStatus;
  tone?: "neutral" | "emerald" | "amber" | "blue";
  children: React.ReactNode;
}) {
  const running = isRunning(status);
  return (
    <section
      className={cn(
        "mt-3 w-full max-w-(--thread-max-width) overflow-hidden rounded-2xl border bg-white shadow-sm",
        tone === "emerald"
          ? "border-emerald-200"
          : tone === "amber"
            ? "border-amber-200"
            : tone === "blue"
              ? "border-blue-200"
              : "border-neutral-200"
      )}
    >
      <header className="flex items-start gap-3 border-b border-neutral-100 px-4 py-3.5 sm:px-5">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl",
            tone === "emerald"
              ? "bg-emerald-50 text-emerald-700"
              : tone === "amber"
                ? "bg-amber-50 text-amber-700"
                : tone === "blue"
                  ? "bg-blue-50 text-blue-700"
                  : "bg-neutral-100 text-neutral-600"
          )}
        >
          {running ? <LoaderCircleIcon className="size-4 animate-spin" /> : icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
            {eyebrow}
          </div>
          <h3 className="mt-0.5 text-sm font-semibold leading-5 text-neutral-950">
            {running ? "Просметчик формирует результат…" : title}
          </h3>
        </div>
        {!running ? <CheckCircle2Icon className="mt-1 size-4 shrink-0 text-emerald-600" /> : null}
      </header>
      <div className="px-4 py-4 sm:px-5">{running ? <Skeleton /> : children}</div>
    </section>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-2">
      <div className="h-4 w-3/4 animate-pulse rounded bg-neutral-100" />
      <div className="h-14 animate-pulse rounded-xl bg-neutral-100" />
      <div className="h-10 animate-pulse rounded-xl bg-neutral-100" />
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] text-neutral-600"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function List({ items, tone = "neutral" }: { items: string[]; tone?: "neutral" | "amber" | "emerald" }) {
  if (!items.length) return null;
  return (
    <ul className="grid gap-2">
      {items.map((item) => (
        <li
          key={item}
          className={cn(
            "flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs leading-5",
            tone === "amber"
              ? "bg-amber-50 text-amber-900"
              : tone === "emerald"
                ? "bg-emerald-50 text-emerald-900"
                : "bg-neutral-50 text-neutral-700"
          )}
        >
          {tone === "amber" ? (
            <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
          ) : (
            <CheckCircle2Icon className="mt-0.5 size-3.5 shrink-0" />
          )}
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function ProjectCaseCard({ args, status }: { args: unknown; status?: ToolStatus }) {
  const value = record(args);
  const title = text(value.objectName, "Новый строительный объект");
  const workTypes = strings(value.workTypes);
  const assumptions = strings(value.assumptions);
  const missing = strings(value.missing);
  return (
    <Card
      icon={<ClipboardListIcon className="size-4" />}
      eyebrow="Карточка задачи"
      title={title}
      status={status}
      tone="blue"
    >
      <div className="grid gap-4">
        <div className="grid gap-2 text-xs text-neutral-600 sm:grid-cols-2">
          <div className="rounded-xl bg-neutral-50 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-[0.07em] text-neutral-400">Регион</div>
            <div className="mt-1 flex items-center gap-1.5 font-medium text-neutral-800">
              <MapPinIcon className="size-3.5" /> {text(value.region, "Не указан")}
            </div>
          </div>
          <div className="rounded-xl bg-neutral-50 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-[0.07em] text-neutral-400">Стадия</div>
            <div className="mt-1 font-medium text-neutral-800">
              {text(value.stage, "Предварительная оценка")}
            </div>
          </div>
        </div>
        {text(value.summary) ? <p className="text-sm leading-6 text-neutral-700">{text(value.summary)}</p> : null}
        <Chips items={workTypes} />
        {assumptions.length ? (
          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
              Принятые допущения
            </div>
            <List items={assumptions} />
          </div>
        ) : null}
        {missing.length ? (
          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-600">
              Что желательно уточнить
            </div>
            <List items={missing} tone="amber" />
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export function EstimateReviewCard({ args, status }: { args: unknown; status?: ToolStatus }) {
  const value = record(args);
  const blockers = strings(value.blockers);
  const warnings = strings(value.warnings);
  const passed = strings(value.passedChecks);
  const score = Math.max(0, Math.min(100, number(value.score, blockers.length ? 55 : 92)));
  return (
    <Card
      icon={<FileSearchIcon className="size-4" />}
      eyebrow="Независимая проверка"
      title={text(value.title, blockers.length ? "Требуются исправления" : "Смета прошла проверку")}
      status={status}
      tone={blockers.length ? "amber" : "emerald"}
    >
      <div className="grid gap-4">
        <div className="flex items-center gap-4 rounded-xl bg-neutral-50 p-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white text-lg font-semibold shadow-sm">
            {Math.round(score)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-neutral-900">Оценка качества</div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-200">
              <div className="h-full rounded-full bg-neutral-900" style={{ width: `${score}%` }} />
            </div>
          </div>
        </div>
        {blockers.length ? (
          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-red-600">
              Блокирует утверждение
            </div>
            <List items={blockers} tone="amber" />
          </div>
        ) : null}
        {warnings.length ? (
          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-600">
              Требует внимания
            </div>
            <List items={warnings} tone="amber" />
          </div>
        ) : null}
        {passed.length ? (
          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-600">
              Проверено
            </div>
            <List items={passed} tone="emerald" />
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export function EstimateComparisonCard({ args, status }: { args: unknown; status?: ToolStatus }) {
  const value = record(args);
  const options = rows(value.options);
  const currency = text(value.currency, "RUB");
  return (
    <Card
      icon={<ScaleIcon className="size-4" />}
      eyebrow="Сравнение вариантов"
      title={text(value.title, "Варианты сметы")}
      status={status}
      tone="blue"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {options.map((option, index) => {
          const recommended = Boolean(option.recommended);
          return (
            <article
              key={text(option.id, `${index}`)}
              className={cn(
                "rounded-2xl border p-3",
                recommended ? "border-emerald-300 bg-emerald-50" : "border-neutral-200 bg-neutral-50"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-semibold text-neutral-900">
                  {text(option.label, `Вариант ${index + 1}`)}
                </div>
                {recommended ? <BadgeCheckIcon className="size-4 shrink-0 text-emerald-700" /> : null}
              </div>
              <div className="mt-3 text-lg font-semibold tracking-[-0.02em] text-neutral-950">
                {formatMoney(number(option.total), currency)}
              </div>
              {text(option.description) ? (
                <p className="mt-2 text-xs leading-5 text-neutral-600">{text(option.description)}</p>
              ) : null}
              <Chips items={strings(option.changes)} />
            </article>
          );
        })}
      </div>
      {text(value.recommendation) ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-xs leading-5 text-blue-900">
          <SparklesIcon className="mt-0.5 size-3.5 shrink-0" /> {text(value.recommendation)}
        </div>
      ) : null}
    </Card>
  );
}

export function ExecutionProgressCard({ args, status }: { args: unknown; status?: ToolStatus }) {
  const value = record(args);
  const percent = Math.max(0, Math.min(100, number(value.percent)));
  const currency = text(value.currency, "RUB");
  return (
    <Card
      icon={<BarChart3Icon className="size-4" />}
      eyebrow="Исполнение сметы"
      title={text(value.title, `Выполнено ${percent}%`)}
      status={status}
      tone="emerald"
    >
      <div className="grid gap-4">
        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-neutral-500">
            <span>Прогресс</span>
            <span className="font-semibold text-neutral-900">{percent}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full rounded-full bg-emerald-600" style={{ width: `${percent}%` }} />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Metric label="Сумма сметы" value={formatMoney(number(value.total), currency)} />
          <Metric label="Выполнено" value={formatMoney(number(value.completed), currency)} />
          <Metric label="Остаток" value={formatMoney(number(value.remaining), currency)} />
        </div>
        <List items={strings(value.notes)} />
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-neutral-50 px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.07em] text-neutral-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-neutral-900">{value}</div>
    </div>
  );
}

export function AskUserCard({ args, status }: { args: unknown; status?: ToolStatus }) {
  const value = record(args);
  const questions = strings(value.questions);
  const assumptions = strings(value.assumptions);
  return (
    <Card
      icon={<CircleHelpIcon className="size-4" />}
      eyebrow="Уточнение"
      title={text(value.title, "Нужны исходные данные")}
      status={status}
      tone="amber"
    >
      <div className="grid gap-4">
        {text(value.context) ? <p className="text-sm leading-6 text-neutral-700">{text(value.context)}</p> : null}
        <List items={questions} tone="amber" />
        {assumptions.length ? (
          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
              Можно продолжить с допущениями
            </div>
            <List items={assumptions} />
          </div>
        ) : null}
        <p className="text-xs leading-5 text-neutral-500">
          Ответьте следующим сообщением. Чат сохранит контекст объекта и продолжит ту же смету.
        </p>
      </div>
    </Card>
  );
}

export function ResourceStatementCard({ args, status }: { args: unknown; status?: ToolStatus }) {
  const value = record(args);
  const resources = rows(value.resources);
  const [expanded, setExpanded] = useState(false);
  const visible = useMemo(
    () => (expanded ? resources : resources.slice(0, 8)),
    [expanded, resources]
  );
  return (
    <Card
      icon={<PackageSearchIcon className="size-4" />}
      eyebrow="Ресурсная ведомость"
      title={text(value.title, `${resources.length} ресурсов`)}
      status={status}
    >
      <div className="overflow-hidden rounded-xl border border-neutral-200">
        <div className="grid grid-cols-[minmax(0,1fr)_70px_90px] gap-2 bg-neutral-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.05em] text-neutral-400">
          <span>Ресурс</span><span>Ед.</span><span className="text-right">Количество</span>
        </div>
        <div className="divide-y divide-neutral-100">
          {visible.map((resource, index) => (
            <div
              key={text(resource.id, `${index}`)}
              className="grid grid-cols-[minmax(0,1fr)_70px_90px] gap-2 px-3 py-2.5 text-xs"
            >
              <span className="truncate font-medium text-neutral-800">{text(resource.name, "Ресурс")}</span>
              <span className="text-neutral-500">{text(resource.unit, "—")}</span>
              <span className="text-right tabular-nums text-neutral-800">{number(resource.quantity)}</span>
            </div>
          ))}
        </div>
      </div>
      {resources.length > 8 ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-3 h-8 rounded-lg px-3 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
        >
          {expanded ? "Свернуть" : `Показать все ${resources.length}`}
        </button>
      ) : null}
    </Card>
  );
}

export function PriceCandidatesCard({ args, status }: { args: unknown; status?: ToolStatus }) {
  const value = record(args);
  const candidates = rows(value.candidates);
  const currency = text(value.currency, "RUB");
  return (
    <Card
      icon={<PackageSearchIcon className="size-4" />}
      eyebrow="Цены"
      title={text(value.title, "Кандидаты цен")}
      status={status}
    >
      <div className="grid gap-2">
        {candidates.map((candidate, index) => (
          <div key={text(candidate.id, `${index}`)} className="rounded-xl border border-neutral-200 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-neutral-900">
                  {text(candidate.name, "Цена")}
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  {text(candidate.source, "Источник не подтверждён")}
                  {text(candidate.date) ? ` · ${text(candidate.date)}` : ""}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-semibold">{formatMoney(number(candidate.price), currency)}</div>
                <div className="mt-1 text-[10px] text-neutral-400">
                  confidence {Math.round(number(candidate.confidence))}%
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
