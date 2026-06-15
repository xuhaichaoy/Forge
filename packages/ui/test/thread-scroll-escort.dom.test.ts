/*
 * Regression suite for the user-visible scroll incidents that the logic-only
 * test layer missed: the rAF settle escort in ThreadScrollLayout and the
 * verify-after-commit window realignment in VirtualizedTurnList. Runs in a
 * per-test jsdom environment (test/dom-test-env.ts) with stubbed geometry and
 * a manually driven requestAnimationFrame.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThreadScrollLayout } from "../src/components/thread-scroll-layout";
import {
  VirtualizedTurnList,
  turnKeysForGroups,
  virtualTurnRangeFromBottom,
} from "../src/components/conversation-virtual-turn-list";
import type { TurnGroup } from "../src/state/turn-collapse-projection";
import { setupDomTestEnv, stubElementGeometry, type DomTestEnv } from "./dom-test-env";

const VIEWPORT_HEIGHT = 600;
const INITIAL_SCROLL_HEIGHT = 3000;

interface ScrollToCall {
  top: number;
  behavior: string;
}

interface MountedThreadScrollLayout {
  env: DomTestEnv;
  root: Root;
  container: HTMLElement;
  button: HTMLButtonElement;
  geometry: ReturnType<typeof stubElementGeometry>;
  scrollToCalls: ScrollToCall[];
  cleanup: () => void;
}

function mountThreadScrollLayout(resetKey: string): MountedThreadScrollLayout {
  const env = setupDomTestEnv();
  const host = env.document.createElement("div");
  env.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(createElement(ThreadScrollLayout, {
      footer: createElement("div", null, "footer"),
      resetKey,
      children: createElement("div", null, "conversation body"),
    }));
  });

  const container = env.document.querySelector<HTMLElement>(".hc-thread-scroll-container");
  if (!container) {
    env.teardown();
    throw new Error("ThreadScrollLayout did not render its scroll container");
  }

  // jsdom has no layout: install the scrollable-geometry contract by hand.
  // scrollTop 0 with 3000/600 puts the viewport 2400px above the bottom.
  const geometry = stubElementGeometry(container, {
    scrollHeight: INITIAL_SCROLL_HEIGHT,
    clientHeight: VIEWPORT_HEIGHT,
    scrollTop: 0,
  });
  const scrollToCalls: ScrollToCall[] = [];
  Object.defineProperty(container, "scrollTo", {
    configurable: true,
    writable: true,
    value: (options: { top?: number; behavior?: string } = {}) => {
      // Record only — deliberately do NOT move scrollTop. A recorded call with
      // no movement models a smooth glide that has not progressed yet (the
      // stall the settle escort exists to detect).
      scrollToCalls.push({ top: options.top ?? 0, behavior: options.behavior ?? "auto" });
    },
  });

  // Flush the pending mount frame callbacks (scroll restore + content-version
  // follow-up share one batch) so the component measures the stubbed geometry
  // and shows the ↓ button.
  act(() => {
    env.flushFrames(1);
  });
  scrollToCalls.length = 0;

  const button = env.document.querySelector<HTMLButtonElement>(".hc-scroll-to-bottom");
  if (!button) {
    env.teardown();
    throw new Error("scroll-to-bottom button not rendered");
  }
  assertEqual(
    button.className,
    "hc-scroll-to-bottom",
    "precondition: viewport is 2400px from bottom, so the ↓ button must be visible",
  );
  assertEqual(env.pendingFrameCount(), 0, "precondition: no frames pending before the click");

  return {
    env,
    root,
    container,
    button,
    geometry,
    scrollToCalls,
    cleanup: () => {
      act(() => root.unmount());
      env.teardown();
    },
  };
}

/*
 * Incident ①: a smooth scroll-to-bottom chases a moving target — rows mount
 * during the glide and grow scrollHeight past the original target. The settle
 * escort must re-issue the scroll against the NEW scrollHeight once progress
 * stalls short of the bottom.
 */
