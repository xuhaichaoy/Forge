import type { ModelConfig } from "@hicodex/codex-protocol";
import { SETTINGS_SECTIONS, isRefreshableSettingsPanel } from "../src/components/model-settings-panel";
import {
  appearanceSettingsEntries,
  desktopBackedLocalSettingsEntries,
  generalSettingsEntries,
  imageGenerationCapabilityEntries,
  keyboardShortcutsSettingsEntries,
  localSettingsEntries,
} from "../src/state/settings-panel-workflow";
import {
  COMPOSER_WORK_MODE_STORAGE_KEY,
  LEGACY_COMPOSER_WORK_MODE_STORAGE_KEY,
  createHostPendingWorktree,
  loadComposerWorkMode,
  projectWorktreeModeOptions,
  projectWorktreesSettingsEntries,
  saveComposerWorkMode,
  type HostGitStatus,
  type PendingWorktree,
  type WorktreeHostApi,
} from "../src/state/worktrees";
import type { SettingsPanelId } from "../src/state/composer-workflow";
import { loadSettingsPanelContent } from "../src/state/settings-panel-loader";
import { initialCodexUiState } from "../src/state/codex-reducer";
import { createCommandPanelState, type CommandPanelState } from "../src/state/command-panel";

export default async function runSettingsPanelTests(): Promise<void> {
  exposesUnifiedSettingsSectionsWithoutLogin();
  marksServerBackedSectionsRefreshable();
  projectsImageGenerationCapabilities();
  projectsDesktopBackedSettingsPanels();
  exposesKeyboardShortcutsCommandList();
  projectsNotificationPreferencesInGeneralSettings();
  projectsServiceTierSpeedInGeneralSettings();
  projectsThemeInAppearanceAndLocaleInGeneralSettings();
  migratesComposerWorkModeStorage();
  projectsHostAvailableWorktreeSelectable();
  projectsPendingWorktreePath();
  projectsWorktreesSettingsFallback();
  await createsPendingWorktreeThroughHostApi();
  await loadsWorktreesSettingsFromHostBeforeProtocolFallback();
  await fallsBackToGitDiffWhenHostUnavailable();
  await loadsHooksSettingsWithReviewFocus();
  displaysCustomPermissionStateWithoutSelectableCustomMode();
  displaysCustomApprovalPolicyAsDegraded();
}

function migratesComposerWorkModeStorage(): void {
  const storage = new MemoryStorage();
  storage.setItem(LEGACY_COMPOSER_WORK_MODE_STORAGE_KEY, "worktree");
  assertDeepEqual(
    loadComposerWorkMode(storage),
    "worktree",
    "composer work mode should read the legacy storage key during migration",
  );
  saveComposerWorkMode(storage, "cloud");
  assertDeepEqual(
    storage.getItem(COMPOSER_WORK_MODE_STORAGE_KEY),
    "cloud",
    "composer work mode should persist under desktop.hicodex",
  );
}

function exposesUnifiedSettingsSectionsWithoutLogin(): void {
  // CODEX-REF: Order mirrors the `_e` group descriptor in Codex Desktop
  // settings-page-TI1bCoqP.js (byte ~8414):
  //   _e[0] (key:"app",  heading:"App")  slugs: general-settings, profile, appearance, appshots, connections, git-settings, usage
  //   _e[1] (key:"connection", heading:"Host") slugs: agent, personalization, keyboard-shortcuts, mcp-settings, hooks-settings, browser-use, computer-use, local-environments, worktrees, data-controls
  // HiCodex omits Codex-only `profile`, inserts mcp/hooks/plugins/skills near their Codex counterparts
  // (Codex hides plugins-settings/skills-settings via the `l` flag in xe(); HiCodex keeps both visible),
  // and appends a HiCodex-only group of sections that have no Codex Desktop counterpart.
  assertDeepEqual(
    SETTINGS_SECTIONS.map((section) => section.id),
    [
      // App group (Codex _e[0].slugs + HiCodex-only models/images folded in)
      "general",
      "appearance",
      "appshots",
      "connections",
      "git-settings",
      "models",
      "images",
      "usage",
      // Host group (Codex _e[1].slugs + HiCodex-only permissions/approvals/apps/experimental folded in)
      "agent",
      "personalization",
      "keyboard-shortcuts",
      "mcp",
      "hooks",
      "plugins",
      "skills",
      "permissions",
      "approvals",
      "apps",
      "browser-use",
      "computer-use",
      "local-environments",
      "worktrees",
      "experimental",
      "data-controls",
    ],
    "settings center should expose Codex Desktop route slugs alongside existing HiCodex sections",
  );
}

