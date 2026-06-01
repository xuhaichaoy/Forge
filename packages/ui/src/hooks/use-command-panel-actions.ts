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
  projectPluginSkillReadResultEntries,
  projectRequiredAppEntries,
  projectSkillManagementEntries,
  projectSkillFileReadResultEntries,
  type CommandPanelEntry,
  type CommandPanelEntryAction,
  type CommandPanelKind,
  type CommandPanelOptions,
  type CommandPanelState,
} from "../state/command-panel";
import {
  buildConfigBatchWriteParams,
  formatConfigWriteError,
  readConfigWriteTarget,
} from "../state/config-write-target";
import { localeLabel, type HiCodexLocale } from "../state/i18n";
import { appEnabledConfigEdit, loadAllApps } from "../state/app-list";
import { markAppConnectOAuthPending } from "../state/app-connect-oauth";
import {
  appendSkillPromptText,
  decodeBase64Utf8,
  encodeBase64Utf8,
} from "../state/app-shell-helpers";
import {
  normalizeMcpServerKey,
  projectMcpManagementEntries,
} from "../state/mcp-skills-management";
import {
  mergeNotificationPreferences,
  notificationPolicyLabel,
  notificationSoundLabel,
  type NotificationPreferences,
} from "../state/notification-preferences";
import { projectNotificationSettingsEntry } from "../state/settings-panel-workflow";
import { loadPluginManagementEntries } from "../state/settings-panel-loader";
import { refreshThreadContextDefaults } from "../state/thread-workflow";
import { themeModeLabel, type UiThemeMode } from "../state/theme";
import { reducedMotionLabel, type ReducedMotionMode } from "../state/appearance";

const MCP_RELOAD_RESTART_MESSAGE =
  "Reloaded MCP config. New threads use refreshed servers; running threads may need a thread restart or another MCP reload before tool changes appear.";

function mcpSavedRestartMessage(server: string): string {
  return `${server} saved and MCP config reloaded. New threads use the update; running threads may need a thread restart or MCP reload before tool changes appear.`;
}

