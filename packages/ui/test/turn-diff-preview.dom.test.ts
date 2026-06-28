import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ConversationUnitView } from "../src/components/conversation-unit-view";
import { ForgeIntlProvider } from "../src/components/i18n-provider";
import type { ConversationRenderUnit } from "../src/state/render-groups";
import { setupDomTestEnv, type DomTestEnv } from "./dom-test-env";

export default async function runTurnDiffPreviewDomTests(): Promise<void> {
  await hoverShowsSingleFileDiffPreviewAndOpensScopedReview();
  await multiFileDiffDoesNotRenderHoverPreviewTrigger();
}

async function hoverShowsSingleFileDiffPreviewAndOpensScopedReview(): Promise<void> {
  const opened: Array<string | undefined> = [];
  const mounted = mountTurnDiff(singleFileDiff(), (path) => opened.push(path));
  const originalSetTimeout = mounted.env.window.setTimeout;
  Object.defineProperty(mounted.env.window, "innerHeight", { configurable: true, value: 700 });
  Object.defineProperty(mounted.env.window, "innerWidth", { configurable: true, value: 900 });
  Object.defineProperty(mounted.trigger(), "getBoundingClientRect", {
    configurable: true,
    value: () => domRect({ top: 420, left: 120, width: 640, height: 82 }),
  });
  Object.defineProperty(mounted.env.window, "setTimeout", {
    configurable: true,
    value: (handler: TimerHandler, _timeout?: number, ..._args: unknown[]) => {
      if (typeof handler === "function") handler();
      return 1;
    },
  });
  try {
    dispatchMouse(mounted.env, mounted.trigger(), "mouseover");
    await act(async () => {
      await Promise.resolve();
    });

    const preview = mounted.env.document.querySelector<HTMLElement>(".hc-turn-diff-preview-positioner");
    if (!preview) throw new Error("single-file turn diff hover should render a preview portal");
    const text = preview.textContent ?? "";
    assertIncludes(text, "src/app.ts", "preview should show the changed file path");
    assertIncludes(text, "-old", "preview should show removed diff lines");
    assertIncludes(text, "+new", "preview should show added diff lines");
    assertEqual(preview.style.width, "576px", "preview width should follow Desktop's trigger width minus 64px");

    const surface = preview.querySelector<HTMLElement>(".hc-turn-diff-preview-surface");
    if (!surface) throw new Error("turn diff preview surface should render");
    dispatchMouse(mounted.env, surface, "click");
    assertEqual(opened[0], "src/app.ts", "clicking the hover preview should open Review scoped to the single file");
  } finally {
    Object.defineProperty(mounted.env.window, "setTimeout", {
      configurable: true,
      value: originalSetTimeout,
    });
    mounted.cleanup();
  }
}

async function multiFileDiffDoesNotRenderHoverPreviewTrigger(): Promise<void> {
  const mounted = mountTurnDiff(multiFileDiff(), () => undefined);
  try {
    assertEqual(
      mounted.env.document.querySelector(".hc-turn-diff-preview-trigger"),
      null,
      "Desktop only wraps single-file renderable turn diffs in the hover preview trigger",
    );
  } finally {
    mounted.cleanup();
  }
}

function mountTurnDiff(
  diff: string,
  onOpenDiff: (path?: string) => void,
): MountedTurnDiff {
  const env = setupDomTestEnv();
  const host = env.document.createElement("div");
  env.document.body.appendChild(host);
  const root = createRoot(host);
  const unit: ConversationRenderUnit = {
    kind: "event",
    key: "turn-diff-test",
    item: { id: "turn-diff-test", type: "turn-diff" },
    label: "Diff",
    text: diff,
    format: "diff",
  };
  act(() => {
    root.render(createElement(ForgeIntlProvider, {
      locale: "en-US",
      children: createElement("div", {
        className: "hc-app",
        "data-theme": "dark",
      }, createElement(ConversationUnitView, {
        unit,
        onOpenDiff,
      })),
    }));
  });
  return {
    cleanup: () => {
      act(() => root.unmount());
      env.teardown();
    },
    env,
    root,
    trigger: () => {
      const trigger = env.document.querySelector<HTMLElement>(".hc-turn-diff-preview-trigger");
      if (!trigger) throw new Error("turn diff preview trigger did not render");
      return trigger;
    },
  };
}

function singleFileDiff(): string {
  return [
    "diff --git a/src/app.ts b/src/app.ts",
    "index 111..222 100644",
    "--- a/src/app.ts",
    "+++ b/src/app.ts",
    "@@ -1 +1 @@",
    "-old",
    "+new",
  ].join("\n");
}

function multiFileDiff(): string {
  return [
    singleFileDiff(),
    "diff --git a/src/other.ts b/src/other.ts",
    "index 333..444 100644",
    "--- a/src/other.ts",
    "+++ b/src/other.ts",
    "@@ -1 +1 @@",
    "-before",
    "+after",
  ].join("\n");
}

function dispatchMouse(env: DomTestEnv, target: HTMLElement, type: string, init: MouseEventInit = {}): void {
  act(() => {
    target.dispatchEvent(new env.window.MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      ...init,
    }));
  });
}

function domRect({
  top,
  left,
  width,
  height,
}: {
  top: number;
  left: number;
  width: number;
  height: number;
}): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function assertIncludes(actual: string, expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

interface MountedTurnDiff {
  cleanup: () => void;
  env: DomTestEnv;
  root: Root;
  trigger: () => HTMLElement;
}
