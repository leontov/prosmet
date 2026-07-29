import "server-only";

import {
  EstimateDraftSchema,
  calculateEstimate,
  validateForApproval,
  type EstimateDraft,
  type EstimateItem,
  type PriceSource
} from "@/lib/domain/estimate";
import { extractSiteIntake } from "@/lib/domain/site-intake";
import {
  runRulesAgent as runCoreRulesAgent,
  type JsonPatchOperation,
  type RulesAgentContext,
  type RulesRun,
  type RulesToolCall
} from "./rules-agent";

export type { JsonPatchOperation, RulesAgentContext, RulesRun, RulesToolCall } from "./rules-agent";

function normalize(value: string) {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9%]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function findEstimate(value: unknown, depth = 0): EstimateDraft | null {
  if (depth > 8 || value == null) return null;
  const parsed = EstimateDraftSchema.safeParse(value);
  if (parsed.success) return parsed.data;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && trimmed.length < 2_000_000) {
      try {
        return findEstimate(JSON.parse(trimmed), depth + 1);
      } catch {
        return null;
      }
    }
    return null;
  }

  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const found = findEstimate(value[index], depth + 1);
      if (found) return found;
    }
    return null;
  }

  const object = record(value);
  for (const key of [
    "activeEstimate",
    "estimate",
    "args",
    "state",
    "snapshot",
    "draft",
    "content",
    "message",
    "messages"
  ]) {
    if (key in object) {
      const found = findEstimate(object[key], depth + 1);
      if (found) return found;
    }
  }
  for (const nested of Object.values(object)) {
    const found = findEstimate(nested, depth + 1);
    if (found) return found;
  }
  return null;
}

function latestEstimate(context?: RulesAgentContext) {
  return findEstimate(context?.state) ?? findEstimate(context?.messages);
}

function reviewArgs(draft: EstimateDraft) {
  const report = validateForApproval(draft);
  const zeroPrices = draft.sections.flatMap((section) =>
    section.items
      .filter((line) => !(line.unitPrice > 0))
      .map((line) => `Заполните цену «${line.name}».`)
  );
  const blockers = [...new Set([...report.blockers, ...zeroPrices])];
  const warnings = [...new Set(report.warnings)].slice(0, 20);
  const totalLines = draft.sections.reduce((sum, section) => sum + section.items.length, 0);
  const confirmed = draft.sections.reduce(
    (sum, section) => sum + section.items.filter((line) => line.source.confirmed).length,
    0
  );
  const score = Math.max(
    15,
    Math.min(100, Math.round(100 - blockers.length * 9 - warnings.length * 2 + confirmed * 1.5))
  );
  return {
    title: blockers.length
      ? "Смета требует подтверждения исходных данных"
      : "Смета готова к утверждению",
    score,
    blockers,
    warnings,
    passedChecks: [
      `Технологическая карта: ${draft.technology.length} операций.`,
      `Структура сметы: ${draft.sections.length} разделов и ${totalLines} позиций.`,
      "Арифметика рассчитана детерминированно.",
      `Подтверждённых цен: ${confirmed} из ${totalLines}.`,
      "Старые версии сохраняются отдельно при утверждении и изменениях."
    ]
  };
}

function stateFor(
  estimate: EstimateDraft | null,
  options: {
    documents?: unknown[];
    validation?: Record<string, unknown>;
    workTrace?: unknown[];
    project?: Record<string, unknown>;
  } = {}
) {
  const totalLines = estimate?.sections.reduce((sum, section) => sum + section.items.length, 0) ?? 0;
  const confirmed =
    estimate?.sections.reduce(
      (sum, section) => sum + section.items.filter((line) => line.source.confirmed).length,
      0
    ) ?? 0;
  return {
    project:
      options.project ??
      (estimate
        ? {
            objectName: estimate.objectName,
            customer: estimate.customer,
            region: estimate.region
          }
        : {}),
    activeEstimate: estimate,
    estimateRevision: estimate?.revision ?? 0,
    documents: options.documents ?? [],
    priceContext: estimate ? { confirmed, total: totalLines } : {},
    workTrace:
      options.workTrace ??
      [
        { stage: "analysis", status: "completed" },
        { stage: "technology", status: estimate ? "completed" : "pending" },
        { stage: "resources", status: estimate ? "completed" : "pending" },
        { stage: "prices", status: estimate ? "completed" : "pending" },
        { stage: "review", status: estimate ? "completed" : "pending" }
      ],
    sync: { status: "server-connected" },
    provider: { id: "rules", status: "available", mode: "deterministic-fallback" },
    validation:
      options.validation ??
      (estimate ? reviewArgs(estimate) : { status: "input_required" })
  };
}

