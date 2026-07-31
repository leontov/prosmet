import { useMemo, type ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter
} from "@assistant-ui/react-native";
import type { AgentResponse, Estimate } from "@prosmet/contracts";
import { demoEstimate } from "../data";

type Props = { children: ReactNode; onEstimateReady: (estimate: Estimate) => void };

export function RuntimeProvider({ children, onEstimateReady }: Props) {
  const adapter = useMemo<ChatModelAdapter>(() => ({
    async run({ messages, abortSignal }) {
      const baseUrl = process.env.EXPO_PUBLIC_PROSMET_API_URL || "https://kolibriai.online";
      try {
        const response = await fetch(`${baseUrl}/api/agent`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages }),
          signal: abortSignal
        });
        if (!response.ok) throw new Error(`Agent request failed: ${response.status}`);
        const result = await response.json() as AgentResponse;
        if (result.artifact === "estimate" && result.estimate) queueMicrotask(() => onEstimateReady(result.estimate as Estimate));
        return { content: [{ type: "text", text: result.text }] };
      } catch (error) {
        if (abortSignal.aborted) throw error;
        queueMicrotask(() => onEstimateReady(demoEstimate));
        return { content: [{ type: "text", text: "Подготовил локальный черновик сметы. Проверьте объёмы и цены перед сохранением версии." }] };
      }
    }
  }), [onEstimateReady]);

  const runtime = useLocalRuntime(adapter);
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
