from __future__ import annotations

from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    source = path.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one target, found {count}")
    path.write_text(source.replace(old, new, 1), encoding="utf-8")


# ProfessionalApp: protect keyboard handling, throttle drawer motion, and move focus before hiding it.
professional = Path("apps/web/src/app/ProfessionalApp.tsx")
replace_once(
    professional,
    '  type PointerEvent as ReactPointerEvent,\n  type ReactNode\n',
    '  type PointerEvent as ReactPointerEvent,\n  type ReactNode,\n  type RefObject\n',
    "ProfessionalApp RefObject import",
)
replace_once(
    professional,
    '      const key = event.key.toLowerCase();',
    '      const key = typeof event.key === "string" ? event.key.toLowerCase() : "";',
    "ProfessionalApp safe KeyboardEvent key",
)
replace_once(
    professional,
    '''  const progressRef = useRef(0);
  const gestureRef = useRef<{ mode: "open" | "close"; pointerId: number; startX: number; startedAt: number } | null>(null);
  const drawerWidth = Math.min(334, Math.max(292, viewportWidth * 0.84));''',
    '''  const progressRef = useRef(0);
  const pendingProgressRef = useRef(0);
  const dragFrameRef = useRef<number | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const gestureRef = useRef<{ mode: "open" | "close"; pointerId: number; startX: number; startedAt: number } | null>(null);
  const drawerWidth = Math.min(334, Math.max(292, viewportWidth * 0.84));''',
    "Mobile drawer refs",
)
replace_once(
    professional,
    '''  useEffect(() => {
    const update = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const navigate = (next: WorkspaceView) => {
    onView(next);
    setOpen(false);
    setDrag(null);
  };''',
    '''  useEffect(() => {
    const update = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => () => {
    if (dragFrameRef.current !== null) cancelAnimationFrame(dragFrameRef.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => closeButtonRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const returnFocusFromDrawer = useCallback(() => {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && drawerRef.current?.contains(focused)) {
      menuButtonRef.current?.focus({ preventScroll: true });
    }
  }, []);

  const closeDrawer = useCallback(() => {
    returnFocusFromDrawer();
    setOpen(false);
    setDrag(null);
  }, [returnFocusFromDrawer]);

  const openDrawer = useCallback(() => {
    setOpen(true);
    setDrag(null);
  }, []);

  const navigate = (next: WorkspaceView) => {
    onView(next);
    closeDrawer();
  };''',
    "Mobile drawer focus lifecycle",
)
replace_once(
    professional,
    '''    const next = gesture.mode === "open" ? clamp(delta / drawerWidth) : clamp(1 + delta / drawerWidth);
    progressRef.current = next;
    setDrag(next);
    if (Math.abs(delta) > 4) event.preventDefault();''',
    '''    const next = gesture.mode === "open" ? clamp(delta / drawerWidth) : clamp(1 + delta / drawerWidth);
    pendingProgressRef.current = next;
    progressRef.current = next;
    if (dragFrameRef.current === null) {
      dragFrameRef.current = requestAnimationFrame(() => {
        dragFrameRef.current = null;
        setDrag(pendingProgressRef.current);
      });
    }
    if (Math.abs(delta) > 4) event.preventDefault();''',
    "Mobile drawer requestAnimationFrame throttle",
)
replace_once(
    professional,
    '''    gestureRef.current = null;
    setOpen(nextOpen);
    setDrag(null);
  };

  return (
    <div className="pro-mobile-root" style={{ "--pro-drawer-width": `${drawerWidth}px`, "--pro-drawer-progress": progress } as CSSProperties}>
      <aside
        className="pro-mobile-drawer"
        role="dialog"
        aria-modal={open}
        aria-label="Навигация"
        aria-hidden={progress <= 0.001}
        style={{ transform: `translate3d(${-drawerWidth * (1 - progress)}px,0,0)` }}
      >
        <header><div><span><SparklesIcon /></span><strong>Просметчик</strong></div><button type="button" onClick={() => setOpen(false)} aria-label="Закрыть"><XIcon /></button></header>''',
    '''    gestureRef.current = null;
    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    if (nextOpen) {
      setOpen(true);
      setDrag(null);
    } else {
      closeDrawer();
    }
  };

  const drawerInteractive = open || progress > 0.001;

  return (
    <div className="pro-mobile-root" style={{ "--pro-drawer-width": `${drawerWidth}px`, "--pro-drawer-progress": progress } as CSSProperties}>
      <aside
        ref={drawerRef}
        className="pro-mobile-drawer"
        aria-label="Навигация"
        aria-hidden={!drawerInteractive}
        inert={!drawerInteractive}
        style={{ transform: `translate3d(${-drawerWidth * (1 - progress)}px,0,0)` }}
      >
        <header><div><span><SparklesIcon /></span><strong>Просметчик</strong></div><button ref={closeButtonRef} type="button" onClick={closeDrawer} aria-label="Закрыть"><XIcon /></button></header>''',
    "Mobile drawer inert and close focus",
)
replace_once(
    professional,
    '''          <button type="button" className="pro-mobile-drawer-chat" onClick={() => { onNewChat(); setOpen(false); }}><MessageSquareTextIcon /><strong>Новый чат</strong></button>''',
    '''          <button type="button" className="pro-mobile-drawer-chat" onClick={() => { onNewChat(); closeDrawer(); }}><MessageSquareTextIcon /><strong>Новый чат</strong></button>''',
    "Mobile drawer new chat close",
)
replace_once(
    professional,
    '''          <MobileHeader view={view} onMenu={() => setOpen(true)} onNewChat={onNewChat} onView={navigate} />''',
    '''          <MobileHeader view={view} onMenu={openDrawer} onNewChat={onNewChat} onView={navigate} menuButtonRef={menuButtonRef} />''',
    "Mobile header open callback",
)
replace_once(
    professional,
    '''        {progress > 0.001 ? <button type="button" className="pro-mobile-backdrop" aria-label="Закрыть навигацию" onClick={() => setOpen(false)} onPointerDown={(event) => begin("close", event)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} style={{ opacity: progress * 0.22 }} /> : null}''',
    '''        {progress > 0.001 ? <button type="button" className="pro-mobile-backdrop" aria-label="Закрыть навигацию" onClick={closeDrawer} onPointerDown={(event) => begin("close", event)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} style={{ opacity: progress * 0.22 }} /> : null}''',
    "Mobile drawer backdrop close",
)
replace_once(
    professional,
    '''function MobileHeader({ view, onMenu, onNewChat, onView }: {
  view: WorkspaceView;
  onMenu: () => void;
  onNewChat: () => void;
  onView: (view: WorkspaceView) => void;
}) {''',
    '''function MobileHeader({ view, onMenu, onNewChat, onView, menuButtonRef }: {
  view: WorkspaceView;
  onMenu: () => void;
  onNewChat: () => void;
  onView: (view: WorkspaceView) => void;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
}) {''',
    "MobileHeader menu ref prop",
)
replace_once(
    professional,
    '''        <button type="button" className="chat-reference-menu" aria-label="Открыть навигацию" onClick={onMenu}>''',
    '''        <button ref={menuButtonRef} type="button" className="chat-reference-menu" aria-label="Открыть навигацию" onClick={onMenu}>''',
    "Chat mobile menu ref",
)
replace_once(
    professional,
    '''      <button type="button" aria-label="Открыть навигацию" onClick={onMenu}><MenuIcon /></button>''',
    '''      <button ref={menuButtonRef} type="button" aria-label="Открыть навигацию" onClick={onMenu}><MenuIcon /></button>''',
    "Non-chat mobile menu ref",
)

