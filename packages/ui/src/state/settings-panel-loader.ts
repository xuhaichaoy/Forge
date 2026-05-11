import { formatError } from "../lib/format";
import type { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import type { CodexUiState } from "./codex-reducer";
import {
  createCommandPanelState,
  projectCommandPanelEntries,
  projectPluginEntries,
  type CommandPanelKind,
  type CommandPanelOptions,
  type CommandPanelState,
} from "./command-panel";
import type { SettingsPanelId } from "./composer-workflow";
import {
  HICODEX_IMAGE_TOOL_NAME,
} from "./image-generation-tool";
import {
  generalSettingsEntries,
  imageGenerationCapabilityEntries,
  localSettingsEntries,
  modelSettingsEntries,
  settingsPanelCommandKind,
  settingsPanelTitle,
} from "./settings-panel-workflow";

export interface LoadSettingsPanelContentOptions {
  activeTurnId: string | null;
  client: CodexJsonRpcClient;
  ensureConnected: () => Promise<boolean>;
  forceReload?: boolean;
  includeImageDynamicTool: boolean;
  openSettingsPanelContent: (panel: CommandPanelKind, options?: CommandPanelOptions) => void;
  panel: SettingsPanelId;
  setSettingsPanelState: (state: CommandPanelState) => void;
  state: CodexUiState;
  workspace: string;
}

export async function loadSettingsPanelContent({
  activeTurnId,
  client,
  ensureConnected,
  forceReload = false,
  includeImageDynamicTool,
  openSettingsPanelContent,
  panel,
  setSettingsPanelState,
  state,
  workspace,
}: LoadSettingsPanelContentOptions): Promise<void> {
  if (panel === "models") {
    setSettingsPanelState(createCommandPanelState("generic", {
      status: "ready",
      title: "Models",
      message: "",
      entries: modelSettingsEntries({
        activeModel: state.threadContextDefaults?.model ?? null,
        modelCount: state.models.length,
      }),
    }));
    return;
  }

  if (panel === "images") {
    const title = settingsPanelTitle(panel);
    setSettingsPanelState(createCommandPanelState("generic", {
      status: "loading",
      title,
      entries: imageGenerationCapabilityEntries({
        connected: state.connected,
        dynamicToolRegistered: includeImageDynamicTool,
        dynamicToolName: HICODEX_IMAGE_TOOL_NAME,
      }),
    }));
    if (!(await ensureConnected())) {
      setSettingsPanelState(createCommandPanelState("generic", {
        status: "error",
        title,
        error: "Runtime is offline.",
        entries: imageGenerationCapabilityEntries({
          connected: false,
          dynamicToolRegistered: includeImageDynamicTool,
          dynamicToolName: HICODEX_IMAGE_TOOL_NAME,
        }),
      }));
      return;
    }
    try {
      const capabilities = await client.request<unknown>("modelProvider/capabilities/read", {}, 120_000);
      setSettingsPanelState(createCommandPanelState("generic", {
        status: "ready",
        title,
        message: forceReload ? "Refreshed image generation capabilities." : "",
        entries: imageGenerationCapabilityEntries({
          capabilities,
          connected: true,
          dynamicToolRegistered: includeImageDynamicTool,
          dynamicToolName: HICODEX_IMAGE_TOOL_NAME,
        }),
      }));
    } catch (error) {
      const message = formatError(error);
      setSettingsPanelState(createCommandPanelState("generic", {
        status: "error",
        title,
        error: message,
        entries: imageGenerationCapabilityEntries({
          connected: true,
          dynamicToolRegistered: includeImageDynamicTool,
          dynamicToolName: HICODEX_IMAGE_TOOL_NAME,
          error: message,
        }),
      }));
    }
    return;
  }

  if (panel === "general") {
    setSettingsPanelState(createCommandPanelState("generic", {
      status: "ready",
      title: "General",
      message: "",
      entries: generalSettingsEntries({
        activeThreadId: state.activeThreadId,
        activeTurnId,
        codexHome: state.hostStatus?.codexHome ?? null,
        connected: state.connected,
        defaultCwd: state.hostStatus?.defaultCwd ?? null,
        model: state.threadContextDefaults?.model ?? null,
        modelCount: state.models.length,
        pendingRequestCount: state.pendingRequests.length,
        pid: state.hostStatus?.pid ?? null,
        workspace,
      }),
    }));
    return;
  }

  if (panel === "permissions" || panel === "approvals") {
    setSettingsPanelState(createCommandPanelState("generic", {
      status: "ready",
      title: panel === "permissions" ? "Permissions" : "Approvals",
      entries: localSettingsEntries(panel, {
        pendingRequestCount: state.pendingRequests.length,
        threadContextDefaults: state.threadContextDefaults,
        connected: state.connected,
      }),
      message: "",
    }));
    return;
  }

  const panelKind = settingsPanelCommandKind(panel);
  const title = settingsPanelTitle(panel);
  openSettingsPanelContent(panelKind, { status: "loading", title, entries: [] });
  if (!(await ensureConnected())) {
    openSettingsPanelContent(panelKind, {
      status: "error",
      title,
      error: "Runtime is offline.",
      entries: [],
    });
    return;
  }

  try {
    if (panel === "mcp") {
      await client.request("config/mcpServer/reload", undefined, 120_000);
      const result = await client.request<unknown>("mcpServerStatus/list", { limit: 50, detail: "full" }, 120_000);
      openSettingsPanelContent("mcp", {
        status: "ready",
        title,
        message: "Select a tool to call it, or a resource to read it.",
        entries: projectCommandPanelEntries({ mcp: result }),
      });
      return;
    }
    if (panel === "skills") {
      const result = await client.request<unknown>("skills/list", {
        cwds: workspace.trim() ? [workspace.trim()] : [],
        forceReload,
      }, 120_000);
      openSettingsPanelContent("skills", {
        status: "ready",
        title,
        message: forceReload ? "Reloaded skills from disk." : "Select a skill to attach, view, enable, or disable it.",
        entries: projectCommandPanelEntries({ skills: result }),
      });
      return;
    }
    if (panel === "hooks") {
      const result = await client.request<unknown>("hooks/list", {
        cwds: workspace.trim() ? [workspace.trim()] : [],
      }, 120_000);
      openSettingsPanelContent("hooks", { status: "ready", title, entries: projectCommandPanelEntries({ hooks: result }) });
      return;
    }
    if (panel === "apps") {
      const result = await client.request<unknown>("app/list", {
        limit: 50,
        threadId: state.activeThreadId,
      }, 120_000);
      openSettingsPanelContent("apps", { status: "ready", title, entries: projectCommandPanelEntries({ apps: result }) });
      return;
    }
    if (panel === "plugins") {
      const result = await client.request<unknown>("plugin/list", {
        cwds: workspace.trim() ? [workspace.trim()] : null,
      }, 120_000);
      openSettingsPanelContent("plugins", { status: "ready", title, entries: projectPluginEntries(result) });
      return;
    }
    if (panel === "experimental") {
      const result = await client.request<unknown>("experimentalFeature/list", { limit: 50 }, 120_000);
      openSettingsPanelContent("experimental", { status: "ready", title, entries: projectCommandPanelEntries({ experimental: result }) });
    }
  } catch (error) {
    openSettingsPanelContent(panelKind, {
      status: "error",
      title,
      error: formatError(error),
      entries: [],
    });
  }
}
