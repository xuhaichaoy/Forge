import type { ModelConfig } from "@forge/codex-protocol";
import { SETTINGS_SECTIONS, isRefreshableSettingsPanel } from "../src/components/model-settings-panel";
import {
  appearanceSettingsEntries,
  desktopBackedLocalSettingsEntries,
  generalSettingsEntries,
  imageGenerationCapabilityEntries,
  isPluginBackedDesktopSettingsPanel,
  keyboardShortcutsSettingsEntries,
  localSettingsEntries,
  pluginBackedDesktopSettingsInfo,
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
import {
  formatComputerUseMcpProbeError,
  projectComputerUseMcpProbeFailureEntries,
  projectComputerUseMcpReadinessEntries,
  projectComputerUseReadinessEntries,
} from "../src/state/computer-use-readiness";

export default async function runSettingsPanelTests(): Promise<void> {
  exposesUnifiedSettingsSectionsWithoutLogin();
  marksServerBackedSectionsRefreshable();
  projectsImageGenerationCapabilities();
  projectsDesktopBackedSettingsPanels();
  projectsPluginBackedDesktopSettingsMetadata();
  projectsComputerUseReadinessActions();
  projectsComputerUseInvalidSignatureReadiness();
  projectsComputerUseRepairAction();
  projectsComputerUseMcpReadiness();
  projectsComputerUseMcpProbeAction();
  projectsComputerUseMcpProbeBlockedByInvalidSignature();
  projectsComputerUseMcpProbeBlockedByMissingPermissions();
  projectsComputerUseMcpProbeTimeoutDiagnostics();
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
  await loadsBrowserSettingsFromPluginLifecycle();
  await loadsBrowserSettingsFromQualifiedBundledPluginId();
  await loadsComputerUseSettingsFromPluginLifecycle();
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
  // Forge omits Codex-only `profile`, inserts mcp/hooks/plugins/skills near their Codex counterparts
  // (Codex hides plugins-settings/skills-settings via the `l` flag in xe(); Forge keeps both visible),
  // and appends a Forge-only group of sections that have no Codex Desktop counterpart.
  assertDeepEqual(
    SETTINGS_SECTIONS.map((section) => section.id),
    [
      // Personal (codex $e personal.slugs, sans Codex-only profile)
      "general",
      "appearance",
      "agent",
      "personalization",
      "keyboard-shortcuts",
      "usage",
      // Integrations (codex $e integrations.slugs + Forge-only apps/models/images)
      "appshots",
      "mcp",
      "plugins",
      "skills",
      "apps",
      "browser-use",
      "computer-use",
      "models",
      "images",
      // Coding (codex $e coding.slugs + Forge-only permissions/approvals/experimental)
      "hooks",
      "connections",
      "git-settings",
      "local-environments",
      "worktrees",
      "permissions",
      "approvals",
      "experimental",
      // Archived (codex $e archived.slugs)
      "data-controls",
    ],
    "settings center should expose Codex Desktop route slugs alongside existing Forge sections",
  );
}

function marksServerBackedSectionsRefreshable(): void {
  assertDeepEqual(
    (["images", "worktrees", "mcp", "skills", "hooks", "apps", "plugins", "browser-use", "computer-use", "experimental"] as SettingsPanelId[])
      .map((panel) => isRefreshableSettingsPanel(panel)),
    [true, true, true, true, true, true, true, true, true, true],
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
      "local-environments",
      "data-controls",
    ] as SettingsPanelId[])
      .map((panel) => isRefreshableSettingsPanel(panel)),
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false],
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

function projectsPluginBackedDesktopSettingsMetadata(): void {
  assertDeepEqual(
    [
      isPluginBackedDesktopSettingsPanel("browser-use"),
      isPluginBackedDesktopSettingsPanel("computer-use"),
      isPluginBackedDesktopSettingsPanel("usage"),
    ],
    [true, true, false],
    "Browser and Computer Use should be plugin-backed Desktop settings panels",
  );
  const browser = pluginBackedDesktopSettingsInfo("browser-use");
  assertDeepEqual(
    [
      browser.pluginAliases.includes("browser"),
      browser.pluginAliases.includes("browser-use"),
      browser.sourceDetails.some((detail) => detail.includes("browser-use-origin-state-read")),
    ],
    [true, true, true],
    "Browser settings should match current browser plugin identity and preserve Desktop source evidence",
  );
  const computerUse = pluginBackedDesktopSettingsInfo("computer-use");
  assertDeepEqual(
    [
      computerUse.pluginAliases.includes("computer-use"),
      computerUse.limitationDetails.some((detail) => detail.includes("OS permissions")),
      computerUse.sourceDetails.some((detail) => detail.includes("computer-use-app-approvals-read")),
    ],
    [true, true, true],
    "Computer Use settings should expose plugin aliases, native limits, and Desktop evidence",
  );
}

