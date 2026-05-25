import {
  SIDE_PANEL_TAB_GRID_GAP_PX,
  SIDE_PANEL_TAB_GRID_MAX_CELL_PX,
  computeSidePanelTabGrid,
} from "../src/state/side-panel-tab-grid";

/*
 * Tests lock in the exact behaviour of Codex Desktop's `tt({...})` at
 * `/private/tmp/codex-asar/pretty/thread-app-shell-chrome-BVkAxLhy.pretty.js:487-496`.
 *
 * Each assertion below is hand-computed from the Codex algorithm:
 *
 *     for (let i = actionCount; i > 1; i--) {
 *       const balanced = actionCount % i === 0;
 *       if (minCellWidth * i + 12 * (i - 1) <= availableWidth && (!requireBalancedRows || balanced)) break;
 *     }
 *     cellWidth = min(330, max(0, (availableWidth - 12 * (i - 1)) / i));
 *     return `repeat(${i}, minmax(0, ${cellWidth}px))`;
 */
export default function runSidePanelTabGridTests(): void {
  returnsNullForZeroActions();
  returnsNullForNonPositiveWidth();
  picksFullCountWhenEverythingFits();
  capsCellWidthAt330px();
  fallsBackToSingleColumnInTinyContainer();
  honoursRequireBalancedRowsForRightPanel();
  allowsUnbalancedRowsForBottomPanel();
  matchesGapAndMaxConstants();
}

function returnsNullForZeroActions(): void {
  // codex line 488: `if (e === 0 || t <= 0) return null;`
  assertEqual(
    computeSidePanelTabGrid({ actionCount: 0, availableWidth: 1000, minCellWidth: 200 }),
    null,
    "0 actions → null",
  );
}

function returnsNullForNonPositiveWidth(): void {
  // codex line 488 (same gate).
  assertEqual(
    computeSidePanelTabGrid({ actionCount: 4, availableWidth: 0, minCellWidth: 200 }),
    null,
    "0 width → null",
  );
  assertEqual(
    computeSidePanelTabGrid({ actionCount: 4, availableWidth: -10, minCellWidth: 200 }),
    null,
    "negative width → null",
  );
}

function picksFullCountWhenEverythingFits(): void {
  /*
   * actionCount=4, available=1200, minCellWidth=200, gap=12.
   * 4 cols: 200*4 + 12*3 = 836 ≤ 1200 → break at i=4.
   * cellWidth = min(330, (1200 - 12*3) / 4) = min(330, 291) = 291.
   */
  const result = computeSidePanelTabGrid({
    actionCount: 4,
    availableWidth: 1200,
    minCellWidth: 200,
  });
  assertNotNull(result, "result");
  assertEqual(result!.columns, 4, "all 4 fit on one row");
  assertEqual(Math.round(result!.cellWidthPx), 291, "cell width under cap");
  assertEqual(result!.gridTemplateColumns, "repeat(4, minmax(0, 291px))", "css value");
}

function capsCellWidthAt330px(): void {
  /*
   * actionCount=4, available=3000, minCellWidth=200.
   * 4 cols: 200*4 + 12*3 = 836 ≤ 3000 → break at i=4.
   * cellWidth = min(330, (3000 - 36) / 4) = min(330, 741) = 330.
   */
  const result = computeSidePanelTabGrid({
    actionCount: 4,
    availableWidth: 3000,
    minCellWidth: 200,
  });
  assertNotNull(result, "result");
  assertEqual(result!.cellWidthPx, SIDE_PANEL_TAB_GRID_MAX_CELL_PX, "capped at 330px");
}

function fallsBackToSingleColumnInTinyContainer(): void {
  /*
   * actionCount=4, available=180, minCellWidth=200.
   * i=4: 200*4 + 36 = 836 > 180. balanced=true; doesn't fit → --i.
   * i=3: 200*3 + 24 = 624 > 180. balanced=false (4%3=1); --i.
   * i=2: 200*2 + 12 = 412 > 180. balanced=true; doesn't fit → --i.
   * loop exits at i=1 (i > 1 false).
   * cellWidth = min(330, max(0, (180 - 0) / 1)) = 180.
   */
  const result = computeSidePanelTabGrid({
    actionCount: 4,
    availableWidth: 180,
    minCellWidth: 200,
  });
  assertNotNull(result, "result");
  assertEqual(result!.columns, 1, "collapses to single column");
  assertEqual(result!.cellWidthPx, 180, "single column gets full width");
}

function honoursRequireBalancedRowsForRightPanel(): void {
  /*
   * actionCount=4, available=720, minCellWidth=220.
   * Right panel: requireBalancedRows = true (default).
   * i=4: 220*4 + 36 = 916 > 720 → --i.
   * i=3: 4%3=1, !balanced → --i.
   * i=2: 220*2 + 12 = 452 ≤ 720 && balanced → break.
   */
  const result = computeSidePanelTabGrid({
    actionCount: 4,
    availableWidth: 720,
    minCellWidth: 220,
  });
  assertNotNull(result, "result");
  assertEqual(result!.columns, 2, "right-panel jumps from 4 directly to 2 to keep rows balanced");
}

function allowsUnbalancedRowsForBottomPanel(): void {
  /*
   * Same dims, requireBalancedRows = false (Codex `target === 'bottom'`).
   * i=4: doesn't fit → --i.
   * i=3: 220*3 + 24 = 684 ≤ 720 (no balanced check) → break.
   */
  const result = computeSidePanelTabGrid({
    actionCount: 4,
    availableWidth: 720,
    minCellWidth: 220,
    requireBalancedRows: false,
  });
  assertNotNull(result, "result");
  assertEqual(result!.columns, 3, "bottom-panel can leave one card on a partial last row");
}

function matchesGapAndMaxConstants(): void {
  // Guards against silent drift of the two literal constants in Codex (12px gap, 330px cap).
  assertEqual(SIDE_PANEL_TAB_GRID_GAP_PX, 12, "gap matches Codex `var et = 12`");
  assertEqual(SIDE_PANEL_TAB_GRID_MAX_CELL_PX, 330, "max cell matches Codex Math.min(330, ...)");
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertNotNull<T>(value: T | null | undefined, message: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
}
