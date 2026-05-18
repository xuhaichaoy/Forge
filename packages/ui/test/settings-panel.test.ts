import { SETTINGS_SECTIONS, isRefreshableSettingsPanel } from "../src/components/model-settings-panel";
import {
  generalSettingsEntries,
  imageGenerationCapabilityEntries,
  localSettingsEntries,
} from "../src/state/settings-panel-workflow";
import type { SettingsPanelId } from "../src/state/composer-workflow";

export default function runSettingsPanelTests(): void {
  exposesUnifiedSettingsSectionsWithoutLogin();
  marksServerBackedSectionsRefreshable();
  projectsImageGenerationCapabilities();
  projectsNotificationPreferencesInGeneralSettings();
  projectsThemeAndLocaleInGeneralSettings();
  displaysCustomPermissionStateWithoutSelectableCustomMode();
  displaysCustomApprovalPolicyAsDegraded();
}

function exposesUnifiedSettingsSectionsWithoutLogin(): void {
  assertDeepEqual(
    SETTINGS_SECTIONS.map((section) => section.id),
    [
      "general",
      "models",
      "images",
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
    (["images", "mcp", "skills", "hooks", "apps", "plugins", "experimental"] as SettingsPanelId[])
      .map((panel) => isRefreshableSettingsPanel(panel)),
    [true, true, true, true, true, true, true],
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

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