function projectsComputerUseReadinessActions(): void {
  const entries = projectComputerUseReadinessEntries({
    bridgeAvailable: true,
    helperAvailable: true,
    helperAppPath: "/tmp/Codex Computer Use.app",
    helperSignatureValid: true,
    helperSignatureStatus: "valid",
    mcpClientPath: "/tmp/SkyComputerUseClient",
    mcpConfigPath: "/tmp/computer-use/.mcp.json",
    mcpCommand: "./Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient",
    mcpCommandPath: "/tmp/SkyComputerUseClient",
    mcpCwd: ".",
    mcpConfigTrusted: true,
    mcpConfigStatus: "trusted",
    mcpCommandExecutable: true,
    mcpClientSignatureValid: true,
    mcpClientSignatureStatus: "valid",
    installerAppPath: "/tmp/Codex Computer Use Installer.app",
    pluginRootPath: "/tmp/computer-use",
    source: "installed-cache",
    repairSourceAvailable: true,
    repairSourcePath: "/tmp/computer-use",
    repairStatus: "not needed",
    candidates: [{
      source: "installed-cache",
      pluginRootPath: "/tmp/computer-use",
      helperAppPath: "/tmp/Codex Computer Use.app",
      helperSignatureValid: true,
      helperSignatureStatus: "valid",
      mcpClientPath: "/tmp/SkyComputerUseClient",
      mcpConfigPath: "/tmp/computer-use/.mcp.json",
      mcpCommand: "./Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient",
      mcpCommandPath: "/tmp/SkyComputerUseClient",
      mcpCwd: ".",
      mcpConfigTrusted: true,
      mcpConfigStatus: "trusted",
      mcpCommandExecutable: true,
      mcpClientSignatureValid: true,
      mcpClientSignatureStatus: "valid",
      installerAppPath: "/tmp/Codex Computer Use Installer.app",
      installerSignatureValid: true,
      installerSignatureStatus: "valid",
      usableForRepair: true,
    }],
    screenRecordingStatus: "unknown",
    accessibilityStatus: "unknown",
    appApprovalsStatus: "unknown",
    error: null,
  }, "/tmp/codex-home");

  const nativeEntry = entries.find((entry) => entry.id === "computer-use:native-readiness");
  const helperEntry = entries.find((entry) => entry.id === "computer-use:helper-signatures");
  const repairEntry = entries.find((entry) => entry.id === "computer-use:repair-sources");
  const commandEntry = entries.find((entry) => entry.id === "computer-use:mcp-command");
  const permissionEntry = entries.find((entry) => entry.id === "computer-use:permissions");

  assertDeepEqual(
    {
      ids: entries.map((entry) => entry.id),
      native: nativeEntry && {
        id: nativeEntry.id,
        status: nativeEntry.status,
        actions: secondaryActionSummaries(nativeEntry),
        controlClaim: nativeEntry.details?.some((detail) => detail.includes("GUI control is not marked ready")),
        mcpConfigTrusted: nativeEntry.details?.some((detail) => detail === "MCP config trusted: yes (trusted)"),
        mcpExecutable: nativeEntry.details?.some((detail) => detail === "MCP command executable: yes"),
        helperSignature: nativeEntry.details?.some((detail) => detail === "Helper signature: valid"),
        mcpClientSignature: nativeEntry.details?.some((detail) => detail === "MCP client signature: valid"),
        repairStatus: nativeEntry.details?.some((detail) => detail === "Repair status: not needed"),
        permissionNextStep: nativeEntry.details?.some((detail) => detail.includes("grant Screen Recording and Accessibility")),
      },
      repair: repairEntry && {
        status: repairEntry.status,
        usable: repairEntry.details?.some((detail) => detail === "Candidate 1 repair usable: yes"),
        helperSignature: repairEntry.details?.some((detail) => detail.includes("signature valid")),
      },
      helper: helperEntry && {
        status: helperEntry.status,
        helperSignature: helperEntry.details?.some((detail) => detail === "Helper signature: valid"),
        mcpClientSignature: helperEntry.details?.some((detail) => detail === "MCP client signature: valid"),
      },
      command: commandEntry && {
        status: commandEntry.status,
        executable: commandEntry.details?.some((detail) => detail === "MCP command executable: yes"),
      },
      permissions: permissionEntry && {
        status: permissionEntry.status,
        actions: secondaryActionSummaries(permissionEntry),
        appApprovals: permissionEntry.details?.some((detail) => detail === "App approvals: unknown"),
        currentProcessPreflight: permissionEntry.details?.some((detail) => detail.includes("current Forge host process")),
        timeoutRisk: permissionEntry.details?.some((detail) => detail.includes("list_apps and GUI-control tool calls time out")),
      },
    },
    {
      ids: [
        "computer-use:native-readiness",
        "computer-use:repair-sources",
        "computer-use:helper-signatures",
        "computer-use:mcp-command",
        "computer-use:permissions",
      ],
      native: {
        id: "computer-use:native-readiness",
        status: "permissions not proven",
        actions: [
          { type: "openComputerUseSetup", target: "helper", codexHome: "/tmp/codex-home" },
          { type: "openComputerUseSetup", target: "installer", codexHome: "/tmp/codex-home" },
          { type: "openComputerUseSetup", target: "screenRecording", codexHome: "/tmp/codex-home" },
          { type: "openComputerUseSetup", target: "accessibility", codexHome: "/tmp/codex-home" },
        ],
        controlClaim: true,
        mcpConfigTrusted: true,
        mcpExecutable: true,
        helperSignature: true,
        mcpClientSignature: true,
        repairStatus: true,
        permissionNextStep: true,
      },
      repair: {
        status: "not needed",
        usable: true,
        helperSignature: true,
      },
      helper: {
        status: "available",
        helperSignature: true,
        mcpClientSignature: true,
      },
      command: {
        status: "executable",
        executable: true,
      },
      permissions: {
        status: "not proven",
        actions: [
          { type: "openComputerUseSetup", target: "screenRecording", codexHome: "/tmp/codex-home" },
          { type: "openComputerUseSetup", target: "accessibility", codexHome: "/tmp/codex-home" },
        ],
        appApprovals: true,
        currentProcessPreflight: true,
        timeoutRisk: true,
      },
    },
    "Computer Use readiness should expose helper and permission setup actions without claiming GUI control readiness",
  );
}

