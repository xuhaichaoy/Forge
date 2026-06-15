import { WorkspaceFuzzyFileSearchController } from "../src/state/fuzzy-file-search-session";

export default async function runFuzzyFileSearchSessionTests(): Promise<void> {
  await streamsSessionNotificationsBySessionId();
  await searchOnceUsesSessionLifecycle();
  await fallsBackToLegacyFuzzyFileSearchWhenSessionMethodsAreMissing();
  await searchOnceFallsBackToLegacyFuzzyFileSearchWhenSessionMethodsAreMissing();
}

async function streamsSessionNotificationsBySessionId(): Promise<void> {
  const client = new RecordingRequestClient();
  const controller = new WorkspaceFuzzyFileSearchController(client);
  const updates: unknown[] = [];
  const completions: unknown[] = [];
  const session = await controller.createSession({
    roots: ["/workspace"],
    onUpdated: (payload) => updates.push(payload),
    onCompleted: (payload) => completions.push(payload),
  });

  await session.update("hic");
  controller.handleNotification({
    method: "fuzzyFileSearch/sessionUpdated",
    params: {
      sessionId: "other-session",
      query: "hic",
      files: [{ root: "/workspace", path: "ignored.ts", match_type: "file", file_name: "ignored.ts", score: 1, indices: null }],
    },
  });
  controller.handleNotification({
    method: "fuzzyFileSearch/sessionUpdated",
    params: {
      sessionId: session.id,
      query: "hic",
      files: [{ root: "/workspace", path: "src/ForgeApp.tsx", match_type: "file", file_name: "ForgeApp.tsx", score: 91, indices: null }],
    },
  });
  controller.handleNotification({
    method: "fuzzyFileSearch/sessionCompleted",
    params: { sessionId: session.id },
  });

  assertDeepEqual(
    client.requests.map((request) => request.method),
    ["fuzzyFileSearch/sessionStart", "fuzzyFileSearch/sessionUpdate"],
    "session search should use Desktop's streamed fuzzy file search methods",
  );
  assertEqual(updates.length, 1, "session updates should be filtered by sessionId");
  assertEqual(completions.length, 1, "session completion should be delivered for the active session");

  await session.stop();
  assertEqual(
    client.requests.at(-1)?.method,
    "fuzzyFileSearch/sessionStop",
    "stopping the UI search session should stop the app-server fuzzy search session",
  );
}

async function searchOnceUsesSessionLifecycle(): Promise<void> {
  const client = new RecordingRequestClient();
  const controller = new WorkspaceFuzzyFileSearchController(client);
  const searchPromise = controller.searchOnce({ roots: ["/workspace"], query: "hic" });

  while (client.requests.length < 2) await Promise.resolve();
  const startParams = client.requests[0]?.params as { sessionId?: string } | undefined;
  const sessionId = startParams?.sessionId;
  if (!sessionId) throw new Error("sessionStart should include a generated sessionId");

  controller.handleNotification({
    method: "fuzzyFileSearch/sessionUpdated",
    params: {
      sessionId,
      query: "hic",
      files: [{ root: "/workspace", path: "src/ForgeApp.tsx", match_type: "file", file_name: "ForgeApp.tsx", score: 91, indices: null }],
    },
  });
  controller.handleNotification({
    method: "fuzzyFileSearch/sessionCompleted",
    params: { sessionId },
  });

  const result = await searchPromise;
  assertEqual(result.files.length, 1, "one-shot search should return files from the completed session");
  assertDeepEqual(
    client.requests.map((request) => request.method),
    ["fuzzyFileSearch/sessionStart", "fuzzyFileSearch/sessionUpdate", "fuzzyFileSearch/sessionStop"],
    "one-shot search should start, update, and stop the app-server fuzzy search session",
  );
}

async function fallsBackToLegacyFuzzyFileSearchWhenSessionMethodsAreMissing(): Promise<void> {
  const client = new RecordingRequestClient({
    "fuzzyFileSearch/sessionStart": new Error("Method not found"),
    fuzzyFileSearch: {
      files: [{ root: "/workspace", path: "src/ForgeApp.tsx", match_type: "file", file_name: "ForgeApp.tsx", score: 91, indices: null }],
    },
  });
  const controller = new WorkspaceFuzzyFileSearchController(client);
  const updates: Array<{ query: string; files: unknown[] }> = [];
  const completions: unknown[] = [];
  const session = await controller.createSession({
    roots: ["/workspace"],
    onUpdated: (payload) => updates.push(payload),
    onCompleted: (payload) => completions.push(payload),
  });

  await session.update("hic");

  assertDeepEqual(
    client.requests.map((request) => request.method),
    ["fuzzyFileSearch/sessionStart", "fuzzyFileSearch"],
    "legacy fuzzyFileSearch should be used only when sessionStart is unavailable",
  );
  assertDeepEqual(
    client.requests.at(-1)?.params,
    { query: "hic", roots: ["/workspace"], cancellationToken: "vscode-fuzzy-file-search" },
    "legacy fallback should use Desktop's shared fuzzy search cancellation token",
  );
  assertEqual(updates.length, 1, "legacy fallback should synthesize a session update");
  assertEqual(updates[0]?.query, "hic", "legacy fallback update should preserve the searched query");
  assertEqual(completions.length, 1, "legacy fallback should synthesize session completion");
}

async function searchOnceFallsBackToLegacyFuzzyFileSearchWhenSessionMethodsAreMissing(): Promise<void> {
  const client = new RecordingRequestClient({
    "fuzzyFileSearch/sessionStart": new Error("Method not found"),
    fuzzyFileSearch: {
      files: [{ root: "/workspace", path: "src/ForgeApp.tsx", match_type: "file", file_name: "ForgeApp.tsx", score: 91, indices: null }],
    },
  });
  const controller = new WorkspaceFuzzyFileSearchController(client);

  const result = await controller.searchOnce({ roots: ["/workspace"], query: "hic" });

  assertEqual(result.files.length, 1, "one-shot search should return legacy fuzzy search files");
  assertDeepEqual(
    client.requests.map((request) => request.method),
    ["fuzzyFileSearch/sessionStart", "fuzzyFileSearch"],
    "one-shot search should use legacy fuzzyFileSearch only when sessionStart is unavailable",
  );
}

class RecordingRequestClient {
  readonly requests: Array<{ method: string; params: unknown }> = [];

  constructor(private readonly responses: Record<string, unknown> = {}) {}

  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    this.requests.push({ method, params });
    const response = this.responses[method];
    if (response instanceof Error) throw response;
    return (response ?? {}) as T;
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}\nexpected: ${String(expected)}\nactual: ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\nexpected: ${expectedJson}\nactual: ${actualJson}`);
  }
}
