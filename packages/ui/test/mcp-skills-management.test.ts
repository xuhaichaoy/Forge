import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { McpSkillsManagementPanel } from "../src/components/mcp-skills-management-panel";
import {
  buildMcpServerConfig,
  initialMcpServerConfigFormValues,
} from "../src/components/mcp-server-config-form";
import type { CodexJsonRpcClient } from "../src/lib/codex-json-rpc-client";
import { initialCodexUiState } from "../src/state/codex-reducer";
import {
  createCommandPanelState,
  projectCommandPanelEntries,
  type CommandPanelKind,
  type CommandPanelOptions,
  type CommandPanelEntry,
  type CommandPanelState,
} from "../src/state/command-panel";
import {
  claimAppConnectOAuthCallback,
  markAppConnectOAuthPending,
  resetAppConnectOAuthPendingForTest,
} from "../src/state/app-connect-oauth";
import { loadSettingsPanelContent } from "../src/state/settings-panel-loader";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "../src/state/notification-preferences";
import {
  managementPanelSections,
  managementPanelSummary,
  normalizeMcpServerKey,
  projectMcpManagementEntries,
} from "../src/state/mcp-skills-management";

export default async function runMcpSkillsManagementTests(): Promise<void> {
  projectsMcpServersWithStartupErrors();
  projectsMcpConfigActionsFromEffectiveConfig();
  keepsRuntimeOnlyMcpServersReadOnlyWhenConfigHasNoServers();
  normalizesMcpServerKeysLikeDesktop();
  buildsMcpServerConfigPayloads();
  initializesAndPreservesExistingMcpServerConfig();
  projectsSkillsWithMetadataAndActions();
  projectsPluginsWithMarketplaceSectionsAndActions();
  rendersReusableManagementPanelControls();
  await reloadsMcpConfigOnlyForForcedReloads();
  await loadsSkillRecommendationsAndCreatorForSettingsPanel();
  await loadsPluginsMarketplaceInstalledAndSharedForSettingsPanel();
  await loadsExperimentalFeaturesForActiveThreadInSettingsPanel();
  registersMcpOauthPendingOnlyWhenAuthorizationUrlHasState();
}

function projectsMcpServersWithStartupErrors(): void {
  const entries = projectMcpManagementEntries(
    {
      data: [{
        name: "github",
        tools: {
          list_prs: { description: "List pull requests" },
        },
        resources: [{
          name: "README",
          uri: "file:///workspace/README.md",
          mimeType: "text/markdown",
        }],
        resourceTemplates: [{
          name: "File",
          uriTemplate: "file:///{path}",
        }],
        authStatus: "notLoggedIn",
      }],
    },
    {
      github: {
        status: "failed",
        error: "command not found: gh",
        updatedAt: 1,
      },
    },
  );

  const summary = managementPanelSummary("mcp", entries);
  assertEqual(summary.find((item) => item.id === "mcp:startup-errors")?.value, 1, "startup errors should be counted");
  assertEqual(summary.find((item) => item.id === "mcp:auth")?.value, 1, "auth-needed MCP servers should be counted");

  const sections = managementPanelSections("mcp", entries);
  assertEqual(sections.length, 2, "add-server plus one MCP server should become management sections");
  assertEqual(sections[0]?.entries[0]?.action?.type, "openMcpServerForm", "MCP management should expose add-server form");
  assertIncludes(sections[1]?.meta ?? "", "startup failed", "MCP section meta should show startup status");
  assertIncludes(
    collectEntryText(sections[1]?.entries ?? []),
    "Startup error: command not found: gh",
    "MCP startup error should stay visible in management details",
  );
  assertDeepEqual(
    sections[1]?.entries.map((entry) => entry.kind),
    ["mcpServer", "mcpTool", "mcpResource", "mcpResourceTemplate"],
    "MCP section should keep server, tools, resources, and templates grouped",
  );
  assertEqual(
    sections[1]?.entries[0]?.secondaryActions?.some((action) => action.action.type === "openMcpServerForm"),
    true,
    "MCP server rows should expose edit config action",
  );
  assertEqual(
    sections[1]?.entries[0]?.secondaryActions?.some((action) => action.action.type === "removeMcpServer"),
    true,
    "MCP server rows should expose remove config action",
  );
}