function projectsComputerUseInvalidSignatureReadiness(): void {
  const entries = projectComputerUseReadinessEntries({
    bridgeAvailable: true,
    helperAvailable: true,
    helperAppPath: "/tmp/Codex Computer Use.app",
    helperSignatureValid: false,
    helperSignatureStatus: "/tmp/Codex Computer Use.app: invalid signature",
    mcpClientPath: "/tmp/SkyComputerUseClient",
    mcpConfigPath: "/tmp/computer-use/.mcp.json",
    mcpCommand: "./Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient",
    mcpCommandPath: "/tmp/SkyComputerUseClient",
    mcpCwd: ".",
    mcpCommandExecutable: true,
    mcpClientSignatureValid: false,
    mcpClientSignatureStatus: "/tmp/SkyComputerUseClient.app: invalid signature",
    installerAppPath: "/tmp/Codex Computer Use Installer.app",
    pluginRootPath: "/tmp/computer-use",
    source: "installed-cache",
    repairSourceAvailable: false,
    repairSourcePath: null,
    repairStatus: "no valid signed source",
    candidates: [{
      source: "installed-cache",
      pluginRootPath: "/tmp/computer-use",
      helperAppPath: "/tmp/Codex Computer Use.app",
      helperSignatureValid: false,
      helperSignatureStatus: "/tmp/Codex Computer Use.app: invalid signature",
      mcpClientPath: "/tmp/SkyComputerUseClient",
      mcpConfigPath: "/tmp/computer-use/.mcp.json",
      mcpCommand: "./Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient",
      mcpCommandPath: "/tmp/SkyComputerUseClient",
      mcpCwd: ".",
      mcpCommandExecutable: true,
      mcpClientSignatureValid: false,
      mcpClientSignatureStatus: "/tmp/SkyComputerUseClient.app: invalid signature",
      installerAppPath: "/tmp/Codex Computer Use Installer.app",
      installerSignatureValid: false,
      installerSignatureStatus: "/tmp/Codex Computer Use Installer.app: invalid signature",
      usableForRepair: false,
    }],
    screenRecordingStatus: "unknown",
    accessibilityStatus: "unknown",
    appApprovalsStatus: "unknown",
    error: null,
  }, "/tmp/codex-home");

  const nativeEntry = entries.find((entry) => entry.id === "computer-use:native-readiness");
  const repairEntry = entries.find((entry) => entry.id === "computer-use:repair-sources");
  const helperEntry = entries.find((entry) => entry.id === "computer-use:helper-signatures");

  assertDeepEqual(
    {
      ids: entries.map((entry) => entry.id),
      native: nativeEntry && {
        status: nativeEntry.status,
        timeoutWarning: nativeEntry.details?.some((detail) => detail.includes("MCP tool calls may time out")),
        signedBundle: nativeEntry.details?.some((detail) => detail.includes("signed-valid Computer Use bundle")),
        noRepairSource: nativeEntry.details?.some((detail) => detail.includes("No signed-valid local repair source")),
        permissionCaution: nativeEntry.details?.some((detail) => detail.includes("Do not rely on macOS permission grants")),
        helperSignature: nativeEntry.details?.some((detail) => detail.includes("Helper signature: invalid")),
        mcpClientSignature: nativeEntry.details?.some((detail) => detail.includes("MCP client signature: invalid")),
      },
      repair: repairEntry && {
        status: repairEntry.status,
        repairStatus: repairEntry.details?.some((detail) => detail === "Repair status: no valid signed source"),
        unusable: repairEntry.details?.some((detail) => detail === "Candidate 1 repair usable: no"),
      },
      helper: helperEntry && {
        status: helperEntry.status,
        timeoutWarning: helperEntry.details?.some((detail) => detail.includes("MCP tool calls time out")),
        helperSignature: helperEntry.details?.some((detail) => detail.includes("Helper signature: invalid")),
        mcpClientSignature: helperEntry.details?.some((detail) => detail.includes("MCP client signature: invalid")),
      },
    },
    {
      ids: [
        "computer-use:native-readiness",
        "computer-use:repair-sources",
        "computer-use:helper-signatures",
        "computer-use:mcp-command",
        "computer-use:permissions",
      ],
      native: {
        status: "signature invalid",
        timeoutWarning: true,
        signedBundle: true,
        noRepairSource: true,
        permissionCaution: true,
        helperSignature: true,
        mcpClientSignature: true,
      },
      repair: {
        status: "not available",
        repairStatus: true,
        unusable: true,
      },
      helper: {
        status: "signature invalid",
        timeoutWarning: true,
        helperSignature: true,
        mcpClientSignature: true,
      },
    },
    "Computer Use readiness should surface invalid helper signatures as a timeout risk",
  );
}

