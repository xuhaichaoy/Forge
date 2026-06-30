import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { TurnDiffSimplePreview } from "./turn-diff-simple-preview";
import { TurnDiffStats } from "./turn-diff-stats";

const TURN_DIFF_PREVIEW_DELAY_MS = 800;
const TURN_DIFF_PREVIEW_SKIP_DELAY_WINDOW_MS = 300;
let lastTurnDiffPreviewOpenAt = 0;

export interface TurnDiffPreviewData {
  diff: string;
  linesAdded: number;
  linesRemoved: number;
  path: string;
}

export function TurnDiffPreviewTooltip({
  children,
  onOpen,
  preview,
}: {
  children: ReactNode;
  onOpen: () => void;
  preview: TurnDiffPreviewData;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const [theme, setTheme] = useState<"dark" | "light" | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const openTimerRef = useRef<number | undefined>(undefined);
  const closeTimerRef = useRef<number | undefined>(undefined);

  const clearTimers = useCallback(() => {
    if (typeof window === "undefined") return;
    window.clearTimeout(openTimerRef.current);
    window.clearTimeout(closeTimerRef.current);
  }, []);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const previewElement = previewRef.current;
    if (!trigger || !previewElement || typeof window === "undefined") return;
    const triggerRect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const availableWidth = Math.max(0, viewportWidth - 16);
    const desktopMaxWidth = Math.max(0, Math.min(triggerRect.width - 64, availableWidth));
    const width = desktopMaxWidth > 0 ? desktopMaxWidth : Math.min(triggerRect.width, availableWidth);
    const previewRect = previewElement.getBoundingClientRect();
    let top = triggerRect.top - previewRect.height;
    if (top < 8) top = Math.min(triggerRect.bottom, Math.max(8, viewportHeight - previewRect.height - 8));
    const centeredLeft = triggerRect.left + triggerRect.width / 2 - width / 2;
    const left = Math.max(8, Math.min(centeredLeft, viewportWidth - width - 8));
    setPosition({ left, top, width });
  }, []);

  const scheduleOpen = useCallback(() => {
    if (typeof window === "undefined") return;
    window.clearTimeout(closeTimerRef.current);
    window.clearTimeout(openTimerRef.current);
    const app = triggerRef.current?.closest<HTMLElement>(".hc-app[data-theme]");
    const appTheme = app?.dataset.theme === "dark" ? "dark" : app?.dataset.theme === "light" ? "light" : null;
    setTheme(appTheme);
    const now = Date.now();
    const delay = now - lastTurnDiffPreviewOpenAt < TURN_DIFF_PREVIEW_SKIP_DELAY_WINDOW_MS
      ? 0
      : TURN_DIFF_PREVIEW_DELAY_MS;
    if (delay === 0) {
      lastTurnDiffPreviewOpenAt = now;
      setOpen(true);
      return;
    }
    openTimerRef.current = window.setTimeout(() => {
      lastTurnDiffPreviewOpenAt = Date.now();
      setOpen(true);
    }, delay);
  }, []);

  const cancelClose = useCallback(() => {
    if (typeof window === "undefined") return;
    window.clearTimeout(closeTimerRef.current);
  }, []);

  const scheduleClose = useCallback(() => {
    if (typeof window === "undefined") return;
    window.clearTimeout(openTimerRef.current);
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      setPosition(null);
    }, 80);
  }, []);

  const handleTriggerBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && previewRef.current?.contains(nextTarget)) return;
    scheduleClose();
  };

  useEffect(() => () => clearTimers(), [clearTimers]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    if (typeof window === "undefined") return;
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, preview.diff, updatePosition]);

  const handlePreviewKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpen();
  };

  return (
    <div
      ref={triggerRef}
      className="hc-turn-diff-preview-trigger"
      onFocus={scheduleOpen}
      onBlur={handleTriggerBlur}
      onPointerEnter={scheduleOpen}
      onPointerLeave={scheduleClose}
    >
      {children}
      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={previewRef}
          className="hc-turn-diff-preview-positioner"
          data-theme={theme ?? undefined}
          onPointerEnter={cancelClose}
          onPointerLeave={scheduleClose}
          style={{
            left: position?.left ?? -9999,
            top: position?.top ?? -9999,
            visibility: position == null ? "hidden" : undefined,
            width: position?.width ?? undefined,
          }}
        >
          <div
            className="hc-turn-diff-preview-surface"
            role="button"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={handlePreviewKeyDown}
          >
            <div className="hc-turn-diff-preview-header">
              <span className="hc-turn-diff-preview-path">{preview.path}</span>
              <TurnDiffStats added={preview.linesAdded} removed={preview.linesRemoved} />
            </div>
            <div className="hc-turn-diff-preview-body" data-testid="diff-preview-scroll">
              <TurnDiffSimplePreview diff={preview.diff} />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
