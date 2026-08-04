import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAui,
  useAuiState
} from "@assistant-ui/react";
import type { CapabilityManifest, ConstructionQuickAction } from "@prosmet/contracts";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  AudioWaveformIcon,
  CopyIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  HammerIcon,
  MicIcon,
  MoreHorizontalIcon,
  PlusIcon,
  Share2Icon,
  SparklesIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  Volume2Icon,
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

type ActionView = ConstructionQuickAction & { icon: ReactNode };

let latestResponseTimingMs: number | null = null;

const fallbackActions: ConstructionQuickAction[] = [
  {
    id: "create-estimate",
    title: "Составить смету",
    prompt: "Составь строительную смету. Сначала уточни недостающие исходные данные, затем сформируй технологическую карту, исследуй актуальные цены и создай редактируемую смету.",
    artifactType: "estimate"
  },
  {
    id: "calculate-measurements",
    title: "Рассчитать по замерам",
    prompt: "Рассчитай объёмы работ и материалов по моим замерам, затем создай смету с ценами, источниками и итогами.",
    artifactType: "estimate"
  },
  {
    id: "prepare-documents",
    title: "Подготовить документы",
    prompt: "На основании сметы подготовь комплект строительных документов: коммерческое предложение, договор, акт и счёт.",
    artifactType: "document-set"
  }
];

function actionIcon(id: ConstructionQuickAction["id"]) {
  if (id === "create-estimate") return <FileSpreadsheetIcon />;
  if (id === "calculate-measurements") return <HammerIcon />;
  return <FileTextIcon />;
}

function useConstructionActions(): ActionView[] {
  const [actions, setActions] = useState<ConstructionQuickAction[]>(fallbackActions);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/capabilities", { cache: "no-store", credentials: "same-origin" })
      .then((response) => response.ok ? response.json() as Promise<CapabilityManifest> : Promise.reject(new Error("capabilities unavailable")))
      .then((manifest) => {
        if (!cancelled && Array.isArray(manifest.quickActions) && manifest.quickActions.length) {
          setActions(manifest.quickActions);
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  return actions.map((action) => ({ ...action, icon: actionIcon(action.id) }));
}

function useResponseTiming() {
  const [durationMs, setDurationMs] = useState<number | null>(latestResponseTimingMs);

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ durationMs?: number }>).detail;
      const next = typeof detail?.durationMs === "number" ? Math.max(0, detail.durationMs) : null;
      latestResponseTimingMs = next;
      setDurationMs(next);
    };
    window.addEventListener("prosmet:response-timing", listener);
    return () => window.removeEventListener("prosmet:response-timing", listener);
  }, []);

  return durationMs;
}

function formatDuration(durationMs: number) {
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (!minutes) return `${seconds}s`;
  return `${minutes}m ${remainder}s`;
}

async function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function ChatSurface({ mobile, hasEstimate, onOpenEstimate }: Props) {
  const actions = useConstructionActions();
  return mobile
    ? <MobileChat actions={actions} hasEstimate={hasEstimate} onOpenEstimate={onOpenEstimate} />
    : <DesktopChat actions={actions} hasEstimate={hasEstimate} onOpenEstimate={onOpenEstimate} />;
}

