/*
 * DOM regression suite for the sidebar archive-confirmation lifecycle
 * (src/components/sidebar.tsx + sidebar-thread-row.tsx + sidebar-interactions.ts).
 *
 * Pins the fixed keyboard bug: with keyboard focus the pointer never leaves the
 * confirming row, so row actions must clear the pending confirmation on ANY row
 * (clearAnyArchiveConfirmation), while pointer-leave keeps its strictly per-row
 * semantics (clearArchiveConfirmation). A real <Sidebar> is mounted in jsdom
 * (test/dom-test-env.ts) and every scenario is driven through real DOM events
 * (KeyboardEvent / PointerEvent / MouseEvent click) delivered via React's
 * delegated listeners — no bare handler calls.
 *
 * jsdom caveats made explicit in the scenarios:
 * - jsdom implements no sequential-focus default action for Tab, so after the
 *   real Tab keydown the focus move itself is performed with the DOM focus() API.
 * - jsdom does not run the UA default action that turns Enter-on-a-<button>
 *   into a click, so the test dispatches both real halves of that activation
 *   sequence explicitly (keydown Enter, then a detail:0 keyboard click).
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Thread } from "@forge/codex-protocol";
import { Sidebar } from "../src/components/sidebar";
import { setupDomTestEnv, type DomTestEnv } from "./dom-test-env";

const THREAD_TITLES = ["Thread A", "Thread B", "Thread C"] as const;

function makeThread(id: string, name: string): Thread {
  return {
    id,
    sessionId: id,
    forkedFromId: null,
    parentThreadId: null,
    preview: "",
    ephemeral: false,
    modelProvider: "openai",
    createdAt: 0,
    updatedAt: 0,
    status: ({ type: "completed" } as unknown) as Thread["status"],
    path: null,
    // A shared real cwd puts all three rows into one expanded project group.
    cwd: ("/tmp/project" as unknown) as Thread["cwd"],
    cliVersion: "0.0.0",
    source: ("appServer" as unknown) as Thread["source"],
    threadSource: null,
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name,
    turns: [],
  };
}

interface SidebarCallLog {
  selects: Thread[];
  archives: Thread[];
}

interface MountedSidebar {
  env: DomTestEnv;
  root: Root;
  threads: Thread[];
  calls: SidebarCallLog;
  row: (title: string) => HTMLElement;
  /** The idle archive icon button of a row (throws if the row is confirming). */
  archiveIconButton: (title: string) => HTMLButtonElement;
  /** The row's "Confirm" button, or null while the row is not confirming. */
  confirmButton: (title: string) => HTMLButtonElement | null;
  /** Titles of every row currently holding a pending archive confirmation. */
  confirmingRowTitles: () => string[];
  dispatchKeyDown: (target: HTMLElement, init: KeyboardEventInit) => KeyboardEvent;
  dispatchClick: (target: HTMLElement, init?: MouseEventInit) => MouseEvent;
  dispatchPointerOver: (target: HTMLElement, relatedTarget: EventTarget | null) => PointerEvent;
  dispatchPointerOut: (target: HTMLElement, relatedTarget: EventTarget | null) => PointerEvent;
  cleanup: () => void;
}

