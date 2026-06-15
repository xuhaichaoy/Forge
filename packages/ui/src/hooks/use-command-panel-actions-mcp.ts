/*
 * MCP server panel flows (tool call, reload, oauth login, resource read,
 * server config write/remove) extracted verbatim from the useCommandPanelActions
 * callback bodies. Plain async functions: the hook keeps the useCallback
 * wrappers and passes its closure values through the deps parameter.
 */
import type { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import { openExternalUrl } from "../lib/tauri-host";
import {
  projectMcpResourceReadResultEntries,
  projectMcpToolCallResultEntries,
  type CommandPanelEntry,
} from "../state/command-panel";
import {
  buildConfigBatchWriteParams,
  readConfigWriteTarget,
} from "../state/config-write-target";
import { markAppConnectOAuthPending } from "../state/app-connect-oauth";
import {
  normalizeMcpServerKey,
  projectMcpManagementEntries,
} from "../state/mcp-skills-management";
import type { ThreadWorkflowDispatch } from "../state/thread-workflow";
import type { CommandPanelSink } from "./use-command-panel-actions-types";

const MCP_RELOAD_RESTART_MESSAGE =
  "Reloaded MCP config. New threads use refreshed servers; running threads may need a thread restart or another MCP reload before tool changes appear.";

function mcpSavedRestartMessage(server: string): string {
  return `${server} saved and MCP config reloaded. New threads use the update; running threads may need a thread restart or MCP reload before tool changes appear.`;
}

function mcpRemovedRestartMessage(server: string): string {
  return `${server} removed and MCP config reloaded. New threads use the update; running threads may need a thread restart or MCP reload before tool changes disappear.`;
}

export async function callMcpToolFromPanelFlow(
  {
    activeThreadId,
    client,
    dispatch,
    ensureConnected,
  }: {
    activeThreadId: string | null;
    client: CodexJsonRpcClient;
    dispatch: ThreadWorkflowDispatch;
    ensureConnected: () => Promise<boolean>;
  },
  action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "callMcpTool" }>,
  sink: CommandPanelSink,
): Promise<void> {
  const threadId = activeThreadId;
  const title = `${action.server}:${action.tool}`;
  if (!threadId) {
    const message = "Select or start a thread before calling an MCP tool.";
    dispatch({ type: "log", text: message, level: "warn" });
    sink("mcp", { status: "error", title, error: message, entries: [] });
    return;
  }
  if (!(await ensureConnected())) return;
  sink("mcp", { status: "loading", title, message: "Calling MCP tool...", entries: [] });
  try {
    const result = await client.request<unknown>("mcpServer/tool/call", {
      threadId,
      server: action.server,
      tool: action.tool,
      arguments: action.arguments,
    }, 120_000);
    sink("mcp", {
      status: "ready",
      title,
      message: "MCP tool call completed.",
      entries: projectMcpToolCallResultEntries(action.server, action.tool, result),
    });
  } catch (error) {
    sink("mcp", {
      status: "error",
      title,
      error: formatError(error),
      entries: [],
    });
  }
}

export async function reloadMcpServersFromPanelFlow(
  {
    client,
    ensureConnected,
    workspace,
  }: {
    client: CodexJsonRpcClient;
    ensureConnected: () => Promise<boolean>;
    workspace: string;
  },
  action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "reloadMcpServers" }>,
  sink: CommandPanelSink,
): Promise<void> {
  sink("mcp", {
    status: "loading",
    title: action.title,
    message: "Reloading MCP config...",
    entries: [],
  });
  if (!(await ensureConnected())) {
    sink("mcp", {
      status: "error",
      title: action.title,
      error: "Runtime is offline.",
      entries: [],
    });
    return;
  }
  try {
    await client.request("config/mcpServer/reload", undefined, 120_000);
    const result = await client.request<unknown>("mcpServerStatus/list", { limit: 50, detail: "full" }, 120_000);
    const configReadResult = await readMcpConfig(client, workspace);
    sink("mcp", {
      status: "ready",
      title: "MCP Servers",
      message: MCP_RELOAD_RESTART_MESSAGE,
      entries: projectMcpManagementEntries(result, null, { configReadResult }),
    });
  } catch (error) {
    sink("mcp", {
      status: "error",
      title: action.title,
      error: formatError(error),
      entries: [],
    });
  }
}

