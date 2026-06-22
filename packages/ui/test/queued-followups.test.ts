import {
  INTERRUPTED_STEER_PAUSED_REASON,
  QUEUED_FOLLOW_UPS_GLOBAL_STATE_KEY,
  createQueuedFollowUp,
  isQueuedFollowUpDuplicate,
  normalizeQueuedFollowUpsByThread,
  pauseQueuedFollowUpsWithReason,
  queuedFollowUpSummary,
  reorderQueuedFollowUps,
  removeQueuedFollowUp,
  resumeQueuedFollowUpsWithReason,
  updateQueuedFollowUpStatus,
  updateQueuedFollowUpsByThread,
} from "../src/state/queued-followups";

export default function runQueuedFollowUpsTests(): void {
  createsStableQueuedFollowUpRecords();
  removesAndUpdatesQueuedFollowUps();
  reordersQueuedFollowUps();
  summarizesTextAndAttachmentOnlyMessages();
  detectsDuplicateFollowUpsByCanonicalKey();
  pausesAndResumesOnlyInterruptedQueuedFollowUps();
  normalizesQueuedFollowUpsFromGlobalState();
  removesEmptyThreadQueuesFromGlobalStateMap();
}

function detectsDuplicateFollowUpsByCanonicalKey(): void {
  const queue = [
    createQueuedFollowUp({ id: "q1", now: 10, text: "Run again", attachments: [], cwd: "/w" }),
  ];
  const dupe = { text: "Run again", attachments: [] };
  const fresh = { text: "Inspect more", attachments: [] };
  if (!isQueuedFollowUpDuplicate(queue, dupe)) {
    throw new Error("dedup helper should flag identical prompt as duplicate");
  }
  if (isQueuedFollowUpDuplicate(queue, fresh)) {
    throw new Error("dedup helper must not flag a different prompt as duplicate");
  }
}

function createsStableQueuedFollowUpRecords(): void {
  const message = createQueuedFollowUp({
    id: "queued-1",
    now: 42,
    text: "Follow up",
    attachments: [],
    cwd: "/workspace",
  });

  assertDeepEqual(
    message,
    {
      id: "queued-1",
      text: "Follow up",
      attachments: [],
      cwd: "/workspace",
      createdAt: 42,
      status: "queued",
    },
    "queued follow-up should keep message facts and initial status",
  );

  assertDeepEqual(
    createQueuedFollowUp({
      id: "queued-context",
      now: 43,
      text: "Follow up with model",
      attachments: [],
      cwd: "/workspace",
      context: { model: "gpt-5.2", modelProvider: "team_model_gateway" },
    }),
    {
      id: "queued-context",
      text: "Follow up with model",
      context: { model: "gpt-5.2", modelProvider: "team_model_gateway" },
      attachments: [],
      cwd: "/workspace",
      createdAt: 43,
      status: "queued",
    },
    "queued follow-up should persist the context captured when it was queued",
  );
}

function normalizesQueuedFollowUpsFromGlobalState(): void {
  assertEqual(
    QUEUED_FOLLOW_UPS_GLOBAL_STATE_KEY,
    "queued-follow-ups",
    "global-state key should match Codex Desktop host key",
  );
  const normalized = normalizeQueuedFollowUpsByThread({
    "thread-1": [
      {
        id: "q1",
        context: {
          prompt: "Follow up",
          commentAttachments: [],
          responsesapiClientMetadata: { source: "desktop" },
        },
        attachments: [
          { type: "plainText", text: "context" },
          { type: "filePath", path: "src/main.ts" },
          { type: "bad", text: "drop" },
        ],
        cwd: "/workspace",
        mode: "plan",
        createdAt: 123,
        status: "paused",
        error: "offline",
        pausedReason: "Interrupted before the steer was accepted.",
        responsesapiClientMetadata: { source: "desktop" },
      },
      { id: "bad", text: "missing date", attachments: [], cwd: "/workspace" },
    ],
    "thread-2": [],
    broken: "not a queue",
  });
  assertDeepEqual(
    normalized,
    {
      "thread-1": [
        {
          id: "q1",
          text: "Follow up",
          context: {
            prompt: "Follow up",
            commentAttachments: [],
            responsesapiClientMetadata: { source: "desktop" },
          },
          attachments: [
            { type: "plainText", text: "context" },
            { type: "filePath", path: "src/main.ts" },
          ],
          cwd: "/workspace",
          mode: "plan",
          createdAt: 123,
          status: "paused",
          error: "offline",
          pausedReason: "Interrupted before the steer was accepted.",
          responsesapiClientMetadata: { source: "desktop" },
        },
      ],
    },
    "global-state normalization should preserve valid queued messages and drop invalid entries",
  );
}

function removesEmptyThreadQueuesFromGlobalStateMap(): void {
  const current = {
    "thread-1": [createQueuedFollowUp({ id: "q1", now: 1, text: "A", attachments: [], cwd: "" })],
    "thread-2": [createQueuedFollowUp({ id: "q2", now: 2, text: "B", attachments: [], cwd: "" })],
  };
  assertDeepEqual(
    updateQueuedFollowUpsByThread(current, "thread-1", () => []),
    {
      "thread-2": [createQueuedFollowUp({ id: "q2", now: 2, text: "B", attachments: [], cwd: "" })],
    },
    "empty queues should delete the conversation key from the global map",
  );
}

