"use client";

import { useMemo, type ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  type ThreadHistoryAdapter
} from "@assistant-ui/react";
import { HttpAgent } from "@ag-ui/client";
import { useAgUiRuntime } from "@assistant-ui/react-ag-ui";
import { ProsmetAttachmentAdapter } from "@/lib/local/attachment-adapter";
import { getRepository } from "@/lib/local/repository";
import { useLocalWorkspace } from "@/lib/local/context";

export function MyRuntimeProvider({ children }: { children: ReactNode }) {
  const {
    currentThreadId,
    refresh,
    createThread,
    selectThread
  } = useLocalWorkspace();
  const agentUrl = process.env.NEXT_PUBLIC_AGUI_AGENT_URL?.trim() || "/api/agent";

  const agent = useMemo(
    () =>
      new HttpAgent({
        url: agentUrl,
        threadId: currentThreadId,
        headers: { Accept: "text/event-stream" }
      }),
    [agentUrl, currentThreadId]
  );

  const history = useMemo<ThreadHistoryAdapter>(
    () => ({
      async load() {
        return (await getRepository()).loadMessages(currentThreadId);
      },
      async append(item) {
        await (await getRepository()).appendMessage(currentThreadId, item);
        await refresh();
      },
      async update(item) {
        await (await getRepository()).appendMessage(currentThreadId, item);
        await refresh();
      }
    }),
    [currentThreadId, refresh]
  );

  const threadList = useMemo(
    () => ({
      threadId: currentThreadId,
      onSwitchToNewThread: async () => {
        await createThread();
      },
      onSwitchToThread: async (threadId: string) => {
        await selectThread(threadId);
        const loaded = await (await getRepository()).loadMessages(threadId);
        return { messages: loaded.messages.map((entry) => entry.message) };
      }
    }),
    [currentThreadId, createThread, selectThread]
  );

  const attachments = useMemo(
    () => new ProsmetAttachmentAdapter(currentThreadId),
    [currentThreadId]
  );

  const runtime = useAgUiRuntime({
    agent,
    showThinking: false,
    autoCancelPendingToolCalls: true,
    adapters: { history, threadList, attachments },
    onError(error) {
      console.error("[prosmet/ag-ui]", error);
    }
  });

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