# Settings: complete autocomplete semantics and inline provider test failure state.
settings = Path("apps/web/src/features/settings/SettingsView.tsx")
replace_once(
    settings,
    '''              <form className="admin-login" onSubmit={authenticate}>
                <label htmlFor="admin-token">''',
    '''              <form className="admin-login" onSubmit={authenticate} autoComplete="on">
                <input className="credential-username-proxy" type="text" name="username" autoComplete="username" value="prosmet-super-admin" readOnly tabIndex={-1} aria-hidden="true" />
                <label htmlFor="admin-token">''',
    "Admin login username proxy",
)
replace_once(
    settings,
    '''              <form className="agent-form" onSubmit={submitAgent}>
                <div className="agent-form-grid">''',
    '''              <form className="agent-form" onSubmit={submitAgent} autoComplete="off">
                <input className="credential-username-proxy" type="text" name="username" autoComplete="username" value={editingId ? `agent-${editingId}` : "new-agent-credential"} readOnly tabIndex={-1} aria-hidden="true" />
                <div className="agent-form-grid">''',
    "Agent credential username proxy",
)
replacements = {
    '<input id="agent-name" name="agent-name" ': '<input id="agent-name" name="agent-name" autoComplete="off" ',
    '<input id="agent-command" name="agent-command" ': '<input id="agent-command" name="agent-command" autoComplete="off" ',
    '<input id="agent-args" name="agent-args" ': '<input id="agent-args" name="agent-args" autoComplete="off" ',
    '<input id="agent-cwd" name="agent-cwd" ': '<input id="agent-cwd" name="agent-cwd" autoComplete="off" ',
    '<input id="agent-base-url" name="agent-base-url" type="url" ': '<input id="agent-base-url" name="agent-base-url" type="url" autoComplete="off" ',
    '<input id="agent-model" name="agent-model" ': '<input id="agent-model" name="agent-model" autoComplete="off" ',
    '<input id="agent-timeout" name="agent-timeout" type="number" ': '<input id="agent-timeout" name="agent-timeout" type="number" autoComplete="off" ',
}
settings_source = settings.read_text(encoding="utf-8")
for old, new in replacements.items():
    if old not in settings_source:
        raise SystemExit(f"Settings autocomplete target missing: {old}")
    settings_source = settings_source.replace(old, new, 1)
