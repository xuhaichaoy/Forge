import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  execShellCopyText,
  initialExecShellExpanded,
  MCP_APP_IFRAME_SANDBOX_POLICY,
  mcpAppBackgroundColorFromValue,
  mcpAppCspMetaContent,
  mcpAppDisplayModeFromValue,
  mcpAppFrameFromResourceReadResult,
  mcpAppHtmlTooLarge,
  mcpAppSandboxSrcDoc,
  mcpAppToolInputFromArguments,
  mcpAppToolOutputFromResult,
  mcpAppToolResultForWidget,
  mcpAppWidgetDataUpdatePayload,
  mcpAppWidgetViewPayload,
  mcpAppWidgetStateFromBridgeArgs,
  mcpAppWidgetStateFromValue,
  multiAgentAgentColor,
  normalizeDesktopShellCommand,
  ToolActivityDetail,
  toolActivityDetailViewModel,
} from "../src/components/tool-activity-detail";

export default function runToolActivityDetailTests(): void {
  buildsExecDetails();
  normalizesDesktopShellCommands();
  keepsCompletedExecShellCollapsedLikeDesktop();
  rendersRunningExecShellFooterBlankLikeDesktop();
  keepsVisibleExecShellSearchableLikeDesktop();
  omitsCardLevelCopyAllLikeDesktopEmbeddedExec();
  buildsDesktopShellCopyText();
  buildsDesktopLightweightExecRows();
  preservesDesktopPathTextInExecSummaryRows();
  labelsSkillExecSummaryRowsLikeDesktop();
  buildsPatchDetails();
  buildsStatusAwarePatchLabels();
  buildsMcpDetails();
  buildsMcpAppDetails();
  normalizesMcpAppToolPayloadsLikeDesktop();
  normalizesMcpAppBackgroundColorLikeDesktop();
  normalizesMcpAppWidgetStateLikeDesktop();
  buildsMcpAppWidgetDataUpdatesLikeDesktop();
  buildsMcpAppWidgetViewUpdatesLikeDesktop();
  parsesMcpAppResourceFrames();
  pinsMcpAppIframeSandboxPolicy();
  buildsMcpAppSandboxSrcDoc();
  buildsDynamicToolDetails();
  buildsAutoReviewDetails();
  buildsWebSearchDetails();
  buildsMultiAgentDetails();
}

function buildsDesktopLightweightExecRows(): void {
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "commandExecution",
      id: "read-1",
      command: "sed -n '1,20p' src/app.ts",
      cwd: "/workspace",
      status: "completed",
      parsedCmd: { type: "read", name: "app.ts", path: "src/app.ts", isFinished: true },
    }),
    {
      kind: "execSummary",
      id: "read-1",
      running: false,
      label: "Read app.ts",
    },
    "read commands should render Desktop's filename-oriented detail row",
  );
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "commandExecution",
      id: "read-path-fallback-1",
      command: "sed -n '1,20p' src/app.ts",
      cwd: "/workspace",
      status: "completed",
      parsedCmd: { type: "read", path: "src/app.ts", isFinished: true },
    }),
    {
      kind: "execSummary",
      id: "read-path-fallback-1",
      running: false,
      label: "Read src/app.ts",
    },
    "read detail rows should fall back to the normalized path when the Desktop name field is unavailable",
  );
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "commandExecution",
      id: "search-1",
      command: "rg Codex packages/ui",
      cwd: "/workspace",
      status: "completed",
      parsedCmd: { type: "search", query: "Codex", path: "packages/ui", isFinished: true },
    }),
    {
      kind: "execSummary",
      id: "search-1",
      running: false,
      label: "Searched for Codex in packages/ui",
    },
    "search commands should render as Desktop lightweight command rows",
  );
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "commandExecution",
      id: "list-1",
      command: "ls packages/ui",
      cwd: "/workspace",
      status: "running",
      parsedCmd: { type: "list_files", path: "packages/ui", isFinished: false },
    }),
    {
      kind: "execSummary",
      id: "list-1",
      running: true,
      label: "Listing files in packages/ui",
    },
    "running list commands should render as Desktop lightweight command rows",
  );
}

function preservesDesktopPathTextInExecSummaryRows(): void {
  const longPath = `./packages/ui/src/components/${"nested/".repeat(12)}tool-activity-detail.tsx`;
  const normalizedLongPath = `packages/ui/src/components/${"nested/".repeat(12)}tool-activity-detail.tsx`;

  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "commandExecution",
      id: "long-search-1",
      command: `rg Codex ${longPath}`,
      cwd: "/workspace",
      status: "completed",
      parsedCmd: { type: "search", query: "Codex", path: longPath, isFinished: true },
    }),
    {
      kind: "execSummary",
      id: "long-search-1",
      running: false,
      label: `Searched for Codex in ${normalizedLongPath}`,
    },
    "long search paths should preserve Desktop's full normalized text and leave visual truncation to CSS",
  );
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "commandExecution",
      id: "slash-list-1",
      command: "rg --files ./packages\\ui\\src",
      cwd: "/workspace",
      status: "running",
      parsedCmd: { type: "list_files", path: "./packages\\ui\\src", isFinished: false },
    }),
    {
      kind: "execSummary",
      id: "slash-list-1",
      running: true,
      label: "Listing files in packages/ui/src",
    },
    "exec summary paths should normalize leading ./ and backslashes like Codex Desktop",
  );
}

function labelsSkillExecSummaryRowsLikeDesktop(): void {
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "commandExecution",
      id: "skill-read-1",
      command: "sed -n '1,80p' /workspace/.codex/skills/code-review/SKILL.md",
      cwd: "/workspace",
      status: "completed",
      parsedCmd: { type: "read", path: "/workspace/.codex/skills/code-review/SKILL.md", isFinished: true },
    }),
    {
      kind: "execSummary",
      id: "skill-read-1",
      running: false,
      label: "Read Code Review skill",
    },
    "completed skill definition reads should render Desktop's semantic skill summary row",
  );
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "commandExecution",
      id: "skill-active-read-1",
      command: "sed -n '1,80p' /workspace/.codex/skills/code-review/SKILL.md",
      cwd: "/workspace",
      status: "running",
      parsedCmd: { type: "read", path: "/workspace/.codex/skills/code-review/SKILL.md", isFinished: false },
    }),
    {
      kind: "execSummary",
      id: "skill-active-read-1",
      running: true,
      label: "Reading Code Review skill",
    },
    "in-progress skill definition reads should keep Desktop's skill wording when rendered as a summary row",
  );
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "commandExecution",
      id: "skill-list-1",
      command: "rg --files /workspace/.codex/skills/code-review/scripts",
      cwd: "/workspace",
      status: "completed",
      parsedCmd: { type: "list_files", path: "/workspace/.codex/skills/code-review/scripts", isFinished: true },
    }),
    {
      kind: "execSummary",
      id: "skill-list-1",
      running: false,
      label: "Listed files in Code Review skill",
    },
    "skill directory listings should render Desktop's semantic skill summary row",
  );
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "commandExecution",
      id: "skill-search-1",
      command: "rg TODO /workspace/.codex/skills/code-review",
      cwd: "/workspace",
      status: "completed",
      parsedCmd: { type: "search", query: "TODO", path: "/workspace/.codex/skills/code-review", isFinished: true },
    }),
    {
      kind: "execSummary",
      id: "skill-search-1",
      running: false,
      label: "Searched for TODO in Code Review skill",
    },
    "skill searches should render Desktop's semantic skill summary row",
  );
}

