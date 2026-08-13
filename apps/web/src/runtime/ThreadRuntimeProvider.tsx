import { useMemo, type ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  AuiConfig,
  Suggestions,
  WebSpeechDictationAdapter,
  WebSpeechSynthesisAdapter,
  useLocalRuntime,
  useRemoteThreadListRuntime,
  type ChatModelAdapter
} from "@assistant-ui/react";
import type { AgentResponse, ApiErrorBody, Estimate } from "@prosmet/contracts";
import { fetchStoredEstimate } from "../features/estimate/estimate-api";
import { feedbackAdapter } from "./feedback-adapter";
import { threadListAdapter } from "./thread-list-adapter";

type Props = {
  children: ReactNode;
  onEstimateReady: (estimate: Estimate) => void;
};

const EMPTY_AGENT_RESPONSE = "Агент вернул пустой ответ";
const AGENT_RETRIES = 2;

const PROSMET_SUGGESTIONS = [
  {
    title: "Составить смету",
    label: "Новая строительная смета",
    prompt: "Составь строительную смету. Сначала уточни недостающие исходные данные, затем рассчитай объёмы, проверь цены и подготовь редактируемую смету."
  },
  {
    title: "Рассчитать по замерам",
    label: "Объёмы работ и материалов",
    prompt: "Рассчитай объёмы работ и материалов по моим замерам, затем создай смету с ценами, источниками и итогами."
  },
  {
    title: "Подготовить документы",
    label: "КП, договор и акт",
    prompt: "На основании сметы подготовь комплект строительных документов: коммерческое предложение, договор, акт и счёт."
  }
];

function errorMessage(status: number, body: unknown) {
  const apiError = body as Partial<ApiErrorBody>;
  if (apiError?.error?.message) return apiError.error.message;
  if (status === 401) return "Откройте настройки и войдите как супер-администратор.";
  if (status === 409) return "Сначала подключите и активируйте агента в настройках.";
  return `Агент недоступен: HTTP ${status}`;
}

function timedTextResult(text: string, startedAt: number) {
  const totalStreamTime = Math.max(0, Date.now() - startedAt);
  return {
    content: [{ type: "text" as const, text }],
    metadata: {
      timing: {
        streamStartTime: startedAt,
        firstTokenTime: totalStreamTime,
        totalStreamTime,
        totalChunks: 1,
        toolCallCount: 0
      }
    }
  };
}

function shouldRetryAgentResponse(status: number, body: unknown) {
  if (status < 500) return false;
  const apiError = body as Partial<ApiErrorBody>;
  return apiError?.error?.message === EMPTY_AGENT_RESPONSE;
}

async function retryDelay(attempt: number) {
  await new Promise((resolve) => window.setTimeout(resolve, 350 * attempt));
}

export function ThreadRuntimeProvider({ children, onEstimateReady }: Props) {
  const adapter = useMemo<ChatModelAdapter>(() => ({
    async run({ messages, abortSignal }) {
      const startedAt = Date.now();
      try {
        const requestId = crypto.randomUUID();
        const requestBody = JSON.stringify({ requestId, messages });
        let response: Response | null = null;
        let body: unknown = null;

        for (let attempt = 0; attempt <= AGENT_RETRIES; attempt += 1) {
          response = await fetch("/api/agent", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: requestBody,
            signal: abortSignal,
            credentials: "same-origin"
          });
          body = await response.json().catch(() => null);
          if (response.ok || !shouldRetryAgentResponse(response.status, body) || attempt === AGENT_RETRIES) break;
          await retryDelay(attempt + 1);
        }

        if (!response) return timedTextResult("Не удалось выполнить запрос к агенту.", startedAt);
        if (!response.ok) return timedTextResult(errorMessage(response.status, body), startedAt);

        const result = body as AgentResponse;
        if (result.artifact?.type === "estimate") {
          const persisted = await fetchStoredEstimate(result.artifact.id);
          queueMicrotask(() => onEstimateReady(persisted));
          return timedTextResult(
            result.text || "Смета сохранена в базе данных и открыта в редакторе.",
            startedAt
          );
        }

        return timedTextResult(result.text, startedAt);
      } catch (error) {
        if (abortSignal.aborted) throw error;
        return timedTextResult(
          error instanceof Error
            ? `Не удалось выполнить запрос к агенту: ${error.message}`
            : "Не удалось выполнить запрос к агенту.",
          startedAt
        );
      }
    }
  }), [onEstimateReady]);

  const dictationAdapter = useMemo(() => {
    if (typeof window === "undefined" || !WebSpeechDictationAdapter.isSupported()) return null;
    return new WebSpeechDictationAdapter({ language: "ru-RU", continuous: false, interimResults: true });
  }, []);
  const speechAdapter = useMemo(() => new WebSpeechSynthesisAdapter(), []);

  const runtime = useRemoteThreadListRuntime({
    runtimeHook: () => useLocalRuntime(adapter, {
      adapters: {
        feedback: feedbackAdapter,
        speech: speechAdapter,
        ...(dictationAdapter ? { dictation: dictationAdapter } : {})
      }
    }),
    adapter: threadListAdapter
  });

  const config = useMemo(
    () => AuiConfig({ suggestions: Suggestions(PROSMET_SUGGESTIONS) }),
    []
  );

  return <AssistantRuntimeProvider runtime={runtime} config={config}>{children}</AssistantRuntimeProvider>;
}
