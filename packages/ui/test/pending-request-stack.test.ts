import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  commandPreviewText,
  looksLikeCommandOrPath,
  PendingRequestStack,
  pendingRequestOptionArrowSelection,
  pendingRequestOptionSelectionAction,
  pendingRequestOptionShortcut,
  pendingRequestShouldSubmitOnEnter,
} from "../src/components/pending-request-stack";
import { PLAN_IMPLEMENTATION_REQUEST_METHOD } from "../src/state/approval-requests";
import type { PendingServerRequest } from "../src/state/codex-reducer";

export default function runPendingRequestStackTests(): void {
  detectsCommandsAndPaths();
  keepsPlainLanguageDetailsAsText();
  preservesCommandPreviewText();
  rendersExecPolicyOptionCommandAsTruncatedCode();
  detectsSafeEnterSubmitScope();
  selectsRadioOptionsWithNumberKeysWithoutSubmitting();
  advancesMouseSelectedOptionsWithDesktopNextOrSubmit();
  movesRadioSelectionWithArrowKeys();
  focusesOtherTextareaWithArrowDownLikeCodexDesktop();
  rendersMcpUrlAndToolRequestsAsComposerCards();
  rendersDynamicOptionPickerAsDesktopPills();
  rendersDynamicOnboardingInputAsUserInputPanel();
  rendersDynamicSetupTaskPickerAsUserInputWithoutEscHint();
  rendersDynamicSetupContextPickerActions();
  rendersDynamicSetupContextPickerSources();
  rendersMcpToolApprovalWithDesktopParamPreview();
  rendersMultiQuestionUserInputWithContinueAction();
  rendersPlanImplementationAsDismissableUserInput();
  rendersUserInputDismissAction();
  rendersBackgroundRequestActorLabel();
}

function focusesOtherTextareaWithArrowDownLikeCodexDesktop(): void {
  const question = {
    id: "decision",
    header: "Decision",
    question: "Pick one",
    kind: "singleSelect" as const,
    isSecret: false,
    required: true,
    defaultAnswers: ["deny"],
    isOther: true,
    options: [
      { value: "allow", label: "Allow", description: "" },
      { value: "deny", label: "Deny", description: "" },
    ],
  };
  assertDeepEqual(
    pendingRequestOptionArrowSelection({
      key: "ArrowDown",
      question,
      currentValue: ["deny"],
      responding: false,
      isEditableTarget: false,
    }),
    { questionId: "decision", focusOther: true },
    "ArrowDown at the last isOther option should focus the freeform textarea",
  );
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
  const heredoc = "/bin/zsh -lc 'cat > ~/Downloads/forge_demo.html <<\\'HTML\\'\n<div>preview</div>\nHTML'";
  assertEqual(commandPreviewText({ command: heredoc }), heredoc, "multiline command preview should stay as one preview block");
  assertEqual(commandPreviewText({ command: ["npm", "run", "typecheck"] }), "npm run typecheck", "argv commands should join for preview");
}