settings.write_text(settings_source, encoding="utf-8")
replace_once(
    settings,
    '''              {testResults[agent.id] ? <div className="agent-test-result"><CheckCircle2Icon /> {testResults[agent.id]!.latencyMs} мс · {testResults[agent.id]!.message}</div> : null}''',
    '''              {testResults[agent.id] ? <div className={testResults[agent.id]!.ok ? "agent-test-result" : "agent-test-result failure"}>{testResults[agent.id]!.ok ? <CheckCircle2Icon /> : <XIcon />} {testResults[agent.id]!.latencyMs} мс · {testResults[agent.id]!.message}</div> : null}''',
    "Agent test failure UI",
)
replace_once(
    settings,
    '''    link.href = href;
    link.download = `prosmet-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(href);''',
    '''    link.href = href;
    link.download = `prosmet-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);''',
    "Settings safe export download",
)

# Registration form: the email field is the actual username credential.
registration = Path("apps/web/src/features/account/UserRegistrationPanel.tsx")
replace_once(
    registration,
    '''          <label><span>Email</span><input required name="email" type="email" autoComplete="email" maxLength={320} /></label>''',
    '''          <label><span>Email</span><input required name="email" type="email" autoComplete="username" inputMode="email" maxLength={320} /></label>''',
    "Registration username autocomplete",
)

# Estimate editor: cancelled native share is a normal user outcome, not an unhandled rejection.
estimate_editor = Path("apps/web/src/features/estimate/EstimateEditor.tsx")
replace_once(
    estimate_editor,
    '''  const webShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: estimate.title, text: summary });
    } else {
      await navigator.clipboard.writeText(summary);
    }
    onSent();
  };''',
    '''  const webShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: estimate.title, text: summary });
      } else {
        await navigator.clipboard.writeText(summary);
      }
      onSent();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(summary);
        onSent();
      } catch {
        // Keep the share canvas open and let the user choose another channel.
      }
    }
  };''',
    "Share cancellation handling",
)
replace_once(
    estimate_editor,
    '''function MetaInput({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return <label className="meta-input"><small>{label}</small><input id={id} name={id} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}''',
    '''function MetaInput({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return <label className="meta-input"><small>{label}</small><input id={id} name={id} autoComplete="off" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}''',
    "Estimate metadata autocomplete",
)
replace_once(
    estimate_editor,
    '''<input id={id} name={id} type="number" min="0" inputMode="decimal" value={value}''',
    '''<input id={id} name={id} type="number" min="0" inputMode="decimal" autoComplete="off" value={value}''',
    "Estimate percent autocomplete",
)

