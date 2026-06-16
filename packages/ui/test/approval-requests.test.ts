import {
  PLAN_IMPLEMENTATION_ACCEPT_VALUE,
  PLAN_IMPLEMENTATION_QUESTION_ID,
  PLAN_IMPLEMENTATION_REQUEST_METHOD,
  SETUP_CODEX_STEP_ROLE_QUESTION_ID,
  SETUP_CODEX_STEP_TASK_ACTION_QUESTION_ID,
  SETUP_CODEX_STEP_TASK_QUESTION_ID,
  SETUP_CONTEXT_ACTION_QUESTION_ID,
  SETUP_CONTEXT_SOURCES_QUESTION_ID,
  buildApprovalResult,
  buildStopPendingRequestResult,
  isAutoDeniablePermissionRequest,
  pendingRequestDetail,
} from "../src/state/approval-requests";
import { mcpToolApprovalDetail } from "../src/state/approval-request-mcp-tool-approval";
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

/*
 * Regression pin for the objectRecord→recordObject sentinel swap: malformed
 * non-object entries in `toolParamsDisplay` must be FILTERED (HEAD semantics),
 * not rendered as "Param N: undefined" ghost rows.
 */
function mcpToolApprovalParamsFilterMalformedDisplayEntries(): void {
  const detail = mcpToolApprovalDetail({
    _meta: { codex_approval_kind: "mcp_tool_call" },
    toolParamsDisplay: [
      { name: "city", value: "Paris" },
      "stray-string-item",
      42,
      null,
    ],
  });
  assertEqual(detail !== null, true, "mcp tool approval detail should parse");
  assertDeepEqual(
    detail?.toolParamEntries.map((entry) => entry.name),
    ["city"],
    "non-object display entries must be filtered, not rendered as ghost params",
  );
  assertEqual(detail?.toolParamEntries[0]?.previewText, "Paris", "real tool params should survive");
}

