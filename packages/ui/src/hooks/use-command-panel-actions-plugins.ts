/*
 * Plugin lifecycle panel flows (refresh, install, share checkout, uninstall,
 * plugin config write) extracted verbatim from the useCommandPanelActions
 * callback bodies.
 */
import type { Dispatch, SetStateAction } from "react";
import type { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import type { SettingsPanelId } from "../state/composer-workflow";
import {
  projectRequiredAppEntries,
  type CommandPanelEntry,
  type CommandPanelKind,
} from "../state/command-panel";
import {
  buildConfigBatchWriteParams,
  formatConfigWriteError,
  readConfigWriteTarget,
} from "../state/config-write-target";
import {
  loadComputerUseMcpReadinessEntries,
  loadComputerUseReadiness,
  projectComputerUseReadinessEntries,
} from "../state/computer-use-readiness";
import {
  pluginBackedDesktopSettingsInfo,
  settingsPanelTitle,
  type PluginBackedDesktopSettingsPanel,
} from "../state/settings-panel-workflow";
import {
  loadPluginManagementEntries,
  pluginBackedDesktopSettingsPanelEntries,
} from "../state/settings-panel-loader";
import {
  refreshThreadContextDefaults,
  type ThreadWorkflowDispatch,
} from "../state/thread-workflow";
import type { CommandPanelSink } from "./use-command-panel-actions-types";

function pluginActionPanelKind(sourceSettingsPanel?: PluginBackedDesktopSettingsPanel): CommandPanelKind {
  return sourceSettingsPanel ? "generic" : "plugins";
}

export async function refreshPluginsPanelFlow(
  {
    activeThreadId,
    client,
    workspace,
  }: {
    activeThreadId: string | null;
    client: CodexJsonRpcClient;
    workspace: string;
  },
  message: string,
  sink: CommandPanelSink,
  sourceSettingsPanel?: PluginBackedDesktopSettingsPanel,
): Promise<void> {
  const entries = await loadPluginManagementEntries({
    client,
    forceReload: true,
    threadId: activeThreadId,
    workspace,
  });
  if (sourceSettingsPanel) {
    const info = pluginBackedDesktopSettingsInfo(sourceSettingsPanel);
    const computerUseReadiness = sourceSettingsPanel === "computer-use"
      ? await loadComputerUseReadiness(undefined)
      : null;
    sink("generic", {
      status: "ready",
      title: settingsPanelTitle(sourceSettingsPanel),
      message: `${message} ${info.message}`,
      entries: await pluginBackedDesktopSettingsPanelEntries(
        sourceSettingsPanel,
        entries,
        undefined,
        {
          computerUseReadinessEntries: computerUseReadiness
            ? projectComputerUseReadinessEntries(computerUseReadiness, undefined)
            : undefined,
          mcpReadinessEntries: sourceSettingsPanel === "computer-use"
            ? await loadComputerUseMcpReadinessEntries(client, null, {
                activeThreadId,
                nativeReadiness: computerUseReadiness,
              })
            : undefined,
        },
      ),
    });
    return;
  }
  sink("plugins", {
    status: "ready",
    title: "Plugins",
    message,
    entries,
  });
}

export async function installPluginFromPanelFlow(
  {
    client,
    dispatch,
    ensureConnected,
    refreshPluginsPanel,
    setActiveSettingsPanel,
    workspace,
  }: {
    client: CodexJsonRpcClient;
    dispatch: ThreadWorkflowDispatch;
    ensureConnected: () => Promise<boolean>;
    refreshPluginsPanel: (message: string, sink: CommandPanelSink, sourceSettingsPanel?: PluginBackedDesktopSettingsPanel) => Promise<void>;
    setActiveSettingsPanel: Dispatch<SetStateAction<SettingsPanelId | null>>;
    workspace: string;
  },
  action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "installPlugin" }>,
  sink: CommandPanelSink,
): Promise<void> {
  const panelKind = pluginActionPanelKind(action.sourceSettingsPanel);
  sink(panelKind, {
    status: "loading",
    title: action.title,
    message: "Installing plugin...",
    entries: [],
  });
  if (!(await ensureConnected())) {
    sink(panelKind, {
      status: "error",
      title: action.title,
      error: "Runtime is offline.",
      entries: [],
    });
    return;
  }
  try {
    const result = await client.request<{ appsNeedingAuth?: unknown[] }>("plugin/install", {
      marketplacePath: action.marketplacePath ?? null,
      remoteMarketplaceName: action.marketplacePath ? null : action.marketplaceName,
      pluginName: action.marketplacePath ? action.pluginName : action.remotePluginId ?? action.pluginName,
    }, 120_000);
    await refreshThreadContextDefaults(client, dispatch, workspace);
    const appsNeedingAuth = result.appsNeedingAuth ?? [];
    if (appsNeedingAuth.length > 0) {
      setActiveSettingsPanel("apps");
      sink("apps", {
        status: "ready",
        title: "Connect required apps",
        message: `${action.pluginName} installed. Open each setup URL, then refresh Apps or Plugins after the browser flow completes.`,
        entries: projectRequiredAppEntries(appsNeedingAuth),
      });
      return;
    }
    const message = `${action.pluginName} installed.`;
    await refreshPluginsPanel(message, sink, action.sourceSettingsPanel);
  } catch (error) {
    sink(panelKind, {
      status: "error",
      title: action.title,
      error: formatError(error),
      entries: [],
    });
  }
}

