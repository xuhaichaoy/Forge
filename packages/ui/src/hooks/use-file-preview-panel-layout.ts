import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/*
 * Mirrors Codex Desktop's AppShell **RightPanel** — the big resizable side
 * panel that hosts `FilePreviewPage` when the user clicks an artifact / file
 * link. NOT the summary rail (`Mf`); the summary rail is a fixed floating
 * card with `rounded-3xl border ... backdrop-blur-sm` and is not user-
 * resizable.
 *
 * Source citations (paths under `/private/tmp/`, formatted exports of the
 * `app.asar` bundle):
 *
 *   • Default width **600 px** — `app-shell.formatted.js:643`
 *     `function Ln({ children, defaultWidth: r2, widthStorageKey }){
 *        let a2 = r2 === void 0 ? 600 : r2; ... }`.
 *     `Ln` is the right-panel registration wrapper that ships the default to
 *     the `S` atom (`d2.defaultWidth` consumed by `vn` at :522).
 *   • Min width **320 px** — `app-shell.formatted.js:522-524` (`function vn`):
 *     `setSize: e3 => { if (e3 < x(320)) { v(s2, false); return; } ... }`.
 *     The 240-px floor in the same file is for the LEFT sidebar (`_n`),
 *     not this panel — earlier confusion on my side.
 *   • `getSizeFromPointer` — :522
 *     `({x: e3}) => (c2.current?.getBoundingClientRect().right ??
 *                    window.innerWidth) / m2 - e3`.
 *     Width is measured from the panel's own right edge, not from
 *     `window.innerWidth`, so the panel stays accurate even when the window
 *     has insets (macOS traffic lights, scroll-bar reserve, etc.).
 *   • Double-click reset — `app-shell-panel-animation-DTiWlXE1.js function w`:
 *     `onClick: e => e.detail === 2 && (..., i(t))` where `t = defaultSize`.
 *   • Full-width mode — :522
 *     `!_2 && jsx(Le, ...)` (`_2 = widthMode === "full"`) hides the handle.
 *     `function yn` then computes `rightPanelWidth = isFullWidth ?
 *     mainContentWidth : ratio·mainContentWidth`, so the panel covers the
 *     conversation area at full mode.
 *   • Expand/Restore button — `app-shell.formatted.js:50` and elsewhere,
 *     `aria-label = codex.rightPanel.expandFullWidth / restoreWidth`.
 *
 * Persistence keys live under `hicodex.filePreviewPanel.` so a curious user
 * can wipe them without touching unrelated UI state.
 */
export const FILE_PREVIEW_PANEL_MIN_WIDTH_PX = 320;
export const FILE_PREVIEW_PANEL_DEFAULT_WIDTH_PX = 600;
export const FILE_PREVIEW_PANEL_MAX_WIDTH_RATIO = 0.85;

const STORAGE_KEY_WIDTH = "hicodex.filePreviewPanel.widthPx";
const STORAGE_KEY_FULL_WIDTH = "hicodex.filePreviewPanel.fullWidth";

export interface FilePreviewPanelLayoutState {
  widthPx: number;
  fullWidth: boolean;
  isResizing: boolean;
  resolvedMaxWidthPx: number;
}

export interface FilePreviewPanelLayoutControls extends FilePreviewPanelLayoutState {
  setWidthPx: (next: number) => void;
  startResize: (
    event: { clientX: number; pointerId?: number },
    asideElement: HTMLElement | null,
  ) => void;
  /**
   * Reset to `FILE_PREVIEW_PANEL_DEFAULT_WIDTH_PX`. Wired to the handle's
   * `onClick(e.detail === 2)` double-click handler (Codex `function w`).
   */
  resetWidth: () => void;
  toggleFullWidth: () => void;
  /**
   * Trigger close of the rail when the user drags the handle below the
   * minimum-width guard. Returned so the parent (which actually owns
   * "rail open" state via `artifactPreview` / `fileReference` selection) can
   * close those selections.
   */
  onShouldClose?: () => void;
}

export interface UseFilePreviewPanelLayoutInput {
  containerWidthPx: number;
  onShouldClose?: () => void;
}

function readPersistedWidth(): number {
  if (typeof window === "undefined") return FILE_PREVIEW_PANEL_DEFAULT_WIDTH_PX;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_WIDTH);
    if (!raw) return FILE_PREVIEW_PANEL_DEFAULT_WIDTH_PX;
    const value = Number.parseFloat(raw);
    if (!Number.isFinite(value) || value < FILE_PREVIEW_PANEL_MIN_WIDTH_PX) return FILE_PREVIEW_PANEL_DEFAULT_WIDTH_PX;
    return value;
  } catch {
    return FILE_PREVIEW_PANEL_DEFAULT_WIDTH_PX;
  }
}

function readPersistedFullWidth(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY_FULL_WIDTH) === "1";
  } catch {
    return false;
  }
}

function persistWidth(value: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY_WIDTH, String(Math.round(value)));
  } catch {
    // best effort
  }
}