function projectsMcpConfigActionsFromEffectiveConfig(): void {
  const entries = projectMcpManagementEntries(
    {
      data: [
        { name: "user-server", tools: {}, resources: [], resourceTemplates: [], authStatus: "unsupported" },
        { name: "project-server", tools: {}, resources: [], resourceTemplates: [], authStatus: "unsupported" },
      ],
    },
    null,
    {
      configReadResult: {
        config: {
          mcp_servers: {
            "user-server": { command: "node", enabled: true },
            "project-server": { url: "https://project.example/mcp", enabled: true },
          },
        },
        origins: {
          "mcp_servers.user-server.command": { name: { type: "user", file: "/Users/me/.codex/config.toml" }, version: "1" },
          "mcp_servers.project-server.url": { name: { type: "project", dotCodexFolder: "/workspace/.codex" }, version: "1" },
        },
        layers: [
          { name: { type: "user", file: "/Users/me/.codex/config.toml" }, version: "1", config: {}, disabledReason: null },
        ],
      },
    },
  );

  const userServer = entries.find((entry) => entry.id === "mcp:user-server");
  assertDeepEqual(
    entries.find((entry) => entry.id === "mcp:add-server")?.action,
    {
      type: "openMcpServerForm",
      title: "Add MCP server",
      mode: "add",
      existingServers: ["user-server", "project-server"],
      configWriteTarget: { filePath: "/Users/me/.codex/config.toml", expectedVersion: "1" },
    },
    "add action should carry the current user config write target from config/read layers",
  );
  assertDeepEqual(
    userServer?.secondaryActions?.map((action) => action.label),
    // codex settings.mcp: per-server control "Settings" + removal "Uninstall".
    ["Reload", "Disable", "Settings", "Uninstall"],
    "user-scope MCP servers should expose reload plus enable/settings/uninstall config actions",
  );
  assertDeepEqual(
    userServer?.secondaryActions?.find((action) => action.label === "Disable")?.action,
    {
      type: "writeMcpServerConfig",
      title: "Disable user-server",
      name: "user-server",
      config: { command: "node", enabled: false },
      configWriteTarget: { filePath: "/Users/me/.codex/config.toml", expectedVersion: "1" },
    },
    "enable/disable action should carry filePath and expectedVersion for config/batchWrite",
  );
  assertDeepEqual(
    userServer?.secondaryActions?.find((action) => action.label === "Settings")?.action,
    {
      type: "openMcpServerForm",
      title: "Edit user-server",
      mode: "edit",
      server: "user-server",
      existingServers: ["user-server", "project-server"],
      serverConfig: { command: "node", enabled: true },
      configWriteTarget: { filePath: "/Users/me/.codex/config.toml", expectedVersion: "1" },
    },
    "edit action should carry the current server key, existing keys, and effective config",
  );

  const projectServer = entries.find((entry) => entry.id === "mcp:project-server");
  assertDeepEqual(
    projectServer?.secondaryActions?.map((action) => action.label),
    ["Reload"],
    "project-scope MCP servers should not expose edit/remove/enable actions",
  );
}

function keepsRuntimeOnlyMcpServersReadOnlyWhenConfigHasNoServers(): void {
  const entries = projectMcpManagementEntries(
    {
      data: [
        { name: "runtime-server", tools: {}, resources: [], resourceTemplates: [], authStatus: "unsupported" },
      ],
    },
    null,
    {
      configReadResult: {
        config: {
          model: "gpt-5.2",
        },
        origins: {},
      },
    },
  );

  const runtimeServer = entries.find((entry) => entry.id === "mcp:runtime-server");
  assertDeepEqual(
    runtimeServer?.secondaryActions?.map((action) => action.label),
    ["Reload"],
    "runtime-only MCP servers should stay read-only when config/read has no mcp_servers table",
  );
}

function normalizesMcpServerKeysLikeDesktop(): void {
  assertEqual(
    normalizeMcpServerKey(" My Server!! ", ["my_server-", "my_server--2"]),
    "my_server--3",
    "MCP server keys should trim, underscore whitespace, replace invalid characters, lowercase, and resolve conflicts",
  );
  assertEqual(
    normalizeMcpServerKey("", ["custom-server", "custom-server-2"]),
    "custom-server-3",
    "blank MCP server labels should fall back to custom-server with conflict suffixes",
  );
  assertEqual(
    normalizeMcpServerKey("GitHub", ["github"], "github"),
    "github",
    "edit mode should not count the current key as a conflict",
  );
}

