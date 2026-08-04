import { useMemo, type ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  WebSpeechDictationAdapter,
  WebSpeechSynthesisAdapter,
  useLocalRuntime,
  type ChatModelAdapter
} from "@assistant-ui/react";
import type { AgentResponse, ApiErrorBody, Estimate } from "@prosmet/contracts";
import { fetchStoredEstimate } from "../features/estimate/estimate-api";
import { feedbackAdapter } from "./feedback-adapter";

type Props = {
  children: ReactNode;
  onEstimateReady: (estimate: Estimate) => void;
};

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

export function RuntimeProvider({ children, onEstimateReady }: Props) {
  const adapter = useMemo<ChatModelAdapter>(() => ({
    async run({ messages, abortSignal }) {
      const startedAt = Date.now();
      try {
        const requestId = crypto.randomUUID();
        const response = await fetch("/api/agent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ requestId, messages }),
          signal: abortSignal,
          credentials: "same-origin"
        });

        const body = await response.json().catch(() => null);
        if (!response.ok) {
          return timedTextResult(errorMessage(response.status, body), startedAt);
        }

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
    return new WebSpeechDictationAdapter({
      language: "ru-RU",
      continuous: false,
      interimResults: true
    });
  }, []);
  const speechAdapter = useMemo(() => new WebSpeechSynthesisAdapter(), []);

  const runtime = useLocalRuntime(adapter, {
    adapters: {
      feedback: feedbackAdapter,
      speech: speechAdapter,
      ...(dictationAdapter ? { dictation: dictationAdapter } : {})
    }
  });
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
