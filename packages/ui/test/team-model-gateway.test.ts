import { buildTeamModelGatewayCatalogConfig } from "../src/hooks/use-team-model-gateway";
import { EMPTY_MODEL, type ModelConfig } from "../src/model/model-settings";
import {
  TEAM_MODEL_GATEWAY_PROVIDER_ID,
  buildTeamModelGatewayProviderSnapshot,
  reconcileTeamModelSlug,
  teamDefaultModelFromResponse,
  teamModelGatewayBaseUrl,
  teamModelGatewayDefinitionMatchesConfig,
  teamModelGatewayProviderDefinition,
  teamModelGatewayProvisionSignature,
  teamModelLabelsFromResponse,
  teamModelSlugsFromResponse,
  teamNameFromResponse,
} from "../src/model/team-model-gateway";

export default function runTeamModelGatewayTests(): void {
  parsesOpenAiStyleModelList();
  parsesAlternateModelListShapes();
  usesServerModelIdsVerbatim();
  parsesModelDisplayLabels();
  parsesTeamNameFromCurrentTeamResponse();
  parsesTeamDefaultModelAndPrefersItAsPrimary();
  buildsCodexModelProviderSnapshot();
  reconcilesLegacySelections();
  dropsUnknownSelectedModelInsteadOfInjectingIt();
  buildsProviderDefinitionAndMatchesConfig();
  provisionSignatureTracksDefinitionAndCatalog();
  buildsTeamCatalogWithoutUnsavedPersonalPlaceholder();
  buildsTeamCatalogWithSavedPersonalModels();
}

function parsesOpenAiStyleModelList(): void {
  assertDeepEqual(
    teamModelSlugsFromResponse({
      object: "list",
      data: [
        { id: "deepseek-ai/DeepSeek-V4-Flash" },
        { id: "Qwen/Qwen3-Coder" },
        { id: "deepseek-ai/DeepSeek-V4-Flash" },
      ],
    }),
    ["deepseek-ai/DeepSeek-V4-Flash", "Qwen/Qwen3-Coder"],
    "OpenAI-compatible model list should normalize unique ids",
  );
}

function parsesAlternateModelListShapes(): void {
  assertDeepEqual(
    teamModelSlugsFromResponse({
      models: [
        "gpt-team-a",
        { model: "gpt-team-b" },
        { slug: "gpt-team-c" },
        { name: "gpt-team-d" },
        { title: "ignored" },
      ],
    }),
    ["gpt-team-a", "gpt-team-b", "gpt-team-c", "gpt-team-d"],
    "alternate model response shapes should be accepted",
  );
}

function usesServerModelIdsVerbatim(): void {
  // The gateway's canonical ids are `provider_id:model_id` (Yuxi
  // team_gateway_service `_model_spec`); the client must not rewrite them.
  assertDeepEqual(
    teamModelSlugsFromResponse({
      data: [{ id: "123123:Qwen3.6-27B-mxfp4" }, { id: "openrouter:gpt-team" }],
    }),
    ["123123:Qwen3.6-27B-mxfp4", "openrouter:gpt-team"],
    "server-scoped model ids should be used verbatim",
  );
}

function parsesModelDisplayLabels(): void {
  assertDeepEqual(
    teamModelLabelsFromResponse({
      data: [
        { id: "123123:Qwen3.6-27B-mxfp4", display_name: "Qwen3.6 27B" },
        { id: "123123:bare", display_name: "123123:bare" },
        { id: "123123:none" },
      ],
    }),
    { "123123:Qwen3.6-27B-mxfp4": "Qwen3.6 27B" },
    "display labels should be captured only when they differ from the id",
  );
}

function parsesTeamNameFromCurrentTeamResponse(): void {
  assertEqual(
    teamNameFromResponse({ team: { name: "售前一组" } }),
    "售前一组",
    "team.name should be used as display name",
  );
  assertEqual(
    teamNameFromResponse({ current_team: { name: "交付中心" } }),
    "交付中心",
    "current_team.name should be used as fallback display name",
  );
}