function marksServerBackedSectionsRefreshable(): void {
  assertDeepEqual(
    (["images", "worktrees", "mcp", "skills", "hooks", "apps", "plugins", "experimental"] as SettingsPanelId[])
      .map((panel) => isRefreshableSettingsPanel(panel)),
    [true, true, true, true, true, true, true, true],
    "server-backed settings sections should expose a refresh action",
  );
  assertDeepEqual(
    ([
      "general",
      "appearance",
      "appshots",
      "connections",
      "git-settings",
      "models",
      "permissions",
      "approvals",
      "agent",
      "personalization",
      "keyboard-shortcuts",
      "usage",
      "browser-use",
      "computer-use",
      "local-environments",
      "data-controls",
    ] as SettingsPanelId[])
      .map((panel) => isRefreshableSettingsPanel(panel)),
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    "local settings sections should not expose a refresh action",
  );
}

function projectsDesktopBackedSettingsPanels(): void {
  // keyboard-shortcuts panel is no longer "Desktop route" placeholder — it has
  // a real read-only implementation in keyboardShortcutsSettingsEntries; see
  // exposesKeyboardShortcutsCommandList below.
  assertDeepEqual(
    desktopBackedLocalSettingsEntries("appshots", { connected: true }).map((entry) => [entry.id, entry.status]),
    [["appshots:desktop-surface", "Desktop route"]],
    "appshots settings should expose the Desktop route as source evidence",
  );
  assertDeepEqual(
    desktopBackedLocalSettingsEntries("agent", { connected: true }).map((entry) => [entry.id, entry.status]),
    [["agent:desktop-surface", "Desktop route"]],
    "agent settings should expose the Desktop Configuration route as source evidence",
  );
  assertDeepEqual(
    desktopBackedLocalSettingsEntries("connections", { connected: false })[0]?.status,
    "Desktop route",
    "connections settings should expose only the Desktop route until the remote-connections host bridge is backed locally",
  );
  assertDeepEqual(
    desktopBackedLocalSettingsEntries("local-environments", { connected: true })[0]?.status,
    "Desktop route",
    "local environment settings should expose the Desktop route as source evidence",
  );
  assertDeepEqual(
    desktopBackedLocalSettingsEntries("data-controls", { connected: true })[0]?.title,
    "Archived chats",
    "data controls settings should use Desktop's archived chats label",
  );
  assertDeepEqual(
    desktopBackedLocalSettingsEntries("computer-use", { connected: true })[0]?.status,
    "Desktop route",
    "computer use settings should expose the Desktop route as source evidence",
  );
  assertDeepEqual(
    desktopBackedLocalSettingsEntries("browser-use", { connected: true })[0]?.status,
    "Desktop route",
    "browser settings should expose the Desktop route as source evidence",
  );
  assertDeepEqual(
    desktopBackedLocalSettingsEntries("usage", { connected: false })[0]?.status,
    "Desktop route",
    "usage settings should expose the Desktop route as source evidence",
  );
  assertDeepEqual(
    desktopBackedLocalSettingsEntries("usage", { connected: false })[0]?.details?.includes("access hook: use-usage-settings-access"),
    true,
    "usage settings details should label the Desktop use-usage-settings-access hook accurately",
  );
}

