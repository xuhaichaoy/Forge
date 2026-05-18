import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppNavigationRail } from "../src/components/app-navigation-rail";

export default function runAppNavigationRailTests(): void {
  rendersProjectTabs();
  marksActiveTab();
  rendersSettingsActionWhenProvided();
}

function rendersProjectTabs(): void {
  const html = renderToStaticMarkup(createElement(AppNavigationRail, {
    activeTab: "workbench",
    onTabChange: () => undefined,
  }));

  assertIncludes(html, "全部项目", "global app rail should expose the project-level navigation label");
  assertIncludes(html, "工作台", "global app rail should include the Workbench tab");
  assertIncludes(html, "知识库", "global app rail should include the Knowledge Base tab");
}

function marksActiveTab(): void {
  const html = renderToStaticMarkup(createElement(AppNavigationRail, {
    activeTab: "knowledge",
    onTabChange: () => undefined,
  }));

  assertIncludes(html, "aria-current=\"page\"", "active app tab should be marked as the current page");
  assertIncludes(html, "data-active=\"true\"", "active app tab should carry the active styling flag");
}

function rendersSettingsActionWhenProvided(): void {
  const html = renderToStaticMarkup(createElement(AppNavigationRail, {
    activeTab: "workbench",
    onOpenSettings: () => undefined,
    onTabChange: () => undefined,
  }));

  assertIncludes(html, "aria-label=\"设置\"", "rail settings action should render when wired by the app shell");
}

function assertIncludes(actual: string, expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}