# Chat dictation: request permission explicitly before assistant-ui starts speech recognition.
chat = Path("apps/web/src/features/chat/ChatSurface.tsx")
replace_once(
    chat,
    '''} from "lucide-react";
''',
    '''} from "lucide-react";
import { useMicrophonePermission } from "./useMicrophonePermission";
''',
    "Chat microphone hook import",
)
replace_once(
    chat,
    '''  const aui = useAui();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [utilityOpen, setUtilityOpen] = useState(false);''',
    '''  const aui = useAui();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [utilityOpen, setUtilityOpen] = useState(false);
  const microphone = useMicrophonePermission();''',
    "Mobile composer microphone state",
)
replace_once(
    chat,
    '''        <AuiIf condition={(state) => state.composer.dictation == null}>
          <ComposerPrimitive.Dictate className="mobile-reference-microphone" aria-label="Голосовой ввод">
            <MicIcon />
          </ComposerPrimitive.Dictate>
        </AuiIf>
        <AuiIf condition={(state) => state.composer.dictation != null}>
          <ComposerPrimitive.StopDictation className="mobile-reference-microphone listening" aria-label="Остановить голосовой ввод">
            <SquareIcon />
          </ComposerPrimitive.StopDictation>
        </AuiIf>''',
    '''        {microphone.state === "granted" ? (
          <>
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
          </>
        ) : (
          <button
            type="button"
            className="mobile-reference-microphone"
            data-permission={microphone.state}
            aria-label={microphone.state === "denied" ? "Микрофон запрещён в настройках браузера" : microphone.state === "unsupported" ? "Голосовой ввод не поддерживается" : "Разрешить голосовой ввод"}
            disabled={microphone.state === "denied" || microphone.state === "unsupported"}
            onClick={() => void microphone.request().then((granted) => { if (granted) inputRef.current?.focus(); })}
          >
            <MicIcon />
          </button>
        )}''',
    "Mobile dictation permission gate",
)

