import type { ModelConfig } from "../src/model/model-settings";
import {
  saveModelDraft,
  type CodexUiDispatch,
  type SaveModelDraftOptions,
} from "../src/model/model-workflow";

interface RecordedRequest {
  method: string;
  params: unknown;
  timeout?: number | null;
}

export default async function runModelWorkflowTests(): Promise<void> {
  await writesConfigBeforeProjectingModelState();
  await doesNotProjectModelStateWhenConfigWriteFails();
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

function createClientSequence(results: unknown[]) {
  const requests: RecordedRequest[] = [];
  let index = 0;
  return {
    requests,
    client: {
      async request(method: string, params?: unknown, timeout?: number | null) {
        requests.push({ method, params, timeout });
        const result = results[index++] ?? {};
        if (result instanceof Error) throw result;
        return result;
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