export async function loginMcpServerFromPanelFlow(
  {
    client,
    ensureConnected,
    workspace,
  }: {
    client: CodexJsonRpcClient;
    ensureConnected: () => Promise<boolean>;
    workspace: string;
  },
  action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "loginMcpServer" }>,
  sink: CommandPanelSink,
): Promise<void> {
  sink("mcp", {
    status: "loading",
    title: action.title,
    message: "Starting MCP authentication...",
    entries: [],
  });
  if (!(await ensureConnected())) {
    sink("mcp", {
      status: "error",
      title: action.title,
      error: "Runtime is offline.",
      entries: [],
    });
    return;
  }
  try {
    const login = await client.request<unknown>("mcpServer/oauth/login", { name: action.server }, 120_000);
    const authorizationUrl = mcpOauthAuthorizationUrl(login);
    if (authorizationUrl) {
      await openExternalUrl(authorizationUrl);
      markAppConnectOAuthPending({
        appId: `mcp:${action.server}`,
        appName: action.server,
        redirectUrl: authorizationUrl,
      });
    }
    const result = await client.request<unknown>("mcpServerStatus/list", { limit: 50, detail: "full" }, 120_000);
    const configReadResult = await readMcpConfig(client, workspace);
    sink("mcp", {
      status: "ready",
      title: "MCP Servers",
      message: authorizationUrl
        ? `${action.server} authentication opened in your browser.`
        : `${action.server} authentication requested.`,
      entries: projectMcpManagementEntries(result, null, { configReadResult }),
    });
  } catch (error) {
    sink("mcp", {
      status: "error",
      title: action.title,
      error: formatError(error),
      entries: [],
    });
  }
}

export async function readMcpResourceFromPanelFlow(
  {
    activeThreadId,
    client,
    ensureConnected,
  }: {
    activeThreadId: string | null;
    client: CodexJsonRpcClient;
    ensureConnected: () => Promise<boolean>;
  },
  action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "readMcpResource" }>,
  sink: CommandPanelSink,
): Promise<void> {
  const title = `${action.server}:${action.title}`;
  sink("mcp", {
    status: "loading",
    title,
    message: "Reading MCP resource...",
    entries: [],
  });
  if (!(await ensureConnected())) {
    sink("mcp", {
      status: "error",
      title,
      error: "Runtime is offline.",
      entries: [],
    });
    return;
  }
  try {
    const result = await client.request<unknown>("mcpServer/resource/read", {
      threadId: activeThreadId ?? null,
      server: action.server,
      uri: action.uri,
    }, 120_000);
    sink("mcp", {
      status: "ready",
      title,
      message: "MCP resource read completed.",
      entries: projectMcpResourceReadResultEntries(action.server, action.uri, result),
    });
  } catch (error) {
    sink("mcp", {
      status: "error",
      title,
      error: formatError(error),
      entries: [],
    });
  }
}

export async function refreshMcpServersPanelFlow(
  {
    client,
    workspace,
  }: {
    client: CodexJsonRpcClient;
    workspace: string;
  },
  message: string,
  sink: CommandPanelSink,
): Promise<void> {
  await client.request("config/mcpServer/reload", undefined, 120_000);
  const [result, configReadResult] = await Promise.all([
    client.request<unknown>("mcpServerStatus/list", { limit: 50, detail: "full" }, 120_000),
    readMcpConfig(client, workspace),
  ]);
  sink("mcp", {
    status: "ready",
    title: "MCP Servers",
    message,
    entries: projectMcpManagementEntries(result, null, { configReadResult }),
  });
}

