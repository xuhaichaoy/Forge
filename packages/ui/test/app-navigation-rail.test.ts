import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppNavigationRail } from "../src/components/app-navigation-rail";

export default function runAppNavigationRailTests(): void {
  rendersProjectTabs();
  marksActiveTab();
  leavesProjectTabsInactiveForRemoteTaskRoute();
  rendersSettingsActionWhenProvided();
}

function rendersProjectTabs(): void {
  const html = renderToStaticMarkup(createElement(AppNavigationRail, {
    activeTab: "workbench",
    onTabChange: () => undefined,
  }));

  // Rail renders via i18n; with no ForgeIntlProvider the default en-US bundle
  // resolves dictionary entries / defaultMessage, so expectations are English.
  assertIncludes(html, "All projects", "global app rail should expose the project-level navigation label");
  assertIncludes(html, "Chats", "global app rail should include the Workbench tab (labelled Chats)");
  assertIncludes(html, "Knowledge Base", "global app rail should include the Knowledge Base tab");
}

function marksActiveTab(): void {
  const html = renderToStaticMarkup(createElement(AppNavigationRail, {
    activeTab: "knowledge",
    onTabChange: () => undefined,
  }));

  assertIncludes(html, "aria-current=\"page\"", "active app tab should be marked as the current page");
  assertIncludes(html, "data-active=\"true\"", "active app tab should carry the active styling flag");
}

function leavesProjectTabsInactiveForRemoteTaskRoute(): void {
  const html = renderToStaticMarkup(createElement(AppNavigationRail, {
    activeTab: "remoteTask",
    onTabChange: () => undefined,
  }));

  assertEqual(html.includes("aria-current=\"page\""), false, "remote task route should not mark a project tab active");
  assertEqual(html.includes("data-active=\"true\""), false, "remote task route should not carry project-tab active styling");
}

function rendersSettingsActionWhenProvided(): void {
  const html = renderToStaticMarkup(createElement(AppNavigationRail, {
    activeTab: "workbench",
    onOpenSettings: () => undefined,
    onTabChange: () => undefined,
  }));

  assertIncludes(html, "aria-label=\"Settings\"", "rail settings action should render when wired by the app shell");
}

function assertIncludes(actual: string, expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
