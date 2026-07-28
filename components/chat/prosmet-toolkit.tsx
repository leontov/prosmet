"use client";

import {
  AuiProvider,
  Suggestions,
  Tools,
  defineToolkit,
  useAui
} from "@assistant-ui/react";
import { BadgeCheckIcon, CircleAlertIcon, SearchCheckIcon } from "lucide-react";
import type { ReactNode } from "react";
import { EstimateEditor } from "@/components/tools/estimate-editor";
import { TechnologyCard } from "@/components/tools/technology-card";

const toolkit = defineToolkit({
  technology_card: {
    description:
      "Показывает полную технологическую карту до расчёта сметы: операции, ресурсы и контроль качества.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              description: { type: "string" },
              control: { type: "string" },
              resources: { type: "array", items: { type: "string" } }
            },
            required: ["title"]
          }
        }
      },
      required: ["steps"]
    },
    render: ({ args, status }) => <TechnologyCard args={args} status={status} />
  },
  estimate_draft: {
    description:
      "Показывает профессиональную редактируемую смету с детерминированным расчётом, источниками цен и версиями.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        objectName: { type: "string" },
        region: { type: "string" },
        technology: { type: "array" },
        sections: { type: "array" }
      },
      required: ["title", "sections"]
    },
    render: ({ args, status }) => <EstimateEditor args={args} status={status} />
  },
  estimate_review: {
    description:
      "Показывает независимую проверку сметы: блокеры, предупреждения и рекомендации.",
    parameters: {
      type: "object",
      properties: {
        blockers: { type: "array", items: { type: "string" } },
        warnings: { type: "array", items: { type: "string" } },
        recommendations: { type: "array", items: { type: "string" } }
      }
    },
    render: ({ args }) => <ReviewCard args={args} />
  }
});

const starterSuggestions = Suggestions([
  {
    title: "Составить смету",
    label: "для механизированной штукатурки 358 м²",
    prompt:
      "Составь полную смету механизированной гипсовой штукатурки 358 м² в Лениногорске, средний слой 15 мм. Сначала сделай технологическую карту, учти защиту, грунтование, маяки, углы, материалы, доставку и уборку."
  },
  {
    title: "Рассчитать объект",
    label: "по описанию и приложенным файлам",
    prompt:
      "Проанализируй исходные файлы объекта. Сначала сформируй технологическую карту, затем подготовь полную редактируемую смету с работами, материалами, механизмами и услугами."
  },
  {
    title: "Проверить смету",
    label: "найти пропуски, дубли и ошибки",
    prompt:
      "Проверь текущую смету как независимый эксперт: технологию, объёмы, нормы, цены, источники, арифметику, дубли и риски."
  },
  {
    title: "Подготовить документы",
    label: "коммерческое предложение и договор",
    prompt:
      "На основании текущей сметы подготовь комплект печатных документов: коммерческое предложение, договор и акт выполненных работ."
  }
]);

function SuggestionLayer({ children }: { children: ReactNode }) {
  const aui = useAui({ suggestions: starterSuggestions });
  return <AuiProvider value={aui}>{children}</AuiProvider>;
}

export function ProsmetChatToolkit({ children }: { children: ReactNode }) {
  const aui = useAui({ tools: Tools({ toolkit }) });
  return (
    <AuiProvider value={aui}>
      <SuggestionLayer>{children}</SuggestionLayer>
    </AuiProvider>
  );
}

function ReviewCard({ args }: { args: unknown }) {
  const root = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const blockers = Array.isArray(root.blockers)
    ? root.blockers.filter((item): item is string => typeof item === "string")
    : [];
  const warnings = Array.isArray(root.warnings)
    ? root.warnings.filter((item): item is string => typeof item === "string")
    : [];
  const recommendations = Array.isArray(root.recommendations)
    ? root.recommendations.filter((item): item is string => typeof item === "string")
    : [];

  return (
    <section className="mt-3 w-full max-w-(--thread-max-width) overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <header className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3.5 sm:px-5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-neutral-100 text-neutral-700">
          <SearchCheckIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium uppercase tracking-[0.07em] text-neutral-500">
            Независимая проверка
          </div>
          <div className="mt-0.5 text-sm font-semibold">
            Полнота, арифметика, источники и риски
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            blockers.length
              ? "bg-red-50 text-red-700"
              : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {blockers.length ? (
            <CircleAlertIcon className="size-3.5" />
          ) : (
            <BadgeCheckIcon className="size-3.5" />
          )}
          {blockers.length ? `Блокеров: ${blockers.length}` : "Проверка пройдена"}
        </span>
      </header>
      <div className="grid gap-4 px-4 py-4 sm:px-5 md:grid-cols-3">
        <ReviewColumn title="Блокеры" items={blockers} tone="red" />
        <ReviewColumn title="Предупреждения" items={warnings} tone="amber" />
        <ReviewColumn title="Рекомендации" items={recommendations} tone="neutral" />
      </div>
    </section>
  );
}

function ReviewColumn({
  title,
  items,
  tone
}: {
  title: string;
  items: string[];
  tone: "red" | "amber" | "neutral";
}) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-neutral-500">
        {title}
      </div>
      <div className="mt-2 grid gap-2">
        {items.length ? (
          items.map((item, index) => (
            <div
              key={`${index}:${item}`}
              className={`rounded-xl px-3 py-2 text-xs leading-5 ${
                tone === "red"
                  ? "bg-red-50 text-red-700"
                  : tone === "amber"
                    ? "bg-amber-50 text-amber-800"
                    : "bg-neutral-100 text-neutral-700"
              }`}
            >
              {item}
            </div>
          ))
        ) : (
          <div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            Нет замечаний
          </div>
        )}
      </div>
    </div>
  );
}
