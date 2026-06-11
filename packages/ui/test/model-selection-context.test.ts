import type { ThreadContextDefaults } from "../src/state/codex-reducer";
import {
  SETTINGS_MODEL_PROVIDER_EXCLUDED_IDS,
  isSettingsModelProviderExcluded,
  isSubscriptionCatalogModel,
  omitThreadModelSelection,
} from "../src/model/model-selection-context";

export default function runModelSelectionContextTests(): void {
  excludesSettingsOnlyProviderRows();
  detectsSubscriptionCatalogModelSlugs();
  omitsOnlyModelSelectionFieldsFromThreadContext();
}

function excludesSettingsOnlyProviderRows(): void {
  assertEqual(
    SETTINGS_MODEL_PROVIDER_EXCLUDED_IDS.includes("team_model_gateway"),
    true,
    "team gateway should stay hidden from the model settings provider editor",
  );
  assertEqual(
    isSettingsModelProviderExcluded("openai_http"),
    true,
    "subscription HTTP provider should stay hidden from the model settings provider editor",
  );
  assertEqual(
    isSettingsModelProviderExcluded("hicodex_local"),
    false,
    "local provider should remain editable in model settings",
  );
}

function detectsSubscriptionCatalogModelSlugs(): void {
  assertEqual(isSubscriptionCatalogModel(" gpt-5.5 "), true, "gpt hyphen models should be subscription catalog models");
  assertEqual(isSubscriptionCatalogModel("gpt_5_5"), true, "gpt underscore models should be subscription catalog models");
  assertEqual(isSubscriptionCatalogModel("claude-sonnet"), false, "non-gpt models should not be subscription catalog models");
  assertEqual(isSubscriptionCatalogModel(null), false, "missing model should not be a subscription catalog model");
}

function omitsOnlyModelSelectionFieldsFromThreadContext(): void {
  assertDeepEqual(
    omitThreadModelSelection({
      model: "gpt-5.5",
      modelProvider: "openai_http",
      serviceTier: "priority",
      sandbox: "workspace-write",
      reasoningEffort: "medium",
    } as ThreadContextDefaults),
    {
      sandbox: "workspace-write",
      reasoningEffort: "medium",
    },
    "model, provider, and service tier should be omitted while other context remains",
  );
  assertEqual(
    omitThreadModelSelection({
      model: "gpt-5.5",
      modelProvider: "openai_http",
      serviceTier: "priority",
    } as ThreadContextDefaults),
    null,
    "context with only model-selection fields should collapse to null",
  );
  assertEqual(omitThreadModelSelection(null), null, "null context should remain null");
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
