"use client";

import { useEffect, useMemo, type ReactNode } from "react";
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
  const workspace = useLocalWorkspace();
  const agentUrl = process.env.NEXT_PUBLIC_AGUI_AGENT_URL?.trim() || "/api/agent";

  const agent = useMemo(
    () =>
      new HttpAgent({
        url: agentUrl,
        threadId: workspace.currentThreadId,
        headers: { Accept: "text/event-stream" }
      }),
    [agentUrl, workspace.currentThreadId]
  );

  const history = useMemo<ThreadHistoryAdapter>(
    () => ({
      async load() {
        return (await getRepository()).loadMessages(workspace.currentThreadId);
      },
      async append(item) {
        await (await getRepository()).appendMessage(workspace.currentThreadId, item);
        await workspace.refresh();
      }
    }),
    [workspace.currentThreadId, workspace.refresh]
  );

  const threadList = useMemo(
    () => ({
      threadId: workspace.currentThreadId,
      onSwitchToNewThread: async () => {
        await workspace.createThread();
      },
      onSwitchToThread: async (threadId: string) => {
        await workspace.selectThread(threadId);
        const loaded = await (await getRepository()).loadMessages(threadId);
        return { messages: loaded.messages.map((entry) => entry.message) };
      }
    }),
    [workspace]
  );

  const attachments = useMemo(
    () => new ProsmetAttachmentAdapter(workspace.currentThreadId),
    [workspace.currentThreadId]
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

  useEffect(() => {
    return runtime.thread.subscribe(() => {
      void workspace.refresh();
    });
  }, [runtime, workspace.refresh]);

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
