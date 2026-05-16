import {
  MCP_APP_BRIDGE_INVALID_PARAMS,
  MCP_APP_BRIDGE_METHOD_NOT_FOUND,
  MCP_APP_BRIDGE_USER_CANCELLED,
  mcpAppBridgeError,
  mcpAppBridgeUserCancelledError,
  mcpAppFileDownloadRequest,
  mcpAppExternalHref,
  mcpAppFollowUpSource,
  mcpAppMcpProxyRequest,
  mcpAppFollowUpMessageRequest,
  mcpAppResourceTemplatesListResponse,
  mcpAppResourcesListResponse,
  mcpAppToolCallAllowed,
  mcpAppToolCallRequest,
  mcpAppToolCallRequestFromBridgeArgs,
  mcpAppToolsListResponse,
  mcpServerStatusFromListResult,
  serializeMcpAppBridgeError,
} from "../src/state/mcp-app-host";

export default function runMcpAppHostTests(): void {
  parsesDesktopMcpProxyRequests();
  parsesDesktopFileDownloadRequests();
  parsesDesktopFollowUpRequests();
  projectsFollowUpSource();
  parsesDesktopHostToolCalls();
  serializesDesktopBridgeErrors();
  serializesUserCancelledBridgeErrors();
  projectsServerInventoryForBridgeResponses();
  validatesExternalLinks();
}

function parsesDesktopMcpProxyRequests(): void {
  assertDeepEqual(
    mcpAppMcpProxyRequest({ method: "resources/read", params: { uri: "ui://app/widget.html" } }),
    { method: "resources/read", params: { uri: "ui://app/widget.html" } },
    "MCP app bridge should parse Desktop-style callMcp JSON-RPC requests",
  );
  assertDeepEqual(
    mcpAppMcpProxyRequest({ params: {} }),
    null,
    "MCP app bridge should reject callMcp requests without a method",
  );
}

function parsesDesktopFileDownloadRequests(): void {
  const blob = new Blob(["hello"], { type: "text/plain" });
  const request = mcpAppFileDownloadRequest({ blob, name: " report.txt " });
  assertEqual(
    request?.blob,
    blob,
    "MCP app ui/download-file should keep the Desktop Blob payload",
  );
  assertEqual(
    request?.name,
    "report.txt",
    "MCP app ui/download-file should trim the Desktop download name",
  );
  assertDeepEqual(
    mcpAppFileDownloadRequest({ blob: "hello", name: "report.txt" }),
    null,
    "MCP app ui/download-file should reject non-Blob payloads",
  );
  assertDeepEqual(
    mcpAppFileDownloadRequest({ blob, name: " " }),
    null,
    "MCP app ui/download-file should reject blank filenames",
  );
}

function parsesDesktopFollowUpRequests(): void {
  assertDeepEqual(
    mcpAppFollowUpMessageRequest({ prompt: " check this " }),
    { prompt: "check this" },
    "MCP app follow-up requests should parse Desktop's { prompt } payload",
  );
  assertDeepEqual(
    mcpAppFollowUpMessageRequest({ prompt: " " }),
    null,
    "MCP app follow-up requests should reject empty prompts",
  );
}

function projectsFollowUpSource(): void {
  assertDeepEqual(
    mcpAppFollowUpSource({ threadId: "thread-123", server: "figma", tool: "inspect" }),
    { server: "figma", threadId: "thread-123", tool: "inspect" },
    "MCP app follow-up dialog source should preserve thread, server, and tool",
  );
  assertDeepEqual(
    mcpAppFollowUpSource({ threadId: " ", server: " ", tool: " " }),
    { server: "mcp", threadId: null, tool: "tool" },
    "MCP app follow-up dialog source should provide safe fallbacks",
  );
}

function parsesDesktopHostToolCalls(): void {
  assertDeepEqual(
    mcpAppToolCallRequest({ name: "search", arguments: { q: "codex" }, _meta: { traceId: "abc" } }),
    { name: "search", arguments: { q: "codex" }, meta: { traceId: "abc" } },
    "MCP app tools/call params should expose name, arguments, and Desktop _meta",
  );
  assertDeepEqual(
    mcpAppToolCallRequestFromBridgeArgs(["search", { q: "codex" }]),
    { name: "search", arguments: { q: "codex" } },
    "MCP app callTool bridge args should map to app-server tool call params",
  );
}