function projectsComputerUseRepairAction(): void {
  const entries = projectComputerUseReadinessEntries({
    bridgeAvailable: true,
    helperAvailable: true,
    helperAppPath: "/tmp/installed/Codex Computer Use.app",
    helperSignatureValid: false,
    helperSignatureStatus: "/tmp/installed/Codex Computer Use.app: invalid signature",
    mcpClientPath: "/tmp/installed/SkyComputerUseClient",
    mcpConfigPath: "/tmp/installed/.mcp.json",
    mcpCommand: "./Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient",
    mcpCommandPath: "/tmp/installed/SkyComputerUseClient",
    mcpCwd: ".",
    mcpCommandExecutable: true,
    mcpClientSignatureValid: false,
    mcpClientSignatureStatus: "/tmp/installed/SkyComputerUseClient.app: invalid signature",
    installerAppPath: "/tmp/installed/Codex Computer Use Installer.app",
    pluginRootPath: "/tmp/installed",
    source: "installed-cache",
    repairSourceAvailable: true,
    repairSourcePath: "/tmp/source",
    repairStatus: "ready",
    candidates: [{
      source: "installed-cache",
      pluginRootPath: "/tmp/installed",
      helperAppPath: "/tmp/installed/Codex Computer Use.app",
      helperSignatureValid: false,
      helperSignatureStatus: "invalid signature",
      mcpClientPath: "/tmp/installed/SkyComputerUseClient",
      mcpConfigPath: "/tmp/installed/.mcp.json",
      mcpCommandPath: "/tmp/installed/SkyComputerUseClient",
      mcpCommandExecutable: true,
      mcpClientSignatureValid: false,
      mcpClientSignatureStatus: "invalid signature",
      installerAppPath: "/tmp/installed/Codex Computer Use Installer.app",
      installerSignatureValid: false,
      installerSignatureStatus: "invalid signature",
      usableForRepair: false,
    }, {
      source: "codex-desktop-app",
      pluginRootPath: "/tmp/source",
      helperAppPath: "/tmp/source/Codex Computer Use.app",
      helperSignatureValid: true,
      helperSignatureStatus: "valid",
      mcpClientPath: "/tmp/source/SkyComputerUseClient",
      mcpConfigPath: "/tmp/source/.mcp.json",
      mcpCommandPath: "/tmp/source/SkyComputerUseClient",
      mcpCommandExecutable: true,
      mcpClientSignatureValid: true,
      mcpClientSignatureStatus: "valid",
      installerAppPath: "/tmp/source/Codex Computer Use Installer.app",
      installerSignatureValid: true,
      installerSignatureStatus: "valid",
      usableForRepair: true,
    }],
    screenRecordingStatus: "unknown",
    accessibilityStatus: "unknown",
    appApprovalsStatus: "unknown",
    error: null,
  }, "/tmp/codex-home");

  const nativeEntry = entries.find((entry) => entry.id === "computer-use:native-readiness");
  const repairEntry = entries.find((entry) => entry.id === "computer-use:repair-sources");

  assertDeepEqual(
    {
      native: {
        readyRepairGuidance: nativeEntry?.details?.some((detail) => detail.includes("signed-valid local repair source")) ?? false,
        repairSource: nativeEntry?.details?.some((detail) => detail === "Repair source: /tmp/source") ?? false,
      },
      repair: {
        status: repairEntry?.status,
        actions: repairEntry ? secondaryActionSummaries(repairEntry) : undefined,
        usableSource: repairEntry?.details?.some((detail) => detail === "Candidate 2 repair usable: yes") ?? false,
      },
    },
    {
      native: {
        readyRepairGuidance: true,
        repairSource: true,
      },
      repair: {
        status: "ready",
        actions: [{
          type: "repairComputerUseBundle",
          codexHome: "/tmp/codex-home",
        }],
        usableSource: true,
      },
    },
    "Computer Use readiness should expose a repair action only when a signed-valid local source exists",
  );
}

