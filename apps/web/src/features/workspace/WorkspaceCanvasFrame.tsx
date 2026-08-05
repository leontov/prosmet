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

type ThemeMode = "system" | "light" | "dark";
type ResizeKind = "sidebar" | "canvas";

type Props = {
  children: ReactNode;
  canvas: ReactNode | null;
  canvasTitle: string;
  canvasSubtitle?: string | null;
  onCloseCanvas: () => void;
};

const sidebarKey = "prosmet.workspace.sidebar-width.v1";
const canvasKey = "prosmet.workspace.canvas-width.v1";
const themeKey = "prosmet.workspace.theme.v1";

function readNumber(key: string, fallback: number) {
  const value = Number(window.localStorage.getItem(key));
  return Number.isFinite(value) ? value : fallback;
}

function readTheme(): ThemeMode {
  const value = window.localStorage.getItem(themeKey);
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function canvasMaximum() {
  return Math.max(480, Math.min(960, window.innerWidth - 360));
}

export function WorkspaceCanvasFrame({
  children,
  canvas,
  canvasTitle,
  canvasSubtitle,
  onCloseCanvas
}: Props) {
  const [sidebarWidth, setSidebarWidth] = useState(() => clamp(readNumber(sidebarKey, 254), 210, 420));
  const [canvasWidth, setCanvasWidth] = useState(() => clamp(readNumber(canvasKey, 620), 440, canvasMaximum()));
  const [canvasFullscreen, setCanvasFullscreen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readTheme());
  const drag = useRef<{
    kind: ResizeKind;
    pointerId: number;
    startX: number;
    sidebarWidth: number;
    canvasWidth: number;
  } | null>(null);

  useEffect(() => {
    document.documentElement.dataset.prosmetTheme = themeMode;
    window.localStorage.setItem(themeKey, themeMode);
  }, [themeMode]);

  useEffect(() => {
    const onResize = () => {
      setSidebarWidth((value) => clamp(value, 210, 420));
      setCanvasWidth((value) => clamp(value, 440, canvasMaximum()));
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
      setSidebarWidth(clamp(current.sidebarWidth + delta, 210, 420));
    } else {
      setCanvasWidth(clamp(current.canvasWidth - delta, 440, canvasMaximum()));
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
      const next = clamp(sidebarWidth + direction * 16, 210, 420);
      setSidebarWidth(next);
      window.localStorage.setItem(sidebarKey, String(next));
    } else {
      const next = clamp(canvasWidth - direction * 20, 440, canvasMaximum());
      setCanvasWidth(next);
      window.localStorage.setItem(canvasKey, String(next));
    }
  };

  const cycleTheme = () => {
    setThemeMode((current) => current === "system" ? "light" : current === "light" ? "dark" : "system");
  };

  const style = {
    "--prosmet-sidebar-width": `${sidebarWidth}px`,
    "--prosmet-canvas-width": `${canvasWidth}px`
  } as CSSProperties;

  return (
    <div
      className={`pro-workspace-frame${canvas ? " has-canvas" : ""}${canvasFullscreen ? " canvas-fullscreen" : ""}`}
      style={style}
      data-testid="workspace-canvas-frame"
    >
      <section className="pro-workspace-primary" aria-label="Основная рабочая область">
        {children}
        {!canvasFullscreen ? (
          <div
            className="pro-workspace-resizer pro-workspace-sidebar-resizer"
            role="separator"
            aria-label="Изменить ширину левого сайдбара"
            aria-orientation="vertical"
            aria-valuemin={210}
            aria-valuemax={420}
            aria-valuenow={Math.round(sidebarWidth)}
            tabIndex={0}
            onPointerDown={(event) => beginResize("sidebar", event)}
            onPointerMove={moveResize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            onKeyDown={(event) => resizeWithKeyboard("sidebar", event)}
            onDoubleClick={() => setSidebarWidth(254)}
          />
        ) : null}
      </section>

      {canvas && !canvasFullscreen ? (
        <div
          className="pro-workspace-resizer pro-workspace-canvas-resizer"
          role="separator"
          aria-label="Изменить ширину правого канваса"
          aria-orientation="vertical"
          aria-valuemin={440}
          aria-valuemax={canvasMaximum()}
          aria-valuenow={Math.round(canvasWidth)}
          tabIndex={0}
          onPointerDown={(event) => beginResize("canvas", event)}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          onKeyDown={(event) => resizeWithKeyboard("canvas", event)}
          onDoubleClick={() => setCanvasWidth(620)}
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
              <button type="button" onClick={cycleTheme} aria-label={`Тема: ${themeMode}`} title={`Тема: ${themeMode}`}>
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
