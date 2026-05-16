import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { commandPreviewText, looksLikeCommandOrPath, PendingRequestStack } from "../src/components/pending-request-stack";
import type { PendingServerRequest } from "../src/state/codex-reducer";

export default function runPendingRequestStackTests(): void {
  detectsCommandsAndPaths();
  keepsPlainLanguageDetailsAsText();
  preservesCommandPreviewText();
  rendersMcpAndToolRequestsAsGenericComposerCards();
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
  assertIncludes(html, "MCP request", "MCP card should be visibly labelled");
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

function assertIncludes(actual: string, expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}
