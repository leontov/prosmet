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

export function RuntimeProvider({ children, onEstimateReady }: Props) {
  const adapter = useMemo<ChatModelAdapter>(() => ({
    async run({ messages, abortSignal }) {
      try {
        const response = await mobileApiFetch("/api/agent", {
          method: "POST",
          body: JSON.stringify({ messages }),
          signal: abortSignal
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          return { content: [{ type: "text", text: errorMessage(response.status, body) }] };
        }
        const result = body as AgentResponse;
        if (result.artifact === "estimate" && result.estimate) {
          queueMicrotask(() => onEstimateReady(result.estimate as Estimate));
        }
        return { content: [{ type: "text", text: result.text }] };
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