export function settleEscortReissuesScrollAtNewScrollHeightWhenStalled(): void {
  const mounted = mountThreadScrollLayout("dom-escort-reissue");
  const { env, button, geometry, scrollToCalls } = mounted;
  try {
    act(() => {
      button.click();
    });
    assertEqual(scrollToCalls.length, 1, "clicking ↓ should issue exactly one smooth scroll");
    assertDeepEqual(
      scrollToCalls[0],
      { top: INITIAL_SCROLL_HEIGHT - VIEWPORT_HEIGHT, behavior: "smooth" },
      "the initial glide should target the current bottom (3000 - 600 = 2400)",
    );
    assertEqual(env.pendingFrameCount(), 1, "the settle escort should be waiting on a frame");

    // Frame 1 records the scrollTop baseline; frames 2-3 observe zero progress.
    act(() => {
      env.flushFrames(3);
    });
    assertEqual(scrollToCalls.length, 1, "a not-yet-stalled glide must not be re-issued");

    // Streaming rows grow the content mid-glide — no scroll event fires.
    geometry.scrollHeight = 5000;

    // Frame 4 is the third consecutive stalled frame: the escort re-issues.
    act(() => {
      env.flushFrames(1);
    });
    assertEqual(scrollToCalls.length, 2, "three stalled frames short of the bottom must re-issue the scroll");
    assertDeepEqual(
      scrollToCalls[1],
      { top: 5000 - VIEWPORT_HEIGHT, behavior: "smooth" },
      "the re-issued scroll must target the NEW scrollHeight (5000 - 600 = 4400), not the stale 2400",
    );
    assertEqual(env.pendingFrameCount(), 1, "the escort should stay alive until the bottom is reached");
  } finally {
    mounted.cleanup();
  }
}

/*
 * Incident ②: scrollTop moving AWAY from the bottom by more than 4px means
 * the user took over through a path that never marks scroll intent (keyboard
 * paging). The escort must stand down instead of fighting the user.
 */
export function settleEscortExitsWhenScrollTopRegressesPastTakeoverThreshold(): void {
  const mounted = mountThreadScrollLayout("dom-escort-takeover");
  const { env, button, geometry, scrollToCalls } = mounted;
  try {
    act(() => {
      button.click();
    });
    assertEqual(scrollToCalls.length, 1, "clicking ↓ should issue the initial smooth scroll");

    // Frame 1: baseline scrollTop 0. Then the glide makes real progress.
    act(() => {
      env.flushFrames(1);
    });
    geometry.scrollTop = 600;
    act(() => {
      env.flushFrames(1);
    });
    assertEqual(env.pendingFrameCount(), 1, "a progressing glide keeps the escort alive");

    // User takes over: scrollTop regresses 40px (> 4px threshold).
    geometry.scrollTop = 560;
    act(() => {
      env.flushFrames(1);
    });
    assertEqual(env.pendingFrameCount(), 0, "a >4px scrollTop regression must end the escort");

    // If the escort were still alive, 3 more stalled frames would re-issue a
    // scroll. Prove it is dead: nothing runs, nothing is re-issued.
    let ranCallbacks = 0;
    act(() => {
      ranCallbacks = env.flushFrames(6);
    });
    assertEqual(ranCallbacks, 0, "no escort frames may run after user takeover");
    assertEqual(scrollToCalls.length, 1, "no scroll may be re-issued after user takeover");
  } finally {
    mounted.cleanup();
  }
}

/*
 * Incident ③ (verify-after-commit): spacer/row corrections change
 * scrollHeight WITHOUT firing a scroll event, so the virtual window can be
 * computed for a distance the painted DOM no longer has — visible as a blank
 * conversation until the next manual scroll. The next commit must re-measure
 * the real DOM and realign the window.
 */
