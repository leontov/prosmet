"use client";

import { HttpAgent } from "@ag-ui/client";
import {
  AssistantRuntimeProvider,
  Suggestions,
  Tools,
  WebSpeechDictationAdapter,
  WebSpeechSynthesisAdapter,
  useAui,
  type ExportedMessageRepositoryItem
} from "@assistant-ui/react";
import { useAgUiRuntime } from "@assistant-ui/react-ag-ui";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { attachmentAdapter } from "@/lib/attachments/browser-adapter";
import { kolibriToolkit } from "@/components/toolkit";
import {
  appendMessageRepository,
  ensureThread,
  listThreads,
  loadBranchMessages,
  loadMessageRepository,
  type LocalThread
} from "@/lib/local/local-db";
import { WorkspaceContext } from "@/components/workspace-context";

const createId = () => crypto.randomUUID();

interface WorkspaceBridgeProps {
  activeThreadId: string;
  threads: LocalThread[];
  sidebarOpen: boolean;
  setSidebarOpen: (value: boolean) => void;
  refreshThreads: () => Promise<void>;
  children: ReactNode;
}

function WorkspaceBridge({
  activeThreadId,
  threads,
  sidebarOpen,
  setSidebarOpen,
  refreshThreads,
  children
}: WorkspaceBridgeProps) {
  const aui = useAui();

  const createThread = useCallback(async () => {
    await aui.threads().switchToNewThread();
    setSidebarOpen(false);
  }, [aui, setSidebarOpen]);

  const switchThread = useCallback(async (id: string) => {
    await aui.threads().switchToThread(id);
    setSidebarOpen(false);
  }, [aui, setSidebarOpen]);

  const workspace = useMemo(() => ({
    activeThreadId,
    threads,
    sidebarOpen,
    setSidebarOpen,
    createThread,
    switchThread,
    refreshThreads
  }), [activeThreadId, threads, sidebarOpen, setSidebarOpen, createThread, switchThread, refreshThreads]);

  return <WorkspaceContext.Provider value={workspace}>{children}</WorkspaceContext.Provider>;
}

function RuntimeLayer({ children }: { children: ReactNode }) {
  const [activeThreadId, setActiveThreadId] = useState(() => {
    if (typeof window === "undefined") return "00000000-0000-4000-8000-000000000001";
    return window.localStorage.getItem("prosmet.activeThreadId") ?? createId();
  });
  const [threads, setThreads] = useState<LocalThread[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const refreshThreads = useCallback(async () => setThreads(await listThreads()), []);

  useEffect(() => {
    window.localStorage.setItem("prosmet.activeThreadId", activeThreadId);
    void ensureThread(activeThreadId).then(refreshThreads);
  }, [activeThreadId, refreshThreads]);

  const agent = useMemo(() => new HttpAgent({
    url: "/api/agent",
    threadId: activeThreadId,
    headers: { Accept: "text/event-stream" }
  }), [activeThreadId]);

  const historyAdapter = useMemo(() => ({
    load: () => loadMessageRepository(activeThreadId),
    append: async (item: ExportedMessageRepositoryItem) => {
      await appendMessageRepository(activeThreadId, item);
      await refreshThreads();
    }
  }), [activeThreadId, refreshThreads]);

  const threadListAdapter = useMemo(() => ({
    threadId: activeThreadId,
    onSwitchToNewThread: async () => {
      const id = createId();
      await ensureThread(id);
      setActiveThreadId(id);
      await refreshThreads();
    },
    onSwitchToThread: async (id: string) => {
      const messages = await loadBranchMessages(id);
      setActiveThreadId(id);
      return { messages };
    }
  }), [activeThreadId, refreshThreads]);

  const voiceAdapters = useMemo(() => ({
    speech: new WebSpeechSynthesisAdapter(),
    dictation: new WebSpeechDictationAdapter({
      language: "ru-RU",
      continuous: true,
      interimResults: true
    })
  }), []);

  const runtime = useAgUiRuntime({
    agent,
    showThinking: false,
    autoCancelPendingToolCalls: true,
    adapters: {
      attachments: attachmentAdapter,
      speech: voiceAdapters.speech,
      dictation: voiceAdapters.dictation,
      history: historyAdapter,
      threadList: threadListAdapter
    },
    onError: (error) => console.error("[prosmet:agui]", error),
    onCancel: () => console.info("[prosmet:agui] run cancelled")
  });

  const aui = useAui({
    tools: Tools({ toolkit: kolibriToolkit }),
    suggestions: Suggestions([
      {
        title: "Штукатурка 358 м²",
        label: "полная смета с технологической картой",
        prompt: "Составь полную смету механизированной гипсовой штукатурки 358 м² в Лениногорске. Средний слой 15 мм. Учти подготовку, маяки, углы, материалы, логистику и уборку."
      },
      {
        title: "Цементная штукатурка",
        label: "фасад или влажное помещение",
        prompt: "Составь полную ресурсную смету цементной штукатурки 180 м² в Альметьевске, слой 20 мм. Сначала создай технологическую карту, учти маяки, углы, грунт, доставку и уборку."
      },
      {
        title: "Изменить готовую смету",
        label: "цены, объёмы и коэффициенты",
        prompt: "Составь смету гипсовой штукатурки 120 м², после чего я изменю цены и объёмы прямо в сообщении."
      }
    ])
  });

  return (
    <AssistantRuntimeProvider runtime={runtime} aui={aui}>
      <WorkspaceBridge
        activeThreadId={activeThreadId}
        threads={threads}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        refreshThreads={refreshThreads}
      >
        {children}
      </WorkspaceBridge>
    </AssistantRuntimeProvider>
  );
}

export function KolibriRuntimeProvider({ children }: Readonly<{ children: ReactNode }>) {
  return <RuntimeLayer>{children}</RuntimeLayer>;
}
