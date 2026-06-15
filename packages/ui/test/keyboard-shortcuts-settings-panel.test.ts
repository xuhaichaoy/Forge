import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KeyboardShortcutsSettingsPanel } from "../src/components/keyboard-shortcuts-settings-panel";

export default function runKeyboardShortcutsSettingsPanelTests(): void {
  rendersOneFlatTableWithColumnHeadersAndSectionRows();
}

// §M-56: Forge previously rendered a separate <table> per command group with no column
// headers; Codex (audit-6) renders ONE flat table with a single column header
// (settings.keyboardShortcuts.table.command/keybinding/actions) and per-section group-header
// rows in the <tbody>. This locks in that structure (the rendered pixels still need an A/B
// against Codex.app per the visual-alignment rule; this only asserts the DOM structure).
function rendersOneFlatTableWithColumnHeadersAndSectionRows(): void {
  const html = renderToStaticMarkup(
    createElement(KeyboardShortcutsSettingsPanel, {
      keymapOverrides: {},
      onSetShortcut: () => {},
      onResetShortcut: () => {},
    }),
  );

  assertEqual(
    (html.match(/<table/g) || []).length,
    1,
    "keyboard-shortcuts settings should render exactly one flat table (not a table per section)",
  );
  assertIncludes(html, "hc-keyboard-settings-thead", "should render a single column-header thead");
  assertIncludes(html, ">Command<", "thead should include the Command column header");
  assertIncludes(html, ">Keybinding<", "thead should include the Keybinding column header");
  assertIncludes(
    html,
    "hc-keyboard-settings-section-row",
    "should render per-section group-header rows inside the one table",
  );
  assertIncludes(
    html,
    ">Chat<",
    "should render the Chat section group header (§M-50 taxonomy: thread group -> Chat)",
  );
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(haystack: string, needle: string, message: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(`${message}: expected output to include ${JSON.stringify(needle)}`);
  }
}