function parsePercent(input: string, fallback = 0) {
  const match = input.match(/(\d+(?:[.,]\d+)?)\s*%/);
  return match ? Number(match[1].replace(",", ".")) : fallback;
}

function needsComparison(input: string) {
  return /сравн|вариант|оптимист|эконом|дорог|value engineering|замен.*вариант/i.test(input);
}

function needsExecution(input: string) {
  return /выполнен|закрыт|процент выполнения|остаток|частичн/i.test(input) && /%/.test(input);
}

function needsReview(input: string) {
  return /проверь|проверка|ревью|ошибк|точност|можно утверждать/i.test(input);
}

function isKnownScenario(input: string) {
  const value = normalize(input);
  return [
    /кровл|крыша|шифер|металлочереп/,
    /отоплен|котел|радиатор|овик/,
    /электр|провод|розет|щит/,
    /фасад|утеплен/,
    /благоустр|плитк|асфальт|дорож/,
    /демонтаж|снос|разбор/,
    /капремонт|капитальн|ремонт помещ|ремонт квартир/,
    /водоснаб|канализац|сантех/,
    /фундамент|монолит|бетон/,
    /штукатур/
  ].some((expression) => expression.test(value));
}

function comparisonRun(draft: EstimateDraft): RulesRun {
  const total = calculateEstimate(draft).total;
  return {
    text:
      "Сравнил три сценария в текущем чате. Варианты не подменяют подтверждённые цены: конкретные замены и источники нужно проверить перед выбором.",
    tools: [
      {
        name: "estimate_comparison",
        args: {
          title: `Сравнение — ${draft.title}`,
          currency: draft.currency,
          options: [
            {
              id: "economy",
              label: "Экономичный",
              total: Math.round(total * 0.9 * 100) / 100,
              description: "Оптимизация закупки и допустимых материалов после проверки технологии.",
              changes: ["−10% ориентир", "нужна проверка замен"]
            },
            {
              id: "base",
              label: "Базовый",
              total,
              description: "Текущий состав работ и ресурсов без скрытых сокращений.",
              changes: ["текущая редакция"],
              recommended: true
            },
            {
              id: "robust",
              label: "С резервом",
              total: Math.round(total * 1.12 * 100) / 100,
              description: "Резерв на колебание цен и уточнение скрытых объёмов.",
              changes: ["+12% резерв", "меньше риск доплат"]
            }
          ],
          recommendation:
            "Базовый вариант сохраняет технологическую полноту. Экономичный применяйте только после подтверждения конкретных замен."
        }
      }
    ],
    state: stateFor(draft),
    steps: ["compare-variants"]
  };
}

function executionRun(input: string, draft: EstimateDraft, context: RulesAgentContext): RulesRun {
  const percent = Math.max(0, Math.min(100, parsePercent(input, 100)));
  const total = calculateEstimate(draft).total;
  const completed = Math.round((total * percent) / 100 * 100) / 100;
  const remaining = Math.round((total - completed) * 100) / 100;
  const documentRun = /акт|кс\s*[- ]?[23]/i.test(input)
    ? runCoreRulesAgent(input, context)
    : null;
  const documentTools =
    documentRun?.tools.filter(
      (tool) => tool.name.endsWith("_draft") || tool.name === "commercial_proposal"
    ) ?? [];
  const tools: RulesToolCall[] = [
    {
      name: "execution_progress",
      args: {
        title: `Исполнение — ${draft.title}`,
        percent,
        currency: draft.currency,
        total,
        completed,
        remaining,
        notes: [
          "Процент принят из сообщения пользователя.",
          "Перед подписанием документа проверьте фактический объём каждой позиции."
        ]
      }
    },
    ...documentTools
  ];
  return {
    text: `Рассчитал выполнение ${percent}% по текущей смете и остаток. Документ доступен в этом же чате.`,
    tools,
    state: stateFor(draft, { documents: documentTools.map((tool) => tool.args) }),
    steps: ["calculate-execution", "prepare-document"]
  };
}

