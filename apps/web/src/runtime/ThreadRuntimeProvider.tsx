import { useMemo, type ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  Suggestions,
  WebSpeechDictationAdapter,
  WebSpeechSynthesisAdapter,
  useAui,
  useLocalRuntime,
  useRemoteThreadListRuntime,
  type ChatModelAdapter
} from "@assistant-ui/react";
import type { AgentResponse, ApiErrorBody, Estimate } from "@prosmet/contracts";
import { fetchStoredEstimate } from "../features/estimate/estimate-api";
import { feedbackAdapter } from "./feedback-adapter";
import { serverThreadListAdapter } from "./server-thread-list-adapter";

type Props = { children: ReactNode; onEstimateReady: (estimate: Estimate) => void };
const EMPTY_AGENT_RESPONSE = "Агент вернул пустой ответ";
const AGENT_RETRIES = 2;

const PROSMET_SUGGESTIONS = [
  { title: "Локальная смета", label: "Новая строительная смета", prompt: "Составь локальную строительную смету. Уточни недостающие исходные данные, рассчитай объёмы, проверь цены и подготовь редактируемую смету." },
  { title: "Объектная смета", label: "Сводный расчёт объекта", prompt: "Собери объектную смету по разделам, связав работы, материалы, оборудование и итоги." },
  { title: "Акт КС-2", label: "Сформировать акт", prompt: "На основании утверждённой сметы подготовь акт КС-2 с текущими объёмами." },
  { title: "Материалы", label: "Подбор и расчёт", prompt: "Подбери материалы для строительной задачи, укажи единицы, количества, цены и источники." },
  { title: "Расчёт", label: "Объёмы и стоимость", prompt: "Рассчитай объёмы работ и материалов по моим замерам, затем выведи стоимость и итоги." },
  { title: "Договор", label: "Договор подряда", prompt: "Подготовь проект договора подряда на основании утверждённой сметы и данных проекта." },
  { title: "Смета ФЕР", label: "Нормативные расценки", prompt: "Составь смету с использованием нормативных расценок ФЕР/ТЕР/ГЭСН, явно укажи применённые позиции." },
  { title: "График работ", label: "План выполнения", prompt: "Построй график строительных работ по разделам сметы, зависимостям и объёмам." },
  { title: "Таблица", label: "Структурировать данные", prompt: "Преобразуй исходные данные в структурированную таблицу с колонками, единицами, количествами и итогами." },
  { title: "PDF", label: "Подготовить документ", prompt: "Подготовь PDF-версию текущего результата и перечисли, какие данные вошли в документ." }
];

function errorMessage(status: number, body: unknown) {
  const apiError = body as Partial<ApiErrorBody>;
  if (apiError?.error?.message) return apiError.error.message;
  if (status === 401) return "Откройте настройки и войдите в ProSmet для сохранения истории чатов.";
  if (status === 409) return "Сначала подключите и активируйте агента в настройках.";
  return `Агент недоступен: HTTP ${status}`;
}

function timedTextResult(text: string, startedAt: number) {
  const totalStreamTime = Math.max(0, Date.now() - startedAt);
  return { content: [{ type: "text" as const, text }], metadata: { timing: { streamStartTime: startedAt, firstTokenTime: totalStreamTime, totalStreamTime, totalChunks: 1, toolCallCount: 0 } } };
}

function shouldRetryAgentResponse(status: number, body: unknown) {
  if (status < 500) return false;
  const apiError = body as Partial<ApiErrorBody>;
  return apiError?.error?.message === EMPTY_AGENT_RESPONSE;
}

async function retryDelay(attempt: number) { await new Promise((resolve) => window.setTimeout(resolve, 350 * attempt)); }

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
          response = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: requestBody, signal: abortSignal, credentials: "same-origin" });
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
          return timedTextResult(result.text || "Смета сохранена в базе данных и открыта в редакторе.", startedAt);
        }
        return timedTextResult(result.text, startedAt);
      } catch (error) {
        if (abortSignal.aborted) throw error;
        return timedTextResult(error instanceof Error ? `Не удалось выполнить запрос к агенту: ${error.message}` : "Не удалось выполнить запрос к агенту.", startedAt);
      }
    }
  }), [onEstimateReady]);

  const dictationAdapter = useMemo(() => {
    if (typeof window === "undefined" || !WebSpeechDictationAdapter.isSupported()) return null;
    return new WebSpeechDictationAdapter({ language: "ru-RU", continuous: false, interimResults: true });
  }, []);
  const speechAdapter = useMemo(() => new WebSpeechSynthesisAdapter(), []);
  const runtime = useRemoteThreadListRuntime({
    runtimeHook: () => useLocalRuntime(adapter, { adapters: { feedback: feedbackAdapter, speech: speechAdapter, ...(dictationAdapter ? { dictation: dictationAdapter } : {}) } }),
    adapter: serverThreadListAdapter
  });
  const aui = useAui({ suggestions: Suggestions(PROSMET_SUGGESTIONS) });
  return <AssistantRuntimeProvider runtime={runtime} aui={aui}>{children}</AssistantRuntimeProvider>;
}
