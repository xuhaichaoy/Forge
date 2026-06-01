import type {
  YuxiConflictItem,
  YuxiKnowledgeDatabase,
  YuxiPendingItem,
  YuxiPendingQueue,
} from "../lib/yuxi-client";

export type TodoStatus = "duplicate" | "pick" | "classify" | "error" | "conflict";
export type TodoSource = "upload" | "ai-id" | "ai-cat" | "doc-err" | "field-conflict";
export type TodoKind = "dup" | "entity" | "classify" | "force" | "conflict";
export type TodoAction =
  | "confirm_classify"
  | "reject_classify"
  | "confirm_existing"
  | "create_new"
  | "skip_entity"
  | "reject_entity"
  | "dup_replace"
  | "dup_copy"
  | "dup_archive"
  | "dup_reject"
  | "confirm_force"
  | "reject_force"
  | "conflict_apply"
  | "conflict_reject"
  | "conflict_skip";

export interface TodoItem {
  id: string;
  numericId: number | null;
  kind: TodoKind;
  title: string;
  source: TodoSource;
  reason: string;
  status: TodoStatus;
  raw: YuxiPendingItem;
  conflict?: YuxiConflictItem;
}

export const SOURCE_LABEL: Record<TodoSource, string> = {
  upload: "资料上传",
  "ai-id": "档案识别",
  "ai-cat": "归属判断",
  "doc-err": "文档异常",
  "field-conflict": "字段冲突",
};

export const STATUS_LABEL: Record<TodoStatus, string> = {
  duplicate: "重复资料",
  pick: "档案待关联",
  classify: "归属待定",
  error: "读不出内容",
  conflict: "字段冲突",
};

export const STATUS_CSS: Record<TodoStatus, string> = {
  duplicate: "hc-kb-status--pending",
  pick: "hc-kb-status--pending",
  classify: "hc-kb-status--pending",
  error: "hc-kb-status--fail",
  conflict: "hc-kb-status--pending",
};

export function projectTodos(
  queues: Record<YuxiPendingQueue, YuxiPendingItem[]>,
  conflicts: YuxiConflictItem[] = [],
): TodoItem[] {
  return [
    ...queues.dup.map((item) => ({
      id: `dup:${item.id}`,
      numericId: typeof item.id === "number" ? item.id : null,
      kind: "dup" as const,
      title: `「${item.filename || "上传资料"}」和库里已有版本相似`,
      source: "upload" as const,
      reason: typeof item.similarity === "number"
        ? `相似度 ${Math.round(item.similarity * 100)}%，需要选择替换、保留副本或保留旧版。`
        : "命中重复或相似版本，需要人工选择处理方式。",
      status: "duplicate" as const,
      raw: item,
    })),
    ...queues.entity.map((item) => ({
      id: `entity:${item.id}`,
      numericId: typeof item.id === "number" ? item.id : null,
      kind: "entity" as const,
      title: `「${item.extracted_text || "识别出的档案"}」需要确认`,
      source: "ai-id" as const,
      reason: entityReason(item),
      status: "pick" as const,
      raw: item,
    })),
    ...queues.force.map((item) => ({
      id: `force:${item.id}`,
      numericId: typeof item.id === "number" ? item.id : null,
      kind: "force" as const,
      title: `「${item.filename || "资料"}」需要手动处理`,
      source: "doc-err" as const,
      reason: item.failure_reason || "系统无法自动分类或解析，需要人工指派知识库。",
      status: "error" as const,
      raw: item,
    })),
    ...conflicts.map((item) => ({
      id: `conflict:${item.id}`,
      numericId: typeof item.id === "number" ? item.id : null,
      kind: "conflict" as const,
      title: conflictTitle(item),
      source: "field-conflict" as const,
      reason: conflictReason(item),
      status: "conflict" as const,
      raw: {
        id: item.id,
        source_db_id: item.source_db_id,
        source_file_id: item.source_file_id,
        status: item.status,
        created_at: item.created_at,
      },
      conflict: item,
    })),
  ];
}

export function defaultDbIdForTodo(item: TodoItem, databases: YuxiKnowledgeDatabase[]): string {
  const raw = item.raw;
  if (raw.suggested_db_id) return raw.suggested_db_id;
  if (raw.target_db_id) return raw.target_db_id;
  if (raw.manual_db_id) return raw.manual_db_id;
  const candidateDbId = raw.candidates?.find((candidate) => candidate.db_id)?.db_id;
  if (candidateDbId) return candidateDbId;
  const candidateCategory = raw.candidates?.find((candidate) => candidate.category)?.category;
  const sameCategory = candidateCategory ? databases.find((db) => db.category === candidateCategory && db.db_id)?.db_id : null;
  return sameCategory || databases.find((db) => db.db_id)?.db_id || "";
}

export function defaultEntityIdForTodo(item: TodoItem): number | null {
  if (typeof item.raw.suggested_entity_id === "number") return item.raw.suggested_entity_id;
  const candidate = item.raw.candidates?.find((entry) => typeof entry.entity_id === "number");
  return candidate?.entity_id ?? null;
}

export function todoBelongsToCurrentLibrary(item: YuxiPendingItem, category: string | null, dbIds: ReadonlySet<string>): boolean {
  if (!category && dbIds.size === 0) return true;
  const itemDbIds = [
    item.suggested_db_id,
    item.confirmed_db_id,
    item.source_db_id,
    item.target_db_id,
    item.manual_db_id,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
  if (itemDbIds.some((dbId) => dbIds.has(dbId))) return true;
  if (item.candidates?.some((candidate) => candidate.db_id && dbIds.has(candidate.db_id))) return true;
  if (!category) return false;
  if (item.candidates?.some((candidate) => candidate.category === category)) return true;
  return false;
}

function entityReason(item: YuxiPendingItem): string {
  const top = item.candidates?.[0];
  const type = item.candidate_entity_type ? "识别到一个业务档案" : "识别到业务档案关系";
  if (!top) return `${type}，需要创建新档案或跳过。`;
  const name = top.canonical_name || "已有档案";
  const score = typeof top.score === "number" ? `，匹配度 ${Math.round(top.score * 100)}%` : "";
  return `${type}，建议关联「${name}」${score}。`;
}

function conflictTitle(item: YuxiConflictItem): string {
  const fields = (item.diffs ?? []).map((diff) => diff.field).filter(Boolean);
  const suffix = fields.length > 0 ? `：${fields.slice(0, 3).join(" / ")}` : "";
  return `档案信息冲突${suffix}`;
}

function conflictReason(item: YuxiConflictItem): string {
  const diffs = item.diffs ?? [];
  if (diffs.length === 0) return "新资料字段与权威档案不一致，需要选择是否采纳。";
  return diffs.slice(0, 3).map((diff) => {
    const field = diff.field || "字段";
    return `${field}: ${formatReasonValue(diff.old)} -> ${formatReasonValue(diff.new)}`;
  }).join("；");
}

function formatReasonValue(value: unknown): string {
  if (value == null || value === "") return "空";
  if (typeof value === "string") return value.length > 24 ? `${value.slice(0, 24)}...` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(formatReasonValue).filter(Boolean).join("/");
  try {
    const text = JSON.stringify(value);
    return text.length > 24 ? `${text.slice(0, 24)}...` : text;
  } catch {
    return String(value);
  }
}
