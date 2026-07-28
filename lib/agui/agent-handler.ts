import { EventType, type AGUIEvent, type RunAgentInput } from "@ag-ui/core";
import {
  buildPlasteringEstimate,
  buildPlasteringTechnologyCard,
  reviewEstimate
} from "@/lib/domain/plastering";
import type { AgentState } from "@/lib/domain/types";

const textOf = (input: RunAgentInput): string => {
  const message = [...input.messages].reverse().find((value) => value.role === "user");
  if (!message || message.role !== "user") return "";
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n");
};

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
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

const isAbortError = (error: unknown): boolean =>
  (error instanceof DOMException && error.name === "AbortError") ||
  (error instanceof Error && error.name === "AbortError");

const supportsPlastering = (prompt: string): boolean =>
  /штукатур|гипсов|цементн(?:ая|ой)\s+смес|маяк/i.test(prompt);

export async function* runChiefEstimator(
  input: RunAgentInput,
  signal: AbortSignal
): AsyncGenerator<AGUIEvent> {
  const prompt = textOf(input);
  const threadId = input.threadId;
  const runId = input.runId;
  const messageId = crypto.randomUUID();
  const technologyCallId = crypto.randomUUID();
  const estimateCallId = crypto.randomUUID();
  const reviewCallId = crypto.randomUUID();

  yield {
    type: EventType.RUN_STARTED,
    threadId,
    runId,
    ...(input.parentRunId ? { parentRunId: input.parentRunId } : {})
  };
  // The assistant message exists before tool calls so every tool can be attached
  // to one immutable message through parentMessageId.
  yield { type: EventType.TEXT_MESSAGE_START, messageId, role: "assistant" };
  yield {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    delta: "Принял строительную задачу. Сначала определяю технологию и только затем формирую позиции сметы.\n\n"
  };

  if (!supportsPlastering(prompt)) {
    yield {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      delta:
        "Этот production-срез пока содержит проверенный доменный адаптер механизированной штукатурки. Для текущего вида работ смета не создана, чтобы не подменять профессиональный расчёт фиктивным шаблоном. Следующим должен быть подключён профильный технологический адаптер для указанной специализации."
    };
    yield { type: EventType.TEXT_MESSAGE_END, messageId };
    yield {
      type: EventType.RUN_FINISHED,
      threadId,
      runId,
      outcome: { type: "success" },
      result: { status: "unsupported-domain", estimateCreated: false }
    };
    return;
  }

  const trace = [
    { id: "analyse", label: "Анализ исходных данных", status: "running" as const },
    { id: "technology", label: "Определение технологии", status: "pending" as const },
    { id: "pricing", label: "Подбор цен", status: "pending" as const },
    { id: "estimate", label: "Формирование сметы", status: "pending" as const },
    { id: "review", label: "Независимая проверка", status: "pending" as const }
  ];
  yield {
    type: EventType.ACTIVITY_SNAPSHOT,
    messageId: `${messageId}-activity`,
    activityType: "work_trace",
    content: { title: "Ход работы", steps: trace },
    replace: true
  };

  try {
    yield { type: EventType.STEP_STARTED, stepName: "analyse-input" };
    await sleep(120, signal);
    yield {
      type: EventType.ACTIVITY_DELTA,
      messageId: `${messageId}-activity`,
      activityType: "work_trace",
      patch: [
        { op: "replace", path: "/steps/0/status", value: "complete" },
        { op: "replace", path: "/steps/1/status", value: "running" }
      ]
    };
    yield { type: EventType.STEP_FINISHED, stepName: "analyse-input" };

    const technology = buildPlasteringTechnologyCard(prompt);
    yield { type: EventType.STEP_STARTED, stepName: "technology-card" };
    yield {
      type: EventType.TOOL_CALL_START,
      toolCallId: technologyCallId,
      toolCallName: "technology_card",
      parentMessageId: messageId
    };
    yield {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: technologyCallId,
      delta: JSON.stringify({ card: technology })
    };
    yield { type: EventType.TOOL_CALL_END, toolCallId: technologyCallId };
    yield {
      type: EventType.TOOL_CALL_RESULT,
      messageId: crypto.randomUUID(),
      toolCallId: technologyCallId,
      content: JSON.stringify({ card: technology, status: "complete" }),
      role: "tool"
    };
    yield { type: EventType.STEP_FINISHED, stepName: "technology-card" };

    await sleep(100, signal);
    yield {
      type: EventType.ACTIVITY_DELTA,
      messageId: `${messageId}-activity`,
      activityType: "work_trace",
      patch: [
        { op: "replace", path: "/steps/1/status", value: "complete" },
        { op: "replace", path: "/steps/2/status", value: "running" }
      ]
    };

    const estimate = buildPlasteringEstimate(prompt, technology);
    const state: AgentState = {
      project: {
        id: `project-${threadId}`,
        name: estimate.projectName,
        region: estimate.region
      },
      activeEstimate: estimate,
      estimateRevision: estimate.revision,
      documents: [],
      priceContext: {
        region: estimate.region,
        unconfirmedCount: estimate.sections
          .flatMap((section) => section.items)
          .filter((value) => !value.priceSource.confirmed).length
      },
      workTrace: trace,
      sync: { status: "local", cursor: null },
      provider: {
        id: "deterministic-chief-estimator",
        model: null,
        mode: "deterministic"
      },
      validation: {
        status: "pending-review",
        warnings: estimate.warnings.length
      }
    };
    yield { type: EventType.STATE_SNAPSHOT, snapshot: state };

    yield {
      type: EventType.ACTIVITY_DELTA,
      messageId: `${messageId}-activity`,
      activityType: "work_trace",
      patch: [
        { op: "replace", path: "/steps/2/status", value: "complete" },
        { op: "replace", path: "/steps/3/status", value: "running" }
      ]
    };
    yield { type: EventType.STEP_STARTED, stepName: "estimate-draft" };
    yield {
      type: EventType.TOOL_CALL_START,
      toolCallId: estimateCallId,
      toolCallName: "estimate_draft",
      parentMessageId: messageId
    };
    yield {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: estimateCallId,
      delta: JSON.stringify({ estimate })
    };
    yield { type: EventType.TOOL_CALL_END, toolCallId: estimateCallId };
    yield {
      type: EventType.TOOL_CALL_RESULT,
      messageId: crypto.randomUUID(),
      toolCallId: estimateCallId,
      content: JSON.stringify({ estimate, status: "complete" }),
      role: "tool"
    };
    yield { type: EventType.STEP_FINISHED, stepName: "estimate-draft" };

    yield {
      type: EventType.ACTIVITY_DELTA,
      messageId: `${messageId}-activity`,
      activityType: "work_trace",
      patch: [
        { op: "replace", path: "/steps/3/status", value: "complete" },
        { op: "replace", path: "/steps/4/status", value: "running" }
      ]
    };

    const review = reviewEstimate(estimate);
    yield { type: EventType.STEP_STARTED, stepName: "independent-review" };
    yield {
      type: EventType.TOOL_CALL_START,
      toolCallId: reviewCallId,
      toolCallName: "estimate_review",
      parentMessageId: messageId
    };
    yield {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: reviewCallId,
      delta: JSON.stringify({ review })
    };
    yield { type: EventType.TOOL_CALL_END, toolCallId: reviewCallId };
    yield {
      type: EventType.TOOL_CALL_RESULT,
      messageId: crypto.randomUUID(),
      toolCallId: reviewCallId,
      content: JSON.stringify({ review, status: "complete" }),
      role: "tool"
    };
    yield {
      type: EventType.STATE_DELTA,
      delta: [
        {
          op: "replace",
          path: "/validation",
          value: {
            status: review.status,
            warnings: review.checks.filter((value) => value.status !== "passed").length
          }
        },
        {
          op: "replace",
          path: "/workTrace",
          value: trace.map((value) => ({ ...value, status: "complete" }))
        }
      ]
    };
    yield {
      type: EventType.ACTIVITY_DELTA,
      messageId: `${messageId}-activity`,
      activityType: "work_trace",
      patch: [{ op: "replace", path: "/steps/4/status", value: "complete" }]
    };
    yield { type: EventType.STEP_FINISHED, stepName: "independent-review" };

    const response = [
      "Сформированы технологическая карта, ресурсная смета и независимая проверка. Нормативные коды не выдумывались: лицензированная нормативная база ещё не подключена.",
      "\n\nСмета интерактивна. Изменения количества, цены и коэффициента сразу пересчитывают итог и AG‑UI state; после паузы создаётся новая локальная revision без перезаписи предыдущей.",
      "\n\nНеподтверждённые цены явно помечены. После подключения личного прайса или поставщика их можно заменить по приоритету источников."
    ];
    for (const chunk of response) {
      yield { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: chunk };
      await sleep(40, signal);
    }
    yield { type: EventType.TEXT_MESSAGE_END, messageId };
    yield {
      type: EventType.RUN_FINISHED,
      threadId,
      runId,
      outcome: { type: "success" },
      result: { estimateId: estimate.id, revision: estimate.revision }
    };
  } catch (error) {
    // The client runtime owns cancellation state. Closing the stream without
    // turning a user stop into RUN_ERROR prevents a false failure banner.
    if (isAbortError(error)) return;
    const message = error instanceof Error ? error.message : "Неизвестная ошибка";
    yield { type: EventType.RUN_ERROR, message, code: "ESTIMATOR_FAILED" };
  }
}