function DesktopChat({ actions, hasEstimate, onOpenEstimate }: Omit<Props, "mobile"> & { actions: ActionView[] }) {
  return (
    <ThreadPrimitive.Root className="chat-root desktop-chat" data-testid="desktop-chat">
      <ThreadPrimitive.Viewport turnAnchor="top" className="chat-viewport">
        <AuiIf condition={(state) => state.thread.isEmpty}>
          <div className="desktop-welcome">
            <div className="assistant-mark"><SparklesIcon /></div>
            <h1>Что нужно рассчитать?</h1>
            <p>Опишите объект обычными словами. Агент соберёт исходные данные, сформирует технологическую карту, проверит цены и сохранит результат в базе как редактируемую смету.</p>
            <div className="desktop-suggestions">
              {actions.map((item) => (
                <ThreadPrimitive.Suggestion key={item.id} prompt={item.prompt} send className="suggestion-card">
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
              <span><strong>Смета сохранена в базе</strong><small>Открыть документ, изменить позиции и итог</small></span>
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

function MobileChat({ actions, hasEstimate, onOpenEstimate }: Omit<Props, "mobile"> & { actions: ActionView[] }) {
  return (
    <ThreadPrimitive.Root className="chat-root mobile-chat mobile-reference-chat" data-testid="mobile-chat">
      <ThreadPrimitive.Viewport className="mobile-reference-viewport">
        <AuiIf condition={(state) => state.thread.isEmpty}>
          <div className="mobile-reference-empty" data-testid="mobile-reference-start">
            <div className="mobile-reference-space" aria-hidden="true" />
            <div className="mobile-reference-actions" aria-label="Быстрые действия">
              {actions.map((item) => (
                <ThreadPrimitive.Suggestion
                  key={item.id}
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
              <span><strong>Смета сохранена</strong><small>Открыть редактор и проверить расчёт</small></span>
              <b>Открыть</b>
            </button>
          ) : null}
        </div>

        <ThreadPrimitive.ViewportFooter className="mobile-reference-composer-footer">
          <MobileComposer actions={actions} />
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
        placeholder="Опишите объект, работы и замеры"
        className="composer-input"
      />
      <ComposerPrimitive.Send className="composer-send" aria-label="Отправить"><ArrowUpIcon /></ComposerPrimitive.Send>
    </ComposerPrimitive.Root>
  );
}

function MobileComposer({ actions }: { actions: ActionView[] }) {
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
    const startVoiceHandler = () => startVoice();
    const focusHandler = () => inputRef.current?.focus();
    const setTextHandler = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string; focus?: boolean; send?: boolean }>).detail;
      aui.composer().setText(detail?.text || "");
      if (detail?.focus !== false) window.requestAnimationFrame(() => inputRef.current?.focus());
      if (detail?.send && detail.text?.trim()) window.setTimeout(() => aui.composer().send(), 0);
    };

    window.addEventListener("prosmet:start-voice", startVoiceHandler);
    window.addEventListener("prosmet:focus-composer", focusHandler);
    window.addEventListener("prosmet:set-composer-text", setTextHandler);
    return () => {
      window.removeEventListener("prosmet:start-voice", startVoiceHandler);
      window.removeEventListener("prosmet:focus-composer", focusHandler);
      window.removeEventListener("prosmet:set-composer-text", setTextHandler);
      recognitionRef.current?.stop();
    };
  }, [aui, startVoice]);

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
          {actions.map((item) => (
            <button key={item.id} type="button" onClick={() => chooseUtility(item.prompt)}>
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
          placeholder="Опишите объект и замеры..."
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
  const copyRef = useRef<HTMLDivElement | null>(null);
  const durationMs = useResponseTiming();
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const text = () => copyRef.current?.innerText.trim() || "";

  const copy = async () => {
    const value = text();
    if (value) await copyToClipboard(value);
    setMoreOpen(false);
  };

  const speak = () => {
    const value = text();
    if (!value || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(value);
    utterance.lang = "ru-RU";
    window.speechSynthesis.speak(utterance);
  };

  const share = async () => {
    const value = text();
    if (!value) return;
    if (navigator.share) {
      await navigator.share({ title: "Ответ ProSmet", text: value }).catch(() => undefined);
    } else {
      await copyToClipboard(value);
    }
    setMoreOpen(false);
  };

  return (
    <MessagePrimitive.Root className="message assistant-message">
      <div className="assistant-avatar"><SparklesIcon /></div>
      <div className="assistant-response">
        {durationMs !== null ? <div className="mobile-response-meta">Обработка заняла {formatDuration(durationMs)}</div> : null}
        <div ref={copyRef} className="assistant-copy"><MessagePrimitive.Parts /></div>
        <div className="mobile-assistant-actions" aria-label="Действия с ответом">
          <button type="button" aria-label="Копировать ответ" onClick={() => void copy()}><CopyIcon /></button>
          <button type="button" aria-label="Озвучить ответ" onClick={speak}><Volume2Icon /></button>
          <button type="button" aria-label="Полезный ответ" aria-pressed={feedback === "up"} onClick={() => setFeedback((value) => value === "up" ? null : "up")}><ThumbsUpIcon /></button>
          <button type="button" aria-label="Неполезный ответ" aria-pressed={feedback === "down"} onClick={() => setFeedback((value) => value === "down" ? null : "down")}><ThumbsDownIcon /></button>
          <button type="button" aria-label="Поделиться ответом" onClick={() => void share()}><Share2Icon /></button>
          <button type="button" aria-label="Больше действий с ответом" aria-expanded={moreOpen} onClick={() => setMoreOpen((value) => !value)}><MoreHorizontalIcon /></button>
          {moreOpen ? (
            <div className="mobile-assistant-more-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => void copy()}>Копировать</button>
              <button type="button" role="menuitem" onClick={() => void share()}>Поделиться</button>
            </div>
          ) : null}
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}
