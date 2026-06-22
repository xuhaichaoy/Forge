import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MessageActionRow } from "../src/components/message-action-row";
import { setupDomTestEnv, type DomTestEnv } from "./dom-test-env";

export default async function runMessageActionRowDomTests(): Promise<void> {
  await writesRichAssistantCopyPayloadToClipboard();
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
  copyRichPayload,
  copyText,
}: {
  copyRichPayload: () => { htmlText: string; plainText: string };
  copyText: string;
}): { clipboard: ClipboardRecorder; cleanup: () => void; env: DomTestEnv; root: Root } {
  const env = setupDomTestEnv();
  const container = env.document.createElement("div");
  env.document.body.appendChild(container);
  const root = createRoot(container);
  const clipboard = installClipboardRecorder(env);
  act(() => {
    root.render(createElement(MessageActionRow, {
      copyRichPayload,
      copyText,
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
