import "../../assistant-ui-thread-list.css";
import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  SuggestionPrimitive,
  ThreadListItemPrimitive,
  ThreadListPrimitive,
  ThreadPrimitive,
  useMessageTiming
} from "@assistant-ui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  Edit3Icon,
  FileSpreadsheetIcon,
  MoreHorizontalIcon,
  PlusIcon,
  RefreshCwIcon,
  SparklesIcon,
  SquareIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  Volume2Icon,
  VolumeXIcon
} from "lucide-react";

type Props = { mobile: boolean; hasEstimate: boolean; onOpenEstimate: () => void };

function Suggestion() {
  return (
    <SuggestionPrimitive.Trigger send asChild>
      <button type="button" className="prosmet-suggestion-button">
        <SparklesIcon className="suggestion-icon" />
        <span className="prosmet-suggestion-copy"><strong><SuggestionPrimitive.Title /></strong><small><SuggestionPrimitive.Description /></small></span>
        <ArrowUpIcon />
      </button>
    </SuggestionPrimitive.Trigger>
  );
}

function ThreadHistory() {
  return (
    <div className="prosmet-threadbar" aria-label="История чатов">
      <ThreadListPrimitive.Root className="prosmet-threadlist-root">
        <ThreadListPrimitive.New className="prosmet-thread-new" aria-label="Новый чат"><PlusIcon /></ThreadListPrimitive.New>
        <ThreadListPrimitive.Items>
          {() => (
            <ThreadListItemPrimitive.Root className="prosmet-thread-item">
              <ThreadListItemPrimitive.Trigger className="prosmet-thread-trigger">
                <ThreadListItemPrimitive.Title fallback="Новый чат" />
              </ThreadListItemPrimitive.Trigger>
            </ThreadListItemPrimitive.Root>
          )}
        </ThreadListPrimitive.Items>
      </ThreadListPrimitive.Root>
    </div>
  );
}

function Composer({ mobile }: { mobile: boolean }) {
  return (
    <ComposerPrimitive.Root className={mobile ? "mobile-reference-composer" : "desktop-composer"}>
      <ComposerPrimitive.Input rows={1} placeholder={mobile ? "Спросить ProSmet…" : "Опишите, что нужно сделать…"} className="composer-input" />
      <div className="composer-actions">
        <AuiIf condition={(s) => s.composer.dictation == null}>
          <ComposerPrimitive.Dictate className="composer-action" aria-label="Диктовка"><Volume2Icon /></ComposerPrimitive.Dictate>
        </AuiIf>
        <AuiIf condition={(s) => s.composer.dictation != null}>
          <ComposerPrimitive.StopDictation className="composer-action" aria-label="Остановить диктовку"><VolumeXIcon /></ComposerPrimitive.StopDictation>
        </AuiIf>
        <AuiIf condition={(s) => !s.thread.isRunning}>
          <ComposerPrimitive.Send className={mobile ? "mobile-reference-send" : "composer-send"} aria-label="Отправить"><ArrowUpIcon /></ComposerPrimitive.Send>
        </AuiIf>
        <AuiIf condition={(s) => s.thread.isRunning}>
          <ComposerPrimitive.Cancel className={mobile ? "mobile-reference-cancel" : "composer-cancel"} aria-label="Остановить"><SquareIcon /></ComposerPrimitive.Cancel>
        </AuiIf>
      </div>
    </ComposerPrimitive.Root>
  );
}

