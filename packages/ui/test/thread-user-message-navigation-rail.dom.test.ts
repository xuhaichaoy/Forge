import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  ConversationView,
  THREAD_USER_MESSAGE_NAVIGATION_MIN_ITEMS,
} from "../src/components/conversation-view";
import { ForgeIntlProvider } from "../src/components/i18n-provider";
import { ThreadScrollLayout } from "../src/components/thread-scroll-layout";
import type { ConversationRenderUnit } from "../src/state/render-groups";
import { setupDomTestEnv, type DomTestEnv } from "./dom-test-env";

export default async function runThreadUserMessageNavigationRailDomTests(): Promise<void> {
  await hidesRailBeforeDesktopThreshold();
  await skipsVisibilityObserverBeforeDesktopThreshold();
  await portalsRailIntoThreadScrollShellOverlay();
  await rendersDesktopTooltipPreviewFromResponseAndOutputs();
}

async function hidesRailBeforeDesktopThreshold(): Promise<void> {
  const mounted = await mountConversationWithThreadScroll(THREAD_USER_MESSAGE_NAVIGATION_MIN_ITEMS - 1);
  try {
    assertEqual(
      mounted.portal().querySelector("[data-thread-user-message-navigation-rail]"),
      null,
      "Desktop hides the user-message navigation rail before four user messages",
    );
  } finally {
    mounted.cleanup();
  }
}

async function skipsVisibilityObserverBeforeDesktopThreshold(): Promise<void> {
  const previousIntersectionObserver = Object.getOwnPropertyDescriptor(globalThis, "IntersectionObserver");
  let constructed = 0;
  class TestIntersectionObserver {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds: ReadonlyArray<number> = [];
    constructor() {
      constructed += 1;
    }
    disconnect(): void {}
    observe(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
    unobserve(): void {}
  }
  Object.defineProperty(globalThis, "IntersectionObserver", {
    configurable: true,
    writable: true,
    value: TestIntersectionObserver as unknown as typeof IntersectionObserver,
  });
  let mounted: MountedThreadConversation | null = null;
  try {
    mounted = await mountConversationWithThreadScroll(THREAD_USER_MESSAGE_NAVIGATION_MIN_ITEMS - 1);
    assertEqual(
      constructed,
      0,
      "short conversations should not start the rail visibility IntersectionObserver",
    );
  } finally {
    mounted?.cleanup();
    if (previousIntersectionObserver) {
      Object.defineProperty(globalThis, "IntersectionObserver", previousIntersectionObserver);
    } else {
      delete (globalThis as Record<string, unknown>).IntersectionObserver;
    }
  }
}

async function portalsRailIntoThreadScrollShellOverlay(): Promise<void> {
  const mounted = await mountConversationWithThreadScroll(THREAD_USER_MESSAGE_NAVIGATION_MIN_ITEMS);
  try {
    const portal = mounted.portal();
    const rail = mounted.rail();
    assertEqual(
      portal.contains(rail),
      true,
      "user-message navigation rail should render into the thread scroll shell overlay",
    );
    assertEqual(
      mounted.scrollContainer().contains(rail),
      false,
      "user-message navigation rail must not live inside scrollable transcript content",
    );
    assertEqual(
      mounted.railRows().length,
      THREAD_USER_MESSAGE_NAVIGATION_MIN_ITEMS,
      "navigation rail should render one marker per user message",
    );
  } finally {
    mounted.cleanup();
  }
}

async function rendersDesktopTooltipPreviewFromResponseAndOutputs(): Promise<void> {
  const mounted = await mountConversationWithThreadScroll(
    THREAD_USER_MESSAGE_NAVIGATION_MIN_ITEMS,
    userMessageNavigationPreviewUnits(),
  );
  try {
    const firstRow = mounted.railRows()[0];
    if (!firstRow) throw new Error("expected a first user-message navigation row");
    dispatchMouse(mounted.env, firstRow, "mouseover");
    await act(async () => {
      await Promise.resolve();
    });
    const tooltip = mounted.env.document.querySelector<HTMLElement>(
      "[data-thread-user-message-navigation-tooltip-preview]",
    );
    if (!tooltip) throw new Error("expected user-message navigation tooltip preview to render on hover");
    const text = tooltip.textContent ?? "";
    assertIncludes(text, "Question 1", "tooltip heading should show the user message label");
    assertIncludes(text, "Answer 1 with details", "tooltip body should show the following assistant response as markdown plain text");
    assertEqual(text.includes("*"), false, "tooltip body should not expose raw markdown emphasis markers");
    assertIncludes(text, "report.md", "tooltip outputs should include the first turn output");
    assertIncludes(text, "example.com", "tooltip outputs should include the second turn output");
    assertIncludes(text, "+1", "tooltip outputs should collapse additional outputs behind a count");
    assertEqual(
      text.includes("Drive brief"),
      false,
      "tooltip should not render more than Desktop's first two output labels",
    );
  } finally {
    mounted.cleanup();
  }
}

async function mountConversationWithThreadScroll(
  messageCount: number,
  units: ConversationRenderUnit[] = userMessageUnits(messageCount),
): Promise<MountedThreadConversation> {
  const env = setupDomTestEnv();
  const host = env.document.createElement("div");
  env.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(ForgeIntlProvider, {
      locale: "en-US",
      children: createElement(ThreadScrollLayout, {
        footer: createElement("div", null, "footer"),
        resetKey: "thread-user-message-navigation-dom",
        children: createElement(ConversationView, {
          units,
        }),
      }),
    }));
  });
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    env.flushFrames(3);
    await Promise.resolve();
  });
  return {
    cleanup: () => {
      act(() => root.unmount());
      env.teardown();
    },
    env,
    portal: () => {
      const portal = env.document.querySelector<HTMLElement>("[data-thread-user-message-navigation-portal]");
      if (!portal) throw new Error("thread user-message navigation portal did not render");
      return portal;
    },
    rail: () => {
      const rail = env.document.querySelector<HTMLElement>("[data-thread-user-message-navigation-rail]");
      if (!rail) throw new Error("thread user-message navigation rail did not render");
      return rail;
    },
    railRows: () => Array.from(env.document.querySelectorAll<HTMLElement>("[data-thread-user-message-navigation-item-id]")),
    root,
    scrollContainer: () => {
      const container = env.document.querySelector<HTMLElement>("[data-thread-scroll-container]");
      if (!container) throw new Error("thread scroll container did not render");
      return container;
    },
  };
}

