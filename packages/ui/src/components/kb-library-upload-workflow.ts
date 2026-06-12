import {
  getYuxiEmbeddingModelsStatus,
  getYuxiTask,
  indexYuxiKnowledgeDocuments,
  parseYuxiKnowledgeDocuments,
  processYuxiKnowledgeDocuments,
  type YuxiIntakeResponse,
  type YuxiKnowledgeDatabase,
  type YuxiTask,
} from "../lib/yuxi-client";
import type { LibraryUploadRun } from "./kb-library-model";
import { objectRecord, stringArray, taskPayloadDbId } from "./kb-library-view-model";

export function makeBatchId(prefix: string): string {
  const stamp = new Date().toISOString().slice(2, 16).replace(/[-:T]/g, "");
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${stamp}-${random}`;
}

export async function waitForYuxiTask(taskId: string, onTask: (task: YuxiTask) => void): Promise<YuxiTask> {
  let lastTask: YuxiTask = { id: taskId, status: "pending", progress: 0, message: "等待执行" };
  for (let index = 0; index < 180; index += 1) {
    await delay(1500);
    const response = await getYuxiTask(taskId);
    const task = response.task ?? lastTask;
    lastTask = task;
    onTask(task);
    if (isDoneTask(task) || isFailedTask(task)) return task;
  }
  return { ...lastTask, status: "failed", progress: lastTask.progress ?? 100, message: "任务超时，请稍后同步查看结果" };
}

export function isDoneTask(task: YuxiTask): boolean {
  return task.status === "success";
}

export function isFailedTask(task: YuxiTask): boolean {
  return task.status === "failed" || task.status === "cancelled";
}

export function taskMessage(task: YuxiTask): string {
  if (task.error) return task.error;
  return task.message || task.status || "处理中";
}

export function uploadRunPatchFromIntake(
  response: YuxiIntakeResponse,
): Pick<LibraryUploadRun, "status" | "message" | "progress" | "pendingIds"> {
  const pending = pendingSuffix(response);
  const pendingIds = pendingIdsFromIntake(response);
  if (response.action === "auto_ingested") {
    return {
      status: "done",
      progress: 100,
      pendingIds: [],
      message: "已解析并入库",
    };
  }
  if (response.action === "queued_classify") {
    return { status: "queued", progress: null, pendingIds, message: `归属需处理${pending}` };
  }
  if (response.action === "queued_dup") {
    return { status: "queued", progress: null, pendingIds, message: `重复版本需处理${pending}` };
  }
  if (response.action === "queued_force") {
    const reason = response.failure_reason ? `：${response.failure_reason}` : pending;
    return { status: "queued", progress: null, pendingIds, message: `待人工处理${reason}` };
  }
  return {
    status: "processing",
    progress: null,
    pendingIds: [],
    message: response.action || "已提交处理流程",
  };
}

export function pendingIdsFromIntake(response: YuxiIntakeResponse): number[] {
  if (Array.isArray(response.pending_ids)) return response.pending_ids.filter((value): value is number => typeof value === "number");
  return typeof response.pending_id === "number" ? [response.pending_id] : [];
}

export function pendingSuffix(response: YuxiIntakeResponse): string {
  if (Array.isArray(response.pending_ids) && response.pending_ids.length > 0) {
    return ` #${response.pending_ids.join(", #")}`;
  }
  if (response.pending_id != null) return ` #${response.pending_id}`;
  return "";
}

export function isQueuedIntake(response: YuxiIntakeResponse): boolean {
  return typeof response.action === "string" && response.action.startsWith("queued_");
}

export function uploadDoneMessage(): string {
  return "已解析、提取档案并入库；需要人工判断的内容会进入入库问题";
}

export type YuxiTaskRetryPlan =
  | { kind: "ingest"; dbId: string; items: string[]; params: Record<string, unknown> }
  | { kind: "parse"; dbId: string; fileIds: string[] }
  | { kind: "index"; dbId: string; fileIds: string[]; params: Record<string, unknown> };

export function planYuxiKnowledgeTaskRetry(task: YuxiTask): YuxiTaskRetryPlan {
  const payload = task.payload ?? {};
  const dbId = taskPayloadDbId(payload);
  if (!dbId) {
    throw new Error("任务记录缺少知识库信息，不能重试。");
  }
  if (task.type === "knowledge_ingest") {
    const items = stringArray(payload.items);
    if (items.length === 0) throw new Error("任务记录缺少原始文件路径，不能重试。");
    return { kind: "ingest", dbId, items, params: objectRecord(payload.params) };
  }
  if (task.type === "knowledge_parse") {
    const fileIds = stringArray(payload.file_ids);
    if (fileIds.length === 0) throw new Error("任务记录缺少文件 ID，不能重试。");
    return { kind: "parse", dbId, fileIds };
  }
  if (task.type === "knowledge_index") {
    const fileIds = stringArray(payload.file_ids);
    if (fileIds.length === 0) throw new Error("任务记录缺少文件 ID，不能重试。");
    return { kind: "index", dbId, fileIds, params: objectRecord(payload.params) };
  }
  throw new Error("只支持资料解析或入库任务重试。");
}

export async function retryYuxiKnowledgeTask(task: YuxiTask): Promise<void> {
  const plan = planYuxiKnowledgeTaskRetry(task);
  if (plan.kind === "ingest") {
    const result = await processYuxiKnowledgeDocuments(plan.dbId, plan.items, plan.params);
    if (result.status === "failed") throw new Error(result.message || "重试提交失败");
    return;
  }
  if (plan.kind === "parse") {
    const result = await parseYuxiKnowledgeDocuments(plan.dbId, plan.fileIds);
    if (result.status === "failed") throw new Error(result.message || "重试提交失败");
    return;
  }
  const result = await indexYuxiKnowledgeDocuments(plan.dbId, plan.fileIds, plan.params);
  if (result.status === "failed") throw new Error(result.message || "重试提交失败");
}

export async function resolveYuxiEmbeddingModelName(databases: YuxiKnowledgeDatabase[]): Promise<string> {
  const existingModel = databases.map(embeddingModelNameFromDatabase).find((value): value is string => Boolean(value));
  if (existingModel) return existingModel;

  const response = await getYuxiEmbeddingModelsStatus();
  const models = response.status?.models ?? {};
  const availableModel = firstAvailableEmbeddingModel(models);
  if (availableModel) return availableModel;

  throw new Error("系统没有可用的检索模型，不能创建知识库。请先在系统连接中配置可用模型后再上传资料。");
}

export function embeddingModelNameFromDatabase(database: YuxiKnowledgeDatabase): string | null {
  const embedInfo = objectRecord(database.embed_info);
  const fromEmbedInfo = stringRecordValue(embedInfo, "model_id");
  if (fromEmbedInfo) return fromEmbedInfo;

  const params = objectRecord(database.additional_params);
  return stringRecordValue(params, "embed_model_name")
    ?? stringRecordValue(params, "embed_model")
    ?? stringRecordValue(params, "model_id");
}

export function firstAvailableEmbeddingModel(models: Record<string, unknown>): string | null {
  for (const [fallbackId, raw] of Object.entries(models)) {
    const record = objectRecord(raw);
    const status = stringRecordValue(record, "status")?.toLowerCase();
    if (status && !["available", "success", "ok", "ready", "healthy"].includes(status)) continue;
    const modelId = stringRecordValue(record, "model_id") ?? fallbackId;
    if (modelId) return modelId;
  }
  return null;
}

function stringRecordValue(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}
