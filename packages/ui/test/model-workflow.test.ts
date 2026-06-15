import { buildLocalModelCatalogConfig, type ModelConfig } from "../src/model/model-settings";
import {
  provisionTeamModelGatewayProvider,
  saveModelDraft,
  TEAM_MODEL_GATEWAY_LOG_SOURCES,
  type CodexUiDispatch,
  type SaveModelDraftOptions,
} from "../src/model/model-workflow";
import {
  buildTeamModelGatewayProviderSnapshot,
  TEAM_MODEL_GATEWAY_PROVIDER_ID,
} from "../src/model/team-model-gateway";

interface RecordedRequest {
  method: string;
  params: unknown;
  timeout?: number | null;
}

export default async function runModelWorkflowTests(): Promise<void> {
  await writesConfigBeforeProjectingModelState();
  await doesNotProjectModelStateWhenConfigWriteFails();
  await tagsAndLocalizesTeamGatewayRestartSuccessToast();
  await tagsDegradedTeamGatewayReconnectToastAsVisibleWarning();
}

/*
 * The provisioning toasts are decoupled from their copy: the toast viewport
 * mutes on the structured `source` tag, and the text comes from the i18n
 * dictionary (en-US runner baseline). These two tests lock the contract for
 * the restart-success confirmation (muted by tag downstream) and the
 * degraded reconnect-pending variant (own tag, stays a visible warning).
 */
async function tagsAndLocalizesTeamGatewayRestartSuccessToast(): Promise<void> {
  const client = createClientSequence([
    staleTeamProviderConfigRead(),
    configReadResult(),
    {},
  ]);
  const actions: unknown[] = [];
  const snapshot = teamGatewaySnapshotFixture();
  const result = await provisionTeamModelGatewayProvider({
    client: client.client,
    dispatch: (action) => actions.push(action),
    connect: async () => true,
    connected: true,
    codexHome: "/tmp/hicodex-home",
    snapshot,
    catalogConfig: buildLocalModelCatalogConfig(snapshot.modelConfig),
    writeModelCatalog: async () => "/tmp/models.json",
  });

  assertDeepEqual(
    result,
    { status: "provisioned", restartedRuntime: true },
    "changed existing definition should provision and restart the runtime",
  );
  assertDeepEqual(
    client.requests.map((request) => request.method),
    ["config/read", "config/read", "config/batchWrite"],
    "provisioning should read providers, resolve the write target, then batch-write",
  );
  assertEqual(client.disconnects(), 1, "credential rotation should tear down the stale runtime connection once");
  const log = findSingleLogAction(actions);
  assertEqual(
    log.source,
    TEAM_MODEL_GATEWAY_LOG_SOURCES.providerUpdated,
    "success toast must carry the structured source tag the toast viewport mutes on",
  );
  assertEqual(log.level, "info", "success toast should be an info entry");
  assertEqual(
    log.text,
    "Team model connection updated",
    "success copy must resolve from the i18n dictionary, not a hardcoded literal",
  );
}

async function tagsDegradedTeamGatewayReconnectToastAsVisibleWarning(): Promise<void> {
  const client = createClientSequence([
    staleTeamProviderConfigRead(),
    configReadResult(),
    {},
  ]);
  const actions: unknown[] = [];
  const snapshot = teamGatewaySnapshotFixture();
  const result = await provisionTeamModelGatewayProvider({
    client: client.client,
    dispatch: (action) => actions.push(action),
    connect: async () => false,
    connected: true,
    snapshot,
    catalogConfig: buildLocalModelCatalogConfig(snapshot.modelConfig),
    writeModelCatalog: async () => "/tmp/models.json",
  });

  assertDeepEqual(
    result,
    { status: "provisioned", restartedRuntime: false },
    "definition write should report provisioned even when the runtime did not reconnect",
  );
  const log = findSingleLogAction(actions);
  assertEqual(
    log.source,
    TEAM_MODEL_GATEWAY_LOG_SOURCES.reconnectPending,
    "degraded toast carries its own source tag, which is not in the viewport mute table",
  );
  assertEqual(log.level, "warn", "degraded toast should stay a visible warning");
  assertEqual(
    log.text,
    "Team model connection updated, but the model service has not reconnected yet; it will retry automatically",
    "degraded copy must resolve from the i18n dictionary",
  );
}

