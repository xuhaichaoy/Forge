import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConversationChrome } from "../src/components/conversation-chrome";

export default function runConversationChromeTests(): void {
  keepsPreConversationHeaderSingleRow();
  keepsChromeFreeOfStatusAndKebabAffordances();
  rendersDesktopSidebarTriggerLabels();
}

function keepsPreConversationHeaderSingleRow(): void {
  const html = renderToStaticMarkup(createElement(ConversationChrome, {
    title: "New chat",
  }));

  assertIncludes(html, "hc-topbar", "pre-conversation chrome should render the compact topbar");
  assertIncludes(html, "New chat", "pre-conversation chrome should use Desktop's new-chat title");
  assertDeepEqual(html.includes("hc-workspace-bar"), false, "pre-conversation chrome should not render a second cwd input row");
  assertDeepEqual(html.includes("<input"), false, "pre-conversation chrome should not expose raw cwd editing");
}

function keepsChromeFreeOfStatusAndKebabAffordances(): void {
  const html = renderToStaticMarkup(createElement(ConversationChrome, {
    title: "A very long thread title that should be truncated by CSS instead of a JavaScript character limit",
  }));

  assertDeepEqual(html.includes("hc-status-pill"), false, "sidecar status should not render as a chrome pill");
  assertDeepEqual(html.includes("Thread actions"), false, "thread kebab actions should not render in chrome");
  assertDeepEqual(html.includes("..."), false, "topbar title should not be hard-truncated in JavaScript");
}

function rendersDesktopSidebarTriggerLabels(): void {
  const openHtml = renderToStaticMarkup(createElement(ConversationChrome, {
    title: "New chat",
    sidebarOpen: true,
    onToggleSidebar: () => undefined,
  }));
  const closedHtml = renderToStaticMarkup(createElement(ConversationChrome, {
    title: "New chat",
    sidebarOpen: false,
    onToggleSidebar: () => undefined,
  }));

  assertIncludes(openHtml, "hc-sidebar-trigger", "sidebar trigger should render as a compact header action");
  assertIncludes(openHtml, "Hide sidebar", "open sidebar trigger should use Desktop's hide label");
  assertIncludes(closedHtml, "Show sidebar", "closed sidebar trigger should use Desktop's show label");
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}

function assertIncludes(actual: string, expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}