function exposesKeyboardShortcutsCommandList(): void {
  // CODEX-REF: keyboard-shortcuts-settings-CPv8uZNY.js — Codex Desktop builds
  // the panel directly from the registered command catalog. HiCodex mirrors
  // the same data via COMMAND_DESCRIPTORS; the entry list must be non-empty,
  // group-tagged, and use the prefixed id pattern so renderer lookups stay
  // unambiguous.
  const entries = keyboardShortcutsSettingsEntries();
  if (entries.length === 0) {
    throw new Error("keyboardShortcutsSettingsEntries should not be empty");
  }
  for (const entry of entries) {
    if (!entry.id.startsWith("keyboard-shortcut:")) {
      throw new Error(`keyboard shortcut entry id should be prefixed: ${entry.id}`);
    }
    if (entry.kind !== "status") {
      throw new Error(`keyboard shortcut entry kind should be "status": ${entry.id}`);
    }
    if (!entry.groupKey || !entry.groupLabel) {
      throw new Error(`keyboard shortcut entry should carry groupKey + groupLabel: ${entry.id}`);
    }
    // CODEX-REF: settings.shortcuts.row.keybinding falls back to an em dash
    // when a command has no platform default — status must always be a string.
    if (typeof entry.status !== "string" || entry.status.length === 0) {
      throw new Error(`keyboard shortcut entry status should be a non-empty string: ${entry.id}`);
    }
  }
}

function projectsImageGenerationCapabilities(): void {
  const entries = imageGenerationCapabilityEntries({
    capabilities: { imageGeneration: true, namespaceTools: true, webSearch: false },
    connected: true,
    dynamicToolRegistered: true,
  });
  assertDeepEqual(
    entries.map((entry) => [entry.id, entry.status]),
    [
      ["images:native-capability", "available"],
      ["images:dynamic-tool", "registered"],
    ],
    "image settings should expose native provider status and dynamic image tool registration",
  );
  assertDeepEqual(
    imageGenerationCapabilityEntries({ connected: true })[1]?.status,
    "inactive",
    "image settings should show the dynamic image tool as inactive until endpoint settings opt in",
  );
  assertDeepEqual(
    imageGenerationCapabilityEntries({ capabilities: {}, connected: true })[0]?.status,
    "unknown",
    "image settings should not treat missing provider capability fields as unavailable",
  );
  assertDeepEqual(
    imageGenerationCapabilityEntries({ connected: false })[0]?.status,
    "offline",
    "image settings should show offline native capability when app-server is unavailable",
  );
}

function projectsNotificationPreferencesInGeneralSettings(): void {
  const entries = generalSettingsEntries({
    activeThreadId: "thread-1",
    activeTurnId: null,
    codexHome: "/tmp/codex-home",
    connected: true,
    defaultCwd: "/tmp/workspace",
    model: "gpt-5.2",
    modelCount: 1,
    pendingRequestCount: 0,
    pid: 123,
    uiLocale: "en-US",
    uiTheme: { mode: "system", resolved: "dark" },
    workspace: "/tmp/workspace",
    notificationPreferences: { turnCompletionPolicy: "always", sound: false },
  });
  const notifications = entries.find((entry) => entry.id === "settings:notifications");
  assertDeepEqual(
    [notifications?.status, notifications?.meta],
    ["Always", "Sound off"],
    "general settings should expose the saved notification policy and sound preference",
  );
  assertDeepEqual(
    notifications?.secondaryActions?.map((action) => action.id),
    ["notifications:policy:backgroundOnly", "notifications:policy:off", "notifications:sound:on"],
    "notification settings should expose policy and sound actions",
  );
}