function rendersRunningExecShellFooterBlankLikeDesktop(): void {
  const html = renderToStaticMarkup(createElement(ToolActivityDetail, {
    item: {
      type: "commandExecution",
      id: "exec-running-render",
      command: "npm run dev",
      status: "running",
      aggregatedOutput: "starting",
    },
  }));

  assertEqual(
    html.includes('data-exec-status="in-progress"'),
    true,
    "running exec shell should keep Desktop's in-progress footer spacer",
  );
  assertEqual(
    html.includes("Running"),
    false,
    "running exec shell footer should not render extra status text inside the shell",
  );
}

function keepsVisibleExecShellSearchableLikeDesktop(): void {
  const html = renderToStaticMarkup(createElement(ToolActivityDetail, {
    forceExecExpanded: true,
    item: {
      type: "commandExecution",
      id: "exec-expanded-searchable",
      command: "npm run test",
      status: "completed",
      aggregatedOutput: "test output",
      exitCode: 0,
    },
  }));

  assertEqual(
    html.includes("test output"),
    true,
    "expanded exec shell fixture should render visible output",
  );
  assertEqual(
    html.includes("data-thread-find-skip"),
    false,
    "visible exec shell output should stay searchable like Codex Desktop",
  );
}

function omitsCardLevelCopyAllLikeDesktopEmbeddedExec(): void {
  // codex (local-conversation-thread `Jh` variant:"embedded"): the in-thread
  // exec card exposes ONLY per-command + per-output copy (scoped group/command,
  // group/output) — it renders NO card-level "Copy command and output" button.
  const html = renderToStaticMarkup(createElement(ToolActivityDetail, {
    item: {
      type: "commandExecution",
      id: "exec-copy-buttons",
      command: "npm run build",
      status: "completed",
      aggregatedOutput: "done",
      exitCode: 0,
    },
  }));

  assertEqual(
    html.includes("hc-exec-shell-copy-all"),
    false,
    "embedded exec card must not render a card-level copy-all button (Codex's embedded variant has none)",
  );
  assertEqual(
    html.includes("hc-exec-shell-command-copy"),
    true,
    "embedded exec card keeps the per-command copy button",
  );
}

function buildsDesktopShellCopyText(): void {
  const detail = toolActivityDetailViewModel({
    type: "commandExecution",
    id: "exec-copy",
    command: "npm run test",
    status: "completed",
    aggregatedOutput: "ok",
    exitCode: 0,
  });
  if (detail.kind !== "exec") {
    throw new Error("copy text fixture should produce an exec detail");
  }

  assertEqual(
    execShellCopyText(detail),
    "$ npm run test\nok",
    "Codex Desktop shell copy should join prompt-prefixed command and output",
  );
  assertEqual(
    execShellCopyText(detail, "command"),
    "npm run test",
    "Codex Desktop command copy should use the normalized command only",
  );
  assertEqual(
    execShellCopyText(detail, "output"),
    "ok",
    "Codex Desktop output copy should use raw aggregated output only",
  );
}

function buildsExecDetails(): void {
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "commandExecution",
      id: "exec-1",
      command: "npm run test",
      cwd: "/workspace",
      status: "completed",
      aggregatedOutput: "ok",
      exitCode: 0,
    }),
    {
      kind: "exec",
      id: "exec-1",
      running: false,
      command: "npm run test",
      cwd: "/workspace",
      output: "ok",
      status: "completed",
      footer: "Success",
      startedAtMs: null,
    },
    "successful exec detail should expose command, output, and Desktop success footer",
  );
}

function normalizesDesktopShellCommands(): void {
  assertEqual(
    normalizeDesktopShellCommand(`/bin/zsh -lc "python3 - <<'PY'\nprint('ok')\nPY"`),
    "python3 - <<'PY'\nprint('ok')\nPY",
    "Codex Desktop shell blocks should strip zsh -lc wrappers",
  );
  assertEqual(
    normalizeDesktopShellCommand(`$ /bin/bash -lc 'git diff -- packages/ui/src/styles/tool-activity.css'`),
    "git diff -- packages/ui/src/styles/tool-activity.css",
    "Codex Desktop shell blocks should strip prompts, quotes, and bash -lc wrappers",
  );
}

function keepsCompletedExecShellCollapsedLikeDesktop(): void {
  const completed = toolActivityDetailViewModel({
    type: "commandExecution",
    id: "exec-completed",
    command: "python3 - <<'PY'",
    status: "completed",
    aggregatedOutput: "print('ok')",
    exitCode: 0,
  });
  const running = toolActivityDetailViewModel({
    type: "commandExecution",
    id: "exec-running",
    command: "npm run dev",
    status: "running",
    aggregatedOutput: "starting",
  });

  assertEqual(
    completed.kind === "exec" ? initialExecShellExpanded(completed) : null,
    false,
    "completed exec shell output should start collapsed like Codex Desktop",
  );
  assertEqual(
    running.kind === "exec" ? initialExecShellExpanded(running) : null,
    true,
    "running exec shell output should stay visible like Codex Desktop",
  );
}

function buildsStatusAwarePatchLabels(): void {
  // codex patch-item-content: the change verb tracks the patch status — present
  // participle while running, "Rejected"/"Stopped …" for declined/aborted, past
  // tense once completed. HiCodex previously always showed the past tense.
  const labelFor = (status: string, kind: string): string => {
    const vm = toolActivityDetailViewModel({
      type: "fileChange",
      id: "patch-x",
      status,
      changes: [{ path: "a.ts", kind: { type: kind } }],
    });
    return vm && vm.kind === "patch" ? String(vm.changes[0]?.action ?? "") : "";
  };
  assertEqual(labelFor("inProgress", "add"), "Creating", "in-progress add should read Creating");
  assertEqual(labelFor("inProgress", "delete"), "Deleting", "in-progress delete should read Deleting");
  assertEqual(labelFor("inProgress", "update"), "Editing", "in-progress update should read Editing");
  assertEqual(labelFor("declined", "add"), "Rejected", "declined change should read Rejected");
  assertEqual(labelFor("interrupted", "delete"), "Stopped deleting", "interrupted delete should read Stopped deleting");
  assertEqual(labelFor("aborted", "update"), "Stopped editing", "aborted update should read Stopped editing");
  assertEqual(labelFor("completed", "add"), "Created", "completed add should still read Created");
  assertEqual(labelFor("completed", "delete"), "Deleted", "completed delete should still read Deleted");
}

function buildsPatchDetails(): void {
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "fileChange",
      id: "patch-1",
      status: "completed",
      changes: [
        { path: "src/app.ts", kind: { type: "update" }, diff: "@@ -1 +1 @@\n-old\n+new" },
      ],
    }),
    {
      kind: "patch",
      id: "patch-1",
      running: false,
      changes: [
        { action: "Edited", kind: "update", path: "src/app.ts", diff: "@@ -1 +1 @@\n-old\n+new" },
      ],
      status: "completed",
    },
    "patch detail should expose action, path, kind, and diff",
  );
}

