import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MCP_FOLLOW_UP_LOCAL_DISABLED_REASON,
  MCP_FOLLOW_UP_WORKTREE_DISABLED_REASON,
  McpFollowUpDialog,
  normalizeMcpFollowUpOptions,
} from "../src/components/mcp-follow-up-dialog";

function assert(value: unknown, message: string): void {
  if (!value) throw new Error(message);
}

export default function runMcpFollowUpDialogTests(): void {
  rendersDesktopConfirmationPrompt();
  rendersSourceThreadServerAndTool();
  disablesSendForEmptyPrompts();
  defaultsToCurrentThreadTarget();
  selectsNewThreadAndSideChatTargets();
  disablesLocalAndWorktreeTargets();
}

function rendersDesktopConfirmationPrompt(): void {
  const html = renderToStaticMarkup(createElement(McpFollowUpDialog, {
    request: {
      prompt: "Review the latest output",
      source: { threadId: "thread-123", server: "figma", tool: "inspect" },
    },
    onClose: () => {},
    onSend: () => {},
  }));

  assert(html.includes("Send follow-up from figma?"), "follow-up dialog should render source-aware title");
  assert(
    html.includes("An MCP app wants to send this prompt."),
    "follow-up dialog should explain the app-requested prompt",
  );
  assert(html.includes("Review the latest output"), "follow-up dialog should prefill the requested prompt");
  assert(!submitButton(html)?.includes("disabled=\"\""), "follow-up dialog should allow sending a non-empty prompt");
}

function rendersSourceThreadServerAndTool(): void {
  const html = renderToStaticMarkup(createElement(McpFollowUpDialog, {
    request: {
      prompt: "Review the latest output",
      source: { threadId: "thread-123", server: "figma", tool: "inspect" },
    },
    onClose: () => {},
    onSend: () => {},
  }));

  assert(html.includes("Thread thread-123"), "follow-up dialog should show source thread");
  assert(html.includes("Server figma"), "follow-up dialog should show source server");
  assert(html.includes("Tool inspect"), "follow-up dialog should show source tool");
}

function disablesSendForEmptyPrompts(): void {
  const html = renderToStaticMarkup(createElement(McpFollowUpDialog, {
    request: {
      prompt: " ",
      source: { threadId: null, server: "mcp", tool: "tool" },
    },
    onClose: () => {},
    onSend: () => {},
  }));

  assert(submitButton(html)?.includes("disabled=\"\""), "follow-up dialog should disable send for blank prompts");
}

function defaultsToCurrentThreadTarget(): void {
  const html = renderDialog();

  assert(checkedRadioValue(html) === "current-thread", "follow-up dialog should default to the current thread target");
  assert(html.includes("Current thread"), "follow-up dialog should render the current thread option");
}

function selectsNewThreadAndSideChatTargets(): void {
  const sideChatHtml = renderDialog("new-side-chat");
  const newThreadHtml = renderDialog("new-thread");

  assert(checkedRadioValue(sideChatHtml) === "new-side-chat", "follow-up dialog should allow selecting a side chat target");
  assert(checkedRadioValue(newThreadHtml) === "new-thread", "follow-up dialog should allow selecting a new thread target");
  assert(sideChatHtml.includes("The caller receives this selection."), "side chat option should describe selection-only behavior");
  assert(newThreadHtml.includes("The caller receives this selection."), "new thread option should describe selection-only behavior");
}

function disablesLocalAndWorktreeTargets(): void {
  const html = renderDialog("worktree");
  const localInput = radioInputForValue(html, "local");
  const worktreeInput = radioInputForValue(html, "worktree");

  assert(checkedRadioValue(html) === "current-thread", "disabled worktree should fall back to the current thread target");
  assert(localInput?.includes("disabled=\"\""), "local follow-up target should be disabled");
  assert(worktreeInput?.includes("disabled=\"\""), "worktree follow-up target should be disabled");
  assert(html.includes(MCP_FOLLOW_UP_LOCAL_DISABLED_REASON), "local disabled reason should be visible");
  assert(html.includes(MCP_FOLLOW_UP_WORKTREE_DISABLED_REASON), "worktree disabled reason should mention missing host createPendingWorktree");
  assert(
    normalizeMcpFollowUpOptions([{
      id: "worktree",
      label: "Worktree",
      description: "Provided by a caller",
      disabled: false,
    }])[0]?.disabled === true,
    "normalization should force worktree mode disabled",
  );
}

function renderDialog(defaultOptionId?: "current-thread" | "new-side-chat" | "new-thread" | "local" | "worktree"): string {
  return renderToStaticMarkup(createElement(McpFollowUpDialog, {
    request: {
      defaultOptionId,
      prompt: "Review the latest output",
      source: { threadId: "thread-123", server: "figma", tool: "inspect" },
    },
    onClose: () => {},
    onSend: () => {},
  }));
}

function checkedRadioValue(html: string): string | null {
  const input = radioInputs(html).find((input) => input.includes("checked=\"\""));
  return input?.match(/value="([^"]+)"/)?.[1] ?? null;
}

function radioInputForValue(html: string, value: string): string | null {
  return radioInputs(html).find((input) => input.includes(`value="${value}"`)) ?? null;
}

function radioInputs(html: string): string[] {
  return html.match(/<input\b[^>]*type="radio"[^>]*>/g) ?? [];
}

function submitButton(html: string): string | null {
  return html.match(/<button\b[^>]*type="submit"[^>]*>/)?.[0] ?? null;
}
