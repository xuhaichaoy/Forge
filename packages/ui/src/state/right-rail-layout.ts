import {
  rightRailDisplayMode,
  rightRailReservedInlineEndPx,
  type RightRailDisplayMode,
} from "./right-rail";

export const WORKBENCH_SIDE_PANEL_WIDTH_PX = 520;
export const WORKBENCH_SIDE_PANEL_MIN_WIDTH_PX = 320;
export const WORKBENCH_SIDE_PANEL_EDGE_MARGIN_PX = 48;

export interface AppShellRightRailLayoutInput {
  mainWidthPx: number;
  hasActiveThread: boolean;
  hasRailSections: boolean;
  rightRailPinned: boolean;
  rightRailPopoverOpen: boolean;
  hasFilePreviewSelection: boolean;
  filePreviewPanelFullWidth: boolean;
  filePreviewPanelWidthPx: number;
  hasBackgroundAgentPanel: boolean;
  automationsPanelOpen: boolean;
}

export interface AppShellRightRailLayout {
  filePreviewPanelEffectiveWidthPx: number;
  backgroundAgentPanelEffectiveWidthPx: number;
  automationsPanelEffectiveWidthPx: number;
  activeSidePanelEffectiveWidthPx: number;
  sidePanelRailOffsetPx: number;
  rightRailLayoutWidthPx: number;
  rightRailMode: RightRailDisplayMode;
  showRightRail: boolean;
  showRightRailPopover: boolean;
  shouldCloseRightRailPopover: boolean;
  rightPanelOffsetPx: number;
  threadInlineEndInset: number;
}

export function workbenchSidePanelWidthPx(containerWidthPx: number): number {
  if (containerWidthPx <= 0) return WORKBENCH_SIDE_PANEL_WIDTH_PX;
  return Math.max(
    WORKBENCH_SIDE_PANEL_MIN_WIDTH_PX,
    Math.min(WORKBENCH_SIDE_PANEL_WIDTH_PX, containerWidthPx - WORKBENCH_SIDE_PANEL_EDGE_MARGIN_PX),
  );
}

export function projectAppShellRightRailLayout(input: AppShellRightRailLayoutInput): AppShellRightRailLayout {
  const mainWidthPx = Math.max(0, input.mainWidthPx);
  const filePreviewPanelEffectiveWidthPx = input.hasFilePreviewSelection && !input.filePreviewPanelFullWidth
    ? Math.max(0, input.filePreviewPanelWidthPx)
    : 0;
  const backgroundAgentPanelEffectiveWidthPx = input.hasBackgroundAgentPanel
    ? workbenchSidePanelWidthPx(mainWidthPx)
    : 0;
  const automationsPanelEffectiveWidthPx = input.automationsPanelOpen
    ? workbenchSidePanelWidthPx(mainWidthPx)
    : 0;
  const activeSidePanelEffectiveWidthPx = input.hasFilePreviewSelection
    ? filePreviewPanelEffectiveWidthPx
    : (backgroundAgentPanelEffectiveWidthPx || automationsPanelEffectiveWidthPx);
  const sidePanelRailOffsetPx = input.hasFilePreviewSelection
    ? (input.filePreviewPanelFullWidth ? mainWidthPx : filePreviewPanelEffectiveWidthPx)
    : activeSidePanelEffectiveWidthPx;
  const rightRailLayoutWidthPx = Math.max(0, mainWidthPx - sidePanelRailOffsetPx);
  const rightRailMode = rightRailDisplayMode(rightRailLayoutWidthPx);
  const showRightRail = input.rightRailPinned
    && input.hasActiveThread
    && input.hasRailSections
    && rightRailMode !== "overlay"
    && !input.hasFilePreviewSelection;
  const showRightRailPopover = input.rightRailPopoverOpen
    && input.hasActiveThread
    && input.hasRailSections
    && rightRailMode === "overlay"
    && !input.hasFilePreviewSelection;
  const shouldCloseRightRailPopover = rightRailMode !== "overlay"
    || !input.hasActiveThread
    || !input.hasRailSections
    || input.hasFilePreviewSelection;
  const threadInlineEndInset = input.hasFilePreviewSelection && input.filePreviewPanelFullWidth
    ? 0
    : Math.round(
      activeSidePanelEffectiveWidthPx
        + rightRailReservedInlineEndPx(rightRailLayoutWidthPx, showRightRail, input.rightRailPinned),
    );

  return {
    filePreviewPanelEffectiveWidthPx,
    backgroundAgentPanelEffectiveWidthPx,
    automationsPanelEffectiveWidthPx,
    activeSidePanelEffectiveWidthPx,
    sidePanelRailOffsetPx,
    rightRailLayoutWidthPx,
    rightRailMode,
    showRightRail,
    showRightRailPopover,
    shouldCloseRightRailPopover,
    rightPanelOffsetPx: Math.round(sidePanelRailOffsetPx),
    threadInlineEndInset,
  };
}