function buildsMcpDetails(): void {
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "mcpToolCall",
      id: "mcp-pending-1",
      invocation: { server: "github", tool: "list_prs", arguments: { state: "open" } },
      status: "inProgress",
      result: null,
      error: null,
    }),
    {
      kind: "pendingTool",
      id: "mcp-pending-1",
      running: true,
      name: "github:list_prs",
      source: "GitHub",
      label: "List prs",
      status: "inProgress",
    },
    "pending MCP rows should expose Desktop-style source and active tool label",
  );
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "mcpToolCall",
      id: "mcp-1",
      server: "github",
      tool: "list_prs",
      status: "completed",
      arguments: { state: "open" },
      result: { total: 2 },
      error: null,
    }),
    {
      kind: "tool",
      id: "mcp-1",
      running: false,
      name: "github:list_prs",
      toolKind: "MCP",
      argumentsText: "{\n  \"state\": \"open\"\n}",
      resultText: "{\n  \"total\": 2\n}",
      errorText: "",
      status: "completed",
    },
    "MCP detail should expose name, parameters, and result",
  );
  const html = renderToStaticMarkup(createElement(ToolActivityDetail, {
    item: {
      type: "mcpToolCall",
      id: "mcp-render-1",
      server: "github",
      tool: "list_prs",
      status: "completed",
      arguments: { state: "open" },
      result: { content: [], structuredContent: null, _meta: null },
      error: null,
    },
  }));
  assertEqual(
    html.includes("Parameters"),
    false,
    "ordinary MCP detail content should not show arguments in the main expanded surface like Desktop",
  );
  assertEqual(
    html.includes("Tool returned no content"),
    true,
    "ordinary MCP detail content should use Desktop's no-content fallback",
  );
  assertEqual(
    html.includes("Show raw tool call output"),
    true,
    "completed MCP rows should expose Desktop's raw output trigger",
  );
  const runningWithResultHtml = renderToStaticMarkup(createElement(ToolActivityDetail, {
    item: {
      type: "mcpToolCall",
      id: "mcp-running-result-1",
      server: "github",
      tool: "list_prs",
      status: "inProgress",
      completed: false,
      arguments: { state: "open" },
      result: { content: [], structuredContent: null, _meta: null },
      error: null,
    },
  }));
  assertEqual(
    runningWithResultHtml.includes("Tool returned no content"),
    true,
    "running MCP rows with a result should expand like Desktop instead of staying pending",
  );
  assertEqual(
    runningWithResultHtml.includes("Show raw tool call output"),
    true,
    "running MCP rows with a result should expose Desktop's raw output trigger",
  );
  const runningWithoutResultHtml = renderToStaticMarkup(createElement(ToolActivityDetail, {
    item: {
      type: "mcpToolCall",
      id: "mcp-running-empty-1",
      server: "github",
      tool: "list_prs",
      status: "inProgress",
      completed: false,
      arguments: { state: "open" },
      result: null,
      error: null,
    },
  }));
  assertEqual(
    runningWithoutResultHtml.includes("Show raw tool call output"),
    false,
    "running MCP rows without a result should keep Desktop's pending-only surface",
  );
  const textBlockHtml = renderToStaticMarkup(createElement(ToolActivityDetail, {
    item: {
      type: "mcpToolCall",
      id: "mcp-text-block-1",
      server: "github",
      tool: "list_prs",
      status: "completed",
      arguments: {},
      result: {
        content: [{
          type: "text",
          text: "Opened pull requests",
          annotations: { audience: ["assistant"], priority: 0.4, extra: "ignored" },
        }],
        structuredContent: null,
        _meta: null,
      },
      error: null,
    },
  }));
  assertEqual(
    textBlockHtml.includes("plaintext"),
    true,
    "MCP text result blocks should use Desktop's plaintext code-container title",
  );
  assertEqual(
    textBlockHtml.includes("Result"),
    false,
    "MCP text result blocks should not use HiCodex's old Result label",
  );
  assertEqual(
    textBlockHtml.includes("Annotations: audience=assistant; priority=0.4"),
    true,
    "MCP text annotations should be appended to the text block like Desktop",
  );
  const embeddedHtml = renderToStaticMarkup(createElement(ToolActivityDetail, {
    item: {
      type: "mcpToolCall",
      id: "mcp-embedded-block-1",
      server: "github",
      tool: "read_resource",
      status: "completed",
      arguments: {},
      result: {
        content: [{
          type: "embedded_resource",
          resource: {
            uri: "file://report.txt",
            mimeType: "text/plain",
            text: "report body",
            annotations: { audience: ["user"], lastModified: "2026-05-24" },
          },
        }],
        structuredContent: null,
        _meta: null,
      },
      error: null,
    },
  }));
  assertEqual(
    embeddedHtml.includes("URI"),
    true,
    "MCP embedded resources should render Desktop's URI label",
  );
  assertEqual(
    embeddedHtml.indexOf("Annotations") >= 0 && embeddedHtml.indexOf("Annotations") < embeddedHtml.indexOf("Content"),
    true,
    "MCP embedded resource annotations should appear before content like Desktop",
  );
  const unknownHtml = renderToStaticMarkup(createElement(ToolActivityDetail, {
    item: {
      type: "mcpToolCall",
      id: "mcp-unknown-block-1",
      server: "github",
      tool: "unknown_block",
      status: "completed",
      arguments: {},
      result: {
        content: [{ type: "mystery", value: 1 }],
        structuredContent: null,
        _meta: null,
      },
      error: null,
    },
  }));
  assertEqual(
    unknownHtml.includes("Raw block"),
    false,
    "unknown MCP result blocks should not show HiCodex's old Raw block title",
  );
  const desktopUnknownHtml = renderToStaticMarkup(createElement(ToolActivityDetail, {
    item: {
      type: "mcpToolCall",
      id: "mcp-desktop-unknown-block-1",
      server: "github",
      tool: "unknown_block",
      status: "completed",
      arguments: {},
      result: {
        content: [{ type: "unknown", raw: { payload: 1 } }],
        structuredContent: null,
        _meta: null,
      },
      error: null,
    },
  }));
  assertEqual(
    desktopUnknownHtml.includes("&quot;payload&quot;: 1") && !desktopUnknownHtml.includes("&quot;raw&quot;"),
    true,
    "Desktop unknown MCP blocks should render the normalized raw payload",
  );
  const resourceAliasHtml = renderToStaticMarkup(createElement(ToolActivityDetail, {
    item: {
      type: "mcpToolCall",
      id: "mcp-resource-alias-1",
      server: "github",
      tool: "read_resource",
      status: "completed",
      arguments: {},
      result: {
        content: [{ type: "resource", resource: { uri: "file://alias.txt", text: "alias body" } }],
        structuredContent: null,
        _meta: null,
      },
      error: null,
    },
  }));
  assertEqual(
    resourceAliasHtml.includes("file://alias.txt") && resourceAliasHtml.includes("alias body"),
    true,
    "MCP resource content aliases should render through Desktop's embedded resource path",
  );
  const structuredOnlyHtml = renderToStaticMarkup(createElement(ToolActivityDetail, {
    item: {
      type: "mcpToolCall",
      id: "mcp-structured-only-1",
      server: "github",
      tool: "list_prs",
      status: "completed",
      arguments: {},
      result: { content: [], structuredContent: { count: 2 }, _meta: null },
      error: null,
    },
  }));
  assertEqual(
    structuredOnlyHtml.includes("Tool returned no content"),
    false,
    "MCP structuredContent-only results should render JSON instead of Desktop's no-content fallback",
  );
  assertEqual(
    structuredOnlyHtml.includes("Result"),
    false,
    "MCP structuredContent JSON should not use HiCodex's old Result label",
  );
  assertEqual(
    structuredOnlyHtml.includes("&quot;count&quot;: 2"),
    true,
    "MCP structuredContent should render as a standalone JSON code block",
  );
  const structuredWithTextHtml = renderToStaticMarkup(createElement(ToolActivityDetail, {
    item: {
      type: "mcpToolCall",
      id: "mcp-structured-with-text-1",
      server: "github",
      tool: "list_prs",
      status: "completed",
      arguments: {},
      result: {
        content: [{ type: "text", text: "Found pull requests" }],
        structuredContent: { count: 2 },
        _meta: null,
      },
      error: null,
    },
  }));
  assertEqual(
    structuredWithTextHtml.includes("Found pull requests") && structuredWithTextHtml.includes("&quot;count&quot;: 2"),
    true,
    "MCP content blocks and structuredContent should both render like Desktop when they differ",
  );
  const duplicateJsonHtml = renderToStaticMarkup(createElement(ToolActivityDetail, {
    item: {
      type: "mcpToolCall",
      id: "mcp-duplicate-json-1",
      server: "github",
      tool: "list_prs",
      status: "completed",
      arguments: {},
      result: {
        content: [{ type: "text", text: "{\"count\":2}" }],
        structuredContent: { count: 2 },
        _meta: null,
      },
      error: null,
    },
  }));
  assertEqual(
    duplicateJsonHtml.includes("plaintext"),
    false,
    "MCP single JSON text content should be de-duped when it equals structuredContent like Desktop",
  );
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "mcpToolCall",
      id: "mcp-error-1",
      server: "github",
      tool: "list_prs",
      status: "failed",
      arguments: {},
      result: null,
      error: { message: "GitHub token expired" },
    }),
    {
      kind: "tool",
      id: "mcp-error-1",
      running: false,
      name: "github:list_prs",
      toolKind: "MCP",
      argumentsText: "{}",
      resultText: "",
      errorText: "GitHub token expired",
      status: "failed",
    },
    "native v2 MCP errors should render Desktop's message text instead of JSON",
  );
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "mcpToolCall",
      id: "mcp-union-error-1",
      server: "github",
      tool: "list_prs",
      status: "failed",
      arguments: {},
      result: { type: "error", kind: "protocol", error: "GitHub token expired", rawError: { message: "raw" } },
      error: null,
    }),
    {
      kind: "tool",
      id: "mcp-union-error-1",
      running: false,
      name: "github:list_prs",
      toolKind: "MCP",
      argumentsText: "{}",
      resultText: "",
      errorText: "GitHub token expired",
      status: "failed",
    },
    "Desktop MCP error-union results should keep the visible error message",
  );
  const computerUseTimeout = toolActivityDetailViewModel({
    type: "mcpToolCall",
    id: "mcp-computer-use-timeout-1",
    server: "computer-use",
    tool: "list_apps",
    status: "failed",
    arguments: {},
    result: null,
    error: { message: "tool call failed for computer-use/list_apps: timed out awaiting tools/call after 120s" },
  });
  if (computerUseTimeout.kind !== "tool") {
    throw new Error("Computer Use timeout should render as a tool detail");
  }
  assertDeepEqual(
    [
      computerUseTimeout.errorText.includes("timed out awaiting tools/call after 120s"),
      computerUseTimeout.errorText.includes("Computer Use diagnostics"),
      computerUseTimeout.errorText.includes("helper signatures"),
      computerUseTimeout.errorText.includes("Screen Recording"),
      computerUseTimeout.errorText.includes("app approvals"),
    ],
    [true, true, true, true, true],
    "Computer Use MCP timeout should append actionable diagnostics in transcript tool details",
  );
}

