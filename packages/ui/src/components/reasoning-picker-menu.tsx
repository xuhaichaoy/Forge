/*
 * CODEX-REF: composer-D0cvMZjq.js — Reasoning effort picker dropdown.
 *
 *   Effort label switch (`vg(e, t)` at offset ~314200):
 *     case `none`:    composer.mode.local.reasoning.none.label    = "None"
 *     case `minimal`: composer.mode.local.reasoning.minimal.label = "Minimal"
 *     case `low`:     composer.mode.local.reasoning.low.label     = "Low"
 *     case `medium`:  composer.mode.local.reasoning.medium.label  = "Medium"
 *     case `high`:    composer.mode.local.reasoning.high.label    = "High"
 *     case `xhigh`:   composer.mode.local.reasoning.xhigh.label   = "Extra High"
 *
 *   Dropdown structure (`Fa` popover at offset ~202900):
 *     Fa.Title  — header `<FormattedMessage id="composer.intelligenceDropdown.title" defaultMessage="Reasoning"/>`
 *     Fa.Item   — one per supported effort
 *                 attr `data-reasoning-selected="true"` when active
 *                 RightIcon = `oa` (checkmark) when active
 *                 onSelect = analytics(`codex_composer_reasoning_effort_changed`)
 *                            + f(model, effort) (setModelAndReasoningEffort)
 *                            + R() (close)
 *
 *   Disabled when (`u === 'error' || l?.models == null`).
 */
import { Check } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export const REASONING_EFFORT_VALUES = ["none", "minimal", "low", "medium", "high", "xhigh"] as const;
export type ReasoningEffortValue = typeof REASONING_EFFORT_VALUES[number];

export function reasoningEffortLabel(value: ReasoningEffortValue): string {
  switch (value) {
    case "none": return "None";
    case "minimal": return "Minimal";
    case "low": return "Low";
    case "medium": return "Medium";
    case "high": return "High";
    case "xhigh": return "Extra High";
  }
}

export function normalizeReasoningEffortValue(value: unknown): ReasoningEffortValue | null {
  if (typeof value !== "string") return null;
  const lowered = value.trim().toLowerCase();
  return (REASONING_EFFORT_VALUES as readonly string[]).includes(lowered)
    ? lowered as ReasoningEffortValue
    : null;
}

const MENU_WIDTH_PX = 200;
const MENU_VIEWPORT_MARGIN_PX = 12;

export interface ReasoningPickerMenuProps {
  anchor: HTMLElement;
  currentEffort: ReasoningEffortValue | null;
  supportedEfforts?: readonly ReasoningEffortValue[];
  onSelect: (effort: ReasoningEffortValue) => void;
  onClose: () => void;
}

export function ReasoningPickerMenu({
  anchor,
  currentEffort,
  supportedEfforts,
  onSelect,
  onClose,
}: ReasoningPickerMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  /*
   * Position popover above the anchor button, like Codex `Ia` with `side: "top"`.
   * Footer chip is bottom-aligned in HiCodex, so we anchor menu's bottom to the
   * anchor's top with a small gap and use `transform: translateY(-100%)`.
   */
  useLayoutEffect(() => {
    if (anchor == null) return;
    const compute = () => {
      const rect = anchor.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const desiredLeft = rect.left;
      const maxLeft = viewportWidth - MENU_WIDTH_PX - MENU_VIEWPORT_MARGIN_PX;
      const clampedLeft = Math.max(MENU_VIEWPORT_MARGIN_PX, Math.min(desiredLeft, maxLeft));
      setPosition({ top: rect.top - 6, left: clampedLeft });
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [anchor]);

  // Close on outside click / Esc.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      if (target instanceof Node && anchor.contains(target)) return;
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
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [anchor, onClose]);

  const select = useCallback((effort: ReasoningEffortValue) => {
    onSelect(effort);
    onClose();
  }, [onClose, onSelect]);

  if (position == null) return null;

  const options = supportedEfforts ?? REASONING_EFFORT_VALUES;

  return (
    <div
      ref={menuRef}
      className="hc-reasoning-picker-menu"
      role="menu"
      data-state="open"
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        width: MENU_WIDTH_PX,
        transform: "translateY(-100%)",
      }}
    >
      {/*
       * CODEX-REF: composer-D0cvMZjq.js — Fa.Title with FormattedMessage
       *   id `composer.intelligenceDropdown.title`, defaultMessage `Reasoning`.
       */}
      <div className="hc-reasoning-picker-menu-header">Reasoning</div>
      <ul className="hc-reasoning-picker-menu-items" role="none">
        {options.map((effort) => {
          const isActive = effort === currentEffort;
          return (
            <li key={effort} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                className="hc-reasoning-picker-menu-item"
                data-active={isActive ? "true" : undefined}
                data-reasoning-selected={isActive ? "true" : undefined}
                onClick={() => select(effort)}
              >
                <span className="hc-reasoning-picker-menu-item-label">{reasoningEffortLabel(effort)}</span>
                {isActive && <Check aria-hidden size={14} />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
