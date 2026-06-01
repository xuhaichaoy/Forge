import { RefreshCw, RotateCcw, Trash2, XCircle } from "lucide-react";
import {
  type YuxiKnowledgeDatabase,
  type YuxiTask,
} from "../lib/yuxi-client";

const KNOWLEDGE_TASK_TYPES = new Set(["knowledge_ingest", "knowledge_parse", "knowledge_index"]);

export function KbLibraryTaskPanel({
  tasks,
  loading,
  error,
  selectedDatabase,
  onRefresh,
  onCancel,
  onDelete,
  onRetry,
}: {
  tasks: YuxiTask[];
  loading: boolean;
  error: string | null;
  selectedDatabase: YuxiKnowledgeDatabase | null;
  onRefresh: () => void;
  onCancel: (task: YuxiTask) => void;
  onDelete: (task: YuxiTask) => void;
  onRetry: (task: YuxiTask) => void;
}) {
  const selectedDbId = selectedDatabase?.db_id ?? null;
  const rows = tasks
    .filter((task) => KNOWLEDGE_TASK_TYPES.has(task.type ?? ""))
    .filter((task) => !selectedDbId || taskDatabaseId(task) === selectedDbId);
  return (
    <section className="hc-kb-management-panel" aria-label="处理记录">
      <div className="hc-kb-panel-head">
        <div>
          <div className="hc-kb-section-title">处理记录</div>
          {selectedDatabase?.name && <div className="hc-kb-section-subtitle">{selectedDatabase.name}</div>}
        </div>
        <button type="button" className="hc-kb-topbar-btn" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={13} strokeWidth={2.2} aria-hidden="true" />
          {loading ? "刷新中" : "刷新"}
        </button>
      </div>
      {error && <div className="hc-kb-inline-alert" data-tone="danger">{error}</div>}
      {rows.length === 0 ? (
        <div className="hc-kb-empty">
          <div className="hc-kb-empty-content">
            <div className="hc-kb-empty-title">{loading ? "正在读取处理记录" : "暂无处理记录"}</div>
            <div className="hc-kb-empty-subtitle">上传、解析和入库的处理记录会出现在这里。</div>
          </div>
        </div>
      ) : (
        <div className="hc-kb-task-list">
          {rows.map((task) => (
            <article key={task.id ?? task.name} className="hc-kb-task-row">
              <div className="hc-kb-task-main">
                <div className="hc-kb-task-title">
                  <span className={`hc-kb-status hc-kb-status--${taskTone(task.status)}`}>{taskStatusLabel(task.status)}</span>
                  <strong>{task.name || taskTypeLabel(task.type)}</strong>
                </div>
                <div className="hc-kb-task-meta">
                  <span>{taskTypeLabel(task.type)}</span>
                  <span>{formatDate(task.created_at)}</span>
                  {task.message && <span>{task.message}</span>}
                  {task.error && <span>{task.error}</span>}
                </div>
                <div className="hc-kb-task-progress" aria-label={`进度 ${Math.round(task.progress ?? 0)}%`}>
                  <span style={{ width: `${Math.max(0, Math.min(100, task.progress ?? 0))}%` }} />
                </div>
              </div>
              <div className="hc-kb-task-actions">
                {canCancel(task.status) && (
                  <button type="button" className="hc-kb-row-btn" title="取消任务" aria-label="取消任务" onClick={() => onCancel(task)}>
                    <XCircle size={14} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                )}
                {canDelete(task.status) && (
                  canRetry(task) && (
                    <button type="button" className="hc-kb-row-btn" title="重试任务" aria-label="重试任务" onClick={() => onRetry(task)}>
                      <RotateCcw size={14} strokeWidth={2.2} aria-hidden="true" />
                    </button>
                  )
                )}
                {canDelete(task.status) && (
                  <button type="button" className="hc-kb-row-btn" title="清理记录" aria-label="清理任务记录" onClick={() => onDelete(task)}>
                    <Trash2 size={14} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function taskStatusLabel(value: string | null | undefined): string {
  if (value === "success") return "完成";
  if (value === "failed") return "失败";
  if (value === "cancelled") return "已取消";
  if (value === "running") return "执行中";
  if (value === "pending") return "排队";
  return value || "未知";
}

function taskTone(value: string | null | undefined): "ok" | "fail" | "pending" | "archive" {
  if (value === "success") return "ok";
  if (value === "failed") return "fail";
  if (value === "pending" || value === "running") return "pending";
  return "archive";
}

function taskTypeLabel(value: string | null | undefined): string {
  if (value === "knowledge_ingest") return "上传解析入库";
  if (value === "knowledge_parse") return "重新解析";
  if (value === "knowledge_index") return "重新入库";
  return value || "资料处理";
}

function taskDatabaseId(task: YuxiTask): string | null {
  const payload = task.payload;
  if (!payload || typeof payload !== "object") return null;
  const direct = payload.db_id ?? payload.dbId;
  if (typeof direct === "string") return direct;
  const params = payload.params;
  if (params && typeof params === "object") {
    const nested = (params as Record<string, unknown>).db_id ?? (params as Record<string, unknown>).dbId;
    if (typeof nested === "string") return nested;
  }
  return null;
}

function canCancel(value: string | null | undefined): boolean {
  return value === "pending" || value === "running";
}

function canDelete(value: string | null | undefined): boolean {
  return value === "success" || value === "failed" || value === "cancelled";
}

function canRetry(task: YuxiTask): boolean {
  if (task.status !== "failed" && task.status !== "cancelled") return false;
  const payload = task.payload;
  if (!payload || typeof payload !== "object") return false;
  const dbId = taskDatabaseId(task);
  if (!dbId) return false;
  if (task.type === "knowledge_ingest") return stringArray(payload.items).length > 0;
  if (task.type === "knowledge_parse" || task.type === "knowledge_index") return stringArray(payload.file_ids).length > 0;
  return false;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "未记录时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
