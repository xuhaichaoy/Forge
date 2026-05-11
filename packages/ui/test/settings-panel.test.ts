import { SETTINGS_SECTIONS, isRefreshableSettingsPanel } from "../src/components/model-settings-panel";
import { imageGenerationCapabilityEntries } from "../src/state/settings-panel-workflow";
import type { SettingsPanelId } from "../src/state/composer-workflow";

export default function runSettingsPanelTests(): void {
  exposesUnifiedSettingsSectionsWithoutLogin();
  marksServerBackedSectionsRefreshable();
  projectsImageGenerationCapabilities();
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

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