function projectsServiceTierSpeedInGeneralSettings(): void {
  const entries = generalSettingsEntries({
    activeThreadId: "thread-1",
    activeTurnId: null,
    codexHome: "/tmp/codex-home",
    connected: true,
    defaultCwd: "/tmp/workspace",
    model: "gpt-5.2",
    modelProvider: "openai",
    modelCount: 1,
    models: [modelWithServiceTiers()],
    pendingRequestCount: 0,
    pid: 123,
    serviceTier: "priority",
    uiLocale: "en-US",
    uiTheme: { mode: "system", resolved: "dark" },
    workspace: "/tmp/workspace",
    notificationPreferences: { turnCompletionPolicy: "always", sound: false },
  });
  const speed = entries.find((entry) => entry.id === "settings:service-tier");
  assertDeepEqual(
    [speed?.title, speed?.status, speed?.meta],
    ["Speed", "Fast", "gpt-5.2"],
    "general settings should expose Desktop's Speed control when the active model advertises service tiers",
  );
  assertDeepEqual(
    speed?.secondaryActions?.map((action) => [action.id, action.label, action.action]),
    [
      [
        "service-tier:default",
        "Standard",
        {
          type: "writeConfig",
          title: "Use Standard speed",
          message: "Set speed to Standard.",
          edits: [{ keyPath: "service_tier", value: "default", mergeStrategy: "replace" }],
          reloadUserConfig: true,
        },
      ],
      [
        "service-tier:flex",
        "Flex",
        {
          type: "writeConfig",
          title: "Use Flex speed",
          message: "Set speed to Flex.",
          edits: [{ keyPath: "service_tier", value: "flex", mergeStrategy: "replace" }],
          reloadUserConfig: true,
        },
      ],
    ],
    "service tier actions should write app-server service_tier request values through config/batchWrite",
  );

  const entriesWithoutModelTiers = generalSettingsEntries({
    activeThreadId: null,
    activeTurnId: null,
    codexHome: null,
    connected: false,
    defaultCwd: null,
    model: null,
    modelCount: 0,
    models: [],
    pendingRequestCount: 0,
    pid: null,
    serviceTier: "priority",
    uiLocale: "en-US",
    uiTheme: { mode: "system", resolved: "light" },
    workspace: "",
    notificationPreferences: { turnCompletionPolicy: "backgroundOnly", sound: true },
  });
  assertDeepEqual(
    entriesWithoutModelTiers.find((entry) => entry.id === "settings:service-tier"),
    undefined,
    "speed settings should stay hidden when model/list has no serviceTiers, matching Desktop's availableOptions gate",
  );
}

function projectsThemeInAppearanceAndLocaleInGeneralSettings(): void {
  const appearanceEntries = appearanceSettingsEntries({
    uiTheme: { mode: "dark", resolved: "dark" },
  });
  const generalEntries = generalSettingsEntries({
    activeThreadId: null,
    activeTurnId: null,
    codexHome: null,
    connected: false,
    defaultCwd: null,
    model: null,
    modelCount: 0,
    pendingRequestCount: 0,
    pid: null,
    uiLocale: "zh-CN",
    uiTheme: { mode: "dark", resolved: "dark" },
    workspace: "",
    notificationPreferences: { turnCompletionPolicy: "backgroundOnly", sound: true },
  });
  const theme = appearanceEntries.find((entry) => entry.id === "settings:theme");
  const generalTheme = generalEntries.find((entry) => entry.id === "settings:theme");
  const locale = generalEntries.find((entry) => entry.id === "settings:locale");
  assertDeepEqual(
    [theme?.status, theme?.meta, theme?.secondaryActions?.map((action) => action.id)],
    ["Dark", "Resolved dark", ["theme:system", "theme:light"]],
    "appearance settings should expose local theme controls",
  );
  assertDeepEqual(
    generalTheme,
    undefined,
    "general settings should not duplicate the Appearance theme control",
  );
  assertDeepEqual(
    [locale?.status, locale?.meta, locale?.secondaryActions?.map((action) => action.id)],
    ["Chinese (Simplified)", "Saved locally", ["locale:en-US"]],
    "general settings should expose local i18n controls",
  );
}

