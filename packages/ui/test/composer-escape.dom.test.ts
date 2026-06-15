/*
 * Regression suite for the composer prompt keydown priority chain
 * (src/components/composer-prompt-keyboard.ts). The real
 * handleComposerPromptKeyDown is wired into a thin host component and every
 * scenario drives it through a REAL DOM KeyboardEvent dispatched in jsdom and
 * delivered via React's synthetic event system — mirroring production, where
 * the ProseMirror editor hands the native keydown to this handler. No bare
 * function calls.
 */
import { act, createElement, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  handleComposerPromptKeyDown,
  type ComposerPromptKeyDownContext,
} from "../src/components/composer-prompt-keyboard";
import {
  CLOSED_ATTACHMENT_PICKER_STATE,
  type ComposerSendOptions,
} from "../src/state/composer-workflow";
import { projectComposerSubmitState, type ComposerSubmitState } from "../src/state/composer-submit-state";
import { setupDomTestEnv, type DomTestEnv } from "./dom-test-env";

interface ContextSpies {
  closePopovers: number;
  interrupts: number;
  sends: Array<ComposerSendOptions | undefined>;
}

function buildContext(
  overrides: Partial<ComposerPromptKeyDownContext>,
): { context: ComposerPromptKeyDownContext; spies: ContextSpies } {
  const spies: ContextSpies = { closePopovers: 0, interrupts: 0, sends: [] };
  const context: ComposerPromptKeyDownContext = {
    attachActions: [],
    attachmentPicker: CLOSED_ATTACHMENT_PICKER_STATE,
    attachments: [],
    changeAttachments: () => undefined,
    closeComposerPopovers: () => {
      spies.closePopovers += 1;
    },
    hasComposerPopover: false,
    input: "hello",
    mentionOpen: false,
    mentionOptions: [],
    onInterrupt: () => {
      spies.interrupts += 1;
    },
    selectAttachmentMode: () => undefined,
    selectMention: () => undefined,
    selectSlashCommand: () => undefined,
    selectedAttachAction: undefined,
    selectedMention: null,
    selectedSlashCommand: null,
    sendComposer: (options) => {
      spies.sends.push(options);
    },
    setAttachmentPicker: () => undefined,
    setMentionPicker: () => undefined,
    setSlashIndex: () => undefined,
    slashCommands: [],
    slashOpen: false,
    submitState: stoppableSubmitState(),
    ...overrides,
  };
  return { context, spies };
}

/** Running turn, empty input → stop mode with canStopFromEscape: true. */
function stoppableSubmitState(): ComposerSubmitState {
  const state = projectComposerSubmitState({
    input: "",
    attachmentCount: 0,
    connecting: false,
    threadRunning: true,
    activeTurnId: "turn-1",
    pendingRequestCount: 0,
  });
  assertEqual(state.canStopFromEscape, true, "fixture: running turn must be stoppable from Escape");
  return state;
}

/** Running turn, drafted follow-up, queueing on → queue mode (steer on ⌘/Ctrl+Enter). */
function queueingSubmitState(): ComposerSubmitState {
  const state = projectComposerSubmitState({
    input: "follow-up",
    attachmentCount: 0,
    connecting: false,
    threadRunning: true,
    activeTurnId: "turn-1",
    pendingRequestCount: 0,
    queueingEnabled: true,
  });
  assertEqual(state.submitButtonMode, "queue", "fixture: follow-up during a run must be queueable");
  assertEqual(state.threadRuntimeStatus, "running", "fixture: thread must be running");
  assertEqual(state.isQueueingEnabled, true, "fixture: queueing must be enabled");
  assertEqual(state.disabled, false, "fixture: submit must not be disabled");
  return state;
}

interface KeyHost {
  env: DomTestEnv;
  dispatchKey: (init: KeyboardEventInit) => { event: KeyboardEvent; handled: boolean | null };
  cleanup: () => void;
}

