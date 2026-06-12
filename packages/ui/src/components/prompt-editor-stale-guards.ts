import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

export function promptEditorViewFromElement(element: HTMLElement | null): EditorView | null {
  if (!element || !element.isConnected) return null;
  const view = (element as HTMLElement & { pmViewDesc?: { editorView?: EditorView } }).pmViewDesc?.editorView;
  if (!view || isEditorViewUnavailable(view)) return null;
  return view;
}

export function isEditorViewDestroyed(view: EditorView): boolean {
  return view.isDestroyed || (view as EditorView & { docView?: unknown }).docView == null;
}

function isEditorViewDetached(view: EditorView): boolean {
  return (view as unknown as GuardedEditorView)[promptEditorDetachedSymbol] === true;
}

export function isEditorViewUnavailable(view: EditorView): boolean {
  return isEditorViewDestroyed(view) || isEditorViewDetached(view);
}

export function safeUpdateEditorState(view: EditorView, state: EditorState): boolean {
  if (isEditorViewUnavailable(view)) return false;
  try {
    view.updateState(state);
    return !isEditorViewUnavailable(view);
  } catch (error) {
    if (isStaleEditorViewError(error)) {
      markEditorViewDestroyed(view);
      return false;
    }
    throw error;
  }
}

export function safeDispatchEditorTransaction(view: EditorView, transaction: EditorState["tr"]): boolean {
  if (isEditorViewUnavailable(view)) return false;
  try {
    view.dispatch(transaction);
    return !isEditorViewUnavailable(view);
  } catch (error) {
    if (isStaleEditorViewError(error)) {
      markEditorViewDestroyed(view);
      return false;
    }
    throw error;
  }
}

export function safeFocusEditorView(view: EditorView): void {
  if (isEditorViewUnavailable(view) || !view.dom.isConnected) return;
  try {
    view.focus();
  } catch (error) {
    if (isStaleEditorViewError(error)) {
      markEditorViewDestroyed(view);
      return;
    }
    throw error;
  }
}

export function installEditorViewStaleGuards(view: EditorView): void {
  const guardedView = view as unknown as GuardedEditorView;
  if (guardedView[promptEditorStaleGuardSymbol]) return;
  guardedView[promptEditorStaleGuardSymbol] = true;

  if (typeof guardedView.updateStateInner === "function") {
    const updateStateInner = guardedView.updateStateInner.bind(view);
    guardedView.updateStateInner = (state, prevProps) => {
      runEditorViewOperation(view, () => updateStateInner(state, prevProps));
    };
  }

  const update = view.update.bind(view);
  view.update = (props) => {
    runEditorViewOperation(view, () => update(props));
  };

  const setProps = view.setProps.bind(view);
  view.setProps = (props) => {
    runEditorViewOperation(view, () => setProps(props));
  };

  const updateState = view.updateState.bind(view);
  view.updateState = (state) => {
    runEditorViewOperation(view, () => updateState(state));
  };

  const dispatch = view.dispatch.bind(view);
  view.dispatch = (transaction) => {
    runEditorViewOperation(view, () => dispatch(transaction));
  };

  const focus = view.focus.bind(view);
  view.focus = () => {
    if (!view.dom.isConnected) return;
    runEditorViewOperation(view, () => focus());
  };

  const destroy = view.destroy.bind(view);
  view.destroy = () => {
    if (isEditorViewDestroyed(view)) return;
    try {
      destroy();
    } catch (error) {
      if (!isStaleEditorViewError(error)) throw error;
      markEditorViewDestroyed(view);
    }
  };

  installDomObserverStaleGuards(view);
}

export function safeFocusElement(element: HTMLElement | null): void {
  if (!element || !element.isConnected) return;
  try {
    element.focus();
  } catch (error) {
    if (isStaleEditorViewError(error)) return;
    throw error;
  }
}

export function isStalePromptEditorViewError(error: unknown): boolean {
  return isStaleEditorViewError(error);
}

export function installPromptEditorViewStaleGuardsForTest(view: EditorView): void {
  installEditorViewStaleGuards(view);
}

export function setPromptEditorViewDetachedForTest(view: EditorView, detached: boolean): void {
  markEditorViewDetached(view, detached);
}

function isStaleEditorViewError(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error != null && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : typeof error === "string" ? error : "";
  return /docView|matchesNode/i.test(message);
}

const promptEditorStaleGuardSymbol = Symbol("hicodex.promptEditor.staleGuard");
const promptEditorDetachedSymbol = Symbol("hicodex.promptEditor.detached");

type GuardedEditorView = {
  [promptEditorStaleGuardSymbol]?: true;
  [promptEditorDetachedSymbol]?: true;
  docView?: unknown;
  updateStateInner?: (state: EditorState, prevProps: unknown) => void;
  domObserver?: {
    flush?: () => void;
    flushSoon?: () => void;
    forceFlush?: () => void;
    start?: () => void;
    stop?: () => void;
  };
};

function runEditorViewOperation<T>(view: EditorView, operation: () => T): T | undefined {
  if (isEditorViewUnavailable(view)) return undefined;
  try {
    return operation();
  } catch (error) {
    if (isStaleEditorViewError(error)) {
      markEditorViewDestroyed(view);
      return undefined;
    }
    throw error;
  }
}

function markEditorViewDestroyed(view: EditorView): void {
  (view as EditorView & { docView?: unknown }).docView = null;
}

export function markEditorViewDetached(view: EditorView, detached: boolean): void {
  const guardedView = view as unknown as GuardedEditorView;
  if (detached) guardedView[promptEditorDetachedSymbol] = true;
  else delete guardedView[promptEditorDetachedSymbol];
}

export function stopEditorDomObserver(view: EditorView): void {
  const observer = (view as unknown as GuardedEditorView).domObserver;
  if (!observer || typeof observer.stop !== "function") return;
  try {
    observer.stop();
  } catch (error) {
    if (!isStaleEditorViewError(error)) throw error;
    markEditorViewDestroyed(view);
  }
}

export function startEditorDomObserver(view: EditorView): void {
  const observer = (view as unknown as GuardedEditorView).domObserver;
  if (!observer || typeof observer.start !== "function") return;
  try {
    observer.start();
  } catch (error) {
    if (!isStaleEditorViewError(error)) throw error;
    markEditorViewDestroyed(view);
  }
}

function installDomObserverStaleGuards(view: EditorView): void {
  const observer = (view as unknown as GuardedEditorView).domObserver;
  if (!observer) return;

  if (typeof observer.flush === "function") {
    const flush = observer.flush.bind(observer);
    observer.flush = () => {
      runEditorViewOperation(view, () => flush());
    };
  }

  if (typeof observer.flushSoon === "function") {
    const flushSoon = observer.flushSoon.bind(observer);
    observer.flushSoon = () => {
      runEditorViewOperation(view, () => flushSoon());
    };
  }

  if (typeof observer.forceFlush === "function") {
    const forceFlush = observer.forceFlush.bind(observer);
    observer.forceFlush = () => {
      runEditorViewOperation(view, () => forceFlush());
    };
  }
}
