import { randomUUID } from "node:crypto";
import {
  executePreparedProvider,
  prepareProviderRun,
  type PreparedProviderRun
} from "@/lib/server/agents/provider-executor";
import { runServiceCommand } from "@/lib/server/service-command";
import { runRulesAgent, type RulesRun } from "@/lib/server/rules-agent";
import { resolveServerIdentity } from "@/lib/server/identity";
import { beginAgentRun, finishAgentRun } from "@/lib/server/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const MAX_BODY_BYTES = Math.max(
  2 * 1024 * 1024,
  Math.min(
    24 * 1024 * 1024,
    Number(process.env.PROSMET_AGENT_MAX_REQUEST_BYTES) || 16 * 1024 * 1024
  )
);

function event(payload: unknown) {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

async function readBody(request: Request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) throw new Error("request_body_too_large");
  const reader = request.body?.getReader();
  if (!reader) return "{}";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error("request_body_too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textParts(content: unknown): string[] {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  return content.flatMap((part) => {
    const item = asRecord(part);
    if (item.type === "text" && typeof item.text === "string") return [item.text];
    return [];
  });
}

function latestUserText(body: Record<string, unknown>) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = asRecord(messages[index]);
    if (message.role === "user") return textParts(message.content).join("\n").trim();
  }
  return "";
}

function requestSummary(body: Record<string, unknown>, prompt: string) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const tools = Array.isArray(body.tools)
    ? body.tools
        .map((tool) => asRecord(tool).name)
        .filter((name): name is string => typeof name === "string")
    : [];
  return {
    prompt: prompt.slice(0, 16_000),
    messageCount: messages.length,
    tools,
    hasState: Boolean(body.state && typeof body.state === "object"),
    parentRunId: typeof body.parentRunId === "string" ? body.parentRunId : undefined,
    receivedAt: new Date().toISOString()
  };
}

