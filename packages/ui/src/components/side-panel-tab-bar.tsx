import { X } from "lucide-react";
import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { ContextMenu, type ContextMenuItem } from "./context-menu";
import { useForgeIntl } from "./i18n-provider";
import type { ForgeIntlContextValue } from "./i18n-provider";
import type {
  SidePanelTab,
  SidePanelTabHostController,
  TabId,
} from "../hooks/use-side-panel-tab-host";
import type { SidePanelTabContextMenuItem } from "../state/side-panel-tab-host";

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
 *     Forge skips until we port the dnd-kit-equivalent wiring.
 *   • Edge scrim sentinels (`Gt(...)` lines 791, 879 + IntersectionObserver
 *     scrim fade) — purely visual, defer.
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
  const { formatMessage } = useForgeIntl();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  // codex: title sits in a `relative min-w-0 flex-1 overflow-hidden` wrapper with a
  // sibling right-edge gradient fade (NOT a CSS ellipsis) so long titles dissolve.
  const label = tab.title != null
    ? (
        <span className="hc-side-panel-tab-pill__title-wrap">
          <span className="hc-side-panel-tab-pill__title">{tab.title}</span>
          <span className="hc-side-panel-tab-pill__title-fade" aria-hidden="true" />
        </span>
      )
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
  const contextMenuItems = useMemo(() => sidePanelTabContextMenuItems(tab, controller, formatMessage), [controller, tab, formatMessage]);
  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    if (contextMenuItems.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY });
  };
  return (
    <>
      <div
        className="hc-side-panel-tab-pill"
        data-tab-id={tab.tabId}
        data-active={isActive ? "true" : "false"}
        data-is-preview={tab.isPreview ? "true" : "false"}
        data-is-label={tab.isLabel ? "true" : "false"}
        onContextMenu={onContextMenu}
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
        {tab.trailingContent != null && (
          <span className="hc-side-panel-tab-pill__trailing">{tab.trailingContent}</span>
        )}
        {tab.isClosable && (
          <button
            type="button"
            data-tab-preview-pin-exempt="true"
            // codex `codex.tabs.closeNamed` defaultMessage "Close {title} tab" — per-tab named label.
            aria-label={formatMessage({ id: "codex.tabs.closeNamed", defaultMessage: "Close {title} tab" }, { title: tabTitleText(tab.title) })}
            className="hc-side-panel-tab-pill__close"
            onClick={onClickClose}
          >
            {/* codex close glyph = icon-xs (16px) */}
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      {contextMenu != null && (
        <ContextMenu
          items={contextMenuItems}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}

export function sidePanelTabContextMenuItems(
  tab: SidePanelTab,
  controller: SidePanelTabHostController,
  formatMessage: ForgeIntlContextValue["formatMessage"],
): ContextMenuItem[] {
  const customItems = (tab.contextMenuItems ?? []).map(sidePanelTabContextMenuItem);
  if (!tab.isClosable) return customItems;
  const closeItem: ContextMenuItem = {
    id: `close:${tab.tabId}`,
    label: formatMessage({ id: "codex.tabs.contextMenu.close", defaultMessage: "Close" }),
    onSelect: () => controller.closeTab(tab.tabId),
  };
  return customItems.length > 0
    ? [...customItems, { id: `separator:${tab.tabId}`, separator: true }, closeItem]
    : [closeItem];
}

function sidePanelTabContextMenuItem(item: SidePanelTabContextMenuItem): ContextMenuItem {
  return {
    id: item.id,
    label: item.label,
    separator: item.separator,
    disabled: item.disabled,
    onSelect: item.onSelect,
  };
}

function tabTitleText(title: ReactNode): string {
  return typeof title === "string" && title.trim() ? title.trim() : "tab";
}