export function virtualTurnWindowRealignsOnNextCommitAfterSilentScrollHeightChange(): void {
  const env = setupDomTestEnv();
  const TURN_COUNT = 30;
  const ESTIMATED_TOTAL = TURN_COUNT * 280 + (TURN_COUNT - 1) * 12; // unmeasured rows use the 280px estimate + 12px gap
  const groups = buildEventTurnGroups(TURN_COUNT);
  const turnKeys = turnKeysForGroups(groups);
  const renderTree = () => createElement(VirtualizedTurnList, {
    groups,
    renderGroup: (group, index) => createElement("div", { className: "dom-test-turn-body" }, group.turnId ?? String(index)),
  });

  const scrollHost = env.document.createElement("div");
  scrollHost.className = "hc-thread-scroll-container";
  env.document.body.appendChild(scrollHost);
  // Pinned to the bottom: distanceFromBottom = 8748 - 8148 - 600 = 0.
  const geometry = stubElementGeometry(scrollHost, {
    scrollHeight: ESTIMATED_TOTAL,
    clientHeight: VIEWPORT_HEIGHT,
    scrollTop: ESTIMATED_TOTAL - VIEWPORT_HEIGHT,
  });

  const root = createRoot(scrollHost);
  try {
    act(() => {
      root.render(renderTree());
    });

    const beforeRange = virtualTurnRangeFromBottom({
      turnKeys,
      heights: new Map<string, number>(),
      distanceFromBottom: 0,
      viewportHeight: VIEWPORT_HEIGHT,
    });
    assertDeepEqual(
      renderedTurnKeys(scrollHost),
      turnKeys.slice(beforeRange.startIndex, beforeRange.endIndex),
      "precondition: at-bottom window renders the bottom rows",
    );

    // Silent growth: scrollHeight changes, scrollTop stays, NO scroll event.
    // The real distance from bottom is now 1000px while the windowing input
    // still says 0.
    const GROWTH = 1000;
    geometry.scrollHeight = ESTIMATED_TOTAL + GROWTH;

    // Next commit (any re-render) must re-measure the DOM and realign.
    act(() => {
      root.render(renderTree());
    });

    const afterRange = virtualTurnRangeFromBottom({
      turnKeys,
      heights: new Map<string, number>(),
      distanceFromBottom: GROWTH,
      viewportHeight: VIEWPORT_HEIGHT,
    });
    if (afterRange.startIndex === beforeRange.startIndex && afterRange.endIndex === beforeRange.endIndex) {
      throw new Error("fixture must move the window, otherwise the realignment assertion is vacuous");
    }
    assertDeepEqual(
      renderedTurnKeys(scrollHost),
      turnKeys.slice(afterRange.startIndex, afterRange.endIndex),
      "after the commit the window must realign to the REAL 1000px distance, not the stale broadcast 0",
    );
    assertDeepEqual(
      spacerHeights(scrollHost),
      expectedSpacerHeights(afterRange.paddingTop, afterRange.paddingBottom),
      "spacers must be recomputed for the realigned window",
    );
  } finally {
    act(() => root.unmount());
    env.teardown();
  }
}

function buildEventTurnGroups(count: number): TurnGroup[] {
  const groups: TurnGroup[] = [];
  for (let index = 0; index < count; index += 1) {
    groups.push({
      turnId: `turn-${index}`,
      units: [{
        kind: "event",
        key: `unit-${index}`,
        item: { id: `item-${index}`, type: "event" },
        label: "Event",
        text: `event ${index}`,
      }],
    });
  }
  return groups;
}

function renderedTurnKeys(scope: HTMLElement): string[] {
  return Array.from(scope.querySelectorAll("[data-turn-key]"))
    .map((element) => element.getAttribute("data-turn-key") ?? "");
}

function spacerHeights(scope: HTMLElement): string[] {
  return Array.from(scope.querySelectorAll(".hc-turn-virtual-spacer"))
    .map((element) => (element as HTMLElement).style.height);
}

function expectedSpacerHeights(paddingTop: number, paddingBottom: number): string[] {
  const expected: string[] = [];
  if (paddingTop > 0) expected.push(`${paddingTop}px`);
  if (paddingBottom > 0) expected.push(`${paddingBottom}px`);
  return expected;
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
