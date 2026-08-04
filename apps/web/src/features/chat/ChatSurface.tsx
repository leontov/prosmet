import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAui,
  useMessageTiming
} from "@assistant-ui/react";
import type { CapabilityManifest, ConstructionQuickAction } from "@prosmet/contracts";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  AudioWaveformIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  HammerIcon,
  MicIcon,
  MoreHorizontalIcon,
  PlusIcon,
  RefreshCwIcon,
  Share2Icon,
  SparklesIcon,
  SquareIcon,
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

type ActionView = ConstructionQuickAction & { icon: ReactNode };

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

function formatDuration(durationMs: number) {
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (!minutes) return `${seconds}s`;
  return `${minutes}m ${remainder}s`;
}

async function shareMarkdown(content: string) {
  if (navigator.share) {
    await navigator.share({ title: "Ответ ProSmet", text: content }).catch(() => undefined);
    return;
  }
  await navigator.clipboard?.writeText(content);
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
            {({ message }) => message.role === "user" ? <UserMessage /> : <AssistantMessage mobile={false} />}
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
            {({ message }) => message.role === "user" ? <UserMessage /> : <AssistantMessage mobile />}
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
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [utilityOpen, setUtilityOpen] = useState(false);

  useEffect(() => {
    const focusHandler = () => inputRef.current?.focus();
    const setTextHandler = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string; focus?: boolean; send?: boolean }>).detail;
      aui.composer().setText(detail?.text || "");
      if (detail?.focus !== false) window.requestAnimationFrame(() => inputRef.current?.focus());
      if (detail?.send && detail.text?.trim()) window.setTimeout(() => aui.composer().send(), 0);
    };

    window.addEventListener("prosmet:focus-composer", focusHandler);
    window.addEventListener("prosmet:set-composer-text", setTextHandler);
    return () => {
      window.removeEventListener("prosmet:focus-composer", focusHandler);
      window.removeEventListener("prosmet:set-composer-text", setTextHandler);
    };
  }, [aui]);

  const chooseUtility = useCallback((prompt: string) => {
    aui.composer().setText(prompt);
    setUtilityOpen(false);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [aui]);

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
      <ComposerPrimitive.Root compact className="mobile-reference-composer">
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
          unstable_insertNewlineOnTouchEnter
          placeholder="Опишите объект и замеры..."
          className="composer-input"
        />
        <AuiIf condition={(state) => state.composer.dictation == null}>
          <ComposerPrimitive.Dictate className="mobile-reference-microphone" aria-label="Голосовой ввод">
            <MicIcon />
          </ComposerPrimitive.Dictate>
        </AuiIf>
        <AuiIf condition={(state) => state.composer.dictation != null}>
          <ComposerPrimitive.StopDictation className="mobile-reference-microphone listening" aria-label="Остановить голосовой ввод">
            <SquareIcon />
          </ComposerPrimitive.StopDictation>
        </AuiIf>
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

function MessageTimingLabel() {
  const timing = useMessageTiming();
  if (timing?.totalStreamTime === undefined) return null;
  return <div className="mobile-response-meta">Обработка заняла {formatDuration(timing.totalStreamTime)}</div>;
}

function AssistantActionBar({ mobile }: { mobile: boolean }) {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide={mobile ? "not-last" : "always"}
      autohideFloat={mobile ? "single-branch" : "always"}
      className={mobile ? "mobile-assistant-actions" : "desktop-assistant-actions"}
      aria-label="Действия с ответом"
    >
      <ActionBarPrimitive.Copy copiedDuration={1800} aria-label="Копировать ответ">
        <CopyIcon className="action-copy-default" />
        <CheckIcon className="action-copy-complete" />
      </ActionBarPrimitive.Copy>
      <AuiIf condition={(state) => state.message.speech == null}>
        <ActionBarPrimitive.Speak aria-label="Озвучить ответ"><Volume2Icon /></ActionBarPrimitive.Speak>
      </AuiIf>
      <AuiIf condition={(state) => state.message.speech != null}>
        <ActionBarPrimitive.StopSpeaking aria-label="Остановить озвучивание"><SquareIcon /></ActionBarPrimitive.StopSpeaking>
      </AuiIf>
      <ActionBarPrimitive.FeedbackPositive aria-label="Полезный ответ"><ThumbsUpIcon /></ActionBarPrimitive.FeedbackPositive>
      <ActionBarPrimitive.FeedbackNegative aria-label="Неполезный ответ"><ThumbsDownIcon /></ActionBarPrimitive.FeedbackNegative>
      <ActionBarPrimitive.ExportMarkdown aria-label="Поделиться ответом" onExport={shareMarkdown}><Share2Icon /></ActionBarPrimitive.ExportMarkdown>
      <ActionBarMorePrimitive.Root>
        <ActionBarMorePrimitive.Trigger className="assistant-action-more" aria-label="Больше действий с ответом">
          <MoreHorizontalIcon />
        </ActionBarMorePrimitive.Trigger>
        <ActionBarMorePrimitive.Content className="mobile-assistant-more-menu" side="bottom" align="end">
          <ActionBarMorePrimitive.Item asChild>
            <ActionBarPrimitive.Reload className="assistant-action-menu-item"><RefreshCwIcon /> Повторить ответ</ActionBarPrimitive.Reload>
          </ActionBarMorePrimitive.Item>
          <ActionBarMorePrimitive.Item asChild>
            <ActionBarPrimitive.ExportMarkdown className="assistant-action-menu-item" filename="prosmet-response.md"><DownloadIcon /> Скачать Markdown</ActionBarPrimitive.ExportMarkdown>
          </ActionBarMorePrimitive.Item>
        </ActionBarMorePrimitive.Content>
      </ActionBarMorePrimitive.Root>
    </ActionBarPrimitive.Root>
  );
}

function AssistantMessage({ mobile }: { mobile: boolean }) {
  return (
    <MessagePrimitive.Root className="message assistant-message">
      <div className="assistant-avatar"><SparklesIcon /></div>
      <div className="assistant-response">
        {mobile ? <MessageTimingLabel /> : null}
        <div className="assistant-copy"><MessagePrimitive.Parts /></div>
        <AssistantActionBar mobile={mobile} />
      </div>
    </MessagePrimitive.Root>
  );
}