function modelWithServiceTiers(): ModelConfig {
  return {
    id: "openai",
    name: "OpenAI",
    protocol: "openai",
    baseUrl: "",
    apiKey: "",
    model: "gpt-5.2",
    models: ["gpt-5.2"],
    temperature: 0.2,
    maxTokens: null,
    supportsImageInput: true,
    serviceTiers: [
      { id: "priority", name: "Fast", description: "1.5x speed, increased usage" },
      { id: "flex", name: "Flex", description: "Lower-cost background tier" },
    ],
    defaultServiceTier: "priority",
  };
}

function projectsHostAvailableWorktreeSelectable(): void {
  const options = projectWorktreeModeOptions({
    hostGitStatus: hostGitStatusFixture(),
    mode: "local",
    tauriRuntimeAvailable: true,
  });
  assertDeepEqual(
    options.map((entry) => [entry.id, entry.status, entry.disabledReason ?? null]),
    [
      ["local", "selected", null],
      ["worktree", "ready", null],
      ["cloud", "disabled", "No cloud workspace handoff is connected in HiCodex."],
    ],
    "worktree mode should be selectable when Tauri host status reports a repo root",
  );
}

function projectsPendingWorktreePath(): void {
  const pending = pendingWorktreeFixture();
  const entries = projectWorktreesSettingsEntries({
    activeThread: null,
    connected: true,
    hostGitStatus: hostGitStatusFixture(),
    mode: "worktree",
    pendingWorktree: pending,
    tauriRuntimeAvailable: true,
    workspace: "/workspace/project",
  });
  const pendingEntry = entries.find((entry) => entry.id === "worktrees:pending-worktree");
  assertDeepEqual(
    [pendingEntry?.status, pendingEntry?.meta, pendingEntry?.disabled === true],
    ["pending", "/workspace/project-worktree", false],
    "settings should project the real pending worktree path returned by the host",
  );
  assertDeepEqual(
    pendingEntry?.details,
    [
      "Path: /workspace/project-worktree",
      "Branch: project-worktree",
      "Base ref: main",
      "Base commit: abcdef123456",
      "Repo root: /workspace/project",
    ],
    "settings should show pending worktree branch and base sha",
  );
}

function projectsWorktreesSettingsFallback(): void {
  const entries = projectWorktreesSettingsEntries({
    activeThread: {
      id: "thread-1",
      cwd: "/workspace/project",
      gitInfo: {
        branch: "main",
        sha: "1234567890abcdef",
        originUrl: "git@example.com:project/repo.git",
      },
    } as never,
    connected: true,
    gitDiffResult: {
      diff: "diff --git a/src/app.ts b/src/app.ts\n",
    },
    hostGitStatusError: "Tauri runtime unavailable",
    mode: "local",
    tauriRuntimeAvailable: false,
    workspace: "/workspace/project",
  });
  assertDeepEqual(
    entries.map((entry) => [entry.id, entry.status, entry.disabled === true]),
    [
      ["worktrees:mode:local", "selected", false],
      ["worktrees:mode:worktree", "disabled", true],
      ["worktrees:mode:cloud", "disabled", true],
      ["worktrees:git-context", "changes detected", false],
      ["worktrees:pending-worktree", "blocked", true],
    ],
    "worktrees settings should fall back to protocol Git diff without inventing a worktree path",
  );
}

async function createsPendingWorktreeThroughHostApi(): Promise<void> {
  const calls: unknown[] = [];
  const pending = pendingWorktreeFixture();
  const hostApi: WorktreeHostApi = {
    isTauriRuntime: () => true,
    createPendingWorktree: async (request) => {
      calls.push(request);
      return pending;
    },
  };
  assertDeepEqual(
    await createHostPendingWorktree({ cwd: " /workspace/project ", branchName: "", baseRef: undefined }, hostApi),
    pending,
    "pending worktree creation should return the host response",
  );
  assertDeepEqual(
    calls,
    [{ cwd: "/workspace/project", branchName: null, baseRef: null }],
    "pending worktree creation should pass a real cwd without inventing thread facts",
  );
}