# Server: expected provider outages return structured application results instead of HTTP 500 noise.
server = Path("apps/web/server.mjs")
replace_once(
    server,
    '''async function activeAgent() {
  const registry = await loadRegistry();
  return registry.agents.find((agent) => agent.id === registry.activeAgentId) || null;
}

function profileForResponse(profile) {''',
    '''async function activeAgent() {
  const registry = await loadRegistry();
  return registry.agents.find((agent) => agent.id === registry.activeAgentId) || null;
}

function safeProviderFailureMessage(error) {
  const raw = error instanceof Error ? error.message : String(error || "");
  if (/abort|timeout|timed out|etimedout/iu.test(raw)) {
    return "Провайдер не ответил в установленное время. Проверьте доступность сервиса и повторите запрос.";
  }
  if (/401|403|unauthor|forbidden|authentication|api.?key|token/iu.test(raw)) {
    return "Провайдер отклонил учётные данные. Обновите секрет подключения в настройках.";
  }
  if (/enotfound|econnrefused|ehostunreach|network|fetch failed|socket/iu.test(raw)) {
    return "Не удалось установить соединение с провайдером. Проверьте endpoint и сетевую доступность.";
  }
  if (/json|schema|parse|unexpected token|invalid response/iu.test(raw)) {
    return "Провайдер вернул ответ неподдерживаемого формата. Проверьте совместимость модели и endpoint.";
  }
  return "Агент временно недоступен. Проверьте подключение в настройках и повторите запрос.";
}

function providerFailureResponse(agent, intent, error) {
  return {
    text: safeProviderFailureMessage(error),
    artifact: null,
    intent: intent.kind,
    workflow: null,
    agent: {
      id: agent.id,
      name: agent.name,
      type: agent.type,
      model: agent.model || null
    }
  };
}

function profileForResponse(profile) {''',
    "Safe provider failure helpers",
)
replace_once(
    server,
    '''      const result = await callConfiguredAgent(agent, [
        { role: "user", content: "Проверь соединение. Верни JSON: text со словом OK, artifact null, estimate null." }
      ], controller.signal);
      return sendJson(response, 200, {
        ok: true,
        agentId: agent.id,
        latencyMs: Date.now() - startedAt,
        provider: agent.type,
        model: agent.model || null,
        message: result.text
      });''',
    '''      try {
        const result = await callConfiguredAgent(agent, [
          { role: "user", content: "Проверь соединение. Верни JSON: text со словом OK, artifact null, estimate null." }
        ], controller.signal);
        return sendJson(response, 200, {
          ok: true,
          agentId: agent.id,
          latencyMs: Date.now() - startedAt,
          provider: agent.type,
          model: agent.model || null,
          message: result.text || "Соединение подтверждено"
        });
      } catch (error) {
        console.error("[prosmet] agent connection test failed", {
          agentId: agent.id,
          provider: agent.type,
          message: error instanceof Error ? error.message : String(error)
        });
        return sendJson(response, 200, {
          ok: false,
          agentId: agent.id,
          latencyMs: Date.now() - startedAt,
          provider: agent.type,
          model: agent.model || null,
          message: safeProviderFailureMessage(error)
        });
      }''',
    "Structured agent test failure",
)
replace_once(
    server,
    '''    const context = { intent, requestId, priceContext };
    let result = await callConfiguredAgent(agent, body.messages, controller.signal, context);

    if (!intent.allowEstimate && result.artifact === "estimate") {''',
    '''    const context = { intent, requestId, priceContext };
    let result;
    try {
      result = await callConfiguredAgent(agent, body.messages, controller.signal, context);
    } catch (error) {
      console.error("[prosmet] active agent request failed", {
        agentId: agent.id,
        provider: agent.type,
        requestId,
        message: error instanceof Error ? error.message : String(error)
      });
      return sendJson(response, 200, providerFailureResponse(agent, intent, error));
    }

    if (!intent.allowEstimate && result.artifact === "estimate") {''',
    "Structured active agent failure",
)
replace_once(
    server,
    '''        result = await callConfiguredAgent(agent, [
          ...normalizeMessages(body.messages),
          {
            role: "system",
            content: `Предыдущая смета не прошла серверный контроль: ${issues.join(", ")}. Исправь её полностью. Не возвращай пустые разделы, нулевые цены или демонстрационный id.`
          },
          {
            role: "user",
            content: "Пересобери расчёт по исходному запросу и верни один валидный JSON-объект по схеме."
          }
        ], controller.signal, context);''',
    '''        try {
          result = await callConfiguredAgent(agent, [
            ...normalizeMessages(body.messages),
            {
              role: "system",
              content: `Предыдущая смета не прошла серверный контроль: ${issues.join(", ")}. Исправь её полностью. Не возвращай пустые разделы, нулевые цены или демонстрационный id.`
            },
            {
              role: "user",
              content: "Пересобери расчёт по исходному запросу и верни один валидный JSON-объект по схеме."
            }
          ], controller.signal, context);
        } catch (error) {
          console.error("[prosmet] active agent correction failed", {
            agentId: agent.id,
            provider: agent.type,
            requestId,
            message: error instanceof Error ? error.message : String(error)
          });
          return sendJson(response, 200, providerFailureResponse(agent, intent, error));
        }''',
    "Structured quality retry failure",
)

