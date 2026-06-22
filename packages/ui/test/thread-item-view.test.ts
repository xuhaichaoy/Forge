import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createI18nBundle, formatI18nMessage } from "../src/state/i18n";
import {
  planSummaryCompleted,
  planSummaryContent,
} from "../src/components/plan-summary-card";

const enFormat = (
  descriptor: Parameters<typeof formatI18nMessage>[1],
  values?: Parameters<typeof formatI18nMessage>[2],
) => formatI18nMessage(createI18nBundle("en-US"), descriptor, values);
import { ThreadItemView } from "../src/components/thread-item-view";
import {
  autoReviewBody,
  autoReviewTitle,
  dynamicToolCallLabel,
  execThreadItemSummaryLabel,
  todoListSummaryLabel,
} from "../src/components/thread-item-view";

export default function runThreadItemViewTests(): void {
  formatsDesktopExecThreadItemSummaries();
  formatsDesktopAutoReviewTitles();
  formatsDesktopAutoReviewBodies();
  formatsDesktopDynamicToolCallLabels();
  rendersDynamicAppControlToolCallWithDesktopIcon();
  rendersInlineTodoListPlanCard();
  rendersProposedPlanSummaryCard();
  rendersPendingMcpElicitationLikeDesktop();
}

function formatsDesktopExecThreadItemSummaries(): void {
  const completed = {
    kind: "exec",
    id: "exec-1",
    running: false,
    command: "npm run test",
    cwd: "/workspace",
    output: "ok",
    status: "completed",
    footer: "Success",
  } as const;
  assertEqual(
    execThreadItemSummaryLabel(completed, false),
    "Ran npm run test",
    "collapsed standalone exec summary should match Desktop's specific command row",
  );
  assertEqual(
    execThreadItemSummaryLabel(completed, true),
    "Ran command",
    "expanded standalone exec summary should match Desktop's generic command row",
  );
  assertEqual(
    execThreadItemSummaryLabel({ ...completed, running: true, footer: "" }, true),
    "Running command",
    "running standalone exec summary should match Desktop's running row",
  );
  assertEqual(
    execThreadItemSummaryLabel({ ...completed, footer: "Stopped" }, false),
    "Stopped npm run test",
    "interrupted standalone exec summary should match Desktop's stopped command row",
  );
}

function formatsDesktopAutoReviewTitles(): void {
  assertEqual(
    autoReviewTitle({ status: "approved" }, enFormat),
    "Auto-review approved",
    "approved auto-review title should match Desktop wording",
  );
  assertEqual(
    autoReviewTitle({ status: "denied", riskLevel: "high" }, enFormat),
    "Auto-review denied high risk",
    "high-risk denied auto-review title should match Desktop wording",
  );
  assertEqual(
    autoReviewTitle({ status: "inProgress" }, enFormat),
    "Auto-reviewing",
    "running auto-review title should match Desktop wording",
  );
}

function formatsDesktopAutoReviewBodies(): void {
  assertEqual(
    autoReviewBody({ status: "approved", rationale: "Command matches policy" }, enFormat),
    "Command matches policy",
    "explicit rationale should win for auto-review body copy",
  );
  assertEqual(
    autoReviewBody({ status: "timedOut" }, enFormat),
    "A carefully prompted reviewer agent timed out before Codex ran this request.",
    "timeout auto-review body should match Desktop wording",
  );
  assertEqual(
    autoReviewBody({ status: "inProgress" }, enFormat),
    "A carefully prompted reviewer agent is reviewing this request before Codex runs it.",
    "running auto-review body should match Desktop wording",
  );
}

