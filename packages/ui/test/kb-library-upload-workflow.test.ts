import type { YuxiIntakeResponse, YuxiKnowledgeDatabase } from "../src/lib/yuxi-client";
import {
  embeddingModelNameFromDatabase,
  firstAvailableEmbeddingModel,
  isDoneTask,
  isFailedTask,
  isQueuedIntake,
  makeBatchId,
  pendingIdsFromIntake,
  pendingSuffix,
  planYuxiKnowledgeTaskRetry,
  taskMessage,
  uploadDoneMessage,
  uploadRunPatchFromIntake,
} from "../src/components/kb-library-upload-workflow";

export default function runKbLibraryUploadWorkflowTests(): void {
  createsReadableBatchIds();
  projectsIntakeActionsToUploadRunPatches();
  readsPendingIdsAndQueuedState();
  mapsTaskTerminalStatesAndMessages();
  plansTaskRetriesFromPayloads();
  resolvesEmbeddingModelNamesFromDatabaseAndStatus();
}

function createsReadableBatchIds(): void {
  assert(/^FILE-\d{10}-[A-Z0-9]{4}$/.test(makeBatchId("FILE")), "batch id should include prefix, timestamp, and random suffix");
}

function projectsIntakeActionsToUploadRunPatches(): void {
  assertDeepEqual(
    uploadRunPatchFromIntake(intake({ action: "auto_ingested" })),
    { status: "done", progress: 100, pendingIds: [], message: "已解析并入库" },
    "auto ingested intake should mark upload run done",
  );
  assertDeepEqual(
    uploadRunPatchFromIntake(intake({ action: "queued_classify", pending_id: 7 })),
    { status: "queued", progress: null, pendingIds: [7], message: "归属需处理 #7" },
    "classification queue should surface pending id",
  );
  assertDeepEqual(
    uploadRunPatchFromIntake(intake({ action: "queued_dup", pending_ids: [1, 2] })),
    { status: "queued", progress: null, pendingIds: [1, 2], message: "重复版本需处理 #1, #2" },
    "duplicate queue should surface all pending ids",
  );
  assertDeepEqual(
    uploadRunPatchFromIntake(intake({ action: "queued_force", failure_reason: "人工复核" })),
    { status: "queued", progress: null, pendingIds: [], message: "待人工处理：人工复核" },
    "force queue should show failure reason",
  );
  assertDeepEqual(
    uploadRunPatchFromIntake(intake({ action: "custom_action" })),
    { status: "processing", progress: null, pendingIds: [], message: "custom_action" },
    "unknown intake action should stay processing with raw action label",
  );
}

function readsPendingIdsAndQueuedState(): void {
  assertDeepEqual(pendingIdsFromIntake(intake({ pending_ids: [1, "bad", 2] })), [1, 2], "pending ids should keep only numbers");
  assertEqual(pendingSuffix(intake({ pending_ids: [3, 4] })), " #3, #4", "pending suffix should format all ids");
  assert(isQueuedIntake(intake({ action: "queued_classify" })), "queued actions should be detected");
  assert(!isQueuedIntake(intake({ action: "auto_ingested" })), "non-queued actions should not be detected");
}

function mapsTaskTerminalStatesAndMessages(): void {
  assert(isDoneTask({ status: "success" }), "success task should be done");
  assert(isFailedTask({ status: "failed" }), "failed task should be failed");
  assert(isFailedTask({ status: "cancelled" }), "cancelled task should be failed");
  assertEqual(taskMessage({ status: "running", message: "解析中" }), "解析中", "task message should prefer message");
  assertEqual(taskMessage({ status: "running", error: "失败原因" }), "失败原因", "task message should prefer error");
  assertEqual(uploadDoneMessage(), "已解析、提取档案并入库；需要人工判断的内容会进入入库问题", "done message should stay stable");
}

function plansTaskRetriesFromPayloads(): void {
  assertDeepEqual(
    planYuxiKnowledgeTaskRetry({
      type: "knowledge_ingest",
      payload: { db_id: "db-a", items: ["/tmp/a.pdf", "", 7], params: { auto_index: true } },
    }),
    { kind: "ingest", dbId: "db-a", items: ["/tmp/a.pdf"], params: { auto_index: true } },
    "ingest retry should keep non-empty item paths and params",
  );
  assertDeepEqual(
    planYuxiKnowledgeTaskRetry({
      type: "knowledge_parse",
      payload: { dbId: "db-a", file_ids: ["file-a"] },
    }),
    { kind: "parse", dbId: "db-a", fileIds: ["file-a"] },
    "parse retry should use direct file ids",
  );
  assertDeepEqual(
    planYuxiKnowledgeTaskRetry({
      type: "knowledge_index",
      payload: { db_id: "db-a", file_ids: ["file-a", "file-b"], params: { chunk_size: 800 } },
    }),
    { kind: "index", dbId: "db-a", fileIds: ["file-a", "file-b"], params: { chunk_size: 800 } },
    "index retry should keep file ids and params",
  );
  assertThrows(
    () => planYuxiKnowledgeTaskRetry({ type: "knowledge_parse", payload: { file_ids: ["file-a"] } }),
    "任务记录缺少知识库信息",
    "missing database id should block retry planning",
  );
  assertThrows(
    () => planYuxiKnowledgeTaskRetry({ type: "unknown", payload: { db_id: "db-a" } }),
    "只支持资料解析或入库任务重试",
    "unsupported task type should block retry planning",
  );
}

function resolvesEmbeddingModelNamesFromDatabaseAndStatus(): void {
  assertEqual(
    embeddingModelNameFromDatabase(database({ embed_info: { model_id: "embed-a" } })),
    "embed-a",
    "database embed_info model_id should win",
  );
  assertEqual(
    embeddingModelNameFromDatabase(database({ additional_params: { embed_model_name: "embed-b" } })),
    "embed-b",
    "database additional params should provide fallback model",
  );
  assertEqual(
    firstAvailableEmbeddingModel({
      unavailable: { status: "failed", model_id: "bad" },
      ready_id: { status: "available", model_id: "embed-ready" },
    }),
    "embed-ready",
    "first available model should ignore unhealthy entries",
  );
  assertEqual(
    firstAvailableEmbeddingModel({ fallback_id: {} }),
    "fallback_id",
    "model map key should be the fallback id when model_id is absent",
  );
}

function intake(patch: Record<string, unknown>): YuxiIntakeResponse {
  return patch as YuxiIntakeResponse;
}

function database(patch: Partial<YuxiKnowledgeDatabase>): YuxiKnowledgeDatabase {
  return {
    db_id: "db-a",
    name: "知识库",
    ...patch,
  } as YuxiKnowledgeDatabase;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}\n  expected: ${String(expected)}\n  actual:   ${String(actual)}`);
  }
}

function assertThrows(action: () => unknown, expectedMessagePart: string, message: string): void {
  try {
    action();
  } catch (err) {
    const actual = err instanceof Error ? err.message : String(err);
    if (actual.includes(expectedMessagePart)) return;
    throw new Error(`Assertion failed: ${message}\n  expected error containing: ${expectedMessagePart}\n  actual: ${actual}`);
  }
  throw new Error(`Assertion failed: ${message}\n  expected action to throw`);
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Assertion failed: ${message}\n  expected: ${expectedJson}\n  actual:   ${actualJson}`);
  }
}
