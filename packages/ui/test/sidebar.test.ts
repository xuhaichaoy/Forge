import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { sidebarContextMenuPosition } from "../src/components/sidebar";
import { Sidebar } from "../src/components/sidebar";
import { SidebarNavItem } from "../src/components/sidebar-nav-item";
import {
  SidebarProjectSection,
  projectSectionCollapseAction,
} from "../src/components/sidebar-project-section";
import { SidebarUpdateBadge } from "../src/components/sidebar-update-badge";
import type { AccountViewModel } from "../src/state/account-state";
import type { I18nMessageDescriptor, I18nValues } from "../src/state/i18n";

export default function runSidebarComponentTests(): void {
  clampsThreadContextMenuIntoViewport();
  rendersSidebarNavItemAccelerator();
  rendersThreadListLoadingStateInsteadOfEmptyState();
  rendersConnectingStateInsteadOfEmptyThreadState();
  rendersSidebarUpdateBadgeStates();
  rendersUsageAlertWhenQuotaIsLow();
  rendersProjectSectionMenus();
  computesProjectSectionCollapseAction();
}

function clampsThreadContextMenuIntoViewport(): void {
  const bottomRight = sidebarContextMenuPosition(
    { x: 780, y: 590 },
    { width: 800, height: 600 },
  );

  assertEqual(bottomRight.left, 572, "context menu should shift left from the viewport edge");
  assertEqual(bottomRight.top, 232, "context menu should shift up from the viewport bottom");

  const topLeft = sidebarContextMenuPosition(
    { x: -20, y: 0 },
    { width: 800, height: 600 },
  );

  assertEqual(topLeft.left, 8, "context menu should keep a left margin");
  assertEqual(topLeft.top, 8, "context menu should keep a top margin");
}

function rendersThreadListLoadingStateInsteadOfEmptyState(): void {
  const html = renderToStaticMarkup(createElement(Sidebar, {
    threads: [],
    threadsLoading: true,
    activeThreadId: null,
    connected: true,
    connecting: false,
    onConnect: () => undefined,
    onCreateThread: () => undefined,
    onOpenSearch: () => undefined,
    onSelectThread: () => undefined,
    onForkThread: () => undefined,
    onRenameThread: () => undefined,
    onArchiveThread: () => undefined,
    onOpenSettings: () => undefined,
  }));

  assertIncludes(html, "Loading chats", "empty sidebar should show the loading state while thread/list is in flight");
  assertNotIncludes(html, "No chats", "empty sidebar should not show the final empty state while loading threads");
}

function rendersConnectingStateInsteadOfEmptyThreadState(): void {
  const html = renderToStaticMarkup(createElement(Sidebar, {
    threads: [],
    threadsLoading: false,
    activeThreadId: null,
    connected: false,
    connecting: true,
    onConnect: () => undefined,
    onCreateThread: () => undefined,
    onOpenSearch: () => undefined,
    onSelectThread: () => undefined,
    onForkThread: () => undefined,
    onRenameThread: () => undefined,
    onArchiveThread: () => undefined,
    onOpenSettings: () => undefined,
  }));

  assertIncludes(html, "Loading chats", "empty sidebar should show loading while app-server is connecting");
  assertNotIncludes(html, "No chats", "empty sidebar should not show final empty state while app-server is connecting");
}

function rendersSidebarNavItemAccelerator(): void {
  const html = renderToStaticMarkup(createElement(SidebarNavItem, {
    icon: createElement("span", null, "icon"),
    label: "Search",
    accelerator: "Ctrl+K",
    onClick: () => undefined,
  }));

  assertIncludes(html, "title=\"Search (Ctrl+K)\"", "nav item should expose accelerator in title");
  assertIncludes(html, "<kbd", "nav item should render accelerator badge");
  assertIncludes(html, "Ctrl+K", "nav item should render accelerator text");
}

function rendersSidebarUpdateBadgeStates(): void {
  const available = renderToStaticMarkup(createElement(SidebarUpdateBadge, {
    formatMessage: testFormatMessage,
    updateAvailable: { version: "0.1.1" },
    onApplyUpdate: () => undefined,
  }));
  assertIncludes(available, "Update v0.1.1", "available update badge should render version");
  assertIncludes(available, "Install v0.1.1 and restart", "available update badge should render install tooltip");

  const downloading = renderToStaticMarkup(createElement(SidebarUpdateBadge, {
    formatMessage: testFormatMessage,
    updateAvailable: { version: "0.1.1", progress: 0.42 },
  }));
  assertIncludes(downloading, "Updating 42%", "downloading update badge should render progress");
  assertIncludes(downloading, "disabled=\"\"", "downloading update badge should be disabled");

  const failed = renderToStaticMarkup(createElement(SidebarUpdateBadge, {
    formatMessage: testFormatMessage,
    updateAvailable: { version: "0.1.1", error: "Network failed" },
  }));
  assertIncludes(failed, "Update failed", "failed update badge should render failure label");
  assertIncludes(failed, "Network failed", "failed update badge should expose error tooltip");
}