export default function runApprovalRequestTests(): void {
  mcpToolApprovalParamsFilterMalformedDisplayEntries();
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
    sessionCommandDetail.body,
    "Reason: example.com isn't on the current network allowlist",
    "network command approval body should follow Desktop reason text",
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
  assertDeepEqual(
    pendingRequestDetail(oneShotCommandRequest).questions[0]?.options.map((option) => option.value),
    ["accept"],
    "command approval should only expose decisions app-server made available",
  );
  assertDeepEqual(
    buildApprovalResult(oneShotCommandRequest, true, { approvalDecision: ["acceptForSession"] }),
    { decision: "accept" },
    "unavailable command approval choices should fall back to accept",
  );

  const declineOnlyCommandRequest = request("item/commandExecution/requestApproval", {
    command: "npm test",
    availableDecisions: ["decline"],
  });
  const declineOnlyCommandDetail = pendingRequestDetail(declineOnlyCommandRequest);
  assertDeepEqual(
    declineOnlyCommandDetail.questions[0]?.options.map((option) => option.value),
    [],
    "decline-only command approval should not invent an accept option",
  );
  assertEqual(declineOnlyCommandDetail.canAccept, false, "decline-only command approval disables primary action");
  assertDeepEqual(
    buildApprovalResult(declineOnlyCommandRequest, true, { approvalDecision: ["acceptForSession"] }),
    { decision: "decline" },
    "unavailable command approval choices should fall back to decline when accept is unavailable",
  );

  const execPolicyCommandRequest = request("item/commandExecution/requestApproval", {
    command: "npm test",
    proposedExecpolicyAmendment: ["npm", "test"],
  });
  assertDeepEqual(
    pendingRequestDetail(execPolicyCommandRequest).questions[0]?.options.map((option) => option.value),
    ["accept", "acceptWithExecpolicyAmendment"],
    "command approval should expose Desktop's execpolicy amendment option when proposed",
  );
  assertDeepEqual(
    pendingRequestDetail(execPolicyCommandRequest).questions[0]?.options[1],
    {
      value: "acceptWithExecpolicyAmendment",
      label: "Yes, and don't ask again for commands that start with",
      description: "Approve commands with the same prefix.",
      codePreview: "npm test",
      ariaLabel: "Yes, and don't ask again for commands that start with npm test",
    },
    "command execpolicy option should split Desktop's prefix text from the truncated command preview",
  );
  assertDeepEqual(
    buildApprovalResult(execPolicyCommandRequest, true, { approvalDecision: ["acceptWithExecpolicyAmendment"] }),
    { decision: { acceptWithExecpolicyAmendment: { execpolicy_amendment: ["npm", "test"] } } },
    "command execpolicy choice should return the proposed app-server decision object",
  );

  const futureNetworkRequest = request("item/commandExecution/requestApproval", {
    command: "curl https://example.com",
    networkApprovalContext: { host: "example.com", protocol: "https" },
    proposedNetworkPolicyAmendments: [{ host: "example.com", action: "allow" }],
  });
  assertDeepEqual(
    pendingRequestDetail(futureNetworkRequest).questions[0]?.options.map((option) => option.value),
    ["accept", "acceptForSession", "applyNetworkPolicyAmendment"],
    "network approval should expose Desktop's one-time, conversation, and future allowlist options",
  );
  assertDeepEqual(
    buildApprovalResult(futureNetworkRequest, true, { approvalDecision: ["applyNetworkPolicyAmendment"] }),
    { decision: { applyNetworkPolicyAmendment: { network_policy_amendment: { host: "example.com", action: "allow" } } } },
    "network allowlist choice should return the proposed app-server decision object",
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
  assertDeepEqual(
    fileChangeDetail.questions[0]?.options.map((option) => option.value),
    ["accept", "acceptForSession"],
    "file change approval should expose Desktop's allow once / session option shape",
  );
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
  assertEqual(inputDetail.title, "", "user input has no fixed title; panel uses question text");
  assertEqual(inputDetail.acceptLabel, "Submit", "user input accept label");
  assertEqual(inputDetail.declineLabel, "Dismiss", "user input decline aligns with requestInputPanel.dismiss");
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

  const planImplementationRequest = request(PLAN_IMPLEMENTATION_REQUEST_METHOD, {
    threadId: "thread-1",
    turnId: "turn-1",
    planContent: "## Plan\n\n- Patch\n- Verify",
  });
  const planImplementationDetail = pendingRequestDetail(planImplementationRequest);
  assertEqual(planImplementationDetail.title, "Implement this plan?", "plan implementation title");
  assertEqual(planImplementationDetail.declineLabel, "Dismiss", "plan implementation dismiss label");
  assertEqual(planImplementationDetail.questions[0]?.isOther, true, "plan implementation supports freeform alternative");
  assertDeepEqual(
    planImplementationDetail.questions[0]?.defaultAnswers,
    [PLAN_IMPLEMENTATION_ACCEPT_VALUE],
    "plan implementation defaults to the Desktop implement option",
  );
  assertDeepEqual(
    buildApprovalResult(planImplementationRequest, true, {
      [PLAN_IMPLEMENTATION_QUESTION_ID]: [PLAN_IMPLEMENTATION_ACCEPT_VALUE],
    }),
    { action: "implement", followUp: null },
    "plan implementation accept result",
  );
  assertDeepEqual(
    buildApprovalResult(planImplementationRequest, true, {
      [PLAN_IMPLEMENTATION_QUESTION_ID]: ["Change the plan first"],
    }),
    { action: "custom", followUp: "Change the plan first" },
    "plan implementation custom follow-up result",
  );
  assertEqual(buildApprovalResult(planImplementationRequest, false), null, "plan implementation dismiss result");

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
  assertIncludes(
    mcpFormDetail.metadata.map((item) => `${item.label}: ${item.value}`).join("\n"),
    "Kind: MCP request",
    "mcp form should be explicitly labelled as an MCP request",
  );
  assertIncludes(
    mcpFormDetail.metadata.map((item) => `${item.label}: ${item.value}`).join("\n"),
    "MCP server: filesystem",
    "mcp form should expose the originating MCP server",
  );
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
  assertEqual(mcpUrlDetail.title, "Action required", "mcp url title");
  assertEqual(mcpUrlDetail.acceptLabel, "Open link", "mcp url accept label");
  assertEqual(mcpUrlDetail.externalUrl, "https://example.com/connect", "mcp url external link");
  assertEqual(mcpUrlDetail.questions.length, 0, "mcp url has no form questions");
  assertIncludes(mcpUrlDetail.body, "URL: https://example.com/connect", "mcp url body includes URL");
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

  const toolSuggestionRequest = request("mcpServer/elicitation/request", {
    kind: "toolSuggestion",
    message: "Codex can use GitHub.",
    suggestion: {
      tool_type: "connector",
      tool_id: "github",
      tool_name: "GitHub",
      suggest_type: "install",
    },
    _meta: { persist: ["always"] },
  });
  const toolSuggestionDetail = pendingRequestDetail(toolSuggestionRequest);
  assertEqual(toolSuggestionDetail.title, "Install GitHub?", "tool suggestion title");
  assertEqual(toolSuggestionDetail.acceptLabel, "Install", "tool suggestion accept label");
  assertIncludes(
    toolSuggestionDetail.metadata.map((item) => `${item.label}: ${item.value}`).join("\n"),
    "Suggested tool: GitHub",
    "tool suggestion metadata",
  );

  const connectorAuthRequest = request("mcpServer/elicitation/request", {
    kind: "connectorAuth",
    message: "Sign in to continue.",
    connector: {
      connector_id: "gmail",
      connector_name: "Gmail",
      auth_reason: "missing_link",
      auth_url: "https://example.com/oauth/gmail",
    },
  });
  const connectorAuthDetail = pendingRequestDetail(connectorAuthRequest);
  assertEqual(connectorAuthDetail.title, "Sign in to Gmail?", "connector auth title");
  assertEqual(connectorAuthDetail.acceptLabel, "Sign in", "connector auth accept label");
  assertEqual(connectorAuthDetail.externalUrl, "https://example.com/oauth/gmail", "connector auth external URL");
  assertIncludes(connectorAuthDetail.body, "URL: https://example.com/oauth/gmail", "connector auth body includes URL");
  assertIncludes(
    connectorAuthDetail.metadata.map((item) => `${item.label}: ${item.value}`).join("\n"),
    "Auth URL: https://example.com/oauth/gmail",
    "connector auth metadata should expose auth URL",
  );

  const mcpToolApprovalRequest = request("mcpServer/elicitation/request", {
    threadId: "thread-1",
    turnId: "turn-1",
    serverName: "codex_apps",
    mode: "form",
    message: "Allow GitHub to run tool \"search_repositories\"?",
    riskLevel: "high",
    requestedSchema: { type: "object", properties: {} },
    _meta: {
      codex_approval_kind: "mcp_tool_call",
      connector_id: "github",
      connector_name: "GitHub",
      persist: ["always", "session"],
      tool_params_display: [
        { name: "repo", displayName: "Repository", value: "openai/codex" },
        { name: "filters", displayName: "Filters", value: { language: "TypeScript", archived: false, minStars: 100 } },
      ],
    },
  });
  const mcpToolApprovalDetail = pendingRequestDetail(mcpToolApprovalRequest);
  const mcpToolApprovalMetadata = mcpToolApprovalDetail.metadata
    .map((item) => `${item.label}: ${item.value}`)
    .join("\n");
  assertEqual(
    mcpToolApprovalDetail.title,
    "Allow GitHub to run search_repositories tool ?",
    "mcp tool approval title should use Desktop's formatted tool title shape",
  );
  assertEqual(mcpToolApprovalDetail.mcpToolApproval?.connectorName, "GitHub", "mcp tool approval connector");
  assertEqual(mcpToolApprovalDetail.mcpToolApproval?.riskLevel, "high", "mcp tool approval risk level");
  assertDeepEqual(
    mcpToolApprovalDetail.mcpToolApproval?.toolParamEntries.map((entry) => [entry.label, entry.previewText, entry.isExpandable]),
    [
      ["Repository", "openai/codex", false],
      ["Filters", "{\"language\":\"TypeScript\",\"archived\":false,\"minS…", true],
    ],
    "mcp tool approval should expose Desktop-style structured tool parameters",
  );
  assertEqual(mcpToolApprovalDetail.questions[0]?.id, "_meta.persist", "mcp tool approval should expose persist choices");
  assertDeepEqual(
    mcpToolApprovalDetail.questions[0]?.options.map((option) => option.label),
    ["Don’t persist", "Always allow", "Allow for this chat"],
    "mcp tool approval persist labels",
  );
  assertIncludes(mcpToolApprovalMetadata, "Approval: MCP tool call", "mcp tool approval kind metadata");
  assertIncludes(mcpToolApprovalMetadata, "Connector: GitHub", "mcp tool approval connector metadata");
  assertDeepEqual(
    buildApprovalResult(mcpToolApprovalRequest, true, { "_meta.persist": ["always"] }),
    { action: "accept", content: {}, _meta: { persist: "always" } },
    "mcp tool approval should return selected persist metadata",
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
  assertIncludes(permissionsDetail.body, "Network: Internet access", "permissions body includes network permission (codex networkValue = 'Internet access')");
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
  assertEqual(toolCallDetail.title, "App tool request", "dynamic tool call title");
  assertEqual(
    toolCallDetail.reason,
    "Dynamic client-side tool execution is not implemented.",
    "dynamic tool call reason",
  );
  assertIncludes(toolCallDetail.body, "Status: Unsupported dynamic tool call", "dynamic tool call status copy");
  assertIncludes(
    toolCallDetail.body,
    "does not run it as regular tool activity",
    "dynamic tool call should explain it is not ordinary tool activity",
  );
  assertIncludes(toolCallDetail.body, "Arguments: {\"path\":\"/tmp/file\"}", "dynamic tool call arguments copy");
  assertIncludes(
    toolCallDetail.metadata.map((item) => `${item.label}: ${item.value}`).join("\n"),
    "Kind: App tool request",
    "dynamic tool call kind metadata",
  );
  assertIncludes(
    toolCallDetail.metadata.map((item) => `${item.label}: ${item.value}`).join("\n"),
    "Tool: unknownTool",
    "dynamic tool call tool metadata",
  );
  assertIncludes(
    toolCallDetail.metadata.map((item) => `${item.label}: ${item.value}`).join("\n"),
    "Call: call-1",
    "dynamic tool call call-id metadata",
  );
  assertEqual(toolCallDetail.canAccept, false, "dynamic tool call cannot accept");
  assertEqual(buildApprovalResult(toolCallRequest, true), null, "dynamic tool call accept result is null");

  const onboardingInputRequest = request("item/tool/call", {
    threadId: "thread-1",
    turnId: "turn-1",
    callId: "call-onboarding",
    namespace: "local",
    tool: "request_onboarding_input",
    arguments: {
      questions: [{
        id: "first_task",
        header: "First task",
        question: "What should Codex help with first?",
        options: [
          { label: "Build UI", description: "Start with interface work" },
          { label: "Fix a bug" },
        ],
      }],
    },
  });
  const onboardingInputDetail = pendingRequestDetail(onboardingInputRequest);
  assertEqual(onboardingInputDetail.title, "", "dynamic onboarding input uses the user-input title fallback");
  assertEqual(onboardingInputDetail.userInput, true, "dynamic onboarding input should render as user-input");
  assertEqual(onboardingInputDetail.acceptLabel, "Submit", "dynamic onboarding input submit label");
  assertEqual(onboardingInputDetail.declineLabel, "Dismiss", "dynamic onboarding input dismiss label");
  assertEqual(onboardingInputDetail.canAccept, true, "dynamic onboarding input can accept");
  assertEqual(onboardingInputDetail.questions[0]?.id, "first_task", "dynamic onboarding input question id");
  assertEqual(onboardingInputDetail.questions[0]?.isOther, true, "dynamic onboarding input forces freeform other");
  assertEqual(onboardingInputDetail.questions[0]?.otherPlaceholder, "Something else", "dynamic onboarding input custom placeholder");
  assertDeepEqual(
    onboardingInputDetail.questions[0]?.options.map((option) => [option.value, option.description]),
    [["Build UI", "Start with interface work"], ["Fix a bug", ""]],
    "dynamic onboarding input options",
  );
  assertEqual(
    pendingRequestDetail({
      ...onboardingInputRequest,
      params: { ...onboardingInputRequest.params as Record<string, unknown>, tool: "request_onboarding_input", arguments: { questions: [] } },
    }).canAccept,
    false,
    "malformed onboarding input should remain unsupported instead of inventing answers",
  );
  assertDeepEqual(
    buildApprovalResult(onboardingInputRequest, true, { first_task: ["  Write tests  "] }),
    {
      success: true,
      contentItems: [{
        type: "inputText",
        text: "{\"answers\":{\"first_task\":{\"answers\":[\"Write tests\"]}}}",
      }],
    },
    "dynamic onboarding input submit result",
  );
  assertDeepEqual(
    buildApprovalResult(onboardingInputRequest, false),
    {
      success: true,
      contentItems: [{
        type: "inputText",
        text: "{\"answers\":{}}",
      }],
    },
    "dynamic onboarding input dismiss result",
  );

  const optionPickerRequest = request("item/tool/call", {
    threadId: "thread-1",
    turnId: "turn-1",
    callId: "call-2",
    tool: "request_option_picker",
    arguments: {
      question: "Choose a path",
      options: [
        { label: "Fast", description: "Quick route" },
        { label: "Careful" },
      ],
      allowMultiple: true,
      submitLabel: "Continue",
      skipLabel: "Not now",
    },
  });
  const optionPickerDetail = pendingRequestDetail(optionPickerRequest);
  assertEqual(optionPickerDetail.title, "Choose a path", "dynamic option picker title");
  assertEqual(optionPickerDetail.acceptLabel, "Continue", "dynamic option picker submit label");
  assertEqual(optionPickerDetail.declineLabel, "Not now", "dynamic option picker skip label");
  assertEqual(optionPickerDetail.canAccept, true, "dynamic option picker can accept");
  assertEqual(optionPickerDetail.optionPicker?.allowMultiple, true, "dynamic option picker preserves allowMultiple");
  assertDeepEqual(
    buildApprovalResult(optionPickerRequest, true, {
      optionPickerSelection: ["Fast", "Something custom"],
    }),
    {
      success: true,
      contentItems: [{
        type: "inputText",
        text: "{\"action\":\"submit\",\"selectedOptions\":[\"Fast\"],\"freeformAnswer\":\"Something custom\"}",
      }],
    },
    "dynamic option picker submit result",
  );
  assertDeepEqual(
    buildApprovalResult(optionPickerRequest, true, {
      "__optionPicker.action": ["skip"],
    }),
    {
      success: true,
      contentItems: [{
        type: "inputText",
        text: "{\"action\":\"skip\",\"selectedOptions\":[],\"freeformAnswer\":null}",
      }],
    },
    "dynamic option picker skip result",
  );
  assertDeepEqual(
    buildApprovalResult(optionPickerRequest, false),
    {
      success: true,
      contentItems: [{
        type: "inputText",
        text: "{\"action\":\"dismiss\",\"selectedOptions\":[],\"freeformAnswer\":null}",
      }],
    },
    "dynamic option picker dismiss result",
  );

  const setupContextRequest = request("item/tool/call", {
    threadId: "thread-1",
    turnId: "turn-1",
    callId: "call-3",
    tool: "setup_codex_context_picker",
    arguments: {},
  });
  const setupContextDetail = pendingRequestDetail(setupContextRequest);
  assertEqual(setupContextDetail.title, "Where can we pull context from?", "dynamic setup context picker title");
  assertEqual(setupContextDetail.acceptLabel, "Continue", "dynamic setup context picker continue label");
  assertEqual(setupContextDetail.declineLabel, "Skip", "dynamic setup context picker skip label");
  assertEqual(setupContextDetail.canAccept, true, "dynamic setup context picker can accept");
  assertEqual(setupContextDetail.setupContextPicker?.canSelectSources, false, "setup context without sources disables selection");
  assertDeepEqual(setupContextDetail.setupContextPicker?.sources, [], "setup context without sources has an empty source list");
  assertDeepEqual(
    buildApprovalResult(setupContextRequest, true),
    {
      success: true,
      contentItems: [{
        type: "inputText",
        text: "{\"action\":\"continue\",\"selectedSources\":[]}",
      }],
    },
    "dynamic setup context picker continue result",
  );
  assertDeepEqual(
    buildApprovalResult(setupContextRequest, true, {
      "__setupCodexContextPicker.action": ["skip"],
    }),
    {
      success: true,
      contentItems: [{
        type: "inputText",
        text: "{\"action\":\"skip\",\"selectedSources\":[]}",
      }],
    },
    "dynamic setup context picker skip result",
  );
  assertDeepEqual(
    buildApprovalResult(setupContextRequest, false),
    {
      success: true,
      contentItems: [{
        type: "inputText",
        text: "{\"action\":\"dismiss\",\"selectedSources\":[]}",
      }],
    },
    "dynamic setup context picker dismiss result",
  );

  const sourceBackedSetupContextRequest = request("item/tool/call", {
    threadId: "thread-1",
    turnId: "turn-1",
    callId: "call-4",
    tool: "setup_codex_context_picker",
    arguments: {
      canSelectSources: true,
      sources: [
        { id: "google-drive", label: "Google Drive", description: "Find launch docs", connected: true },
        { id: "slack", label: "Slack", description: "Read decisions" },
        { id: "gmail", displayName: "Gmail", description: "Search email", is_connected: false },
        { id: "slack", label: "Duplicate Slack" },
        { id: "", label: "No id" },
      ],
      defaultSelectedSourceIds: ["slack", "missing-source"],
    },
  });
  const sourceBackedSetupContextDetail = pendingRequestDetail(sourceBackedSetupContextRequest);
  assertEqual(sourceBackedSetupContextDetail.setupContextPicker?.canSelectSources, true, "setup context with sources enables selection");
  assertDeepEqual(
    sourceBackedSetupContextDetail.setupContextPicker?.sources,
    [
      { id: "google-drive", label: "Google Drive", description: "Find launch docs", connected: true },
      { id: "slack", label: "Slack", description: "Read decisions", connected: false },
      { id: "gmail", label: "Gmail", description: "Search email", connected: false },
    ],
    "setup context source parser should normalize and de-duplicate source rows",
  );
  assertDeepEqual(
    sourceBackedSetupContextDetail.setupContextPicker?.defaultSelectedSourceIds,
    ["google-drive", "slack"],
    "setup context should default connected and explicitly selected valid sources",
  );
  assertDeepEqual(
    buildApprovalResult(sourceBackedSetupContextRequest, true),
    {
      success: true,
      contentItems: [{
        type: "inputText",
        text: "{\"action\":\"continue\",\"selectedSources\":[\"google-drive\",\"slack\"]}",
      }],
    },
    "dynamic setup context picker should return default selected sources",
  );
  assertDeepEqual(
    buildApprovalResult(sourceBackedSetupContextRequest, true, {
      [SETUP_CONTEXT_SOURCES_QUESTION_ID]: ["gmail", "missing-source", "gmail"],
    }),
    {
      success: true,
      contentItems: [{
        type: "inputText",
        text: "{\"action\":\"continue\",\"selectedSources\":[\"google-drive\",\"gmail\"]}",
      }],
    },
    "dynamic setup context picker should return connected and sanitized selected sources",
  );
  assertDeepEqual(
    buildApprovalResult(sourceBackedSetupContextRequest, true, {
      "__setupCodexContextPicker.action": ["skip"],
      [SETUP_CONTEXT_SOURCES_QUESTION_ID]: ["gmail"],
    }),
    {
      success: true,
      contentItems: [{
        type: "inputText",
        text: "{\"action\":\"skip\",\"selectedSources\":[]}",
      }],
    },
    "dynamic setup context picker should omit selected sources when skipped",
  );

  const nativeSetupContextRequest = request("item/tool/requestSetupCodexContextPicker", {
    threadId: "thread-1",
    turnId: "turn-1",
  });
  assertDeepEqual(
    buildApprovalResult(nativeSetupContextRequest, true),
    { action: "continue", selectedSources: [] },
    "native setup context picker should return the direct Desktop response shape",
  );

  const setupCodexRoleStepRequest = request("item/tool/call", {
    threadId: "thread-1",
    turnId: "turn-1",
    callId: "call-setup-role",
    tool: "setup_codex_step",
    arguments: { step: "role" },
  });
  const setupCodexRoleDetail = pendingRequestDetail(setupCodexRoleStepRequest);
  assertEqual(setupCodexRoleDetail.title, "What type of work do you do?", "setup_codex_step role title");
  assertEqual(setupCodexRoleDetail.acceptLabel, "Continue", "setup_codex_step role continue label");
  assertEqual(setupCodexRoleDetail.questions[0]?.id, SETUP_CODEX_STEP_ROLE_QUESTION_ID, "setup_codex_step role question id");
  assertEqual(setupCodexRoleDetail.questions[0]?.kind, "multiSelect", "setup_codex_step role allows multiple roles");
  assertDeepEqual(
    setupCodexRoleDetail.questions[0]?.options.map((option) => option.value),
    [
      "engineering",
      "data_science",
      "product_management",
      "design",
      "marketing",
      "sales",
      "finance",
      "operations",
      "people_hr",
      "legal",
      "student",
      "something_else",
    ],
    "setup_codex_step role options follow Desktop role order",
  );
  assertDeepEqual(
    buildApprovalResult(setupCodexRoleStepRequest, true, {
      [SETUP_CODEX_STEP_ROLE_QUESTION_ID]: ["engineering", "missing", "student", "engineering"],
    }),
    {
      success: true,
      contentItems: [{
        type: "inputText",
        text: "{\"action\":\"submit\",\"selectedRoles\":[\"engineering\",\"student\"]}",
      }],
    },
    "setup_codex_step role submit result",
  );
  assertDeepEqual(
    buildApprovalResult(setupCodexRoleStepRequest, false),
    {
      success: true,
      contentItems: [{
        type: "inputText",
        text: "{\"action\":\"dismiss\",\"selectedRoles\":[]}",
      }],
    },
    "setup_codex_step role dismiss result",
  );

  const setupCodexTaskStepRequest = request("item/tool/call", {
    threadId: "thread-1",
    turnId: "turn-1",
    callId: "call-setup-task",
    tool: "setup_codex_step",
    arguments: "{\"step\":\"task\"}",
  });
  const setupCodexTaskDetail = pendingRequestDetail(setupCodexTaskStepRequest);
  assertEqual(setupCodexTaskDetail.userInput, true, "setup_codex_step task renders as user-input");
  assertEqual(setupCodexTaskDetail.questions[0]?.id, SETUP_CODEX_STEP_TASK_QUESTION_ID, "setup_codex_step task question id");
  assertEqual(setupCodexTaskDetail.questions[0]?.header, "First task", "setup_codex_step task header");
  assertEqual(setupCodexTaskDetail.questions[0]?.kind, "singleSelect", "setup_codex_step task uses Desktop task suggestions");
  assertEqual(setupCodexTaskDetail.questions[0]?.isOther, true, "setup_codex_step task keeps the freeform other input");
  assertDeepEqual(setupCodexTaskDetail.questions[0]?.defaultAnswers, [], "setup_codex_step task should not default-select a suggestion");
  assertEqual(setupCodexTaskDetail.questions[0]?.otherPlaceholder, "Something else", "setup_codex_step task uses Desktop freeform placeholder");
  assertDeepEqual(
    setupCodexTaskDetail.questions[0]?.options.map((option) => option.value),
    ["Summarize updates", "Draft follow-ups", "Prep for meetings"],
    "setup_codex_step task suggestions fall back to the Desktop other-role prompts",
  );
  assertDeepEqual(
    buildApprovalResult(setupCodexTaskStepRequest, true, {
      [SETUP_CODEX_STEP_TASK_QUESTION_ID]: ["  Debug the failing test  "],
    }),
    {
      success: true,
      contentItems: [{
        type: "inputText",
        text: "{\"action\":\"submit\",\"answers\":{\"first_task\":{\"answers\":[\"Debug the failing test\"]}}}",
      }],
    },
    "setup_codex_step task submit result",
  );
  assertDeepEqual(
    buildApprovalResult(setupCodexTaskStepRequest, true, {
      [SETUP_CODEX_STEP_TASK_ACTION_QUESTION_ID]: ["skip"],
      [SETUP_CODEX_STEP_TASK_QUESTION_ID]: ["Summarize updates"],
    }),
    {
      success: true,
      contentItems: [{
        type: "inputText",
        text: "{\"action\":\"skip\",\"answers\":{}}",
      }],
    },
    "setup_codex_step task skip result should not submit selected suggestions",
  );
  assertDeepEqual(
    buildApprovalResult(setupCodexTaskStepRequest, false),
    {
      success: true,
      contentItems: [{
        type: "inputText",
        text: "{\"action\":\"dismiss\",\"answers\":{}}",
      }],
    },
    "setup_codex_step task dismiss result",
  );

  const setupCodexContextStepRequest = request("item/tool/call", {
    threadId: "thread-1",
    turnId: "turn-1",
    callId: "call-setup-context",
    tool: "setup_codex_step",
    arguments: { step: "context" },
  });
  const setupCodexContextDetail = pendingRequestDetail(setupCodexContextStepRequest);
  assertEqual(setupCodexContextDetail.title, "Where can we pull context from?", "setup_codex_step context title");
  assertEqual(setupCodexContextDetail.setupContextPicker?.canSelectSources, false, "setup_codex_step context has no Forge-owned sources");
  assertDeepEqual(
    buildApprovalResult(setupCodexContextStepRequest, true),
    {
      success: true,
      contentItems: [{
        type: "inputText",
        text: "{\"action\":\"continue\",\"selectedSources\":[]}",
      }],
    },
    "setup_codex_step context continue result",
  );
  assertDeepEqual(
    buildApprovalResult(setupCodexContextStepRequest, true, {
      [SETUP_CONTEXT_ACTION_QUESTION_ID]: ["skip"],
    }),
    {
      success: true,
      contentItems: [{
        type: "inputText",
        text: "{\"action\":\"skip\",\"selectedSources\":[]}",
      }],
    },
    "setup_codex_step context skip result",
  );
  assertDeepEqual(
    buildStopPendingRequestResult(setupCodexContextStepRequest),
    {
      success: true,
      contentItems: [{
        type: "inputText",
        text: "{\"action\":\"dismiss\",\"selectedSources\":[]}",
      }],
    },
    "Stop all should dismiss setup_codex_step context requests",
  );

  const setupCodexCompleteStepDetail = pendingRequestDetail(request("item/tool/call", {
    threadId: "thread-1",
    turnId: "turn-1",
    callId: "call-setup-complete",
    tool: "setup_codex_step",
    arguments: { step: "complete" },
  }));
  assertEqual(setupCodexCompleteStepDetail.canAccept, false, "setup_codex_step complete should remain unsupported");

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

  assertDeepEqual(
    buildStopPendingRequestResult(commandRequest),
    { decision: "decline" },
    "Stop all should decline command approvals with a normal response",
  );
  assertDeepEqual(
    buildStopPendingRequestResult(inputRequest),
    { answers: {} },
    "Stop all should answer user-input requests with an empty answer payload",
  );
  assertDeepEqual(
    buildStopPendingRequestResult(permissionsRequest),
    { permissions: {}, scope: "turn" },
    "Stop all should decline permissions requests with Desktop's turn-scoped empty grant",
  );
  assertDeepEqual(
    buildStopPendingRequestResult(mcpFormRequest),
    { action: "decline", content: null, _meta: null },
    "Stop all should decline MCP elicitations with a normal response",
  );
  assertDeepEqual(
    buildStopPendingRequestResult(setupContextRequest),
    {
      success: true,
      contentItems: [{
        type: "inputText",
        text: "{\"action\":\"dismiss\",\"selectedSources\":[]}",
      }],
    },
    "Stop all should dismiss dynamic setup context pickers",
  );
  assertDeepEqual(
    buildStopPendingRequestResult(onboardingInputRequest),
    {
      success: true,
      contentItems: [{
        type: "inputText",
        text: "{\"answers\":{}}",
      }],
    },
    "Stop all should dismiss dynamic onboarding input with an empty answer wrapper",
  );
  assertEqual(buildStopPendingRequestResult(unknownRequest), null, "Stop all unsupported request result is null");

  // codex auto-deny: a permission request with nothing grantable (no network +
  // no fileSystem) is auto-declined ({ permissions: {}, scope: "turn" }) and
  // never shown, rather than left as a stuck non-acceptable panel.
  const emptyPermissionRequest = request("item/permissions/requestApproval", { permissions: {} });
  assertEqual(
    isAutoDeniablePermissionRequest(emptyPermissionRequest),
    true,
    "permission request with no network/fileSystem is auto-deniable",
  );
  assertDeepEqual(
    buildStopPendingRequestResult(emptyPermissionRequest),
    { permissions: {}, scope: "turn" },
    "auto-deniable permission request declines with empty permissions, turn scope",
  );
  assertEqual(
    isAutoDeniablePermissionRequest(request("item/permissions/requestApproval", { permissions: { network: { enabled: true } } })),
    false,
    "permission request with network present is NOT auto-deniable",
  );
  assertEqual(
    isAutoDeniablePermissionRequest(request("item/permissions/requestApproval", { permissions: { fileSystem: { read: ["/x"] } } })),
    false,
    "permission request with fileSystem present is NOT auto-deniable",
  );
  assertEqual(
    isAutoDeniablePermissionRequest(request("item/commandExecution/requestApproval", { command: ["ls"] })),
    false,
    "non-permission requests are never auto-deniable",
  );

  // codex `readWrite` case: a path requested for both read and write collapses
  // into one "Read and write" row; read-only and write-only paths stay separate.
  const rwDetail = pendingRequestDetail(request("item/permissions/requestApproval", {
    permissions: { fileSystem: { read: ["/repo/a", "/repo/b"], write: ["/repo/a", "/repo/c"] } },
  }));
  assertIncludes(rwDetail.body, "Read and write: /repo/a", "shared read+write path collapses into one row");
  assertIncludes(rwDetail.body, "Read: /repo/b", "read-only path stays a Read row");
  assertIncludes(rwDetail.body, "Write: /repo/c", "write-only path stays a Write row");
}