function parsesTeamDefaultModelAndPrefersItAsPrimary(): void {
  const response = {
    data: [
      { id: "123123:Qwen3.6-27B-mxfp4", is_default: false },
      { id: "123123:DeepSeek-V4", is_default: true },
    ],
  };
  assertEqual(
    teamDefaultModelFromResponse(response),
    "123123:DeepSeek-V4",
    "the member default (is_default) should be extracted from /models",
  );
  const snapshot = buildTeamModelGatewayProviderSnapshot({
    connection: { baseUrl: "http://127.0.0.1:5050", token: "team-token" },
    models: ["123123:Qwen3.6-27B-mxfp4", "123123:DeepSeek-V4"],
    defaultModel: "123123:DeepSeek-V4",
    teamName: null,
  });
  assert(snapshot, "snapshot should exist");
  assertEqual(
    snapshot.modelConfig.model,
    "123123:DeepSeek-V4",
    "with no explicit selection the member default should be primary",
  );
  assertEqual(
    snapshot.provider.defaultModel,
    "123123:DeepSeek-V4",
    "the picker provider should advertise the member default for fallback resolution",
  );
}

function buildsCodexModelProviderSnapshot(): void {
  const snapshot = buildTeamModelGatewayProviderSnapshot({
    connection: {
      baseUrl: " http://127.0.0.1:5050/// ",
      token: " team-token ",
    },
    models: ["team-a", "team-b"],
    selectedModel: "team-b",
    teamName: "售前团队",
  });
  assert(snapshot, "snapshot should be built when models exist");
  assertEqual(snapshot.provider.id, TEAM_MODEL_GATEWAY_PROVIDER_ID, "provider id should match Codex config key");
  assertEqual(snapshot.provider.label, "售前团队 · 团队模型", "provider label should include team name");
  assertEqual(snapshot.provider.baseUrl, "http://127.0.0.1:5050/api/team-gateway/v1", "provider base url should target gateway");
  assertEqual(snapshot.modelConfig.model, "team-b", "selected model should become primary model");
  assertDeepEqual(snapshot.provider.models, ["team-a", "team-b"], "picker models should keep the server's order");
  assertEqual(snapshot.modelConfig.apiKey, " team-token ", "token should be carried to Codex provider config");
  assertEqual(
    teamModelGatewayBaseUrl({ baseUrl: "https://team.example.test/" }),
    "https://team.example.test/api/team-gateway/v1",
    "gateway base url should be derived from configured service base url",
  );
}

function reconcilesLegacySelections(): void {
  const models = ["123123:Qwen3.6-27B-mxfp4", "openrouter:gpt-team"];
  assertEqual(
    reconcileTeamModelSlug("123123:Qwen3.6-27B-mxfp4", models),
    "123123:Qwen3.6-27B-mxfp4",
    "canonical selection should be kept as-is",
  );
  assertEqual(
    reconcileTeamModelSlug("Qwen3.6-27B-mxfp4", models),
    "123123:Qwen3.6-27B-mxfp4",
    "legacy bare selection should map onto the unique scoped id",
  );
  assertEqual(
    reconcileTeamModelSlug("9:Qwen3.6-27B-mxfp4", models),
    "123123:Qwen3.6-27B-mxfp4",
    "legacy client-invented prefix should map onto the unique scoped id",
  );
  assertEqual(
    reconcileTeamModelSlug("gpt-team", ["a:gpt-team", "b:gpt-team"]),
    null,
    "ambiguous bare selection should not guess",
  );
  assertEqual(
    reconcileTeamModelSlug("unknown-model", models),
    null,
    "unknown selection should be dropped",
  );
}

function dropsUnknownSelectedModelInsteadOfInjectingIt(): void {
  const snapshot = buildTeamModelGatewayProviderSnapshot({
    connection: {
      baseUrl: "http://127.0.0.1:5050",
      token: "team-token",
    },
    models: ["123123:Qwen3.6-27B-mxfp4"],
    selectedModel: "999:no-longer-served",
    teamName: null,
  });
  assert(snapshot, "snapshot should be built from server models");
  assertEqual(
    snapshot.modelConfig.model,
    "123123:Qwen3.6-27B-mxfp4",
    "stale selection must not be injected back into the model list",
  );
  assertDeepEqual(
    snapshot.provider.models,
    ["123123:Qwen3.6-27B-mxfp4"],
    "picker should only expose models the gateway actually serves",
  );
}

