"use client";

import {
  ActionBarPrimitive,
  AuiIf,
  type AssistantState,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  groupPartByType,
  MessagePrimitive,
  SuggestionPrimitive,
  ThreadPrimitive,
  useAuiState
} from "@assistant-ui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  MicIcon,
  PencilIcon,
  RefreshCwIcon,
  SparklesIcon,
  SquareIcon
} from "lucide-react";
import type { FC, ReactNode } from "react";
import {
  ComposerAddAttachment,
  ComposerAttachments,
  UserMessageAttachments
} from "@/components/assistant-ui/attachments";
import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import { cn } from "@/lib/utils";

const isNewChat = (state: AssistantState) =>
  state.thread.messages.length === 0 && (!state.thread.isLoading || state.threads.isLoading);

function IconButton({
  label,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn("prosmet-premium-message-action", className)}
      {...props}
    >
      {children}
    </button>
  );
}

export const PremiumProsmetThread: FC = () => {
  const empty = useAuiState(isNewChat);

  return (
    <ThreadPrimitive.Root
      className="aui-root flex h-full min-h-0 flex-col bg-white"
      style={{
        ["--thread-max-width" as string]: "840px",
        ["--composer-bg" as string]: "#ffffff",
        ["--composer-radius" as string]: "24px",
        ["--composer-padding" as string]: "8px"
      }}
    >
      <ThreadPrimitive.Viewport
        turnAnchor="top"
        className="prosmet-scrollbar relative flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto"
      >
        <div className={cn("mx-auto flex w-full max-w-(--thread-max-width) flex-1 flex-col px-4 sm:px-6", empty ? "justify-center pb-6 pt-12" : "pt-6")}>
          <AuiIf condition={isNewChat}><PremiumWelcome /></AuiIf>

          <div className="mb-10 flex flex-col gap-y-6 empty:hidden">
            <ThreadPrimitive.Messages>{() => <ThreadMessage />}</ThreadPrimitive.Messages>
          </div>

          <ThreadPrimitive.ViewportFooter className={cn("z-20 mt-auto flex flex-col gap-3 bg-white/95 pb-[max(14px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl", !empty && "sticky bottom-0")}>
            <ScrollToBottom />
            <PremiumComposer />
            <AuiIf condition={(state) => isNewChat(state) && state.composer.isEmpty}>
              <PremiumSuggestions />
            </AuiIf>
            <p className="px-4 text-center text-[10px] leading-4 text-neutral-400">
              Проверяйте исходные данные, цены и обязательные условия документов.
            </p>
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const PremiumWelcome: FC = () => (
  <div className="prosmet-premium-welcome" data-testid="chat-empty-state">
    <span className="prosmet-premium-welcome-mark"><SparklesIcon className="size-5" /></span>
    <h1>Что нужно посчитать?</h1>
    <p>Опишите объект обычными словами. Просметчик подготовит технологию, смету и документы.</p>
  </div>
);

const PremiumSuggestions: FC = () => (
  <div className="prosmet-premium-suggestions" data-testid="starter-suggestions">
    <ThreadPrimitive.Suggestions>
      {() => (
        <SuggestionPrimitive.Trigger send asChild>
          <button type="button" className="prosmet-premium-suggestion">
            <SuggestionPrimitive.Title className="block font-medium text-neutral-900" />
            <SuggestionPrimitive.Description className="mt-1 block text-xs leading-5 text-neutral-500" />
          </button>
        </SuggestionPrimitive.Trigger>
      )}
    </ThreadPrimitive.Suggestions>
  </div>
);

const ScrollToBottom: FC = () => (
  <ThreadPrimitive.ScrollToBottom asChild>
    <IconButton label="Прокрутить вниз" className="absolute -top-11 left-1/2 z-20 -translate-x-1/2 rounded-full border border-neutral-200 bg-white shadow-md disabled:invisible">
      <ArrowDownIcon />
    </IconButton>
  </ThreadPrimitive.ScrollToBottom>
);

const ThreadMessage: FC = () => {
  const role = useAuiState((state) => state.message.role);
  const editing = useAuiState((state) => state.message.composer.isEditing);
  if (editing) return <EditComposer />;
  return role === "user" ? <UserMessage /> : <AssistantMessage />;
};

const AssistantMessage: FC = () => (
  <MessagePrimitive.Root data-role="assistant" className="prosmet-premium-assistant-message [content-visibility:auto]">
    <div className="text-[15px] leading-7 text-neutral-900">
      <MessagePrimitive.GroupedParts
        groupBy={groupPartByType({ reasoning: ["group-reasoning"], "tool-call": ["group-tool"], "standalone-tool-call": [] })}
      >
        {({ part, children }) => {
          switch (part.type) {
            case "group-tool":
              return <div className="space-y-3">{children}</div>;
            case "group-reasoning":
              return <div className="prosmet-premium-progress-pill"><span /> Выполняю проверку</div>;
            case "text":
              return <MarkdownText />;
            case "tool-call":
              return part.toolUI ?? <ToolFallback name={part.toolName} />;
            case "data":
              return part.dataRendererUI;
            case "reasoning":
              return null;
            case "indicator":
              return <span className="animate-pulse" aria-label="Просметчик работает">●</span>;
            default:
              return null;
          }
        }}
      </MessagePrimitive.GroupedParts>
      <MessageError />
    </div>
    <div className="mt-2 flex min-h-8 items-center gap-1">
      <BranchPicker />
      <AssistantActions />
    </div>
  </MessagePrimitive.Root>
);

const ToolFallback: FC<{ name: string }> = ({ name }) => (
  <div className="my-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
    <div className="font-medium text-neutral-900">{name}</div>
    <div className="mt-1 text-xs">Просметчик готовит результат…</div>
  </div>
);

const AssistantActions: FC = () => (
  <ActionBarPrimitive.Root hideWhenRunning autohide="not-last" className="flex items-center gap-0.5 text-neutral-500">
    <ActionBarPrimitive.Copy asChild>
      <IconButton label="Копировать">
        <AuiIf condition={(state) => state.message.isCopied}><CheckIcon /></AuiIf>
        <AuiIf condition={(state) => !state.message.isCopied}><CopyIcon /></AuiIf>
      </IconButton>
    </ActionBarPrimitive.Copy>
    <ActionBarPrimitive.Reload asChild>
      <IconButton label="Повторить ответ"><RefreshCwIcon /></IconButton>
    </ActionBarPrimitive.Reload>
    <ActionBarPrimitive.ExportMarkdown asChild>
      <IconButton label="Экспорт Markdown"><DownloadIcon /></IconButton>
    </ActionBarPrimitive.ExportMarkdown>
  </ActionBarPrimitive.Root>
);

const UserMessage: FC = () => (
  <MessagePrimitive.Root data-role="user" className="prosmet-premium-user-message">
    <div className="col-span-full col-start-1"><UserMessageAttachments /></div>
    <div className="relative col-start-2 min-w-0">
      <div className="prosmet-premium-user-bubble"><MessagePrimitive.Parts /></div>
      <div className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 pr-2">
        <ActionBarPrimitive.Root hideWhenRunning autohide="not-last">
          <ActionBarPrimitive.Edit asChild><IconButton label="Редактировать запрос"><PencilIcon /></IconButton></ActionBarPrimitive.Edit>
        </ActionBarPrimitive.Root>
      </div>
    </div>
    <BranchPicker className="col-span-full col-start-1 justify-end" />
  </MessagePrimitive.Root>
);

const EditComposer: FC = () => (
  <MessagePrimitive.Root className="flex flex-col">
    <ComposerPrimitive.Root className="ml-auto flex w-full max-w-[88%] flex-col rounded-2xl border border-neutral-200 bg-white p-2 shadow-sm">
      <ComposerPrimitive.Input className="min-h-16 w-full resize-none bg-transparent px-3 py-2 text-[15px] leading-6 outline-none" autoFocus />
      <div className="flex items-center justify-end gap-2 px-1 pb-1">
        <ComposerPrimitive.Cancel asChild><button type="button" className="h-8 rounded-full px-3 text-sm text-neutral-600 hover:bg-neutral-100">Отмена</button></ComposerPrimitive.Cancel>
        <ComposerPrimitive.Send asChild><button type="button" className="h-8 rounded-full bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-black">Обновить</button></ComposerPrimitive.Send>
      </div>
    </ComposerPrimitive.Root>
  </MessagePrimitive.Root>
);

const BranchPicker: FC<{ className?: string }> = ({ className }) => (
  <BranchPickerPrimitive.Root hideWhenSingleBranch className={cn("inline-flex items-center text-xs text-neutral-500", className)}>
    <BranchPickerPrimitive.Previous asChild><IconButton label="Предыдущий вариант"><ChevronLeftIcon /></IconButton></BranchPickerPrimitive.Previous>
    <span className="min-w-9 text-center font-medium"><BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count /></span>
    <BranchPickerPrimitive.Next asChild><IconButton label="Следующий вариант"><ChevronRightIcon /></IconButton></BranchPickerPrimitive.Next>
  </BranchPickerPrimitive.Root>
);

const PremiumComposer: FC = () => (
  <ComposerPrimitive.Root className="relative flex w-full flex-col">
    <ComposerPrimitive.AttachmentDropzone asChild>
      <div className="prosmet-premium-composer">
        <ComposerAttachments />
        <ComposerPrimitive.Input
          placeholder="Опишите объект и работы"
          aria-label="Сообщение Просметчику"
          className="max-h-40 min-h-11 w-full resize-none bg-transparent px-3 py-2 text-base leading-6 outline-none placeholder:text-neutral-400"
          rows={1}
          autoFocus
          enterKeyHint="send"
        />
        <div className="flex items-center justify-between px-1 pb-0.5">
          <div className="flex items-center gap-1">
            <ComposerAddAttachment />
            <AuiIf condition={(state) => state.thread.capabilities.dictation}>
              <AuiIf condition={(state) => state.composer.dictation == null}>
                <ComposerPrimitive.Dictate asChild><IconButton label="Голосовой ввод" className="rounded-full"><MicIcon /></IconButton></ComposerPrimitive.Dictate>
              </AuiIf>
              <AuiIf condition={(state) => state.composer.dictation != null}>
                <ComposerPrimitive.StopDictation asChild><IconButton label="Остановить диктовку" className="rounded-full text-red-600"><SquareIcon /></IconButton></ComposerPrimitive.StopDictation>
              </AuiIf>
            </AuiIf>
          </div>
          <div>
            <AuiIf condition={(state) => !state.thread.isRunning}>
              <ComposerPrimitive.Send asChild><button type="button" aria-label="Отправить" className="prosmet-premium-send"><ArrowUpIcon className="size-4" /></button></ComposerPrimitive.Send>
            </AuiIf>
            <AuiIf condition={(state) => state.thread.isRunning}>
              <ComposerPrimitive.Cancel asChild><button type="button" aria-label="Остановить генерацию" className="prosmet-premium-send"><SquareIcon className="size-3.5 fill-current" /></button></ComposerPrimitive.Cancel>
            </AuiIf>
          </div>
        </div>
      </div>
    </ComposerPrimitive.AttachmentDropzone>
  </ComposerPrimitive.Root>
);

const MessageError: FC = () => (
  <MessagePrimitive.Error>
    <ErrorPrimitive.Root className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
      <ErrorPrimitive.Message />
    </ErrorPrimitive.Root>
  </MessagePrimitive.Error>
);