function formatsDesktopDynamicToolCallLabels(): void {
  assertEqual(
    dynamicToolCallLabel({ type: "dynamicToolCall", tool: "load_workspace_dependencies", status: "running", id: "dynamic-1" } as never),
    "Loading workspace dependencies",
    "known running dynamic tool labels should match Desktop wording",
  );
  assertEqual(
    dynamicToolCallLabel({ type: "dynamic-tool-call", tool: "load_workspace_dependencies", completed: false, id: "dynamic-hyphen-1" } as never),
    "Loading workspace dependencies",
    "hyphenated dynamic tool calls should use Desktop's completed=false active state",
  );
  assertEqual(
    dynamicToolCallLabel({ type: "dynamicToolCall", tool: "read_thread_terminal", status: "completed", id: "dynamic-2" } as never),
    "Read thread terminal",
    "known completed dynamic tool labels should match Desktop wording",
  );
  assertEqual(
    dynamicToolCallLabel({ type: "dynamicToolCall", tool: "custom_tool", status: "completed", id: "dynamic-3" } as never),
    "Custom Tool",
    "unknown dynamic tools should fall back to humanized Desktop labels",
  );
  assertEqual(
    dynamicToolCallLabel({
      type: "dynamicToolCall",
      tool: "manage_codex_threads",
      status: "running",
      id: "dynamic-4",
      arguments: { type: "threads.create_in_worktree" },
    } as never),
    "Creating worktree thread",
    "running manage_codex_threads labels should match Desktop app-control wording",
  );
  assertEqual(
    dynamicToolCallLabel({
      type: "dynamicToolCall",
      tool: "manage_codex_threads",
      status: "completed",
      id: "dynamic-5",
      arguments: { type: "threads.send_message" },
    } as never),
    "Sent message to thread",
    "completed manage_codex_threads labels should match Desktop app-control wording",
  );
}

function rendersDynamicAppControlToolCallWithDesktopIcon(): void {
  const html = renderToStaticMarkup(createElement(ThreadItemView, {
    unit: {
      kind: "threadItem",
      key: "item:dynamic-tool-call:dynamic-app-control-1",
      item: {
        type: "dynamicToolCall",
        id: "dynamic-app-control-1",
        tool: "manage_codex_threads",
        status: "running",
        arguments: { type: "threads.create" },
      },
    } as never,
  }));
  assertStringIncludes(html, "Creating new thread", "app-control dynamic tool should keep Desktop wording");
  assertStringIncludes(html, "lucide-git-fork", "app-control dynamic tool should render a Desktop-style leading icon");

  const genericHtml = renderToStaticMarkup(createElement(ThreadItemView, {
    unit: {
      kind: "threadItem",
      key: "item:dynamic-tool-call:dynamic-generic-1",
      item: {
        type: "dynamicToolCall",
        id: "dynamic-generic-1",
        tool: "custom_tool",
        status: "running",
      },
    } as never,
  }));
  assertEqual(
    genericHtml.includes("lucide-git-fork"),
    false,
    "generic dynamic tool calls should stay text-only like Desktop fallback rows",
  );
}

function rendersInlineTodoListPlanCard(): void {
  const item = {
    type: "todo-list",
    id: "todo-1",
    plan: [
      { step: "Inspect Desktop plan card", status: "completed" },
      { step: "Patch Forge inline card", status: "in_progress" },
    ],
  };
  assertEqual(
    todoListSummaryLabel(item as never),
    "1 out of 2 tasks completed",
    "todo-list summary should match Desktop plan copy",
  );
  assertEqual(
    todoListSummaryLabel({
      type: "todo-list",
      id: "todo-0",
      plan: [
        { step: "Inspect", status: "pending" },
        { step: "Patch", status: "pending" },
      ],
    } as never),
    "0 out of 2 tasks completed",
    "inline todo-list summary should not use the separate Desktop activity-created copy",
  );
  assertEqual(
    todoListSummaryLabel({
      type: "todo-list",
      id: "todo-single",
      plan: [{ step: "Inspect", status: "pending" }],
    } as never),
    "0 out of 1 task completed",
    "inline todo-list summary should keep Desktop singular task wording",
  );
  const html = renderToStaticMarkup(createElement(ThreadItemView, {
    unit: {
      kind: "threadItem",
      key: "item:todo-list:todo-1",
      item,
    } as never,
  }));
  assertStringIncludes(html, "data-item-type=\"todo-list\"", "todo-list should render as an inline thread item");
  assertStringIncludes(html, "1 out of 2 tasks completed", "todo-list card should render the summary");
  assertStringIncludes(html, "data-status=\"completed\"", "completed plan steps should expose completed styling");
}

