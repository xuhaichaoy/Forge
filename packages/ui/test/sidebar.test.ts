import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { sidebarContextMenuPosition } from "../src/components/sidebar";
import { Sidebar } from "../src/components/sidebar";
import type { AccountViewModel } from "../src/state/account-state";

export default function runSidebarComponentTests(): void {
  clampsThreadContextMenuIntoViewport();
  rendersUsageAlertWhenQuotaIsLow();
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
