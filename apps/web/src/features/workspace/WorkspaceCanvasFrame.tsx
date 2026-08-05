import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode
} from "react";
import {
  Maximize2Icon,
  Minimize2Icon,
  MoonIcon,
  PanelRightCloseIcon,
  SunIcon
} from "lucide-react";

export type WorkspaceThemeMode = "system" | "light" | "dark";
type ResizeKind = "sidebar" | "canvas";

type Props = {
  children: ReactNode;
  canvas: ReactNode | null;
  canvasTitle: string;
  canvasSubtitle?: string | null;
  sidebarCollapsed: boolean;
  themeMode: WorkspaceThemeMode;
  onCloseCanvas: () => void;
  onCycleTheme: () => void;
};

const sidebarKey = "prosmet.workspace.sidebar-width.v1";
const canvasKey = "prosmet.workspace.canvas-width.v1";
const sidebarDefault = 254;
const canvasDefault = 680;
const sidebarMinimum = 210;
const sidebarMaximum = 420;
const canvasMinimum = 520;

function readNumber(key: string, fallback: number) {
  const stored = window.localStorage.getItem(key);
  if (stored === null || !stored.trim()) return fallback;
  const value = Number(stored);
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function canvasMaximum() {
  const reservedWorkspace = window.innerWidth >= 1440 ? 560 : 480;
  return Math.max(canvasMinimum, Math.min(920, window.innerWidth - reservedWorkspace));
}

export function WorkspaceCanvasFrame({
  children,
  canvas,
  canvasTitle,
  canvasSubtitle,
  sidebarCollapsed,
  themeMode,
  onCloseCanvas,
  onCycleTheme
}: Props) {
  const [sidebarWidth, setSidebarWidth] = useState(() => clamp(
    readNumber(sidebarKey, sidebarDefault),
    sidebarMinimum,
    sidebarMaximum
  ));
  const [canvasWidth, setCanvasWidth] = useState(() => clamp(
    readNumber(canvasKey, canvasDefault),
    canvasMinimum,
    canvasMaximum()
  ));
  const [canvasFullscreen, setCanvasFullscreen] = useState(false);
  const drag = useRef<{
    kind: ResizeKind;
    pointerId: number;
    startX: number;
    sidebarWidth: number;
    canvasWidth: number;
  } | null>(null);

  useEffect(() => {
    const onResize = () => {
      setSidebarWidth((value) => clamp(value, sidebarMinimum, sidebarMaximum));
      setCanvasWidth((value) => clamp(value, canvasMinimum, canvasMaximum()));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!canvas) setCanvasFullscreen(false);
  }, [canvas]);

  const beginResize = (kind: ResizeKind, event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    drag.current = {
      kind,
      pointerId: event.pointerId,
      startX: event.clientX,
      sidebarWidth,
      canvasWidth
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.classList.add("pro-resizing-workspace");
  };

  const moveResize = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const delta = event.clientX - current.startX;
    if (current.kind === "sidebar") {
      setSidebarWidth(clamp(current.sidebarWidth + delta, sidebarMinimum, sidebarMaximum));
    } else {
      setCanvasWidth(clamp(current.canvasWidth - delta, canvasMinimum, canvasMaximum()));
    }
    event.preventDefault();
  };

  const endResize = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    document.body.classList.remove("pro-resizing-workspace");
    window.localStorage.setItem(sidebarKey, String(sidebarWidth));
    window.localStorage.setItem(canvasKey, String(canvasWidth));
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const resizeWithKeyboard = (kind: ResizeKind, event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    if (kind === "sidebar") {
      const next = clamp(sidebarWidth + direction * 16, sidebarMinimum, sidebarMaximum);
      setSidebarWidth(next);
      window.localStorage.setItem(sidebarKey, String(next));
    } else {
      const next = clamp(canvasWidth - direction * 20, canvasMinimum, canvasMaximum());
      setCanvasWidth(next);
      window.localStorage.setItem(canvasKey, String(next));
    }
  };

  const resetSidebarWidth = () => {
    setSidebarWidth(sidebarDefault);
    window.localStorage.setItem(sidebarKey, String(sidebarDefault));
  };

  const resetCanvasWidth = () => {
    const next = clamp(canvasDefault, canvasMinimum, canvasMaximum());
    setCanvasWidth(next);
    window.localStorage.setItem(canvasKey, String(next));
  };

  const effectiveSidebarWidth = sidebarCollapsed ? 68 : sidebarWidth;
  const style = {
    "--prosmet-sidebar-width": `${effectiveSidebarWidth}px`,
    "--prosmet-canvas-width": `${canvasWidth}px`
  } as CSSProperties;

  return (
    <div
      className={`pro-workspace-frame${canvas ? " has-canvas" : ""}${canvasFullscreen ? " canvas-fullscreen" : ""}${sidebarCollapsed ? " sidebar-collapsed" : ""}`}
      style={style}
      data-testid="workspace-canvas-frame"
    >
      <section className="pro-workspace-primary" aria-label="Основная рабочая область">
        {children}
        {!canvasFullscreen && !sidebarCollapsed ? (
          <div
            className="pro-workspace-resizer pro-workspace-sidebar-resizer"
            role="separator"
            aria-label="Изменить ширину левого сайдбара"
            aria-orientation="vertical"
            aria-valuemin={sidebarMinimum}
            aria-valuemax={sidebarMaximum}
            aria-valuenow={Math.round(sidebarWidth)}
            tabIndex={0}
            onPointerDown={(event) => beginResize("sidebar", event)}
            onPointerMove={moveResize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            onKeyDown={(event) => resizeWithKeyboard("sidebar", event)}
            onDoubleClick={resetSidebarWidth}
          />
        ) : null}
      </section>

      {canvas && !canvasFullscreen ? (
        <div
          className="pro-workspace-resizer pro-workspace-canvas-resizer"
          role="separator"
          aria-label="Изменить ширину правого канваса"
          aria-orientation="vertical"
          aria-valuemin={canvasMinimum}
          aria-valuemax={canvasMaximum()}
          aria-valuenow={Math.round(canvasWidth)}
          tabIndex={0}
          onPointerDown={(event) => beginResize("canvas", event)}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          onKeyDown={(event) => resizeWithKeyboard("canvas", event)}
          onDoubleClick={resetCanvasWidth}
        />
      ) : null}

      {canvas ? (
        <aside className="pro-workspace-canvas" aria-label={canvasTitle}>
          <header className="pro-workspace-canvas-header">
            <div>
              <strong>{canvasTitle}</strong>
              {canvasSubtitle ? <span>{canvasSubtitle}</span> : null}
            </div>
            <div className="pro-workspace-canvas-actions">
              <button type="button" onClick={onCycleTheme} aria-label={`Тема: ${themeMode}`} title={`Тема: ${themeMode}`}>
                {themeMode === "dark" ? <MoonIcon /> : <SunIcon />}
              </button>
              <button
                type="button"
                onClick={() => setCanvasFullscreen((value) => !value)}
                aria-label={canvasFullscreen ? "Выйти из полноэкранного режима" : "Открыть канвас на весь экран"}
              >
                {canvasFullscreen ? <Minimize2Icon /> : <Maximize2Icon />}
              </button>
              <button type="button" onClick={onCloseCanvas} aria-label="Закрыть правый канвас">
                <PanelRightCloseIcon />
              </button>
            </div>
          </header>
          <div className="pro-workspace-canvas-body">{canvas}</div>
        </aside>
      ) : null}
    </div>
  );
}
