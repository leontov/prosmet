import "../../assistant-ui-thread-list.css";
import { AuiIf, ComposerPrimitive, MessagePrimitive, SuggestionPrimitive, ThreadListItemPrimitive, ThreadListPrimitive, ThreadPrimitive } from "@assistant-ui/react";
import { ArrowDownIcon, ArrowUpIcon, FileSpreadsheetIcon, PlusIcon, SparklesIcon, SquareIcon } from "lucide-react";

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
        <ThreadListPrimitive.New className="prosmet-thread-new"><PlusIcon /></ThreadListPrimitive.New>
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
      <AuiIf condition={(s) => !s.thread.isRunning}>
        <ComposerPrimitive.Send className={mobile ? "mobile-reference-send" : "composer-send"} aria-label="Отправить"><ArrowUpIcon /></ComposerPrimitive.Send>
      </AuiIf>
      <AuiIf condition={(s) => s.thread.isRunning}>
        <ComposerPrimitive.Cancel className={mobile ? "mobile-reference-cancel" : "composer-cancel"} aria-label="Остановить"><SquareIcon /></ComposerPrimitive.Cancel>
      </AuiIf>
    </ComposerPrimitive.Root>
  );
}

function Messages({ hasEstimate, onOpenEstimate }: Omit<Props, "mobile">) {
  return (
    <>
      <ThreadPrimitive.Messages>
        {({ message }) => (
          <MessagePrimitive.Root className={`message ${message.role === "user" ? "user-message" : "assistant-message"}`}>
            <div className={message.role === "user" ? "user-bubble" : "assistant-copy"}><MessagePrimitive.Parts /></div>
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