function rendersUsageAlertWhenQuotaIsLow(): void {
  const html = renderToStaticMarkup(createElement(Sidebar, {
    threads: [],
    activeThreadId: null,
    connected: true,
    connecting: false,
    onConnect: () => undefined,
    onCreateThread: () => undefined,
    onOpenSearch: () => undefined,
    onSelectThread: () => undefined,
    onForkThread: () => undefined,
    onRenameThread: () => undefined,
    onArchiveThread: () => undefined,
    onOpenSettings: () => undefined,
    accountView: accountViewWithUsageAlert(),
    onSignOut: () => undefined,
  }));

  assertIncludes(html, "12% usage remaining", "sidebar should render Desktop-style usage alert title");
  assertIncludes(html, "aria-label=\"Dismiss usage alert\"", "sidebar usage alert should be dismissible");
  assertIncludes(html, "aria-label=\"Usage consumed\"", "sidebar usage alert should expose progress semantics");
}

function rendersProjectSectionMenus(): void {
  const filterHtml = renderToStaticMarkup(createElement(SidebarProjectSection, {
    canUseExistingFolder: true,
    children: createElement("div", { className: "test-project-rows" }, "Project rows"),
    openSectionMenu: "filter",
    organizeMode: "project",
    sectionActionsRef: createRef<HTMLDivElement>(),
    sectionCollapseAction: "collapse-all",
    sectionLabel: "Projects",
    sortKey: "updated_at",
    onChooseOrganizeMode: () => undefined,
    onChooseSortKey: () => undefined,
    onRunSectionCollapseAction: () => undefined,
    onToggleSectionMenu: () => undefined,
    onUseExistingFolder: () => undefined,
  }));

  assertIncludes(filterHtml, "Projects", "project section should render its section label");
  assertIncludes(filterHtml, "Collapse all projects", "project section should expose collapse-all action");
  assertIncludes(filterHtml, "Organize sidebar", "project section filter menu should render organize title");
  assertIncludes(filterHtml, "By project", "project section filter menu should render project grouping option");
  assertIncludes(filterHtml, "Chronological list", "project section filter menu should render recency grouping option");
  assertIncludes(filterHtml, "Sort by", "project section filter menu should render sort title");
  assertIncludes(filterHtml, "Updated", "project section filter menu should render updated sort option");
  assertIncludes(filterHtml, "Project rows", "project section should preserve child rows");

  const addProjectHtml = renderToStaticMarkup(createElement(SidebarProjectSection, {
    canUseExistingFolder: true,
    children: null,
    openSectionMenu: "add-project",
    organizeMode: "recent",
    sectionActionsRef: createRef<HTMLDivElement>(),
    sectionCollapseAction: "reopen-previous",
    sectionLabel: "Projects",
    sortKey: "created_at",
    onChooseOrganizeMode: () => undefined,
    onChooseSortKey: () => undefined,
    onRunSectionCollapseAction: () => undefined,
    onToggleSectionMenu: () => undefined,
    onUseExistingFolder: () => undefined,
  }));

  assertIncludes(addProjectHtml, "Reopen previous projects", "project section should expose reopen-previous action");
  assertIncludes(addProjectHtml, "Add new project", "project section should render the add-project trigger");
  assertIncludes(addProjectHtml, "Use an existing folder", "project section add-project menu should render folder import action");
}

function computesProjectSectionCollapseAction(): void {
  assertEqual(
    projectSectionCollapseAction(["alpha", "beta"], new Set(), []),
    "collapse-all",
    "more than one expanded project should offer collapse-all",
  );
  assertEqual(
    projectSectionCollapseAction(["alpha", "beta"], new Set(["alpha", "beta"]), ["alpha"]),
    "reopen-previous",
    "fully collapsed projects should offer reopening the previous visible groups",
  );
  assertEqual(
    projectSectionCollapseAction(["alpha"], new Set(), []),
    null,
    "a single expanded project should not show a bulk collapse action",
  );
}

function accountViewWithUsageAlert(): AccountViewModel {
  return {
    signedIn: true,
    displayName: "ada",
    email: "ada@example.com",
    avatarInitials: "AD",
    avatarUrl: null,
    authLabel: "ChatGPT",
    planLabel: "Pro",
    quotaLabel: "Codex: 88% used",
    quotaDetail: null,
    quotaTone: "warning",
    rateLimitSummary: null,
    usageAlert: {
      dismissalKey: "core:10080:1800000000",
      remainingPercent: 12,
      resetAt: null,
      usedPercent: 88,
      windowDurationMins: 10_080,
    },
    loading: false,
    error: null,
    signOutAction: {
      type: "account/signOut",
      label: "Log out",
      disabled: false,
    },
  };
}

function testFormatMessage(descriptor: I18nMessageDescriptor, values?: I18nValues): string {
  return descriptor.defaultMessage.replace(/\{(\w+)\}/g, (_match, key: string) => String(values?.[key] ?? ""));
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertIncludes(actual: string, expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}

function assertNotIncludes(actual: string, expected: string, message: string): void {
  if (actual.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(actual)} not to include ${JSON.stringify(expected)}`);
  }
}
