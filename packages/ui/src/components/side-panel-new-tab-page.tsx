import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { RailEntry } from "../state/render-groups";
import {
  SIDE_PANEL_TAB_GRID_MAX_CELL_PX,
  computeSidePanelTabGrid,
} from "../state/side-panel-tab-grid";
import { railEntryIcon } from "./right-rail-entry-icons";
import { SidePanelTabActionCard, type SidePanelTabActionCardProps } from "./side-panel-tab-action-card";
import { useForgeIntl } from "./i18n-provider";

/*
 * Side-panel new-tab landing page.
 *
 * Direct port of Codex Desktop's `nt(e)` at
 * `/private/tmp/codex-asar/pretty/thread-app-shell-chrome-BVkAxLhy.pretty.js:498-984`.
 *
 * Layout summary (Codex line 971-978):
 *   <div className="flex h-full min-h-0 flex-col overflow-x-hidden overflow-y-auto
 *                   bg-token-main-surface-primary p-6">
 *     <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center">
 *       {gridOrEmptyState}
 *       {suggestedSection}
 *     </div>
 *   </div>
 *
 * Grid (Codex line 894-923):
 *   - measure container width via ResizeObserver
 *   - compute `gridTemplateColumns` via `tt({...})` — `computeSidePanelTabGrid`
 *   - `minCellWidth` = `min(330, ceil(max(28, ...labelWidths) + 32))`, harvested
 *     from `[data-thread-side-panel-new-tab-action-label]` (Codex line 879-887).
 *
 * Empty state (Codex line 911-918):
 *   "No tabs are available for this thread" inside a bordered card.
 *
 * `Suggested` artifacts section (current Codex `thread-app-shell-chrome-*.js`
 * around `outputArtifacts`) is supplied through `suggestedSlot` so the page
 * can keep the Desktop action-grid geometry while callers own artifact data.
 *
 * `target='bottom'` (Codex line 503 `f = d === void 0 ? 'right' : d`) lifts
 * into `requireBalancedRows: target !== 'bottom'` (Codex line 885).
 */
export interface SidePanelNewTabAction extends SidePanelTabActionCardProps {}

export interface SidePanelNewTabPageProps {
  readonly actions: readonly SidePanelNewTabAction[];
  /**
   * Codex line 503: `f = d === void 0 ? 'right' : d`. The bottom panel allows
   * unbalanced last row (line 885 `requireBalancedRows: f !== 'bottom'`).
   */
  readonly target?: "right" | "bottom";
  /**
   * Optional render slot for the "Suggested" section below the grid. When
   * provided, the heading "Suggested" + the slot's content are rendered
   * verbatim. Mirrors Codex line 924-967 without locking us into the artifact
   * row implementation yet.
   */
  readonly suggestedSlot?: ReactNode;
  readonly emptyStateLabel?: ReactNode;
  readonly suggestedHeading?: ReactNode;
}


/*
 * Codex line 877-887: `xt = (entry, container) => {
 *   let n = Array.from(container.querySelectorAll('[data-thread-side-panel-new-tab-action-label]'), it),
 *       r = Math.min(330, Math.ceil(Math.max(28, ...n) + 32));
 *   let i = tt({...});
 *   i != null && bt.set(i);
 * };`
 * where `it = (el) => el.scrollWidth` (line 989-991).
 *
 * 28px label floor and +32px padding allowance match the source exactly.
 */
const LABEL_FLOOR_PX = 28;
const LABEL_PADDING_ALLOWANCE_PX = 32;

export function SidePanelNewTabPage({
  actions,
  target = "right",
  suggestedSlot,
  emptyStateLabel,
  suggestedHeading,
}: SidePanelNewTabPageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [gridTemplateColumns, setGridTemplateColumns] = useState<string | undefined>(undefined);
  const { formatMessage } = useForgeIntl();
  // codex thread.sidePanel.newTab.* — localized empty-state + suggested heading defaults.
  const resolvedEmptyStateLabel = emptyStateLabel
    ?? formatMessage({ id: "thread.sidePanel.newTab.empty", defaultMessage: "No tabs are available for this thread" });
  const resolvedSuggestedHeading = suggestedHeading
    ?? formatMessage({ id: "thread.sidePanel.newTab.suggested.heading", defaultMessage: "Suggested" });

  /*
   * codex: line 877-893 — measure `[data-thread-side-panel-new-tab-action-label]`
   * scrollWidths inside the action grid and feed into `tt(...)`.
   */
  const measureAndUpdateGrid = useCallback(() => {
    const grid = containerRef.current;
    if (grid == null) return;
    const labelWidths: number[] = [];
    for (const node of grid.querySelectorAll<HTMLElement>("[data-thread-side-panel-new-tab-action-label]")) {
      labelWidths.push(node.scrollWidth);
    }
    const minCellWidth = Math.min(
      SIDE_PANEL_TAB_GRID_MAX_CELL_PX,
      Math.ceil(Math.max(LABEL_FLOOR_PX, ...labelWidths) + LABEL_PADDING_ALLOWANCE_PX),
    );
    const result = computeSidePanelTabGrid({
      actionCount: actions.length,
      availableWidth: grid.getBoundingClientRect().width,
      minCellWidth,
      requireBalancedRows: target !== "bottom",
    });
    if (result != null) setGridTemplateColumns(result.gridTemplateColumns);
  }, [actions.length, target]);

  useEffect(() => {
    measureAndUpdateGrid();
    const grid = containerRef.current;
    if (grid == null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measureAndUpdateGrid);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [measureAndUpdateGrid]);

  const gridStyle: CSSProperties | undefined = gridTemplateColumns != null
    ? { gridTemplateColumns }
    : undefined;
  const hasSuggestedSlot = suggestedSlot != null;

  return (
    <div className="hc-side-panel-new-tab">
      <div className="hc-side-panel-new-tab__inner">
        {actions.length > 0 ? (
          <div
            ref={containerRef}
            data-thread-side-panel-new-tab-action-grid
            className="hc-side-panel-new-tab__grid"
            style={gridStyle}
          >
            {actions.map((action) => (
              <SidePanelTabActionCard
                key={action.id}
                id={action.id}
                title={action.title}
                description={action.description}
                icon={action.icon}
                onSelect={action.onSelect}
              />
            ))}
          </div>
        ) : hasSuggestedSlot ? null : (
          <div className="hc-side-panel-new-tab__empty">{resolvedEmptyStateLabel}</div>
        )}
        {suggestedSlot != null && (
          <div className="hc-side-panel-new-tab__suggested">
            <h3 className="hc-side-panel-new-tab__suggested-heading">{resolvedSuggestedHeading}</h3>
            {suggestedSlot}
          </div>
        )}
      </div>
    </div>
  );
}

export function SidePanelSuggestedArtifacts({
  artifacts,
  onOpenArtifact,
}: {
  readonly artifacts: readonly RailEntry[];
  readonly onOpenArtifact: (entry: RailEntry) => void;
}) {
  if (artifacts.length === 0) return null;
  return (
    <ul className="hc-side-panel-new-tab__suggested-list">
      {artifacts.map((entry) => {
        const tooltip = entry.meta ?? entry.title;
        return (
          <li key={entry.id} className="hc-side-panel-new-tab__suggested-item">
            <button
              type="button"
              className="hc-side-panel-new-tab__suggested-button"
              title={tooltip}
              onClick={() => onOpenArtifact(entry)}
            >
              <span className="hc-side-panel-new-tab__suggested-icon" aria-hidden="true">
                {railEntryIcon(entry, "artifacts")}
              </span>
              <span className="hc-side-panel-new-tab__suggested-title">{entry.title}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
