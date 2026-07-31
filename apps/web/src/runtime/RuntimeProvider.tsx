import { useMemo, type ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter
} from "@assistant-ui/react";
import type { AgentResponse, Estimate } from "@prosmet/contracts";

type Props = {
  children: ReactNode;
  onEstimateReady: (estimate: Estimate) => void;
};

export function RuntimeProvider({ children, onEstimateReady }: Props) {
  const adapter = useMemo<ChatModelAdapter>(() => ({
    async run({ messages, abortSignal }) {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages }),
        signal: abortSignal,
        credentials: "same-origin"
      });

      if (!response.ok) throw new Error(`Agent request failed: ${response.status}`);
      const result = await response.json() as AgentResponse;
      if (result.artifact === "estimate" && result.estimate) {
        queueMicrotask(() => onEstimateReady(result.estimate as Estimate));
      }

      return {
        content: [{ type: "text", text: result.text }]
      };
    }
  }), [onEstimateReady]);

  const runtime = useLocalRuntime(adapter);
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
