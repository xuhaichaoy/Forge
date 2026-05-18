import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  commandPreviewText,
  looksLikeCommandOrPath,
  PendingRequestStack,
  pendingRequestOptionShortcut,
  pendingRequestShouldSubmitOnEnter,
} from "../src/components/pending-request-stack";
import type { PendingServerRequest } from "../src/state/codex-reducer";

export default function runPendingRequestStackTests(): void {
  detectsCommandsAndPaths();
  keepsPlainLanguageDetailsAsText();
  preservesCommandPreviewText();
  detectsSafeEnterSubmitScope();
  selectsRadioOptionsWithNumberKeysWithoutSubmitting();
  rendersMcpAndToolRequestsAsGenericComposerCards();
  rendersUserInputDismissAsStopAction();
}

function detectsCommandsAndPaths(): void {
  assertEqual(looksLikeCommandOrPath("npm run typecheck"), true, "npm command should be treated as technical");
  assertEqual(looksLikeCommandOrPath("/workspace/project"), true, "absolute path should be treated as technical");
  assertEqual(looksLikeCommandOrPath("./scripts/build.mjs"), true, "relative path should be treated as technical");
  assertEqual(looksLikeCommandOrPath("https://example.com"), true, "URL should be treated as technical");
  assertEqual(looksLikeCommandOrPath("src/app.ts"), true, "source file path should be treated as technical");
}

function keepsPlainLanguageDetailsAsText(): void {
  assertEqual(looksLikeCommandOrPath("No additional permissions"), false, "ordinary prose should not be code styled");
  assertEqual(looksLikeCommandOrPath("Apply generated changes"), false, "approval reason prose should not be code styled");
}

function preservesCommandPreviewText(): void {
  const heredoc = "/bin/zsh -lc 'cat > ~/Downloads/hicodex_demo.html <<\\'HTML\\'\n<div>preview</div>\nHTML'";
  assertEqual(commandPreviewText({ command: heredoc }), heredoc, "multiline command preview should stay as one preview block");
  assertEqual(commandPreviewText({ command: ["npm", "run", "typecheck"] }), "npm run typecheck", "argv commands should join for preview");
}

function detectsSafeEnterSubmitScope(): void {
  assertEqual(
    pendingRequestShouldSubmitOnEnter({
      canSubmit: true,
      isEditableTarget: false,
      key: "Enter",
      responding: false,
      shiftKey: false,
    }),
    true,
    "focused pending request card should submit on plain Enter",
  );
  assertEqual(
    pendingRequestShouldSubmitOnEnter({
      canSubmit: true,
      isEditableTarget: true,
      key: "Enter",
      responding: false,
      shiftKey: false,
    }),
    false,
    "Enter inside a freeform answer field should not bubble into approval",
  );
  assertEqual(
    pendingRequestShouldSubmitOnEnter({
      canSubmit: true,
      isEditableTarget: false,
      key: "Enter",
      responding: true,
      shiftKey: false,
    }),
    false,
    "a responding pending request should ignore repeated Enter presses",
  );
}

function selectsRadioOptionsWithNumberKeysWithoutSubmitting(): void {
  const questions = [{
    id: "decision",
    header: "Decision",
    question: "Allow command?",
    required: true,
    isSecret: false,
    kind: "singleSelect" as const,
    defaultAnswers: [],
    options: [
      { label: "Allow", value: "allow", description: "" },
      { label: "Deny", value: "deny", description: "" },
    ],
  }];

  assertDeepEqual(
    pendingRequestOptionShortcut({
      key: "1",
      questions,
      responding: false,
      isEditableTarget: false,
    }),
    { questionId: "decision", value: "allow" },
    "number keys should only select the matching option",
  );
  assertEqual(
    pendingRequestOptionShortcut({
      key: "1",
      questions,
      responding: true,
      isEditableTarget: false,
    }),
    null,
    "number keys should be ignored while a response is already pending",
  );
  assertEqual(
    pendingRequestShouldSubmitOnEnter({
      canSubmit: true,
      isEditableTarget: false,
      key: "1",
      responding: false,
      shiftKey: false,
    }),
    false,
    "number keys should not submit pending approvals",
  );
}

function rendersMcpAndToolRequestsAsGenericComposerCards(): void {
  const html = renderToStaticMarkup(createElement(PendingRequestStack, {
    pendingRequests: [
      request("mcp", "mcpServer/elicitation/request", {
        threadId: "thread-1",
        turnId: "turn-1",
        serverName: "filesystem",
        mode: "url",
        message: "Open connector",
        url: "https://example.com/connect",
        elicitationId: "elicitation-1",
      }),
      request("tool-call", "item/tool/call", {
        threadId: "thread-1",
        turnId: "turn-1",
        callId: "call-1",
        namespace: "figma",
        tool: "inspect",
        arguments: { nodeId: "12:34" },
      }),
    ],
    onRespond: () => undefined,
  }));

  assertIncludes(html, 'class="hc-pending-stack"', "pending requests should render in the above-composer stack");
  assertIncludes(html, 'data-request-kind="mcp"', "MCP request should use the generic pending request card");
  assertIncludes(html, 'data-request-kind="tool-call"', "dynamic tool request should use its own generic card kind");
  assertIncludes(html, "Action required", "URL action MCP card should be visibly labelled");
  assertIncludes(html, "Open link", "URL action MCP card should expose the first-step browser action");
  assertIncludes(html, "MCP server", "MCP card should show MCP metadata");
  assertIncludes(html, "App tool request", "dynamic tool card should be visibly labelled");
  assertIncludes(html, "Unsupported dynamic tool call", "dynamic tool card should explain unsupported execution");
  assertIncludes(html, "does not run it as regular tool activity", "dynamic tool card should not read like transcript activity");
  assertIncludes(html, "Kind", "cards should render label/value metadata rows");
  assertIncludes(html, "Tool", "dynamic tool card should render tool metadata");
  assertIncludes(html, "inspect", "dynamic tool card should render the requested tool name");
  assertEqual(html.includes("McpApprovalCard"), false, "MCP request should not require a bespoke card component");
  assertEqual(html.includes("tool-activity"), false, "pending requests should not render with tool-activity classes");
}

function rendersUserInputDismissAsStopAction(): void {
  const html = renderToStaticMarkup(createElement(PendingRequestStack, {
    pendingRequests: [
      request("input", "item/tool/requestUserInput", {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "call-1",
        questions: [{ id: "note", header: "Note", question: "Add context", options: null }],
      }),
    ],
    onRespond: () => undefined,
  }));

  assertIncludes(html, 'data-request-kind="user-input"', "request_user_input should render as user-input");
  assertIncludes(html, "Stops the running turn instead of submitting an empty answer.", "Stop action should explain interrupt semantics");
  assertIncludes(html, "<span>Stop</span>", "request_user_input secondary action should be Stop");
}

function request(id: string, method: string, params?: unknown): PendingServerRequest {
  return {
    id,
    method,
    params,
    createdAt: 0,
  };
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
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