function mcpRemovedRestartMessage(server: string): string {
  return `${server} removed and MCP config reloaded. New threads use the update; running threads may need a thread restart or MCP reload before tool changes disappear.`;
}

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
  setUiLocale,
  setUiThemeMode,
  setUiCodeFontSize,
  setUiReducedMotion,
  setUiKeyboardShortcut,
  resetUiKeyboardShortcut,
  notificationPreferences,
  setNotificationPreferences,
  runSlashCommand,
  openFileSearchPanel,
  setThreadPinnedById,
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
  setUiLocale?: (locale: HiCodexLocale) => void;
  setUiThemeMode?: (mode: UiThemeMode) => void;
  /*
   * CODEX-REF: settings.general.appearance.codeFontSize.row mutation. Wires
   * the +/- secondaryAction buttons to the HiCodexApp-owned setter.
   */
  setUiCodeFontSize?: (size: number) => void;
  /*
   * CODEX-REF: settings.general.appearance.reducedMotion.label mutation.
   * 3-way toggle System/On/Off.
   */
  setUiReducedMotion?: (mode: ReducedMotionMode) => void;
  /*
   * CODEX-REF: keyboard-shortcuts-settings-*.js
   * `set-codex-command-keybinding` (type=set/replace + type=remove via null).
   */
  setUiKeyboardShortcut?: (commandId: string, accelerator: string | null) => void;
  /*
   * CODEX-REF: same chunk, `set-codex-command-keybinding` type=reset.
   * Drops the override so the descriptor default takes effect again.
   */
  resetUiKeyboardShortcut?: (commandId: string) => void;
  notificationPreferences?: NotificationPreferences;
  setNotificationPreferences?: (patch: Partial<NotificationPreferences>) => NotificationPreferences;
  runSlashCommand?: (commandId: string) => void;
  openFileSearchPanel?: () => void;
  setThreadPinnedById?: (threadId: string, pinned: boolean) => void;
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
      const configWriteTarget = action.configWriteTarget
        ?? await readConfigWriteTarget(client, {
          cwd: workspace,
          keyPaths: action.edits.map((edit) => edit.keyPath),
        });
      await client.request("config/batchWrite", buildConfigBatchWriteParams({
        edits: action.edits,
        target: configWriteTarget,
        reloadUserConfig: action.reloadUserConfig ?? true,
      }), 120_000);
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
        error: formatConfigWriteError(error, action.title),
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

  const createStarterSkillFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "createStarterSkill" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => {
    sink("skills", {
      status: "loading",
      title: action.title,
      message: "Creating starter skill...",
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
      if (await fsPathExists(client, action.filePath)) {
        const message = `${action.filePath} already exists. Open it from Skills instead of overwriting it.`;
        dispatch({ type: "log", text: message, level: "warn" });
        sink("skills", {
          status: "error",
          title: action.title,
          error: message,
          entries: [],
        });
        return;
      }
      await client.request("fs/createDirectory", {
        path: action.directoryPath,
        recursive: true,
      }, 120_000);
      await client.request("fs/writeFile", {
        path: action.filePath,
        dataBase64: encodeBase64Utf8(action.contents),
      }, 120_000);
      const skills = await client.request<unknown>("skills/list", {
        cwds: workspace.trim() ? [workspace.trim()] : [],
        forceReload: true,
      }, 120_000);
      sink("skills", {
        status: "ready",
        title: "Skills",
        message: `${action.skillName} created. Edit ${action.filePath} to customize it.`,
        entries: projectSkillManagementEntries(skills, { workspace }),
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

  const readPluginSkillFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "readPluginSkill" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => {
    sink("skills", {
      status: "loading",
      title: action.title,
      message: "Reading plugin skill source...",
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
      const result = await client.request<{ contents?: string | null }>("plugin/skill/read", {
        remoteMarketplaceName: action.remoteMarketplaceName,
        remotePluginId: action.remotePluginId,
        skillName: action.skillName,
      }, 120_000);
      sink("skills", {
        status: "ready",
        title: action.title,
        message: "Plugin skill source loaded from app-server.",
        entries: projectPluginSkillReadResultEntries(
          action.skillName,
          `${action.remoteMarketplaceName}:${action.remotePluginId}`,
          result.contents,
        ),
      });
    } catch (error) {
      sink("skills", {
        status: "error",
        title: action.title,
        error: formatError(error),
        entries: [],
      });
    }
  }, [client, ensureConnected, openCommandPanel]);

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
  }, [client, ensureConnected, openCommandPanel, refreshMcpServersPanel, workspace]);

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
  }, [client, ensureConnected, openCommandPanel, refreshMcpServersPanel, workspace]);

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
      const edits = [appEnabledConfigEdit(action.appId, action.enabled)];
      const configWriteTarget = action.configWriteTarget
        ?? await readConfigWriteTarget(client, {
          cwd: workspace,
          keyPaths: edits.map((edit) => edit.keyPath),
          scope: "App config write",
        });
      await client.request("config/batchWrite", buildConfigBatchWriteParams({
        edits,
        target: configWriteTarget,
        reloadUserConfig: true,
      }), 120_000);
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
        error: formatConfigWriteError(error, "App config write"),
        entries: [],
      });
    }
  }, [activeThreadId, client, ensureConnected, openCommandPanel, workspace]);

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
      const pendingOAuth = markAppConnectOAuthPending({
        appId: action.appId,
        appName: action.appName,
        redirectUrl: url,
      });
      const flowMessage = pendingOAuth
        ? "Finish the browser flow. HiCodex will refresh Apps or Plugins when the OAuth callback returns."
        : "Finish the browser flow, then refresh Apps or Plugins.";
      setCommandPanel((current) => current?.panel === "apps" || current?.panel === "plugins"
        ? {
            ...current,
            status: "ready",
            message: `${action.appName} setup URL opened. ${flowMessage}`,
            entries: current.entries.map((entry) => entryTracksAppConnectAction(entry, action.appId)
              ? {
                  ...entry,
                  status: "waiting for refresh",
                  details: [
                    ...(entry.details ?? []).filter((detail) => !detail.startsWith("Finish the browser flow")),
                    flowMessage,
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
        text: `${action.appName} setup URL opened. ${flowMessage}`,
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
    const entries = await loadPluginManagementEntries({
      client,
      forceReload: true,
      threadId: activeThreadId,
      workspace,
    });
    sink("plugins", {
      status: "ready",
      title: "Plugins",
      message,
      entries,
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

  const checkoutPluginShareFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "checkoutPluginShare" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => {
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
  }, [client, dispatch, ensureConnected, openCommandPanel, refreshPluginsPanel, workspace]);

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
      await refreshPluginsPanel(`${action.pluginId} ${action.enabled ? "enabled" : "disabled"}.`, sink);
    } catch (error) {
      sink("plugins", {
        status: "error",
        title: action.title,
        error: formatConfigWriteError(error, "Plugin config write"),
        entries: [],
      });
    }
  }, [client, dispatch, ensureConnected, openCommandPanel, refreshPluginsPanel, workspace]);

  const setThreadMemoryModeFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "setThreadMemoryMode" }>,
    sink: CommandPanelSink = openCommandPanel,
  ) => {
    sink("generic", {
      status: "loading",
      title: action.title,
      message: "Updating memory mode...",
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
      await client.request("thread/memoryMode/set", {
        threadId: action.threadId,
        mode: action.mode,
      }, 120_000);
      const enabled = action.mode === "enabled";
      sink("generic", {
        status: "ready",
        title: action.title,
        message: `Current chat memory generation ${enabled ? "enabled" : "disabled"}.`,
        entries: [{
          id: `memories:thread:${action.threadId}:saved`,
          title: "Current chat memory generation",
          kind: "status",
          status: action.mode,
          meta: `thread ${action.threadId}`,
          details: ["thread/memoryMode/set accepted by app-server."],
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
  }, [client, ensureConnected, openCommandPanel]);

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
    if (action.type === "createStarterSkill") {
      void createStarterSkillFromPanel(action, sink);
      return;
    }
    if (action.type === "readPluginSkill") {
      void readPluginSkillFromPanel(action, sink);
      return;
    }
    if (action.type === "insertLocalCommand") {
      setInput((current) => current.trim() ? `${current.trimEnd()}\n${action.command}` : action.command);
      setCommandPanel(null);
      setActiveSettingsPanel(null);
      dispatch({ type: "log", text: action.message, level: "info" });
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
    if (action.type === "checkoutPluginShare") {
      void checkoutPluginShareFromPanel(action, sink);
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
    if (action.type === "setThreadMemoryMode") {
      void setThreadMemoryModeFromPanel(action, sink);
      return;
    }
    if (action.type === "setThreadPinned") {
      if (!setThreadPinnedById) {
        sink("generic", {
          status: "error",
          title: action.title,
          error: "Thread pinning is unavailable.",
          entries: [],
        });
        return;
      }
      setThreadPinnedById(action.threadId, action.pinned);
      setCommandPanel(null);
      setActiveSettingsPanel(null);
      dispatch({
        type: "log",
        text: `Chat ${action.pinned ? "pinned" : "unpinned"}.`,
        level: "info",
      });
      return;
    }
    if (action.type === "setUiTheme") {
      setUiThemeMode?.(action.mode);
      sink("theme", {
        status: "ready",
        title: action.title,
        message: `${themeModeLabel(action.mode)} theme selected.`,
        entries: [{
          id: `theme:${action.mode}:saved`,
          title: themeModeLabel(action.mode),
          kind: "theme",
          status: "selected",
          meta: "Saved locally",
        }],
      });
      dispatch({ type: "log", text: `${themeModeLabel(action.mode)} theme selected.`, level: "info" });
      return;
    }
    /*
     * CODEX-REF: settings.general.appearance.codeFontSize.row mutation.
     * Codex Desktop persists onBlur of a number input; HiCodex commits each
     * +/- button click directly, sharing the same `size: number` payload.
     */
    if (action.type === "setCodeFontSize") {
      setUiCodeFontSize?.(action.size);
      sink("generic", {
        status: "ready",
        title: action.title,
        message: `Code font size set to ${action.size} px.`,
        entries: [{
          id: `code-font-size:${action.size}:saved`,
          title: `${action.size} px`,
          kind: "status",
          status: "selected",
          meta: "Saved locally",
        }],
      });
      dispatch({ type: "log", text: `Code font size set to ${action.size} px.`, level: "info" });
      return;
    }
    /*
     * CODEX-REF: settings.general.appearance.reducedMotion.label mutation —
     * mode is one of "system" / "on" / "off" matching the Codex option IDs.
     */
    if (action.type === "setReducedMotion") {
      setUiReducedMotion?.(action.mode);
      const label = reducedMotionLabel(action.mode);
      sink("generic", {
        status: "ready",
        title: action.title,
        message: `Reduced motion: ${label}.`,
        entries: [{
          id: `reduced-motion:${action.mode}:saved`,
          title: label,
          kind: "status",
          status: "selected",
          meta: "Saved locally",
        }],
      });
      dispatch({ type: "log", text: `Reduced motion: ${label}.`, level: "info" });
      return;
    }
    /*
     * CODEX-REF: keyboard-shortcuts-settings-*.js — type=set/replace
     * mutation. Accelerator is null when the user intentionally unbinds the
     * command. The setter mirrors React state + module singleton in
     * keymap-overrides.ts so accelerator resolvers see the new value
     * immediately (no Tauri command needed, webview-scoped).
     */
    if (action.type === "setKeyboardShortcut") {
      setUiKeyboardShortcut?.(action.commandId, action.accelerator);
      const description = action.accelerator
        ? `Set ${action.commandId} to ${action.accelerator}.`
        : `Unbound ${action.commandId}.`;
      dispatch({ type: "log", text: description, level: "info" });
      return;
    }
    /*
     * CODEX-REF: keyboard-shortcuts-settings-*.js — type=reset mutation.
     */
    if (action.type === "resetKeyboardShortcut") {
      resetUiKeyboardShortcut?.(action.commandId);
      dispatch({ type: "log", text: `Reset ${action.commandId} keybinding.`, level: "info" });
      return;
    }
    if (action.type === "setUiLocale") {
      setUiLocale?.(action.locale);
      const label = localeLabel(action.locale);
      sink("generic", {
        status: "ready",
        title: action.title,
        message: `${label} language selected.`,
        entries: [{
          id: `locale:${action.locale}:saved`,
          title: label,
          kind: "status",
          status: "selected",
          meta: "Saved locally",
        }],
      });
      dispatch({ type: "log", text: `${label} language selected.`, level: "info" });
      return;
    }
    if (action.type === "setNotificationPreferences") {
      const fallback = notificationPreferences ?? {
        turnCompletionPolicy: "backgroundOnly" as const,
        sound: true,
      };
      const next = setNotificationPreferences?.(action.patch)
        ?? mergeNotificationPreferences(fallback, action.patch);
      const status = notificationPolicyLabel(next.turnCompletionPolicy);
      sink("generic", {
        status: "ready",
        title: "Notifications",
        message: `Turn completion notifications: ${status}; ${notificationSoundLabel(next.sound).toLowerCase()}.`,
        entries: [projectNotificationSettingsEntry(next)],
      });
      dispatch({
        type: "log",
        text: `Turn completion notifications set to ${status}; ${notificationSoundLabel(next.sound).toLowerCase()}.`,
        level: "info",
      });
      return;
    }
    if (action.type === "runSlashCommand") {
      setCommandPanel(null);
      setActiveSettingsPanel(null);
      runSlashCommand?.(action.commandId);
      return;
    }
    if (action.type === "openFileSearch") {
      setActiveSettingsPanel(null);
      openFileSearchPanel?.();
      return;
    }
    if (action.type === "copyText") {
      const clipboard = globalThis.navigator?.clipboard;
      if (!clipboard?.writeText) {
        sink("generic", {
          status: "error",
          title: action.title,
          error: "Clipboard API is unavailable.",
          entries: [],
        });
        return;
      }
      void clipboard.writeText(action.text)
        .then(() => {
          dispatch({ type: "log", text: `Copied ${action.label}`, level: "info" });
          sink("generic", {
            status: "ready",
            title: action.title,
            message: `Copied ${action.label}`,
            entries: [],
          });
        })
        .catch((error) => {
          sink("generic", {
            status: "error",
            title: action.title,
            error: formatError(error),
            entries: [],
          });
        });
      return;
    }
    if (action.type === "scrollToContentUnit") {
      const target = Array.from(document.querySelectorAll<HTMLElement>("[data-content-search-unit-key]"))
        .find((element) => element.dataset.contentSearchUnitKey === action.unitKey);
      if (!target) {
        dispatch({ type: "log", text: `Thread result is no longer mounted: ${action.title}`, level: "warn" });
        return;
      }
      setCommandPanel(null);
      setActiveSettingsPanel(null);
      target.scrollIntoView({ block: "center" });
      target.classList.add("hc-thread-find-flash");
      window.setTimeout(() => target.classList.remove("hc-thread-find-flash"), 1200);
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
    checkoutPluginShareFromPanel,
    connectRequiredAppFromPanel,
    createStarterSkillFromPanel,
    installPluginFromPanel,
    loginMcpServerFromPanel,
    openCommandPanel,
    openExternalUrlFromPanel,
    readMcpResourceFromPanel,
    readPluginSkillFromPanel,
    readSkillFileFromPanel,
    refreshMcpServersPanel,
    refreshPluginsPanel,
    reloadMcpServersFromPanel,
    removeMcpServerFromPanel,
    setActiveSettingsPanel,
    setCommandPanel,
    setComposerAttachments,
    setInput,
    setThreadMemoryModeFromPanel,
    setMcpServerForm,
    setMcpToolForm,
    setUiLocale,
    setUiThemeMode,
    setUiCodeFontSize,
    setUiReducedMotion,
    setUiKeyboardShortcut,
    resetUiKeyboardShortcut,
    notificationPreferences,
    setNotificationPreferences,
    runSlashCommand,
    openFileSearchPanel,
    setThreadPinnedById,
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
    checkoutPluginShareFromPanel,
    installPluginFromPanel,
    loginMcpServerFromPanel,
    openExternalUrlFromPanel,
    reloadMcpServersFromPanel,
    removeMcpServerFromPanel,
    readMcpResourceFromPanel,
    readPluginSkillFromPanel,
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

async function fsPathExists(client: CodexJsonRpcClient, path: string): Promise<boolean> {
  try {
    await client.request("fs/getMetadata", { path }, 120_000);
    return true;
  } catch {
    return false;
  }
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