function buildsProviderDefinitionAndMatchesConfig(): void {
  const snapshot = buildTeamModelGatewayProviderSnapshot({
    connection: {
      baseUrl: "http://127.0.0.1:5050",
      token: "team-token",
    },
    models: ["123123:Qwen3.6-27B-mxfp4"],
    teamName: "售前团队",
  });
  assert(snapshot, "snapshot should exist");
  const definition = teamModelGatewayProviderDefinition(snapshot);
  assertDeepEqual(
    definition,
    {
      name: "售前团队 · 团队模型",
      baseUrl: "http://127.0.0.1:5050/api/team-gateway/v1",
      token: "team-token",
    },
    "definition should carry name + base url + token",
  );
  assert(
    teamModelGatewayDefinitionMatchesConfig(definition, {
      name: "售前团队 · 团队模型",
      base_url: "http://127.0.0.1:5050/api/team-gateway/v1",
      experimental_bearer_token: "team-token",
      wire_api: "responses",
      requires_openai_auth: false,
    }),
    "matching config entry should be detected as up to date",
  );
  assert(
    !teamModelGatewayDefinitionMatchesConfig(definition, {
      name: "售前团队 · 团队模型",
      base_url: "http://127.0.0.1:5050/api/team-gateway/v1",
      experimental_bearer_token: "rotated-token",
    }),
    "token rotation should be detected as a definition change",
  );
  assert(
    !teamModelGatewayDefinitionMatchesConfig(definition, undefined),
    "missing config entry should require provisioning",
  );
}

function provisionSignatureTracksDefinitionAndCatalog(): void {
  const snapshot = buildTeamModelGatewayProviderSnapshot({
    connection: { baseUrl: "http://127.0.0.1:5050", token: "team-token" },
    models: ["123123:Qwen3.6-27B-mxfp4"],
    teamName: null,
  });
  assert(snapshot, "snapshot should exist");
  const base = teamModelGatewayProvisionSignature(snapshot, ["local-model", "123123:Qwen3.6-27B-mxfp4"]);
  assertEqual(
    teamModelGatewayProvisionSignature(snapshot, ["local-model", "123123:Qwen3.6-27B-mxfp4"]),
    base,
    "same definition + catalog should produce a stable signature",
  );
  assert(
    teamModelGatewayProvisionSignature(snapshot, ["local-model"]) !== base,
    "catalog model changes should change the signature",
  );
  const rotated = buildTeamModelGatewayProviderSnapshot({
    connection: { baseUrl: "http://127.0.0.1:5050", token: "rotated" },
    models: ["123123:Qwen3.6-27B-mxfp4"],
    teamName: null,
  });
  assert(rotated, "rotated snapshot should exist");
  assert(
    teamModelGatewayProvisionSignature(rotated, ["local-model", "123123:Qwen3.6-27B-mxfp4"]) !== base,
    "token rotation should change the signature",
  );
}

function buildsTeamCatalogWithoutUnsavedPersonalPlaceholder(): void {
  const snapshot = buildTeamModelGatewayProviderSnapshot({
    connection: { baseUrl: "http://127.0.0.1:5050", token: "team-token" },
    models: ["123123:Qwen3.6-27B-mxfp4"],
    teamName: null,
  });
  assert(snapshot, "snapshot should exist");
  const catalog = buildTeamModelGatewayCatalogConfig({
    personalModelDraft: EMPTY_MODEL,
    personalProviderConfigured: false,
    teamModelConfig: snapshot.modelConfig,
    teamModels: snapshot.provider.models,
  });
  assertDeepEqual(
    catalog.models,
    ["123123:Qwen3.6-27B-mxfp4"],
    "unsaved personal placeholder should not be merged into the team catalog",
  );
}

function buildsTeamCatalogWithSavedPersonalModels(): void {
  const snapshot = buildTeamModelGatewayProviderSnapshot({
    connection: { baseUrl: "http://127.0.0.1:5050", token: "team-token" },
    models: ["123123:Qwen3.6-27B-mxfp4"],
    teamName: null,
  });
  assert(snapshot, "snapshot should exist");
  const catalog = buildTeamModelGatewayCatalogConfig({
    personalModelDraft: modelDraft({ model: "local-a", models: ["local-a", "local-b"] }),
    personalProviderConfigured: true,
    teamModelConfig: snapshot.modelConfig,
    teamModels: snapshot.provider.models,
  });
  assertDeepEqual(
    catalog.models,
    ["local-a", "local-b", "123123:Qwen3.6-27B-mxfp4"],
    "saved personal models should be merged with team models for the full catalog overwrite",
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

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}\n  expected: ${String(expected)}\n  actual:   ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Assertion failed: ${message}\n  expected: ${expectedJson}\n  actual:   ${actualJson}`);
  }
}
