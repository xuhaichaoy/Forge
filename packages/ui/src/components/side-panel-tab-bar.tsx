import { X } from "lucide-react";
import type { ReactNode } from "react";
import type {
  SidePanelTab,
  SidePanelTabHostController,
  TabId,
} from "../hooks/use-side-panel-tab-host";

/*
 * Side-panel tab strip — port of Codex Desktop's `Ht(e)` at
 * `/private/tmp/codex-asar/pretty/app-shell-Bh-lgoQk.pretty.js:703-961`.
 *
 * Layout (Codex line 923-929):
 *   <div ref={D}
 *        data-app-shell-tab-strip-controller={panelId}
 *        className="hide-scrollbar relative flex h-full min-w-0 flex-1 scroll-px-1
 *                   items-center overflow-x-auto overflow-y-hidden"
 *        style={{ scrollPaddingInlineEnd: '${stickyTrailWidth}px' }}>
 *     {beforeLeftScrim}{sentinelLeft}{tabList}{sentinelRight}{rightScrim}{stickyTail}
 *   </div>
 *
 * Inside the outer flex (line 952-959): `[beforeSlot, tabsContainer, afterSlot]`.
 *
 * Pill (Codex `Pt` / `Mt` at line 422-417): rounded-lg, h-7, max-w-39, px-2 py-1,
 * `bg-token-main-surface-primary`, active variant invokes `Mt` styling with
 * `aria-selected`. Click → `controller.activateTab(scope, tabId)`; close X →
 * `controller.closeTab(scope, tabId)` (line 500-501).
 *
 * What we deliberately do NOT port (per "如果拿不到依据就不要做"):
 *   • DnD via dnd-kit (`useDraggable`, `transform`, `isDragging` — lines 449-456)
 *     — Codex's tab strip supports drag-to-reorder & cross-controller move.
 *     HiCodex skips until we port the dnd-kit-equivalent wiring.
 *   • Edge scrim sentinels (`Gt(...)` lines 791, 879 + IntersectionObserver
 *     scrim fade) — purely visual, defer.
 *   • Context menu (Codex line 458-481 `F = () => [...contextMenuItems, close]`)
 *     — defer until HiCodex needs it.
 *   • Trailing content (`tab.trailingContent` rendered as `y` at line 384).
 *
 * Preview pill style mirrors Codex's italic title treatment via
 * `data-is-preview` so a future stylesheet rule can target it.
 */
export interface SidePanelTabBarProps {
  readonly controller: SidePanelTabHostController;
  readonly tabs: readonly SidePanelTab[];
  readonly activeTabId: TabId | null;
  /** Slot rendered before the tab list (left edge). Codex `before` arg. */
  readonly beforeSlot?: ReactNode;
  /** Slot rendered after the tab list, NOT sticky. Codex `after` arg. */
  readonly afterSlot?: ReactNode;
  /** Sticky slot at the right edge — Codex `afterListSticky` (the "+" button). */
  readonly afterStickySlot?: ReactNode;
}

export function SidePanelTabBar({
  controller,
  tabs,
  activeTabId,
  beforeSlot,
  afterSlot,
  afterStickySlot,
}: SidePanelTabBarProps) {
  return (
    <div
      className="hc-side-panel-tab-bar"
      data-app-shell-tab-strip-controller={controller.getSnapshot().panelId}
      role="tablist"
    >
      {beforeSlot != null && <div className="hc-side-panel-tab-bar__before">{beforeSlot}</div>}
      <div className="hc-side-panel-tab-bar__strip">
        {tabs.map((tab) => (
          <SidePanelTabPill
            key={tab.tabId}
            controller={controller}
            tab={tab}
            isActive={tab.tabId === activeTabId}
          />
        ))}
      </div>
      {afterSlot != null && <div className="hc-side-panel-tab-bar__after">{afterSlot}</div>}
      {afterStickySlot != null && (
        <div className="hc-side-panel-tab-bar__after-sticky">{afterStickySlot}</div>
      )}
    </div>
  );
}

interface SidePanelTabPillProps {
  readonly controller: SidePanelTabHostController;
  readonly tab: SidePanelTab;
  readonly isActive: boolean;
}

function SidePanelTabPill({ controller, tab, isActive }: SidePanelTabPillProps) {
  const label = tab.title != null
    ? <span className="hc-side-panel-tab-pill__title">{tab.title}</span>
    : null;
  // codex Pt line 500: `H = () => n.activateTab(s, l)`; line 1019-1022 `qt` body click upgrade preview to pin.
  const onClickTab = () => {
    controller.activateTab(tab.tabId);
    if (tab.isPreview) controller.pinTab(tab.tabId);
  };
  // codex Pt line 501: `V = () => n.closeTab(s, l)`.
  const onClickClose: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    event.stopPropagation();
    controller.closeTab(tab.tabId);
  };
  return (
    <div
      className="hc-side-panel-tab-pill"
      data-tab-id={tab.tabId}
      data-active={isActive ? "true" : "false"}
      data-is-preview={tab.isPreview ? "true" : "false"}
      data-is-label={tab.isLabel ? "true" : "false"}
    >
      <button
        type="button"
        role="tab"
        aria-selected={isActive}
        title={tab.tooltip ?? undefined}
        className="hc-side-panel-tab-pill__button"
        onClick={onClickTab}
      >
        {tab.icon != null && <span className="hc-side-panel-tab-pill__icon">{tab.icon}</span>}
        {label}
      </button>
      {tab.isClosable && (
        <button
          type="button"
          aria-label="Close tab"
          className="hc-side-panel-tab-pill__close"
          onClick={onClickClose}
        >
          <X size={12} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