function buildsMcpAppDetails(): void {
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "mcpToolCall",
      id: "mcp-app-running-1",
      server: "browser-use",
      tool: "open",
      status: "inProgress",
      arguments: { url: "https://example.com" },
      mcpAppResourceUri: "ui://browser/widget.html",
      result: null,
      error: null,
    }),
    {
      kind: "mcpApp",
      id: "mcp-app-running-1",
      running: true,
      name: "browser-use:open",
      server: "browser-use",
      tool: "open",
      resourceUri: "ui://browser/widget.html",
      inlineFrame: null,
      toolArguments: { url: "https://example.com" },
      toolOutput: null,
      toolResult: null,
      toolResponseMetadata: null,
      argumentsText: "{\n  \"url\": \"https://example.com\"\n}",
      resultText: "",
      errorText: "",
      status: "inProgress",
    },
    "running MCP calls with an app resource URI should use Desktop's app widget path instead of pending-tool rows",
  );

  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "mcpToolCall",
      id: "mcp-app-1",
      server: "browser-use",
      tool: "open",
      status: "completed",
      arguments: { url: "https://example.com" },
      mcpAppResourceUri: "ui://browser/widget.html",
      result: {
        content: [{ type: "text", text: "Opened page" }],
        structuredContent: null,
        _meta: null,
      },
      error: null,
    }),
    {
      kind: "mcpApp",
      id: "mcp-app-1",
      running: false,
      name: "browser-use:open",
      server: "browser-use",
      tool: "open",
      resourceUri: "ui://browser/widget.html",
      inlineFrame: null,
      toolArguments: { url: "https://example.com" },
      toolOutput: null,
      toolResult: {
        content: [{ type: "text", text: "Opened page" }],
        structuredContent: null,
        _meta: null,
      },
      toolResponseMetadata: null,
      argumentsText: "{\n  \"url\": \"https://example.com\"\n}",
      resultText: "Opened page",
      errorText: "",
      status: "completed",
    },
    "MCP calls with an app resource URI should render as MCP app details instead of raw JSON",
  );

  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "mcpToolCall",
      id: "mcp-app-meta-1",
      server: "figma",
      tool: "selection",
      status: "completed",
      arguments: {},
      result: {
        content: [],
        structuredContent: null,
        _meta: {
          ui: { resourceUri: "ui://figma/selection.html" },
        },
      },
      error: null,
    }),
    {
      kind: "mcpApp",
      id: "mcp-app-meta-1",
      running: false,
      name: "figma:selection",
      server: "figma",
      tool: "selection",
      resourceUri: "ui://figma/selection.html",
      inlineFrame: null,
      toolArguments: {},
      toolOutput: null,
      toolResult: {
        content: [],
        structuredContent: null,
        _meta: {
          ui: { resourceUri: "ui://figma/selection.html" },
        },
      },
      toolResponseMetadata: {
        ui: { resourceUri: "ui://figma/selection.html" },
      },
      argumentsText: "{}",
      resultText: "",
      errorText: "",
      status: "completed",
    },
    "MCP app resource URI should be detected from Desktop-style result metadata",
  );
  const html = renderToStaticMarkup(createElement(ToolActivityDetail, {
    item: {
      type: "mcpToolCall",
      id: "mcp-app-render-1",
      server: "browser-use",
      tool: "open",
      status: "completed",
      arguments: { url: "https://example.com" },
      mcpAppResourceUri: "ui://browser/widget.html",
      result: { content: [], structuredContent: null, _meta: null },
      error: null,
    },
  }));
  assertEqual(
    html.includes("Parameters"),
    false,
    "MCP app rows should keep arguments out of the main content area like Desktop",
  );
  assertEqual(
    html.includes("Show raw tool call output"),
    true,
    "completed MCP app rows should expose Desktop's raw output trigger",
  );
  const inlineFrameHtml = renderToStaticMarkup(createElement(ToolActivityDetail, {
    item: {
      type: "mcpToolCall",
      id: "mcp-app-inline-render-1",
      server: "browser-use",
      tool: "open",
      status: "completed",
      arguments: { url: "https://example.com" },
      mcpAppResourceUri: "ui://browser/widget.html",
      result: {
        content: [{
          type: "embedded_resource",
          resource: {
            uri: "ui://browser/widget.html",
            mimeType: "text/html",
            text: "<main>Browser</main>",
          },
        }],
        structuredContent: null,
        _meta: null,
      },
      error: null,
    },
  }));
  assertEqual(
    inlineFrameHtml.includes("hc-tool-raw-output is-inline-app"),
    true,
    "inline MCP apps should place Desktop's raw output trigger over the app frame",
  );
}

