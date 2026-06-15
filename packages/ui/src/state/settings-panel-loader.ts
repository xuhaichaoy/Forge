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
import {
  loadBrowserRuntimeSettingsEntries,
} from "./browser-runtime";
import {
  loadComputerUseReadiness,
  loadComputerUseMcpReadinessEntries,
  loadComputerUseReadinessEntries,
  projectComputerUseMcpReadinessEntries,
  projectComputerUseReadinessEntries,
} from "./computer-use-readiness";
import type { SettingsPanelId } from "./composer-workflow";
import {
  FORGE_IMAGE_TOOL_NAME,
} from "./image-generation-tool";
import {
  filterHooksListResponseForFocus,
  hooksSettingsFocusMessage,
  type HooksSettingsFocus,
} from "./hooks-review";
import type { ForgeLocale } from "./i18n";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from "./notification-preferences";
import {
  projectMcpManagementEntries,
  type McpServerStartupStatus,
} from "./mcp-skills-management";
import {
  desktopBackedLocalSettingsEntries,
  generalSettingsEntries,
  imageGenerationCapabilityEntries,
  isDesktopBackedLocalSettingsPanel,
  isPluginBackedDesktopSettingsPanel,
  localSettingsEntries,
  modelSettingsEntries,
  pluginBackedDesktopSettingsFallbackEntry,
  pluginBackedDesktopSettingsInfo,
  type PluginBackedDesktopSettingsPanel,
  settingsPanelCommandKind,
  settingsPanelTitle,
} from "./settings-panel-workflow";
import type { UiThemeSnapshot } from "./theme";
import type { UiAppearancePreferences } from "./appearance";
import {
  DEFAULT_WORKTREE_HOST_API,
  projectWorktreesSettingsEntries,
  readCurrentHostGitStatus,
  type ComposerWorkMode,
  type PendingWorktree,
  type WorktreeHostApi,
} from "./worktrees";

const MCP_RELOAD_RESTART_MESSAGE =
  "Reloaded MCP config. New threads use refreshed servers; running threads may need a thread restart or another MCP reload before tool changes appear.";