function buildsMcpServerConfigPayloads(): void {
  assertDeepEqual(
    buildMcpServerConfig({
      args: "-y\n@modelcontextprotocol/server-filesystem\n/workspace",
      baseConfig: undefined,
      bearerTokenEnvVar: "",
      command: "npx",
      currentKey: undefined,
      cwd: "/workspace",
      disabledTools: "",
      enabled: true,
      enabledTools: "search\nread",
      env: "TOKEN=abc",
      envVars: "",
      envHttpHeaders: "",
      existingServers: [],
      httpHeaders: "",
      name: "filesystem",
      required: true,
      startupTimeoutMs: "",
      startupTimeoutSec: "20",
      toolTimeoutSec: "90",
      transport: "stdio",
      url: "",
    }),
    {
      config: {
        enabled: true,
        required: true,
        enabled_tools: ["search", "read"],
        startup_timeout_sec: 20,
        tool_timeout_sec: 90,
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
        cwd: "/workspace",
        env: { TOKEN: "abc" },
      },
      errors: {},
      name: "filesystem",
    },
    "stdio MCP form values should build Codex mcp_servers config",
  );

  assertDeepEqual(
    buildMcpServerConfig({
      args: "",
      baseConfig: undefined,
      bearerTokenEnvVar: "TOKEN",
      command: "",
      currentKey: undefined,
      cwd: "",
      disabledTools: "write",
      enabled: false,
      enabledTools: "",
      env: "",
      envVars: "",
      envHttpHeaders: "Authorization=TOKEN",
      existingServers: [],
      httpHeaders: "X-App=codex",
      name: "linear",
      required: false,
      startupTimeoutMs: "20000",
      startupTimeoutSec: "",
      toolTimeoutSec: "",
      transport: "streamable_http",
      url: "https://linear.example/mcp",
    }),
    {
      config: {
        enabled: false,
        disabled_tools: ["write"],
        startup_timeout_ms: 20000,
        url: "https://linear.example/mcp",
        bearer_token_env_var: "TOKEN",
        http_headers: { "X-App": "codex" },
        env_http_headers: { Authorization: "TOKEN" },
      },
      errors: {},
      name: "linear",
    },
    "HTTP MCP form values should build streamable_http config",
  );
}

function initializesAndPreservesExistingMcpServerConfig(): void {
  const action = {
    type: "openMcpServerForm" as const,
    title: "Edit docs",
    mode: "edit" as const,
    server: "docs",
    existingServers: ["docs", "docs-2"],
    serverConfig: {
      command: "node",
      args: ["server.js"],
      env: { TOKEN: "abc" },
      env_vars: ["GITHUB_TOKEN"],
      enabled: false,
      startup_timeout_sec: 20,
      startup_timeout_ms: 20_000,
      tool_timeout_sec: 90,
      enabled_tools: ["search"],
      disabled_tools: ["write"],
      custom_field: { keep: true },
    },
  };
  const values = initialMcpServerConfigFormValues(action);
  assertDeepEqual(
    {
      args: values.args,
      command: values.command,
      enabled: values.enabled,
      enabledTools: values.enabledTools,
      disabledTools: values.disabledTools,
      env: values.env,
      envVars: values.envVars,
      name: values.name,
      startupTimeoutSec: values.startupTimeoutSec,
      startupTimeoutMs: values.startupTimeoutMs,
      toolTimeoutSec: values.toolTimeoutSec,
      transport: values.transport,
    },
    {
      args: "server.js",
      command: "node",
      enabled: false,
      enabledTools: "search",
      disabledTools: "write",
      env: "TOKEN=abc",
      envVars: "GITHUB_TOKEN",
      name: "docs",
      startupTimeoutSec: "20",
      startupTimeoutMs: "20000",
      toolTimeoutSec: "90",
      transport: "stdio",
    },
    "edit form should initialize from the existing MCP server config instead of blank defaults",
  );

  values.command = "node";
  values.args = "server.js\n--verbose";
  const result = buildMcpServerConfig(values);
  assertDeepEqual(
    result,
    {
      config: {
        command: "node",
        args: ["server.js", "--verbose"],
        env: { TOKEN: "abc" },
        env_vars: ["GITHUB_TOKEN"],
        enabled: false,
        startup_timeout_sec: 20,
        startup_timeout_ms: 20_000,
        tool_timeout_sec: 90,
        enabled_tools: ["search"],
        disabled_tools: ["write"],
        custom_field: { keep: true },
      },
      errors: {},
      name: "docs",
    },
    "saving an edit should preserve base and unknown MCP config fields",
  );
}

