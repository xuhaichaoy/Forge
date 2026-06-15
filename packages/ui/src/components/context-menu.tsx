/*
 * CODEX-REF: context-menu-CDka65eJ.js — Codex Desktop's right-click context menu.
 * Container: `z-50 m-px flex min-w-[180px] flex-col rounded-xl bg-token-dropdown-background/90
 * p-1 text-token-foreground` + shadow; each item is a `flex items-center gap-1.5 rounded-lg
 * p-1.5 text-sm` row with an `icon-sm` leading icon + a `truncate` label, and disabled items
 * render at `opacity-50 cursor-default`. Forge mirrors that structure while reusing the
 * existing `.hc-thread-menu` popover surface (bg/shadow/border) for visual consistency with
 * the other Forge menus; positioning follows the same portal + viewport-clamp pattern as
 * `reasoning-picker-menu` / the composer project menu.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface ContextMenuItem {
  id: string;
  /** Omitted for separator rows. */
  label?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  /** codex context-menu-*.js `{type:"separator"}` — renders a divider, not a row. */
  separator?: boolean;
  onSelect?: () => void;
}

export interface ContextMenuProps {
  items: ContextMenuItem[];
  /** Anchor point (the right-click cursor position), in viewport coordinates. */
  x: number;
  y: number;
  onClose: () => void;
}

const VIEWPORT_MARGIN_PX = 8;

export function ContextMenu({ items, x, y, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: y, left: x });

  // Clamp the menu into the viewport once its real size is known (mirrors the
  // reasoning-picker / project-menu portal clamping).
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (el == null || typeof window === "undefined") return;
    const rect = el.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width - VIEWPORT_MARGIN_PX;
    const maxTop = window.innerHeight - rect.height - VIEWPORT_MARGIN_PX;
    setPosition({
      left: Math.max(VIEWPORT_MARGIN_PX, Math.min(x, maxLeft)),
      top: Math.max(VIEWPORT_MARGIN_PX, Math.min(y, maxTop)),
    });
  }, [x, y, items.length]);

  // Dismiss on outside pointerdown / Escape / scroll / resize.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  if (typeof document === "undefined" || items.length === 0) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="hc-thread-menu hc-app-popover-menu hc-context-menu"
      role="menu"
      data-state="open"
      style={{ position: "fixed", top: position.top, left: position.left, zIndex: "var(--hc-z-popover)" }}
    >
      {items.map((item) =>
        item.separator ? (
          // codex context-menu-*.js — `{type:"separator"}` rows render a divider.
          <div key={item.id} className="hc-thread-menu-separator" role="separator" />
        ) : (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className="hc-thread-menu-item"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.onSelect?.();
              onClose();
            }}
          >
            {item.icon}
            <span className="hc-context-menu-label">{item.label}</span>
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
