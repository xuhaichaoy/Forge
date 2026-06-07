import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BackgroundSubagentsStack } from "../src/components/background-subagents-stack";
import type { RailEntry } from "../src/state/render-groups";

export default function runBackgroundSubagentsStackTests(): void {
  rendersNothingWithoutRows();
  rendersDesktopCollapsedSummary();
  rendersExpandedRows();
  rendersStopAllControlForActiveDescendants();
}

function rendersNothingWithoutRows(): void {
  const html = renderToStaticMarkup(createElement(BackgroundSubagentsStack, {
    entries: [],
  }));

  assertEqual(html, "", "background subagents panel should be absent without rows");
}

function rendersDesktopCollapsedSummary(): void {
  const html = renderToStaticMarkup(createElement(BackgroundSubagentsStack, {
    entries: backgroundAgentEntries(),
  }));

  assert(html.includes("2 background agents"), "collapsed panel should summarize the agent count");
  assert(html.includes("+12"), "collapsed panel should aggregate added lines");
  assert(html.includes("-3"), "collapsed panel should aggregate removed lines");
  assert(!html.includes("Kepler"), "collapsed panel should hide agent rows");
}

function rendersExpandedRows(): void {
  const html = renderToStaticMarkup(createElement(BackgroundSubagentsStack, {
    defaultExpanded: true,
    entries: backgroundAgentEntries(),
    onOpenThread: () => undefined,
  }));

  assert(html.includes("2 background agents (@ to tag agents)"), "expanded panel should render Desktop's tag-agent hint");
  assert(html.includes("Kepler"), "expanded panel should render the first agent");
  assert(html.includes("is working"), "active agents should use Desktop's active label");
  assert(html.includes("Banach"), "expanded panel should render the second agent");
  assert(html.includes("is done"), "completed agents should use Desktop's done label");
  assert(html.includes("Uses gpt-5.4"), "agent metadata should be available on the row");
}

function rendersStopAllControlForActiveDescendants(): void {
  const html = renderToStaticMarkup(createElement(BackgroundSubagentsStack, {
    canStopAll: true,
    entries: backgroundAgentEntries(),
    onStopAll: () => undefined,
  }));

  assert(html.includes("aria-label=\"Stop all subagents in this chat\""), "active descendants should expose Desktop's stop-all control");
  assert(html.includes("Stop all"), "stop-all control should use Desktop's label");
}

function backgroundAgentEntries(): RailEntry[] {
  return [
    {
      id: "background-agent:agent-1",
      title: "Kepler (explorer)",
      status: "active",
      meta: "Uses gpt-5.4",
      diffStats: { linesAdded: 10, linesRemoved: 2 },
      action: {
        kind: "thread",
        threadId: "agent-1",
        displayName: "Kepler",
        model: "gpt-5.4",
        role: "explorer",
      },
    },
    {
      id: "background-agent:agent-2",
      title: "Banach (worker)",
      status: "completed",
      meta: "Uses gpt-5.3-codex",
      diffStats: { linesAdded: 2, linesRemoved: 1 },
      action: {
        kind: "thread",
        threadId: "agent-2",
        displayName: "Banach",
        model: "gpt-5.3-codex",
        role: "worker",
      },
    },
  ];
}

function assert(value: unknown, message: string): void {
  if (!value) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
