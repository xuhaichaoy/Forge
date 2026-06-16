import { act, createElement, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Thread } from "@forge/codex-protocol";
import { SidebarThreadMenu } from "../src/components/sidebar-thread-menu";
import { setupDomTestEnv, type DomTestEnv } from "./dom-test-env";

export default function runSidebarThreadMenuDomTests(): void {
  rendersNewWindowActionAfterForkActions();
}

function rendersNewWindowActionAfterForkActions(): void {
  const mounted = mountSidebarThreadMenu();
  try {
    const labels = Array.from(mounted.env.document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .map((item) => item.textContent?.trim() ?? "");
    assertLessThan(
      labels.indexOf("Copy deeplink"),
      labels.indexOf("Fork into local"),
      "copy actions should stay before fork actions",
    );
    assertLessThan(
      labels.indexOf("Fork into local"),
      labels.indexOf("Fork into new worktree"),
      "same-worktree/local fork should stay before new-worktree fork",
    );
    assertLessThan(
      labels.indexOf("Fork into new worktree"),
      labels.indexOf("Open in new window"),
      "Desktop places Open in new window in a separate section after fork actions",
    );
  } finally {
    mounted.cleanup();
  }
}

function mountSidebarThreadMenu(): { env: DomTestEnv; root: Root; cleanup: () => void } {
  const env = setupDomTestEnv();
  const container = env.document.createElement("div");
  env.document.body.appendChild(container);
  const root = createRoot(container);
  const thread = threadFixture();
  const run = (action: (thread: Thread) => void | Promise<void>) => {
    void action(thread);
  };
  act(() => {
    root.render(createElement(SidebarThreadMenu, {
      activeThreadIsWorktree: false,
      isActive: false,
      isPinned: false,
      isUnread: false,
      menuRef: createRef<HTMLDivElement>(),
      menuState: { threadId: thread.id, x: 0, y: 0 },
      onArchiveThread: () => undefined,
      onCloseThreadMenu: () => undefined,
      onCopyDeeplink: () => undefined,
      onCopySessionId: () => undefined,
      onCopyWorkingDirectory: () => undefined,
      onForkThread: () => undefined,
      onForkThreadIntoWorktree: () => undefined,
      onMarkThreadUnread: () => undefined,
      onOpenThreadFolder: () => undefined,
      onOpenThreadWindow: () => undefined,
      onRenameThread: () => undefined,
      onRunThreadAction: run,
      onRunOptionalThreadAction: (action) => {
        if (action) run(action);
      },
      thread,
      threadCwd: "/tmp/project",
    }));
  });
  return {
    env,
    root,
    cleanup: () => {
      act(() => root.unmount());
      env.teardown();
    },
  };
}

function threadFixture(): Thread {
  return {
    id: "thread-menu",
    sessionId: "thread-menu",
    forkedFromId: null,
    parentThreadId: null,
    preview: "",
    ephemeral: false,
    modelProvider: "openai",
    createdAt: 0,
    updatedAt: 0,
    status: ({ type: "idle" } as unknown) as Thread["status"],
    path: null,
    cwd: ("/tmp/project" as unknown) as Thread["cwd"],
    cliVersion: "0.0.0",
    source: ("appServer" as unknown) as Thread["source"],
    threadSource: null,
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name: "Thread menu",
    turns: [],
  };
}

function assertLessThan(actual: number, expectedUpperBound: number, message: string): void {
  if (actual < 0 || expectedUpperBound < 0 || actual >= expectedUpperBound) {
    throw new Error(`${message}: expected ${actual} to be before ${expectedUpperBound}`);
  }
}