function userMessageUnits(messageCount: number): ConversationRenderUnit[] {
  return Array.from({ length: messageCount }, (_, index) => ({
    kind: "message",
    key: `user-navigation-${index + 1}`,
    role: "user",
    item: { id: `user-navigation-${index + 1}`, type: "userMessage", content: `Question ${index + 1}` },
    text: `Question ${index + 1}`,
  }));
}

function userMessageNavigationPreviewUnits(): ConversationRenderUnit[] {
  const users = userMessageUnits(THREAD_USER_MESSAGE_NAVIGATION_MIN_ITEMS);
  return [
    users[0]!,
    {
      kind: "message",
      key: "assistant-navigation-1",
      role: "assistant",
      item: { id: "assistant-navigation-1", type: "assistantMessage", content: "**Answer 1** with *details*" },
      text: "::code-comment hidden\n\n**Answer 1** with *details*",
      artifacts: [
        {
          id: "artifact-report",
          title: "report.md",
          reference: { path: "/workspace/report.md", lineStart: 7 },
        },
      ],
      assistantAfter: [
        {
          kind: "assistantEndResources",
          key: "assistant-navigation-resources-1",
          cwd: "/workspace",
          turnId: "turn-1",
          resources: [
            { type: "website", target: "https://example.com/article" },
            {
              type: "google-drive",
              url: "https://drive.google.com/file/d/1",
              title: "Drive brief",
              resourceKind: "document",
            },
          ],
        },
      ],
    },
    ...users.slice(1),
  ];
}

function dispatchMouse(env: DomTestEnv, target: Element, type: string): void {
  act(() => {
    target.dispatchEvent(new env.window.MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      relatedTarget: null,
    }));
  });
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertIncludes(text: string, expected: string, message: string): void {
  if (!text.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(text)} to include ${JSON.stringify(expected)}`);
  }
}

interface MountedThreadConversation {
  cleanup: () => void;
  env: DomTestEnv;
  portal: () => HTMLElement;
  rail: () => HTMLElement;
  railRows: () => HTMLElement[];
  root: Root;
  scrollContainer: () => HTMLElement;
}
