import { SETTINGS_SECTIONS, isRefreshableSettingsPanel } from "../src/components/model-settings-panel";
import {
  generalSettingsEntries,
  imageGenerationCapabilityEntries,
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
import type { CommandPanelState } from "../src/state/command-panel";

export default async function runSettingsPanelTests(): Promise<void> {
  exposesUnifiedSettingsSectionsWithoutLogin();
  marksServerBackedSectionsRefreshable();
  projectsImageGenerationCapabilities();
  projectsNotificationPreferencesInGeneralSettings();
  projectsThemeAndLocaleInGeneralSettings();
  migratesComposerWorkModeStorage();
  projectsHostAvailableWorktreeSelectable();
  projectsPendingWorktreePath();
  projectsWorktreesSettingsFallback();
  await createsPendingWorktreeThroughHostApi();
  await loadsWorktreesSettingsFromHostBeforeProtocolFallback();
  await fallsBackToGitDiffWhenHostUnavailable();
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
  assertDeepEqual(
    SETTINGS_SECTIONS.map((section) => section.id),
    [
      "general",
      "models",
      "images",
      "worktrees",
      "permissions",
      "approvals",
      "mcp",
      "skills",
      "hooks",
      "apps",
      "plugins",
      "experimental",
    ],
    "settings center should expose runtime, model, permission, MCP, Skills, and extension management sections",
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
    (["general", "models", "permissions", "approvals"] as SettingsPanelId[])
      .map((panel) => isRefreshableSettingsPanel(panel)),
    [false, false, false, false],
    "local settings sections should not expose a refresh action",
  );
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

function projectsThemeAndLocaleInGeneralSettings(): void {
  const entries = generalSettingsEntries({
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
  const theme = entries.find((entry) => entry.id === "settings:theme");
  const locale = entries.find((entry) => entry.id === "settings:locale");
  assertDeepEqual(
    [theme?.status, theme?.meta, theme?.secondaryActions?.map((action) => action.id)],
    ["Dark", "Resolved dark", ["theme:system", "theme:light"]],
    "general settings should expose local theme controls",
  );
  assertDeepEqual(
    [locale?.status, locale?.meta, locale?.secondaryActions?.map((action) => action.id)],
    ["Chinese (Simplified)", "Saved locally", ["locale:en-US"]],
    "general settings should expose local i18n controls",
  );
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

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
