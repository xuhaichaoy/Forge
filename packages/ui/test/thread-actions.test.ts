import type { Thread } from "@forge/codex-protocol";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ServicesProvider } from "../src/components/services-context";
import type { CodexJsonRpcClient } from "../src/lib/codex-json-rpc-client";
import { shouldResumeSelectedThreadAfterDisplayRead, useThreadActions } from "../src/hooks/use-thread-actions";
import type { ThreadWorkflowDispatch } from "../src/state/thread-workflow";
import { setupDomTestEnv, type DomTestEnv } from "./dom-test-env";

export default async function runThreadActionsTests(): Promise<void> {
  resumesNotLoadedThreadWhenDisplayReadStillHasNoTurns();
  doesNotResumeLoadedThreadWithNoTurns();
  doesNotResumeNotLoadedThreadWithHydratedTurns();
  await selectThreadResumesNotLoadedEmptyDisplayThread();
}

function resumesNotLoadedThreadWhenDisplayReadStillHasNoTurns(): void {
  assertEqual(
    shouldResumeSelectedThreadAfterDisplayRead(threadFixture({ status: { type: "notLoaded" }, turns: [] })),
    true,
    "notLoaded empty display thread should resume",
  );
}

function doesNotResumeLoadedThreadWithNoTurns(): void {
  assertEqual(
    shouldResumeSelectedThreadAfterDisplayRead(threadFixture({ status: { type: "idle" }, turns: [] })),
    false,
    "idle empty display thread should not resume",
  );
}

function doesNotResumeNotLoadedThreadWithHydratedTurns(): void {
  assertEqual(
    shouldResumeSelectedThreadAfterDisplayRead(threadFixture({
      status: { type: "notLoaded" },
      turns: [{
        id: "turn-1",
        items: [],
        itemsView: "full",
        status: "completed",
        error: null,
        startedAt: 0,
        completedAt: 1,
        durationMs: 1000,
      }],
    })),
    false,
    "notLoaded thread with display turns should not resume",
  );
}

async function selectThreadResumesNotLoadedEmptyDisplayThread(): Promise<void> {
  const metadataThread = threadFixture({ status: { type: "notLoaded" }, turns: [] });
  const resumedThread = threadFixture({
    status: { type: "idle" },
    turns: [{
      id: "turn-resumed",
      items: [],
      itemsView: "full",
      status: "completed",
      error: null,
      startedAt: 0,
      completedAt: 1,
      durationMs: 1000,
    }],
  });
  const recorder = createClientSequenceRecorder([
    { thread: metadataThread },
    { thread: metadataThread },
    { thread: metadataThread },
    { thread: resumedThread },
  ]);
  const actions: unknown[] = [];
  const mounted = mountUseThreadActions(recorder.client, (action) => {
    actions.push(action);
  });
  try {
    await act(async () => {
      await mounted.selectThread(metadataThread);
    });
  } finally {
    mounted.cleanup();
  }

  assertRequest(
    recorder.requests,
    0,
    "thread/read",
    { threadId: "thread-actions", includeTurns: false },
    "selectThread display read should first request metadata",
  );
  assertRequest(
    recorder.requests,
    1,
    "thread/read",
    { threadId: "thread-actions", includeTurns: true },
    "selectThread display read should request turns",
  );
  assertRequest(
    recorder.requests,
    2,
    "thread/read",
    { threadId: "thread-actions", includeTurns: false },
    "selectThread resume fallback should keep the existing metadata read preflight",
  );
  assertRequest(
    recorder.requests,
    3,
    "thread/resume",
    {
      threadId: "thread-actions",
      cwd: "/workspace",
      model: "gpt-5.2",
    },
    "selectThread should resume an empty notLoaded display thread",
  );
  assertEqual(recorder.requests[3]?.timeout, 120_000, "resume fallback should keep the resume timeout");
  assertDeepEqual(
    actions,
    [
      { type: "setActiveThread", threadId: "thread-actions" },
      { type: "upsertThread", thread: resumedThread, select: true },
    ],
    "selectThread should not upsert the empty notLoaded display thread before resume",
  );
}

interface RecordedRequest {
  method: string;
  params: unknown;
  timeout?: number | null;
}

function createClientSequenceRecorder(results: unknown[]) {
  const requests: RecordedRequest[] = [];
  let resultIndex = 0;
  return {
    requests,
    client: {
      request(method: string, params: unknown, timeout?: number | null) {
        requests.push({ method, params, timeout });
        const result = results[resultIndex++] ?? {};
        if (result instanceof Error) throw result;
        return result;
      },
    } as CodexJsonRpcClient,
  };
}

interface MountedThreadActions {
  cleanup: () => void;
  env: DomTestEnv;
  root: Root;
  selectThread: (thread: Thread) => Promise<void>;
}

function mountUseThreadActions(
  client: CodexJsonRpcClient,
  dispatch: ThreadWorkflowDispatch,
): MountedThreadActions {
  const env = setupDomTestEnv();
  const container = env.document.createElement("div");
  env.document.body.appendChild(container);
  const root = createRoot(container);
  let selectThread: ((thread: Thread) => Promise<void>) | null = null;

  function ThreadActionsHost() {
    ({ selectThread } = useThreadActions({
      activeThread: null,
      ensureConnected: async () => true,
      hasLoadedThreadContent: () => false,
      setComposerAttachments: () => undefined,
      setInput: () => undefined,
      threadContextDefaults: { model: "gpt-5.2" },
      workspace: "/workspace",
    }));
    return null;
  }

  act(() => {
    root.render(createElement(ServicesProvider, {
      client,
      connected: true,
      dispatch,
      children: createElement(ThreadActionsHost),
    }));
  });
  if (!selectThread) {
    root.unmount();
    env.teardown();
    throw new Error("useThreadActions did not mount");
  }

  return {
    cleanup: () => {
      act(() => root.unmount());
      env.teardown();
    },
    env,
    root,
    selectThread,
  };
}

function threadFixture(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-actions",
    sessionId: "thread-actions",
    forkedFromId: null,
    parentThreadId: null,
    preview: "",
    ephemeral: false,
    modelProvider: "openai",
    createdAt: 0,
    updatedAt: 0,
    recencyAt: null,
    status: { type: "idle" },
    path: null,
    cwd: "",
    cliVersion: "test",
    source: "appServer",
    threadSource: null,
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name: null,
    turns: [],
    ...overrides,
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

function assertRequest(
  requests: RecordedRequest[],
  index: number,
  method: string,
  params: unknown,
  message: string,
): void {
  const request = requests[index];
  if (!request) {
    throw new Error(`${message}: expected request at index ${index}`);
  }
  assertEqual(request.method, method, `${message} method`);
  assertDeepEqual(request.params, params, `${message} params`);
}