function normalizesMcpAppToolPayloadsLikeDesktop(): void {
  const toolArguments = { url: "https://example.com" };
  assertEqual(
    mcpAppToolInputFromArguments(toolArguments),
    toolArguments,
    "MCP app toolInput should keep object arguments like Desktop",
  );
  assertDeepEqual(
    mcpAppToolInputFromArguments("raw args"),
    null,
    "MCP app toolInput should be null for non-object arguments like Desktop",
  );
  assertDeepEqual(
    mcpAppToolInputFromArguments(["url"]),
    null,
    "MCP app toolInput should reject arrays like Desktop",
  );
  assertDeepEqual(
    mcpAppToolOutputFromResult({
      content: [{ type: "text", text: "{\"ignored\":true}" }],
      structuredContent: { pageTitle: "Example" },
    }),
    { pageTitle: "Example" },
    "MCP app toolOutput should prefer Desktop structuredContent objects",
  );
  assertDeepEqual(
    mcpAppToolOutputFromResult({
      content: [],
      structured_content: { pageTitle: "Snake case" },
    }),
    { pageTitle: "Snake case" },
    "MCP app toolOutput should accept protocol snake-case structured_content objects",
  );
  assertDeepEqual(
    mcpAppToolOutputFromResult({
      content: [{ type: "text", text: "{\"pageTitle\":\"From JSON text\"}" }],
      structuredContent: null,
    }),
    { pageTitle: "From JSON text" },
    "MCP app toolOutput should parse Desktop's single text JSON fallback",
  );
  assertDeepEqual(
    mcpAppToolOutputFromResult({
      content: [{ type: "text", text: "{\"a\":1}" }, { type: "text", text: "{\"b\":2}" }],
      structuredContent: null,
    }),
    null,
    "MCP app toolOutput should be null for multi-content results like Desktop",
  );
  assertDeepEqual(
    mcpAppToolOutputFromResult({
      content: [{ type: "text", text: "[1,2,3]" }],
      structuredContent: null,
    }),
    null,
    "MCP app toolOutput should reject non-object JSON values like Desktop",
  );
}

function normalizesMcpAppBackgroundColorLikeDesktop(): void {
  assertEqual(
    mcpAppBackgroundColorFromValue("#fff"),
    "#fff",
    "MCP app notifyBackgroundColor should accept Desktop string payloads",
  );
  assertDeepEqual(
    mcpAppBackgroundColorFromValue({ color: "#fff" }),
    null,
    "MCP app notifyBackgroundColor should ignore non-string payloads like Desktop",
  );
}

function normalizesMcpAppWidgetStateLikeDesktop(): void {
  assertDeepEqual(
    mcpAppWidgetStateFromValue({ selectedId: "node-1" }),
    { selectedId: "node-1" },
    "MCP app updateWidgetState should accept Desktop string-key object state",
  );
  assertDeepEqual(
    mcpAppWidgetStateFromValue(["node-1"]),
    null,
    "MCP app updateWidgetState should reject array state like Desktop",
  );
  assertDeepEqual(
    mcpAppWidgetStateFromValue("node-1"),
    null,
    "MCP app updateWidgetState should reject scalar state like Desktop",
  );
  assertDeepEqual(
    mcpAppWidgetStateFromBridgeArgs([{ selectedId: "old" }, { selectedId: "new" }, { ignored: true }]),
    { selectedId: "new" },
    "MCP app updateWidgetState should store Desktop's second argument when extra metadata is present",
  );
}

function buildsMcpAppWidgetDataUpdatesLikeDesktop(): void {
  const detail = toolActivityDetailViewModel({
    type: "mcpToolCall",
    id: "mcp-app-update-1",
    server: "browser-use",
    tool: "open",
    status: "completed",
    arguments: { url: "https://example.com" },
    mcpAppResourceUri: "ui://browser/widget.html",
    result: {
      content: [{ type: "text", text: "Opened page" }],
      structured_content: { pageTitle: "Example" },
      _meta: { trace: "abc" },
    },
    error: null,
  });
  if (detail.kind !== "mcpApp") throw new Error("MCP app widget data fixture should produce app detail");

  const toolResult = {
    content: [{ type: "text", text: "Opened page" }],
    structuredContent: { pageTitle: "Example" },
    _meta: { trace: "abc" },
  };
  assertDeepEqual(
    mcpAppToolResultForWidget(detail.toolResult, detail.toolResponseMetadata),
    toolResult,
    "MCP app notifyMcpAppsToolResult should expose Desktop content, structuredContent, and metadata",
  );
  assertDeepEqual(
    mcpAppWidgetDataUpdatePayload(detail, { selectedId: "node-1" }),
    {
      toolInput: { url: "https://example.com" },
      toolOutput: { pageTitle: "Example" },
      toolResponseMetadata: { trace: "abc" },
      toolResult,
      viewParams: { pageTitle: "Example" },
      widgetId: "hicodex-inline-widget",
      widgetState: { selectedId: "node-1" },
    },
    "MCP app setWidgetData should preserve widget state while pushing Desktop-style tool data",
  );
}

