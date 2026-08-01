import { useMemo, type ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter
} from "@assistant-ui/react";
import type { AgentResponse, ApiErrorBody, Estimate } from "@prosmet/contracts";
import { fetchStoredEstimate } from "../features/estimate/estimate-api";

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

export function RuntimeProvider({ children, onEstimateReady }: Props) {
  const adapter = useMemo<ChatModelAdapter>(() => ({
    async run({ messages, abortSignal }) {
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
          return {
            content: [{ type: "text", text: errorMessage(response.status, body) }]
          };
        }

        const result = body as AgentResponse;
        if (result.artifact?.type === "estimate") {
          const persisted = await fetchStoredEstimate(result.artifact.id);
          queueMicrotask(() => onEstimateReady(persisted));
          return {
            content: [{
              type: "text",
              text: result.text || "Смета сохранена в базе данных и открыта в редакторе."
            }]
          };
        }

        return {
          content: [{ type: "text", text: result.text }]
        };
      } catch (error) {
        if (abortSignal.aborted) throw error;
        return {
          content: [{
            type: "text",
            text: error instanceof Error
              ? `Не удалось выполнить запрос к агенту: ${error.message}`
              : "Не удалось выполнить запрос к агенту."
          }]
        };
      }
    }
  }), [onEstimateReady]);

  const runtime = useLocalRuntime(adapter);
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