export async function writeMcpServerConfigFromPanelFlow(
  {
    client,
    ensureConnected,
    refreshMcpServersPanel,
    workspace,
  }: {
    client: CodexJsonRpcClient;
    ensureConnected: () => Promise<boolean>;
    refreshMcpServersPanel: (message: string, sink: CommandPanelSink) => Promise<void>;
    workspace: string;
  },
  action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "writeMcpServerConfig" }>,
  sink: CommandPanelSink,
): Promise<void> {
  sink("mcp", {
    status: "loading",
    title: action.title,
    message: "Saving MCP server config...",
    entries: [],
  });
  if (!(await ensureConnected())) {
    sink("mcp", {
      status: "error",
      title: action.title,
      error: "Runtime is offline.",
      entries: [],
    });
    return;
  }
  try {
    const normalizedName = normalizeMcpServerKey(action.name, [], action.name);
    const configWriteTarget = action.configWriteTarget
      ?? await readMcpConfigWriteTarget(client, workspace, normalizedName);
    const edits = [{
      keyPath: `mcp_servers.${normalizedName}`,
      value: action.config,
      mergeStrategy: "replace" as const,
    }];
    await client.request("config/batchWrite", buildConfigBatchWriteParams({
      edits,
      target: configWriteTarget,
      reloadUserConfig: true,
    }), 120_000);
    await refreshMcpServersPanel(mcpSavedRestartMessage(normalizedName), sink);
  } catch (error) {
    sink("mcp", {
      status: "error",
      title: action.title,
      error: formatError(error),
      entries: [],
    });
  }
}

export async function removeMcpServerFromPanelFlow(
  {
    client,
    ensureConnected,
    refreshMcpServersPanel,
    workspace,
  }: {
    client: CodexJsonRpcClient;
    ensureConnected: () => Promise<boolean>;
    refreshMcpServersPanel: (message: string, sink: CommandPanelSink) => Promise<void>;
    workspace: string;
  },
  action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "removeMcpServer" }>,
  sink: CommandPanelSink,
): Promise<void> {
  sink("mcp", {
    status: "loading",
    title: action.title,
    message: "Removing MCP server...",
    entries: [],
  });
  if (!(await ensureConnected())) {
    sink("mcp", {
      status: "error",
      title: action.title,
      error: "Runtime is offline.",
      entries: [],
    });
    return;
  }
  try {
    const normalizedServer = normalizeMcpServerKey(action.server, [], action.server);
    const configWriteTarget = action.configWriteTarget
      ?? await readMcpConfigWriteTarget(client, workspace, normalizedServer);
    const edits = [{
      keyPath: `mcp_servers.${normalizedServer}`,
      value: null,
      mergeStrategy: "replace" as const,
    }];
    await client.request("config/batchWrite", buildConfigBatchWriteParams({
      edits,
      target: configWriteTarget,
      reloadUserConfig: true,
    }), 120_000);
    await refreshMcpServersPanel(mcpRemovedRestartMessage(normalizedServer), sink);
  } catch (error) {
    sink("mcp", {
      status: "error",
      title: action.title,
      error: formatError(error),
      entries: [],
    });
  }
}

async function readMcpConfig(client: CodexJsonRpcClient, workspace: string): Promise<unknown> {
  return client.request("config/read", {
    includeLayers: true,
    cwd: workspace.trim() ? workspace.trim() : null,
  }, 120_000);
}

function mcpOauthAuthorizationUrl(result: unknown): string | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const record = result as Record<string, unknown>;
  const value = record.authorizationUrl ?? record.authorization_url ?? record.authUrl ?? record.url;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function readMcpConfigWriteTarget(
  client: CodexJsonRpcClient,
  workspace: string,
  server: string,
): Promise<{ filePath: string; expectedVersion: string }> {
  return readConfigWriteTarget(client, {
    cwd: workspace,
    keyPaths: [`mcp_servers.${server}`],
    scope: "MCP config write",
  });
}
