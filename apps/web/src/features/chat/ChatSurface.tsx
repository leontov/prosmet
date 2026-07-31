import {
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive
} from "@assistant-ui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  FileSpreadsheetIcon,
  HammerIcon,
  HouseIcon,
  PaperclipIcon,
  SparklesIcon
} from "lucide-react";

type Props = {
  mobile: boolean;
  hasEstimate: boolean;
  onOpenEstimate: () => void;
};

const suggestions = [
  { title: "Смета на ремонт квартиры", prompt: "Составь смету на ремонт квартиры с работами и материалами", icon: <HouseIcon /> },
  { title: "Механизированная штукатурка", prompt: "Рассчитай механизированную штукатурку 358 м² в Казани", icon: <HammerIcon /> },
  { title: "Комплект документов", prompt: "Подготовь смету, коммерческое предложение и договор", icon: <FileSpreadsheetIcon /> }
];

export function ChatSurface({ mobile, hasEstimate, onOpenEstimate }: Props) {
  return mobile
    ? <MobileChat hasEstimate={hasEstimate} onOpenEstimate={onOpenEstimate} />
    : <DesktopChat hasEstimate={hasEstimate} onOpenEstimate={onOpenEstimate} />;
}

function DesktopChat({ hasEstimate, onOpenEstimate }: Omit<Props, "mobile">) {
  return (
    <ThreadPrimitive.Root className="chat-root desktop-chat" data-testid="desktop-chat">
      <ThreadPrimitive.Viewport turnAnchor="top" className="chat-viewport">
        <AuiIf condition={(state) => state.thread.isEmpty}>
          <div className="desktop-welcome">
            <div className="assistant-mark"><SparklesIcon /></div>
            <h1>Что нужно сделать?</h1>
            <p>Опишите объект обычными словами. Я соберу исходные данные, подготовлю расчёт и открою результат как редактируемый документ.</p>
            <div className="desktop-suggestions">
              {suggestions.map((item) => (
                <ThreadPrimitive.Suggestion key={item.title} prompt={item.prompt} send className="suggestion-card">
                  <span className="suggestion-icon">{item.icon}</span>
                  <span><strong>{item.title}</strong><small>{item.prompt}</small></span>
                  <ArrowUpIcon />
                </ThreadPrimitive.Suggestion>
              ))}
            </div>
          </div>
        </AuiIf>

        <div className="message-column">
          <ThreadPrimitive.Messages>
            {({ message }) => message.role === "user" ? <UserMessage /> : <AssistantMessage />}
          </ThreadPrimitive.Messages>
          {hasEstimate ? (
            <button type="button" className="artifact-row" onClick={onOpenEstimate}>
              <span><FileSpreadsheetIcon /></span>
              <span><strong>Рабочая смета готова</strong><small>Открыть документ, изменить позиции и итог</small></span>
              <b>Открыть</b>
            </button>
          ) : null}
        </div>

        <ThreadPrimitive.ViewportFooter className="composer-footer">
          <Composer mobile={false} />
        </ThreadPrimitive.ViewportFooter>
        <ThreadPrimitive.ScrollToBottom className="scroll-bottom" aria-label="Прокрутить вниз"><ArrowDownIcon /></ThreadPrimitive.ScrollToBottom>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}

function MobileChat({ hasEstimate, onOpenEstimate }: Omit<Props, "mobile">) {
  return (
    <ThreadPrimitive.Root className="chat-root mobile-chat" data-testid="mobile-chat">
      <ThreadPrimitive.Viewport className="mobile-chat-viewport">
        <AuiIf condition={(state) => state.thread.isEmpty}>
          <div className="mobile-welcome">
            <div className="mobile-welcome-mark"><SparklesIcon /></div>
            <h1>Новый расчёт</h1>
            <p>Опишите объект или выберите задачу.</p>
            <div className="mobile-suggestions">
              {suggestions.map((item) => (
                <ThreadPrimitive.Suggestion key={item.title} prompt={item.prompt} send className="mobile-suggestion">
                  <span className="mobile-suggestion-icon">{item.icon}</span>
                  <span><strong>{item.title}</strong><small>{item.prompt}</small></span>
                  <ArrowUpIcon />
                </ThreadPrimitive.Suggestion>
              ))}
            </div>
          </div>
        </AuiIf>

        <div className="mobile-message-column">
          <ThreadPrimitive.Messages>
            {({ message }) => message.role === "user" ? <UserMessage /> : <AssistantMessage />}
          </ThreadPrimitive.Messages>
          {hasEstimate ? (
            <button type="button" className="mobile-artifact" onClick={onOpenEstimate}>
              <span><FileSpreadsheetIcon /></span>
              <span><strong>Смета готова</strong><small>Открыть и проверить расчёт</small></span>
              <b>Открыть</b>
            </button>
          ) : null}
        </div>

        <ThreadPrimitive.ViewportFooter className="mobile-composer-footer">
          <Composer mobile />
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}

function Composer({ mobile }: { mobile: boolean }) {
  return (
    <ComposerPrimitive.Root className={mobile ? "mobile-composer" : "desktop-composer"}>
      <button type="button" className="composer-attach" aria-label="Прикрепить файл"><PaperclipIcon /></button>
      <ComposerPrimitive.Input
        id={mobile ? "mobile-message" : "desktop-message"}
        name={mobile ? "mobile-message" : "desktop-message"}
        rows={1}
        placeholder={mobile ? "Сообщение Просметчику" : "Опишите объект или задачу"}
        className="composer-input"
      />
      <ComposerPrimitive.Send className="composer-send" aria-label="Отправить"><ArrowUpIcon /></ComposerPrimitive.Send>
    </ComposerPrimitive.Root>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="message user-message">
      <div className="user-bubble"><MessagePrimitive.Parts /></div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="message assistant-message">
      <div className="assistant-avatar"><SparklesIcon /></div>
      <div className="assistant-copy"><MessagePrimitive.Parts /></div>
    </MessagePrimitive.Root>
  );
}
