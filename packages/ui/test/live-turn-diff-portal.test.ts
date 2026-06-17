import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  LiveTurnDiffPortal,
  LiveTurnFixedContent,
  LiveTurnPlanPortal,
  shouldRenderLiveTurnDiffPortal,
  shouldRenderLiveTurnPlanPortal,
} from "../src/components/live-turn-diff-portal";

export default function runLiveTurnDiffPortalTests(): void {
  rendersDesktopTurnDiffChipInFixedContent();
  rendersDesktopTurnPlanPillInFixedContent();
  gatesLiveDiffLikeCodexDesktop();
  gatesLivePlanLikeCodexDesktop();
}

function rendersDesktopTurnDiffChipInFixedContent(): void {
  const diff = [
    "diff --git a/packages/ui/src/app.ts b/packages/ui/src/app.ts",
    "index 111..222 100644",
    "--- a/packages/ui/src/app.ts",
    "+++ b/packages/ui/src/app.ts",
    "@@ -1 +1 @@",
    "-old",
    "+new",
  ].join("\n");
  const html = renderToStaticMarkup(createElement(LiveTurnFixedContent, {
    activeTurnId: "turn-1",
    diff,
    isThreadRunning: true,
    hasBlockingRequest: false,
    plan: {
      threadId: "thread-1",
      turnId: "turn-1",
      explanation: null,
      updatedAt: 1,
      plan: [{ step: "Patch fixed diff preview", status: "in_progress" }],
    },
    turnId: "turn-1",
    onOpenDiff: () => undefined,
  }));

  assertIncludes(html, "hc-live-turn-fixed-content", "live diff should render in the fixed in-progress content wrapper");
  assertIncludes(html, "hc-live-turn-fixed-overlay", "live diff should render through the fixed conversation overlay");
  assertIncludes(html, "hc-live-turn-fixed-row", "live diff should render in the fixed content row");
  assertIncludes(html, "hc-live-turn-plan-portal", "live plan should share the fixed content row with the live diff");
  assertIncludes(html, "hc-live-turn-diff-portal", "live diff should render in the inline fixed wrapper");
  assertIncludes(html, "hc-live-turn-diff-chip", "live diff should render as Desktop's compact changed-files chip");
  assertIncludes(html, "1 file changed", "live diff should show Desktop's in-progress changed-file label");
  assertIncludes(html, "+1", "live diff should show in-progress added-line stats");
  assertIncludes(html, "-1", "live diff should show in-progress removed-line stats");
  assertIncludes(html, "·", "live diff should use Desktop's inline separator when plan and diff both render");
  assertExcludes(html, "hc-turn-diff-progress", "fixed live diff should not render the full turn-diff card");
  assertExcludes(html, "hc-turn-diff-review-full\">Review<", "fixed live diff should not render the completed/card review action");
  assertExcludes(html, "hc-turn-diff-header-icon", "in-progress live diff should not render the completed-card icon");
  assertExcludes(html, "Edited app.ts", "in-progress live diff should not use the completed-card title");
  assertExcludes(html, "Live diff preview", "live diff should not use the old raw preview label");
  assertExcludes(html, "<pre", "live diff portal should not render a raw diff pre block");
}

function rendersDesktopTurnPlanPillInFixedContent(): void {
  const html = renderToStaticMarkup(createElement(LiveTurnPlanPortal, {
    activeTurnId: "turn-1",
    plan: {
      threadId: "thread-1",
      turnId: "turn-1",
      explanation: null,
      updatedAt: 1,
      plan: [
        { step: "Inspect Desktop source", status: "completed" },
        { step: "Patch fixed plan preview", status: "in_progress" },
        { step: "Run verification", status: "pending" },
      ],
    },
    isThreadRunning: true,
    hasBlockingRequest: false,
  }));

  assertIncludes(html, "hc-live-turn-plan-portal", "live plan should render in the fixed in-progress content slot");
  assertIncludes(html, "Step 2 / 3", "live plan should show Desktop's compact current step count");
  assertIncludes(html, "Inspect Desktop source", "live plan should expose plan steps in its preview tooltip");
}

function gatesLiveDiffLikeCodexDesktop(): void {
  assertEqual(
    shouldRenderLiveTurnDiffPortal({
      activeTurnId: "turn-1",
      diff: "+changed",
      isThreadRunning: true,
      hasBlockingRequest: false,
      turnId: "turn-1",
    }),
    true,
    "running diff without blockers should render",
  );
  assertEqual(
    shouldRenderLiveTurnDiffPortal({
      activeTurnId: "turn-1",
      diff: "+changed",
      isThreadRunning: false,
      hasBlockingRequest: false,
      turnId: "turn-1",
    }),
    false,
    "completed turn should not render live diff",
  );
  assertEqual(
    shouldRenderLiveTurnDiffPortal({
      activeTurnId: "turn-1",
      diff: "+changed",
      isThreadRunning: true,
      hasBlockingRequest: true,
      turnId: "turn-1",
    }),
    false,
    "blocking request should suppress live diff",
  );
  assertEqual(
    shouldRenderLiveTurnDiffPortal({
      activeTurnId: "turn-1",
      diff: "+changed",
      isThreadRunning: true,
      hasBlockingRequest: false,
      turnId: "turn-1",
      conversationDetailLevel: "STEPS_PROSE",
    }),
    false,
    "STEPS_PROSE should suppress live diff",
  );
  assertEqual(
    shouldRenderLiveTurnDiffPortal({
      activeTurnId: "turn-2",
      diff: "+changed",
      isThreadRunning: true,
      hasBlockingRequest: false,
      turnId: "turn-1",
    }),
    false,
    "stale diff from a previous turn should not render on the running turn",
  );
}

function gatesLivePlanLikeCodexDesktop(): void {
  const plan = {
    threadId: "thread-1",
    turnId: "turn-1",
    explanation: null,
    updatedAt: 1,
    plan: [{ step: "Patch fixed plan preview", status: "in_progress" }],
  };
  assertEqual(
    shouldRenderLiveTurnPlanPortal({
      activeTurnId: "turn-1",
      plan,
      isThreadRunning: true,
      hasBlockingRequest: false,
    }),
    true,
    "running plan without blockers should render",
  );
  assertEqual(
    shouldRenderLiveTurnPlanPortal({
      activeTurnId: "turn-1",
      plan,
      isThreadRunning: false,
      hasBlockingRequest: false,
    }),
    false,
    "completed turn should not render live plan",
  );
  assertEqual(
    shouldRenderLiveTurnPlanPortal({
      activeTurnId: "turn-1",
      plan,
      isThreadRunning: true,
      hasBlockingRequest: true,
    }),
    false,
    "blocking request should suppress live plan",
  );
  assertEqual(
    shouldRenderLiveTurnPlanPortal({
      activeTurnId: "turn-1",
      plan: { ...plan, plan: [] },
      isThreadRunning: true,
      hasBlockingRequest: false,
    }),
    false,
    "empty plan should not render live plan",
  );
  assertEqual(
    shouldRenderLiveTurnPlanPortal({
      activeTurnId: "turn-2",
      plan,
      isThreadRunning: true,
      hasBlockingRequest: false,
    }),
    false,
    "stale plan from a previous turn should not render on the running turn",
  );
}

function assertIncludes(actual: string, expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}

function assertExcludes(actual: string, expected: string, message: string): void {
  if (actual.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(actual)} not to include ${JSON.stringify(expected)}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
