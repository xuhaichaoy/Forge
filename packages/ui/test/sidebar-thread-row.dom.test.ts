import { act, createElement, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Thread } from "@forge/codex-protocol";
import { SidebarThreadRow } from "../src/components/sidebar-thread-row";
import { setupDomTestEnv, type DomTestEnv } from "./dom-test-env";

export default function runSidebarThreadRowDomTests(): void {
  doubleClickingActiveTitleStartsRename();
  doubleClickingInactiveTitleDoesNotStartRename();
  doubleClickingActiveRowOutsideTitleDoesNotStartRename();
  doubleClickingConfirmingArchiveRowDoesNotStartRename();
}

function doubleClickingActiveTitleStartsRename(): void {
  const mounted = mountSidebarThreadRow({ isActive: true });
  try {
    mounted.dispatchDoubleClick(mounted.titleElement());
    assertEqual(mounted.calls.renames.length, 1, "active title double-click should rename");
    assertEqual(mounted.calls.renames[0]?.id, mounted.thread.id, "rename should receive row thread");
    assertEqual(mounted.calls.closeMenu, 1, "rename should close the row menu");
    assertEqual(mounted.calls.clearAnyArchiveConfirmation, 1, "rename should clear archive confirmation");
  } finally {
    mounted.cleanup();
  }
}

function doubleClickingInactiveTitleDoesNotStartRename(): void {
  const mounted = mountSidebarThreadRow({ isActive: false });
  try {
    mounted.dispatchDoubleClick(mounted.titleElement());
    assertEqual(mounted.calls.renames.length, 0, "inactive title double-click should not rename");
    assertEqual(mounted.calls.closeMenu, 0, "inactive title double-click should not close menu");
  } finally {
    mounted.cleanup();
  }
}

function doubleClickingActiveRowOutsideTitleDoesNotStartRename(): void {
  const mounted = mountSidebarThreadRow({ isActive: true });
  try {
    mounted.dispatchDoubleClick(mounted.row());
    assertEqual(mounted.calls.renames.length, 0, "row body double-click should not rename");
    assertEqual(mounted.calls.closeMenu, 0, "row body double-click should not close menu");
  } finally {
    mounted.cleanup();
  }
}

function doubleClickingConfirmingArchiveRowDoesNotStartRename(): void {
  const mounted = mountSidebarThreadRow({ isActive: true, isConfirmingArchive: true });
  try {
    mounted.dispatchDoubleClick(mounted.titleElement());
    assertEqual(mounted.calls.renames.length, 0, "confirming archive title double-click should not rename");
    assertEqual(mounted.calls.closeMenu, 0, "confirming archive title double-click should not close menu");
  } finally {
    mounted.cleanup();
  }
}

interface MountOptions {
  isActive: boolean;
  isConfirmingArchive?: boolean;
}

interface SidebarThreadRowCalls {
  clearAnyArchiveConfirmation: number;
  closeMenu: number;
  renames: Thread[];
}

interface MountedSidebarThreadRow {
  calls: SidebarThreadRowCalls;
  cleanup: () => void;
  dispatchDoubleClick: (target: HTMLElement) => MouseEvent;
  env: DomTestEnv;
  root: Root;
  row: () => HTMLElement;
  thread: Thread;
  titleElement: () => HTMLElement;
}

function mountSidebarThreadRow(options: MountOptions): MountedSidebarThreadRow {
  const env = setupDomTestEnv();
  const container = env.document.createElement("div");
  env.document.body.appendChild(container);
  const root = createRoot(container);
  const thread = threadFixture();
  const calls: SidebarThreadRowCalls = {
    clearAnyArchiveConfirmation: 0,
    closeMenu: 0,
    renames: [],
  };

  act(() => {
    root.render(createElement(SidebarThreadRow, {
      activeThreadIsWorktree: false,
      isActive: options.isActive,
      isConfirmingArchive: options.isConfirmingArchive ?? false,
      isPinned: false,
      menuRef: createRef<HTMLDivElement>(),
      menuState: null,
      onArchiveThread: () => undefined,
      onClearAnyArchiveConfirmation: () => {
        calls.clearAnyArchiveConfirmation += 1;
      },
      onClearArchiveConfirmation: () => undefined,
      onCloseThreadMenu: () => {
        calls.closeMenu += 1;
      },
      onContextMenu: () => undefined,
      onForkThread: () => undefined,
      onRenameThread: (rowThread: Thread) => {
        calls.renames.push(rowThread);
      },
      onRequestArchiveConfirmation: () => undefined,
      onSelectThread: () => undefined,
      thread,
      title: "Thread row",
    }));
  });

  const row = (): HTMLElement => {
    const element = env.document.querySelector<HTMLElement>(".hc-sidebar-thread-row");
    if (!element) throw new Error("sidebar thread row did not render");
    return element;
  };

  const titleElement = (): HTMLElement => {
    const element = row().querySelector<HTMLElement>("[data-thread-title]");
    if (!element) throw new Error("sidebar thread title did not render");
    return element;
  };

  const dispatchDoubleClick = (target: HTMLElement): MouseEvent => {
    const event = new env.window.MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      target.dispatchEvent(event);
    });
    return event;
  };

  return {
    calls,
    cleanup: () => {
      act(() => root.unmount());
      env.teardown();
    },
    dispatchDoubleClick,
    env,
    root,
    row,
    thread,
    titleElement,
  };
}

function threadFixture(): Thread {
  return {
    id: "thread-row",
    extra: null,
    sessionId: "thread-row",
    forkedFromId: null,
    parentThreadId: null,
    preview: "",
    ephemeral: false,
    modelProvider: "openai",
    createdAt: 0,
    updatedAt: 0,
    recencyAt: null,
    status: ({ type: "completed" } as unknown) as Thread["status"],
    path: null,
    cwd: ("/tmp/project" as unknown) as Thread["cwd"],
    cliVersion: "0.0.0",
    source: ("appServer" as unknown) as Thread["source"],
    threadSource: null,
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name: "Thread row",
    turns: [],
  };
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
