import {
  DEFAULT_MODEL_AUTO_COMPACT_TOKEN_LIMIT,
  DEFAULT_MODEL_BASE_URL,
  DEFAULT_MODEL_CONTEXT_WINDOW,
  DEFAULT_MODEL_PROVIDER_ID,
  DEFAULT_MODEL_PROVIDER_NAME,
  DEFAULT_MODEL_REASONING_SUMMARY,
  buildModelConfigFromConfig,
  buildLocalModelCatalogEntry,
  buildModelConfigEdits,
  normalizeBaseUrl,
  normalizeModelConfig,
  providerIdForModel,
  type ModelConfig,
} from "../src/model/model-settings";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
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

function testModel(overrides: Partial<ModelConfig> = {}): ModelConfig {
  return {
    id: " Local Provider ",
    name: " Local Gateway ",
    protocol: "openai",
    baseUrl: " http://127.0.0.1:8890/v1/// ",
    apiKey: " token-value ",
    model: " gpt-local ",
    temperature: 0.2,
    maxTokens: null,
    supportsImageInput: true,
    ...overrides,
  };
}

export default function runModelSettingsTests(): void {
  assertEqual(
    providerIdForModel({ id: " Local Provider-1/GPT.5 " }),
    "local_provider_1_gpt_5",
    "providerIdForModel normalizes provider ids",
  );
  assertEqual(
    providerIdForModel({ id: "   " }),
    DEFAULT_MODEL_PROVIDER_ID,
    "providerIdForModel falls back for blank ids",
  );

  assertEqual(
    normalizeBaseUrl(" https://models.example.test/v1/// "),
    "https://models.example.test/v1",
    "normalizeBaseUrl trims whitespace and trailing slashes",
  );
  assertEqual(
    normalizeBaseUrl("   "),
    DEFAULT_MODEL_BASE_URL,
    "normalizeBaseUrl falls back for blank values",
  );

  const normalized = normalizeModelConfig(testModel());
  assertEqual(normalized.id, "local_provider", "normalizeModelConfig normalizes id");
  assertEqual(normalized.baseUrl, "http://127.0.0.1:8890/v1", "normalizeModelConfig trims baseUrl");
  assertEqual(normalized.model, "gpt-local", "normalizeModelConfig trims model");

  assertDeepEqual(
    buildLocalModelCatalogEntry(testModel({ name: "" })),
    {
      model: "gpt-local",
      displayName: "gpt-local",
      description: "Local OpenAI-compatible coding model via http://127.0.0.1:8890/v1.",
      contextWindow: DEFAULT_MODEL_CONTEXT_WINDOW,
      autoCompactTokenLimit: DEFAULT_MODEL_AUTO_COMPACT_TOKEN_LIMIT,
      inputModalities: ["text", "image"],
    },
    "buildLocalModelCatalogEntry uses normalized values and defaults",
  );
  assertDeepEqual(
    buildLocalModelCatalogEntry(testModel({ supportsImageInput: false })).inputModalities,
    ["text"],
    "buildLocalModelCatalogEntry can write text-only model capability",
  );

  const edits = buildModelConfigEdits(
    testModel({
      id: " Team Provider ",
      name: " Team Gateway ",
      baseUrl: " https://gateway.example.test/v1/// ",
      apiKey: " bearer-token ",
      model: " gpt-team ",
    }),
    "/tmp/models.json",
  );
  assertEqual(edits.length, 7, "buildModelConfigEdits returns seven edits");
  assertDeepEqual(
    edits.map((edit) => edit.keyPath),
    [
      "model_catalog_json",
      "model_providers.team_provider",
      "model_provider",
      "model",
      "model_context_window",
      "model_auto_compact_token_limit",
      "model_reasoning_summary",
    ],
    "buildModelConfigEdits writes the expected keys",
  );
  assert(edits.every((edit) => edit.mergeStrategy === "replace"), "buildModelConfigEdits uses replace strategy");
  assertDeepEqual(
    edits,
    [
      { keyPath: "model_catalog_json", value: "/tmp/models.json", mergeStrategy: "replace" },
      {
        keyPath: "model_providers.team_provider",
        value: {
          name: "Team Gateway",
          base_url: "https://gateway.example.test/v1",
          wire_api: "responses",
          requires_openai_auth: false,
          experimental_bearer_token: "bearer-token",
        },
        mergeStrategy: "replace",
      },
      { keyPath: "model_provider", value: "team_provider", mergeStrategy: "replace" },
      { keyPath: "model", value: "gpt-team", mergeStrategy: "replace" },
      { keyPath: "model_context_window", value: DEFAULT_MODEL_CONTEXT_WINDOW, mergeStrategy: "replace" },
      { keyPath: "model_auto_compact_token_limit", value: DEFAULT_MODEL_AUTO_COMPACT_TOKEN_LIMIT, mergeStrategy: "replace" },
      { keyPath: "model_reasoning_summary", value: DEFAULT_MODEL_REASONING_SUMMARY, mergeStrategy: "replace" },
    ],
    "buildModelConfigEdits writes normalized settings and bearer token provider",
  );
  const defaultNameProviderEdit = buildModelConfigEdits(testModel({ name: "   " }), "/tmp/models.json")[1];
  const defaultNameProvider = defaultNameProviderEdit?.value as { name?: unknown } | undefined;
  assertEqual(
    defaultNameProvider?.name,
    DEFAULT_MODEL_PROVIDER_NAME,
    "buildModelConfigEdits provider falls back to the default provider name",
  );

  assertDeepEqual(
    buildModelConfigFromConfig({
      model: " gpt-team ",
      model_provider: " team_provider ",
      model_providers: {
        team_provider: {
          name: " Team Gateway ",
          base_url: " https://gateway.example.test/v1/// ",
          experimental_bearer_token: " bearer-token ",
        },
      },
    }),
    {
      id: "team_provider",
      name: "Team Gateway",
      protocol: "openai",
      baseUrl: "https://gateway.example.test/v1",
      apiKey: "bearer-token",
      model: "gpt-team",
      temperature: 0.2,
      maxTokens: null,
      supportsImageInput: true,
    },
    "buildModelConfigFromConfig derives the active provider endpoint from config/read",
  );
  assertDeepEqual(
    buildModelConfigFromConfig({
      model: "",
      model_provider: "",
      model_providers: {},
    }),
    {
      id: DEFAULT_MODEL_PROVIDER_ID,
      name: DEFAULT_MODEL_PROVIDER_NAME,
      protocol: "openai",
      baseUrl: DEFAULT_MODEL_BASE_URL,
      apiKey: "",
      model: "Qwen3.6-27B-mxfp4",
      temperature: 0.2,
      maxTokens: null,
      supportsImageInput: true,
    },
    "buildModelConfigFromConfig falls back to HiCodex defaults when config/read omits provider details",
  );
}