async function loadsWorktreesSettingsFromHostBeforeProtocolFallback(): Promise<void> {
  const host = fakeSettingsPanelHost((method) => {
    throw new Error(`unexpected protocol call: ${method}`);
  });
  await loadSettingsPanelContent({
    activeTurnId: null,
    client: host.client,
    ensureConnected: async () => {
      throw new Error("ensureConnected should not run when host Git status succeeds");
    },
    includeImageDynamicTool: false,
    openSettingsPanelContent: () => undefined,
    panel: "worktrees",
    setSettingsPanelState: host.setPanel,
    state: initialCodexUiState,
    workspace: "/workspace/project",
    workMode: "local",
    worktreeHostApi: {
      isTauriRuntime: () => true,
      readHostGitStatus: async () => hostGitStatusFixture(),
    },
  });

  assertDeepEqual(host.calls, [], "host Git status should be preferred over gitDiffToRemote");
  assertDeepEqual(
    host.panel?.entries.map((entry) => [entry.id, entry.status, entry.disabled === true]),
    [
      ["worktrees:mode:local", "selected", false],
      ["worktrees:mode:worktree", "ready", false],
      ["worktrees:mode:cloud", "disabled", true],
      ["worktrees:git-context", "changes detected", false],
      ["worktrees:pending-worktree", "ready", false],
    ],
    "host-backed Worktrees settings should enable worktree mode and show current Git status",
  );
}

async function fallsBackToGitDiffWhenHostUnavailable(): Promise<void> {
  const host = fakeSettingsPanelHost((method) => {
    if (method === "gitDiffToRemote") {
      return { diff: "diff --git a/src/app.ts b/src/app.ts\n" };
    }
    throw new Error(`unexpected protocol call: ${method}`);
  });
  await loadSettingsPanelContent({
    activeTurnId: null,
    client: host.client,
    ensureConnected: async () => true,
    includeImageDynamicTool: false,
    openSettingsPanelContent: () => undefined,
    panel: "worktrees",
    setSettingsPanelState: host.setPanel,
    state: { ...initialCodexUiState, connected: true },
    workspace: "/workspace/project",
    workMode: "local",
    worktreeHostApi: {
      isTauriRuntime: () => false,
    },
  });

  assertDeepEqual(
    host.calls.map((call) => [call.method, call.params]),
    [["gitDiffToRemote", { cwd: "/workspace/project" }]],
    "Worktrees settings should use protocol fallback when Tauri host Git status is unavailable",
  );
  assertDeepEqual(
    host.panel?.entries.map((entry) => [entry.id, entry.status, entry.disabled === true]),
    [
      ["worktrees:mode:local", "selected", false],
      ["worktrees:mode:worktree", "disabled", true],
      ["worktrees:mode:cloud", "disabled", true],
      ["worktrees:git-context", "changes detected", false],
      ["worktrees:pending-worktree", "blocked", true],
    ],
    "host-unavailable fallback should keep worktree disabled while showing protocol Git status",
  );
}

async function loadsHooksSettingsWithReviewFocus(): Promise<void> {
  const host = fakeSettingsPanelHost((method, params) => {
    if (method === "hooks/list") {
      assertDeepEqual(params, { cwds: ["/workspace/project"] }, "Hooks settings should query the current workspace cwd");
      return {
        data: [{
          cwd: "/workspace/project",
          hooks: [
            hookSettingsFixture("project", "project", null),
            hookSettingsFixture("plugin-a", "plugin", "plugin-a"),
            hookSettingsFixture("plugin-b", "plugin", "plugin-b"),
          ],
        }],
      };
    }
    throw new Error(`unexpected protocol call: ${method}`);
  });
  await loadSettingsPanelContent({
    activeTurnId: null,
    client: host.client,
    ensureConnected: async () => true,
    hooksFocus: { source: "plugin", pluginId: "plugin-a" },
    includeImageDynamicTool: false,
    openSettingsPanelContent: (panel, options) => host.setPanel(createCommandPanelState(panel, options)),
    panel: "hooks",
    setSettingsPanelState: host.setPanel,
    state: { ...initialCodexUiState, connected: true },
    workspace: "/workspace/project",
  });

  assertDeepEqual(
    host.panel?.entries.map((entry) => entry.title),
    ["plugin-a"],
    "Review hooks should open Hooks settings focused to the matching source/plugin",
  );
  assertDeepEqual(
    host.panel?.message,
    "Showing plugin hooks for plugin-a.",
    "focused Hooks settings should explain the selected Desktop source",
  );
}

