import { buildApprovalResult, pendingRequestDetail } from "../src/state/approval-requests";
import type { PendingServerRequest } from "../src/state/codex-reducer";

function request(method: string, params?: unknown): PendingServerRequest {
  return {
    id: "test-request",
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

export default function runApprovalRequestTests(): void {
  const commandRequest = request("item/commandExecution/requestApproval", {
    command: ["npm", "run", "typecheck"],
    cwd: "/workspace/project",
    reason: "Check UI types",
  });
  const commandDetail = pendingRequestDetail(commandRequest);
  assertEqual(commandDetail.title, "Do you want to run this command?", "command approval title");
  assertEqual(commandDetail.reason, "Check UI types", "command approval reason");
  assertIncludes(commandDetail.body, "npm run typecheck", "command approval command text");
  assertIncludes(commandDetail.body, "cwd: /workspace/project", "command approval cwd");
  assertDeepEqual(
    buildApprovalResult(commandRequest, true),
    { decision: "accept" },
    "command approval accept result",
  );
  assertDeepEqual(
    buildApprovalResult(commandRequest, false),
    { decision: "decline" },
    "command approval decline result",
  );

  const sessionCommandRequest = request("item/commandExecution/requestApproval", {
    command: "curl https://example.com",
    networkApprovalContext: { host: "example.com", protocol: "https" },
    availableDecisions: ["accept", "acceptForSession", "decline"],
  });
  const sessionCommandDetail = pendingRequestDetail(sessionCommandRequest);
  assertEqual(
    sessionCommandDetail.title,
    "Do you want to approve network access to \"example.com\"?",
    "network command approval title",
  );
  assertEqual(sessionCommandDetail.questions[0]?.id, "approvalDecision", "command session approval question id");
  assertDeepEqual(
    sessionCommandDetail.questions[0]?.options.map((option) => option.value),
    ["accept", "acceptForSession"],
    "command session approval options",
  );
  assertIncludes(
    sessionCommandDetail.metadata.map((item) => `${item.label}: ${item.value}`).join("\n"),
    "Network host: https://example.com",
    "command network metadata",
  );
  assertDeepEqual(
    buildApprovalResult(sessionCommandRequest, true, { approvalDecision: ["acceptForSession"] }),
    { decision: "acceptForSession" },
    "command session approval accept result",
  );

  const oneShotCommandRequest = request("item/commandExecution/requestApproval", {
    command: "npm test",
    availableDecisions: ["accept", "decline"],
  });
  assertEqual(
    pendingRequestDetail(oneShotCommandRequest).questions.length,
    0,
    "command approval should not show session option when server does not offer it",
  );
  assertDeepEqual(
    buildApprovalResult(oneShotCommandRequest, true, { approvalDecision: ["acceptForSession"] }),
    { decision: "accept" },
    "unsupported command session choice should fall back to one-shot accept",
  );

  const fileChangeRequest = request("item/fileChange/requestApproval", {
    reason: "Apply generated changes",
    changes: [
      { path: "src/main.ts", kind: "update" },
      { path: "src/style.css", kind: "add" },
      { kind: "delete" },
    ],
  });
  const fileChangeDetail = pendingRequestDetail(fileChangeRequest);
  assertEqual(fileChangeDetail.title, "Do you want to make these changes?", "file change approval title");
  assertEqual(fileChangeDetail.reason, "Apply generated changes", "file change approval reason");
  assertIncludes(fileChangeDetail.body, "src/main.ts", "file change includes first path");
  assertIncludes(fileChangeDetail.body, "src/style.css", "file change includes second path");
  assertDeepEqual(
    buildApprovalResult(fileChangeRequest, true),
    { decision: "accept" },
    "file change accept result",
  );

  const sessionFileChangeRequest = request("item/fileChange/requestApproval", {
    reason: "Apply generated changes",
    grantRoot: "/workspace/project",
  });
  const sessionFileChangeDetail = pendingRequestDetail(sessionFileChangeRequest);
  assertEqual(sessionFileChangeDetail.questions[0]?.id, "approvalDecision", "file change session approval question id");
  assertIncludes(
    sessionFileChangeDetail.metadata.map((item) => `${item.label}: ${item.value}`).join("\n"),
    "Grant root: /workspace/project",
    "file change grant root metadata",
  );
  assertDeepEqual(
    buildApprovalResult(sessionFileChangeRequest, true, { approvalDecision: ["acceptForSession"] }),
    { decision: "acceptForSession" },
    "file change session approval accept result",
  );
  assertDeepEqual(
    buildApprovalResult(
      request("applyPatchApproval", { grantRoot: "/workspace/project" }),
      true,
      { approvalDecision: ["acceptForSession"] },
    ),
    { decision: "approved_for_session" },
    "legacy file change session approval result",
  );

  const inputRequest = request("item/tool/requestUserInput", {
    questions: [
      { prompt: "Pick a profile" },
      { label: "Fallback label" },
      { metadata: { fallback: true } },
    ],
  });
  const inputDetail = pendingRequestDetail(inputRequest);
  assertEqual(inputDetail.title, "Codex needs input", "user input title");
  assertEqual(inputDetail.acceptLabel, "Submit", "user input accept label");
  assertEqual(inputDetail.canAccept, true, "user input can accept");
  assertEqual(inputDetail.questions.length, 3, "user input question count");
  assertEqual(inputDetail.questions[0]?.id, "question_1", "user input fallback id");
  assertEqual(inputDetail.questions[0]?.kind, "textarea", "user input freeform kind");
  assertIncludes(inputDetail.body, "1. Pick a profile", "user input uses prompt fallback");
  assertIncludes(inputDetail.body, "2. Fallback label", "user input uses label fallback");
  assertIncludes(inputDetail.body, "\"fallback\": true", "user input formats unknown question fallback");
  assertDeepEqual(
    buildApprovalResult(inputRequest, true),
    { answers: {} },
    "user input accept result",
  );
  assertDeepEqual(
    buildApprovalResult(
      request("item/tool/requestUserInput", {
        questions: [
          {
            id: "profile",
            header: "Profile",
            question: "Pick a profile",
            options: [{ label: "Local", description: "Use local gateway" }],
          },
          { id: "note", header: "Note", question: "Add a note" },
        ],
      }),
      true,
      { profile: ["Local"], note: ["  Ship it  "] },
    ),
    { answers: { profile: { answers: ["Local"] }, note: { answers: ["Ship it"] } } },
    "user input answer payload",
  );
  assertEqual(buildApprovalResult(inputRequest, false), null, "user input decline result");

  const mcpFormRequest = request("mcpServer/elicitation/request", {
    threadId: "thread-1",
    turnId: null,
    serverName: "filesystem",
    mode: "form",
    message: "Need destination details",
    requestedSchema: {
      type: "object",
      properties: {
        path: { type: "string", title: "Path", description: "Destination path" },
        mode: { type: "string", title: "Mode", enum: ["read", "write"], enumNames: ["Read", "Write"], default: "read" },
        count: { type: "number", title: "Count", default: 2 },
        enabled: { type: "boolean", title: "Enabled", default: true },
        tags: { type: "array", title: "Tags", items: { type: "string", enum: ["alpha", "beta"] }, default: ["alpha"] },
      },
      required: ["path", "mode"],
    },
  });
  const mcpFormDetail = pendingRequestDetail(mcpFormRequest);
  assertEqual(mcpFormDetail.title, "MCP request", "mcp form title");
  assertEqual(mcpFormDetail.acceptLabel, "Submit", "mcp form accept label");
  assertEqual(mcpFormDetail.questions.length, 5, "mcp form question count");
  assertEqual(mcpFormDetail.questions[1]?.kind, "singleSelect", "mcp enum question kind");
  assertEqual(mcpFormDetail.questions[4]?.kind, "multiSelect", "mcp multi-select question kind");
  assertDeepEqual(
    buildApprovalResult(mcpFormRequest, true, {
      path: ["/tmp/result.json"],
      mode: ["write"],
      count: ["3"],
      enabled: ["false"],
      tags: ["alpha", "beta"],
    }),
    {
      action: "accept",
      content: {
        path: "/tmp/result.json",
        mode: "write",
        count: 3,
        enabled: false,
        tags: ["alpha", "beta"],
      },
      _meta: null,
    },
    "mcp form accept result",
  );
  assertDeepEqual(
    buildApprovalResult(mcpFormRequest, false),
    { action: "decline", content: null, _meta: null },
    "mcp form decline result",
  );

  const mcpUrlRequest = request("mcpServer/elicitation/request", {
    threadId: "thread-1",
    turnId: "turn-1",
    serverName: "connector",
    mode: "url",
    message: "Open connector",
    url: "https://example.com/connect",
    elicitationId: "elicitation-1",
  });
  const mcpUrlDetail = pendingRequestDetail(mcpUrlRequest);
  assertEqual(mcpUrlDetail.acceptLabel, "Allow", "mcp url accept label");
  assertEqual(mcpUrlDetail.questions.length, 0, "mcp url has no form questions");
  assertIncludes(
    mcpUrlDetail.metadata.map((item) => `${item.label}: ${item.value}`).join("\n"),
    "URL: https://example.com/connect",
    "mcp url metadata",
  );
  assertDeepEqual(
    buildApprovalResult(mcpUrlRequest, true),
    { action: "accept", content: null, _meta: null },
    "mcp url accept result",
  );

  const permissionsRequest = request("item/permissions/requestApproval", {
    reason: "Need temporary access",
    cwd: "/workspace/project",
    permissions: {
      network: { enabled: true },
      fileSystem: { read: null, write: ["/workspace/project"] },
    },
  });
  const permissionsDetail = pendingRequestDetail(permissionsRequest);
  assertEqual(permissionsDetail.title, "Allow additional access?", "permissions title");
  assertEqual(permissionsDetail.reason, "Need temporary access", "permissions reason");
  assertIncludes(
    permissionsDetail.metadata.map((item) => `${item.label}: ${item.value}`).join("\n"),
    "cwd: /workspace/project",
    "permissions cwd metadata",
  );
  assertIncludes(permissionsDetail.body, "Network: enabled", "permissions body includes network permission");
  assertIncludes(permissionsDetail.body, "Write: /workspace/project", "permissions body includes file permission");
  assertEqual(permissionsDetail.questions[0]?.id, "scope", "permissions scope question");
  assertDeepEqual(
    buildApprovalResult(permissionsRequest, true, { scope: ["session"] }),
    {
      permissions: {
        network: { enabled: true },
        fileSystem: { read: null, write: ["/workspace/project"] },
      },
      scope: "session",
      strictAutoReview: false,
    },
    "permissions accept result",
  );
  assertEqual(buildApprovalResult(permissionsRequest, false), null, "permissions decline result");

  const fileOnlyPermission = pendingRequestDetail(request("item/permissions/requestApproval", {
    permissions: { network: null, fileSystem: { read: ["/workspace/project"], write: null } },
  }));
  assertEqual(fileOnlyPermission.title, "Allow read access to /workspace/project?", "file-only permission title");

  const emptyPermission = pendingRequestDetail(request("item/permissions/requestApproval", {
    permissions: { network: null, fileSystem: null },
  }));
  assertEqual(emptyPermission.canAccept, false, "empty permission cannot accept");

  const toolCallRequest = request("item/tool/call", {
    threadId: "thread-1",
    turnId: "turn-1",
    callId: "call-1",
    namespace: "local",
    tool: "unknownTool",
    arguments: { path: "/tmp/file" },
  });
  const toolCallDetail = pendingRequestDetail(toolCallRequest);
  assertEqual(toolCallDetail.canAccept, false, "dynamic tool call cannot accept");
  assertEqual(buildApprovalResult(toolCallRequest, true), null, "dynamic tool call accept result is null");

  const tokenRefreshRequest = request("account/chatgptAuthTokens/refresh", { accountId: "acct-1" });
  const tokenRefreshDetail = pendingRequestDetail(tokenRefreshRequest);
  assertEqual(tokenRefreshDetail.canAccept, false, "chatgpt token refresh cannot accept");
  assertEqual(buildApprovalResult(tokenRefreshRequest, true), null, "chatgpt token refresh accept result is null");

  const unknownRequest = request("unknown/request", { raw: true });
  const unknownDetail = pendingRequestDetail(unknownRequest);
  assertEqual(unknownDetail.title, "Unsupported request: unknown/request", "unknown request title");
  assertEqual(unknownDetail.canAccept, false, "unknown request cannot accept");
  assertIncludes(unknownDetail.body, "\"raw\": true", "unknown request body shows params");
  assertEqual(buildApprovalResult(unknownRequest, true), null, "unknown accept result is null");
  assertEqual(buildApprovalResult(unknownRequest, false), null, "unknown decline result is null");
}
