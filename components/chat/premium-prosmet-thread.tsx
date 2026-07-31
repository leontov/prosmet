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
  ArrowRightIcon,
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
      className={cn("prosmet-v2-message-action", className)}
      {...props}
    >
      {children}
    </button>
  );
}

export const PremiumProsmetThread: FC = () => {
  const empty = useAuiState(isNewChat);

  return (
    <ThreadPrimitive.Root className="prosmet-v2-thread-root">
      <ThreadPrimitive.Viewport turnAnchor="top" className="prosmet-v2-thread-viewport prosmet-scrollbar">
        <div className={cn("prosmet-v2-thread-inner", empty && "is-empty")}>
          <AuiIf condition={isNewChat}><PremiumWelcome /></AuiIf>

          <div className="prosmet-v2-message-list empty:hidden">
            <ThreadPrimitive.Messages>{() => <ThreadMessage />}</ThreadPrimitive.Messages>
          </div>

          <ThreadPrimitive.ViewportFooter className={cn("prosmet-v2-composer-dock", empty && "is-empty")}>
            <ScrollToBottom />
            <PremiumComposer />
            <AuiIf condition={(state) => isNewChat(state) && state.composer.isEmpty}>
              <PremiumSuggestions />
            </AuiIf>
            <p className="prosmet-v2-composer-note">ИИ подготовит черновик. Финальные объёмы, цены и условия утверждает пользователь.</p>
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const PremiumWelcome: FC = () => (
  <section className="prosmet-v2-welcome" data-testid="chat-empty-state">
    <span className="prosmet-v2-welcome-mark"><SparklesIcon /></span>
    <div className="prosmet-v2-welcome-copy">
      <h1>Что нужно посчитать?</h1>
      <p>Опишите объект своими словами. Из одного диалога появятся технология, смета и готовые документы.</p>
    </div>
  </section>
);

const PremiumSuggestions: FC = () => (
  <div className="prosmet-v2-suggestions" data-testid="starter-suggestions">
    <ThreadPrimitive.Suggestions>
      {() => (
        <SuggestionPrimitive.Trigger send asChild>
          <button type="button" className="prosmet-v2-suggestion">
            <span className="prosmet-v2-suggestion-index" aria-hidden="true" />
            <span className="prosmet-v2-suggestion-copy">
              <SuggestionPrimitive.Title className="prosmet-v2-suggestion-title" />
              <SuggestionPrimitive.Description className="prosmet-v2-suggestion-description" />
            </span>
            <span className="prosmet-v2-suggestion-arrow"><ArrowRightIcon /></span>
          </button>
        </SuggestionPrimitive.Trigger>
      )}
    </ThreadPrimitive.Suggestions>
  </div>
);

const ScrollToBottom: FC = () => (
  <ThreadPrimitive.ScrollToBottom asChild>
    <IconButton label="Прокрутить вниз" className="prosmet-v2-scroll-bottom">
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
  <MessagePrimitive.Root data-role="assistant" className="prosmet-v2-assistant-message [content-visibility:auto]">
    <div className="prosmet-v2-assistant-content">
      <MessagePrimitive.GroupedParts
        groupBy={groupPartByType({ reasoning: ["group-reasoning"], "tool-call": ["group-tool"], "standalone-tool-call": [] })}
      >
        {({ part, children }) => {
          switch (part.type) {
            case "group-tool":
              return <div className="prosmet-v2-tool-stack">{children}</div>;
            case "group-reasoning":
              return <div className="prosmet-v2-progress"><span /> Проверяю исходные данные</div>;
            case "text":
              return <MarkdownText />;
            case "tool-call":
              return part.toolUI ?? <ToolFallback name={part.toolName} />;
            case "data":
              return part.dataRendererUI;
            case "reasoning":
              return null;
            case "indicator":
              return <span className="prosmet-v2-typing" aria-label="Просметчик работает"><i /><i /><i /></span>;
            default:
              return null;
          }
        }}
      </MessagePrimitive.GroupedParts>
      <MessageError />
    </div>
    <div className="prosmet-v2-assistant-footer">
      <BranchPicker />
      <AssistantActions />
    </div>
  </MessagePrimitive.Root>
);

const ToolFallback: FC<{ name: string }> = ({ name }) => (
  <div className="prosmet-v2-tool-fallback">
    <span><SparklesIcon /></span>
    <div><strong>{name}</strong><small>Формирую результат…</small></div>
  </div>
);

const AssistantActions: FC = () => (
  <ActionBarPrimitive.Root hideWhenRunning autohide="not-last" className="prosmet-v2-assistant-actions">
    <ActionBarPrimitive.Copy asChild>
      <IconButton label="Копировать">
        <AuiIf condition={(state) => state.message.isCopied}><CheckIcon /></AuiIf>
        <AuiIf condition={(state) => !state.message.isCopied}><CopyIcon /></AuiIf>
      </IconButton>
    </ActionBarPrimitive.Copy>
    <ActionBarPrimitive.Reload asChild><IconButton label="Повторить ответ"><RefreshCwIcon /></IconButton></ActionBarPrimitive.Reload>
    <ActionBarPrimitive.ExportMarkdown asChild><IconButton label="Экспорт Markdown"><DownloadIcon /></IconButton></ActionBarPrimitive.ExportMarkdown>
  </ActionBarPrimitive.Root>
);

const UserMessage: FC = () => (
  <MessagePrimitive.Root data-role="user" className="prosmet-v2-user-message">
    <div className="col-span-full"><UserMessageAttachments /></div>
    <div className="prosmet-v2-user-bubble-wrap">
      <div className="prosmet-v2-user-bubble"><MessagePrimitive.Parts /></div>
      <ActionBarPrimitive.Root hideWhenRunning autohide="not-last" className="prosmet-v2-user-actions">
        <ActionBarPrimitive.Edit asChild><IconButton label="Редактировать запрос"><PencilIcon /></IconButton></ActionBarPrimitive.Edit>
      </ActionBarPrimitive.Root>
    </div>
    <BranchPicker className="col-span-full justify-end" />
  </MessagePrimitive.Root>
);

const EditComposer: FC = () => (
  <MessagePrimitive.Root className="prosmet-v2-edit-message">
    <ComposerPrimitive.Root className="prosmet-v2-edit-composer">
      <ComposerPrimitive.Input className="prosmet-v2-edit-input" autoFocus />
      <div className="prosmet-v2-edit-actions">
        <ComposerPrimitive.Cancel asChild><button type="button">Отмена</button></ComposerPrimitive.Cancel>
        <ComposerPrimitive.Send asChild><button type="button" className="is-primary">Обновить</button></ComposerPrimitive.Send>
      </div>
    </ComposerPrimitive.Root>
  </MessagePrimitive.Root>
);

const BranchPicker: FC<{ className?: string }> = ({ className }) => (
  <BranchPickerPrimitive.Root hideWhenSingleBranch className={cn("prosmet-v2-branch-picker", className)}>
    <BranchPickerPrimitive.Previous asChild><IconButton label="Предыдущий вариант"><ChevronLeftIcon /></IconButton></BranchPickerPrimitive.Previous>
    <span><BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count /></span>
    <BranchPickerPrimitive.Next asChild><IconButton label="Следующий вариант"><ChevronRightIcon /></IconButton></BranchPickerPrimitive.Next>
  </BranchPickerPrimitive.Root>
);

const PremiumComposer: FC = () => (
  <ComposerPrimitive.Root className="prosmet-v2-composer-root">
    <ComposerPrimitive.AttachmentDropzone asChild>
      <div className="prosmet-v2-composer">
        <ComposerAttachments />
        <ComposerPrimitive.Input
          placeholder="Опишите объект и работы"
          aria-label="Сообщение Просметчику"
          className="prosmet-v2-composer-input"
          rows={1}
          autoFocus
          enterKeyHint="send"
        />
        <div className="prosmet-v2-composer-actions">
          <div className="prosmet-v2-composer-tools">
            <ComposerAddAttachment />
            <AuiIf condition={(state) => state.thread.capabilities.dictation}>
              <AuiIf condition={(state) => state.composer.dictation == null}>
                <ComposerPrimitive.Dictate asChild><IconButton label="Голосовой ввод"><MicIcon /></IconButton></ComposerPrimitive.Dictate>
              </AuiIf>
              <AuiIf condition={(state) => state.composer.dictation != null}>
                <ComposerPrimitive.StopDictation asChild><IconButton label="Остановить диктовку" className="text-red-600"><SquareIcon /></IconButton></ComposerPrimitive.StopDictation>
              </AuiIf>
            </AuiIf>
          </div>
          <div>
            <AuiIf condition={(state) => !state.thread.isRunning}>
              <ComposerPrimitive.Send asChild><button type="button" aria-label="Отправить" className="prosmet-v2-send"><ArrowUpIcon /></button></ComposerPrimitive.Send>
            </AuiIf>
            <AuiIf condition={(state) => state.thread.isRunning}>
              <ComposerPrimitive.Cancel asChild><button type="button" aria-label="Остановить генерацию" className="prosmet-v2-send"><SquareIcon className="fill-current" /></button></ComposerPrimitive.Cancel>
            </AuiIf>
          </div>
        </div>
      </div>
    </ComposerPrimitive.AttachmentDropzone>
  </ComposerPrimitive.Root>
);

const MessageError: FC = () => (
  <MessagePrimitive.Error>
    <ErrorPrimitive.Root className="prosmet-v2-message-error"><ErrorPrimitive.Message /></ErrorPrimitive.Root>
  </MessagePrimitive.Error>
);
