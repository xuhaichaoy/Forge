import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  LiveTurnDiffPortal,
  shouldRenderLiveTurnDiffPortal,
} from "../src/components/live-turn-diff-portal";

export default function runLiveTurnDiffPortalTests(): void {
  rendersDesktopTurnDiffCardInAboveComposerSlot();
  gatesLiveDiffLikeCodexDesktop();
}

function rendersDesktopTurnDiffCardInAboveComposerSlot(): void {
  const diff = [
    "diff --git a/packages/ui/src/app.ts b/packages/ui/src/app.ts",
    "index 111..222 100644",
    "--- a/packages/ui/src/app.ts",
    "+++ b/packages/ui/src/app.ts",
    "@@ -1 +1 @@",
    "-old",
    "+new",
  ].join("\n");
  const html = renderToStaticMarkup(createElement(LiveTurnDiffPortal, {
    diff,
    isThreadRunning: true,
    hasBlockingRequest: false,
    onOpenDiff: () => undefined,
  }));

  assertIncludes(html, "hc-live-turn-diff-portal", "live diff should render in the portal wrapper");
  assertIncludes(html, "hc-turn-diff-progress", "live diff should use Desktop's in-progress turn-diff row");
  assertIncludes(html, "1 file changed", "live diff should show Desktop's in-progress changed-file title");
  assertIncludes(html, "hc-turn-diff-review-full\">Review<", "in-progress live diff should use Desktop review copy (bundle reviewChanges = \"Review\")");
  assertExcludes(html, "hc-turn-diff-header-icon", "in-progress live diff should not render the completed-card icon");
  assertExcludes(html, "Edited app.ts", "in-progress live diff should not use the completed-card title");
  assertExcludes(html, "Live diff preview", "live diff should not use the old raw preview label");
  assertExcludes(html, "<pre", "live diff portal should not render a raw diff pre block");
}

function gatesLiveDiffLikeCodexDesktop(): void {
  assertEqual(
    shouldRenderLiveTurnDiffPortal({
      diff: "+changed",
      isThreadRunning: true,
      hasBlockingRequest: false,
    }),
    true,
    "running diff without blockers should render",
  );
  assertEqual(
    shouldRenderLiveTurnDiffPortal({
      diff: "+changed",
      isThreadRunning: false,
      hasBlockingRequest: false,
    }),
    false,
    "completed turn should not render live diff",
  );
  assertEqual(
    shouldRenderLiveTurnDiffPortal({
      diff: "+changed",
      isThreadRunning: true,
      hasBlockingRequest: true,
    }),
    false,
    "blocking request should suppress live diff",
  );
  assertEqual(
    shouldRenderLiveTurnDiffPortal({
      diff: "+changed",
      isThreadRunning: true,
      hasBlockingRequest: false,
      conversationDetailLevel: "STEPS_PROSE",
    }),
    false,
    "STEPS_PROSE should suppress live diff",
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