function buildsMcpAppWidgetViewUpdatesLikeDesktop(): void {
  const detail = toolActivityDetailViewModel({
    type: "mcpToolCall",
    id: "mcp-app-view-1",
    server: "browser-use",
    tool: "open",
    status: "completed",
    arguments: {},
    mcpAppResourceUri: "ui://browser/widget.html",
    result: {
      content: [],
      structuredContent: { panel: "browser" },
    },
    error: null,
  });
  if (detail.kind !== "mcpApp") throw new Error("MCP app widget view fixture should produce app detail");

  assertEqual(
    mcpAppDisplayModeFromValue({ mode: "fullscreen" }, "inline"),
    "fullscreen",
    "MCP app requestDisplayMode should accept Desktop object payloads",
  );
  assertEqual(
    mcpAppDisplayModeFromValue({ mode: "sideways" }, "inline"),
    "inline",
    "MCP app requestDisplayMode should keep the current mode for invalid payloads",
  );
  assertDeepEqual(
    mcpAppWidgetViewPayload(detail, "fullscreen"),
    {
      displayMode: "fullscreen",
      isTombstone: false,
      viewParams: { panel: "browser" },
      widgetId: "hicodex-inline-widget",
    },
    "MCP app setWidgetView should push Desktop-style display mode and view params",
  );
}

function parsesMcpAppResourceFrames(): void {
  const emptyCsp = {
    baseUriDomains: [],
    connectDomains: [],
    frameDomains: [],
    includeDefaultDomains: false,
    isTrusted: false,
    resourceDomains: [],
  };
  assertDeepEqual(
    mcpAppFrameFromResourceReadResult({
      contents: [{
        uri: "ui://browser/widget.html",
        mimeType: "text/html;profile=mcp-app",
        text: "<main>Browser</main>",
        _meta: {
          "openai/widgetHeightHint": 480,
          "openai/widgetPrefersBorder": true,
        },
      }],
    }),
    {
      csp: emptyCsp,
      html: "<main>Browser</main>",
      heightPx: 480,
      mimeType: "text/html;profile=mcp-app",
      prefersBorder: true,
      widgetDomain: null,
    },
    "MCP app HTML resources should become iframe view models with Desktop widget metadata",
  );
  assertEqual(
    mcpAppCspMetaContent(emptyCsp, "empty-csp-nonce").includes("connect-src 'none'"),
    true,
    "MCP app frames without widget CSP metadata should get a default deny connect-src",
  );
  assertEqual(
    mcpAppCspMetaContent(emptyCsp, "empty-csp-nonce").includes("script-src 'nonce-empty-csp-nonce' blob:"),
    true,
    "MCP app frames without widget CSP metadata should restrict scripts to the nonce-bearing bridge and blob URLs",
  );
  assertDeepEqual(
    mcpAppFrameFromResourceReadResult({
      contents: [{
        uri: "ui://browser/csp.html",
        mimeType: "text/html;profile=mcp-app",
        text: "<main>CSP</main>",
        _meta: {
          ui: {
            csp: {
              baseUriDomains: ["base.example.com"],
              connectDomains: ["api.example.com", "localhost:8443", "127.0.0.1", "bad path"],
              frameDomains: ["%2a.frames.example.com"],
              resourceDomains: ["cdn.example.com", "http://not-https.example.com", "*.assets.example.com", "widgets.local"],
            },
            domain: "widgets.example.com",
          },
          "openai/widgetCSP": {
            connect_domains: ["ignored.example.com"],
          },
          "openai/widgetDomain": "fallback.example.com",
        },
      }],
    }),
    {
      csp: {
        baseUriDomains: ["https://base.example.com"],
        connectDomains: ["https://api.example.com", "https://cdn.example.com", "https://*.assets.example.com"],
        frameDomains: ["https://*.frames.example.com"],
        includeDefaultDomains: false,
        isTrusted: true,
        resourceDomains: ["https://cdn.example.com", "https://*.assets.example.com"],
      },
      html: "<main>CSP</main>",
      heightPx: 240,
      mimeType: "text/html;profile=mcp-app",
      prefersBorder: false,
      widgetDomain: "widgets.example.com",
    },
    "MCP app resources should parse Desktop ui.csp and ui.domain metadata",
  );
  assertDeepEqual(
    mcpAppFrameFromResourceReadResult({
      contents: [{
        uri: "ui://browser/openai-csp.html",
        mimeType: "text/html",
        text: "<main>OpenAI CSP</main>",
        _meta: {
          "openai/widgetCSP": {
            base_uri_domains: ["base.example.com"],
            connect_domains: ["api.example.com"],
            frame_domains: ["frame.example.com"],
            resource_domains: ["cdn.example.com"],
          },
          "openai/widgetDomain": "fallback.example.com",
        },
      }],
    })?.csp,
    {
      baseUriDomains: ["https://base.example.com"],
      connectDomains: ["https://api.example.com", "https://cdn.example.com"],
      frameDomains: ["https://frame.example.com"],
      includeDefaultDomains: false,
      isTrusted: true,
      resourceDomains: ["https://cdn.example.com"],
    },
    "MCP app resources should parse Desktop openai/widgetCSP snake-case metadata",
  );
  assertDeepEqual(
    mcpAppFrameFromResourceReadResult({
      contents: [{
        uri: "ui://browser/data.json",
        mimeType: "application/json",
        text: "{}",
      }],
    }),
    null,
    "non-HTML MCP resources should not become MCP app iframes",
  );
  assertDeepEqual(
    mcpAppFrameFromResourceReadResult({
      contents: [{
        uri: "ui://browser/default.html",
        mimeType: "text/html",
        text: "<main>Default</main>",
      }],
    }),
    {
      csp: emptyCsp,
      html: "<main>Default</main>",
      heightPx: 240,
      mimeType: "text/html",
      prefersBorder: false,
      widgetDomain: null,
    },
    "MCP app frames should use Desktop's 240px default height",
  );
  assertDeepEqual(
    mcpAppFrameFromResourceReadResult({
      contents: [{
        uri: "ui://browser/small.html",
        mimeType: "text/html",
        text: "<main>Small</main>",
        _meta: { "openai/widgetHeightHint": 120 },
      }],
    })?.heightPx,
    200,
    "MCP app frames should clamp to Desktop's 200px minimum height",
  );
  assertDeepEqual(
    mcpAppFrameFromResourceReadResult({
      contents: [{
        uri: "ui://browser/tall.html",
        mimeType: "text/html",
        text: "<main>Tall</main>",
        _meta: { "openai/widgetHeightHint": 900 },
      }],
    })?.heightPx,
    720,
    "MCP app frames should clamp to Desktop's 720px maximum height",
  );
  assertEqual(
    mcpAppHtmlTooLarge("x".repeat(10_000_001)),
    true,
    "MCP app HTML over Desktop's 10MB limit should be rejected before iframe rendering",
  );
}

