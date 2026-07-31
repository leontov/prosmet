import { z } from "@/lib/zod";

export const ProviderActionSchema = z.enum([
  "estimate",
  "modify-estimate",
  "compare",
  "document",
  "question"
]);

export const ProviderInterpretationSchema = z.object({
  action: ProviderActionSchema,
  summary: z.string().trim().min(1).max(4_000),
  normalizedRequest: z.string().trim().min(1).max(24_000),
  assumptions: z.array(z.string().trim().min(1).max(1_000)).max(24).default([]),
  warnings: z.array(z.string().trim().min(1).max(1_000)).max(24).default([]),
  confidence: z.number().min(0).max(100).default(70)
});

export type ProviderInterpretation = z.infer<typeof ProviderInterpretationSchema>;

export type ProviderUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  durationMs?: number;
};

export type ProviderSemanticResult = {
  interpretation: ProviderInterpretation;
  usage: ProviderUsage;
  sessionId?: string;
};

export const PROVIDER_INTERPRETATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "action",
    "summary",
    "normalizedRequest",
    "assumptions",
    "warnings",
    "confidence"
  ],
  properties: {
    action: {
      type: "string",
      enum: ["estimate", "modify-estimate", "compare", "document", "question"]
    },
    summary: { type: "string", minLength: 1, maxLength: 4_000 },
    normalizedRequest: { type: "string", minLength: 1, maxLength: 24_000 },
    assumptions: {
      type: "array",
      maxItems: 24,
      items: { type: "string", minLength: 1, maxLength: 1_000 }
    },
    warnings: {
      type: "array",
      maxItems: 24,
      items: { type: "string", minLength: 1, maxLength: 1_000 }
    },
    confidence: { type: "number", minimum: 0, maximum: 100 }
  }
} as const;

export function extractJsonObject(value: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("AI-провайдер вернул пустой ответ.");
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) return JSON.parse(fenced) as unknown;
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    throw new Error("AI-провайдер не вернул структурированный JSON.");
  }
}

export function parseProviderInterpretation(value: string) {
  const parsed = ProviderInterpretationSchema.safeParse(extractJsonObject(value));
  if (!parsed.success) {
    const details = parsed.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join(".") || "response"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Ответ AI-провайдера не прошёл контракт: ${details}`);
  }
  return parsed.data;
}

export function providerSystemPrompt() {
  return [
    "Ты — смысловой слой профессионального строительного сметного приложения Просметчик.",
    "Твоя задача — понять пользовательский запрос и вернуть только один JSON-объект заданной схемы.",
    "Не выполняй арифметику сметы и не формируй окончательные цены: это делает детерминированный движок.",
    "Не выдумывай официальные нормы, индексы, коды, источники или нормативные документы.",
    "Сохраняй исходные объёмы, регион, условия объекта, материалы, логистику и пожелания пользователя.",
    "Для неполных данных продолжай с безопасными явными допущениями и перечисли их в assumptions.",
    "Критичные риски, противоречия и отсутствующие подтверждения перечисли в warnings.",
    "normalizedRequest должен быть самодостаточным русским заданием для сметного движка.",
    "summary — короткое понятное пользователю объяснение того, что ты понял.",
    "Никакого Markdown, комментариев, chain-of-thought или текста вне JSON."
  ].join("\n");
}

export function providerUserPrompt(input: {
  prompt: string;
  messages?: unknown;
  state?: unknown;
}) {
  const serializedMessages = JSON.stringify(input.messages ?? []).slice(-40_000);
  const serializedState = JSON.stringify(input.state ?? {}).slice(0, 40_000);
  return [
    "Текущий запрос пользователя:",
    input.prompt.slice(0, 24_000),
    "",
    "Недавняя история AG-UI:",
    serializedMessages,
    "",
    "Текущее состояние рабочего пространства:",
    serializedState,
    "",
    "Верни JSON строго по контракту."
  ].join("\n");
}
