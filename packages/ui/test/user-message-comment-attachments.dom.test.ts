import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ForgeIntlProvider } from "../src/components/i18n-provider";
import { UserMessageCommentAttachmentChip } from "../src/components/user-message-comment-attachments";
import type { FileReference } from "../src/components/file-reference-types";
import type { UserMessageCommentAttachmentPreview } from "../src/state/user-message-comment-attachments";
import { setupDomTestEnv, type DomTestEnv } from "./dom-test-env";

export default async function runUserMessageCommentAttachmentsDomTests(): Promise<void> {
  await hoverShowsRealAttachmentPopoverAndOpensSourceFile();
  await repositionsPopoverOnScrollAndResize();
}

async function hoverShowsRealAttachmentPopoverAndOpensSourceFile(): Promise<void> {
  const opened: FileReference[] = [];
  const mounted = mountCommentAttachmentChip((reference) => opened.push(reference));
  const originalSetTimeout = mounted.env.window.setTimeout;
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
    const popover = mounted.env.document.querySelector<HTMLElement>(".hc-user-comment-attachment-popover");
    if (!popover) throw new Error("comment attachment popover should render on hover");
    assertEqual(
      popover.textContent?.includes("Please align this source"),
      true,
      "popover should show the real attachment body",
    );
    assertEqual(
      popover.textContent?.includes("/workspace/src/app.ts:3-5"),
      true,
      "popover should show the real file range",
    );

    const sourceButton = popover.querySelector<HTMLElement>(".hc-user-comment-attachment-source");
    if (!sourceButton) throw new Error("source button should render for file-backed attachments");
    assertEqual(sourceButton.getAttribute("data-file-reference"), "true", "source entry should expose Desktop's file-reference marker");
    assertEqual(sourceButton.tagName, "BUTTON", "source entry should use a keyboard-operable button");
    dispatchMouse(mounted.env, sourceButton, "click");
    assertEqual(opened[0]?.path, "/workspace/src/app.ts", "source button should reuse the file opener");
    assertEqual(opened[0]?.lineStart, 3, "source button should preserve lineStart");
    assertEqual(opened[0]?.lineEnd, 5, "source button should preserve lineEnd");
  } finally {
    Object.defineProperty(mounted.env.window, "setTimeout", {
      configurable: true,
      value: originalSetTimeout,
    });
    mounted.cleanup();
  }
}

async function repositionsPopoverOnScrollAndResize(): Promise<void> {
  const mounted = mountCommentAttachmentChip(() => {});
  const originalSetTimeout = mounted.env.window.setTimeout;
  let triggerTop = 100;
  try {
    Object.defineProperty(mounted.env.window, "innerHeight", { configurable: true, value: 300 });
    Object.defineProperty(mounted.env.window, "innerWidth", { configurable: true, value: 400 });
    Object.defineProperty(mounted.trigger(), "getBoundingClientRect", {
      configurable: true,
      value: () => domRect({ top: triggerTop, left: 40, width: 120, height: 20 }),
    });
    Object.defineProperty(mounted.env.window, "setTimeout", {
      configurable: true,
      value: (handler: TimerHandler, _timeout?: number, ..._args: unknown[]) => {
        if (typeof handler === "function") handler();
        return 1;
      },
    });

    dispatchMouse(mounted.env, mounted.trigger(), "mouseover");
    await act(async () => {
      await Promise.resolve();
    });
    const popover = mounted.env.document.querySelector<HTMLElement>(".hc-user-comment-attachment-popover");
    if (!popover) throw new Error("comment attachment popover should render before reposition checks");
    Object.defineProperty(popover, "getBoundingClientRect", {
      configurable: true,
      value: () => domRect({ top: 0, left: 0, width: 220, height: 40 }),
    });

    dispatchWindowEvent(mounted.env, "resize");
    assertEqual(popover.style.top, "56px", "resize should compute the popover from the current trigger position");

    triggerTop = 160;
    dispatchWindowEvent(mounted.env, "scroll");
    assertEqual(popover.style.top, "116px", "scroll should keep the open popover anchored to the moved trigger");
  } finally {
    Object.defineProperty(mounted.env.window, "setTimeout", {
      configurable: true,
      value: originalSetTimeout,
    });
    mounted.cleanup();
  }
}

function mountCommentAttachmentChip(
  onOpenFileReference: (reference: FileReference) => void,
): MountedCommentAttachmentChip {
  const env = setupDomTestEnv();
  const container = env.document.createElement("div");
  env.document.body.appendChild(container);
  const root = createRoot(container);
  const attachments: UserMessageCommentAttachmentPreview[] = [{
    body: "Please align this source hover card.",
    designTweak: false,
    designTweakChanges: [],
    browserElementPreview: null,
    contentPreviewText: "",
    artifactRangeLabel: "",
    key: "/workspace/src/app.ts:3-5:0",
    kind: "comment",
    label: "/workspace/src/app.ts:3-5",
    lineRange: "3-5",
    origin: "diff",
    previewAlt: "",
    previewSrc: "data:image/png;base64,abc",
    reference: { path: "/workspace/src/app.ts", lineStart: 3, lineEnd: 5 },
    side: "right",
  }];
  act(() => {
    root.render(createElement(
      ForgeIntlProvider,
      {
        locale: "en-US",
        children: createElement(UserMessageCommentAttachmentChip, {
          attachments,
          chip: {
            id: "codex.userMessage.commentCount",
            defaultMessage: "{count, plural, one {# comment} other {# comments}}",
            values: { count: 1 },
          },
          onOpenFileReference,
        }),
      },
    ));
  });
  return {
    cleanup: () => {
      act(() => root.unmount());
      env.teardown();
    },
    env,
    root,
    trigger: () => {
      const trigger = env.document.querySelector<HTMLElement>(".hc-user-comment-attachment-chip");
      if (!trigger) throw new Error("comment attachment chip did not render");
      return trigger;
    },
  };
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

function dispatchWindowEvent(env: DomTestEnv, type: string): void {
  act(() => {
    env.window.dispatchEvent(new env.window.Event(type));
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

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

interface MountedCommentAttachmentChip {
  cleanup: () => void;
  env: DomTestEnv;
  root: Root;
  trigger: () => HTMLElement;
}
