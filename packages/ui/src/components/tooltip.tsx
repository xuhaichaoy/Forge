/*
 * CODEX-REF: tooltip-CDzchJxN.js — Codex Desktop's hover/focus tooltip.
 * Content container className (extracted): `bg-token-dropdown-background/90 text-token-foreground
 * ring-token-border z-50 m-px flex w-fit select-none flex-col rounded-xl text-sm whitespace-normal
 * break-words shadow-xl-spread ring-[0.5px] backdrop-blur-sm`; content padding `!px-1.5 !py-0.5`;
 * `maxWidth: min(20rem, …)`; `sideOffset: 2`. The optional keyboard-shortcut chip is
 * `inline-flex h-4 min-w-4 !px-1.5 !py-0 !rounded-md !border-0 !bg-current/10 !font-sans !text-xs
 * !text-current !shadow-none`. Forge maps those to its panel-surface tokens; positioning uses
 * the same portal + viewport-clamp pattern as `context-menu` / `reasoning-picker-menu` (no
 * floating-ui dependency). Replaces native `title` where Codex shows a styled tooltip.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface TooltipProps {
  /** The trigger element (must be a single host element that accepts hover/focus). */
  children: ReactElement;
  content: ReactNode;
  /** Optional keyboard-shortcut chip rendered after the content (codex tooltip `shortcut`). */
  shortcut?: string;
  /** codex Radix default delayDuration. */
  delayMs?: number;
}

const SIDE_OFFSET_PX = 2; // codex tooltip sideOffset
const VIEWPORT_MARGIN_PX = 8;

export function Tooltip({ children, content, shortcut, delayMs = 700 }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const showTimer = useRef<number | undefined>(undefined);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const show = useCallback(() => {
    if (typeof window === "undefined") return;
    window.clearTimeout(showTimer.current);
    showTimer.current = window.setTimeout(() => setOpen(true), delayMs);
  }, [delayMs]);

  const hide = useCallback(() => {
    if (typeof window !== "undefined") window.clearTimeout(showTimer.current);
    setOpen(false);
    setPosition(null);
  }, []);

  useEffect(() => () => {
    if (typeof window !== "undefined") window.clearTimeout(showTimer.current);
  }, []);

  // Position above the trigger (centered), flip below if there is no room, clamp horizontally.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (trigger == null || tooltip == null || typeof window === "undefined") return;
    const t = trigger.getBoundingClientRect();
    const tip = tooltip.getBoundingClientRect();
    let top = t.top - tip.height - SIDE_OFFSET_PX;
    if (top < VIEWPORT_MARGIN_PX) top = t.bottom + SIDE_OFFSET_PX;
    const centeredLeft = t.left + t.width / 2 - tip.width / 2;
    const left = Math.max(
      VIEWPORT_MARGIN_PX,
      Math.min(centeredLeft, window.innerWidth - tip.width - VIEWPORT_MARGIN_PX),
    );
    setPosition({ top, left });
  }, [open]);

  const showTooltip = open && content != null && typeof document !== "undefined";

  return (
    <span
      ref={triggerRef}
      className="hc-tooltip-trigger"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {showTooltip
        && createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            className="hc-tooltip"
            style={{
              position: "fixed",
              top: position?.top ?? -9999,
              left: position?.left ?? -9999,
              maxWidth: "min(20rem, calc(100vw - 16px))",
              visibility: position == null ? "hidden" : undefined,
            }}
          >
            <span className="hc-tooltip-content">{content}</span>
            {shortcut != null && shortcut.length > 0 && (
              <kbd className="hc-tooltip-kbd">{shortcut}</kbd>
            )}
          </div>,
          document.body,
        )}
    </span>
  );
}