function mountSidebar(): MountedSidebar {
  const env = setupDomTestEnv();
  const container = env.document.createElement("div");
  env.document.body.appendChild(container);
  const threads = [
    makeThread("thread-a", THREAD_TITLES[0]),
    makeThread("thread-b", THREAD_TITLES[1]),
    makeThread("thread-c", THREAD_TITLES[2]),
  ];
  const calls: SidebarCallLog = { selects: [], archives: [] };
  const root = createRoot(container);
  act(() => {
    root.render(createElement(Sidebar, {
      threads,
      activeThreadId: null,
      connected: true,
      connecting: false,
      onConnect: () => undefined,
      onCreateThread: () => undefined,
      onOpenSearch: () => undefined,
      onSelectThread: (thread: Thread) => {
        calls.selects.push(thread);
      },
      onForkThread: () => undefined,
      onRenameThread: () => undefined,
      onArchiveThread: (thread: Thread) => {
        calls.archives.push(thread);
      },
      onOpenSettings: () => undefined,
    }));
  });

  const row = (title: string): HTMLElement => {
    const element = env.document.querySelector<HTMLElement>(
      `.hc-sidebar-thread-row[title="${title}"]`,
    );
    if (!element) throw new Error(`sidebar row ${JSON.stringify(title)} did not render`);
    return element;
  };

  if (env.document.querySelectorAll(".hc-sidebar-thread-row").length !== threads.length) {
    env.teardown();
    throw new Error("sidebar must render exactly one row per thread fixture");
  }

  const dispatch = <T extends Event>(target: HTMLElement, event: T): T => {
    act(() => {
      target.dispatchEvent(event);
    });
    return event;
  };

  return {
    env,
    root,
    threads,
    calls,
    row,
    archiveIconButton: (title) => {
      const button = row(title).querySelector<HTMLButtonElement>(".hc-thread-actions button");
      if (!button) throw new Error(`row ${JSON.stringify(title)} has no action button`);
      if (button.classList.contains("hc-thread-confirm-archive")) {
        throw new Error(`row ${JSON.stringify(title)} is already confirming — no idle archive button`);
      }
      return button;
    },
    confirmButton: (title) =>
      row(title).querySelector<HTMLButtonElement>(".hc-thread-confirm-archive"),
    confirmingRowTitles: () =>
      Array.from(env.document.querySelectorAll<HTMLElement>(
        '.hc-sidebar-thread-row[data-confirming-archive="true"]',
      )).map((element) => element.getAttribute("title") ?? "<untitled>"),
    dispatchKeyDown: (target, init) =>
      dispatch(target, new env.window.KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ...init,
      })),
    dispatchClick: (target, init = {}) =>
      dispatch(target, new env.window.MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        ...init,
      })),
    // React synthesizes onPointerEnter/onPointerLeave from native
    // pointerover/pointerout + relatedTarget (react-dom registerDirectEvent),
    // so the real browser hover traffic is pointerover/pointerout.
    dispatchPointerOver: (target, relatedTarget) =>
      dispatch(target, new env.window.PointerEvent("pointerover", {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: "mouse",
        relatedTarget,
      })),
    dispatchPointerOut: (target, relatedTarget) =>
      dispatch(target, new env.window.PointerEvent("pointerout", {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: "mouse",
        relatedTarget,
      })),
    cleanup: () => {
      act(() => root.unmount());
      env.teardown();
    },
  };
}

/*
 * ① Keyboard path (the fixed bug): Tab to row A's archive button, Enter arms
 * the confirmation, focus moves to row B, Enter selects B — and that row
 * action must clear row A's pending confirmation even though the pointer
 * never left row A. A per-row clear would strand A's Confirm button.
 */
export function enterOnAnotherRowSelectsItAndClearsForeignConfirmation(): void {
  const mounted = mountSidebar();
  try {
    // Tab keystroke is real; the focus move is the UA default action jsdom
    // does not implement, so it is performed with the real DOM focus() API.
    mounted.dispatchKeyDown(mounted.env.document.body, { key: "Tab" });
    const archiveA = mounted.archiveIconButton(THREAD_TITLES[0]);
    act(() => {
      archiveA.focus();
    });
    assertEqual(
      mounted.env.document.activeElement,
      archiveA,
      "precondition: row A's archive button holds keyboard focus",
    );

    // Enter on the focused <button>: the keydown itself must NOT select the
    // row (the row keydown guard ignores events from descendants)…
    const enterOnButton = mounted.dispatchKeyDown(archiveA, { key: "Enter" });
    assertEqual(enterOnButton.defaultPrevented, false, "the row must not claim a descendant's keydown");
    assertEqual(mounted.calls.selects.length, 0, "Enter on the archive button must not select the row");
    // …and the UA half of the activation is the keyboard click (detail 0).
    mounted.dispatchClick(archiveA, { detail: 0 });
    assertDeepEqual(
      mounted.confirmingRowTitles(),
      [THREAD_TITLES[0]],
      "activating the archive button must arm row A's confirmation",
    );
    if (!mounted.confirmButton(THREAD_TITLES[0])) {
      throw new Error("row A must swap the archive icon for its Confirm button");
    }
    assertEqual(mounted.calls.archives.length, 0, "arming the confirmation must not archive yet");

    // Focus moves to row B; Enter selects it through the row's own keydown handler.
    const rowB = mounted.row(THREAD_TITLES[1]);
    act(() => {
      rowB.focus();
    });
    const enterOnRowB = mounted.dispatchKeyDown(rowB, { key: "Enter" });
    assertEqual(enterOnRowB.defaultPrevented, true, "Enter on a thread row must be claimed");
    assertEqual(mounted.calls.selects.length, 1, "Enter on row B must select exactly once");
    assertEqual(
      mounted.calls.selects[0],
      mounted.threads[1],
      "row B's Enter must pass thread B by identity to onSelectThread",
    );
    assertDeepEqual(
      mounted.confirmingRowTitles(),
      [],
      "selecting row B must clear row A's pending confirmation (clear-ANY-row semantics)",
    );
    assertEqual(
      mounted.confirmButton(THREAD_TITLES[0]),
      null,
      "row A's Confirm button must be gone after the foreign row action",
    );
    assertEqual(mounted.calls.archives.length, 0, "no archive may fire from the selection");
  } finally {
    mounted.cleanup();
  }
}

