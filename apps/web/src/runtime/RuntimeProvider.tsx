import { useMemo, type ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter
} from "@assistant-ui/react";
import type { AgentResponse, Estimate } from "@prosmet/contracts";

const selectedAgentStorageKey = "prosmet-selected-agent";

type Props = {
  children: ReactNode;
  onEstimateReady: (estimate: Estimate) => void;
};

function selectedAgentId() {
  try { return window.localStorage.getItem(selectedAgentStorageKey) || ""; } catch { return ""; }
}

async function responseError(response: Response) {
  try {
    const body = await response.json() as { error?: { message?: string } };
    return body.error?.message || `Agent request failed: ${response.status}`;
  } catch {
    return `Agent request failed: ${response.status}`;
  }
}

export function RuntimeProvider({ children, onEstimateReady }: Props) {
  const adapter = useMemo<ChatModelAdapter>(() => ({
    async run({ messages, abortSignal }) {
      try {
        const response = await fetch("/api/agent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages, agentId: selectedAgentId() }),
          signal: abortSignal,
          credentials: "same-origin"
        });

        if (!response.ok) throw new Error(await responseError(response));
        const result = await response.json() as AgentResponse;
        if (result.artifact === "estimate" && result.estimate) {
          queueMicrotask(() => onEstimateReady(result.estimate as Estimate));
        }

        return { content: [{ type: "text", text: result.text }] };
      } catch (error) {
        if (abortSignal.aborted) throw error;
        const message = error instanceof Error ? error.message : "Agent request failed";
        return {
          content: [{
            type: "text",
            text: `Агент не выполнил запрос: ${message}`
          }]
        };
      }
    }
  }), [onEstimateReady]);

  const runtime = useLocalRuntime(adapter);
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
