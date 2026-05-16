import { useCallback, type Dispatch, type SetStateAction } from "react";
import { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import { openExternalUrl } from "../lib/tauri-host";
import {
  mergeComposerAttachments,
  type ComposerAttachment,
  type SettingsPanelId,
} from "../state/composer-workflow";
import type { CodexUiAction } from "../state/codex-reducer";
import {
  createCommandPanelState,
  projectCommandPanelEntries,
  projectMcpResourceReadResultEntries,
  projectMcpToolCallResultEntries,
  projectPluginEntries,
  projectRequiredAppEntries,
  projectSkillFileReadResultEntries,
  type CommandPanelEntry,
  type CommandPanelEntryAction,
  type CommandPanelKind,
  type CommandPanelOptions,
  type CommandPanelState,
} from "../state/command-panel";
import { loadAllApps } from "../state/app-list";
import {
  appendSkillPromptText,
  decodeBase64Utf8,
} from "../state/app-shell-helpers";
import {
  normalizeMcpServerKey,
  projectMcpManagementEntries,
} from "../state/mcp-skills-management";
import { refreshThreadContextDefaults } from "../state/thread-workflow";

export type CommandPanelSink = (panel: CommandPanelKind, options?: CommandPanelOptions) => void;
export type McpToolFormAction = Extract<NonNullable<CommandPanelEntry["action"]>, { type: "openMcpToolForm" }>;
export type McpServerFormAction = Extract<NonNullable<CommandPanelEntry["action"]>, { type: "openMcpServerForm" }>;

export function useCommandPanelActions({
  activeThreadId,
  activeTurnId,
  client,
  dispatch,
  ensureConnected,
  openCommandPanel,
  setActiveSettingsPanel,
  setCommandPanel,
  setComposerAttachments,
  setInput,
  setMcpServerForm,
  setMcpToolForm,
  selectThreadById,
  workspace,
}: {
  activeThreadId: string | null;
  activeTurnId: string | null;
  client: CodexJsonRpcClient;
  dispatch: (action: CodexUiAction) => void;
  ensureConnected: () => Promise<boolean>;
  openCommandPanel: CommandPanelSink;
  setActiveSettingsPanel: Dispatch<SetStateAction<SettingsPanelId | null>>;
  setCommandPanel: Dispatch<SetStateAction<CommandPanelState | null>>;
  setComposerAttachments: Dispatch<SetStateAction<ComposerAttachment[]>>;
  setInput: Dispatch<SetStateAction<string>>;
  setMcpServerForm: Dispatch<SetStateAction<McpServerFormAction | null>>;
  setMcpToolForm: Dispatch<SetStateAction<McpToolFormAction | null>>;
  selectThreadById?: (threadId: string) => void | Promise<void>;
  workspace: string;
}) {
  const callMcpToolFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "callMcpTool" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => {
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
  }, [activeThreadId, client, dispatch, ensureConnected, openCommandPanel]);

  const reloadMcpServersFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "reloadMcpServers" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => {
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
        message: "Reloaded MCP config. Select a tool to call it, or a resource to read it.",
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
  }, [client, ensureConnected, openCommandPanel, workspace]);

  const loginMcpServerFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "loginMcpServer" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => {
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
      await client.request("mcpServer/oauth/login", { name: action.server }, 120_000);
      const result = await client.request<unknown>("mcpServerStatus/list", { limit: 50, detail: "full" }, 120_000);
      const configReadResult = await readMcpConfig(client, workspace);
      sink("mcp", {
        status: "ready",
        title: "MCP Servers",
        message: `${action.server} authentication requested.`,
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
  }, [client, ensureConnected, openCommandPanel, workspace]);

  const readMcpResourceFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "readMcpResource" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => {
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
  }, [activeThreadId, client, ensureConnected, openCommandPanel]);

  const writeConfigFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "writeConfig" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => {
    sink("generic", {
      status: "loading",
      title: action.title,
      message: "Saving configuration...",
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
      await client.request("config/batchWrite", {
        edits: action.edits,
        reloadUserConfig: action.reloadUserConfig ?? true,
      }, 120_000);
      await refreshThreadContextDefaults(client, dispatch, workspace);
      if (action.afterWrite?.type === "addPersonalityChangeSyntheticItem" && activeThreadId) {
        dispatch({
          type: "notification",
          message: {
            method: "item/completed",
            params: {
              threadId: activeThreadId,
              turnId: activeTurnId,
              item: {
                id: `personality-changed:${Date.now()}`,
                type: "personality-changed",
                personality: action.afterWrite.personality,
                completed: true,
              },
            },
          },
        });
      }
      sink("generic", {
        status: "ready",
        title: action.title,
        message: action.message,
        entries: [{
          id: "config:write:success",
          title: "Config updated",
          kind: "status",
          status: "saved",
          meta: action.message,
          details: action.edits.map((edit) => edit.keyPath),
        }],
      });
    } catch (error) {
      sink("generic", {
        status: "error",
        title: action.title,
        error: formatError(error),
        entries: [],
      });
    }
  }, [activeThreadId, activeTurnId, client, dispatch, ensureConnected, openCommandPanel, workspace]);

  const writeSkillConfigFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "writeSkillConfig" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => {
    const path = action.path?.trim();
    const name = action.name.trim();
    if (!path && !name) {
      const message = "Skill config write requires a skill path or name.";
      dispatch({ type: "log", text: message, level: "warn" });
      sink("skills", { status: "error", title: action.title, error: message, entries: [] });
      return;
    }
    sink("skills", {
      status: "loading",
      title: action.title,
      message: action.enabled ? "Enabling skill..." : "Disabling skill...",
      entries: [],
    });
    if (!(await ensureConnected())) {
      sink("skills", {
        status: "error",
        title: action.title,
        error: "Runtime is offline.",
        entries: [],
      });
      return;
    }
    try {
      const result = await client.request<{ effectiveEnabled?: boolean }>("skills/config/write", {
        path: path || null,
        name: path ? null : name,
        enabled: action.enabled,
      }, 120_000);
      const skills = await client.request<unknown>("skills/list", {
        cwds: workspace.trim() ? [workspace.trim()] : [],
        forceReload: true,
      }, 120_000);
      const effectiveEnabled = result.effectiveEnabled ?? action.enabled;
      sink("skills", {
        status: "ready",
        title: "Skills",
        message: `${action.name} ${effectiveEnabled ? "enabled" : "disabled"}.`,
        entries: projectCommandPanelEntries({ skills }),
      });
    } catch (error) {
      sink("skills", {
        status: "error",
        title: action.title,
        error: formatError(error),
        entries: [],
      });
    }
  }, [client, dispatch, ensureConnected, openCommandPanel, workspace]);

  const readSkillFileFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "readSkillFile" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => {
    const path = action.path.trim();
    if (!path) {
      const message = "Skill source read requires a path.";
      dispatch({ type: "log", text: message, level: "warn" });
      sink("skills", { status: "error", title: action.title, error: message, entries: [] });
      return;
    }
    sink("skills", {
      status: "loading",
      title: action.title,
      message: "Reading skill source...",
      entries: [],
    });
    if (!(await ensureConnected())) {
      sink("skills", {
        status: "error",
        title: action.title,
        error: "Runtime is offline.",
        entries: [],
      });
      return;
    }
    try {
      const result = await client.request<{ dataBase64?: string }>("fs/readFile", { path }, 120_000);
      const contents = decodeBase64Utf8(result.dataBase64 ?? "");
      sink("skills", {
        status: "ready",
        title: action.title,
        message: "Skill source loaded from app-server.",
        entries: projectSkillFileReadResultEntries(path, contents),
      });
    } catch (error) {
      sink("skills", {
        status: "error",
        title: action.title,
        error: formatError(error),
        entries: [],
      });
    }
  }, [client, dispatch, ensureConnected, openCommandPanel]);

  const refreshMcpServersPanel = useCallback(async (
    message: string,
    sink: CommandPanelSink = openCommandPanel,
  ) => {
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
  }, [client, openCommandPanel, workspace]);

  const writeMcpServerConfigFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "writeMcpServerConfig" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => {
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
      await client.request("config/batchWrite", {
        edits: [{
          keyPath: `mcp_servers.${normalizedName}`,
          value: action.config,
          mergeStrategy: "replace",
        }],
        reloadUserConfig: true,
      }, 120_000);
      await refreshMcpServersPanel(`${normalizedName} saved. Restart may be required for running threads.`, sink);
    } catch (error) {
      sink("mcp", {
        status: "error",
        title: action.title,
        error: formatError(error),
        entries: [],
      });
    }
  }, [client, ensureConnected, openCommandPanel, refreshMcpServersPanel]);

  const removeMcpServerFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "removeMcpServer" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => {
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
      await client.request("config/batchWrite", {
        edits: [{
          keyPath: `mcp_servers.${normalizedServer}`,
          value: null,
          mergeStrategy: "replace",
        }],
        reloadUserConfig: true,
      }, 120_000);
      await refreshMcpServersPanel(`${normalizedServer} removed. Restart may be required for running threads.`, sink);
    } catch (error) {
      sink("mcp", {
        status: "error",
        title: action.title,
        error: formatError(error),
        entries: [],
      });
    }
  }, [client, ensureConnected, openCommandPanel, refreshMcpServersPanel]);

  const writeAppConfigFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "writeAppConfig" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => {
    sink("apps", {
      status: "loading",
      title: action.title,
      message: action.enabled ? "Enabling app..." : "Disabling app...",
      entries: [],
    });
    if (!(await ensureConnected())) {
      sink("apps", {
        status: "error",
        title: action.title,
        error: "Runtime is offline.",
        entries: [],
      });
      return;
    }
    try {
      await client.request("config/batchWrite", {
        edits: [{
          keyPath: `apps.${action.appId}`,
          value: { enabled: action.enabled },
          mergeStrategy: "upsert",
        }],
        reloadUserConfig: true,
      }, 120_000);
      const result = await loadAllApps(client, { forceRefetch: true, threadId: activeThreadId });
      sink("apps", {
        status: "ready",
        title: "Apps",
        message: `${action.appId} ${action.enabled ? "enabled" : "disabled"}.`,
        entries: projectCommandPanelEntries({ apps: result }),
      });
    } catch (error) {
      sink("apps", {
        status: "error",
        title: action.title,
        error: formatError(error),
        entries: [],
      });
    }
  }, [activeThreadId, client, ensureConnected, openCommandPanel]);

  const connectRequiredAppFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "connectRequiredApp" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => {
    const url = action.installUrl?.trim();
    if (!url) {
      sink("apps", {
        status: "error",
        title: action.title,
        error: "This app-server build only exposes app/list metadata for this connector. No native connector OAuth method or browser setup URL is available.",
        entries: [],
      });
      return;
    }
    try {
      await openExternalUrl(url);
      setCommandPanel((current) => current?.panel === "apps" || current?.panel === "plugins"
        ? {
            ...current,
            status: "ready",
            message: `${action.appName} setup URL opened. Finish the browser flow, then refresh Apps or Plugins.`,
            entries: current.entries.map((entry) => entryTracksAppConnectAction(entry, action.appId)
              ? {
                  ...entry,
                  status: "waiting for refresh",
                  details: [
                    ...(entry.details ?? []).filter((detail) => !detail.startsWith("Finish the browser flow")),
                    "Finish the browser flow, then refresh Apps or Plugins.",
                  ],
                  secondaryActions: entry.secondaryActions?.map((secondary) => ({
                    ...secondary,
                    label: secondary.action.type === "connectRequiredApp" ? "Open again" : secondary.label,
                    tone: secondary.action.type === "connectRequiredApp" ? "default" : secondary.tone,
                  })),
                }
              : entry),
          }
        : current);
      dispatch({
        type: "log",
        text: `${action.appName} setup URL opened. Refresh Apps or Plugins after completing the browser flow.`,
        level: "info",
      });
    } catch (error) {
      dispatch({ type: "log", text: `${action.title} failed: ${formatError(error)}`, level: "error" });
      sink("apps", {
        status: "error",
        title: action.title,
        error: formatError(error),
        entries: [],
      });
    }
  }, [dispatch, openCommandPanel, setCommandPanel]);

  const openExternalUrlFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "openExternalUrl" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => {
    try {
      await openExternalUrl(action.url);
      dispatch({ type: "log", text: `${action.title} opened.`, level: "info" });
    } catch (error) {
      dispatch({ type: "log", text: `${action.title} failed: ${formatError(error)}`, level: "error" });
      sink("apps", {
        status: "error",
        title: action.title,
        error: formatError(error),
        entries: [],
      });
    }
  }, [dispatch, openCommandPanel]);

  const refreshPluginsPanel = useCallback(async (
    message: string,
    sink: CommandPanelSink = openCommandPanel,
  ) => {
    const [result, apps] = await Promise.allSettled([
      client.request<unknown>("plugin/list", {
        cwds: workspace.trim() ? [workspace.trim()] : null,
      }, 120_000),
      loadAllApps(client, { forceRefetch: true, threadId: activeThreadId }),
    ]);
    if (result.status === "rejected") throw result.reason;
    sink("plugins", {
      status: "ready",
      title: "Plugins",
      message,
      entries: projectPluginEntries(result.value, { apps: apps.status === "fulfilled" ? apps.value : undefined }),
    });
  }, [activeThreadId, client, openCommandPanel, workspace]);

  const installPluginFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "installPlugin" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => {
    sink("plugins", {
      status: "loading",
      title: action.title,
      message: "Installing plugin...",
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
      const result = await client.request<{ appsNeedingAuth?: unknown[] }>("plugin/install", {
        marketplacePath: action.marketplacePath ?? null,
        remoteMarketplaceName: action.marketplacePath ? null : action.marketplaceName,
        pluginName: action.marketplacePath ? action.pluginName : action.pluginId,
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
      await refreshPluginsPanel(message, sink);
    } catch (error) {
      sink("plugins", {
        status: "error",
        title: action.title,
        error: formatError(error),
        entries: [],
      });
    }
  }, [client, dispatch, ensureConnected, openCommandPanel, refreshPluginsPanel, setActiveSettingsPanel, workspace]);

  const uninstallPluginFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "uninstallPlugin" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => {
    sink("plugins", {
      status: "loading",
      title: action.title,
      message: "Uninstalling plugin...",
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
      await client.request("plugin/uninstall", { pluginId: action.pluginId }, 120_000);
      await refreshThreadContextDefaults(client, dispatch, workspace);
      await refreshPluginsPanel(`${action.pluginId} uninstalled.`, sink);
    } catch (error) {
      sink("plugins", {
        status: "error",
        title: action.title,
        error: formatError(error),
        entries: [],
      });
    }
  }, [client, dispatch, ensureConnected, openCommandPanel, refreshPluginsPanel, workspace]);

  const writePluginConfigFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "writePluginConfig" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => {
    sink("plugins", {
      status: "loading",
      title: action.title,
      message: action.enabled ? "Enabling plugin..." : "Disabling plugin...",
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
      await client.request("config/batchWrite", {
        edits: [{
          keyPath: `plugins.${action.pluginId}`,
          value: { enabled: action.enabled },
          mergeStrategy: "upsert",
        }],
        reloadUserConfig: true,
      }, 120_000);
      await refreshThreadContextDefaults(client, dispatch, workspace);
      await refreshPluginsPanel(`${action.pluginId} ${action.enabled ? "enabled" : "disabled"}.`, sink);
    } catch (error) {
      sink("plugins", {
        status: "error",
        title: action.title,
        error: formatError(error),
        entries: [],
      });
    }
  }, [client, dispatch, ensureConnected, openCommandPanel, refreshPluginsPanel, workspace]);

  const selectCommandPanelAction = useCallback((
    action: CommandPanelEntryAction,
    sink: CommandPanelSink = openCommandPanel,
  ) => {
    if (action.type === "attachMention") {
      setComposerAttachments((current) => mergeComposerAttachments(current, [{
        type: "mention",
        name: action.name,
        path: action.path,
      }]));
      setCommandPanel(null);
      setActiveSettingsPanel(null);
      return;
    }
    if (action.type === "attachSkill") {
      setInput((current) => appendSkillPromptText(current, action.promptText ?? skillPromptReference(action)));
      setCommandPanel(null);
      setActiveSettingsPanel(null);
      return;
    }
    if (action.type === "attachApp") {
      setInput((current) => appendSkillPromptText(current, action.promptText));
      setCommandPanel(null);
      setActiveSettingsPanel(null);
      return;
    }
    if (action.type === "attachPlugin") {
      setInput((current) => appendSkillPromptText(current, action.promptText));
      setCommandPanel(null);
      setActiveSettingsPanel(null);
      return;
    }
    if (action.type === "selectThread") {
      setCommandPanel(null);
      setActiveSettingsPanel(null);
      void selectThreadById?.(action.threadId);
      return;
    }
    if (action.type === "writeConfig") {
      void writeConfigFromPanel(action, sink);
      return;
    }
    if (action.type === "writeSkillConfig") {
      void writeSkillConfigFromPanel(action, sink);
      return;
    }
    if (action.type === "readSkillFile") {
      void readSkillFileFromPanel(action, sink);
      return;
    }
    if (action.type === "openMcpServerForm") {
      setCommandPanel(null);
      setMcpServerForm(action);
      return;
    }
    if (action.type === "writeMcpServerConfig") {
      void writeMcpServerConfigFromPanel(action, sink);
      return;
    }
    if (action.type === "removeMcpServer") {
      void removeMcpServerFromPanel(action, sink);
      return;
    }
    if (action.type === "writeAppConfig") {
      void writeAppConfigFromPanel(action, sink);
      return;
    }
    if (action.type === "connectRequiredApp") {
      void connectRequiredAppFromPanel(action, sink);
      return;
    }
    if (action.type === "openExternalUrl") {
      void openExternalUrlFromPanel(action, sink);
      return;
    }
    if (action.type === "installPlugin") {
      void installPluginFromPanel(action, sink);
      return;
    }
    if (action.type === "uninstallPlugin") {
      void uninstallPluginFromPanel(action, sink);
      return;
    }
    if (action.type === "writePluginConfig") {
      void writePluginConfigFromPanel(action, sink);
      return;
    }
    if (action.type === "reloadMcpServers") {
      void reloadMcpServersFromPanel(action, sink);
      return;
    }
    if (action.type === "loginMcpServer") {
      void loginMcpServerFromPanel(action, sink);
      return;
    }
    if (action.type === "callMcpTool") {
      void callMcpToolFromPanel(action, sink);
      return;
    }
    if (action.type === "readMcpResource") {
      void readMcpResourceFromPanel(action, sink);
      return;
    }
    if (action.type === "openMcpToolForm") {
      setCommandPanel(null);
      setMcpToolForm(action);
    }
  }, [
    callMcpToolFromPanel,
    connectRequiredAppFromPanel,
    installPluginFromPanel,
    loginMcpServerFromPanel,
    openCommandPanel,
    openExternalUrlFromPanel,
    readMcpResourceFromPanel,
    readSkillFileFromPanel,
    refreshMcpServersPanel,
    refreshPluginsPanel,
    reloadMcpServersFromPanel,
    removeMcpServerFromPanel,
    setActiveSettingsPanel,
    setCommandPanel,
    setComposerAttachments,
    setInput,
    setMcpServerForm,
    setMcpToolForm,
    selectThreadById,
    uninstallPluginFromPanel,
    writeAppConfigFromPanel,
    writeConfigFromPanel,
    writeMcpServerConfigFromPanel,
    writePluginConfigFromPanel,
    writeSkillConfigFromPanel,
  ]);

  const selectCommandPanelEntry = useCallback((entry: CommandPanelEntry) => {
    if (entry.disabled || !entry.action) return;
    selectCommandPanelAction(entry.action);
  }, [selectCommandPanelAction]);

  return {
    callMcpToolFromPanel,
    installPluginFromPanel,
    loginMcpServerFromPanel,
    openExternalUrlFromPanel,
    reloadMcpServersFromPanel,
    removeMcpServerFromPanel,
    readMcpResourceFromPanel,
    readSkillFileFromPanel,
    selectCommandPanelAction,
    selectCommandPanelEntry,
    uninstallPluginFromPanel,
    writeAppConfigFromPanel,
    writeConfigFromPanel,
    writeMcpServerConfigFromPanel,
    writePluginConfigFromPanel,
    writeSkillConfigFromPanel,
  };
}

function skillPromptReference(action: Extract<CommandPanelEntryAction, { type: "attachSkill" }>): string {
  return `[$${action.name}](${escapePromptPath(action.path)}) `;
}

function escapePromptPath(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\)/g, "\\)");
}

function entryTracksAppConnectAction(entry: CommandPanelEntry, appId: string): boolean {
  if (entry.id === `required-app:${appId}` || entry.id === `app:${appId}`) return true;
  return entry.secondaryActions?.some((secondary) =>
    secondary.action.type === "connectRequiredApp" && secondary.action.appId === appId
  ) ?? false;
}

async function readMcpConfig(client: CodexJsonRpcClient, workspace: string): Promise<unknown> {
  return client.request("config/read", {
    includeLayers: true,
    cwd: workspace.trim() ? workspace.trim() : null,
  }, 120_000);
}