async function writesConfigBeforeProjectingModelState(): Promise<void> {
  const client = createClientSequence([
    configReadResult(),
    {},
    { data: [{ id: "local_provider", model: "gpt-local", displayName: "Local" }] },
  ]);
  const actions: unknown[] = [];
  const result = await saveModelDraft({
    client: client.client,
    dispatch: (action) => actions.push(action),
    connect: async () => true,
    connected: true,
    codexHome: "/tmp/hicodex-home",
    modelDraft: modelDraft(),
    writeModelCatalog: async () => "/tmp/models.json",
  });

  assertDeepEqual(result, { wroteConfig: true, restartedRuntime: false }, "successful save should report config write");
  assertDeepEqual(
    client.requests.map((request) => request.method),
    ["config/read", "config/batchWrite", "model/list"],
    "model draft save should write config before refreshing model/list",
  );
  assertEqual(
    actions.some((action) => action && typeof action === "object" && (action as { type?: unknown }).type === "upsertModel"),
    false,
    "model draft save should not optimistically upsert models before app-server confirms config",
  );
  assertEqual(
    actions.some((action) => action && typeof action === "object" && (action as { type?: unknown }).type === "setModels"),
    true,
    "model/list refresh should be the source of projected model state after a config write",
  );
}

async function doesNotProjectModelStateWhenConfigWriteFails(): Promise<void> {
  const client = createClientSequence([
    configReadResult(),
    new Error("write failed"),
  ]);
  const actions: unknown[] = [];
  const result = await saveModelDraft({
    client: client.client,
    dispatch: (action) => actions.push(action),
    connect: async () => true,
    connected: true,
    modelDraft: modelDraft(),
    writeModelCatalog: async () => "/tmp/models.json",
  });

  assertDeepEqual(result, { wroteConfig: false, restartedRuntime: false }, "failed save should report no config write");
  assertDeepEqual(
    client.requests.map((request) => request.method),
    ["config/read", "config/batchWrite"],
    "failed config write should not refresh model/list",
  );
  assertEqual(
    actions.some((action) => action && typeof action === "object" && (action as { type?: unknown }).type === "upsertModel"),
    false,
    "failed config write should not project unsaved model state",
  );
}

function modelDraft(): ModelConfig {
  return {
    id: " local provider ",
    name: "Local",
    protocol: "openai",
    baseUrl: "https://models.example.test/v1",
    apiKey: "secret",
    model: " gpt-local ",
    models: ["gpt-local"],
    temperature: 0.2,
    maxTokens: null,
    supportsImageInput: true,
  };
}

function configReadResult(): unknown {
  return {
    layers: [{
      name: { type: "user", file: "/tmp/config.toml" },
      version: "v1",
    }],
  };
}

/*
 * An EXISTING team-gateway provider whose definition no longer matches the
 * snapshot (rotated token / stale base URL) — forces the rewrite + runtime
 * restart branch of provisionTeamModelGatewayProvider.
 */
function staleTeamProviderConfigRead(): unknown {
  return {
    config: {
      model_providers: {
        [TEAM_MODEL_GATEWAY_PROVIDER_ID]: {
          name: "Stale Team Gateway",
          base_url: "https://stale.example.test/api/team-gateway/v1",
          experimental_bearer_token: "stale-token",
        },
      },
    },
  };
}

function teamGatewaySnapshotFixture() {
  const snapshot = buildTeamModelGatewayProviderSnapshot({
    connection: { baseUrl: "https://team.example.test", token: "team-token" },
    models: ["prov:gpt-team"],
  });
  if (!snapshot) throw new Error("expected a team model gateway snapshot fixture");
  return snapshot;
}

function findSingleLogAction(actions: unknown[]): Record<string, unknown> {
  const logs = actions.filter((action): action is Record<string, unknown> => (
    !!action && typeof action === "object" && (action as { type?: unknown }).type === "log"
  ));
  if (logs.length !== 1) {
    throw new Error(`expected exactly one log action, got ${logs.length}: ${JSON.stringify(actions)}`);
  }
  return logs[0];
}

function createClientSequence(results: unknown[]) {
  const requests: RecordedRequest[] = [];
  let disconnectCount = 0;
  let index = 0;
  return {
    requests,
    disconnects: () => disconnectCount,
    client: {
      async request(method: string, params?: unknown, timeout?: number | null) {
        requests.push({ method, params, timeout });
        const result = results[index++] ?? {};
        if (result instanceof Error) throw result;
        return result;
      },
      // restartRuntimeForUpdatedProviderConfig tears the connection down
      // before reconnecting — the provisioning tests need this to exist.
      async disconnect() {
        disconnectCount += 1;
      },
    } as SaveModelDraftOptions["client"],
  };
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
