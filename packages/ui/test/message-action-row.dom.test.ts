import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MessageActionRow } from "../src/components/message-action-row";
import { MarkdownTableView } from "../src/components/message-markdown-table-view";
import type { MarkdownBlock } from "../src/state/conversation-markdown-engine";
import { setupDomTestEnv, type DomTestEnv } from "./dom-test-env";

export default async function runMessageActionRowDomTests(): Promise<void> {
  await writesRichAssistantCopyPayloadToClipboard();
  await supportsCopyLabelAndResetTimeoutOverrides();
  await copiesMarkdownTablePayloadToClipboard();
  await clearsMarkdownTableCopiedResetOnUnmount();
}

async function writesRichAssistantCopyPayloadToClipboard(): Promise<void> {
  const mounted = mountMessageActionRow({
    copyRichPayload: () => ({
      htmlText: "<p><strong>Hello</strong></p>",
      plainText: "**Hello**",
    }),
    copyText: "**Hello**",
  });
  try {
    const button = mounted.env.document.querySelector<HTMLButtonElement>('button[aria-label="Copy"]');
    if (!button) throw new Error("copy button should render");
    await act(async () => {
      button.click();
      await Promise.resolve();
    });

    assertEqual(mounted.clipboard.writeTextCalls.length, 0, "rich assistant copy should not use writeText");
    assertEqual(mounted.clipboard.writeCalls.length, 1, "rich assistant copy should call clipboard.write once");
    const item = mounted.clipboard.writeCalls[0]?.[0] as FakeClipboardItem | undefined;
    if (!item) throw new Error("clipboard.write should receive a ClipboardItem");
    assertDeepEqual(Object.keys(item.data).sort(), ["text/html", "text/plain"], "rich assistant copy should write both MIME types");
    assertEqual(await item.data["text/html"]?.text(), "<p><strong>Hello</strong></p>", "clipboard HTML payload");
    assertEqual(await item.data["text/plain"]?.text(), "**Hello**", "clipboard plain-text payload");
  } finally {
    mounted.cleanup();
  }
}

async function supportsCopyLabelAndResetTimeoutOverrides(): Promise<void> {
  const mounted = mountMessageActionRow({
    copiedResetTimeoutMs: 2_000,
    copiedText: "Copied custom",
    copyRichPayload: () => ({
      htmlText: "<p>Hi</p>",
      plainText: "Hi",
    }),
    copyText: "Hi",
    copyTextLabel: "Copy message",
  });
  const originalSetTimeout = mounted.env.window.setTimeout;
  const timeouts: number[] = [];
  Object.defineProperty(mounted.env.window, "setTimeout", {
    configurable: true,
    value: (_handler: TimerHandler, timeout?: number, ..._args: unknown[]) => {
      timeouts.push(timeout ?? 0);
      return 1;
    },
  });
  try {
    const button = mounted.env.document.querySelector<HTMLButtonElement>('button[aria-label="Copy message"]');
    if (!button) throw new Error("copy button should use custom copy aria label");
    await act(async () => {
      button.click();
      await Promise.resolve();
    });

    assertEqual(timeouts.includes(2_000), true, "copy reset should use the supplied timeout");
    assertEqual(
      mounted.env.document.querySelector<HTMLButtonElement>('button[aria-label="Copied custom"]') !== null,
      true,
      "copied state should use custom copied aria label",
    );
  } finally {
    Object.defineProperty(mounted.env.window, "setTimeout", {
      configurable: true,
      value: originalSetTimeout,
    });
    mounted.cleanup();
  }
}

async function copiesMarkdownTablePayloadToClipboard(): Promise<void> {
  const mounted = mountMarkdownTableView();
  try {
    const button = mounted.env.document.querySelector<HTMLButtonElement>('button[aria-label="Copy table"]');
    if (!button) throw new Error("table copy button should render");
    await act(async () => {
      button.click();
      await Promise.resolve();
    });

    assertEqual(mounted.clipboard.writeTextCalls.length, 0, "table copy should prefer rich clipboard writes");
    assertEqual(mounted.clipboard.writeCalls.length, 1, "table copy should call clipboard.write once");
    const item = mounted.clipboard.writeCalls[0]?.[0] as FakeClipboardItem | undefined;
    if (!item) throw new Error("table copy should receive a ClipboardItem");
    assertEqual(await item.data["text/plain"]?.text(), "| A   | B    |\n| :-- | ---: |\n| x   | y\\|z |", "table copy plain Markdown payload");
    assertEqual(
      (await item.data["text/html"]?.text())?.includes("<table>"),
      true,
      "table copy should include rendered HTML table payload",
    );
    assertEqual(
      mounted.env.document.querySelector<HTMLButtonElement>('button[aria-label="Copied"]') !== null,
      true,
      "table copy should expose copied state after successful copy",
    );
    assertEqual(
      mounted.env.document.querySelector<HTMLElement>(".hc-copy-toast") !== null,
      true,
      "table copy should render copied feedback toast",
    );
  } finally {
    mounted.cleanup();
  }
}