# Final CSS loaded last.
css = Path("apps/web/src/web-console-reliability.css")
css.write_text('''.credential-username-proxy {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  margin: -1px !important;
  overflow: hidden !important;
  clip-path: inset(50%) !important;
  white-space: nowrap !important;
  border: 0 !important;
  padding: 0 !important;
}

.agent-test-result.failure {
  border-color: color-mix(in srgb, var(--pro-red) 24%, transparent);
  background: color-mix(in srgb, var(--pro-red) 8%, var(--pro-canvas));
  color: var(--pro-red);
}

.agent-test-result.failure svg { color: currentColor; }

.mobile-reference-microphone[data-permission="denied"],
.mobile-reference-microphone[data-permission="unsupported"] {
  color: var(--pro-faint);
  cursor: not-allowed;
  opacity: .62;
}

html[data-prosmet-theme="dark"] .agent-test-result.failure {
  background: rgba(248, 113, 113, .09);
  color: #fca5a5;
}

@media (prefers-color-scheme: dark) {
  html[data-prosmet-theme="system"] .agent-test-result.failure {
    background: rgba(248, 113, 113, .09);
    color: #fca5a5;
  }
}
''', encoding="utf-8")

app_entry = Path("apps/web/src/app/AppEntry.tsx")
replace_once(
    app_entry,
    'import "../web-dark-estimate-fullscreen.css";\n',
    'import "../web-dark-estimate-fullscreen.css";\nimport "../web-console-reliability.css";\n',
    "Console reliability stylesheet import",
)

# Contract guards prevent these regressions returning.
contract = Path("scripts/greenfield-contract.mjs")
contract_source = contract.read_text(encoding="utf-8")
marker = "if (failures.length) {"
guards = '''
if (!server.includes("safeProviderFailureMessage") || !server.includes("providerFailureResponse")) failures.push("server:provider-failure-contract-missing");
if (!server.includes("agent connection test failed") || !server.includes("ok: false")) failures.push("server:agent-test-safe-result-missing");
if (!webApp.includes('typeof event.key === "string"')) failures.push("web:unsafe-keyboard-event-access");
if (!webApp.includes("inert={!drawerInteractive}")) failures.push("web:mobile-drawer-inert-missing");
if (!webEstimate.includes('error.name === "AbortError"')) failures.push("web:share-cancel-unhandled");
'''
if guards not in contract_source:
    if contract_source.count(marker) != 1:
        raise SystemExit("greenfield contract final marker missing")
    contract_source = contract_source.replace(marker, guards + "\n" + marker, 1)
contract.write_text(contract_source, encoding="utf-8")

# Ensure the contract loads ProfessionalApp into webApp if not already present.
contract_source = contract.read_text(encoding="utf-8")
if 'const webApp = await read("apps/web/src/app/ProfessionalApp.tsx");' not in contract_source:
    anchor = 'const webEstimate = await read("apps/web/src/features/estimate/EstimateEditor.tsx");'
    if anchor not in contract_source:
        raise SystemExit("greenfield contract webEstimate anchor missing")
    contract_source = contract_source.replace(anchor, anchor + '\nconst webApp = await read("apps/web/src/app/ProfessionalApp.tsx");', 1)
contract.write_text(contract_source, encoding="utf-8")