function projectsSkillsWithMetadataAndActions(): void {
  const entries: CommandPanelEntry[] = projectCommandPanelEntries({
    skills: {
      data: [{
        cwd: "/workspace",
        skills: [{
          name: "team:review",
          path: "/workspace/.codex/skills/review/SKILL.md",
          scope: "repo",
          enabled: false,
          interface: {
            displayName: "Review",
            shortDescription: "Review local changes.",
            defaultPrompt: "Review the current diff.",
          },
          dependencies: {
            tools: [{ type: "mcp", value: "github" }],
          },
        }],
        errors: [{ path: "/workspace/.codex/skills/bad/SKILL.md", message: "Invalid frontmatter" }],
      }],
    },
  });

  const summary = managementPanelSummary("skills", entries);
  assertEqual(summary.find((item) => item.id === "skills:disabled")?.value, 1, "disabled skills should be counted");
  assertEqual(summary.find((item) => item.id === "skills:errors")?.value, 1, "skill load errors should be counted");

  const sections = managementPanelSections("skills", entries);
  assertDeepEqual(
    sections.map((section) => section.title),
    ["Repo", "Load errors"],
    "skills should be grouped by scope plus load errors",
  );
  const skill = sections[0]?.entries[0];
  assertEqual(skill?.title, "Review", "skill displayName should drive management title");
  assertIncludes(collectEntryText([skill!]), "Default prompt: Review the current diff.", "default prompt should render");
  assertIncludes(collectEntryText([skill!]), "Tools: github", "dependencies should render");
  assertEqual(
    skill?.secondaryActions?.some((action) => action.action.type === "writeSkillConfig"),
    true,
    "enable/disable action should be available",
  );
}

function projectsPluginsWithMarketplaceSectionsAndActions(): void {
  const entries = projectCommandPanelEntries({
    plugins: {
      marketplaces: [{
        name: "OpenAI",
        plugins: [{
          id: "browser-use",
          remotePluginId: "remote-browser",
          name: "browser-use",
          installed: false,
          enabled: false,
          installPolicy: "AVAILABLE",
          availability: "AVAILABLE",
          interface: { displayName: "Browser Use" },
        }, {
          id: "local-helper",
          name: "local-helper",
          installed: true,
          enabled: true,
          installPolicy: "AVAILABLE",
          availability: "AVAILABLE",
        }],
      }],
      featuredPluginIds: ["remote-browser"],
    },
  });

  const summary = managementPanelSummary("plugins", entries);
  assertEqual(summary.find((item) => item.id === "plugins:installed")?.value, 1, "installed plugins should be counted");
  assertEqual(summary.find((item) => item.id === "plugins:featured")?.value, 1, "featured plugins should be counted");

  const sections = managementPanelSections("plugins", entries);
  assertDeepEqual(
    sections.map((section) => section.title),
    ["Installed", "Featured"],
    "plugin management should split installed and featured marketplace rows",
  );
  assertEqual(
    sections[1]?.entries[0]?.secondaryActions?.[0]?.action.type,
    "installPlugin",
    "featured plugin rows should keep install action projection",
  );
}

function rendersReusableManagementPanelControls(): void {
  const entries = projectCommandPanelEntries({
    skills: {
      data: [{
        name: "code-review",
        path: "/workspace/.codex/skills/code-review/SKILL.md",
        scope: "user",
        enabled: true,
        interface: {
          displayName: "Code Review",
          defaultPrompt: "Review this change.",
        },
      }],
    },
  });
  const html = renderToStaticMarkup(createElement(McpSkillsManagementPanel, {
    kind: "skills",
    panelState: createCommandPanelState("skills", {
      status: "ready",
      title: "Skills",
      entries,
    }),
    onReload: () => undefined,
    onSelectEntry: () => undefined,
    onSelectAction: () => undefined,
  }));

  assertIncludes(html, "hc-management-panel", "management component should render its reusable root");
  assertIncludes(html, "Refresh", "management component should expose its Codex-aligned Refresh action");
  assertIncludes(html, "Insert prompt", "skill primary action should be labeled as prompt insertion");

  const pluginHtml = renderToStaticMarkup(createElement(McpSkillsManagementPanel, {
    kind: "plugins",
    panelState: createCommandPanelState("plugins", {
      status: "ready",
      title: "Plugins",
      entries: projectCommandPanelEntries({
        plugins: {
          marketplaces: [{
            name: "Shared plugins",
            plugins: [{
              id: "shared-review",
              remotePluginId: "share_123",
              name: "shared-review",
              installed: false,
              enabled: false,
              shareContext: { remotePluginId: "share_123" },
              installPolicy: "AVAILABLE",
              availability: "AVAILABLE",
            }],
          }],
        },
      }),
    }),
    onReload: () => undefined,
    onSelectEntry: () => undefined,
    onSelectAction: () => undefined,
  }));
  assertIncludes(pluginHtml, "Plugins summary", "management component should label plugin summary");
  assertIncludes(pluginHtml, "Checkout", "plugin management rows should expose shared plugin actions");
}