function persistFullWidth(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY_FULL_WIDTH, "1");
    else window.localStorage.removeItem(STORAGE_KEY_FULL_WIDTH);
  } catch {
    // best effort
  }
}

export function clampFilePreviewPanelWidth(value: number, maxPx: number): number {
  if (!Number.isFinite(value)) return FILE_PREVIEW_PANEL_DEFAULT_WIDTH_PX;
  const upper = Math.max(FILE_PREVIEW_PANEL_MIN_WIDTH_PX, maxPx);
  if (value < FILE_PREVIEW_PANEL_MIN_WIDTH_PX) return FILE_PREVIEW_PANEL_MIN_WIDTH_PX;
  if (value > upper) return upper;
  return value;
}

export function useFilePreviewPanelLayout({
  containerWidthPx,
  onShouldClose,
}: UseFilePreviewPanelLayoutInput): FilePreviewPanelLayoutControls {
  const [widthPx, setWidthInternal] = useState<number>(readPersistedWidth);
  const [fullWidth, setFullWidth] = useState<boolean>(readPersistedFullWidth);
  const [isResizing, setIsResizing] = useState(false);
  const resolvedMaxWidthPx = useMemo(() => {
    if (containerWidthPx <= 0) return Number.POSITIVE_INFINITY;
    return Math.max(FILE_PREVIEW_PANEL_MIN_WIDTH_PX, Math.floor(containerWidthPx * FILE_PREVIEW_PANEL_MAX_WIDTH_RATIO));
  }, [containerWidthPx]);

  // Re-clamp whenever the available container shrinks so we never report a
  // panel wider than the host area (mirrors Codex's container-driven recalc).
  useEffect(() => {
    setWidthInternal((current) => {
      const next = clampFilePreviewPanelWidth(current, resolvedMaxWidthPx);
      return next === current ? current : next;
    });
  }, [resolvedMaxWidthPx]);

  const setWidthPx = useCallback((next: number) => {
    if (next < FILE_PREVIEW_PANEL_MIN_WIDTH_PX) {
      onShouldClose?.();
      return;
    }
    const clamped = clampFilePreviewPanelWidth(next, resolvedMaxWidthPx);
    setWidthInternal((current) => (current === clamped ? current : clamped));
    persistWidth(clamped);
  }, [onShouldClose, resolvedMaxWidthPx]);

  /*
   * Pointer-driven drag. Codex computes the new width as
   *   `(aside.getBoundingClientRect().right ?? window.innerWidth)/m - clientX`
   * (where `m` is a DPR-ish scale factor we approximate as 1 because Codex's
   * actual `m` divides both sides of the equation and cancels out at the
   * pixel-precision level we care about). The right edge of the aside is the
   * stable anchor — measuring from the viewport edge breaks when window
   * controls / inset roots shift the panel.
   */
  const rafRef = useRef<number | null>(null);
  const pendingWidthRef = useRef<number | null>(null);
  const flush = useCallback(() => {
    rafRef.current = null;
    const pending = pendingWidthRef.current;
    if (pending == null) return;
    pendingWidthRef.current = null;
    setWidthPx(pending);
  }, [setWidthPx]);

  const startResize = useCallback((
    event: { clientX: number; pointerId?: number },
    asideElement: HTMLElement | null,
  ) => {
    if (typeof window === "undefined") return;
    setIsResizing(true);
    // Capture the aside's right edge at drag-start. Codex re-reads it each
    // move; we cache it because the panel doesn't move horizontally during a
    // user drag (only its width changes, and width changes happen on the
    // panel's LEFT edge — right edge is anchored).
    const rightEdge = asideElement?.getBoundingClientRect().right ?? window.innerWidth;
    const computeWidth = (clientX: number) => rightEdge - clientX;
    pendingWidthRef.current = computeWidth(event.clientX);
    const onMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      pendingWidthRef.current = computeWidth(moveEvent.clientX);
      if (rafRef.current == null) {
        rafRef.current = window.requestAnimationFrame(flush);
      }
    };
    const onUp = (upEvent: PointerEvent) => {
      upEvent.preventDefault();
      pendingWidthRef.current = computeWidth(upEvent.clientX);
      flush();
      setIsResizing(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, [flush]);

  useEffect(() => () => {
    if (rafRef.current != null && typeof window !== "undefined") {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const resetWidth = useCallback(() => {
    setWidthInternal(FILE_PREVIEW_PANEL_DEFAULT_WIDTH_PX);
    persistWidth(FILE_PREVIEW_PANEL_DEFAULT_WIDTH_PX);
  }, []);

  const toggleFullWidth = useCallback(() => {
    setFullWidth((current) => {
      const next = !current;
      persistFullWidth(next);
      return next;
    });
  }, []);

  return {
    widthPx,
    fullWidth,
    isResizing,
    resolvedMaxWidthPx,
    setWidthPx,
    startResize,
    resetWidth,
    toggleFullWidth,
  };
}