function MessageActions() {
  const timing = useMessageTiming();
  const totalMs = timing?.totalStreamTime;
  return (
    <ActionBarPrimitive.Root hideWhenRunning autohide="not-last" autohideFloat="always" className="prosmet-message-actions">
      <ActionBarPrimitive.Copy className="prosmet-message-action" aria-label="Копировать">
        <AuiIf condition={(s) => !s.message.isCopied}><CopyIcon /></AuiIf>
        <AuiIf condition={(s) => s.message.isCopied}><CheckIcon /></AuiIf>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload className="prosmet-message-action" aria-label="Повторить"><RefreshCwIcon /></ActionBarPrimitive.Reload>
      <ActionBarPrimitive.Edit className="prosmet-message-action" aria-label="Редактировать"><Edit3Icon /></ActionBarPrimitive.Edit>
      <AuiIf condition={(s) => s.message.speech == null}>
        <ActionBarPrimitive.Speak className="prosmet-message-action" aria-label="Озвучить"><Volume2Icon /></ActionBarPrimitive.Speak>
      </AuiIf>
      <AuiIf condition={(s) => s.message.speech != null}>
        <ActionBarPrimitive.StopSpeaking className="prosmet-message-action" aria-label="Остановить озвучивание"><VolumeXIcon /></ActionBarPrimitive.StopSpeaking>
      </AuiIf>
      <ActionBarPrimitive.FeedbackPositive className="prosmet-message-action" aria-label="Полезно"><ThumbsUpIcon /></ActionBarPrimitive.FeedbackPositive>
      <ActionBarPrimitive.FeedbackNegative className="prosmet-message-action" aria-label="Не полезно"><ThumbsDownIcon /></ActionBarPrimitive.FeedbackNegative>
      <ActionBarMorePrimitive.Root>
        <ActionBarMorePrimitive.Trigger className="prosmet-message-action" aria-label="Дополнительные действия"><MoreHorizontalIcon /></ActionBarMorePrimitive.Trigger>
        <ActionBarMorePrimitive.Content side="bottom" align="end">
          <ActionBarMorePrimitive.Item asChild>
            <ActionBarPrimitive.ExportMarkdown filename="prosmet-message.md"><DownloadIcon /> Экспортировать Markdown</ActionBarPrimitive.ExportMarkdown>
          </ActionBarMorePrimitive.Item>
        </ActionBarMorePrimitive.Content>
      </ActionBarMorePrimitive.Root>
      {typeof totalMs === "number" ? <span className="prosmet-message-timing" aria-label="Время ответа">{totalMs < 1000 ? `${Math.round(totalMs)}ms` : `${(totalMs / 1000).toFixed(2)}s`}</span> : null}
    </ActionBarPrimitive.Root>
  );
}

function Messages({ hasEstimate, onOpenEstimate }: Omit<Props, "mobile">) {
  return (
    <>
      <ThreadPrimitive.Messages>
        {({ message }) => (
          <MessagePrimitive.Root className={`message ${message.role === "user" ? "user-message" : "assistant-message"}`}>
            <div className={message.role === "user" ? "user-bubble" : "assistant-copy"}><MessagePrimitive.Parts /></div>
            <MessageActions />
          </MessagePrimitive.Root>
        )}
      </ThreadPrimitive.Messages>
      {hasEstimate ? <button type="button" className="artifact-row" onClick={onOpenEstimate}><FileSpreadsheetIcon /><span><strong>Смета сохранена</strong><small>Открыть редактор</small></span><b>Открыть</b></button> : null}
    </>
  );
}

export function ChatSurface({ mobile, hasEstimate, onOpenEstimate }: Props) {
  return (
    <ThreadPrimitive.Root className={`chat-root ${mobile ? "mobile-chat mobile-reference-chat" : "desktop-chat"}`}>
      <ThreadHistory />
      <ThreadPrimitive.Viewport className={mobile ? "mobile-reference-viewport" : "chat-viewport"} turnAnchor={mobile ? "bottom" : "top"}>
        <AuiIf condition={(s) => s.thread.isEmpty}>
          <div className={mobile ? "mobile-reference-empty" : "desktop-welcome"}>
            <div className={mobile ? "mobile-reference-title" : "desktop-welcome-title"}><div className="assistant-mark"><SparklesIcon /></div><h1>Чем я могу помочь сегодня?</h1><p>Опишите строительную задачу — ProSmet подготовит расчёт и документы.</p></div>
            <ThreadPrimitive.Suggestions>{() => <Suggestion />}</ThreadPrimitive.Suggestions>
          </div>
        </AuiIf>
        <div className={mobile ? "mobile-reference-message-column" : "message-column"}><Messages hasEstimate={hasEstimate} onOpenEstimate={onOpenEstimate} /></div>
        <ThreadPrimitive.ViewportFooter className={mobile ? "mobile-reference-composer-footer" : "composer-footer"}><Composer mobile={mobile} /></ThreadPrimitive.ViewportFooter>
        <ThreadPrimitive.ScrollToBottom className="scroll-bottom" aria-label="Прокрутить вниз"><ArrowDownIcon /></ThreadPrimitive.ScrollToBottom>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}
