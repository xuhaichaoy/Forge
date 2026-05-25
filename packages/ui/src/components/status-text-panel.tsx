/*
 * codex: composer-D0cvMZjq.js#U_ — StatusTextPanel above-composer slot.
 *
 * Codex Desktop renders this as a `<bs>`-wrapped `aria-live="polite"` text
 * block (`max-h-30dvh overflow-y-auto`) inside the seventh slot of the
 * above-composer portal stack. It is used for steered-message echo, generic
 * tool/sandbox notices, and other transient turn-status text that should be
 * announced to screen readers without stealing focus.
 *
 * Gating in Codex: `cl && <U_ text={ei} />` — `cl` is the truthy flag, `ei`
 * the resolved text state. HiCodex mirrors that: returns `null` when the
 * resolved text is empty.
 */
import { AboveComposerPanel } from "./above-composer-panel";

export interface StatusTextPanelProps {
  /** Resolved status text. Component renders nothing when empty / null. */
  text?: string | null;
}

export function StatusTextPanel({ text }: StatusTextPanelProps) {
  // codex: composer-D0cvMZjq.js#U_ — empty text → no render (matches `cl` gate).
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (trimmed.length === 0) return null;

  return (
    <AboveComposerPanel className="hc-status-text-panel">
      {/*
        * codex: composer-D0cvMZjq.js#U_ — aria-live polite + max-h-30dvh +
        * overflow-y-auto so long messages remain scrollable inside the slot.
        */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="hc-status-text-panel-body"
      >
        {trimmed}
      </div>
    </AboveComposerPanel>
  );
}

/** Re-export so tests can verify the gate without instantiating. */
export function isStatusTextPanelRenderable(text?: string | null): boolean {
  return typeof text === "string" && text.trim().length > 0;
}