function serializesDesktopBridgeErrors(): void {
  assertDeepEqual(
    serializeMcpAppBridgeError(mcpAppBridgeError("Invalid MCP proxy request.", MCP_APP_BRIDGE_INVALID_PARAMS)),
    {
      code: MCP_APP_BRIDGE_INVALID_PARAMS,
      name: "McpAppBridgeError",
      message: "Invalid MCP proxy request.",
    },
    "MCP app bridge rejects should preserve Desktop JSON-RPC invalid-params codes",
  );
  assertDeepEqual(
    serializeMcpAppBridgeError({
      code: MCP_APP_BRIDGE_METHOD_NOT_FOUND,
      message: "Unsupported MCP proxy method: unknown",
      name: "Error",
    }),
    {
      code: MCP_APP_BRIDGE_METHOD_NOT_FOUND,
      name: "Error",
      message: "Unsupported MCP proxy method: unknown",
    },
    "MCP app bridge rejects should preserve Desktop JSON-RPC method-not-found codes from plain objects",
  );
  assertDeepEqual(
    serializeMcpAppBridgeError(new Error("Runtime is offline.")),
    {
      name: "Error",
      message: "Runtime is offline.",
    },
    "MCP app bridge rejects should match Desktop serialization for ordinary host errors",
  );
}

function serializesUserCancelledBridgeErrors(): void {
  assertDeepEqual(
    serializeMcpAppBridgeError(mcpAppBridgeUserCancelledError()),
    {
      code: MCP_APP_BRIDGE_USER_CANCELLED,
      name: "McpAppBridgeUserCancelledError",
      message: "MCP app follow-up was cancelled by the user.",
    },
    "MCP app bridge cancel rejects should use a user-cancelled error type and code",
  );
}

function projectsServerInventoryForBridgeResponses(): void {
  const response = {
    data: [{
      name: "browser-use",
      tools: {
        open: { name: "open" },
        inspect: { name: "inspect" },
        upload: { name: "upload", _meta: { "openai/fileParams": {} } },
      },
      resources: [{ uri: "ui://browser/widget.html" }],
      resourceTemplates: [{ uriTemplate: "ui://browser/{id}.html" }],
    }],
  };
  const status = mcpServerStatusFromListResult(response, "browser-use");
  assertDeepEqual(
    mcpAppToolsListResponse(status),
    { tools: [{ name: "open" }, { name: "inspect" }] },
    "MCP app tools/list should hide file-parameter tools like Desktop",
  );
  assertEqual(
    mcpAppToolCallAllowed(status, "open"),
    true,
    "MCP app tools/call should allow ordinary tools",
  );
  assertEqual(
    mcpAppToolCallAllowed(status, "upload"),
    false,
    "MCP app tools/call should reject file-parameter tools like Desktop",
  );
  assertDeepEqual(
    mcpAppResourcesListResponse(status),
    { resources: [{ uri: "ui://browser/widget.html" }] },
    "MCP app resources/list should project the selected server's resources",
  );
  assertDeepEqual(
    mcpAppResourceTemplatesListResponse(status),
    { resourceTemplates: [{ uriTemplate: "ui://browser/{id}.html" }] },
    "MCP app resources/templates/list should project the selected server's resource templates",
  );
  assertDeepEqual(
    mcpAppResourcesListResponse(status, "codex_apps"),
    { resources: [] },
    "MCP app resources/list should not expose codex_apps resources without Desktop trusted connector scope",
  );
  assertDeepEqual(
    mcpAppResourceTemplatesListResponse(status, "codex_apps"),
    { resourceTemplates: [] },
    "MCP app resources/templates/list should not expose codex_apps templates without Desktop trusted connector scope",
  );
}

function validatesExternalLinks(): void {
  assertEqual(
    mcpAppExternalHref({ href: "https://example.com/path?q=1" }),
    "https://example.com/path?q=1",
    "MCP app openExternal should accept https links",
  );
  assertDeepEqual(
    mcpAppExternalHref({ href: "file:///etc/passwd" }),
    null,
    "MCP app openExternal should reject non-web protocols",
  );
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${String(expected)}\nActual: ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify(expected);
  if (actualText !== expectedText) {
    throw new Error(`${message}\nExpected: ${expectedText}\nActual: ${actualText}`);
  }
}
