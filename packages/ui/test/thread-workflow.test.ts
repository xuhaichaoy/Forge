import type { Thread, UserInput } from "@hicodex/codex-protocol";
import {
  isThreadNotFound,
  isThreadNotMaterialized,
  startThread,
  startTurn,
  steerTurn,
  threadStatusLabel,
  threadTitle,
} from "../src/state/thread-workflow";

interface RecordedRequest {
  method: string;
  params: unknown;
  timeout?: number;
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

function createClientRecorder(result: unknown = {}) {
  const requests: RecordedRequest[] = [];
  return {
    requests,
    client: {
      request(method: string, params: unknown, timeout?: number) {
        requests.push({ method, params, timeout });
        return result;
      },
    } as Parameters<typeof startThread>[0],
  };
}

export default function runThreadWorkflowTests(): void {
  buildsThreadTitlesFromNamePreviewAndId();
  formatsThreadStatusLabelsSafely();
  detectsRecoverableThreadErrors();
  buildsStartThreadRequestsWithoutHardcodedWorkspace();
  buildsTurnStartAndSteerRequests();
}

function buildsThreadTitlesFromNamePreviewAndId(): void {
  assertEqual(
    threadTitle({ id: "thread-with-name", name: "  Named thread  ", preview: "Preview" } satisfies Thread),
    "Named thread",
    "threadTitle should prefer trimmed name",
  );
  assertEqual(
    threadTitle({ id: "thread-with-preview", preview: "  Preview title  " } satisfies Thread),
    "Preview title",
    "threadTitle should fall back to trimmed preview",
  );
  assertEqual(
    threadTitle({ id: "short-thread" } satisfies Thread),
    "short-thread",
    "threadTitle should keep short ids intact",
  );
  assertEqual(
    threadTitle({ id: "1234567890abcdef" } satisfies Thread),
    "12345678...cdef",
    "threadTitle should shorten long ids",
  );
}

function formatsThreadStatusLabelsSafely(): void {
  assertEqual(threadStatusLabel(undefined), "notLoaded", "undefined status label");
  assertEqual(threadStatusLabel(null), "notLoaded", "null status label");
  assertEqual(threadStatusLabel("running"), "running", "string status label");
  assertEqual(threadStatusLabel(2), "2", "number status label");
  assertEqual(threadStatusLabel(false), "false", "boolean status label");
  assertEqual(
    threadStatusLabel({ type: "queued", status: "running" }),
    "queued",
    "object status should prefer type",
  );
  assertEqual(
    threadStatusLabel({ status: "archived" }),
    "archived",
    "object status should fall back to status",
  );
  assertEqual(
    threadStatusLabel({ nested: { active: true } }),
    "{\"nested\":{\"active\":true}}",
    "unknown object status should format safely",
  );
}

function detectsRecoverableThreadErrors(): void {
  assertEqual(
    isThreadNotFound(new Error("Thread not found: thread-1")),
    true,
    "thread not found errors should be detected",
  );
  assertEqual(
    isThreadNotFound(new Error("permission denied")),
    false,
    "unrelated errors should not be thread not found",
  );
  assertEqual(
    isThreadNotMaterialized(new Error("Thread is not materialized yet")),
    true,
    "not materialized errors should be detected",
  );
  assertEqual(
    isThreadNotMaterialized({ message: "includeTurns is unavailable before first turn" }),
    true,
    "includeTurns unavailable errors should be detected",
  );
  assertEqual(
    isThreadNotMaterialized("thread not found"),
    false,
    "thread not found is not a materialization error",
  );
}

function buildsStartThreadRequestsWithoutHardcodedWorkspace(): void {
  const first = createClientRecorder({ thread: { id: "thread-started" } });
  void startThread(first.client, "  /workspace/project  ");
  assertRequest(
    first.requests,
    0,
    "thread/start",
    { cwd: "/workspace/project" },
    "startThread should trim workspace cwd",
  );

  const second = createClientRecorder();
  void startThread(second.client, "   ");
  assertRequest(
    second.requests,
    0,
    "thread/start",
    { cwd: null },
    "startThread should use null cwd for empty workspace",
  );
}

function buildsTurnStartAndSteerRequests(): void {
  const input: UserInput[] = [{ type: "text", text: "hello", text_elements: [] }];
  const start = createClientRecorder();
  void startTurn(start.client, "thread-1", input, "  /workspace/project  ");
  assertRequest(
    start.requests,
    0,
    "turn/start",
    {
      threadId: "thread-1",
      input,
      cwd: "/workspace/project",
    },
    "startTurn should build a turn/start request",
  );

  const emptyWorkspace = createClientRecorder();
  void startTurn(emptyWorkspace.client, "thread-2", input, "");
  assertRequest(
    emptyWorkspace.requests,
    0,
    "turn/start",
    {
      threadId: "thread-2",
      input,
      cwd: null,
    },
    "startTurn should use null cwd for empty workspace",
  );

  const steer = createClientRecorder();
  void steerTurn(steer.client, "thread-1", input, "turn-active");
  assertRequest(
    steer.requests,
    0,
    "turn/steer",
    {
      threadId: "thread-1",
      input,
      expectedTurnId: "turn-active",
    },
    "steerTurn should build a turn/steer request",
  );
}
