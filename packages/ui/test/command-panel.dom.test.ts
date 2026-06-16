import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CommandPanel } from "../src/components/command-panel";
import { commandPanelEntryOptionId } from "../src/components/command-panel-entry-list";
import type { CommandPanelEntry, CommandPanelState } from "../src/state/command-panel";
import { setupDomTestEnv, type DomTestEnv } from "./dom-test-env";

export default function runCommandPanelDomTests(): void {
  arrowKeysSelectActiveCommandFromSearchInput();
}

function arrowKeysSelectActiveCommandFromSearchInput(): void {
  const selected: string[] = [];
  const mounted = mountCommandPanel((entry) => {
    selected.push(entry.id);
  });
  try {
    const input = mounted.env.document.querySelector<HTMLInputElement>("input[role='combobox']");
    if (!input) throw new Error("command search input did not render");

    assertEqual(
      input.getAttribute("aria-activedescendant"),
      commandPanelEntryOptionId("open"),
      "first actionable row should be active by default",
    );
    assertSelected(mounted.env, "open", true);
    assertSelected(mounted.env, "disabled", false);
    assertSelected(mounted.env, "info", false);

    dispatchKey(mounted.env, input, "ArrowDown");
    assertEqual(
      input.getAttribute("aria-activedescendant"),
      commandPanelEntryOptionId("files"),
      "ArrowDown should skip disabled and non-actionable rows",
    );
    assertSelected(mounted.env, "files", true);

    dispatchKey(mounted.env, input, "Enter");
    assertDeepEqual(selected, ["files"], "Enter should select the active command while input keeps focus");
  } finally {
    mounted.cleanup();
  }
}

function mountCommandPanel(
  onSelectEntry: (entry: CommandPanelEntry) => void,
): { env: DomTestEnv; root: Root; cleanup: () => void } {
  const env = setupDomTestEnv();
  installReactInputPolyfillStubs(env);
  const container = env.document.createElement("div");
  env.document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(CommandPanel, {
      panel: panelFixture(),
      onClose: () => undefined,
      onSelectEntry,
    }));
  });
  return {
    env,
    root,
    cleanup: () => {
      act(() => root.unmount());
      env.teardown();
    },
  };
}

function installReactInputPolyfillStubs(env: DomTestEnv): void {
  const elementPrototype = env.window.HTMLElement.prototype as HTMLElement & {
    attachEvent?: () => void;
    detachEvent?: () => void;
  };
  elementPrototype.attachEvent ??= () => undefined;
  elementPrototype.detachEvent ??= () => undefined;
}

function panelFixture(): CommandPanelState {
  return {
    panel: "generic",
    status: "ready",
    title: "Command menu",
    message: "",
    searchable: true,
    entries: [
      commandEntry("disabled", "Disabled", true),
      { id: "info", title: "Info", kind: "status" },
      commandEntry("open", "Open"),
      commandEntry("files", "Search files"),
    ],
  };
}

function commandEntry(id: string, title: string, disabled = false): CommandPanelEntry {
  return {
    id,
    title,
    kind: "status",
    disabled,
    action: { type: "runSlashCommand", title, commandId: id },
  };
}

function dispatchKey(env: DomTestEnv, target: HTMLElement, key: string): void {
  const event = new env.window.KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key,
  });
  act(() => {
    target.dispatchEvent(event);
  });
}

function assertSelected(env: DomTestEnv, entryId: string, expected: boolean): void {
  const option = env.document.getElementById(commandPanelEntryOptionId(entryId));
  if (!option) throw new Error(`option ${entryId} did not render`);
  assertEqual(option.getAttribute("aria-selected"), String(expected), `${entryId} selected state`);
  assertEqual(option.getAttribute("data-active"), expected ? "true" : "false", `${entryId} active state`);
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
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