# Browser regression: no page crash, no hidden-focus warning, correct credential semantics, and provider failures stay structured.
e2e = Path("apps/web/e2e/console-reliability.spec.ts")
e2e.write_text(r'''import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

const external = Boolean(process.env.PROSMET_BASE_URL);
const adminToken = external ? process.env.PROSMET_E2E_ADMIN_TOKEN?.trim() || null : "e2e-admin";

function watchTargetedConsole(page: Page) {
  const failures: string[] = [];
  const onConsole = (message: ConsoleMessage) => {
    const text = message.text();
    if (
      /Blocked aria-hidden/iu.test(text) ||
      /Cannot read properties of undefined \(reading 'toLowerCase'\)/u.test(text) ||
      /Password forms should have/iu.test(text) ||
      /Dictation error: not-allowed/iu.test(text) ||
      /Share canceled/iu.test(text)
    ) failures.push(`${message.type()}: ${text}`);
  };
  const onPageError = (error: Error) => failures.push(`pageerror: ${error.message}`);
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  return {
    failures,
    stop() {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
    }
  };
}

test("keyboard and mobile drawer interactions stay console-clean", async ({ page }, testInfo) => {
  const watcher = watchTargetedConsole(page);
  await page.goto("/app", { waitUntil: "networkidle" });
  await page.evaluate(() => window.dispatchEvent(new Event("keydown")));

  if (testInfo.project.name === "mobile-chromium") {
    const trigger = page.getByRole("button", { name: "Открыть навигацию" }).first();
    await trigger.click();
    const drawer = page.locator(".pro-mobile-drawer");
    await expect(drawer).toBeVisible();
    await drawer.getByRole("button", { name: "Проекты" }).focus();
    await drawer.getByRole("button", { name: "Проекты" }).click();
    await expect(drawer).toHaveAttribute("aria-hidden", "true");
    await expect(trigger).toBeFocused();
  }

  await page.waitForTimeout(100);
  watcher.stop();
  expect(watcher.failures).toEqual([]);
});

test("password forms expose username and autocomplete semantics", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Credential semantics run once");
  await page.goto("/app", { waitUntil: "networkidle" });

  await page.getByRole("button", { name: /Кабинет/ }).first().click();
  const registrationPassword = page.locator('.registration-panel input[type="password"]').first();
  await expect(registrationPassword).toHaveAttribute("autocomplete", /^(?:new-password|current-password)$/);
  await expect(registrationPassword.locator("xpath=ancestor::form[1]").locator('input[autocomplete="username"]')).toHaveCount(1);

  await page.getByRole("button", { name: "Настройки" }).first().click();
  const adminPassword = page.locator('.admin-login input[type="password"]');
  await expect(adminPassword).toHaveAttribute("autocomplete", "current-password");
  await expect(page.locator('.admin-login input[autocomplete="username"]')).toHaveCount(1);

  if (!external && adminToken) {
    await adminPassword.fill(adminToken);
    await page.locator(".admin-login").getByRole("button", { name: "Войти" }).click();
    await expect(page.locator(".agent-form")).toBeVisible();
    await expect(page.locator('.agent-form input[autocomplete="username"]')).toHaveCount(1);
    const formInputs = page.locator(".agent-form input").filter({ hasNot: page.locator('.credential-username-proxy') });
    const count = await formInputs.count();
    for (let index = 0; index < count; index += 1) {
      await expect(formInputs.nth(index)).toHaveAttribute("autocomplete");
    }
  }
});

test("provider outages return structured results instead of HTTP 500", async ({ page }, testInfo) => {
  test.skip(external || testInfo.project.name !== "desktop-chromium", "Local provider failure boundary runs once");
  const headers = { "x-prosmet-admin-token": adminToken! };
  const created = await page.request.post("/api/agents", {
    headers,
    data: {
      name: `Unavailable QA provider ${Date.now()}`,
      type: "http-agent",
      enabled: true,
      baseUrl: "http://127.0.0.1:9/run",
      timeoutMs: 5000
    }
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const agent = await created.json() as { id: string };

  const tested = await page.request.post(`/api/agents/${encodeURIComponent(agent.id)}/test`, { headers });
  expect(tested.status(), await tested.text()).toBe(200);
  const testResult = await tested.json() as { ok?: boolean; message?: string };
  expect(testResult.ok).toBe(false);
  expect(testResult.message).toBeTruthy();

  const activated = await page.request.post(`/api/agents/${encodeURIComponent(agent.id)}/activate`, { headers });
  expect(activated.ok(), await activated.text()).toBeTruthy();
  const chat = await page.request.post("/api/agent", {
    data: {
      requestId: `provider-failure-${Date.now()}`,
      messages: [{ role: "user", content: "Составь смету на ремонт ванной комнаты под ключ." }]
    }
  });
  expect(chat.status(), await chat.text()).toBe(200);
  const chatBody = await chat.json() as { text?: string; artifact?: unknown };
  expect(chatBody.text).toMatch(/провайдер|соединение|агент/iu);
  expect(chatBody.artifact).toBeNull();

  const removed = await page.request.delete(`/api/agents/${encodeURIComponent(agent.id)}`, { headers });
  expect(removed.ok(), await removed.text()).toBeTruthy();
});
''', encoding="utf-8")