function reviewRun(draft: EstimateDraft): RulesRun {
  const review = reviewArgs(draft);
  return {
    text:
      review.blockers.length > 0
        ? "Независимая проверка нашла данные, которые нужно подтвердить перед утверждением."
        : "Независимая проверка завершена: смету можно утверждать и передавать клиенту.",
    tools: [{ name: "estimate_review", args: review }],
    state: stateFor(draft, { validation: review }),
    stateDelta: [{ op: "replace", path: "/validation", value: review }],
    steps: ["independent-review"]
  };
}

function reserveMutation(input: string, current: EstimateDraft): RulesRun | null {
  const value = normalize(input);
  if (!/(запас|коэффициент|коэф)/.test(value) || !/%/.test(input)) return null;

  const percent = parsePercent(input);
  const coefficient = Math.round((1 + percent / 100) * 10_000) / 10_000;
  const next = structuredClone(current) as EstimateDraft;
  const wantsMixture = /смес/.test(value);
  const wantsMaterial = /материал/.test(value);
  let changed = false;

  for (const section of next.sections) {
    for (const line of section.items) {
      const lineName = normalize(line.name);
      const matches = wantsMixture
        ? /смес/.test(lineName)
        : wantsMaterial
          ? line.resourceType === "material"
          : line.resourceType === "material";
      if (!matches) continue;
      line.coefficient = coefficient;
      changed = true;
    }
  }

  if (!changed) return null;
  next.status = "draft";
  next.revision = current.revision + 1;
  next.updatedAt = new Date().toISOString();
  const parsed = EstimateDraftSchema.parse(next);
  const review = reviewArgs(parsed);
  const stateDelta: JsonPatchOperation[] = [
    { op: "replace", path: "/activeEstimate", value: parsed },
    { op: "replace", path: "/estimateRevision", value: parsed.revision },
    { op: "replace", path: "/validation", value: review }
  ];
  return {
    text: `Применил запас ${percent}% к ${wantsMixture ? "смеси" : "материальным ресурсам"}. Создана версия ${parsed.revision}; предыдущая сохранена в истории.`,
    tools: [
      { name: "estimate_draft", args: parsed as unknown as Record<string, unknown> },
      { name: "estimate_review", args: review }
    ],
    state: stateFor(parsed, { validation: review }),
    stateDelta,
    steps: ["apply-change", "recalculate", "review"]
  };
}

function askForInput(input: string): RulesRun {
  const intake = extractSiteIntake(input);
  const region = "Регион не указан";
  return {
    text:
      "Сохраняю задачу в текущем чате, но вид работ пока не распознан. Укажите вид работ и один измеримый объём; остальные данные можно уточнить позже.",
    tools: [
      {
        name: "project_case",
        args: {
          id: `project_${crypto.randomUUID()}`,
          objectName: intake.objectName || "Новый объект",
          customer: intake.customer || "",
          region,
          stage: "Сбор исходных данных",
          summary: input.slice(0, 500),
          workTypes: [],
          assumptions: [],
          missing: ["вид работ", "измеримый объём", "регион или адрес объекта"]
        }
      },
      {
        name: "ask_user",
        args: {
          title: "Опишите строительную задачу",
          context: "Достаточно короткой записи замерщика — формальный бриф не нужен.",
          questions: [
            "Что именно нужно построить, отремонтировать или демонтировать?",
            "Какой известен объём: м², м³, пог. м, количество точек или комплектов?",
            "Где находится объект?"
          ],
          assumptions: ["Неизвестные цены будут оставлены пустыми, а не выдуманы."]
        }
      }
    ],
    state: stateFor(null, {
      project: {
        objectName: intake.objectName || "",
        customer: intake.customer || "",
        region
      },
      validation: { status: "input_required" }
    }),
    steps: ["analysis", "request-critical-input"]
  };
}