function rendersExecPolicyOptionCommandAsTruncatedCode(): void {
  const html = renderToStaticMarkup(createElement(PendingRequestStack, {
    pendingRequests: [
      request("approval", "item/commandExecution/requestApproval", {
        command: "npm test",
        proposedExecpolicyAmendment: ["npm", "test", "--", "--very-long-filter"],
      }),
    ],
    onRespond: () => undefined,
  }));

  assertIncludes(html, "hc-request-option-code", "execpolicy option should render the command as a code preview");
  assertIncludes(html, 'data-code-layout="inline"', "single-line execpolicy previews should use Desktop's inline truncation layout");
  assertIncludes(html, "Yes, and don&#x27;t ask again for commands that start with</span><code", "prefix and command should not be one unbroken text node");
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

function advancesMouseSelectedOptionsWithDesktopNextOrSubmit(): void {
  assertEqual(
    pendingRequestOptionSelectionAction({ questionIndex: 0, totalQuestions: 2 }),
    "next",
    "Desktop mouse option click should advance from a non-final question",
  );
  assertEqual(
    pendingRequestOptionSelectionAction({ questionIndex: 1, totalQuestions: 2 }),
    "submit",
    "Desktop mouse option click should submit from the final question",
  );
  assertEqual(
    pendingRequestOptionSelectionAction({ questionIndex: 0, totalQuestions: 1 }),
    "submit",
    "Desktop mouse option click should submit a single-question request",
  );
}

function movesRadioSelectionWithArrowKeys(): void {
  const question = {
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
  };

  assertDeepEqual(
    pendingRequestOptionArrowSelection({
      key: "ArrowDown",
      question,
      currentValue: [],
      responding: false,
      isEditableTarget: false,
    }),
    { questionId: "decision", value: "allow" },
    "ArrowDown should select the first option when nothing is selected",
  );
  assertDeepEqual(
    pendingRequestOptionArrowSelection({
      key: "ArrowDown",
      question,
      currentValue: ["allow"],
      responding: false,
      isEditableTarget: false,
    }),
    { questionId: "decision", value: "deny" },
    "ArrowDown should move to the next radio option",
  );
  assertDeepEqual(
    pendingRequestOptionArrowSelection({
      key: "ArrowUp",
      question,
      currentValue: ["deny"],
      responding: false,
      isEditableTarget: false,
    }),
    { questionId: "decision", value: "allow" },
    "ArrowUp should move to the previous radio option",
  );
  assertEqual(
    pendingRequestOptionArrowSelection({
      key: "ArrowDown",
      question,
      currentValue: ["deny"],
      responding: false,
      isEditableTarget: false,
    }),
    null,
    "ArrowDown at the last option should not wrap",
  );
}

function rendersMcpUrlAndToolRequestsAsComposerCards(): void {
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

function rendersDynamicOptionPickerAsDesktopPills(): void {
  const html = renderToStaticMarkup(createElement(PendingRequestStack, {
    pendingRequests: [
      request("option-picker", "item/tool/call", {
        threadId: "thread-1",
        turnId: "turn-1",
        callId: "call-option",
        tool: "request_option_picker",
        arguments: {
          question: "Choose follow-up",
          options: [
            { label: "Draft tests", description: "Start with tests" },
            { label: "Patch UI", description: "Update the panel" },
          ],
          allowMultiple: false,
          submitLabel: "Continue",
          skipLabel: "Skip this",
        },
      }),
    ],
    onRespond: () => undefined,
  }));

  assertIncludes(html, 'data-request-kind="option-picker"', "dynamic request_option_picker should render a dedicated option-picker card");
  assertIncludes(html, "Choose follow-up", "option picker should render the Desktop question title");
  assertIncludes(html, "hc-option-picker-pill", "option picker choices should render as rounded pills");
  assertIncludes(html, 'role="radio"', "single-select option picker should expose radio pills");
  assertIncludes(html, "Something else", "option picker should include Desktop's freeform placeholder");
  assertIncludes(html, "<span>Skip this</span>", "option picker should use the provided skip label");
  assertIncludes(html, "<span>Continue</span>", "option picker should use the provided submit label");
  assertEqual(html.includes("Unsupported dynamic tool call"), false, "request_option_picker should not use the unsupported tool fallback");
}

function rendersDynamicOnboardingInputAsUserInputPanel(): void {
  const html = renderToStaticMarkup(createElement(PendingRequestStack, {
    pendingRequests: [
      request("onboarding-input", "item/tool/call", {
        threadId: "thread-1",
        turnId: "turn-1",
        callId: "call-onboarding",
        tool: "request_onboarding_input",
        arguments: {
          questions: [{
            id: "first_task",
            header: "First task",
            question: "What should Codex help with first?",
            options: [
              { label: "Build UI", description: "Start with interface work" },
              { label: "Fix a bug", description: "" },
            ],
          }],
        },
      }),
    ],
    onRespond: () => undefined,
  }));

  assertIncludes(html, 'data-request-kind="user-input"', "dynamic onboarding input should render as a user-input card");
  assertIncludes(html, "What should Codex help with first?", "dynamic onboarding input should render the question title");
  assertIncludes(html, "Build UI", "dynamic onboarding input should render option labels");
  assertIncludes(html, "Something else", "dynamic onboarding input should use Desktop's onboarding freeform placeholder");
  assertEqual(html.includes("Unsupported dynamic tool call"), false, "request_onboarding_input should not use the unsupported tool fallback");
}

function rendersDynamicSetupTaskPickerAsUserInputWithoutEscHint(): void {
  const html = renderToStaticMarkup(createElement(PendingRequestStack, {
    pendingRequests: [
      request("setup-task", "item/tool/call", {
        threadId: "thread-1",
        turnId: "turn-1",
        callId: "call-setup-task",
        tool: "setup_codex_step",
        arguments: { step: "task" },
      }),
    ],
    onRespond: () => undefined,
  }));

  assertIncludes(html, 'data-request-kind="user-input"', "setup_codex_step task should render through the user-input panel");
  assertIncludes(html, "First task", "setup_codex_step task should render the Desktop task title");
  assertIncludes(html, "Summarize updates", "setup_codex_step task should render suggestion options");
  assertIncludes(html, "Something else", "setup_codex_step task should expose the freeform other input");
  assertIncludes(html, "<span>Skip</span>", "setup_codex_step task secondary action should be Skip");
  assertIncludes(html, "<span>Submit</span>", "setup_codex_step task primary action should be Submit");
  assertEqual(html.includes("<kbd>ESC</kbd>"), false, "setup_codex_step task Skip action should not show the Esc dismiss hint");
  assertEqual(html.includes("Unsupported dynamic tool call"), false, "setup_codex_step task should not use the unsupported tool fallback");
}

function rendersDynamicSetupContextPickerActions(): void {
  const html = renderToStaticMarkup(createElement(PendingRequestStack, {
    pendingRequests: [
      request("setup-context", "item/tool/call", {
        threadId: "thread-1",
        turnId: "turn-1",
        callId: "call-context",
        tool: "setup_codex_context_picker",
        arguments: {},
      }),
    ],
    onRespond: () => undefined,
  }));

  assertIncludes(html, 'data-request-kind="setup-context-picker"', "dynamic setup_codex_context_picker should render a dedicated setup-context card");
  assertIncludes(html, "Where can we pull context from?", "setup context picker should render Desktop's title");
  assertIncludes(html, "<span>Skip</span>", "setup context picker should expose Desktop's skip action");
  assertIncludes(html, "<span>Continue</span>", "setup context picker should expose Desktop's continue action");
  assertEqual(html.includes("Unsupported dynamic tool call"), false, "setup_codex_context_picker should not use the unsupported tool fallback");
  assertEqual(html.includes("Context source selection requires"), false, "setup context picker should not show local implementation caveat copy");
}

function rendersDynamicSetupContextPickerSources(): void {
  const html = renderToStaticMarkup(createElement(PendingRequestStack, {
    pendingRequests: [
      request("setup-context", "item/tool/call", {
        threadId: "thread-1",
        turnId: "turn-1",
        callId: "call-context",
        tool: "setup_codex_context_picker",
        arguments: {
          canSelectSources: true,
          sources: [
            { id: "google-drive", label: "Google Drive", description: "Find launch docs", connected: true },
            { id: "slack", label: "Slack", description: "Read decisions" },
          ],
          defaultSelectedSourceIds: ["slack"],
        },
      }),
    ],
    onRespond: () => undefined,
  }));

  assertIncludes(html, "hc-setup-context-source", "setup context picker should render source rows when provided");
  assertIncludes(html, "Google Drive", "setup context picker should render source labels");
  assertIncludes(html, "Find launch docs", "setup context picker should render source descriptions");
  assertIncludes(html, "Slack", "setup context picker should render default selected source labels");
  assertIncludes(html, "Read decisions", "setup context picker should render unconnected source descriptions");
  assertIncludes(html, 'type="checkbox"', "setup context sources should be selectable with checkboxes");
  assertIncludes(html, 'data-connected="true"', "connected setup context sources should be marked");
  assertIncludes(html, "Connected", "connected setup context sources should show Desktop connected label");
  assertIncludes(html, "Connect", "unconnected setup context sources should show Desktop connect label");
}

function rendersMcpToolApprovalWithDesktopParamPreview(): void {
  const html = renderToStaticMarkup(createElement(PendingRequestStack, {
    pendingRequests: [
      request("mcp-tool-approval", "mcpServer/elicitation/request", {
        threadId: "thread-1",
        turnId: "turn-1",
        serverName: "codex_apps",
        mode: "form",
        message: "Allow GitHub to run tool \"search_repositories\"?",
        riskLevel: "high",
        requestedSchema: { type: "object", properties: {} },
        _meta: {
          codex_approval_kind: "mcp_tool_call",
          connector_name: "GitHub",
          persist: ["always", "session"],
          tool_params_display: [
            { name: "repo", displayName: "Repository", value: "openai/codex" },
            { name: "query", displayName: "Query", value: "language:typescript\nstars:>100\narchived:false\nfork:false\nsort:stars" },
            { name: "filters", displayName: "Filters", value: { language: "TypeScript", archived: false, minStars: 100 } },
            { name: "limit", displayName: "Limit", value: 20 },
            { name: "include_forks", displayName: "Include forks", value: false },
          ],
        },
      }),
    ],
    onRespond: () => undefined,
  }));

  assertIncludes(html, "hc-mcp-tool-approval-header warning", "high-risk MCP approvals should render Desktop's warning header");
  assertIncludes(html, "Elevated Risk", "high-risk MCP approvals should show the elevated risk label");
  assertIncludes(html, "Allow GitHub to run search_repositories tool ?", "tool approval title should use Desktop's formatted title copy");
  assertIncludes(html, "hc-mcp-tool-approval-params", "tool approval should render a dedicated parameter preview");
  assertIncludes(html, "Repository", "parameter labels should use display names");
  assertIncludes(html, "openai/codex", "parameter preview should show simple text values");
  assertIncludes(html, "Expand", "long or structured parameter values should expose an expand action");
  assertIncludes(html, "Show 1 more items", "parameter preview should initially show Desktop's four item limit");
  assertIncludes(html, "Always allow", "persist choices should keep the Desktop approval copy");
  assertIncludes(html, "Allow for this chat", "session persist choice should keep the Desktop approval copy");
  assertEqual(html.includes("Tool parameters:"), false, "tool parameters should not be flattened into generic metadata rows");
}

function rendersMultiQuestionUserInputWithContinueAction(): void {
  const html = renderToStaticMarkup(createElement(PendingRequestStack, {
    pendingRequests: [
      request("input", "item/tool/requestUserInput", {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "call-1",
        questions: [
          {
            id: "target",
            header: "HTML target",
            question: "Where should this go?",
            options: [{ label: "Standalone HTML", description: "" }],
          },
          {
            id: "reader",
            header: "Reader",
            question: "Who reads it?",
            options: [{ label: "Managers", description: "" }],
          },
        ],
      }),
    ],
    onRespond: () => undefined,
  }));

  assertIncludes(html, "1 of 2", "multi-question request input should render Desktop's question stepper");
  assertIncludes(html, "<span>Continue</span>", "non-final request input question should expose Continue instead of Submit");
}

function rendersPlanImplementationAsDismissableUserInput(): void {
  const html = renderToStaticMarkup(createElement(PendingRequestStack, {
    pendingRequests: [
      request("implement-plan:turn-1", PLAN_IMPLEMENTATION_REQUEST_METHOD, {
        threadId: "thread-1",
        turnId: "turn-1",
        planContent: "## Plan\n\n- Patch\n- Verify",
      }),
    ],
    onRespond: () => undefined,
  }));

  assertIncludes(html, 'data-request-kind="user-input"', "plan implementation should reuse Desktop's request input panel");
  assertIncludes(html, "Implement this plan?", "plan implementation prompt should render");
  assertIncludes(html, "Yes, implement this plan", "plan implementation option should render");
  assertIncludes(html, 'data-selected="true"', "plan implementation should default to the first option");
  assertIncludes(html, "<span>Dismiss</span>", "plan implementation secondary action should dismiss without Stop wording");
}

function rendersUserInputDismissAction(): void {
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
  assertIncludes(html, "Stops the running turn instead of submitting an empty answer.", "Dismiss action should explain interrupt semantics");
  assertIncludes(html, "<span>Dismiss</span>", "request_user_input secondary action aligns with requestInputPanel.dismiss");
}

function rendersBackgroundRequestActorLabel(): void {
  const html = renderToStaticMarkup(createElement(PendingRequestStack, {
    pendingRequests: [
      request("child-input", "item/tool/requestUserInput", {
        threadId: "child-1",
        turnId: "turn-1",
        questions: [{ id: "note", header: "Note", question: "Add context", options: null }],
      }),
    ],
    requestActors: { "child-input": "Kepler" },
    onRespond: () => undefined,
  }));

  assertIncludes(html, 'class="hc-request-panel-actor"', "background child requests should render an actor label");
  assertIncludes(html, "Kepler", "background child request actor label should be visible");
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