async function reloadsMcpConfigOnlyForForcedReloads(): Promise<void> {
  const normal = fakeSettingsClient();
  await loadSettingsPanelContent({
    activeTurnId: null,
    client: normal.client,
    ensureConnected: async () => true,
    forceReload: false,
    includeImageDynamicTool: false,
    openSettingsPanelContent: normal.openPanel,
    panel: "mcp",
    setSettingsPanelState: normal.setPanel,
    state: initialCodexUiState,
    workspace: "/workspace",
    notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
  });
  assertDeepEqual(
    normal.calls.map((call) => [call.method, call.params]),
    [
      ["mcpServerStatus/list", { limit: 50, detail: "full" }],
      ["config/read", { includeLayers: true, cwd: "/workspace" }],
    ],
    "opening MCP management should list cached app-server status without forcing a config reload",
  );

  const forced = fakeSettingsClient();
  await loadSettingsPanelContent({
    activeTurnId: null,
    client: forced.client,
    ensureConnected: async () => true,
    forceReload: true,
    includeImageDynamicTool: false,
    openSettingsPanelContent: forced.openPanel,
    panel: "mcp",
    setSettingsPanelState: forced.setPanel,
    state: initialCodexUiState,
    workspace: "/workspace",
    notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
  });
  assertDeepEqual(
    forced.calls.map((call) => [call.method, call.params]),
    [
      ["config/mcpServer/reload", undefined],
      ["mcpServerStatus/list", { limit: 50, detail: "full" }],
      ["config/read", { includeLayers: true, cwd: "/workspace" }],
    ],
    "MCP Reload should force the app-server MCP config refresh before listing status",
  );
  assertIncludes(forced.panel?.message ?? "", "Reloaded MCP config", "forced reload should show reload feedback");
  assertIncludes(
    forced.panel?.message ?? "",
    "running threads may need a thread restart or another MCP reload",
    "MCP reload feedback should explain the running-thread restart/reload boundary",
  );
}

async function loadsSkillRecommendationsAndCreatorForSettingsPanel(): Promise<void> {
  const host = fakeSettingsClient();
  await loadSettingsPanelContent({
    activeTurnId: null,
    client: host.client,
    ensureConnected: async () => true,
    forceReload: false,
    includeImageDynamicTool: false,
    openSettingsPanelContent: host.openPanel,
    panel: "skills",
    setSettingsPanelState: host.setPanel,
    state: initialCodexUiState,
    workspace: "/workspace",
    notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
  });

  assertDeepEqual(
    host.calls.map((call) => [call.method, call.params]),
    [
      ["skills/list", { cwds: ["/workspace"], forceReload: false }],
      ["plugin/list", { cwds: ["/workspace"] }],
      ["plugin/read", { marketplacePath: null, remoteMarketplaceName: "OpenAI", pluginName: "browser-use" }],
    ],
    "Skills settings should load skills/list first and only derive recommendations from real plugin/read metadata",
  );
  assertIncludes(
    host.panel?.message ?? "",
    "inspect local helper boundaries",
    "Skills settings message should describe the creator/helper boundary",
  );
  assertDeepEqual(
    host.panel?.entries.map((entry) => [entry.id, entry.status, entry.meta]),
    [
      ["skill:review", "enabled", "Repo · /workspace/.codex/skills/review/SKILL.md"],
      ["recommended-skill:browser-use:web-research", "plugin skill", "Recommended Skills · Browser Use"],
      ["skill-creator:local-helper", "starter available", "Recommended Skills · available boundary"],
    ],
    "Skills settings should include loaded skills, real plugin skill recommendations, and the local creator helper",
  );
}