function splitText(value: string) {
  const chunks: string[] = [];
  const words = value.split(/(\s+)/);
  let current = "";
  for (const word of words) {
    current += word;
    if (current.length >= 34 || /[.!?]\s*$/.test(current)) {
      chunks.push(current);
      current = "";
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function splitJson(value: unknown) {
  const json = JSON.stringify(value);
  const size = Math.max(60, Math.ceil(json.length / 12));
  const chunks: string[] = [];
  for (let offset = 0; offset < json.length; offset += size) {
    chunks.push(json.slice(offset, offset + size));
  }
  return chunks;
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

function providerState(prepared: PreparedProviderRun) {
  return {
    id: prepared.descriptor.id,
    kind: prepared.descriptor.kind,
    name: prepared.descriptor.name,
    model: prepared.descriptor.model,
    status: "available"
  };
}

function initialState(body: Record<string, unknown>, prepared: PreparedProviderRun) {
  const incoming = asRecord(body.state);
  const base = {
    project: {},
    activeEstimate: null,
    estimateRevision: 0,
    documents: [],
    priceContext: {},
    workTrace: [],
    validation: {}
  };
  return {
    ...base,
    ...incoming,
    sync: { ...asRecord(incoming.sync), status: "server-connected" },
    provider: {
      ...asRecord(incoming.provider),
      ...providerState(prepared)
    }
  };
}

function finalState(
  body: Record<string, unknown>,
  prepared: PreparedProviderRun,
  resultState: Record<string, unknown>
) {
  const baseline = initialState(body, prepared);
  return {
    ...baseline,
    ...resultState,
    sync: {
      ...asRecord(baseline.sync),
      ...asRecord(resultState.sync),
      status: "server-connected"
    },
    provider: {
      ...asRecord(baseline.provider),
      ...asRecord(resultState.provider),
      ...providerState(prepared)
    }
  };
}

function providerPrompt(input: {
  original: string;
  normalized: string;
  assumptions: string[];
  warnings: string[];
}) {
  return [
    input.original,
    "",
    "Нормализованное профессиональное задание:",
    input.normalized,
    ...(input.assumptions.length
      ? ["", "Явные допущения:", ...input.assumptions.map((item) => `- ${item}`)]
      : []),
    ...(input.warnings.length
      ? ["", "Риски и требующие подтверждения данные:", ...input.warnings.map((item) => `- ${item}`)]
      : [])
  ].join("\n");
}

async function runDomainPipeline(input: {
  prompt: string;
  body: Record<string, unknown>;
  prepared: PreparedProviderRun;
  signal: AbortSignal;
}) {
  const service = runServiceCommand(input.prompt);
  if (service) {
    return {
      result: service,
      semantic: null,
      providerSteps: [] as string[]
    };
  }

  const semantic = await executePreparedProvider(input.prepared, {
    prompt: input.prompt,
    messages: input.body.messages,
    state: input.body.state,
    signal: input.signal
  });
  if (!semantic) {
    return {
      result: runRulesAgent(input.prompt, {
        state: input.body.state,
        messages: input.body.messages
      }),
      semantic: null,
      providerSteps: [] as string[]
    };
  }

  const domain = runRulesAgent(
    providerPrompt({
      original: input.prompt,
      normalized: semantic.interpretation.normalizedRequest,
      assumptions: semantic.interpretation.assumptions,
      warnings: semantic.interpretation.warnings
    }),
    {
      state: input.body.state,
      messages: input.body.messages
    }
  );
  const result: RulesRun = {
    ...domain,
    text: `${semantic.interpretation.summary}\n\n${domain.text}`,
    state: {
      ...domain.state,
      providerInterpretation: semantic.interpretation
    },
    steps: ["provider-analysis", ...(domain.steps ?? [])]
  };
  return { result, semantic, providerSteps: ["provider-analysis"] };
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = asRecord(JSON.parse(await readBody(request)));
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid_request";
    return Response.json(
      {
        error: code,
        message:
          code === "request_body_too_large"
            ? "Размер запроса превышает допустимый лимит."
            : "Некорректный AG-UI запрос."
      },
      { status: code === "request_body_too_large" ? 413 : 400 }
    );
  }

  const threadId =
    typeof body.threadId === "string" && body.threadId
      ? body.threadId
      : randomUUID();
  const runId =
    typeof body.runId === "string" && body.runId ? body.runId : randomUUID();
  const parentRunId =
    typeof body.parentRunId === "string" && body.parentRunId ? body.parentRunId : undefined;
  const prompt = latestUserText(body);
  const identity = resolveServerIdentity(request);

  let prepared: PreparedProviderRun;
  try {
    prepared = await prepareProviderRun(identity.ownerId);
    await beginAgentRun({
      tenantId: identity.ownerId,
      runId,
      threadId,
      provider: prepared.descriptor.kind,
      model: prepared.descriptor.model || undefined,
      request: {
        ...requestSummary(body, prompt),
        providerConnectionId: prepared.descriptor.id,
        providerName: prepared.descriptor.name
      }
    });
  } catch (error) {
    return Response.json(
      {
        error: "agent_provider_unavailable",
        message:
          error instanceof Error
            ? error.message
            : "Выбранный AI-провайдер недоступен."
      },
      { status: 503 }
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => controller.enqueue(event(payload));
      const activityMessageId = randomUUID();
      const sendActivity = (content: Record<string, unknown>) =>
        send({
          type: "ACTIVITY_SNAPSHOT",
          messageId: activityMessageId,
          activityType: "work_trace",
          content
        });

      try {
        send({
          type: "RUN_STARTED",
          threadId,
          runId,
          ...(parentRunId ? { parentRunId } : {})
        });
        send({ type: "STATE_SNAPSHOT", snapshot: initialState(body, prepared) });

        if (prepared.descriptor.kind !== "rules") {
          send({ type: "STEP_STARTED", stepName: "provider-analysis" });
          sendActivity({
            stage: "provider-analysis",
            title: `Анализ запроса · ${prepared.descriptor.name}`,
            status: "running",
            position: 1
          });
        }

        const execution = await runDomainPipeline({
          prompt,
          body,
          prepared,
          signal: request.signal
        });
        if (prepared.descriptor.kind !== "rules") {
          send({ type: "STEP_FINISHED", stepName: "provider-analysis" });
        }
        const { result, semantic } = execution;
        const snapshot = finalState(body, prepared, result.state);

        for (const [index, stepName] of (result.steps ?? ["analysis"]).entries()) {
          if (stepName === "provider-analysis") continue;
          send({ type: "STEP_STARTED", stepName });
          sendActivity({
            stage: stepName,
            title: stepTitle(stepName),
            status: "running",
            position: index + 1,
            total: result.steps?.length ?? 1
          });
          await sleep(24, request.signal);
          send({ type: "STEP_FINISHED", stepName });
        }

        const messageId = randomUUID();
        send({ type: "TEXT_MESSAGE_START", messageId, role: "assistant" });
        for (const chunk of splitText(result.text)) {
          send({ type: "TEXT_MESSAGE_CONTENT", messageId, delta: chunk });
          await sleep(24, request.signal);
        }
        send({ type: "TEXT_MESSAGE_END", messageId });

        for (const [index, tool] of result.tools.entries()) {
          sendActivity({
            stage: tool.name,
            title: toolTitle(tool.name),
            status: "running",
            position: index + 1,
            total: result.tools.length
          });
          const toolCallId = randomUUID();
          send({
            type: "TOOL_CALL_START",
            toolCallId,
            toolCallName: tool.name,
            parentMessageId: messageId
          });
          for (const delta of splitJson(tool.args)) {
            send({ type: "TOOL_CALL_ARGS", toolCallId, delta });
            await sleep(10, request.signal);
          }
          send({ type: "TOOL_CALL_END", toolCallId });
          send({
            type: "TOOL_CALL_RESULT",
            messageId: randomUUID(),
            toolCallId,
            role: "tool",
            content: JSON.stringify({
              ok: true,
              artifact: tool.name,
              persistedBy: "assistant-history"
            })
          });
        }

        if (result.stateDelta?.length) {
          send({ type: "STATE_DELTA", delta: result.stateDelta });
        }
        send({ type: "STATE_SNAPSHOT", snapshot });
        sendActivity({
          stage: "complete",
          title: "Результат готов в текущем чате",
          status: "completed"
        });
        send({ type: "RUN_FINISHED", threadId, runId });
        await finishAgentRun({
          tenantId: identity.ownerId,
          runId,
          status: "completed",
          result: {
            textLength: result.text.length,
            tools: result.tools.map((tool) => tool.name),
            steps: result.steps ?? [],
            stateKeys: Object.keys(snapshot),
            providerConnectionId: prepared.descriptor.id,
            provider: prepared.descriptor.kind,
            model: prepared.descriptor.model,
            providerUsage: semantic?.usage ?? null,
            providerSessionId: semantic?.sessionId ?? null
          }
        });
      } catch (error) {
        if (request.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
          await finishAgentRun({
            tenantId: identity.ownerId,
            runId,
            status: "cancelled"
          }).catch(() => undefined);
        } else {
          const message =
            error instanceof Error
              ? error.message
              : "Не удалось выполнить запрос Просметчика.";
          send({
            type: "RUN_ERROR",
            threadId,
            runId,
            code: "agent_run_failed",
            message
          });
          await finishAgentRun({
            tenantId: identity.ownerId,
            runId,
            status: "failed",
            error: message
          }).catch(() => undefined);
        }
      } finally {
        controller.close();
      }
    }
  });

  const headers = new Headers({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "X-Prosmet-Provider": prepared.descriptor.kind,
    "X-Prosmet-Provider-Id": prepared.descriptor.id,
    "X-Prosmet-Model": prepared.descriptor.model
  });
  if (identity.setCookie) headers.append("Set-Cookie", identity.setCookie);

  return new Response(stream, { headers });
}

function stepTitle(step: string) {
  const titles: Record<string, string> = {
    "provider-analysis": "Анализ запроса выбранным AI-провайдером",
    analysis: "Анализ исходных данных",
    technology: "Определение технологии",
    resources: "Формирование ресурсов",
    prices: "Проверка цен",
    estimate: "Формирование сметы",
    review: "Независимая проверка",
    "apply-change": "Применение изменения",
    recalculate: "Пересчёт итогов",
    "compare-variants": "Сравнение вариантов",
    "independent-review": "Независимая проверка",
    "calculate-execution": "Расчёт выполнения",
    "prepare-document": "Подготовка документа",
    "validate-required-fields": "Проверка обязательных полей",
    "request-critical-input": "Определение критичных уточнений",
    "load-workspace-service": "Загрузка рабочего пространства",
    "load-provider-service": "Загрузка AI-провайдеров",
    "check-services": "Проверка подкапотных сервисов"
  };
  return titles[step] ?? step;
}

function toolTitle(tool: string) {
  const titles: Record<string, string> = {
    project_case: "Карточка объекта",
    ask_user: "Критичные уточнения",
    technology_card: "Технологическая карта",
    resource_statement: "Ресурсная ведомость",
    price_candidates: "Цены и источники",
    estimate_draft: "Редактируемая смета",
    estimate_review: "Независимая проверка",
    estimate_comparison: "Сравнение вариантов",
    execution_progress: "Исполнение сметы",
    commercial_proposal: "Коммерческое предложение",
    contract_draft: "Договор",
    contract_appendix: "Приложение к договору",
    act_draft: "Акт выполненных работ",
    ks2_draft: "КС-2",
    ks3_draft: "КС-3",
    m29_draft: "М-29",
    defect_statement: "Дефектная ведомость",
    material_statement: "Ведомость материалов",
    equipment_specification: "Спецификация оборудования",
    work_schedule: "График работ",
    invoice_draft: "Счёт",
    workspace_settings: "Профиль и сметные настройки",
    provider_settings: "AI-провайдеры",
    service_status: "Состояние сервисов"
  };
  return titles[tool] ?? "Подготовка результата";
}
