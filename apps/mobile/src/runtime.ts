import { useEffect, useMemo, useState } from "react";
import { type ChatModelAdapter, type ChatModelRunResult, useLocalRuntime } from "@assistant-ui/react-native";
import { getApiBase } from "@/src/config";

type EventRecord = Record<string, unknown>;
type ReadonlyJSONValue = string | number | boolean | null | ReadonlyJSONObject | readonly ReadonlyJSONValue[];
type ReadonlyJSONObject = { readonly [key: string]: ReadonlyJSONValue };

type ToolState = {
  toolName: string;
  argsText: string;
};

function textContent(message: { content?: unknown }) {
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content
    .flatMap((part) => part && typeof part === "object" && (part as EventRecord).type === "text" && typeof (part as EventRecord).text === "string" ? [(part as EventRecord).text as string] : [])
    .join("\n");
}

function parsedArgs(argsText: string): ReadonlyJSONObject {
  try {
    const value = JSON.parse(argsText || "{}") as ReadonlyJSONValue;
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as ReadonlyJSONObject
      : {};
  } catch {
    return {};
  }
}

function createAdapter(apiBase: string): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }): AsyncGenerator<ChatModelRunResult, void, unknown> {
      const response = await fetch(`${apiBase}/api/agent`, {
        method: "POST",
        headers: { Accept: "text/event-stream", "Content-Type": "application/json" },
        credentials: "include",
        signal: abortSignal,
        body: JSON.stringify({
          threadId: `native-${Date.now()}`,
          runId: `native-run-${Date.now()}`,
          messages: messages.map((message, index) => ({
            id: String((message as EventRecord).id || `native-message-${index}`),
            role: (message as EventRecord).role,
            content: [{ type: "text", text: textContent(message as { content?: unknown }) }]
          })),
          tools: [],
          context: { client: "expo-native", platform: "mobile" },
          state: {}
        })
      });
      if (!response.ok || !response.body) throw new Error(`Сервер ответил ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const tools = new Map<string, ToolState>();
      let text = "";
      let buffer = "";
      const content = (): ChatModelRunResult["content"] => [
        ...(text ? [{ type: "text" as const, text }] : []),
        ...Array.from(tools.entries()).map(([toolCallId, tool]) => ({
          type: "tool-call" as const,
          toolCallId,
          toolName: tool.toolName,
          argsText: tool.argsText || "{}",
          args: parsedArgs(tool.argsText)
        }))
      ];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() || "";
        for (const frame of frames) {
          for (const line of frame.split(/\r?\n/)) {
            if (!line.startsWith("data:")) continue;
            const event = JSON.parse(line.slice(5).trim()) as EventRecord;
            if (event.type === "TEXT_MESSAGE_CONTENT") {
              text += typeof event.delta === "string" ? event.delta : typeof event.content === "string" ? event.content : "";
            }
            if (event.type === "TOOL_CALL_START" && typeof event.toolCallId === "string") {
              tools.set(event.toolCallId, { toolName: String(event.toolCallName || event.toolName || "tool"), argsText: "" });
            }
            if (event.type === "TOOL_CALL_ARGS" && typeof event.toolCallId === "string") {
              const tool = tools.get(event.toolCallId);
              if (tool) tool.argsText += String(event.delta || event.args || "");
            }
            if (event.type === "RUN_ERROR") throw new Error(String(event.message || "Ошибка агента"));
            yield { content: content() };
          }
        }
      }
      yield { content: content() };
    }
  };
}

export function useProsmetRuntime() {
  const [apiBase, setApiBase] = useState("https://kolibriai.online");
  useEffect(() => { void getApiBase().then(setApiBase); }, []);
  const adapter = useMemo(() => createAdapter(apiBase), [apiBase]);
  return useLocalRuntime(adapter);
}
