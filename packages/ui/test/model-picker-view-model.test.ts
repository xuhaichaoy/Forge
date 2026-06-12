import { buildModelPickerProviders } from "../src/hooks/use-model-picker-view-model";
import {
  DEFAULT_MODEL_NAME,
  DEFAULT_MODEL_PROVIDER_ID,
  EMPTY_MODEL,
  type ModelConfig,
} from "../src/model/model-settings";

export default function runModelPickerViewModelTests(): void {
  hidesFactoryPlaceholderPersonalModelsUntilProviderIsConfigured();
  exposesSavedPersonalModels();
}

function hidesFactoryPlaceholderPersonalModelsUntilProviderIsConfigured(): void {
  const providers = buildModelPickerProviders({
    modelDraft: EMPTY_MODEL,
    personalProviderConfigured: false,
    threadContextDefaults: null,
    teamModelGatewayProvider: null,
  });
  const personalProvider = providers.find((provider) => provider.id === DEFAULT_MODEL_PROVIDER_ID);
  assert(personalProvider, "personal provider shell should still render as a settings entry point");
  assertDeepEqual(
    personalProvider.models,
    [],
    "factory placeholder model should not be selectable before a provider is saved",
  );
}

function exposesSavedPersonalModels(): void {
  const providers = buildModelPickerProviders({
    modelDraft: modelDraft({ model: "local-a", models: ["local-a", "local-b"] }),
    personalProviderConfigured: true,
    threadContextDefaults: null,
    teamModelGatewayProvider: null,
  });
  const personalProvider = providers.find((provider) => provider.id === DEFAULT_MODEL_PROVIDER_ID);
  assert(personalProvider, "saved personal provider should be present");
  assertDeepEqual(
    personalProvider.models,
    ["local-a", "local-b"],
    "saved personal provider should expose its configured model catalog",
  );
  assert(
    !personalProvider.models.includes(DEFAULT_MODEL_NAME),
    "saved multi-model provider should not leak the factory default model",
  );
}

function modelDraft(overrides: Partial<ModelConfig> = {}): ModelConfig {
  return {
    ...EMPTY_MODEL,
    ...overrides,
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Assertion failed: ${message}\n  expected: ${expectedJson}\n  actual:   ${actualJson}`);
  }
}
