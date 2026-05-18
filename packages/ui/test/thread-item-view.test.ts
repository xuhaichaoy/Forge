import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  planSummaryCompleted,
  planSummaryContent,
} from "../src/components/plan-summary-card";
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
  rendersInlineTodoListPlanCard();
  rendersProposedPlanSummaryCard();
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
    autoReviewTitle({ status: "approved" }),
    "Auto-review approved",
    "approved auto-review title should match Desktop wording",
  );
  assertEqual(
    autoReviewTitle({ status: "denied", riskLevel: "high" }),
    "Auto-review denied high risk",
    "high-risk denied auto-review title should match Desktop wording",
  );
  assertEqual(
    autoReviewTitle({ status: "inProgress" }),
    "Auto-reviewing",
    "running auto-review title should match Desktop wording",
  );
}

function formatsDesktopAutoReviewBodies(): void {
  assertEqual(
    autoReviewBody({ status: "approved", rationale: "Command matches policy" }),
    "Command matches policy",
    "explicit rationale should win for auto-review body copy",
  );
  assertEqual(
    autoReviewBody({ status: "timedOut" }),
    "A carefully prompted reviewer agent timed out before Codex ran this request.",
    "timeout auto-review body should match Desktop wording",
  );
  assertEqual(
    autoReviewBody({ status: "inProgress" }),
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

function rendersInlineTodoListPlanCard(): void {
  const item = {
    type: "todo-list",
    id: "todo-1",
    plan: [
      { step: "Inspect Desktop plan card", status: "completed" },
      { step: "Patch HiCodex inline card", status: "in_progress" },
    ],
  };
  assertEqual(
    todoListSummaryLabel(item as never),
    "1 out of 2 tasks completed",
    "todo-list summary should match Desktop plan copy",
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
    unit: {
      kind: "threadItem",
      key: "item:proposed-plan:plan-1",
      item: completeItem,
    } as never,
  }));
  assertStringIncludes(completeHtml, "data-item-type=\"proposed-plan\"", "proposed-plan should render a dedicated card");
  assertStringIncludes(completeHtml, "<h3 class=\"hc-plan-summary-title\">Plan</h3>", "completed proposed plan title");
  assertStringIncludes(completeHtml, "Download plan", "completed proposed plan should expose PLAN.md download");
  assertStringIncludes(completeHtml, "Copy plan", "completed proposed plan should expose copy");
  assertStringIncludes(completeHtml, "<h2", "proposed-plan markdown should render as markdown");

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
  assertStringIncludes(writingHtml, "hc-plan-summary-body is-collapsed", "incomplete proposed plan should start collapsed");
  assertStringIncludes(writingHtml, "Expand plan", "collapsed proposed plan should expose an expand affordance");
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
