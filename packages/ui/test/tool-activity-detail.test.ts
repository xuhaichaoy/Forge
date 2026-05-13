import {
  execShellCopyText,
  initialExecShellExpanded,
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
  mcpAppWidgetStateFromValue,
  multiAgentAgentColor,
  normalizeDesktopShellCommand,
  toolActivityDetailViewModel,
} from "../src/components/tool-activity-detail";

export default function runToolActivityDetailTests(): void {
  buildsExecDetails();
  normalizesDesktopShellCommands();
  keepsCompletedExecShellCollapsedLikeDesktop();
  buildsDesktopShellCopyText();
  buildsDesktopLightweightExecRows();
  buildsPatchDetails();
  buildsMcpDetails();
  buildsMcpAppDetails();
  normalizesMcpAppToolPayloadsLikeDesktop();
  normalizesMcpAppBackgroundColorLikeDesktop();
  normalizesMcpAppWidgetStateLikeDesktop();
  buildsMcpAppWidgetDataUpdatesLikeDesktop();
  buildsMcpAppWidgetViewUpdatesLikeDesktop();
  parsesMcpAppResourceFrames();
  buildsMcpAppSandboxSrcDoc();
  buildsDynamicToolDetails();
  buildsAutoReviewDetails();
  buildsHookDetails();
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
      parsedCmd: { type: "read", path: "src/app.ts", isFinished: true },
    }),
    {
      kind: "execSummary",
      id: "read-1",
      running: false,
      label: "Read src/app.ts",
    },
    "read commands should render as Desktop lightweight command rows",
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
        { action: "Edited", path: "src/app.ts", diff: "@@ -1 +1 @@\n-old\n+new" },
      ],
      status: "completed",
    },
    "patch detail should expose action, path, and diff",
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
      label: "Calling list_prs",
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
      resultText: "{\n  \"content\": [],\n  \"structuredContent\": null,\n  \"_meta\": {\n    \"ui\": {\n      \"resourceUri\": \"ui://figma/selection.html\"\n    }\n  }\n}",
      errorText: "",
      status: "completed",
    },
    "MCP app resource URI should be detected from Desktop-style result metadata",
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
              connectDomains: ["api.example.com", "bad path"],
              frameDomains: ["%2a.frames.example.com"],
              resourceDomains: ["cdn.example.com", "http://not-https.example.com", "*.assets.example.com"],
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

  const srcDoc = mcpAppSandboxSrcDoc(frame, detail);
  assertEqual(
    srcDoc.includes("Content-Security-Policy"),
    true,
    "MCP app srcDoc should inject a best-effort CSP meta tag from Desktop widget metadata",
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
    mcpAppCspMetaContent(frame.csp).includes("connect-src 'self' https://api.example.com https://cdn.example.com"),
    true,
    "MCP app CSP meta should mirror Desktop connect/resource domain propagation",
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
      kind: "text",
      id: "auto-review-1",
      running: false,
      title: "Auto-review",
      text: "Status: approved\nRisk: low\nRationale: Command matches policy",
    },
    "auto-review detail should preserve status, risk, and rationale",
  );
}

function buildsHookDetails(): void {
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "hook",
      id: "hook-1",
      key: "post-command",
      run: { status: "completed", command: "echo ok" },
    }),
    {
      kind: "text",
      id: "hook-1",
      running: false,
      title: "Hook",
      text: "Status: completed\nKey: post-command\nCommand: echo ok",
    },
    "hook detail should preserve run status, key, and command",
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
              label: "agent-12...cdef",
              threadId: "agent-1234567890abcdef",
              title: null,
              model: null,
              role: null,
            },
            { kind: "text", text: ": " },
            { kind: "prompt", text: "Continue" },
          ],
          text: "Failed to message agent-12...cdef: Continue",
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
              label: "agent-fe...4321",
              threadId: "agent-fedcba0987654321",
              title: null,
              model: null,
              role: null,
            },
            { kind: "text", text: " (running: reading files)" },
          ],
          text: "Spawning agent-fe...4321 (running: reading files)",
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
              label: "agent-fe...4321",
              threadId: "agent-fedcba0987654321",
              title: null,
              model: null,
              role: null,
            },
          ],
          text: "Closed agent-fe...4321",
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
