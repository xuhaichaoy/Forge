// codex: electron-menu-shortcuts-*.js#navigateBack/Forward —
// Codex Desktop relies on browser history (`history.back/forward`) when its
// renderer is mounted as a webview. Forge is a Tauri/Electron shell where
// the UI is not a router, so we instead model an in-app thread navigation
// stack and mutate it on `setActiveThread`. Behavior matches a browser back
// stack: switching to a new thread while there are entries ahead of the
// cursor truncates them (forward branch is discarded). Consecutive
// duplicates of the same id are coalesced so navigating to the current
// thread is a no-op.

export interface ThreadHistoryStackPatch {
  threadHistoryStack: string[];
  threadHistoryIndex: number;
}

export function pushThreadHistoryEntry(
  stack: string[],
  index: number,
  nextThreadId: string | null,
): ThreadHistoryStackPatch {
  // codex: null active thread (no selection) is not a history entry.
  if (!nextThreadId) {
    return { threadHistoryStack: stack, threadHistoryIndex: index };
  }
  const current = index >= 0 && index < stack.length ? stack[index] : undefined;
  if (current === nextThreadId) {
    // codex: re-selecting the active thread is a no-op (avoid duplicate
    // adjacent entries that would make Back/Forward feel stuck).
    return { threadHistoryStack: stack, threadHistoryIndex: index };
  }
  // codex: truncate any "forward" branch beyond the cursor before pushing —
  // matches browser history semantics (run-command-*.js dispatches
  // host-message → history.back/forward, which exhibits the same behavior).
  const truncated = index >= 0 && index < stack.length - 1
    ? stack.slice(0, index + 1)
    : stack;
  const nextStack = [...truncated, nextThreadId];
  return {
    threadHistoryStack: nextStack,
    threadHistoryIndex: nextStack.length - 1,
  };
}

export function canNavigateBackInHistory(stack: string[], index: number): boolean {
  return index > 0 && stack.length > 1;
}

export function canNavigateForwardInHistory(stack: string[], index: number): boolean {
  return index >= 0 && index < stack.length - 1;
}
