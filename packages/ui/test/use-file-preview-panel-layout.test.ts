import {
  FILE_PREVIEW_PANEL_FULL_WIDTH_STORAGE_KEY,
  FILE_PREVIEW_PANEL_DEFAULT_WIDTH_PX,
  FILE_PREVIEW_PANEL_MAX_WIDTH_RATIO,
  FILE_PREVIEW_PANEL_MIN_WIDTH_PX,
  FILE_PREVIEW_PANEL_WIDTH_STORAGE_KEY,
  clampFilePreviewPanelWidth,
  loadFilePreviewPanelFullWidth,
  loadFilePreviewPanelWidth,
  saveFilePreviewPanelFullWidth,
  saveFilePreviewPanelWidth,
} from "../src/state/file-preview-panel-preferences";

/*
 * Codex Desktop AppShell RightPanel (`app-shell.formatted.js`):
 *   - `function vn` :522-524 → `setSize: e3 => { if (e3 < x(320)) { close }; ... }`
 *   - `function Ln` :643 → `defaultWidth: r2 = 600`
 * These are the two invariants we replicate here.
 */
export default function runFilePreviewPanelLayoutTests(): void {
  clampsBelowMinimumToTheCodexFloor();
  clampsAboveMaximumToTheContainerCeiling();
  passesThroughInRangeValues();
  fallsBackToDefaultOnNonFiniteInput();
  exposesCodexParityConstants();
  migratesLegacyPreferenceKeysIntoSharedNamespace();
}

function clampsBelowMinimumToTheCodexFloor(): void {
  assertEqual(
    clampFilePreviewPanelWidth(120, 1200),
    FILE_PREVIEW_PANEL_MIN_WIDTH_PX,
    "width below the floor should clamp up to Codex `if (e3 < x(320)) close` floor (caller-side close-guard handles the actual close)",
  );
  assertEqual(
    clampFilePreviewPanelWidth(FILE_PREVIEW_PANEL_MIN_WIDTH_PX - 1, 1200),
    FILE_PREVIEW_PANEL_MIN_WIDTH_PX,
    "any value below the min should clamp to exactly the floor",
  );
}

function clampsAboveMaximumToTheContainerCeiling(): void {
  assertEqual(
    clampFilePreviewPanelWidth(2000, 900),
    900,
    "width should clamp to the container max when the requested width exceeds it",
  );
  assertEqual(
    clampFilePreviewPanelWidth(900, 900),
    900,
    "exact ceiling should be preserved",
  );
}

function passesThroughInRangeValues(): void {
  assertEqual(
    clampFilePreviewPanelWidth(620, 1200),
    620,
    "a value between min and max should pass through unchanged",
  );
}

function fallsBackToDefaultOnNonFiniteInput(): void {
  assertEqual(
    clampFilePreviewPanelWidth(Number.NaN, 1200),
    FILE_PREVIEW_PANEL_DEFAULT_WIDTH_PX,
    "NaN input should fall back to the default width rather than corrupt persistence",
  );
}

function exposesCodexParityConstants(): void {
  assertEqual(
    FILE_PREVIEW_PANEL_MIN_WIDTH_PX,
    320,
    "min-width must match Codex `app-shell.formatted.js function vn:522 if (e3 < x(320)) close`",
  );
  assertEqual(
    FILE_PREVIEW_PANEL_DEFAULT_WIDTH_PX,
    600,
    "default width must match Codex `app-shell.formatted.js function Ln:643 defaultWidth: r2 = 600`",
  );
  assertEqual(
    FILE_PREVIEW_PANEL_MAX_WIDTH_RATIO > 0 && FILE_PREVIEW_PANEL_MAX_WIDTH_RATIO <= 1,
    true,
    "max-width ratio must be a fraction of container width (Codex `rightPanelWidthRatio`)",
  );
}

function migratesLegacyPreferenceKeysIntoSharedNamespace(): void {
  const storage = memoryStorage();
  storage.setItem("hicodex.filePreviewPanel.widthPx", "720");
  storage.setItem("hicodex.filePreviewPanel.fullWidth", "1");
  assertEqual(
    loadFilePreviewPanelWidth(storage),
    720,
    "file preview width should read the legacy key during migration",
  );
  assertEqual(
    loadFilePreviewPanelFullWidth(storage),
    true,
    "file preview full-width preference should read the legacy key during migration",
  );

  saveFilePreviewPanelWidth(storage, 640);
  saveFilePreviewPanelFullWidth(storage, false);
  assertEqual(
    storage.values.get(FILE_PREVIEW_PANEL_WIDTH_STORAGE_KEY),
    "640",
    "new width writes should use the shared desktop.hicodex namespace",
  );
  assertEqual(
    storage.values.get(FILE_PREVIEW_PANEL_FULL_WIDTH_STORAGE_KEY),
    "0",
    "false full-width writes must persist an explicit off value in the shared namespace",
  );
  assertEqual(
    storage.values.has("hicodex.filePreviewPanel.fullWidth"),
    false,
    "saving full-width must drop the legacy key so it cannot shadow later writes",
  );
  assertEqual(
    loadFilePreviewPanelFullWidth(storage),
    false,
    "full-width must read back false after saving false — a leftover legacy \"1\" used to resurrect it on relaunch",
  );
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
