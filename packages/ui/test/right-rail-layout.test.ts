import {
  WORKBENCH_SIDE_PANEL_MIN_WIDTH_PX,
  WORKBENCH_SIDE_PANEL_WIDTH_PX,
  projectAppShellRightRailLayout,
  workbenchSidePanelWidthPx,
} from "../src/state/right-rail-layout";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

export default function runRightRailLayoutTests(): void {
  clampsWorkbenchSidePanelWidth();
  showsPinnedInlineRailWhenThereIsRoomAndThreadContent();
  switchesPinnedRailToPopoverOnlyInOverlayMode();
  hidesInlineAndPopoverRailBehindFilePreview();
  letsFullWidthFilePreviewCoverThreadWithoutInset();
  suppressesRailWithoutActiveThreadOrSections();
}

function clampsWorkbenchSidePanelWidth(): void {
  assertEqual(workbenchSidePanelWidthPx(0), WORKBENCH_SIDE_PANEL_WIDTH_PX, "zero-width container should fall back to desktop side panel width");
  assertEqual(workbenchSidePanelWidthPx(340), WORKBENCH_SIDE_PANEL_MIN_WIDTH_PX, "small container should clamp to side panel minimum");
  assertEqual(workbenchSidePanelWidthPx(1000), WORKBENCH_SIDE_PANEL_WIDTH_PX, "wide container should clamp to side panel maximum");
}

function showsPinnedInlineRailWhenThereIsRoomAndThreadContent(): void {
  const layout = projectAppShellRightRailLayout({
    mainWidthPx: 1800,
    hasActiveThread: true,
    hasRailSections: true,
    rightRailPinned: true,
    rightRailPopoverOpen: false,
    hasFilePreviewSelection: false,
    filePreviewPanelFullWidth: false,
    filePreviewPanelWidthPx: 600,
    hasBackgroundAgentPanel: false,
    automationsPanelOpen: false,
  });

  assertEqual(layout.rightRailMode, "gutter", "wide content should render the rail in gutter mode");
  assertEqual(layout.showRightRail, true, "pinned rail should show inline when gutter mode has content");
  assertEqual(layout.showRightRailPopover, false, "inline mode should not show popover rail");
  assertEqual(layout.threadInlineEndInset, 332, "inline rail should reserve desktop rail width plus gaps");
}

function switchesPinnedRailToPopoverOnlyInOverlayMode(): void {
  const layout = projectAppShellRightRailLayout({
    mainWidthPx: 900,
    hasActiveThread: true,
    hasRailSections: true,
    rightRailPinned: true,
    rightRailPopoverOpen: true,
    hasFilePreviewSelection: false,
    filePreviewPanelFullWidth: false,
    filePreviewPanelWidthPx: 600,
    hasBackgroundAgentPanel: false,
    automationsPanelOpen: false,
  });

  assertEqual(layout.rightRailMode, "overlay", "narrow content should switch to overlay mode");
  assertEqual(layout.showRightRail, false, "overlay rail should not render inline");
  assertEqual(layout.showRightRailPopover, true, "open overlay rail should render as popover");
  assertEqual(layout.threadInlineEndInset, 0, "overlay rail should not reserve thread inset");
  assertEqual(layout.shouldCloseRightRailPopover, false, "valid overlay popover should stay open");
}

function hidesInlineAndPopoverRailBehindFilePreview(): void {
  const layout = projectAppShellRightRailLayout({
    mainWidthPx: 1800,
    hasActiveThread: true,
    hasRailSections: true,
    rightRailPinned: true,
    rightRailPopoverOpen: true,
    hasFilePreviewSelection: true,
    filePreviewPanelFullWidth: false,
    filePreviewPanelWidthPx: 600,
    hasBackgroundAgentPanel: true,
    automationsPanelOpen: true,
  });

  assertEqual(layout.showRightRail, false, "file preview should suppress inline rail");
  assertEqual(layout.showRightRailPopover, false, "file preview should suppress popover rail");
  assertEqual(layout.rightPanelOffsetPx, 600, "file preview width should own the right panel offset");
  assertEqual(layout.threadInlineEndInset, 600, "non-full-width file preview should push the thread by its width");
  assertEqual(layout.shouldCloseRightRailPopover, true, "file preview should close any open rail popover");
}

function letsFullWidthFilePreviewCoverThreadWithoutInset(): void {
  const layout = projectAppShellRightRailLayout({
    mainWidthPx: 1200,
    hasActiveThread: true,
    hasRailSections: true,
    rightRailPinned: true,
    rightRailPopoverOpen: true,
    hasFilePreviewSelection: true,
    filePreviewPanelFullWidth: true,
    filePreviewPanelWidthPx: 600,
    hasBackgroundAgentPanel: false,
    automationsPanelOpen: false,
  });

  assertEqual(layout.rightPanelOffsetPx, 1200, "full-width file preview should reserve the whole main width for panel offset");
  assertEqual(layout.threadInlineEndInset, 0, "full-width file preview should cover rather than push the thread");
}

function suppressesRailWithoutActiveThreadOrSections(): void {
  const withoutThread = projectAppShellRightRailLayout({
    mainWidthPx: 1800,
    hasActiveThread: false,
    hasRailSections: true,
    rightRailPinned: true,
    rightRailPopoverOpen: true,
    hasFilePreviewSelection: false,
    filePreviewPanelFullWidth: false,
    filePreviewPanelWidthPx: 600,
    hasBackgroundAgentPanel: false,
    automationsPanelOpen: false,
  });
  assertEqual(withoutThread.showRightRail, false, "new-chat empty state should not show inline rail");
  assertEqual(withoutThread.shouldCloseRightRailPopover, true, "new-chat empty state should close popover rail");

  const withoutSections = projectAppShellRightRailLayout({
    mainWidthPx: 1800,
    hasActiveThread: true,
    hasRailSections: false,
    rightRailPinned: true,
    rightRailPopoverOpen: true,
    hasFilePreviewSelection: false,
    filePreviewPanelFullWidth: false,
    filePreviewPanelWidthPx: 600,
    hasBackgroundAgentPanel: false,
    automationsPanelOpen: false,
  });
  assertEqual(withoutSections.showRightRail, false, "empty rail sections should not show inline rail");
  assertEqual(withoutSections.shouldCloseRightRailPopover, true, "empty rail sections should close popover rail");
}