export interface LoadSettingsPanelContentOptions {
  activeTurnId: string | null;
  client: CodexJsonRpcClient;
  ensureConnected: () => Promise<boolean>;
  forceReload?: boolean;
  hooksFocus?: HooksSettingsFocus | null;
  includeImageDynamicTool: boolean;
  openSettingsPanelContent: (panel: CommandPanelKind, options?: CommandPanelOptions) => void;
  panel: SettingsPanelId;
  setSettingsPanelState: (state: CommandPanelState) => void;
  state: CodexUiState;
  workspace: string;
  notificationPreferences?: NotificationPreferences;
  uiLocale?: ForgeLocale;
  uiTheme?: UiThemeSnapshot;
  /*
   * CODEX-REF: appearance-settings-*.js §4 + §8. Adding Code font size
   * and Reduce motion entries to the Appearance panel; loader forwards the
   * current snapshot so the entries render with live values.
   */
  uiAppearance?: UiAppearancePreferences;
  workMode?: ComposerWorkMode;
  pendingWorktree?: PendingWorktree | null;
  worktreeHostApi?: WorktreeHostApi;
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

export async function loadPluginManagementEntries({
  client,
  forceReload = false,
  threadId,
  workspace,
}: {
  client: CodexJsonRpcClient;
  forceReload?: boolean;
  threadId?: string | null;
  workspace?: string;
}): Promise<CommandPanelEntry[]> {
  const cwds = workspace?.trim() ? [workspace.trim()] : null;
  const [marketplace, extraMarketplaces, installed, shares, apps] = await Promise.allSettled([
    client.request<unknown>("plugin/list", { cwds }, 120_000),
    client.request<unknown>("plugin/list", {
      cwds,
      marketplaceKinds: ["workspace-directory", "shared-with-me"],
    }, 120_000),
    client.request<unknown>("plugin/installed", { cwds }, 120_000),
    client.request<unknown>("plugin/share/list", {}, 120_000),
    loadAllApps(client, { forceRefetch: forceReload, threadId }),
  ]);
  if (marketplace.status === "rejected") throw marketplace.reason;
  return projectPluginEntries(marketplace.value, {
    additionalLists: extraMarketplaces.status === "fulfilled" ? [extraMarketplaces.value] : [],
    apps: apps.status === "fulfilled" ? apps.value : undefined,
    installed: installed.status === "fulfilled" ? installed.value : undefined,
    shares: shares.status === "fulfilled" ? shares.value : undefined,
  });
}

export async function loadSettingsPanelContent({
  activeTurnId,
  client,
  ensureConnected,
  forceReload = false,
  hooksFocus = null,
  includeImageDynamicTool,
  openSettingsPanelContent,
  panel,
  setSettingsPanelState,
  state,
  workspace,
  notificationPreferences = DEFAULT_NOTIFICATION_PREFERENCES,
  uiLocale,
  uiTheme,
  workMode = "local",
  pendingWorktree = null,
  worktreeHostApi = DEFAULT_WORKTREE_HOST_API,
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
        dynamicToolName: FORGE_IMAGE_TOOL_NAME,
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
          dynamicToolName: FORGE_IMAGE_TOOL_NAME,
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
          dynamicToolName: FORGE_IMAGE_TOOL_NAME,
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
          dynamicToolName: FORGE_IMAGE_TOOL_NAME,
          error: message,
        }),
      }));
    }
    return;
  }

  /*
   * CODEX-REF: appearance-settings-*.js. The panel is now rendered by
   * AppearanceSettingsPanel directly inside SettingsPanel — bespoke 3-row
   * inline editor with segmented toggles + number input — rather than via a
   * flat CommandPanelEntry list. Loader still sets a minimal panel state so
   * downstream consumers don't see a stale entry list from the previous
   * activeSettingsPanel.
   */
  if (panel === "appearance") {
    setSettingsPanelState(createCommandPanelState("generic", {
      status: "ready",
      title: "Appearance",
      message: "",
      entries: [],
    }));
    return;
  }

  /*
   * CODEX-REF: keyboard-shortcuts-settings-*.js. The panel is now
   * rendered by KeyboardShortcutsSettingsPanel (inline 3-column table +
   * capture-in-row) directly inside SettingsPanel, bypassing the
   * CommandPanelEntry pipeline entirely because Codex's row layout is a
   * 3-column table with capture-mode column swap that doesn't map onto a
   * flat entry list. The loader still sets a minimal panel state so
   * SettingsCommandContent doesn't render its empty-state fallback if the
   * branch is ever bypassed; the component path takes priority in
   * model-settings-panel.tsx.
   */
  if (panel === "keyboard-shortcuts") {
    setSettingsPanelState(createCommandPanelState("generic", {
      status: "ready",
      title: "Keyboard shortcuts",
      message: "",
      entries: [],
    }));
    return;
  }

  if (isPluginBackedDesktopSettingsPanel(panel)) {
    const title = settingsPanelTitle(panel);
    const info = pluginBackedDesktopSettingsInfo(panel);
    setSettingsPanelState(createCommandPanelState("generic", {
      status: "loading",
      title,
      message: info.message,
      entries: [pluginBackedDesktopSettingsFallbackEntry(panel, {
        connected: state.connected,
      })],
    }));
    if (!(await ensureConnected())) {
      const entries = await pluginBackedDesktopSettingsPanelEntries(panel, [pluginBackedDesktopSettingsFallbackEntry(panel, {
        connected: false,
      })], state.hostStatus?.codexHome ?? null, {
        mcpReadinessEntries: projectComputerUseMcpReadinessEntries(
          null,
          state.mcpServerStartupStatuses,
          "Runtime is offline.",
        ),
      });
      setSettingsPanelState(createCommandPanelState("generic", {
        status: "error",
        title,
        message: "Runtime is offline. Plugin lifecycle data could not be loaded.",
        entries,
      }));
      return;
    }
    try {
      const pluginEntries = await loadPluginManagementEntries({
        client,
        forceReload,
        threadId: state.activeThreadId,
        workspace,
      });
      const computerUseReadiness = panel === "computer-use"
        ? await loadComputerUseReadiness(state.hostStatus?.codexHome ?? null)
        : null;
      const mcpReadinessEntries = panel === "computer-use"
        ? await loadComputerUseMcpReadinessEntries(client, state.mcpServerStartupStatuses, {
            activeThreadId: state.activeThreadId,
            nativeReadiness: computerUseReadiness,
          })
        : undefined;
      setSettingsPanelState(createCommandPanelState("generic", {
        status: "ready",
        title,
        message: forceReload ? `Refreshed ${title} plugin lifecycle data.` : info.message,
        entries: await pluginBackedDesktopSettingsPanelEntries(
          panel,
          pluginEntries,
          state.hostStatus?.codexHome ?? null,
          {
            computerUseReadinessEntries: computerUseReadiness
              ? projectComputerUseReadinessEntries(computerUseReadiness, state.hostStatus?.codexHome ?? null)
              : undefined,
            mcpReadinessEntries,
          },
        ),
      }));
    } catch (error) {
      const message = formatError(error);
      const entries = await pluginBackedDesktopSettingsPanelEntries(panel, [pluginBackedDesktopSettingsFallbackEntry(panel, {
        connected: true,
        error: message,
      })], state.hostStatus?.codexHome ?? null, {
        mcpReadinessEntries: panel === "computer-use"
          ? projectComputerUseMcpReadinessEntries(null, state.mcpServerStartupStatuses, message)
          : undefined,
      });
      setSettingsPanelState(createCommandPanelState("generic", {
        status: "error",
        title,
        message: `Could not load ${title} plugin lifecycle data: ${message}`,
        entries,
      }));
    }
    return;
  }

  if (isDesktopBackedLocalSettingsPanel(panel)) {
    const title = settingsPanelTitle(panel);
    setSettingsPanelState(createCommandPanelState("generic", {
      status: "ready",
      title,
      message: "",
      entries: desktopBackedLocalSettingsEntries(panel, {
        connected: state.connected,
      }),
    }));
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
        modelProvider: state.threadContextDefaults?.modelProvider ?? null,
        modelCount: state.models.length,
        models: state.models,
        pendingRequestCount: state.pendingRequests.length,
        pid: state.hostStatus?.pid ?? null,
        serviceTier: state.threadContextDefaults?.serviceTier,
        uiLocale,
        uiTheme,
        workspace,
        notificationPreferences,
      }),
    }));
    return;
  }

  if (panel === "permissions" || panel === "approvals") {
    const title = panel === "permissions" ? "Permissions" : "Approvals";
    setSettingsPanelState(createCommandPanelState("generic", {
      status: "ready",
      title,
      entries: localSettingsEntries(panel, {
        pendingRequestCount: state.pendingRequests.length,
        threadContextDefaults: state.threadContextDefaults,
        connected: state.connected,
      }),
      message: "",
    }));
    if (!state.connected) return;
    try {
      const requirements = await client.request<unknown>("configRequirements/read", {}, 120_000);
      setSettingsPanelState(createCommandPanelState("generic", {
        status: "ready",
        title,
        entries: localSettingsEntries(panel, {
          pendingRequestCount: state.pendingRequests.length,
          threadContextDefaults: state.threadContextDefaults,
          connected: true,
          requirements,
        }),
        message: "Loaded runtime requirement gates from app-server.",
      }));
    } catch (error) {
      setSettingsPanelState(createCommandPanelState("generic", {
        status: "ready",
        title,
        entries: localSettingsEntries(panel, {
          pendingRequestCount: state.pendingRequests.length,
          threadContextDefaults: state.threadContextDefaults,
          connected: true,
          requirementsError: formatError(error),
        }),
        message: "Could not load runtime requirement gates.",
      }));
    }
    return;
  }

  if (panel === "worktrees") {
    const title = settingsPanelTitle(panel);
    const activeThread = state.activeThreadId
      ? state.threads.find((thread) => thread.id === state.activeThreadId) ?? null
      : null;
    const cwd = activeThread?.cwd?.trim() || workspace.trim() || state.hostStatus?.defaultCwd?.trim() || "";
    const tauriRuntimeAvailable = worktreeHostApi.isTauriRuntime();
    setSettingsPanelState(createCommandPanelState("generic", {
      status: "loading",
      title,
      entries: projectWorktreesSettingsEntries({
        activeThread,
        connected: state.connected,
        mode: workMode,
        pendingWorktree,
        tauriRuntimeAvailable,
        workspace: cwd,
      }),
    }));
    let hostGitStatus = null as Awaited<ReturnType<typeof readCurrentHostGitStatus>>;
    let hostGitStatusError: string | null = null;
    if (cwd) {
      try {
        hostGitStatus = await readCurrentHostGitStatus(cwd, worktreeHostApi);
      } catch (error) {
        hostGitStatusError = formatError(error);
      }
    }
    if (hostGitStatus) {
      setSettingsPanelState(createCommandPanelState("generic", {
        status: "ready",
        title,
        message: "Loaded Git status from the Tauri host. Worktree mode uses the returned repo root and pending path only.",
        entries: projectWorktreesSettingsEntries({
          activeThread,
          connected: state.connected,
          hostGitStatus,
          mode: workMode,
          pendingWorktree,
          tauriRuntimeAvailable,
          workspace: cwd,
        }),
      }));
      return;
    }
    const fallbackHostError = hostGitStatusError
      ?? (!tauriRuntimeAvailable
        ? "Tauri runtime unavailable"
        : "Tauri host readHostGitStatus unavailable");
    if (!(await ensureConnected())) {
      setSettingsPanelState(createCommandPanelState("generic", {
        status: "ready",
        title,
        message: "Host Git status is unavailable and runtime is offline. Showing local work mode overlay only.",
        entries: projectWorktreesSettingsEntries({
          activeThread,
          connected: false,
          hostGitStatusError: fallbackHostError,
          mode: workMode,
          pendingWorktree,
          tauriRuntimeAvailable,
          workspace: cwd,
        }),
      }));
      return;
    }
    let gitDiffResult: unknown = null;
    let gitDiffError: string | null = null;
    if (cwd) {
      try {
        gitDiffResult = await client.request<unknown>("gitDiffToRemote", { cwd }, 120_000);
      } catch (error) {
        gitDiffError = formatError(error);
      }
    }
    setSettingsPanelState(createCommandPanelState("generic", {
      status: "ready",
      title,
      message: gitDiffError
        ? "Host Git status is unavailable and protocol Git fallback returned an error."
        : "Host Git status is unavailable; showing protocol/overlay Git fallback.",
      entries: projectWorktreesSettingsEntries({
        activeThread,
        connected: true,
        gitDiffError,
        gitDiffResult,
        hostGitStatusError: fallbackHostError,
        mode: workMode,
        pendingWorktree,
        tauriRuntimeAvailable,
        workspace: cwd,
      }),
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
      const focusedResult = filterHooksListResponseForFocus(result, hooksFocus);
      openSettingsPanelContent("hooks", {
        status: "ready",
        title,
        message: hooksSettingsFocusMessage(hooksFocus),
        entries: projectCommandPanelEntries({ hooks: focusedResult }),
      });
      return;
    }
    if (panel === "apps") {
      const result = await loadAllApps(client, { forceRefetch: forceReload, threadId: state.activeThreadId });
      openSettingsPanelContent("apps", { status: "ready", title, entries: projectCommandPanelEntries({ apps: result }) });
      return;
    }
    if (panel === "plugins") {
      const entries = await loadPluginManagementEntries({
        client,
        forceReload,
        threadId: state.activeThreadId,
        workspace,
      });
      openSettingsPanelContent("plugins", {
        status: "ready",
        title,
        message: forceReload
          ? "Refreshed marketplace, installed plugins, and shared plugin checkout state."
          : "Install, enable, disable, uninstall, or checkout shared plugins from app-server plugin surfaces.",
        entries,
      });
      return;
    }
    if (panel === "experimental") {
      const result = await client.request<unknown>(
        "experimentalFeature/list",
        { limit: 50, threadId: state.activeThreadId ?? null },
        120_000,
      );
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
      const remotePluginId = fieldText(plugin, "remotePluginId");
      candidates.push({
        installed: plugin.installed === true,
        featured: [remotePluginId, pluginId, fieldText(plugin, "name")].some((candidate) => candidate && featured.has(candidate)),
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

export function pluginBackedDesktopSettingsEntries(
  panel: PluginBackedDesktopSettingsPanel,
  entries: CommandPanelEntry[],
): CommandPanelEntry[] {
  const info = pluginBackedDesktopSettingsInfo(panel);
  const aliases = new Set(info.pluginAliases.map(normalizePluginSettingsAlias).filter(Boolean));
  const matched = entries.filter((entry) => {
    const pluginId = entry.id.startsWith("plugin:") ? entry.id.slice("plugin:".length) : "";
    return pluginSettingsAliasCandidates(pluginId, entry.title)
      .some((candidate) => aliases.has(normalizePluginSettingsAlias(candidate)));
  });
  if (matched.length === 0) {
    return [pluginBackedDesktopSettingsFallbackEntry(panel, { connected: true })];
  }
  return matched.map((entry) => {
    const sourcedEntry = withPluginSettingsSource(entry, panel);
    return {
      ...sourcedEntry,
      details: [
        ...(sourcedEntry.details ?? []),
        ...info.limitationDetails,
        ...info.sourceDetails,
      ],
    };
  });
}

function pluginSettingsAliasCandidates(pluginId: string, title: string): string[] {
  return [
    pluginId,
    unqualifiedPluginSettingsAlias(pluginId),
    title,
  ].filter(Boolean);
}

function unqualifiedPluginSettingsAlias(value: string): string {
  const withoutPromptScheme = value.startsWith("plugin://") ? value.slice("plugin://".length) : value;
  return withoutPromptScheme.split("@", 1)[0] ?? withoutPromptScheme;
}

function withPluginSettingsSource(
  entry: CommandPanelEntry,
  panel: PluginBackedDesktopSettingsPanel,
): CommandPanelEntry {
  return {
    ...entry,
    action: withPluginSettingsActionSource(entry.action, panel),
    secondaryActions: entry.secondaryActions?.map((secondary) => ({
      ...secondary,
      action: withPluginSettingsActionSource(secondary.action, panel) ?? secondary.action,
    })),
  };
}

function withPluginSettingsActionSource(
  action: CommandPanelEntry["action"],
  panel: PluginBackedDesktopSettingsPanel,
): CommandPanelEntry["action"] {
  if (!action) return action;
  if (action.type === "installPlugin" || action.type === "uninstallPlugin" || action.type === "writePluginConfig") {
    return {
      ...action,
      sourceSettingsPanel: panel,
    };
  }
  return action;
}

function normalizePluginSettingsAlias(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export async function pluginBackedDesktopSettingsPanelEntries(
  panel: PluginBackedDesktopSettingsPanel,
  entries: CommandPanelEntry[],
  codexHome?: string | null,
  context: {
    computerUseReadinessEntries?: CommandPanelEntry[];
    mcpReadinessEntries?: CommandPanelEntry[];
  } = {},
): Promise<CommandPanelEntry[]> {
  const pluginEntries = pluginBackedDesktopSettingsEntries(panel, entries);
  if (panel === "browser-use") {
    return [
      ...pluginEntries,
      ...await loadBrowserRuntimeSettingsEntries(),
    ];
  }
  if (panel !== "computer-use") return pluginEntries;
  return [
    ...pluginEntries,
    ...(context.computerUseReadinessEntries ?? await loadComputerUseReadinessEntries(codexHome)),
    ...(context.mcpReadinessEntries ?? []),
  ];
}