async function loadsPluginsMarketplaceInstalledAndSharedForSettingsPanel(): Promise<void> {
  const host = fakeSettingsClient();
  await loadSettingsPanelContent({
    activeTurnId: null,
    client: host.client,
    ensureConnected: async () => true,
    forceReload: true,
    includeImageDynamicTool: false,
    openSettingsPanelContent: host.openPanel,
    panel: "plugins",
    setSettingsPanelState: host.setPanel,
    state: { ...initialCodexUiState, activeThreadId: "thread-1" },
    workspace: "/workspace",
    notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
  });

  assertDeepEqual(
    host.calls.map((call) => [call.method, call.params]),
    [
      ["plugin/list", { cwds: ["/workspace"] }],
      ["plugin/list", { cwds: ["/workspace"], marketplaceKinds: ["workspace-directory", "shared-with-me"] }],
      ["plugin/installed", { cwds: ["/workspace"] }],
      ["plugin/share/list", {}],
      ["app/list", { cursor: null, forceRefetch: true, limit: 1000, threadId: "thread-1" }],
    ],
    "Plugins settings should load marketplace, expanded remote marketplaces, installed plugins, shares, and apps through real protocol methods",
  );
  assertIncludes(
    host.panel?.message ?? "",
    "marketplace, installed plugins, and shared plugin checkout state",
    "Plugins refresh should explain the loaded protocol surfaces",
  );
  assertDeepEqual(
    host.panel?.entries.map((entry) => ({
      id: entry.id,
      status: entry.status,
      meta: entry.meta,
      actions: entry.secondaryActions?.map((action) => action.action.type),
    })),
    [
      { id: "plugin:browser-use", status: "featured", meta: "OpenAI · Featured", actions: ["installPlugin"] },
      { id: "plugin:local-helper", status: "installed", meta: "Installed", actions: ["writePluginConfig", "uninstallPlugin"] },
      { id: "plugin:shared-review", status: "shared", meta: "Shared plugins · Shared", actions: ["checkoutPluginShare"] },
    ],
    "Plugins settings should project featured marketplace rows, plugin/installed rows, and share checkout rows",
  );
}

async function loadsExperimentalFeaturesForActiveThreadInSettingsPanel(): Promise<void> {
  const host = fakeSettingsClient();
  await loadSettingsPanelContent({
    activeTurnId: null,
    client: host.client,
    ensureConnected: async () => true,
    forceReload: false,
    includeImageDynamicTool: false,
    openSettingsPanelContent: host.openPanel,
    panel: "experimental",
    setSettingsPanelState: host.setPanel,
    state: { ...initialCodexUiState, activeThreadId: "thread-1" },
    workspace: "/workspace",
    notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
  });

  assertDeepEqual(
    host.calls.map((call) => [call.method, call.params]),
    [["experimentalFeature/list", { limit: 50, threadId: "thread-1" }]],
    "Experimental settings should load feature state for the active thread",
  );
}

function registersMcpOauthPendingOnlyWhenAuthorizationUrlHasState(): void {
  resetAppConnectOAuthPendingForTest();
  assertEqual(
    markAppConnectOAuthPending({
      appId: "mcp:docs",
      appName: "docs",
      redirectUrl: "https://auth.example/authorize?client_id=codex",
    }),
    null,
    "MCP OAuth login should not register a pending callback when the authorization URL has no state",
  );
  assertEqual(
    claimAppConnectOAuthCallback("https://chatgpt.com/aip/connectors/links/oauth/callback?code=123")?.pending ?? null,
    null,
    "state-less callbacks should not match a stale pending MCP OAuth entry",
  );

  const pending = markAppConnectOAuthPending({
    appId: "mcp:docs",
    appName: "docs",
    redirectUrl: "https://auth.example/authorize?client_id=codex&state=mcp-state",
  });
  assertEqual(pending?.oauthState, "mcp-state", "MCP OAuth pending entry should be keyed by authorization state");
  assertEqual(
    claimAppConnectOAuthCallback("https://chatgpt.com/aip/connectors/links/oauth/callback?code=123&state=mcp-state")?.pending?.appId,
    "mcp:docs",
    "MCP OAuth callback should resolve the pending entry by state",
  );
  resetAppConnectOAuthPendingForTest();
}

