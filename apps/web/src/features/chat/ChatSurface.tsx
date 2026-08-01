import { useCallback, useEffect, useRef, useState } from "react";
import {
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAui,
  useAuiState
} from "@assistant-ui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  AudioWaveformIcon,
  FileSpreadsheetIcon,
  Globe2Icon,
  HammerIcon,
  HouseIcon,
  ImageIcon,
  MicIcon,
  PenLineIcon,
  PlusIcon,
  SparklesIcon,
  XIcon
} from "lucide-react";

type Props = {
  mobile: boolean;
  hasEstimate: boolean;
  onOpenEstimate: () => void;
};

type SpeechRecognitionResultEventLike = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const suggestions = [
  { title: "Смета на ремонт квартиры", prompt: "Составь смету на ремонт квартиры с работами и материалами", icon: <HouseIcon /> },
  { title: "Механизированная штукатурка", prompt: "Рассчитай механизированную штукатурку 358 м² в Казани", icon: <HammerIcon /> },
  { title: "Комплект документов", prompt: "Подготовь смету, коммерческое предложение и договор", icon: <FileSpreadsheetIcon /> }
];

const mobileQuickActions = [
  {
    title: "Создать изображение",
    prompt: "Создай наглядную визуализацию строительного решения для моего объекта",
    icon: <ImageIcon />
  },
  {
    title: "Напиши или отредактируй",
    prompt: "Помоги написать или отредактировать документ по моему проекту",
    icon: <PenLineIcon />
  },
  {
    title: "Искать в интернете",
    prompt: "Найди в интернете актуальные цены и источники для моей сметы",
    icon: <Globe2Icon />
  }
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
            <p>Опишите объект обычными словами. Подключённый агент подготовит расчёт и откроет результат как редактируемый документ.</p>
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
          <DesktopComposer />
        </ThreadPrimitive.ViewportFooter>
        <ThreadPrimitive.ScrollToBottom className="scroll-bottom" aria-label="Прокрутить вниз"><ArrowDownIcon /></ThreadPrimitive.ScrollToBottom>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}

function MobileChat({ hasEstimate, onOpenEstimate }: Omit<Props, "mobile">) {
  return (
    <ThreadPrimitive.Root className="chat-root mobile-chat mobile-reference-chat" data-testid="mobile-chat">
      <ThreadPrimitive.Viewport className="mobile-reference-viewport">
        <AuiIf condition={(state) => state.thread.isEmpty}>
          <div className="mobile-reference-empty" data-testid="mobile-reference-start">
            <div className="mobile-reference-space" aria-hidden="true" />
            <div className="mobile-reference-actions" aria-label="Быстрые действия">
              {mobileQuickActions.map((item) => (
                <ThreadPrimitive.Suggestion
                  key={item.title}
                  prompt={item.prompt}
                  send
                  className="mobile-reference-action"
                >
                  <span className="mobile-reference-action-icon">{item.icon}</span>
                  <span>{item.title}</span>
                </ThreadPrimitive.Suggestion>
              ))}
            </div>
          </div>
        </AuiIf>

        <div className="mobile-reference-message-column">
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

        <ThreadPrimitive.ViewportFooter className="mobile-reference-composer-footer">
          <MobileComposer />
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}

function DesktopComposer() {
  return (
    <ComposerPrimitive.Root className="desktop-composer no-attachment-composer">
      <ComposerPrimitive.Input
        id="desktop-message"
        name="desktop-message"
        rows={1}
        placeholder="Опишите объект или задачу"
        className="composer-input"
      />
      <ComposerPrimitive.Send className="composer-send" aria-label="Отправить"><ArrowUpIcon /></ComposerPrimitive.Send>
    </ComposerPrimitive.Root>
  );
}

function MobileComposer() {
  const aui = useAui();
  const text = useAuiState((state) => state.composer.text);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [utilityOpen, setUtilityOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const startVoice = useCallback(() => {
    setVoiceError(null);
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = (speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition) as unknown as SpeechRecognitionConstructor | undefined;
    if (!Recognition) {
      setVoiceError("Голосовой ввод не поддерживается этим браузером");
      inputRef.current?.focus();
      return;
    }

    recognitionRef.current?.stop();
    const recognition = new Recognition() as SpeechRecognitionLike;
    recognition.lang = "ru-RU";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event: SpeechRecognitionResultEventLike) => {
      let transcript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        transcript += event.results[index]?.[0]?.transcript ?? "";
      }
      if (transcript.trim()) {
        const prefix = text.trim() ? `${text.trim()} ` : "";
        aui.composer().setText(`${prefix}${transcript.trim()}`);
      }
    };
    recognition.onerror = () => {
      setVoiceError("Не удалось распознать речь");
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
      inputRef.current?.focus();
    };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }, [aui, text]);

  useEffect(() => {
    const handler = () => startVoice();
    window.addEventListener("prosmet:start-voice", handler);
    return () => {
      window.removeEventListener("prosmet:start-voice", handler);
      recognitionRef.current?.stop();
    };
  }, [startVoice]);

  const chooseUtility = (prompt: string) => {
    aui.composer().setText(prompt);
    setUtilityOpen(false);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className="mobile-reference-composer-wrap">
      {utilityOpen ? (
        <div className="mobile-reference-utility" role="dialog" aria-label="Быстрые действия">
          <button type="button" className="mobile-reference-utility-close" aria-label="Закрыть" onClick={() => setUtilityOpen(false)}><XIcon /></button>
          {mobileQuickActions.map((item) => (
            <button key={item.title} type="button" onClick={() => chooseUtility(item.prompt)}>
              <span>{item.icon}</span>
              <strong>{item.title}</strong>
            </button>
          ))}
        </div>
      ) : null}
      {voiceError ? <div className="mobile-reference-voice-error" role="status">{voiceError}</div> : null}
      <ComposerPrimitive.Root className="mobile-reference-composer">
        <button
          type="button"
          className="mobile-reference-plus"
          aria-label="Добавить"
          aria-expanded={utilityOpen}
          onClick={() => setUtilityOpen((open) => !open)}
        >
          <PlusIcon />
        </button>
        <ComposerPrimitive.Input
          ref={inputRef}
          id="mobile-message"
          name="mobile-message"
          rows={1}
          placeholder="Спросить Chat..."
          className="composer-input"
        />
        <button
          type="button"
          className={listening ? "mobile-reference-microphone listening" : "mobile-reference-microphone"}
          aria-label={listening ? "Остановить голосовой ввод" : "Голосовой ввод"}
          onClick={() => listening ? recognitionRef.current?.stop() : startVoice()}
        >
          <MicIcon />
        </button>
        <ComposerPrimitive.Send className="mobile-reference-send" aria-label="Отправить">
          <AudioWaveformIcon />
        </ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </div>
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