function projectsComputerUseMcpReadiness(): void {
  const entries = projectComputerUseMcpReadinessEntries(
    {
      data: [{
        name: "computer-use",
        authStatus: "unsupported",
        tools: {
          click: { description: "Click a point on screen" },
          screenshot: {},
        },
      }],
    },
    {
      "computer-use": { status: "failed", error: "permission denied", updatedAt: 1 },
    },
  );

  assertDeepEqual(
    entries.map((entry) => ({
      id: entry.id,
      status: entry.status,
      meta: entry.meta,
      hasStartupError: entry.details?.some((detail) => detail.includes("permission denied")),
      startupBeforeTools: detailIndex(entry, "Startup:") < detailIndex(entry, "Tool:"),
      probeBeforeTools: detailIndex(entry, "Probe:") < detailIndex(entry, "Tool:"),
      toolTimeoutBeforeTools: detailIndex(entry, "Tool timeout:") < detailIndex(entry, "Tool:"),
      hasToolTimeout: entry.details?.some((detail) => detail.includes("120s default")) ?? false,
      hasTimeoutRisk: entry.details?.some((detail) => detail.includes("can time out")),
      tools: entry.details?.filter((detail) => detail.startsWith("Tool:")).length,
    })),
    [{
      id: "computer-use:mcp-readiness",
      status: "startup failed",
      meta: "2 tools · auth unsupported",
      hasStartupError: true,
      startupBeforeTools: true,
      probeBeforeTools: true,
      toolTimeoutBeforeTools: true,
      hasToolTimeout: true,
      hasTimeoutRisk: true,
      tools: 2,
    }],
    "Computer Use MCP readiness should prioritize startup, probe, and timeout diagnostics before tool inventory",
  );
}

function projectsComputerUseMcpProbeAction(): void {
  const entries = projectComputerUseMcpReadinessEntries(
    {
      data: [{
        name: "computer-use",
        authStatus: "unsupported",
        tools: {
          list_apps: { description: "List open applications" },
          click: { description: "Click a point on screen" },
        },
      }],
    },
    null,
    null,
    { activeThreadId: "thread-1" },
  );

  assertDeepEqual(
    entries.map((entry) => ({
      id: entry.id,
      status: entry.status,
      actions: secondaryActionSummaries(entry),
      hasProbeDetail: entry.details?.some((detail) => detail.includes("list_apps can be called")),
    })),
    [{
      id: "computer-use:mcp-readiness",
      status: "available",
      actions: [{
        type: "probeComputerUseMcp",
        threadId: "thread-1",
        server: "computer-use",
        tool: "list_apps",
      }],
      hasProbeDetail: true,
    }],
    "Computer Use MCP readiness should expose a safe probe action when list_apps and an active thread are available",
  );
}

function projectsComputerUseMcpProbeBlockedByInvalidSignature(): void {
  const entries = projectComputerUseMcpReadinessEntries(
    {
      data: [{
        name: "computer-use",
        authStatus: "unsupported",
        tools: {
          list_apps: { description: "List open applications" },
        },
      }],
    },
    null,
    null,
    {
      activeThreadId: "thread-1",
      nativeReadiness: {
        bridgeAvailable: true,
        helperAvailable: true,
        helperAppPath: "/tmp/Codex Computer Use.app",
        helperSignatureValid: false,
        helperSignatureStatus: "invalid signature",
        mcpClientPath: "/tmp/SkyComputerUseClient",
        mcpConfigPath: "/tmp/computer-use/.mcp.json",
        mcpCommand: "./Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient",
        mcpCommandPath: "/tmp/SkyComputerUseClient",
        mcpCwd: ".",
        mcpCommandExecutable: true,
        mcpClientSignatureValid: false,
        mcpClientSignatureStatus: "invalid signature",
        installerAppPath: "/tmp/Codex Computer Use Installer.app",
        pluginRootPath: "/tmp/computer-use",
        source: "installed-cache",
        screenRecordingStatus: "unknown",
        accessibilityStatus: "unknown",
        appApprovalsStatus: "unknown",
        error: null,
      },
    },
  );
  const entry = entries[0];

  assertDeepEqual(
    {
      status: entry?.status,
      actions: entry ? secondaryActionSummaries(entry) : undefined,
      blockedDetail: entry?.details?.some((detail) => detail.includes("not exposed because the helper or MCP client signature is invalid")) ?? false,
      timeoutRisk: entry?.details?.some((detail) => detail.includes("helper signatures fail")) ?? false,
    },
    {
      status: "probe blocked",
      actions: undefined,
      blockedDetail: true,
      timeoutRisk: true,
    },
    "Computer Use MCP probe should not be exposed when native readiness proves invalid helper signatures",
  );
}

