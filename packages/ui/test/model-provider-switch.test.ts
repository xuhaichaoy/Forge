import {
  CROSS_ACCOUNT_PROVIDER_SWITCH_MESSAGE,
  isCrossAccountProviderSwitch,
  isCrossAccountModelSelectionForThread,
  normalizedModelProviderForSwitch,
  providerIdForModelSelectionKey,
} from "../src/model/model-provider-switch";

export default function runModelProviderSwitchTests(): void {
  normalizesBuiltinSubscriptionProviderToHttp();
  resolvesProviderFromSelectionKeyWithFallback();
  blocksCrossAccountSelectionKeysForExistingThreads();
  blocksSubscriptionToApiProviderSwitches();
  allowsApiToTeamProviderSwitches();
  exposesUserFacingRestrictionMessage();
}

function normalizesBuiltinSubscriptionProviderToHttp(): void {
  assertEqual(
    normalizedModelProviderForSwitch("openai"),
    "openai_http",
    "builtin subscription provider should normalize to the HTTP provider",
  );
}

function resolvesProviderFromSelectionKeyWithFallback(): void {
  assertEqual(
    providerIdForModelSelectionKey("openai_http::gpt-5.5", "hicodex_local"),
    "openai_http",
    "explicit selection key should provide the next provider",
  );
  assertEqual(
    providerIdForModelSelectionKey(null, "team_model_gateway"),
    "team_model_gateway",
    "null selection should fall back to the config/default provider",
  );
}

function blocksCrossAccountSelectionKeysForExistingThreads(): void {
  assertEqual(
    isCrossAccountModelSelectionForThread({
      currentProvider: "openai_http",
      selectedKey: "team_model_gateway::Qwen3.6-27B-mxfp4",
      fallbackProvider: "openai_http",
    }),
    true,
    "subscription thread selecting a team model should be blocked",
  );
  assertEqual(
    isCrossAccountModelSelectionForThread({
      currentProvider: "hicodex_local",
      selectedKey: null,
      fallbackProvider: "team_model_gateway",
    }),
    false,
    "personal API thread falling back to team provider should stay allowed",
  );
}

function blocksSubscriptionToApiProviderSwitches(): void {
  assertEqual(
    isCrossAccountProviderSwitch("openai_http", "hicodex_local"),
    true,
    "subscription to personal API provider should be blocked in an existing chat",
  );
  assertEqual(
    isCrossAccountProviderSwitch("team_model_gateway", "openai_http"),
    true,
    "team gateway to subscription provider should be blocked in an existing chat",
  );
}

function allowsApiToTeamProviderSwitches(): void {
  assertEqual(
    isCrossAccountProviderSwitch("hicodex_local", "team_model_gateway"),
    false,
    "personal API provider to team gateway stays allowed",
  );
  assertEqual(
    isCrossAccountProviderSwitch("team_model_gateway", "team_model_gateway"),
    false,
    "same provider is always allowed",
  );
}

function exposesUserFacingRestrictionMessage(): void {
  assertIncludes(
    CROSS_ACCOUNT_PROVIDER_SWITCH_MESSAGE,
    "请新建聊天",
    "restriction message should tell users how to proceed",
  );
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertIncludes(haystack: string, needle: string, message: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(`${message}: expected ${JSON.stringify(haystack)} to include ${JSON.stringify(needle)}`);
  }
}