function indicativeSource(region: string): PriceSource {
  return {
    label: "Ориентировочная коммерческая калькуляция — подтвердить перед отправкой",
    kind: "indicative",
    region,
    date: new Date().toISOString().slice(0, 10),
    currency: "RUB",
    vatIncluded: false,
    deliveryIncluded: false,
    confidence: 35,
    confirmed: false,
    status: "suggested"
  };
}

function patchDemolitionCompleteness(run: RulesRun, input: string): RulesRun {
  if (!/демонтаж|снос|разбор/i.test(input)) return run;
  const estimateTool = run.tools.find((tool) => tool.name === "estimate_draft");
  const parsed = EstimateDraftSchema.safeParse(estimateTool?.args);
  if (!parsed.success) return run;
  const draft = structuredClone(parsed.data) as EstimateDraft;
  const count = draft.sections.reduce((sum, section) => sum + section.items.length, 0);
  if (count > 3) return run;

  const targetSection = draft.sections[0];
  if (!targetSection) return run;
  const extra: EstimateItem = {
    id: `demo-sort_${crypto.randomUUID()}`,
    code: "",
    name: "Сортировка, упаковка и временное складирование отходов",
    unit: "компл.",
    quantity: 1,
    norm: 1,
    coefficient: 1,
    unitPrice: 6500,
    resourceType: "service",
    source: indicativeSource(draft.region),
    comment: "Раздельное складирование по видам отходов до погрузки.",
    warning: "Состав и класс отходов подтвердите после обследования."
  };
  targetSection.items.push(extra);
  const completed = EstimateDraftSchema.parse(draft);
  const review = reviewArgs(completed);

  const tools = run.tools.map((tool) => {
    if (tool.name === "estimate_draft") {
      return { ...tool, args: completed as unknown as Record<string, unknown> };
    }
    if (tool.name === "estimate_review") return { ...tool, args: review };
    if (tool.name === "resource_statement") {
      const args = record(tool.args);
      const resources = Array.isArray(args.resources) ? [...args.resources] : [];
      resources.push({
        id: extra.id,
        name: extra.name,
        unit: extra.unit,
        quantity: extra.quantity,
        type: extra.resourceType
      });
      return { ...tool, args: { ...args, resources } };
    }
    if (tool.name === "price_candidates") {
      const args = record(tool.args);
      const candidates = Array.isArray(args.candidates) ? [...args.candidates] : [];
      candidates.push({
        id: extra.id,
        name: extra.name,
        price: extra.unitPrice,
        source: extra.source.label,
        date: extra.source.date,
        confidence: extra.source.confidence
      });
      return { ...tool, args: { ...args, candidates } };
    }
    return tool;
  });

  return {
    ...run,
    tools,
    state: {
      ...run.state,
      activeEstimate: completed,
      estimateRevision: completed.revision,
      validation: review,
      priceContext: {
        confirmed: completed.sections.reduce(
          (sum, section) => sum + section.items.filter((line) => line.source.confirmed).length,
          0
        ),
        total: completed.sections.reduce((sum, section) => sum + section.items.length, 0)
      }
    }
  };
}

export function runRulesAgent(input: string, context: RulesAgentContext = {}): RulesRun {
  const prompt = input.trim();
  const current = latestEstimate(context);

  if (current) {
    if (needsComparison(prompt)) return comparisonRun(current);
    if (needsExecution(prompt)) return executionRun(prompt, current, context);
    if (needsReview(prompt)) return reviewRun(current);
    const reserve = reserveMutation(prompt, current);
    if (reserve) return reserve;
  } else if (!isKnownScenario(prompt)) {
    return askForInput(prompt);
  }

  return patchDemolitionCompleteness(runCoreRulesAgent(prompt, context), prompt);
}
