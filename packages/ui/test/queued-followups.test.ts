import {
  createQueuedFollowUp,
  isQueuedFollowUpDuplicate,
  queuedFollowUpSummary,
  reorderQueuedFollowUps,
  removeQueuedFollowUp,
  updateQueuedFollowUpStatus,
} from "../src/state/queued-followups";

export default function runQueuedFollowUpsTests(): void {
  createsStableQueuedFollowUpRecords();
  removesAndUpdatesQueuedFollowUps();
  reordersQueuedFollowUps();
  summarizesTextAndAttachmentOnlyMessages();
  detectsDuplicateFollowUpsByCanonicalKey();
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