function fakeSettingsClient(): {
  calls: Array<{ method: string; params: unknown }>;
  client: CodexJsonRpcClient;
  panel: CommandPanelState | null;
  openPanel: (panel: CommandPanelKind, options?: CommandPanelOptions) => void;
  setPanel: (state: CommandPanelState) => void;
} {
  const host = {
    calls: [] as Array<{ method: string; params: unknown }>,
    panel: null as CommandPanelState | null,
    async request<T>(method: string, params?: unknown): Promise<T> {
      host.calls.push({ method, params });
      if (method === "mcpServerStatus/list") {
        return {
          data: [{
            name: "github",
            tools: {},
            resources: [],
            resourceTemplates: [],
            authStatus: "loggedIn",
          }],
        } as T;
      }
      if (method === "config/read") {
        return {
          config: { mcp_servers: { github: { command: "gh", enabled: true } } },
          origins: { "mcp_servers.github.command": { name: { type: "user", file: "/Users/me/.codex/config.toml" }, version: "1" } },
          layers: [],
        } as T;
      }
      if (method === "skills/list") {
        return {
          data: [{
            cwd: "/workspace",
            skills: [{
              name: "review",
              path: "/workspace/.codex/skills/review/SKILL.md",
              scope: "repo",
              enabled: true,
            }],
            errors: [],
          }],
        } as T;
      }
      if (method === "plugin/list") {
        const pluginListParams = (typeof params === "object" && params !== null ? params : {}) as {
          marketplaceKinds?: string[];
        };
        if (pluginListParams.marketplaceKinds?.length) {
          return {
            marketplaces: [],
            featuredPluginIds: [],
          } as T;
        }
        return {
          marketplaces: [{
            name: "OpenAI",
            path: null,
            plugins: [{
              id: "browser-use",
              remotePluginId: "remote-browser",
              name: "browser-use",
              installed: false,
              enabled: false,
              installPolicy: "AVAILABLE",
              availability: "AVAILABLE",
              interface: { displayName: "Browser Use" },
            }],
          }],
          featuredPluginIds: ["remote-browser"],
        } as T;
      }
      if (method === "plugin/installed") {
        return {
          marketplaces: [{
            name: "Installed",
            path: null,
            plugins: [{
              id: "local-helper",
              name: "local-helper",
              installed: true,
              enabled: false,
              installPolicy: "AVAILABLE",
              availability: "AVAILABLE",
            }],
          }],
        } as T;
      }
      if (method === "plugin/share/list") {
        return {
          data: [{
            plugin: {
              id: "shared-review",
              remotePluginId: "share_123",
              name: "shared-review",
              installed: false,
              enabled: false,
              installPolicy: "AVAILABLE",
              availability: "AVAILABLE",
              shareContext: { remotePluginId: "share_123" },
            },
            localPluginPath: null,
          }],
        } as T;
      }
      if (method === "app/list") {
        return { data: [], nextCursor: null } as T;
      }
      if (method === "plugin/read") {
        return {
          plugin: {
            marketplaceName: "OpenAI",
            marketplacePath: null,
            summary: {
              id: "browser-use",
              remotePluginId: "remote-browser",
              name: "browser-use",
              installed: true,
              enabled: true,
              interface: { displayName: "Browser Use" },
            },
            skills: [{
              name: "web-research",
              description: "Research web sources.",
              interface: { displayName: "Web Research" },
            }],
          },
        } as T;
      }
      return {} as T;
    },
    openPanel(panel: CommandPanelKind, options?: CommandPanelOptions) {
      host.panel = createCommandPanelState(panel, options);
    },
    setPanel(state: CommandPanelState) {
      host.panel = state;
    },
  };
  return {
    calls: host.calls,
    client: host as unknown as CodexJsonRpcClient,
    get panel() {
      return host.panel;
    },
    openPanel: host.openPanel,
    setPanel: host.setPanel,
  };
}

function collectEntryText(entries: CommandPanelEntry[]): string {
  return entries.flatMap((entry) => [
    entry.title,
    entry.status ?? "",
    entry.meta ?? "",
    ...(entry.details ?? []),
  ]).join("\n");
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertIncludes(value: string, expected: string, message: string): void {
  if (!value.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(value)} to include ${JSON.stringify(expected)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
