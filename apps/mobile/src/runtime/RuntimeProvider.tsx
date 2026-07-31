import { useMemo, type ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter
} from "@assistant-ui/react-native";
import type { AgentResponse, ApiErrorBody, Estimate } from "@prosmet/contracts";

type Props = { children: ReactNode; onEstimateReady: (estimate: Estimate) => void };

function errorMessage(status: number, body: unknown) {
  const apiError = body as Partial<ApiErrorBody>;
  if (apiError?.error?.message) return apiError.error.message;
  if (status === 401) return "Требуется токен супер-администратора в настройках мобильного приложения.";
  if (status === 409) return "Сначала подключите и активируйте агента в настройках.";
  return `Агент недоступен: HTTP ${status}`;
}

export function RuntimeProvider({ children, onEstimateReady }: Props) {
  const adapter = useMemo<ChatModelAdapter>(() => ({
    async run({ messages, abortSignal }) {
      const baseUrl = process.env.EXPO_PUBLIC_PROSMET_API_URL || "https://kolibriai.online";
      const adminToken = process.env.EXPO_PUBLIC_PROSMET_ADMIN_TOKEN;
      try {
        const response = await fetch(`${baseUrl}/api/agent`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(adminToken ? { "x-prosmet-admin-token": adminToken } : {})
          },
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
