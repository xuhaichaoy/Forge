import type { CSSProperties, ReactNode } from "react";
import { useCallback, useMemo } from "react";
import { SidePanelTabBar } from "./side-panel-tab-bar";
import type {
  SidePanelTab,
  SidePanelTabHostController,
  TabId,
} from "../hooks/use-side-panel-tab-host";

/*
 * Side-panel host — outer container that combines the tab strip, the active
 * tab's content, and the empty-state slot. Port of Codex Desktop's `Vt(e)` at
 * `/private/tmp/codex-asar/pretty/app-shell-Bh-lgoQk.pretty.js:652-701`:
 *
 *   function Vt({ afterList, afterListSticky, beforeList, emptyState, headerHeight, controller }) {
 *     let tabs = atomGet(controller.tabs$);
 *     let activeTab = atomGet(controller.activeTab$);
 *     let activeTabReactKey = atomGet(controller.activeTabReactKey$);
 *     // ... (dnd state)
 *     let header = jsx(Ht, { height, activeTabId, after, afterSticky, before, controller, tabs });
 *     let body = activeTab == null
 *       ? jsx('div', { className: 'relative min-h-0 flex-1', children: emptyState })
 *       : jsx(qt, { controller, tab: activeTab }, activeTabReactKey);
 *     return jsx('div', { className: 'flex h-full min-h-0 flex-col bg-token-main-surface-primary',
 *                         children: [header, body] });
 *   }
 *
 * Active tab rendering — Codex `qt` (line 1014-1082) wraps the result of
 * `tab.renderPanel(closeFn)` in an ErrorBoundary + `role=tabpanel`. HiCodex
 * simplifies: render `<tab.Component ...>` directly with the close/active/
 * tabState plumbing matching the Codex `B(...)` factory (line 286-307).
 *
 * Width — Codex `RightPanelOutlet` (app-shell-Bh-lgoQk:2777-2809) hard-codes
 * a `defaultWidth: 600` and supports user resize. HiCodex starts with the
 * 600 default and exposes a `widthPx` prop so the parent controls resize via
 * the existing `useFilePreviewPanelLayout` hook (or a future side-panel hook).
 *
 * NOT ported here yet:
 *   • Resize handle (`Le` in Codex `vn` at app-shell:522)
 *   • Width animation (motion-one bridge `app-shell-panel-animation`)
 *   • Full-width toggle (Codex `U` atom + `Q()` helper)
 *   • ErrorBoundary around tab content (Codex `Ge` at qt:1054)
 *   These remain to-do; bare structural shell first.
 */
export const SIDE_PANEL_HOST_DEFAULT_WIDTH_PX = 600;

export interface SidePanelHostProps {
  readonly controller: SidePanelTabHostController;
  readonly tabs: readonly SidePanelTab[];
  readonly activeTab: SidePanelTab | null;
  readonly activeTabReactKey: string | null;
  /**
   * Empty-state UI shown when there is no active tab. Codex line 681:
   *   `activeTab == null ? <div className="relative min-h-0 flex-1">{emptyState}</div> : ...`
   */
  readonly emptyState?: ReactNode;
  readonly beforeTabsSlot?: ReactNode;
  readonly afterTabsSlot?: ReactNode;
  /** Sticky tail slot — Codex `afterListSticky`, typically the "+" button. */
  readonly afterTabsStickySlot?: ReactNode;
  /** Slot rendered above the tab strip (HiCodex extension for app header). */
  readonly headerSlot?: ReactNode;
  /** Pixel width of the panel. Default 600px (Codex `RightPanelOutlet` default). */
  readonly widthPx?: number;
  /**
   * Internal per-tab state. Pass a Record keyed by tabId; missing entries are
   * treated as undefined (the controller's `defaultState` seed is used). The
   * host turns this into the `tabState` prop on the active tab's Component.
   *
   * Caller owns nothing here — the controller manages the state internally.
   * This prop is only relevant if the consumer wants to render Tabs in a
   * specific way; default behavior is to read from controller snapshot.
   */
  readonly className?: string;
}

export function SidePanelHost({
  controller,
  tabs,
  activeTab,
  activeTabReactKey,
  emptyState,
  beforeTabsSlot,
  afterTabsSlot,
  afterTabsStickySlot,
  headerSlot,
  widthPx = SIDE_PANEL_HOST_DEFAULT_WIDTH_PX,
  className,
}: SidePanelHostProps) {
  const style = useMemo<CSSProperties>(() => ({ width: `${widthPx}px` }), [widthPx]);

  /*
   * codex: `B(...)` per-tab renderPanel factory at app-shell-tab-controller:286-307.
   * Each invocation builds a closure that injects (`...props, onClose, tabId,
   * isActive, tabState, setTabState`) into the Component. We inline the same
   * shape directly here so renderPanel doesn't need to be precomputed.
   */
  const renderActiveTab = useCallback(() => {
    if (activeTab == null) return null;
    const Component = activeTab.Component;
    const { tabId, props } = activeTab;
    const tabStateSlot = controller.getSnapshot().tabStates[tabId];
    const fallbackInitial = activeTab.defaultState?.();
    const tabStateValue = tabStateSlot?.value ?? fallbackInitial;
    const setTabState = (next: unknown | ((prev: unknown) => unknown)) => {
      controller.setTabState(tabId, next, fallbackInitial);
    };
    const onClose = () => controller.closeTab(tabId);
    const isActive = true;
    return (
      <div
        role="tabpanel"
        aria-label={typeof activeTab.title === "string" ? activeTab.title : undefined}
        data-app-shell-tab-panel-controller={controller.getSnapshot().panelId}
        data-tab-id={tabId}
        className="hc-side-panel-host__tab-panel"
        tabIndex={-1}
      >
        <Component {...props} tabId={tabId} isActive={isActive} tabState={tabStateValue} setTabState={setTabState} onClose={onClose} />
      </div>
    );
  }, [activeTab, controller]);

  const activeTabId = activeTab?.tabId ?? null;
  return (
    <aside
      className={className ? `hc-side-panel-host ${className}` : "hc-side-panel-host"}
      style={style}
      data-side-panel-id={controller.getSnapshot().panelId}
    >
      {headerSlot != null && <div className="hc-side-panel-host__header">{headerSlot}</div>}
      <SidePanelTabBar
        controller={controller}
        tabs={tabs}
        activeTabId={activeTabId}
        beforeSlot={beforeTabsSlot}
        afterSlot={afterTabsSlot}
        afterStickySlot={afterTabsStickySlot}
      />
      <div className="hc-side-panel-host__body">
        {activeTab == null
          ? <div className="hc-side-panel-host__empty">{emptyState}</div>
          : <div key={activeTabReactKey ?? activeTab.tabId} className="hc-side-panel-host__active">{renderActiveTab()}</div>
        }
      </div>
    </aside>
  );
}

export type { SidePanelTab, SidePanelTabHostController, TabId };