async function clearsMarkdownTableCopiedResetOnUnmount(): Promise<void> {
  const mounted = mountMarkdownTableView();
  const originalSetTimeout = mounted.env.window.setTimeout;
  const originalClearTimeout = mounted.env.window.clearTimeout;
  const timeoutRef: { handler: (() => void) | null } = { handler: null };
  const clearTimeoutCalls: unknown[] = [];
  Object.defineProperty(mounted.env.window, "setTimeout", {
    configurable: true,
    value: (handler: TimerHandler, timeout?: number, ..._args: unknown[]) => {
      timeoutRef.handler = typeof handler === "function" ? () => handler() : null;
      assertEqual(timeout, 1_500, "table copy reset should use the Desktop copy timeout");
      return 42;
    },
  });
  Object.defineProperty(mounted.env.window, "clearTimeout", {
    configurable: true,
    value: (handle?: unknown) => {
      clearTimeoutCalls.push(handle);
    },
  });
  let cleaned = false;
  try {
    const button = mounted.env.document.querySelector<HTMLButtonElement>('button[aria-label="Copy table"]');
    if (!button) throw new Error("table copy button should render");
    await act(async () => {
      button.click();
      await Promise.resolve();
    });

    mounted.cleanup();
    cleaned = true;
    assertEqual(clearTimeoutCalls.includes(42), true, "table copy reset timeout should be cleared on unmount");
    timeoutRef.handler?.();
  } finally {
    Object.defineProperty(mounted.env.window, "setTimeout", {
      configurable: true,
      value: originalSetTimeout,
    });
    Object.defineProperty(mounted.env.window, "clearTimeout", {
      configurable: true,
      value: originalClearTimeout,
    });
    if (!cleaned) mounted.cleanup();
  }
}

interface ClipboardRecorder {
  writeCalls: FakeClipboardItem[][];
  writeTextCalls: string[];
}

class FakeClipboardItem {
  static supports(_type: string): boolean {
    return true;
  }

  data: Record<string, Blob>;

  constructor(data: Record<string, Blob>) {
    this.data = data;
  }
}

function mountMessageActionRow({
  copiedResetTimeoutMs,
  copiedText,
  copyRichPayload,
  copyText,
  copyTextLabel,
}: {
  copiedResetTimeoutMs?: number;
  copiedText?: string;
  copyRichPayload: () => { htmlText: string; plainText: string };
  copyText: string;
  copyTextLabel?: string;
}): { clipboard: ClipboardRecorder; cleanup: () => void; env: DomTestEnv; root: Root } {
  const env = setupDomTestEnv();
  const container = env.document.createElement("div");
  env.document.body.appendChild(container);
  const root = createRoot(container);
  const clipboard = installClipboardRecorder(env);
  act(() => {
    root.render(createElement(MessageActionRow, {
      copiedResetTimeoutMs,
      copiedText,
      copyRichPayload,
      copyText,
      copyTextLabel,
    }));
  });
  return {
    clipboard,
    cleanup: () => {
      act(() => root.unmount());
      env.teardown();
    },
    env,
    root,
  };
}

function mountMarkdownTableView(): { clipboard: ClipboardRecorder; cleanup: () => void; env: DomTestEnv; root: Root } {
  const env = setupDomTestEnv();
  const container = env.document.createElement("div");
  env.document.body.appendChild(container);
  const root = createRoot(container);
  const clipboard = installClipboardRecorder(env);
  const block: Extract<MarkdownBlock, { kind: "table" }> = {
    aligns: ["left", "right"],
    headers: ["A", "B"],
    kind: "table",
    rows: [["x", "y|z"]],
  };
  act(() => {
    root.render(createElement(MarkdownTableView, { block }));
  });
  return {
    clipboard,
    cleanup: () => {
      act(() => root.unmount());
      env.teardown();
    },
    env,
    root,
  };
}

function installClipboardRecorder(env: DomTestEnv): ClipboardRecorder {
  const recorder: ClipboardRecorder = {
    writeCalls: [],
    writeTextCalls: [],
  };
  Object.defineProperty(env.window, "ClipboardItem", {
    configurable: true,
    value: FakeClipboardItem,
  });
  Object.defineProperty(env.window.navigator, "clipboard", {
    configurable: true,
    value: {
      write: async (items: FakeClipboardItem[]) => {
        recorder.writeCalls.push(items);
      },
      writeText: async (text: string) => {
        recorder.writeTextCalls.push(text);
      },
    },
  });
  return recorder;
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