function projectsComputerUseMcpProbeBlockedByMissingPermissions(): void {
  const entries = projectComputerUseMcpReadinessEntries(
    {
      data: [{
        name: "computer-use",
        authStatus: "unsupported",
        tools: {
          list_apps: { description: "List open applications" },
        },
      }],
    },
    null,
    null,
    {
      activeThreadId: "thread-1",
      nativeReadiness: {
        bridgeAvailable: true,
        helperAvailable: true,
        helperAppPath: "/tmp/Codex Computer Use.app",
        helperSignatureValid: true,
        helperSignatureStatus: "valid",
        mcpClientPath: "/tmp/SkyComputerUseClient",
        mcpConfigPath: "/tmp/computer-use/.mcp.json",
        mcpCommand: "./Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient",
        mcpCommandPath: "/tmp/SkyComputerUseClient",
        mcpCwd: ".",
        mcpConfigTrusted: true,
        mcpConfigStatus: "trusted",
        mcpCommandExecutable: true,
        mcpClientSignatureValid: true,
        mcpClientSignatureStatus: "valid",
        installerAppPath: "/tmp/Codex Computer Use Installer.app",
        pluginRootPath: "/tmp/computer-use",
        source: "installed-cache",
        screenRecordingStatus: "not granted",
        accessibilityStatus: "granted",
        appApprovalsStatus: "unknown",
        error: null,
      },
    },
  );
  const entry = entries[0];

  assertDeepEqual(
    {
      status: entry?.status,
      actions: entry ? secondaryActionSummaries(entry) : undefined,
      blockedDetail: entry?.details?.some((detail) => detail.includes("not exposed because Screen Recording is not granted")) ?? false,
      timeoutRisk: entry?.details?.some((detail) => detail.includes("macOS permissions are missing")) ?? false,
    },
    {
      status: "probe blocked",
      actions: undefined,
      blockedDetail: true,
      timeoutRisk: true,
    },
    "Computer Use MCP probe should not be exposed when native permission preflight proves Screen Recording is not granted",
  );
}

function projectsComputerUseMcpProbeTimeoutDiagnostics(): void {
  const timeoutError = "tool call failed for `computer-use/list_apps`: timed out awaiting tools/call after 120s";
  const message = formatComputerUseMcpProbeError("computer-use", "list_apps", timeoutError);
  const entries = projectComputerUseMcpProbeFailureEntries("computer-use", "list_apps", timeoutError);
  const diagnosticEntry = entries[0];

  assertDeepEqual(
    {
      messageIncludesCause: message.includes("Screen Recording")
        && message.includes("Accessibility")
        && message.includes("app approvals"),
      title: diagnosticEntry?.title,
      status: diagnosticEntry?.status,
      timeoutDetail: diagnosticEntry?.details?.some((detail) => detail.includes("tool-call deadline")) ?? false,
      nextStep: diagnosticEntry?.details?.some((detail) => detail.includes("restart MCP or start a new thread")) ?? false,
    },
    {
      messageIncludesCause: true,
      title: "Computer Use probe failure",
      status: "error",
      timeoutDetail: true,
      nextStep: true,
    },
    "Computer Use MCP probe timeout should explain helper, permission, app approval, and restart checks",
  );
}

