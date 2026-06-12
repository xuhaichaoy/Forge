import {
  Component,
  useCallback,
  useMemo,
  useRef,
  type CSSProperties,
  type ErrorInfo,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
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
 * Active tab rendering — Codex `qt` wraps the result of `tab.renderPanel(closeFn)`
 * in an ErrorBoundary + `role=tabpanel`, and pointer/key interaction inside a
 * preview panel pins that preview tab unless the target opts out via
 * `data-tab-preview-pin-exempt`.
 *
 * Width — Codex `RightPanelOutlet` (app-shell-Bh-lgoQk:2777-2809) hard-codes
 * a `defaultWidth: 600` and supports user resize. HiCodex starts with the
 * 600 default and exposes a `widthPx` prop so the parent controls resize via
 * the existing `useFilePreviewPanelLayout` hook (or a future side-panel hook).
 *
 * NOT ported here yet:
 *   • Width animation (motion-one bridge `app-shell-panel-animation`)
 *   • Full-width toggle (Codex `U` atom + `Q()` helper)
 *   These remain to-do.
 * Resize handle (`Le` in Codex `vn` at app-shell:522) IS ported: the optional
 * `resize` prop wires the host to `useFilePreviewPanelLayout` (drag from the
 * left edge, double-click resets to the 600px default, width persists).
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
   * Full-width mode (Codex `widthMode === "full"`): the panel covers the full
   * main-content width and the resize handle is hidden.
   */
  readonly fullWidth?: boolean;
  /** Left-edge resize handle wiring (Codex `Le`). Omit to render no handle. */
  readonly resize?: {
    readonly isResizing: boolean;
    readonly onResizeStart: (
      event: { clientX: number; pointerId?: number },
      asideElement: HTMLElement | null,
    ) => void;
    readonly onResetWidth: () => void;
  };
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
  fullWidth = false,
  resize,
  className,
}: SidePanelHostProps) {
  const style = useMemo<CSSProperties>(
    () => ({ width: fullWidth ? "100%" : `${widthPx}px` }),
    [fullWidth, widthPx],
  );
  const asideRef = useRef<HTMLElement | null>(null);

  const handleResizePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!resize || event.button !== 0) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some browsers reject capture on synthetic events; resizing still works.
    }
    resize.onResizeStart(event, asideRef.current);
  }, [resize]);

  const handleResizeClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (!resize) return;
    if (event.detail === 2) {
      event.preventDefault();
      resize.onResetWidth();
    }
  }, [resize]);

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
    const pinPreviewFromInteraction = (event: PointerEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>) => {
      if (!activeTab.isPreview) return;
      const target = event.target;
      if (target instanceof Element && target.closest("[data-tab-preview-pin-exempt]")) return;
      controller.pinTab(tabId);
    };
    return (
      <div
        role="tabpanel"
        aria-label={typeof activeTab.title === "string" ? activeTab.title : undefined}
        data-app-shell-tab-panel-controller={controller.getSnapshot().panelId}
        data-tab-id={tabId}
        className="hc-side-panel-host__tab-panel"
        tabIndex={-1}
        onKeyDownCapture={pinPreviewFromInteraction}
        onPointerDownCapture={pinPreviewFromInteraction}
      >
        <SidePanelTabErrorBoundary resetKey={tabId}>
          <Component {...props} tabId={tabId} isActive={isActive} tabState={tabStateValue} setTabState={setTabState} onClose={onClose} />
        </SidePanelTabErrorBoundary>
      </div>
    );
  }, [activeTab, controller]);

  const activeTabId = activeTab?.tabId ?? null;
  return (
    <aside
      ref={asideRef}
      className={className ? `hc-side-panel-host ${className}` : "hc-side-panel-host"}
      style={style}
      data-full-width={fullWidth ? "true" : undefined}
      data-resizing={resize?.isResizing ? "true" : undefined}
      data-side-panel-id={controller.getSnapshot().panelId}
    >
      {resize != null && !fullWidth && (
        <div
          aria-hidden
          className="hc-side-panel-host__resize-handle"
          data-resizing={resize.isResizing ? "true" : undefined}
          onClick={handleResizeClick}
          onPointerDown={handleResizePointerDown}
        >
          <div className="hc-side-panel-host__resize-handle-line" aria-hidden />
        </div>
      )}
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

class SidePanelTabErrorBoundary extends Component<
  { children: ReactNode; resetKey: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (typeof console !== "undefined") {
      console.error("AppShellTabPanel crashed", error, info.componentStack);
    }
  }

  componentDidUpdate(prevProps: { resetKey: string }): void {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error != null) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error != null) {
      return (
        <div className="hc-side-panel-host__error" role="alert">
          This tab could not be rendered.
        </div>
      );
    }
    return this.props.children;
  }
}
