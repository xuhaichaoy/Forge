/*
 * codex: composer-*.js — StatusTextPanel above-composer slot.
 *
 * Codex Desktop renders this as an `aria-live="polite"` text block
 * (`max-h-30dvh overflow-y-auto`) inside the seventh slot of the
 * above-composer portal stack. It is used for steered-message echo, generic
 * tool/sandbox notices, and other transient turn-status text that should be
 * announced to screen readers without stealing focus.
 *
 * Gating in Codex: the panel renders only when its resolved text flag is
 * truthy. HiCodex mirrors that: returns `null` when the resolved text is empty.
 */
import { AboveComposerPanel } from "./above-composer-panel";

export interface StatusTextPanelProps {
  /** Resolved status text. Component renders nothing when empty / null. */
  text?: string | null;
}

export function StatusTextPanel({ text }: StatusTextPanelProps) {
  // codex: composer-*.js — empty text → no render (matches the text-flag gate).
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (trimmed.length === 0) return null;

  return (
    <AboveComposerPanel className="hc-status-text-panel">
      {/*
        * codex: composer-*.js — aria-live polite + max-h-30dvh +
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