function displaysCustomPermissionStateWithoutSelectableCustomMode(): void {
  const entries = localSettingsEntries("permissions", {
    connected: true,
    pendingRequestCount: 0,
    threadContextDefaults: {
      sandbox: "workspace-write",
      approvalPolicy: { custom: true },
      approvalsReviewer: "user",
    },
  });
  assertDeepEqual(
    entries.some((entry) => entry.id === "permissions:mode:custom" || entry.action?.type === "writeConfig" && entry.title === "Custom"),
    false,
    "permissions settings should not expose custom as a selectable mode",
  );
  assertDeepEqual(
    entries.find((entry) => entry.id === "permissions:custom-status")?.status,
    "custom/degraded",
    "permissions settings should display custom/degraded status for unsupported tuples",
  );
}

function displaysCustomApprovalPolicyAsDegraded(): void {
  const entries = localSettingsEntries("approvals", {
    connected: true,
    pendingRequestCount: 2,
    threadContextDefaults: {
      sandbox: "workspace-write",
      approvalPolicy: { unexpected: true },
      approvalsReviewer: "auto_review",
    },
  });
  assertDeepEqual(
    entries.map((entry) => [entry.id, entry.status]),
    [
      ["approvals:policy", "custom/degraded"],
      ["approvals:permissions-mode", "custom/degraded"],
      ["approvals:pending", "2"],
    ],
    "approvals settings should show degraded custom policy without inventing a selectable mode",
  );
}

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function hostGitStatusFixture(overrides: Partial<HostGitStatus> = {}): HostGitStatus {
  return {
    cwd: "/workspace/project",
    repoRoot: "/workspace/project",
    branch: "main",
    sha: "abcdef1234567890",
    upstream: "origin/main",
    ahead: 1,
    behind: 2,
    changedFiles: ["src/app.ts"],
    hasDiff: true,
    diff: "diff --git a/src/app.ts b/src/app.ts\n",
    ...overrides,
  };
}

function pendingWorktreeFixture(overrides: Partial<PendingWorktree> = {}): PendingWorktree {
  return {
    repoRoot: "/workspace/project",
    path: "/workspace/project-worktree",
    branchName: "project-worktree",
    baseRef: "main",
    baseSha: "abcdef1234567890",
    ...overrides,
  };
}

function fakeSettingsPanelHost(
  request: (method: string, params?: unknown) => unknown,
): {
  calls: Array<{ method: string; params: unknown }>;
  client: Parameters<typeof loadSettingsPanelContent>[0]["client"];
  panel: CommandPanelState | null;
  setPanel: (state: CommandPanelState) => void;
} {
  const host = {
    calls: [] as Array<{ method: string; params: unknown }>,
    panel: null as CommandPanelState | null,
    client: {
      async request<T>(method: string, params?: unknown): Promise<T> {
        host.calls.push({ method, params });
        return request(method, params) as T;
      },
    } as Parameters<typeof loadSettingsPanelContent>[0]["client"],
    setPanel(state: CommandPanelState) {
      host.panel = state;
    },
  };
  return host;
}

function hookSettingsFixture(key: string, source: string, pluginId: string | null) {
  return {
    key,
    eventName: "UserPromptSubmit",
    handlerType: "command",
    matcher: null,
    command: "echo ok",
    timeoutSec: 1,
    statusMessage: null,
    sourcePath: "/workspace/.codex/hooks.json",
    source,
    pluginId,
    displayOrder: 1,
    enabled: true,
    isManaged: false,
    currentHash: `hash-${key}`,
    trustStatus: "untrusted",
  };
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
