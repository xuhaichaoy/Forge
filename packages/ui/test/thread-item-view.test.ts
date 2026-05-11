import {
  autoReviewBody,
  autoReviewTitle,
  dynamicToolCallLabel,
} from "../src/components/thread-item-view";

export default function runThreadItemViewTests(): void {
  formatsDesktopAutoReviewTitles();
  formatsDesktopAutoReviewBodies();
  formatsDesktopDynamicToolCallLabels();
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
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
