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
  const { currentThreadId, refresh, createThread, selectThread } = useLocalWorkspace();

  // useAgUiRuntime intentionally keeps one AgUiThreadRuntimeCore in a ref and
  // loads history only when that core is created. The local workspace starts
  // with an optimistic thread ID and then resolves the remembered IndexedDB
  // thread. Keying the inner provider guarantees a fresh core and a real
  // history load for the resolved thread instead of showing an empty static
  // shell after reload.
  return (
    <ThreadRuntimeProvider
      key={currentThreadId}
      currentThreadId={currentThreadId}
      refresh={refresh}
      createThread={createThread}
      selectThread={selectThread}
    >
      {children}
    </ThreadRuntimeProvider>
  );
}

function ThreadRuntimeProvider({
  children,
  currentThreadId,
  refresh,
  createThread,
  selectThread
}: {
  children: ReactNode;
  currentThreadId: string;
  refresh: () => Promise<void>;
  createThread: () => Promise<string>;
  selectThread: (id: string) => Promise<void>;
}) {
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
        return {
          messages: loaded.messages.map((entry) => entry.message)
        };
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
