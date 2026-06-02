import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { UnifiedDiffFailureDialog } from "../src/components/unified-diff-failure-dialog";

export default function runUnifiedDiffFailureDialogTests(): void {
  rendersPathRowsAsOpenButtonsWhenHandlerExists();
  preservesStaticPathRowsWithoutOpenHandler();
}

function rendersPathRowsAsOpenButtonsWhenHandlerExists(): void {
  const html = renderToStaticMarkup(createElement(UnifiedDiffFailureDialog, {
    failure: {
      action: "reapply",
      result: {
        appliedPaths: ["src/applied.ts"],
        skippedPaths: ["src/skipped.ts"],
        conflictedPaths: ["src/conflicted.ts"],
      },
    },
    onClose: () => undefined,
    onOpenPath: () => undefined,
  }));

  assertIncludes(html, "hc-unified-diff-path-button", "path rows should render as buttons when open handler is provided");
  assertIncludes(html, "src/applied.ts", "applied path should render");
  assertIncludes(html, "src/skipped.ts", "skipped path should render");
  assertIncludes(html, "src/conflicted.ts", "conflicted path should render");
  assertIncludes(html, "hc-unified-diff-path-open-icon", "open icon should render inside path buttons");
}

function preservesStaticPathRowsWithoutOpenHandler(): void {
  const html = renderToStaticMarkup(createElement(UnifiedDiffFailureDialog, {
    failure: {
      action: "revert",
      result: {
        appliedPaths: ["src/applied.ts"],
        skippedPaths: [],
        conflictedPaths: [],
      },
    },
    onClose: () => undefined,
  }));

  assertIncludes(html, "hc-unified-diff-path-name", "path text should still render");
  assertExcludes(html, "hc-unified-diff-path-button", "path rows should stay static without open handler");
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
