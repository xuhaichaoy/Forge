import { formatError } from "../lib/format";
import type { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import type { CodexUiState } from "./codex-reducer";
import { loadAllApps } from "./app-list";
import {
  createCommandPanelState,
  projectCommandPanelEntries,
  projectPluginEntries,
  projectSkillManagementEntries,
  type CommandPanelEntry,
  type CommandPanelKind,
  type CommandPanelOptions,
  type CommandPanelState,
} from "./command-panel";
import type { SettingsPanelId } from "./composer-workflow";
import {
  HICODEX_IMAGE_TOOL_NAME,
} from "./image-generation-tool";
import type { HiCodexLocale } from "./i18n";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from "./notification-preferences";
import {
  projectMcpManagementEntries,
  type McpServerStartupStatus,
} from "./mcp-skills-management";
import {
  generalSettingsEntries,
  imageGenerationCapabilityEntries,
  localSettingsEntries,
  modelSettingsEntries,
  settingsPanelCommandKind,
  settingsPanelTitle,
} from "./settings-panel-workflow";
import type { UiThemeSnapshot } from "./theme";

const MCP_RELOAD_RESTART_MESSAGE =
  "Reloaded MCP config. New threads use refreshed servers; running threads may need a thread restart or another MCP reload before tool changes appear.";

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
  notificationPreferences?: NotificationPreferences;
  uiLocale?: HiCodexLocale;
  uiTheme?: UiThemeSnapshot;
}

export async function loadMcpManagementEntries({
  client,
  forceReload = false,
  startupStatuses,
  workspace,
}: {
  client: CodexJsonRpcClient;
  forceReload?: boolean;
  startupStatuses: Record<string, McpServerStartupStatus | undefined> | null | undefined;
  workspace?: string;
}): Promise<CommandPanelEntry[]> {
  if (forceReload) {
    await client.request("config/mcpServer/reload", undefined, 120_000);
  }
  const [result, configReadResult] = await Promise.all([
    client.request<unknown>("mcpServerStatus/list", { limit: 50, detail: "full" }, 120_000),
    client.request<unknown>("config/read", {
      includeLayers: true,
      cwd: workspace?.trim() ? workspace.trim() : null,
    }, 120_000),
  ]);
  return projectMcpManagementEntries(result, startupStatuses, { configReadResult });
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
  notificationPreferences = DEFAULT_NOTIFICATION_PREFERENCES,
  uiLocale,
  uiTheme,
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
        uiLocale,
        uiTheme,
        workspace,
        notificationPreferences,
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
      const entries = await loadMcpManagementEntries({
        client,
        forceReload,
        startupStatuses: state.mcpServerStartupStatuses,
        workspace,
      });
      openSettingsPanelContent("mcp", {
        status: "ready",
        title,
        message: forceReload ? MCP_RELOAD_RESTART_MESSAGE : "Select a tool to call it, or a resource to read it.",
        entries,
      });
      return;
    }
    if (panel === "skills") {
      const result = await client.request<unknown>("skills/list", {
        cwds: workspace.trim() ? [workspace.trim()] : [],
        forceReload,
      }, 120_000);
      const recommendedSkills = await loadRecommendedSkillPluginDetails(client, workspace);
      openSettingsPanelContent("skills", {
        status: "ready",
        title,
        message: forceReload
          ? "Reloaded skills from disk. Recommended Skills are derived from plugin/skill metadata when available."
          : "Select a skill to attach, view, enable, disable, or inspect local helper boundaries.",
        entries: projectSkillManagementEntries(result, {
          recommendedSkills,
          workspace,
        }),
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
      const result = await loadAllApps(client, { forceRefetch: forceReload, threadId: state.activeThreadId });
      openSettingsPanelContent("apps", { status: "ready", title, entries: projectCommandPanelEntries({ apps: result }) });
      return;
    }
    if (panel === "plugins") {
      const [result, apps] = await Promise.allSettled([
        client.request<unknown>("plugin/list", {
          cwds: workspace.trim() ? [workspace.trim()] : null,
        }, 120_000),
        loadAllApps(client, { forceRefetch: forceReload, threadId: state.activeThreadId }),
      ]);
      if (result.status === "rejected") throw result.reason;
      openSettingsPanelContent("plugins", {
        status: "ready",
        title,
        entries: projectPluginEntries(result.value, { apps: apps.status === "fulfilled" ? apps.value : undefined }),
      });
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

export async function loadRecommendedSkillPluginDetails(
  client: CodexJsonRpcClient,
  workspace: string,
): Promise<unknown[]> {
  try {
    const pluginList = await client.request<unknown>("plugin/list", {
      cwds: workspace.trim() ? [workspace.trim()] : null,
    }, 120_000);
    const candidates = recommendedPluginReadCandidates(pluginList).slice(0, 8);
    if (candidates.length === 0) return [];
    const results = await Promise.allSettled(candidates.map((candidate) =>
      client.request<unknown>("plugin/read", {
        marketplacePath: candidate.marketplacePath,
        remoteMarketplaceName: candidate.marketplacePath ? null : candidate.marketplaceName,
        pluginName: candidate.marketplacePath ? candidate.pluginName : candidate.pluginId,
      }, 120_000)
    ));
    return results
      .filter((result): result is PromiseFulfilledResult<unknown> => result.status === "fulfilled")
      .map((result) => result.value);
  } catch {
    return [];
  }
}

function recommendedPluginReadCandidates(value: unknown): Array<{
  marketplaceName: string;
  marketplacePath: string | null;
  pluginId: string;
  pluginName: string;
}> {
  const root = recordObject(value);
  const featured = new Set(stringArray(root.featuredPluginIds));
  const candidates: Array<{
    installed: boolean;
    featured: boolean;
    marketplaceName: string;
    marketplacePath: string | null;
    pluginId: string;
    pluginName: string;
  }> = [];
  for (const marketplace of recordArray(root.marketplaces)) {
    const marketplaceName = fieldText(marketplace, "name") || "Unknown marketplace";
    const marketplacePath = fieldText(marketplace, "path") || null;
    for (const plugin of recordArray(marketplace.plugins)) {
      const pluginId = fieldText(plugin, "id") || fieldText(plugin, "remotePluginId") || fieldText(plugin, "name");
      if (!pluginId) continue;
      candidates.push({
        installed: plugin.installed === true,
        featured: featured.has(pluginId),
        marketplaceName,
        marketplacePath,
        pluginId,
        pluginName: fieldText(plugin, "name") || pluginId,
      });
    }
  }
  return candidates
    .filter((candidate) => candidate.installed || candidate.featured)
    .sort((a, b) => Number(b.installed) - Number(a.installed) || Number(b.featured) - Number(a.featured))
    .map(({ installed: _installed, featured: _featured, ...candidate }) => candidate);
}

function recordObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> =>
    Boolean(item) && typeof item === "object" && !Array.isArray(item)
  ) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)
    : [];
}

function fieldText(value: unknown, key: string): string {
  const record = recordObject(value);
  const field = record[key];
  if (typeof field === "string") return field.trim();
  if (typeof field === "number" || typeof field === "boolean" || typeof field === "bigint") return String(field);
  return "";
}
