/*
 * Computer Use / Browser runtime panel flows extracted verbatim from the
 * useCommandPanelActions callback bodies.
 */
import type { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import { openComputerUseSetup, repairComputerUseBundle } from "../lib/tauri-host";
import {
  projectMcpToolCallResultEntries,
  type CommandPanelEntry,
} from "../state/command-panel";
import {
  DEFAULT_BROWSER_RUNTIME_URL,
  loadBrowserRuntimeSnapshot,
  openBrowserRuntime,
  projectBrowserRuntimeSettingsEntries,
} from "../state/browser-runtime";
import {
  COMPUTER_USE_MCP_PROBE_TIMEOUT_MS,
  formatComputerUseMcpProbeError,
  loadComputerUseReadiness,
  projectComputerUseMcpProbeFailureEntries,
  projectComputerUseReadinessEntries,
} from "../state/computer-use-readiness";
import type { PluginBackedDesktopSettingsPanel } from "../state/settings-panel-workflow";
import type { ThreadWorkflowDispatch } from "../state/thread-workflow";
import type { CommandPanelSink } from "./use-command-panel-actions-types";

export async function openComputerUseSetupFromPanelFlow(
  {
    dispatch,
  }: {
    dispatch: ThreadWorkflowDispatch;
  },
  action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "openComputerUseSetup" }>,
  sink: CommandPanelSink,
): Promise<void> {
  try {
    await openComputerUseSetup(action.codexHome, action.target);
    dispatch({ type: "log", text: `${action.title} opened.`, level: "info" });
  } catch (error) {
    let entries: CommandPanelEntry[] = [];
    try {
      entries = projectBrowserRuntimeSettingsEntries(await loadBrowserRuntimeSnapshot());
    } catch {
      entries = [];
    }
    dispatch({ type: "log", text: `${action.title} failed: ${formatError(error)}`, level: "error" });
    sink("generic", {
      status: "error",
      title: action.title,
      error: formatError(error),
      entries,
    });
  }
}

export async function repairComputerUseBundleFromPanelFlow(
  {
    dispatch,
  }: {
    dispatch: ThreadWorkflowDispatch;
  },
  action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "repairComputerUseBundle" }>,
  sink: CommandPanelSink,
): Promise<void> {
  sink("generic", {
    status: "loading",
    title: action.title,
    message: "Repairing Computer Use from the signed-valid local bundle source...",
    entries: [],
  });
  try {
    const result = await repairComputerUseBundle(action.codexHome);
    const readiness = {
      ...result.readiness,
      bridgeAvailable: true,
      error: null,
    };
    dispatch({ type: "log", text: result.message, level: result.repaired ? "info" : "warn" });
    sink("generic", {
      status: result.repaired ? "ready" : "idle",
      title: action.title,
      message: result.message,
      entries: projectComputerUseReadinessEntries(readiness, action.codexHome),
    });
  } catch (error) {
    const formatted = formatError(error);
    dispatch({ type: "log", text: `${action.title} failed: ${formatted}`, level: "error" });
    sink("generic", {
      status: "error",
      title: action.title,
      error: formatted,
      entries: projectComputerUseReadinessEntries(await loadComputerUseReadiness(action.codexHome), action.codexHome),
    });
  }
}

export async function probeComputerUseMcpFromPanelFlow(
  {
    client,
    dispatch,
    ensureConnected,
  }: {
    client: CodexJsonRpcClient;
    dispatch: ThreadWorkflowDispatch;
    ensureConnected: () => Promise<boolean>;
  },
  action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "probeComputerUseMcp" }>,
  sink: CommandPanelSink,
): Promise<void> {
  sink("generic", {
    status: "loading",
    title: action.title,
    message: `Calling ${action.server}:${action.tool} from the active thread...`,
    entries: [],
  });
  if (!(await ensureConnected())) {
    sink("generic", {
      status: "error",
      title: action.title,
      error: "Runtime is offline.",
      entries: [],
    });
    return;
  }
  try {
    const result = await client.request<unknown>("mcpServer/tool/call", {
      threadId: action.threadId,
      server: action.server,
      tool: action.tool,
      arguments: action.arguments ?? {},
    }, COMPUTER_USE_MCP_PROBE_TIMEOUT_MS);
    sink("generic", {
      status: "ready",
      title: action.title,
      message: `${action.server}:${action.tool} completed. This proves the MCP tool is callable; GUI control still depends on helper permissions and target app state.`,
      entries: projectMcpToolCallResultEntries(action.server, action.tool, result),
    });
    dispatch({
      type: "log",
      text: `${action.server}:${action.tool} probe completed.`,
      level: "info",
    });
  } catch (error) {
    const rawMessage = formatError(error);
    const message = formatComputerUseMcpProbeError(action.server, action.tool, rawMessage);
    sink("generic", {
      status: "error",
      title: action.title,
      error: message,
      entries: projectComputerUseMcpProbeFailureEntries(action.server, action.tool, rawMessage),
    });
    dispatch({ type: "log", text: `${action.title} failed: ${message}`, level: "error" });
  }
}

export async function openBrowserRuntimeFromPanelFlow(
  {
    dispatch,
    ensureConnected,
    refreshPluginsPanel,
  }: {
    dispatch: ThreadWorkflowDispatch;
    ensureConnected: () => Promise<boolean>;
    refreshPluginsPanel: (message: string, sink: CommandPanelSink, sourceSettingsPanel?: PluginBackedDesktopSettingsPanel) => Promise<void>;
  },
  action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "openBrowserRuntime" }>,
  sink: CommandPanelSink,
): Promise<void> {
  try {
    const snapshot = await openBrowserRuntime(
      action.url ?? (action.tabId ? null : DEFAULT_BROWSER_RUNTIME_URL),
      action.tabId ?? null,
    );
    if (!snapshot.bridgeAvailable || !snapshot.available) {
      throw new Error(snapshot.error || "Browser host bridge is unavailable.");
    }
    if (snapshot.error) {
      throw new Error(snapshot.error);
    }
    const message = `${action.title} opened. Local Browser surface is not agent-controlled until the Browser iab backend is connected.`;
    dispatch({ type: "log", text: message, level: "info" });
    try {
      if (await ensureConnected()) {
        await refreshPluginsPanel(message, sink, "browser-use");
        return;
      }
    } catch (refreshError) {
      dispatch({
        type: "log",
        text: `Browser plugin lifecycle refresh failed: ${formatError(refreshError)}`,
        level: "warn",
      });
    }
    sink("generic", {
      status: "ready",
      title: "Browser",
      message,
      entries: projectBrowserRuntimeSettingsEntries(snapshot),
    });
  } catch (error) {
    dispatch({ type: "log", text: `${action.title} failed: ${formatError(error)}`, level: "error" });
    sink("generic", {
      status: "error",
      title: action.title,
      error: formatError(error),
      entries: [],
    });
  }
}
