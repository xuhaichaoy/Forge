import { insertPromptEditorText } from "./prompt-editor";

/*
 * Global plain-text-key → composer redirect, lifted verbatim out of HiCodexApp.
 * When the user types a single printable character outside any editable target,
 * an open dialog/menu/listbox overlay, or a terminal, it is inserted into the
 * composer. The data-* selectors, the space / NBSP ( ) exclusions, and the
 * `event.key.length === 1` printable-char gate are contract-exact — changing any
 * of them changes which keys get swallowed.
 */
export function focusComposerFromPlainTextKey(event: KeyboardEvent): boolean {
  if (!isPlainTextComposerKey(event)) return false;
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (isEditableKeyboardTarget(target)) return false;
  if (target?.closest("[data-codex-terminal]")) return false;
  if (document.querySelector('[role="dialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"]')) return false;
  const composer = document.querySelector<HTMLElement>("[data-codex-composer]");
  if (!composer) return false;
  event.preventDefault();
  insertPromptEditorText(composer, event.key);
  return true;
}

function isPlainTextComposerKey(event: KeyboardEvent): boolean {
  return !event.defaultPrevented
    && !event.isComposing
    && !event.metaKey
    && !event.ctrlKey
    && event.key !== " "
    && event.key !== " "
    && event.key.length === 1;
}

function isEditableKeyboardTarget(target: HTMLElement | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName.toLowerCase();
  return tagName === "input"
    || tagName === "textarea"
    || tagName === "select"
    || target.closest("[contenteditable='true']") != null;
}