function buildsMcpAppSandboxSrcDoc(): void {
  const frame = mcpAppFrameFromResourceReadResult({
    contents: [{
      uri: "ui://browser/csp.html",
      mimeType: "text/html;profile=mcp-app",
      text: "<html><head><title>Widget</title></head><body><main>Widget</main></body></html>",
      _meta: {
        ui: {
          csp: {
            connectDomains: ["api.example.com"],
            resourceDomains: ["cdn.example.com"],
          },
        },
      },
    }],
  });
  if (!frame) throw new Error("MCP app sandbox fixture should produce a frame");
  const detail = toolActivityDetailViewModel({
    type: "mcpToolCall",
    id: "mcp-app-srcdoc-1",
    server: "browser-use",
    tool: "open",
    status: "completed",
    arguments: { url: "https://example.com" },
    mcpAppResourceUri: "ui://browser/csp.html",
    result: {
      content: [{ type: "text", text: "Opened page" }],
      structuredContent: { ok: true },
      _meta: { trace: "abc" },
    },
    error: null,
  });
  if (detail.kind !== "mcpApp") throw new Error("MCP app sandbox fixture should produce app detail");

  const srcDoc = mcpAppSandboxSrcDoc(frame, detail, "test-bridge-nonce");
  assertEqual(
    srcDoc.includes("Content-Security-Policy"),
    true,
    "MCP app srcDoc should inject a best-effort CSP meta tag from Desktop widget metadata",
  );
  assertEqual(
    srcDoc.startsWith("<!doctype html><html><head><meta http-equiv=\"Content-Security-Policy\""),
    true,
    "MCP app srcDoc should install CSP before any widget head or body markup",
  );
  assertEqual(
    srcDoc.includes("'unsafe-inline'"),
    false,
    "MCP app CSP should not allow unsafe inline scripts or styles",
  );
  assertEqual(
    srcDoc.includes("'unsafe-eval'"),
    false,
    "MCP app CSP should not allow unsafe eval",
  );
  assertEqual(
    srcDoc.includes("script-src 'nonce-test-bridge-nonce' blob: https://cdn.example.com"),
    true,
    "MCP app CSP should allow only the nonce-bearing host bridge plus declared resource scripts",
  );
  assertEqual(
    srcDoc.includes("<script nonce=\"test-bridge-nonce\">"),
    true,
    "MCP app bridge script should carry the CSP nonce",
  );
  assertEqual(
    srcDoc.includes("window.openai"),
    true,
    "MCP app srcDoc should expose a Desktop-style window.openai host bridge before widget scripts run",
  );
  assertEqual(
    srcDoc.includes("serverTools"),
    true,
    "MCP app srcDoc should advertise Desktop-style serverTools host capability",
  );
  assertEqual(
    srcDoc.includes("setWidgetData"),
    true,
    "MCP app srcDoc should accept Desktop-style setWidgetData host updates",
  );
  assertEqual(
    srcDoc.includes("notifyMcpAppsToolResult"),
    true,
    "MCP app srcDoc should accept Desktop-style tool-result host notifications",
  );
  assertEqual(
    srcDoc.includes("setWidgetView"),
    true,
    "MCP app srcDoc should accept Desktop-style display mode host updates",
  );
  assertEqual(
    srcDoc.includes("\"toolInput\":{\"url\":\"https://example.com\"}"),
    true,
    "MCP app srcDoc should pass Desktop-style object toolInput into the widget bridge",
  );
  assertEqual(
    srcDoc.includes("\"viewParams\":{\"ok\":true}"),
    true,
    "MCP app srcDoc should expose Desktop-style viewParams from tool output",
  );
  assertEqual(
    srcDoc.indexOf("Content-Security-Policy") < srcDoc.indexOf("<title>Widget</title>"),
    true,
    "MCP app CSP should be inserted at the start of the existing head",
  );
  assertEqual(
    mcpAppCspMetaContent(frame.csp, "test-bridge-nonce").includes("connect-src https://api.example.com https://cdn.example.com"),
    true,
    "MCP app CSP meta should mirror Desktop connect/resource domain propagation",
  );
  assertEqual(
    srcDoc.includes("event.source !== window.parent"),
    true,
    "MCP app bridge init should validate the host window source",
  );
  assertEqual(
    srcDoc.includes("data.nonce !== initial.bridgeNonce"),
    true,
    "MCP app bridge init should validate the per-frame nonce",
  );
  assertEqual(
    srcDoc.includes("normalizeWidgetState(args.length > 1 ? args[1] : args[0])"),
    true,
    "MCP app bridge updateWidgetState should mirror Desktop's second-argument state semantics",
  );
}

function pinsMcpAppIframeSandboxPolicy(): void {
  assertEqual(
    MCP_APP_IFRAME_SANDBOX_POLICY,
    "allow-forms allow-scripts",
    "MCP app iframe sandbox should allow script execution without same-origin, popups, or direct downloads",
  );
  assertEqual(
    MCP_APP_IFRAME_SANDBOX_POLICY.includes("allow-downloads"),
    false,
    "MCP app widgets should download only through the host bridge",
  );
  assertEqual(
    MCP_APP_IFRAME_SANDBOX_POLICY.includes("allow-same-origin"),
    false,
    "MCP app widgets should keep an opaque sandbox origin",
  );
  assertEqual(
    MCP_APP_IFRAME_SANDBOX_POLICY.includes("allow-popups"),
    false,
    "MCP app widgets should open links only through the validated host bridge",
  );
}

function buildsDynamicToolDetails(): void {
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "dynamicToolCall",
      id: "dynamic-1",
      namespace: "functions",
      tool: "exec_command",
      status: "running",
      arguments: { cmd: "git status --short" },
      contentItems: [{ text: "M file" }],
    }),
    {
      kind: "tool",
      id: "dynamic-1",
      running: true,
      name: "functions.exec_command",
      toolKind: "Tool",
      argumentsText: "{\n  \"cmd\": \"git status --short\"\n}",
      resultText: "[\n  {\n    \"text\": \"M file\"\n  }\n]",
      errorText: "",
      status: "running",
    },
    "dynamic tool detail should expose namespaced name and content result",
  );
}

function buildsAutoReviewDetails(): void {
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "automatic-approval-review",
      id: "auto-review-1",
      status: "approved",
      riskLevel: "low",
      rationale: "Command matches policy",
    }),
    {
      kind: "autoReview",
      id: "auto-review-1",
      running: false,
      title: "Auto-review approved",
      body: "Command matches policy",
      highRiskDenied: false,
    },
    "auto-review detail should use Desktop's collapsed title and rationale body",
  );
  const html = renderToStaticMarkup(createElement(ToolActivityDetail, {
    item: {
      type: "automatic-approval-review",
      id: "auto-review-render-1",
      status: "denied",
      riskLevel: "high",
      rationale: "",
    },
  }));
  assertEqual(
    html.includes("Auto-review denied high risk"),
    true,
    "auto-review detail should render Desktop's high-risk denied title",
  );
  assertEqual(
    html.includes("Status: denied"),
    false,
    "auto-review detail should not render HiCodex's old status/risk code body",
  );
  assertEqual(
    html.includes('aria-expanded="false"'),
    true,
    "auto-review detail body should start collapsed like Desktop's activity disclosure",
  );
}

