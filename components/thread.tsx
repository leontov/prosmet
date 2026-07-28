"use client";

import {
  ActionBarPrimitive,
  AuiIf,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  SuggestionPrimitive,
  ThreadPrimitive,
  useAuiState
} from "@assistant-ui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  AudioLinesIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  MicIcon,
  PencilIcon,
  RefreshCwIcon,
  SquareIcon,
  StopCircleIcon
} from "lucide-react";
import type { FC } from "react";
import {
  ComposerAddAttachment,
  ComposerAttachments,
  UserMessageAttachments
} from "@/components/attachments";
import { MarkdownText } from "@/components/markdown-text";

interface EmptyThreadState {
  thread: {
    messages: readonly unknown[];
    isLoading: boolean;
  };
  threads: {
    isLoading: boolean;
  };
}

const isNew = (state: EmptyThreadState) =>
  state.thread.messages.length === 0 &&
  (!state.thread.isLoading || state.threads.isLoading);

export const EstimateThread: FC = () => {
  const empty = useAuiState(isNew);

  return (
    <ThreadPrimitive.Root
      className="flex h-full flex-col bg-white"
      style={{ ["--thread-max-width" as string]: "64rem" }}
    >
      <ThreadPrimitive.Viewport
        turnAnchor="top"
        className="scrollbar-thin relative flex flex-1 flex-col overflow-x-hidden overflow-y-auto scroll-smooth"
      >
        <div
          className={`mx-auto flex w-full max-w-[var(--thread-max-width)] flex-1 flex-col px-3 pt-4 sm:px-5 ${empty ? "justify-center" : ""}`}
        >
          <AuiIf condition={isNew}>
            <Welcome />
          </AuiIf>

          <div className="mb-10 flex flex-col gap-7 empty:hidden">
            <ThreadPrimitive.Messages>
              {() => <ThreadMessage />}
            </ThreadPrimitive.Messages>
          </div>

          <ThreadPrimitive.ViewportFooter
            className={`${empty ? "" : "sticky bottom-0 mt-auto"} safe-bottom z-10 flex flex-col gap-3 bg-white/95 pb-3 pt-2 backdrop-blur-sm`}
          >
            <ThreadPrimitive.ScrollToBottom asChild>
              <button
                type="button"
                className="absolute -top-11 self-center rounded-full border border-neutral-200 bg-white p-2 text-neutral-600 shadow-sm disabled:invisible"
                aria-label="Прокрутить вниз"
              >
                <ArrowDownIcon className="size-4" />
              </button>
            </ThreadPrimitive.ScrollToBottom>
            <Composer />
            <AuiIf condition={(state) => isNew(state) && state.composer.isEmpty}>
              <Suggestions />
            </AuiIf>
            <p className="text-center text-[10px] text-neutral-400">
              AI может ошибаться. Нормы, цены и договорные условия требуют профессиональной проверки.
            </p>
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const Welcome: FC = () => (
  <div className="mb-5 px-2 text-center">
    <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-neutral-900 text-lg font-semibold text-white">
      P
    </div>
    <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
      Какую смету подготовить?
    </h1>
    <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-neutral-500">
      Опишите строительную задачу обычными словами. Сначала будет сформирована технологическая карта,
      затем полный состав работ, ресурсов и цен.
    </p>
  </div>
);

const Suggestions: FC = () => (
  <div className="flex flex-wrap justify-center gap-2 px-2">
    <ThreadPrimitive.Suggestions>
      {() => (
        <SuggestionPrimitive.Trigger send asChild>
          <button
            type="button"
            className="rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-xs text-neutral-700 transition hover:bg-neutral-50"
          >
            <SuggestionPrimitive.Title className="font-medium" />{" "}
            <SuggestionPrimitive.Description className="text-neutral-500" />
          </button>
        </SuggestionPrimitive.Trigger>
      )}
    </ThreadPrimitive.Suggestions>
  </div>
);

const Composer: FC = () => (
  <ComposerPrimitive.Root className="relative flex w-full flex-col">
    <ComposerPrimitive.AttachmentDropzone asChild>
      <div className="rounded-[24px] border border-neutral-200 bg-neutral-50 p-2 shadow-[0_6px_30px_rgba(0,0,0,.08)] focus-within:border-neutral-400 data-[dragging=true]:border-dashed data-[dragging=true]:bg-blue-50">
        <ComposerAttachments />
        <ComposerPrimitive.Input
          autoFocus
          rows={1}
          placeholder="Опишите объект, работы, объёмы и регион…"
          className="max-h-40 min-h-12 w-full resize-none bg-transparent px-3 py-2 text-[15px] outline-none placeholder:text-neutral-400"
          aria-label="Сообщение сметчику"
        />
        <div className="flex items-center justify-between px-1 pb-1">
          <ComposerAddAttachment />
          <div className="flex items-center gap-1">
            <AuiIf condition={(state) => state.thread.capabilities.dictation && state.composer.dictation == null}>
              <ComposerPrimitive.Dictate asChild>
                <button
                  type="button"
                  className="rounded-full p-2 text-neutral-500 hover:bg-neutral-200"
                  aria-label="Начать диктовку"
                >
                  <MicIcon className="size-4" />
                </button>
              </ComposerPrimitive.Dictate>
            </AuiIf>
            <AuiIf condition={(state) => state.thread.capabilities.dictation && state.composer.dictation != null}>
              <ComposerPrimitive.StopDictation asChild>
                <button
                  type="button"
                  className="rounded-full p-2 text-red-600 hover:bg-red-50"
                  aria-label="Остановить диктовку"
                >
                  <SquareIcon className="size-3.5 fill-current" />
                </button>
              </ComposerPrimitive.StopDictation>
            </AuiIf>
            <AuiIf condition={(state) => !state.thread.isRunning}>
              <ComposerPrimitive.Send asChild>
                <button
                  type="button"
                  className="grid size-8 place-items-center rounded-full bg-neutral-900 text-white disabled:opacity-30"
                  aria-label="Отправить"
                >
                  <ArrowUpIcon className="size-4" />
                </button>
              </ComposerPrimitive.Send>
            </AuiIf>
            <AuiIf condition={(state) => state.thread.isRunning}>
              <ComposerPrimitive.Cancel asChild>
                <button
                  type="button"
                  className="grid size-8 place-items-center rounded-full bg-neutral-900 text-white"
                  aria-label="Остановить"
                >
                  <SquareIcon className="size-3.5 fill-current" />
                </button>
              </ComposerPrimitive.Cancel>
            </AuiIf>
          </div>
        </div>
      </div>
    </ComposerPrimitive.AttachmentDropzone>
  </ComposerPrimitive.Root>
);

const ThreadMessage: FC = () => {
  const role = useAuiState((state) => state.message.role);
  const editing = useAuiState((state) => state.message.composer.isEditing);
  if (editing) return <EditComposer />;
  return role === "user" ? <UserMessage /> : <AssistantMessage />;
};

const AssistantMessage: FC = () => (
  <MessagePrimitive.Root className="relative pb-7 [content-visibility:auto]">
    <div className="px-1 text-[15px] leading-relaxed">
      <MessagePrimitive.Parts>
        {({ part }) => {
          if (part.type === "text") return <MarkdownText />;
          if (part.type === "tool-call") {
            return part.toolUI ?? (
              <div className="my-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
                Инструмент <span className="font-mono">{part.toolName}</span> завершён без отдельного renderer.
              </div>
            );
          }
          return null;
        }}
      </MessagePrimitive.Parts>
      <AuiIf condition={(state) => state.message.status?.type === "running" && state.message.parts.length === 0}>
        <span className="animate-pulse text-neutral-400">●</span>
      </AuiIf>
      <MessagePrimitive.Error>
        <ErrorPrimitive.Root className="mt-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <ErrorPrimitive.Message />
        </ErrorPrimitive.Root>
      </MessagePrimitive.Error>
    </div>
    <div className="mt-1 flex items-center gap-1">
      <BranchPicker />
      <ActionBarPrimitive.Root
        hideWhenRunning
        autohide="not-last"
        className="flex items-center gap-1 text-neutral-500"
      >
        <AuiIf condition={(state) => state.message.speech == null}>
          <ActionBarPrimitive.Speak asChild>
            <button type="button" className="rounded-md p-1.5 hover:bg-neutral-100" aria-label="Прочитать вслух">
              <AudioLinesIcon className="size-3.5" />
            </button>
          </ActionBarPrimitive.Speak>
        </AuiIf>
        <AuiIf condition={(state) => state.message.speech != null}>
          <ActionBarPrimitive.StopSpeaking asChild>
            <button type="button" className="rounded-md p-1.5 hover:bg-neutral-100" aria-label="Остановить чтение">
              <StopCircleIcon className="size-3.5" />
            </button>
          </ActionBarPrimitive.StopSpeaking>
        </AuiIf>
        <ActionBarPrimitive.Copy asChild>
          <button type="button" className="rounded-md p-1.5 hover:bg-neutral-100" aria-label="Копировать">
            <AuiIf condition={(state) => state.message.isCopied}>
              <CheckIcon className="size-3.5" />
            </AuiIf>
            <AuiIf condition={(state) => !state.message.isCopied}>
              <CopyIcon className="size-3.5" />
            </AuiIf>
          </button>
        </ActionBarPrimitive.Copy>
        <ActionBarPrimitive.Reload asChild>
          <button type="button" className="rounded-md p-1.5 hover:bg-neutral-100" aria-label="Повторить">
            <RefreshCwIcon className="size-3.5" />
          </button>
        </ActionBarPrimitive.Reload>
      </ActionBarPrimitive.Root>
    </div>
  </MessagePrimitive.Root>
);

const UserMessage: FC = () => (
  <MessagePrimitive.Root className="relative ml-auto max-w-[85%] pb-5">
    <UserMessageAttachments />
    <div className="rounded-[20px] bg-neutral-100 px-4 py-2.5 text-[15px] leading-relaxed">
      <MessagePrimitive.Parts>
        {({ part }) => (part.type === "text" ? <span className="whitespace-pre-wrap">{part.text}</span> : null)}
      </MessagePrimitive.Parts>
    </div>
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="mt-1 flex justify-end text-neutral-500"
    >
      <ActionBarPrimitive.Edit asChild>
        <button type="button" className="rounded-md p-1.5 hover:bg-neutral-100" aria-label="Редактировать">
          <PencilIcon className="size-3.5" />
        </button>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  </MessagePrimitive.Root>
);

const EditComposer: FC = () => (
  <ComposerPrimitive.Root className="ml-auto w-full max-w-[85%] rounded-2xl bg-neutral-100 p-3">
    <ComposerPrimitive.Input className="min-h-20 w-full resize-none bg-transparent outline-none" />
    <div className="mt-2 flex justify-end gap-2">
      <ComposerPrimitive.Cancel asChild>
        <button type="button" className="rounded-lg px-3 py-1.5 text-xs hover:bg-neutral-200">
          Отмена
        </button>
      </ComposerPrimitive.Cancel>
      <ComposerPrimitive.Send asChild>
        <button type="button" className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs text-white">
          Создать ветку
        </button>
      </ComposerPrimitive.Send>
    </div>
  </ComposerPrimitive.Root>
);

const BranchPicker: FC = () => (
  <BranchPickerPrimitive.Root hideWhenSingleBranch className="flex items-center gap-1 text-xs text-neutral-500">
    <BranchPickerPrimitive.Previous asChild>
      <button type="button" className="rounded p-1 hover:bg-neutral-100" aria-label="Предыдущая ветка">
        <ChevronLeftIcon className="size-3.5" />
      </button>
    </BranchPickerPrimitive.Previous>
    <span>
      <BranchPickerPrimitive.Number />/<BranchPickerPrimitive.Count />
    </span>
    <BranchPickerPrimitive.Next asChild>
      <button type="button" className="rounded p-1 hover:bg-neutral-100" aria-label="Следующая ветка">
        <ChevronRightIcon className="size-3.5" />
      </button>
    </BranchPickerPrimitive.Next>
  </BranchPickerPrimitive.Root>
);