function pausesAndResumesOnlyInterruptedQueuedFollowUps(): void {
  const queue = [
    createQueuedFollowUp({ id: "a", now: 1, text: "A", attachments: [], cwd: "" }),
    updateQueuedFollowUpStatus(
      [createQueuedFollowUp({ id: "b", now: 2, text: "B", attachments: [], cwd: "" })],
      "b",
      "paused",
      "Runtime is offline",
    )[0]!,
  ];

  const paused = pauseQueuedFollowUpsWithReason(queue, INTERRUPTED_STEER_PAUSED_REASON);
  assertDeepEqual(
    paused.map((message) => ({
      id: message.id,
      status: message.status,
      error: message.error,
      pausedReason: message.pausedReason,
    })),
    [
      {
        id: "a",
        status: "queued",
        pausedReason: INTERRUPTED_STEER_PAUSED_REASON,
      },
      {
        id: "b",
        status: "paused",
        error: "Runtime is offline",
      },
    ],
    "interrupted pause should tag only queued messages and preserve real paused errors",
  );

  assertDeepEqual(
    resumeQueuedFollowUpsWithReason(paused, INTERRUPTED_STEER_PAUSED_REASON).map((message) => ({
      id: message.id,
      status: message.status,
      error: message.error,
      pausedReason: message.pausedReason,
    })),
    [
      {
        id: "a",
        status: "queued",
      },
      {
        id: "b",
        status: "paused",
        error: "Runtime is offline",
      },
    ],
    "resume should clear only the interrupted paused reason",
  );
}

function removesAndUpdatesQueuedFollowUps(): void {
  const queue = [
    createQueuedFollowUp({ id: "a", now: 1, text: "A", attachments: [], cwd: "" }),
    createQueuedFollowUp({ id: "b", now: 2, text: "B", attachments: [], cwd: "" }),
  ];

  assertDeepEqual(
    removeQueuedFollowUp(queue, "a").map((message) => message.id),
    ["b"],
    "remove should drop only the target queued message",
  );
  assertDeepEqual(
    updateQueuedFollowUpStatus(queue, "b", "paused", "failed")[1],
    {
      id: "b",
      text: "B",
      attachments: [],
      cwd: "",
      createdAt: 2,
      status: "paused",
      error: "failed",
    },
    "status update should preserve message body and attach error",
  );

  assertDeepEqual(
    createQueuedFollowUp({ id: "plan", now: 3, text: "Plan first", attachments: [], cwd: "", mode: "plan" }),
    {
      id: "plan",
      text: "Plan first",
      attachments: [],
      cwd: "",
      mode: "plan",
      createdAt: 3,
      status: "queued",
    },
    "queued follow-up should preserve composer mode when provided",
  );
}

function reordersQueuedFollowUps(): void {
  const queue = [
    createQueuedFollowUp({ id: "a", now: 1, text: "A", attachments: [], cwd: "" }),
    createQueuedFollowUp({ id: "b", now: 2, text: "B", attachments: [], cwd: "" }),
    createQueuedFollowUp({ id: "c", now: 3, text: "C", attachments: [], cwd: "" }),
  ];

  assertDeepEqual(
    reorderQueuedFollowUps(queue, "c", "a").map((message) => message.id),
    ["c", "a", "b"],
    "reorder should move the dragged queued message before the target",
  );
}

function summarizesTextAndAttachmentOnlyMessages(): void {
  assertEqual(
    queuedFollowUpSummary({ text: "  Please   continue   implementing  ", attachments: [] }),
    "Please continue implementing",
    "summary should normalize whitespace",
  );
  assertEqual(
    queuedFollowUpSummary({ text: "", attachments: [{ type: "filePath", path: "README.md" }] }),
    "1 attachment",
    "summary should fall back to attachment count",
  );
  assertEqual(
    queuedFollowUpSummary({ text: "", attachments: [{ type: "plainText", text: "  pasted\ncontext  " }] }),
    "pasted context",
    "summary should use pasted text attachment previews",
  );
  assertEqual(
    queuedFollowUpSummary({
      text: "",
      attachments: [
        { type: "plainText", text: "" },
        { type: "plainText", text: "second" },
        { type: "plainText", text: "third" },
      ],
    }),
    "Pasted text (+2 more pasted text attachments)",
    "summary should include remaining pasted text attachment count",
  );
  assertEqual(
    queuedFollowUpSummary({
      text: "",
      attachments: [],
      context: {
        pastedTextAttachments: [
          { preview: "  context pasted\ntext  " },
          { preview: "second" },
        ],
      },
    }),
    "context pasted text (+1 more pasted text attachment)",
    "summary should use Desktop queued context pasted-text previews before local attachment fallback",
  );
  assertEqual(
    queuedFollowUpSummary({
      text: "",
      attachments: [],
      context: {
        generatedPastedTextAttachmentPaths: ["a.txt", "b.txt", "c.txt"],
      },
    }),
    "Pasted text (+2 more pasted text attachments)",
    "summary should mirror Desktop generated pasted-text fallback when only generated paths are present",
  );
  assertEqual(
    queuedFollowUpSummary({
      text: "",
      attachments: [],
      context: {
        commentAttachments: [
          { browserTabId: "tab-1" },
          { localBrowserDesignChange: { description: "make it blue" } },
          { path: "src/main.ts", line: 12 },
        ],
      },
    }),
    "2 annotations, 1 comment",
    "summary should mirror Desktop comment attachment mixed labels",
  );
  assertEqual(
    queuedFollowUpSummary({
      text: "",
      attachments: [],
      context: {
        selectedTextAttachments: [{ text: "one" }, { text: "two" }],
      },
    }),
    "2 selections",
    "summary should mirror Desktop selected text attachment count",
  );
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