function rendersProposedPlanSummaryCard(): void {
  const completeItem = {
    type: "proposed-plan",
    id: "plan-1",
    content: "## Plan\n\n- Inspect\n- Patch\n- Verify",
    completed: true,
  };
  assertEqual(
    planSummaryContent(completeItem as never),
    "## Plan\n\n- Inspect\n- Patch\n- Verify",
    "proposed-plan content should come from the Desktop content field",
  );
  assertEqual(planSummaryCompleted(completeItem as never), true, "completed proposed plan should use completed=true");
  const completeHtml = renderToStaticMarkup(createElement(ThreadItemView, {
    threadId: "thread-plan",
    unit: {
      kind: "threadItem",
      key: "item:proposed-plan:plan-1",
      item: completeItem,
      hasArtifacts: true,
      turnId: "turn-plan-1",
    } as never,
  }));
  assertStringIncludes(completeHtml, "data-item-type=\"proposed-plan\"", "proposed-plan should render a dedicated card");
  assertStringIncludes(completeHtml, "<h3 class=\"hc-plan-summary-title\">Plan</h3>", "completed proposed plan title");
  assertStringIncludes(completeHtml, "Download plan", "completed proposed plan should expose PLAN.md download");
  assertStringIncludes(completeHtml, "aria-label=\"Copy\"", "completed proposed plan should expose the shared copy-button (copyButton.copyAriaLabel \"Copy\")");
  assertStringNotIncludes(completeHtml, "Good response", "completed plan card should not expose turn rating thumbs");
  assertStringNotIncludes(completeHtml, "Bad response", "completed plan card should not expose turn rating thumbs");
  assertStringNotIncludes(completeHtml, "<span>Open</span>", "the no-op Open button is removed from the plan card");
  assertStringIncludes(completeHtml, "<h2", "proposed-plan markdown should render as markdown");

  const missingThreadHtml = renderToStaticMarkup(createElement(ThreadItemView, {
    unit: {
      kind: "threadItem",
      key: "item:proposed-plan:plan-1",
      item: completeItem,
      hasArtifacts: true,
      turnId: "turn-plan-1",
    } as never,
  }));
  assertStringNotIncludes(missingThreadHtml, "Good response", "completed proposed plan should not expose turn rating thumbs");

  const writingItem = {
    type: "proposed-plan",
    id: "plan-2",
    content: "- Keep working",
    completed: false,
  };
  const writingHtml = renderToStaticMarkup(createElement(ThreadItemView, {
    unit: {
      kind: "threadItem",
      key: "item:proposed-plan:plan-2",
      item: writingItem,
    } as never,
  }));
  assertStringIncludes(writingHtml, "Writing plan", "incomplete proposed plan title");
  assertStringNotIncludes(writingHtml, "Good response", "incomplete proposed plan should not expose turn rating thumbs");
  assertStringIncludes(writingHtml, "hc-plan-summary-body is-collapsed", "incomplete proposed plan should start collapsed");
  assertStringIncludes(writingHtml, "Expand plan", "collapsed proposed plan should expose an expand affordance");
}

function rendersPendingMcpElicitationLikeDesktop(): void {
  const html = renderToStaticMarkup(createElement(ThreadItemView, {
    unit: {
      kind: "threadItem",
      key: "item:mcp-server-elicitation:elicitation-1",
      item: {
        type: "mcp-server-elicitation",
        requestId: "elicitation-1",
        completed: false,
      },
    } as never,
  }));
  assertStringIncludes(html, "data-item-type=\"mcp-server-elicitation\"", "pending MCP elicitation should render a transcript row");
  assertStringIncludes(html, "data-item-ids=\"elicitation-1\"", "pending MCP elicitation should expose requestId as its item id");
  assertStringIncludes(html, "hc-thinking-shimmer-text", "pending MCP elicitation should use the Desktop shimmer text affordance");
  assertStringIncludes(html, "Awaiting approval", "pending MCP elicitation should use Desktop awaiting approval copy");
  assertStringNotIncludes(html, "hc-inline-plan-spinner", "pending MCP elicitation should not render a standalone spinner");
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertStringIncludes(actual: string, expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: missing ${expected}`);
  }
}

function assertStringNotIncludes(actual: string, expected: string, message: string): void {
  if (actual.includes(expected)) {
    throw new Error(`${message}: found ${expected}`);
  }
}
