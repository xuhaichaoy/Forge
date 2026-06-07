import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SidePanelTabBar, sidePanelTabContextMenuItems } from "../src/components/side-panel-tab-bar";
import { SidePanelTabHostController } from "../src/state/side-panel-tab-host-controller";
import type { SidePanelTabComponent } from "../src/state/side-panel-tab-host";
import { createI18nBundle, formatI18nMessage } from "../src/state/i18n";

const enFormat = (
  descriptor: Parameters<typeof formatI18nMessage>[1],
  values?: Parameters<typeof formatI18nMessage>[2],
) => formatI18nMessage(createI18nBundle("en-US"), descriptor, values);

export default function runSidePanelTabBarTests(): void {
  buildsContextMenuWithCustomItemsAndClose();
  preservesCustomContextMenuSeparators();
  rendersTrailingContentInTabPill();
}

function buildsContextMenuWithCustomItemsAndClose(): void {
  const controller = new SidePanelTabHostController({
    panelId: "right",
    observer: { setPanelOpen: () => undefined },
  });
  let customSelected = false;
  const tabId = controller.openTab({
    id: "files",
    Component: EmptyTab,
    title: "Files",
    contextMenuItems: [{
      id: "custom",
      label: "Custom item",
      onSelect: () => {
        customSelected = true;
      },
    }],
  });
  const tab = controller.getSnapshot().tabsById[tabId];
  if (!tab) throw new Error("expected tab to exist");

  const items = sidePanelTabContextMenuItems(tab, controller, enFormat);
  assertEqual(items.length, 3, "custom item, separator, close should be present");
  assertEqual(items[0]?.label, "Custom item", "custom item should come first");
  assertEqual(items[1]?.separator, true, "separator should split custom and close");
  assertEqual(items[2]?.label, "Close", "context-menu close item should match Desktop's generic label");
  items[0]?.onSelect?.();
  assertEqual(customSelected, true, "custom item should call onSelect");
  items[2]?.onSelect?.();
  assertEqual(controller.getSnapshot().tabsById[tabId], undefined, "close item should close the tab");
}

function preservesCustomContextMenuSeparators(): void {
  const controller = new SidePanelTabHostController({
    panelId: "right",
    observer: { setPanelOpen: () => undefined },
  });
  const tabId = controller.openTab({
    id: "source",
    Component: EmptyTab,
    title: "Source",
    contextMenuItems: [
      { id: "open", label: "Open file", onSelect: () => undefined },
      { id: "separator", separator: true },
      { id: "copy", label: "Copy path", onSelect: () => undefined },
    ],
  });
  const tab = controller.getSnapshot().tabsById[tabId];
  if (!tab) throw new Error("expected tab to exist");

  const items = sidePanelTabContextMenuItems(tab, controller, enFormat);
  assertEqual(items[1]?.separator, true, "custom separator should be preserved");
  assertEqual(items[3]?.separator, true, "custom items should still be separated from Close");
}

function rendersTrailingContentInTabPill(): void {
  const controller = new SidePanelTabHostController({
    panelId: "right",
    observer: { setPanelOpen: () => undefined },
  });
  const tabId = controller.openTab({
    id: "with-trailing",
    Component: EmptyTab,
    title: "Tab",
    trailingContent: createElement("span", null, "badge"),
  });
  const tab = controller.getSnapshot().tabsById[tabId];
  if (!tab) throw new Error("expected tab to exist");

  const html = renderToStaticMarkup(createElement(SidePanelTabBar, {
    activeTabId: tabId,
    controller,
    tabs: [tab],
  }));
  assertIncludes(html, "hc-side-panel-tab-pill__trailing", "trailing wrapper should render");
  assertIncludes(html, "badge", "trailing content should render");
}

const EmptyTab = (() => null) as unknown as SidePanelTabComponent;

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(actual: string, expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}
