import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  ConversationView,
  THREAD_USER_MESSAGE_NAVIGATION_MIN_ITEMS,
} from "../src/components/conversation-view";
import { ForgeIntlProvider } from "../src/components/i18n-provider";
import { ThreadScrollLayout } from "../src/components/thread-scroll-layout";
import type { ConversationRenderUnit } from "../src/state/render-groups";
import { setupDomTestEnv, stubElementGeometry, type DomTestEnv } from "./dom-test-env";

interface ScrollToCall {
  top: number;
  behavior: string;
}

export default async function runThreadUserMessageNavigationRailDomTests(): Promise<void> {
  await hidesRailBeforeDesktopThreshold();
  await skipsVisibilityObserverBeforeDesktopThreshold();
  await ignoresStreamingDomMutationsWithoutNavigationTargets();
  await portalsRailIntoThreadScrollShellOverlay();
  await gatesRailOnDesktopLeftSideSpace();
  await observesDesktopTurnRowsForVisibleMarker();
  await marksContiguousVisibleRangeAsCurrent();
  await delegatesRevealToVirtualizedTurnLocator();
  await alignsRevealUsingThreadScrollController();
  await scrubbingAcrossMarkersRevealsInstantlyAndSuppressesFollowupClick();
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
  let constructed = 0;
  const restoreIntersectionObserver = installTestIntersectionObserver(() => {
    constructed += 1;
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
    restoreIntersectionObserver();
  }
}

async function ignoresStreamingDomMutationsWithoutNavigationTargets(): Promise<void> {
  const restoreIntersectionObserver = installTestIntersectionObserver();
  const mounted = await mountConversationWithThreadScroll(THREAD_USER_MESSAGE_NAVIGATION_MIN_ITEMS);
  try {
    const scrollContainer = mounted.scrollContainer();
    const originalQuerySelectorAll = scrollContainer.querySelectorAll.bind(scrollContainer);
    let targetScans = 0;
    Object.defineProperty(scrollContainer, "querySelectorAll", {
      configurable: true,
      value: ((selectors: string) => {
        if (selectors === "[data-content-search-unit-key]") targetScans += 1;
        return originalQuerySelectorAll(selectors);
      }) as HTMLElement["querySelectorAll"],
    });
    const firstUnit = scrollContainer.querySelector<HTMLElement>("[data-content-search-unit-key]");
    if (!firstUnit) throw new Error("expected a mounted content-search unit");
    act(() => {
      firstUnit.appendChild(mounted.env.document.createTextNode(" streaming output chunk"));
    });
    await act(async () => {
      await Promise.resolve();
      mounted.env.flushFrames(2);
      await Promise.resolve();
    });
    assertEqual(
      targetScans,
      0,
      "streaming text mutations inside an existing message should not rescan rail visibility targets",
    );
  } finally {
    mounted.cleanup();
    restoreIntersectionObserver();
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

async function gatesRailOnDesktopLeftSideSpace(): Promise<void> {
  const restoreResizeObserver = installTestResizeObserver();
  const mounted = await mountConversationWithThreadScroll(THREAD_USER_MESSAGE_NAVIGATION_MIN_ITEMS);
  try {
    const scrollContainer = mounted.scrollContainer();
    const portalTarget = scrollContainer.querySelector<HTMLElement>("[data-mcp-app-portal-target='true']");
    if (!portalTarget) throw new Error("expected the thread body portal target");
    stubElementRect(mounted.env, scrollContainer, { left: 0, top: 0, width: 500, height: 500 });
    stubElementRect(mounted.env, portalTarget, { left: 20, top: 0, width: 400, height: 500 });
    await act(async () => {
      mounted.env.window.dispatchEvent(new mounted.env.window.Event("resize"));
      mounted.env.flushFrames(1);
      await Promise.resolve();
    });
    assertEqual(
      mounted.portal().querySelector("[data-thread-user-message-navigation-rail]"),
      null,
      "Desktop hides the prompt rail when the left gutter cannot fit the 12px offset plus 36px marker row",
    );
    stubElementRect(mounted.env, portalTarget, { left: 60, top: 0, width: 400, height: 500 });
    await act(async () => {
      mounted.env.window.dispatchEvent(new mounted.env.window.Event("resize"));
      mounted.env.flushFrames(1);
      await Promise.resolve();
    });
    assertEqual(
      mounted.portal().querySelector("[data-thread-user-message-navigation-rail]") != null,
      true,
      "the rail should render once the Desktop side-space gate has enough left gutter",
    );
  } finally {
    mounted.cleanup();
    restoreResizeObserver();
  }
}

async function observesDesktopTurnRowsForVisibleMarker(): Promise<void> {
  const observedTargets: Element[] = [];
  const restoreIntersectionObserver = installTestIntersectionObserver({
    onObserve: (target) => observedTargets.push(target),
  });
  let mounted: MountedThreadConversation | null = null;
  try {
    mounted = await mountConversationWithThreadScroll(THREAD_USER_MESSAGE_NAVIGATION_MIN_ITEMS);
    assertEqual(
      observedTargets.length >= THREAD_USER_MESSAGE_NAVIGATION_MIN_ITEMS,
      true,
      "precondition: the rail should observe mounted user-message visibility targets",
    );
    assertEqual(
      observedTargets.every((target) => target instanceof HTMLElement && target.hasAttribute("data-content-search-turn-key")),
      true,
      "Desktop observes the closest turn/search row, not the inner content-search unit directly",
    );
  } finally {
    mounted?.cleanup();
    restoreIntersectionObserver();
  }
}

async function marksContiguousVisibleRangeAsCurrent(): Promise<void> {
  let observerCallback: IntersectionObserverCallback | null = null;
  const observedTargets: Element[] = [];
  const restoreIntersectionObserver = installTestIntersectionObserver({
    onConstruct: (callback) => {
      observerCallback = callback;
    },
    onObserve: (target) => observedTargets.push(target),
  });
  let mounted: MountedThreadConversation | null = null;
  try {
    mounted = await mountConversationWithThreadScroll(THREAD_USER_MESSAGE_NAVIGATION_MIN_ITEMS);
    const rows = mounted.railRows();
    assertEqual(observedTargets.length >= 3, true, "precondition: expected at least three observed rail targets");
    if (!observerCallback) throw new Error("expected rail visibility observer callback");
    act(() => {
      observerCallback?.([
        visibleIntersectionEntry(observedTargets[0]!),
        visibleIntersectionEntry(observedTargets[2]!),
      ], {} as IntersectionObserver);
    });
    assertEqual(rows[0]?.getAttribute("aria-current"), "true", "first visible marker should be current");
    assertEqual(
      rows[1]?.getAttribute("aria-current"),
      "true",
      "Desktop marks the contiguous range between the first and last visible marker as current",
    );
    assertEqual(rows[2]?.getAttribute("aria-current"), "true", "last visible marker should be current");
    assertEqual(rows[3]?.getAttribute("aria-current"), null, "marker outside the visible range should not be current");
  } finally {
    mounted?.cleanup();
    restoreIntersectionObserver();
  }
}

async function delegatesRevealToVirtualizedTurnLocator(): Promise<void> {
  const mounted = await mountConversationWithThreadScroll(THREAD_USER_MESSAGE_NAVIGATION_MIN_ITEMS);
  const scrollContainer = mounted.scrollContainer();
  const scrollToCalls = installReverseThreadScrollGeometry(mounted.env, scrollContainer);
  const restoreComputedStyle = installReverseThreadScrollStyle(scrollContainer);
  try {
    const firstRow = mounted.railRows()[0];
    if (!firstRow) throw new Error("expected a first user-message navigation row");
    const targetSelector = '[data-content-search-unit-key="user-navigation-1"]';
    const firstUnit = scrollContainer.querySelector<HTMLElement>(targetSelector);
    if (!firstUnit) throw new Error("expected a mounted first user-message unit");
    const originalQuerySelector = scrollContainer.querySelector.bind(scrollContainer);
    Object.defineProperty(scrollContainer, "querySelector", {
      configurable: true,
      value: ((selectors: string) => {
        if (selectors === targetSelector) return null;
        return originalQuerySelector(selectors);
      }) as HTMLElement["querySelector"],
    });
    stubElementRect(mounted.env, scrollContainer, { top: 0, height: 500 });
    stubElementRect(mounted.env, firstUnit, { top: -700, height: 80 });

    dispatchMouse(mounted.env, firstRow, "click");
    await act(async () => {
      mounted.env.flushFrames(1);
      await Promise.resolve();
    });
    assertEqual(
      scrollToCalls.length >= 2,
      true,
      "rail reveal should delegate to the virtual list: first mount the target window, then align the concrete unit",
    );
    assertEqual(
      scrollToCalls.at(-1)?.top,
      -1_356,
      "virtual list should use the located content-search unit for the final alignment",
    );
    assertEqual(
      scrollToCalls.at(-1)?.behavior,
      "smooth",
      "ordinary rail clicks should keep smooth final alignment even when virtualization has to mount the target first",
    );

    await act(async () => {
      mounted.env.flushFrames(1);
      await Promise.resolve();
    });
    assertEqual(
      scrollToCalls.at(-1)?.top,
      -1_356,
      "rail should not run a second independent reveal loop after the virtual list finishes alignment",
    );
    assertEqual(firstRow.getAttribute("aria-current"), "true", "clicked marker should become active immediately");
  } finally {
    restoreComputedStyle();
    mounted.cleanup();
  }
}

async function alignsRevealUsingThreadScrollController(): Promise<void> {
  const mounted = await mountConversationWithThreadScroll(THREAD_USER_MESSAGE_NAVIGATION_MIN_ITEMS);
  const scrollContainer = mounted.scrollContainer();
  const scrollToCalls = installReverseThreadScrollGeometry(mounted.env, scrollContainer);
  const restoreComputedStyle = installReverseThreadScrollStyle(scrollContainer);
  try {
    const firstRow = mounted.railRows()[0];
    if (!firstRow) throw new Error("expected a first user-message navigation row");
    const firstUnit = scrollContainer.querySelector<HTMLElement>('[data-content-search-unit-key="user-navigation-1"]');
    if (!firstUnit) throw new Error("expected a mounted first user-message unit");
    let scrollIntoViewCalls = 0;
    firstUnit.scrollIntoView = () => {
      scrollIntoViewCalls += 1;
    };
    stubElementRect(mounted.env, scrollContainer, { top: 0, height: 500 });
    stubElementRect(mounted.env, firstUnit, { top: -700, height: 80 });

    dispatchMouse(mounted.env, firstRow, "click");
    await act(async () => {
      mounted.env.flushFrames(1);
      await Promise.resolve();
    });

    assertEqual(scrollIntoViewCalls, 0, "rail reveal should not depend on native scrollIntoView in reverse thread scrolling");
    assertEqual(scrollToCalls.length, 1, "mounted user-message reveal should use the direct scroll-controller path");
    assertEqual(
      scrollToCalls.at(-1)?.top,
      -1_000,
      "rail reveal should align the mounted user message directly at the top of the thread viewport",
    );
    assertEqual(
      scrollToCalls.at(-1)?.behavior,
      "smooth",
      "clicking a mounted rail marker should keep Desktop's smooth reveal behavior",
    );
  } finally {
    restoreComputedStyle();
    mounted.cleanup();
  }
}

async function scrubbingAcrossMarkersRevealsInstantlyAndSuppressesFollowupClick(): Promise<void> {
  const mounted = await mountConversationWithThreadScroll(THREAD_USER_MESSAGE_NAVIGATION_MIN_ITEMS);
  const scrollContainer = mounted.scrollContainer();
  const scrollToCalls = installReverseThreadScrollGeometry(mounted.env, scrollContainer);
  const restoreComputedStyle = installReverseThreadScrollStyle(scrollContainer);
  const originalElementFromPoint = mounted.env.document.elementFromPoint?.bind(mounted.env.document);
  try {
    const rows = mounted.railRows();
    const firstRow = rows[0];
    const thirdRow = rows[2];
    if (!firstRow || !thirdRow) throw new Error("expected at least three user-message navigation rows");
    installPointerCapture(firstRow);
    const thirdUnit = scrollContainer.querySelector<HTMLElement>('[data-content-search-unit-key="user-navigation-3"]');
    if (!thirdUnit) throw new Error("expected the third user-message unit to be mounted");
    stubElementRect(mounted.env, scrollContainer, { top: 0, height: 500 });
    stubElementRect(mounted.env, thirdUnit, { top: -250, height: 80 });
    Object.defineProperty(mounted.env.document, "elementFromPoint", {
      configurable: true,
      value: () => thirdRow,
    });

    dispatchPointer(mounted.env, firstRow, "pointerdown", { button: 0, buttons: 1, pointerId: 7 });
    assertEqual(firstRow.getAttribute("data-scrub-target"), "true", "pointer down should mark the captured rail row as the scrub target");
    dispatchPointer(mounted.env, mounted.railList(), "pointermove", { buttons: 1, clientY: 128, pointerId: 7 });
    assertEqual(thirdRow.getAttribute("data-scrub-target"), "true", "dragging over another marker should move the scrub target");
    assertEqual(thirdRow.getAttribute("aria-current"), "true", "scrubbed marker should become the active marker");
    assertEqual(
      scrollToCalls.at(-1)?.behavior,
      "auto",
      "scrubbing should reveal the newly hovered marker with Desktop's instant scroll behavior",
    );

    dispatchPointer(mounted.env, mounted.railList(), "pointerup", { buttons: 0, pointerId: 7 });
    const callsAfterPointerUp = scrollToCalls.length;
    dispatchMouse(mounted.env, firstRow, "click");
    assertEqual(
      scrollToCalls.length,
      callsAfterPointerUp,
      "the click synthesized after a scrub should be suppressed instead of firing a second smooth reveal",
    );
  } finally {
    if (originalElementFromPoint) {
      Object.defineProperty(mounted.env.document, "elementFromPoint", {
        configurable: true,
        value: originalElementFromPoint,
      });
    } else {
      delete (mounted.env.document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
    }
    restoreComputedStyle();
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
    railList: () => {
      const list = env.document.querySelector<HTMLElement>("[data-thread-user-message-navigation-rail-list]");
      if (!list) throw new Error("thread user-message navigation rail list did not render");
      return list;
    },
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

function dispatchPointer(
  env: DomTestEnv,
  target: Element,
  type: string,
  init: MouseEventInit & { buttons?: number; pointerId?: number } = {},
): void {
  act(() => {
    const event = new env.window.MouseEvent(type, {
      bubbles: true,
      button: init.button ?? 0,
      buttons: init.buttons ?? 0,
      cancelable: true,
      clientY: init.clientY ?? 0,
      relatedTarget: null,
    });
    Object.defineProperty(event, "pointerId", {
      configurable: true,
      value: init.pointerId ?? 1,
    });
    target.dispatchEvent(event);
  });
}

function installPointerCapture(element: HTMLElement): void {
  const capturedPointers = new Set<number>();
  element.setPointerCapture = (pointerId: number) => {
    capturedPointers.add(pointerId);
  };
  element.hasPointerCapture = (pointerId: number) => capturedPointers.has(pointerId);
  element.releasePointerCapture = (pointerId: number) => {
    capturedPointers.delete(pointerId);
  };
}

function installReverseThreadScrollGeometry(
  env: DomTestEnv,
  scrollContainer: HTMLElement,
): ScrollToCall[] {
  const geometry = stubElementGeometry(scrollContainer, {
    clientHeight: 500,
    offsetHeight: 500,
    scrollHeight: 2_200,
    scrollTop: -300,
  });
  const scrollToCalls: ScrollToCall[] = [];
  Object.defineProperty(scrollContainer, "scrollTo", {
    configurable: true,
    writable: true,
    value: (options: { top?: number; behavior?: string } = {}) => {
      const top = options.top ?? 0;
      geometry.scrollTop = top;
      scrollToCalls.push({ top, behavior: options.behavior ?? "auto" });
      scrollContainer.dispatchEvent(new env.window.Event("scroll"));
    },
  });
  return scrollToCalls;
}

function installReverseThreadScrollStyle(scrollContainer: HTMLElement): () => void {
  const previousGetComputedStyle = globalThis.getComputedStyle;
  globalThis.getComputedStyle = ((element: Element) => {
    if (element === scrollContainer) {
      return { flexDirection: "column-reverse" } as CSSStyleDeclaration;
    }
    return previousGetComputedStyle(element);
  }) as typeof getComputedStyle;
  return () => {
    globalThis.getComputedStyle = previousGetComputedStyle;
  };
}

function stubElementRect(
  env: DomTestEnv,
  element: HTMLElement,
  rect: { left?: number; top: number; width?: number; height: number },
): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => new env.window.DOMRect(rect.left ?? 0, rect.top, rect.width ?? 500, rect.height),
  });
}

function installTestResizeObserver(): () => void {
  const previousResizeObserver = Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver");
  class TestResizeObserver {
    disconnect(): void {}
    observe(): void {}
    unobserve(): void {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: TestResizeObserver as unknown as typeof ResizeObserver,
  });
  return () => {
    if (previousResizeObserver) {
      Object.defineProperty(globalThis, "ResizeObserver", previousResizeObserver);
    } else {
      delete (globalThis as Record<string, unknown>).ResizeObserver;
    }
  };
}

function installTestIntersectionObserver(options: {
  onConstruct?: (callback: IntersectionObserverCallback) => void;
  onObserve?: (target: Element) => void;
} | (() => void) = {}): () => void {
  const normalizedOptions = typeof options === "function" ? { onConstruct: options } : options;
  const previousIntersectionObserver = Object.getOwnPropertyDescriptor(globalThis, "IntersectionObserver");
  class TestIntersectionObserver {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds: ReadonlyArray<number> = [];
    constructor(callback: IntersectionObserverCallback) {
      normalizedOptions.onConstruct?.(callback);
    }
    disconnect(): void {}
    observe(target: Element): void {
      normalizedOptions.onObserve?.(target);
    }
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
  return () => {
    if (previousIntersectionObserver) {
      Object.defineProperty(globalThis, "IntersectionObserver", previousIntersectionObserver);
    } else {
      delete (globalThis as Record<string, unknown>).IntersectionObserver;
    }
  };
}

function visibleIntersectionEntry(target: Element): IntersectionObserverEntry {
  return {
    boundingClientRect: target.getBoundingClientRect(),
    intersectionRatio: 1,
    intersectionRect: target.getBoundingClientRect(),
    isIntersecting: true,
    rootBounds: null,
    target,
    time: 0,
  } as IntersectionObserverEntry;
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
  railList: () => HTMLElement;
  railRows: () => HTMLElement[];
  root: Root;
  scrollContainer: () => HTMLElement;
}
