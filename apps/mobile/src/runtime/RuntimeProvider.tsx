import { useMemo, type ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter
} from "@assistant-ui/react-native";
import type { AgentResponse, ApiErrorBody, Estimate } from "@prosmet/contracts";
import { mobileApiFetch } from "../agent-session";

type Props = { children: ReactNode; onEstimateReady: (estimate: Estimate) => void };

function errorMessage(status: number, body: unknown) {
  const apiError = body as Partial<ApiErrorBody>;
  if (apiError?.error?.message) return apiError.error.message;
  if (status === 401) return "Сохраните токен супер-администратора в настройках мобильного приложения.";
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
        const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const response = await mobileApiFetch("/api/agent", {
          method: "POST",
          body: JSON.stringify({ requestId, messages }),
          signal: abortSignal
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          return timedTextResult(errorMessage(response.status, body), startedAt);
        }

        const result = body as AgentResponse;
        if (result.artifact?.type === "estimate") {
          const estimateResponse = await mobileApiFetch(`/api/estimates/${encodeURIComponent(result.artifact.id)}`, {
            method: "GET",
            signal: abortSignal
          });
          const estimateBody = await estimateResponse.json().catch(() => null);
          if (!estimateResponse.ok) {
            return timedTextResult(errorMessage(estimateResponse.status, estimateBody), startedAt);
          }
          queueMicrotask(() => onEstimateReady(estimateBody as Estimate));
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

  const runtime = useLocalRuntime(adapter);
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