/*
 * ② Pointer path: pointer-leave keeps its per-row semantics. Leaving the
 * confirming row clears its confirmation; hovering and then leaving a
 * DIFFERENT row must leave the original confirmation untouched.
 */
export function pointerLeaveClearsOnlyTheRowThatOwnsTheConfirmation(): void {
  const mounted = mountSidebar();
  try {
    const rowA = mounted.row(THREAD_TITLES[0]);
    const rowB = mounted.row(THREAD_TITLES[1]);

    mounted.dispatchClick(mounted.archiveIconButton(THREAD_TITLES[0]));
    assertDeepEqual(mounted.confirmingRowTitles(), [THREAD_TITLES[0]], "precondition: row A confirming");

    // Pointer slides from row A onto row B → pointerout with relatedTarget=rowB
    // synthesizes onPointerLeave for row A.
    mounted.dispatchPointerOut(rowA, rowB);
    assertDeepEqual(
      mounted.confirmingRowTitles(),
      [],
      "pointer leaving row A must clear row A's own confirmation",
    );

    // Re-arm row A, then hover row B and leave row B toward the page body.
    mounted.dispatchClick(mounted.archiveIconButton(THREAD_TITLES[0]));
    assertDeepEqual(mounted.confirmingRowTitles(), [THREAD_TITLES[0]], "row A re-armed");
    mounted.dispatchPointerOver(rowB, mounted.env.document.body);
    mounted.dispatchPointerOut(rowB, mounted.env.document.body);
    assertDeepEqual(
      mounted.confirmingRowTitles(),
      [THREAD_TITLES[0]],
      "pointer leaving row B must NOT clear row A's confirmation (per-row clear semantics)",
    );
    assertEqual(mounted.calls.archives.length, 0, "pointer traffic must never archive");
    assertEqual(mounted.calls.selects.length, 0, "pointer traffic must never select");
  } finally {
    mounted.cleanup();
  }
}

/* ③ Clicking Confirm archives THAT thread and clears the confirmation state. */
export function confirmClickArchivesTheThreadAndClearsConfirmation(): void {
  const mounted = mountSidebar();
  try {
    mounted.dispatchClick(mounted.archiveIconButton(THREAD_TITLES[0]));
    const confirm = mounted.confirmButton(THREAD_TITLES[0]);
    if (!confirm) throw new Error("precondition: row A must show its Confirm button");

    mounted.dispatchClick(confirm);
    assertEqual(mounted.calls.archives.length, 1, "Confirm must archive exactly once");
    assertEqual(
      mounted.calls.archives[0],
      mounted.threads[0],
      "Confirm must pass thread A by identity to onArchiveThread",
    );
    assertDeepEqual(mounted.confirmingRowTitles(), [], "archiving must clear the confirmation state");
    assertEqual(
      mounted.confirmButton(THREAD_TITLES[0]),
      null,
      "row A must return to the idle archive icon",
    );
    assertEqual(
      mounted.calls.selects.length,
      0,
      "the Confirm click must not bubble into a row selection",
    );
  } finally {
    mounted.cleanup();
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
