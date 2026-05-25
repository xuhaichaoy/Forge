/*
 * Grid-column calculator for the side-panel new-tab landing page.
 *
 * Direct port of Codex Desktop's `tt({ actionCount, availableWidth, minCellWidth,
 * requireBalancedRows })` at
 * `/private/tmp/codex-asar/pretty/thread-app-shell-chrome-BVkAxLhy.pretty.js:487-496`:
 *
 *     var et = 12;
 *     function tt({ actionCount: e, availableWidth: t, minCellWidth: n, requireBalancedRows: r = !0 }) {
 *       if (e === 0 || t <= 0) return null;
 *       let i = e;
 *       for (; i > 1; ) {
 *         let a = e % i === 0;
 *         if (n * i + et * (i - 1) <= t && (!r || a)) break;
 *         --i;
 *       }
 *       let a = Math.min(330, Math.max(0, (t - et * (i - 1)) / i));
 *       return `repeat(${i}, minmax(0, ${a}px))`;
 *     }
 *
 * Behaviour:
 *   - returns `null` when there's nothing to lay out (Codex: line 488)
 *   - column count walks down from `actionCount`, picking the largest count
 *     that satisfies the width constraint AND (if balanced rows required) is
 *     a divisor of `actionCount` so the last row isn't half-empty
 *   - cell width capped at 330px (Codex: line 495 — `Math.min(330, ...)`)
 *   - 12px inter-cell gap (Codex: `var et = 12` on line 486)
 *
 * `target='bottom'` in Codex passes `requireBalancedRows: false` so the bottom
 * panel can leave a partial last row when squeezed (Codex: line 885 inside
 * `nt`, `requireBalancedRows: f !== 'bottom'`). Right panel always requires
 * balanced rows.
 */
export const SIDE_PANEL_TAB_GRID_GAP_PX = 12;
export const SIDE_PANEL_TAB_GRID_MAX_CELL_PX = 330;

export interface SidePanelTabGridInput {
  readonly actionCount: number;
  readonly availableWidth: number;
  readonly minCellWidth: number;
  /** Defaults to `true`. Codex passes `false` only for the bottom panel. */
  readonly requireBalancedRows?: boolean;
}

export interface SidePanelTabGridResult {
  readonly columns: number;
  readonly cellWidthPx: number;
  /** CSS value suitable for `gridTemplateColumns`, matching Codex's return shape. */
  readonly gridTemplateColumns: string;
}

export function computeSidePanelTabGrid(input: SidePanelTabGridInput): SidePanelTabGridResult | null {
  const { actionCount, availableWidth, minCellWidth } = input;
  const requireBalancedRows = input.requireBalancedRows ?? true;
  if (actionCount === 0 || availableWidth <= 0) return null;

  let columns = actionCount;
  while (columns > 1) {
    const balanced = actionCount % columns === 0;
    const fits = minCellWidth * columns + SIDE_PANEL_TAB_GRID_GAP_PX * (columns - 1) <= availableWidth;
    if (fits && (!requireBalancedRows || balanced)) break;
    columns -= 1;
  }

  const rawCellWidth = (availableWidth - SIDE_PANEL_TAB_GRID_GAP_PX * (columns - 1)) / columns;
  const cellWidthPx = Math.min(SIDE_PANEL_TAB_GRID_MAX_CELL_PX, Math.max(0, rawCellWidth));
  return {
    columns,
    cellWidthPx,
    gridTemplateColumns: `repeat(${columns}, minmax(0, ${cellWidthPx}px))`,
  };
}
