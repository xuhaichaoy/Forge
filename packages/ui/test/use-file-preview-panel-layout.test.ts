import {
  FILE_PREVIEW_PANEL_DEFAULT_WIDTH_PX,
  FILE_PREVIEW_PANEL_MAX_WIDTH_RATIO,
  FILE_PREVIEW_PANEL_MIN_WIDTH_PX,
  clampFilePreviewPanelWidth,
} from "../src/hooks/use-file-preview-panel-layout";

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

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