function buildsWebSearchDetails(): void {
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "webSearch",
      id: "web-1",
      query: "fallback query",
      action: { type: "findInPage", pattern: "Codex", url: "https://example.com" },
      completed: true,
    }),
    {
      kind: "webSearch",
      id: "web-1",
      running: false,
      detail: "'Codex' in https://example.com",
      faviconUrl: "https://www.google.com/s2/favicons?domain=example.com&sz=32",
    },
    "web search detail should use Desktop action detail before query fallback",
  );
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "webSearch",
      id: "web-2",
      query: "Codex Desktop site:platform.openai.com OR site:developers.openai.com",
      action: { type: "search", query: "Codex Desktop site:platform.openai.com OR site:developers.openai.com" },
      completed: true,
    }),
    {
      kind: "webSearch",
      id: "web-2",
      running: false,
      detail: "Codex Desktop | platform.openai.com · developers.openai.com",
      faviconUrl: "https://www.google.com/s2/favicons?domain=openai.com&sz=32",
    },
    "web search detail should expose Desktop-style site suffix and favicon",
  );
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "webSearch",
      id: "web-3",
      query: "latest from https://docs.github.com/en/actions",
      completed: true,
    }),
    {
      kind: "webSearch",
      id: "web-3",
      running: false,
      detail: "latest from https://docs.github.com/en/actions",
      faviconUrl: "https://www.google.com/s2/favicons?domain=github.com&sz=32",
    },
    "web search fallback query should infer URL favicons like Codex Desktop",
  );
}

function buildsMultiAgentDetails(): void {
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "collabAgentToolCall",
      id: "agent-1",
      tool: "sendInput",
      status: "failed",
      senderThreadId: "parent",
      receiverThreadIds: ["agent-1234567890abcdef"],
      prompt: "Continue",
      model: null,
      reasoningEffort: null,
      agentsStates: {
        "agent-1234567890abcdef": { status: "errored", message: "tool failed" },
      },
    }),
    {
      kind: "multiAgent",
      id: "agent-1",
      running: false,
      rows: [
        {
          key: "row-agent-1-agent-1234567890abcdef",
          parts: [
            { kind: "text", text: "Failed to message " },
            {
              kind: "agent",
              color: multiAgentAgentColor("agent-1234567890abcdef"),
              label: "agent-agent-12",
              threadId: "agent-1234567890abcdef",
              title: null,
              model: null,
              role: null,
            },
            { kind: "text", text: ": " },
            { kind: "prompt", text: "Continue" },
          ],
          text: "Failed to message agent-agent-12: Continue",
        },
      ],
    },
    "multi-agent detail should expose Desktop row text and target thread id",
  );
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "collabAgentToolCall",
      id: "agent-2",
      tool: "spawnAgent",
      status: "inProgress",
      senderThreadId: "parent",
      receiverThreadIds: ["agent-fedcba0987654321"],
      prompt: null,
      model: null,
      reasoningEffort: null,
      agentsStates: {
        "agent-fedcba0987654321": { status: "running", message: "reading files" },
      },
    }),
    {
      kind: "multiAgent",
      id: "agent-2",
      running: true,
      rows: [
        {
          key: "row-agent-2-agent-fedcba0987654321",
          parts: [
            { kind: "text", text: "Spawning " },
            {
              kind: "agent",
              color: multiAgentAgentColor("agent-fedcba0987654321"),
              label: "agent-agent-fe",
              threadId: "agent-fedcba0987654321",
              title: null,
              model: null,
              role: null,
            },
            { kind: "text", text: " (running: reading files)" },
          ],
          text: "Spawning agent-agent-fe (running: reading files)",
        },
      ],
    },
    "multi-agent detail should include state suffix",
  );
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "collabAgentToolCall",
      id: "agent-3",
      tool: "closeAgent",
      status: "completed",
      senderThreadId: "parent",
      receiverThreadIds: ["agent-fedcba0987654321"],
      prompt: "Close it",
      model: null,
      reasoningEffort: null,
      agentsStates: {
        "agent-fedcba0987654321": { status: "shutdown", message: null },
      },
    }),
    {
      kind: "multiAgent",
      id: "agent-3",
      running: false,
      rows: [
        {
          key: "row-agent-3-agent-fedcba0987654321",
          parts: [
            { kind: "text", text: "Closed " },
            {
              kind: "agent",
              color: multiAgentAgentColor("agent-fedcba0987654321"),
              label: "agent-agent-fe",
              threadId: "agent-fedcba0987654321",
              title: null,
              model: null,
              role: null,
            },
          ],
          text: "Closed agent-agent-fe",
        },
        {
          key: "meta-prompt-agent-3",
          parts: [
            { kind: "text", text: "Input: " },
            { kind: "prompt", text: "Close it" },
          ],
          text: "Input: Close it",
        },
      ],
    },
    "multi-agent detail should include generic input metadata",
  );
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "collabAgentToolCall",
      id: "agent-4",
      tool: "spawnAgent",
      status: "completed",
      senderThreadId: "parent",
      receiverThreadIds: ["agent-ui-123456"],
      receiverThreads: [
        {
          threadId: "agent-ui-123456",
          thread: {
            agentNickname: "@Explorer",
            agentRole: "explorer",
          },
        },
      ],
      prompt: "Inspect UI",
      model: "gpt-5.4",
      reasoningEffort: null,
      agentsStates: {},
    }),
    {
      kind: "multiAgent",
      id: "agent-4",
      running: false,
      rows: [
        {
          key: "row-agent-4-agent-ui-123456",
          parts: [
            { kind: "text", text: "Created " },
            {
              kind: "agent",
              color: multiAgentAgentColor("agent-ui-123456"),
              label: "Explorer (explorer)",
              threadId: "agent-ui-123456",
              title: "Uses gpt-5.4",
              model: "gpt-5.4",
              role: "explorer",
            },
            { kind: "text", text: " with the instructions: " },
            { kind: "prompt", text: "Inspect UI" },
          ],
          text: "Created Explorer (explorer) with the instructions: Inspect UI",
        },
      ],
    },
    "multi-agent detail should use receiver thread nickname, role, color, and model title",
  );
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "collabAgentToolCall",
      id: "agent-5",
      tool: "spawnAgent",
      status: "completed",
      senderThreadId: "parent",
      receiverThreadIds: ["019e57e100006da4"],
      receiverThreads: [
        {
          threadId: "019e57e100006da4",
          thread: {
            source: {
              subAgent: {
                thread_spawn: {
                  parent_thread_id: "parent",
                  depth: 1,
                  agent_nickname: "@Weather",
                  agent_role: "researcher",
                },
              },
            },
          },
        },
      ],
      prompt: "Check forecast",
      model: null,
      reasoningEffort: null,
      agentsStates: {},
    }),
    {
      kind: "multiAgent",
      id: "agent-5",
      running: false,
      rows: [
        {
          key: "row-agent-5-019e57e100006da4",
          parts: [
            { kind: "text", text: "Created " },
            {
              kind: "agent",
              color: multiAgentAgentColor("019e57e100006da4"),
              label: "Weather (researcher)",
              threadId: "019e57e100006da4",
              title: null,
              model: null,
              role: "researcher",
            },
            { kind: "text", text: " with the instructions: " },
            { kind: "prompt", text: "Check forecast" },
          ],
          text: "Created Weather (researcher) with the instructions: Check forecast",
        },
      ],
    },
    "multi-agent detail should read Desktop thread_spawn nickname and role from thread source",
  );
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