function mountKeyHost(context: ComposerPromptKeyDownContext): KeyHost {
  const env = setupDomTestEnv();
  const container = env.document.createElement("div");
  env.document.body.appendChild(container);
  const root = createRoot(container);
  let lastHandled: boolean | null = null;
  act(() => {
    root.render(createElement("div", {
      id: "composer-key-host",
      tabIndex: 0,
      // Production parity: the prompt editor hands the NATIVE keydown event to
      // handleComposerPromptKeyDown; here it arrives through React's synthetic
      // event system after a real dispatchEvent.
      onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => {
        lastHandled = handleComposerPromptKeyDown(event.nativeEvent, context);
      },
    }));
  });
  const host = env.document.getElementById("composer-key-host");
  if (!host) {
    env.teardown();
    throw new Error("key host did not render");
  }
  return {
    env,
    dispatchKey: (init) => {
      lastHandled = null;
      const event = new env.window.KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ...init,
      });
      act(() => {
        host.dispatchEvent(event);
      });
      return { event, handled: lastHandled };
    },
    cleanup: () => {
      act(() => root.unmount());
      env.teardown();
    },
  };
}

/*
 * ① With a composer popover open, Escape must ONLY close the popover — never
 * fall through to interrupting the running turn, even though the submit state
 * says Escape could stop it.
 */
export function escapeClosesOpenPopoverWithoutInterrupting(): void {
  const { context, spies } = buildContext({ hasComposerPopover: true });
  const hostHandle = mountKeyHost(context);
  try {
    const { event, handled } = hostHandle.dispatchKey({ key: "Escape" });
    assertEqual(spies.closePopovers, 1, "Escape with an open popover must close the popover");
    assertEqual(spies.interrupts, 0, "Escape with an open popover must NOT interrupt the turn");
    assertEqual(handled, true, "the handler must claim the event");
    assertEqual(event.defaultPrevented, true, "the handled Escape must be default-prevented");
  } finally {
    hostHandle.cleanup();
  }
}

/* ② No popover + canStopFromEscape → Escape interrupts the running turn. */
export function escapeInterruptsRunningTurnWhenNoPopoverIsOpen(): void {
  const { context, spies } = buildContext({ hasComposerPopover: false });
  const hostHandle = mountKeyHost(context);
  try {
    const { event, handled } = hostHandle.dispatchKey({ key: "Escape" });
    assertEqual(spies.interrupts, 1, "Escape without a popover must interrupt the running turn");
    assertEqual(spies.closePopovers, 0, "no popover close should fire when none is open");
    assertEqual(handled, true, "the handler must claim the event");
    assertEqual(event.defaultPrevented, true, "the handled Escape must be default-prevented");
  } finally {
    hostHandle.cleanup();
  }
}

/*
 * ③ IME guard: while composing (isComposing on the native event), Enter must
 * not submit. The identical keystroke outside composition is the control —
 * it must submit, proving the composing flag is what blocked the first one.
 */
export function imeComposingEnterDoesNotSubmit(): void {
  const { context, spies } = buildContext({ submitState: queueingSubmitState() });
  const hostHandle = mountKeyHost(context);
  try {
    const composing = hostHandle.dispatchKey({ key: "Enter", ctrlKey: true, isComposing: true });
    assertEqual(composing.event.isComposing, true, "fixture: the dispatched event must carry isComposing");
    assertEqual(spies.sends.length, 0, "Enter during IME composition must not submit");
    assertEqual(composing.handled, false, "a composing Enter must fall through unhandled");
    assertEqual(composing.event.defaultPrevented, false, "a composing Enter must not be default-prevented");

    const plain = hostHandle.dispatchKey({ key: "Enter", ctrlKey: true, isComposing: false });
    assertEqual(spies.sends.length, 1, "the same keystroke outside composition must submit");
    assertDeepEqual(
      spies.sends[0],
      { followUpSubmitAction: "steer" },
      "queue-mode Ctrl+Enter must send the steer follow-up action",
    );
    assertEqual(plain.handled, true, "the non-composing Enter must be claimed");
    assertEqual(plain.event.defaultPrevented, true, "the non-composing Enter must be default-prevented");
  } finally {
    hostHandle.cleanup();
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