function exposesKeyboardShortcutsCommandList(): void {
  // CODEX-REF: keyboard-shortcuts-settings-CPv8uZNY.js — Codex Desktop builds
  // the panel directly from the registered command catalog. Forge mirrors
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
      ["cloud", "disabled", "No cloud workspace handoff is connected in Forge."],
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

async function loadsBrowserSettingsFromPluginLifecycle(): Promise<void> {
  const host = fakeSettingsPanelHost((method, params) => {
    if (method === "plugin/list") {
      if (isRecord(params) && Array.isArray(params.marketplaceKinds)) {
        return { marketplaces: [] };
      }
      return {
        featuredPluginIds: ["browser"],
        marketplaces: [{
          name: "OpenAI",
          interface: { displayName: "OpenAI" },
          plugins: [{
            id: "browser",
            name: "browser",
            remotePluginId: "browser",
            installed: false,
            enabled: false,
            interface: {
              displayName: "Browser",
              shortDescription: "Use Codex's in-app browser.",
            },
          }],
        }],
      };
    }
    if (method === "plugin/installed") return { marketplaces: [] };
    if (method === "plugin/share/list") return { data: [] };
    if (method === "app/list") return { data: [] };
    throw new Error(`unexpected protocol call: ${method}`);
  });

  await loadSettingsPanelContent({
    activeTurnId: null,
    client: host.client,
    ensureConnected: async () => true,
    includeImageDynamicTool: false,
    openSettingsPanelContent: () => undefined,
    panel: "browser-use",
    setSettingsPanelState: host.setPanel,
    state: { ...initialCodexUiState, connected: true },
    workspace: "/workspace",
  });

  assertDeepEqual(
    host.panel?.entries.map((entry) => ({
      id: entry.id,
      status: entry.status,
      actions: secondaryActionSummaries(entry),
    })),
    [{
      id: "plugin:browser",
      status: "featured",
      actions: [{ type: "installPlugin", pluginId: "browser", sourceSettingsPanel: "browser-use" }],
    }, {
      id: "browser-use:runtime-readiness",
      status: "unavailable",
      actions: [],
    }],
    "Browser settings should match the current browser plugin id and append runtime readiness",
  );
  assertDeepEqual(
    [
      host.panel?.message.includes("local Tauri Browser surface") ?? false,
      host.panel?.entries[0]?.details?.some((detail) => detail.includes("Runtime readiness")) ?? false,
      host.panel?.entries[0]?.details?.some((detail) => detail.includes("browser-use-origin-state-read")) ?? false,
      host.panel?.entries[1]?.details?.some((detail) => detail.includes("not connected to the bundled Browser iab provider yet")) ?? false,
    ],
    [true, true, true, true],
    "Browser settings should distinguish plugin lifecycle from local Browser runtime and iab agent control",
  );
}

async function loadsBrowserSettingsFromQualifiedBundledPluginId(): Promise<void> {
  const host = fakeSettingsPanelHost((method, params) => {
    if (method === "plugin/list") {
      if (isRecord(params) && Array.isArray(params.marketplaceKinds)) {
        return { marketplaces: [] };
      }
      return {
        marketplaces: [{
          name: "openai-bundled",
          interface: { displayName: "OpenAI Bundled" },
          plugins: [{
            id: "browser@openai-bundled",
            name: "browser",
            installed: true,
            enabled: true,
            interface: {
              displayName: "Browser",
              shortDescription: "Use Codex's in-app browser.",
            },
          }],
        }],
      };
    }
    if (method === "plugin/installed") return { marketplaces: [] };
    if (method === "plugin/share/list") return { data: [] };
    if (method === "app/list") return { data: [] };
    if (method === "mcpServerStatus/list") {
      return {
        data: [{
          name: "computer-use",
          authStatus: "unsupported",
          tools: {
            click: { description: "Click a point on screen" },
          },
        }],
      };
    }
    throw new Error(`unexpected protocol call: ${method}`);
  });

  await loadSettingsPanelContent({
    activeTurnId: null,
    client: host.client,
    ensureConnected: async () => true,
    includeImageDynamicTool: false,
    openSettingsPanelContent: () => undefined,
    panel: "browser-use",
    setSettingsPanelState: host.setPanel,
    state: { ...initialCodexUiState, connected: true },
    workspace: "/workspace",
  });

  assertDeepEqual(
    host.panel?.entries.map((entry) => ({
      id: entry.id,
      status: entry.status,
      actions: secondaryActionSummaries(entry),
    })),
    [{
      id: "plugin:browser@openai-bundled",
      status: "enabled",
      actions: [
        {
          type: "writePluginConfig",
          pluginId: "browser@openai-bundled",
          enabled: false,
          sourceSettingsPanel: "browser-use",
        },
        {
          type: "uninstallPlugin",
          pluginId: "browser@openai-bundled",
          sourceSettingsPanel: "browser-use",
        },
      ],
    }, {
      id: "browser-use:runtime-readiness",
      status: "unavailable",
      actions: [],
    }],
    "Browser settings should match qualified bundled plugin ids without rewriting action plugin ids and append runtime readiness",
  );
}

async function loadsComputerUseSettingsFromPluginLifecycle(): Promise<void> {
  const host = fakeSettingsPanelHost((method, params) => {
    if (method === "plugin/list") {
      if (isRecord(params) && Array.isArray(params.marketplaceKinds)) {
        return { marketplaces: [] };
      }
      return {
        marketplaces: [{
          name: "OpenAI",
          interface: { displayName: "OpenAI" },
          plugins: [{
            id: "computer-use",
            name: "computer-use",
            installed: true,
            enabled: true,
            interface: {
              displayName: "Computer Use",
              shortDescription: "Use applications on this computer.",
            },
          }],
        }],
      };
    }
    if (method === "plugin/installed") return { marketplaces: [] };
    if (method === "plugin/share/list") return { data: [] };
    if (method === "app/list") return { data: [] };
    if (method === "mcpServerStatus/list") {
      return {
        data: [{
          name: "computer-use",
          authStatus: "unsupported",
          tools: {
            click: { description: "Click a point on screen" },
          },
        }],
      };
    }
    throw new Error(`unexpected protocol call: ${method}`);
  });

  await loadSettingsPanelContent({
    activeTurnId: null,
    client: host.client,
    ensureConnected: async () => true,
    includeImageDynamicTool: false,
    openSettingsPanelContent: () => undefined,
    panel: "computer-use",
    setSettingsPanelState: host.setPanel,
    state: { ...initialCodexUiState, connected: true },
    workspace: "/workspace",
  });

  assertDeepEqual(
    host.panel?.entries.map((entry) => ({
      id: entry.id,
      status: entry.status,
      actions: secondaryActionSummaries(entry),
    })),
    [
      {
        id: "plugin:computer-use",
        status: "enabled",
        actions: [
          {
            type: "writePluginConfig",
            pluginId: "computer-use",
            enabled: false,
            sourceSettingsPanel: "computer-use",
          },
          {
            type: "uninstallPlugin",
            pluginId: "computer-use",
            sourceSettingsPanel: "computer-use",
          },
        ],
      },
      {
        id: "computer-use:native-readiness",
        status: "unknown",
        actions: [],
      },
      {
        id: "computer-use:repair-sources",
        status: "unknown",
        actions: undefined,
      },
      {
        id: "computer-use:helper-signatures",
        status: "setup required",
        actions: undefined,
      },
      {
        id: "computer-use:mcp-command",
        status: "unknown",
        actions: undefined,
      },
      {
        id: "computer-use:permissions",
        status: "not proven",
        actions: undefined,
      },
      {
        id: "computer-use:mcp-readiness",
        status: "available",
        actions: undefined,
      },
    ],
    "Computer Use settings should project installed plugin state and existing config actions",
  );
  const nativeEntry = host.panel?.entries.find((entry) => entry.id === "computer-use:native-readiness");
  const permissionEntry = host.panel?.entries.find((entry) => entry.id === "computer-use:permissions");
  const mcpEntry = host.panel?.entries.find((entry) => entry.id === "computer-use:mcp-readiness");
  assertDeepEqual(
    [
      host.panel?.message.includes("OS permissions") ?? false,
      host.panel?.entries[0]?.details?.some((detail) => detail.includes("OS permissions")) ?? false,
      host.panel?.entries[0]?.details?.some((detail) => detail.includes("computer-use-app-approvals-read")) ?? false,
      nativeEntry?.details?.some((detail) => detail.includes("GUI control is not marked ready")) ?? false,
      permissionEntry?.details?.some((detail) => detail.includes("list_apps and GUI-control tool calls time out")) ?? false,
      mcpEntry?.details?.some((detail) => detail.includes("Tool: click")) ?? false,
    ],
    [true, true, true, true, true, true],
    "Computer Use settings should keep native permissions and app approvals explicit",
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

function secondaryActionSummaries(entry: CommandPanelState["entries"][number]) {
  return entry.secondaryActions?.map((secondary) => {
    const action = secondary.action;
    if (action.type === "installPlugin") {
      return {
        type: action.type,
        pluginId: action.pluginId,
        sourceSettingsPanel: action.sourceSettingsPanel,
      };
    }
    if (action.type === "writePluginConfig") {
      return {
        type: action.type,
        pluginId: action.pluginId,
        enabled: action.enabled,
        sourceSettingsPanel: action.sourceSettingsPanel,
      };
    }
    if (action.type === "uninstallPlugin") {
      return {
        type: action.type,
        pluginId: action.pluginId,
        sourceSettingsPanel: action.sourceSettingsPanel,
      };
    }
    if (action.type === "openComputerUseSetup") {
      return {
        type: action.type,
        target: action.target,
        codexHome: action.codexHome,
      };
    }
    if (action.type === "probeComputerUseMcp") {
      return {
        type: action.type,
        threadId: action.threadId,
        server: action.server,
        tool: action.tool,
      };
    }
    if (action.type === "repairComputerUseBundle") {
      return {
        type: action.type,
        codexHome: action.codexHome,
      };
    }
    return { type: action.type };
  });
}

function detailIndex(entry: CommandPanelState["entries"][number], prefix: string): number {
  const index = entry.details?.findIndex((detail) => detail.startsWith(prefix)) ?? -1;
  return index < 0 ? Number.POSITIVE_INFINITY : index;
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