export async function checkoutPluginShareFromPanelFlow(
  {
    client,
    dispatch,
    ensureConnected,
    refreshPluginsPanel,
    workspace,
  }: {
    client: CodexJsonRpcClient;
    dispatch: ThreadWorkflowDispatch;
    ensureConnected: () => Promise<boolean>;
    refreshPluginsPanel: (message: string, sink: CommandPanelSink, sourceSettingsPanel?: PluginBackedDesktopSettingsPanel) => Promise<void>;
    workspace: string;
  },
  action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "checkoutPluginShare" }>,
  sink: CommandPanelSink,
): Promise<void> {
  sink("plugins", {
    status: "loading",
    title: action.title,
    message: "Checking out shared plugin...",
    entries: [],
  });
  if (!(await ensureConnected())) {
    sink("plugins", {
      status: "error",
      title: action.title,
      error: "Runtime is offline.",
      entries: [],
    });
    return;
  }
  try {
    const result = await client.request<{ pluginName?: string }>("plugin/share/checkout", {
      remotePluginId: action.remotePluginId,
    }, 120_000);
    await refreshThreadContextDefaults(client, dispatch, workspace);
    await refreshPluginsPanel(`${result.pluginName ?? action.pluginName} checked out.`, sink);
  } catch (error) {
    sink("plugins", {
      status: "error",
      title: action.title,
      error: formatError(error),
      entries: [],
    });
  }
}

export async function uninstallPluginFromPanelFlow(
  {
    client,
    dispatch,
    ensureConnected,
    refreshPluginsPanel,
    workspace,
  }: {
    client: CodexJsonRpcClient;
    dispatch: ThreadWorkflowDispatch;
    ensureConnected: () => Promise<boolean>;
    refreshPluginsPanel: (message: string, sink: CommandPanelSink, sourceSettingsPanel?: PluginBackedDesktopSettingsPanel) => Promise<void>;
    workspace: string;
  },
  action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "uninstallPlugin" }>,
  sink: CommandPanelSink,
): Promise<void> {
  const panelKind = pluginActionPanelKind(action.sourceSettingsPanel);
  sink(panelKind, {
    status: "loading",
    title: action.title,
    message: "Uninstalling plugin...",
    entries: [],
  });
  if (!(await ensureConnected())) {
    sink(panelKind, {
      status: "error",
      title: action.title,
      error: "Runtime is offline.",
      entries: [],
    });
    return;
  }
  try {
    await client.request("plugin/uninstall", { pluginId: action.pluginId }, 120_000);
    await refreshThreadContextDefaults(client, dispatch, workspace);
    await refreshPluginsPanel(`${action.pluginId} uninstalled.`, sink, action.sourceSettingsPanel);
  } catch (error) {
    sink(panelKind, {
      status: "error",
      title: action.title,
      error: formatError(error),
      entries: [],
    });
  }
}

export async function writePluginConfigFromPanelFlow(
  {
    client,
    dispatch,
    ensureConnected,
    refreshPluginsPanel,
    workspace,
  }: {
    client: CodexJsonRpcClient;
    dispatch: ThreadWorkflowDispatch;
    ensureConnected: () => Promise<boolean>;
    refreshPluginsPanel: (message: string, sink: CommandPanelSink, sourceSettingsPanel?: PluginBackedDesktopSettingsPanel) => Promise<void>;
    workspace: string;
  },
  action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "writePluginConfig" }>,
  sink: CommandPanelSink,
): Promise<void> {
  const panelKind = pluginActionPanelKind(action.sourceSettingsPanel);
  sink(panelKind, {
    status: "loading",
    title: action.title,
    message: action.enabled ? "Enabling plugin..." : "Disabling plugin...",
    entries: [],
  });
  if (!(await ensureConnected())) {
    sink(panelKind, {
      status: "error",
      title: action.title,
      error: "Runtime is offline.",
      entries: [],
    });
    return;
  }
  try {
    const edits = [{
      keyPath: `plugins.${action.pluginId}`,
      value: { enabled: action.enabled },
      mergeStrategy: "upsert" as const,
    }];
    const configWriteTarget = action.configWriteTarget
      ?? await readConfigWriteTarget(client, {
        cwd: workspace,
        keyPaths: edits.map((edit) => edit.keyPath),
        scope: "Plugin config write",
      });
    await client.request("config/batchWrite", buildConfigBatchWriteParams({
      edits,
      target: configWriteTarget,
      reloadUserConfig: true,
    }), 120_000);
    await refreshThreadContextDefaults(client, dispatch, workspace);
    await refreshPluginsPanel(
      `${action.pluginId} ${action.enabled ? "enabled" : "disabled"}.`,
      sink,
      action.sourceSettingsPanel,
    );
  } catch (error) {
    sink(panelKind, {
      status: "error",
      title: action.title,
      error: formatConfigWriteError(error, "Plugin config write"),
      entries: [],
    });
  }
}
