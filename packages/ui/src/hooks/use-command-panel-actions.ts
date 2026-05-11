import { useCallback, type Dispatch, type SetStateAction } from "react";
import { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
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
  projectSkillFileReadResultEntries,
  type CommandPanelEntry,
  type CommandPanelEntryAction,
  type CommandPanelKind,
  type CommandPanelOptions,
  type CommandPanelState,
} from "../state/command-panel";
import {
  appendSkillPromptText,
  decodeBase64Utf8,
} from "../state/app-shell-helpers";
import { refreshThreadContextDefaults } from "../state/thread-workflow";

export type CommandPanelSink = (panel: CommandPanelKind, options?: CommandPanelOptions) => void;
export type McpToolFormAction = Extract<NonNullable<CommandPanelEntry["action"]>, { type: "openMcpToolForm" }>;

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
  setMcpToolForm,
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
  setMcpToolForm: Dispatch<SetStateAction<McpToolFormAction | null>>;
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
      sink("mcp", {
        status: "ready",
        title: "MCP Servers",
        message: "Reloaded MCP config. Select a tool to call it, or a resource to read it.",
        entries: projectCommandPanelEntries({ mcp: result }),
      });
    } catch (error) {
      sink("mcp", {
        status: "error",
        title: action.title,
        error: formatError(error),
        entries: [],
      });
    }
  }, [client, ensureConnected, openCommandPanel]);

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
      setComposerAttachments((current) => mergeComposerAttachments(current, [{
        type: "skill",
        name: action.name,
        path: action.path,
      }]));
      const promptText = action.promptText;
      if (promptText) {
        setInput((current) => appendSkillPromptText(current, promptText));
      }
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
    if (action.type === "reloadMcpServers") {
      void reloadMcpServersFromPanel(action, sink);
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
    openCommandPanel,
    readMcpResourceFromPanel,
    readSkillFileFromPanel,
    reloadMcpServersFromPanel,
    setActiveSettingsPanel,
    setCommandPanel,
    setComposerAttachments,
    setInput,
    setMcpToolForm,
    writeConfigFromPanel,
    writeSkillConfigFromPanel,
  ]);

  const selectCommandPanelEntry = useCallback((entry: CommandPanelEntry) => {
    if (entry.disabled || !entry.action) return;
    selectCommandPanelAction(entry.action);
  }, [selectCommandPanelAction]);

  return {
    callMcpToolFromPanel,
    reloadMcpServersFromPanel,
    readMcpResourceFromPanel,
    readSkillFileFromPanel,
    selectCommandPanelAction,
    selectCommandPanelEntry,
    writeConfigFromPanel,
    writeSkillConfigFromPanel,
  };
}
