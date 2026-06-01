import type { YuxiKnowledgeDatabase } from "../lib/yuxi-client";
import {
  defaultEntityIdForTodo,
  type TodoAction,
  type TodoItem,
} from "./kb-todo-model";

export function TodoActions({
  item,
  databases,
  selectedTarget,
  processing,
  onSelectTarget,
  onAction,
}: {
  item: TodoItem;
  databases: YuxiKnowledgeDatabase[];
  selectedTarget: string;
  processing: boolean;
  onSelectTarget: (dbId: string) => void;
  onAction: (action: TodoAction) => void;
}) {
  const disabled = processing || item.numericId == null;
  if (item.kind === "classify" || item.kind === "force") {
    const primaryLabel = item.kind === "classify" ? "确认分类" : "指派知识库";
    return (
      <div className="hc-kb-todo-actions">
        <select className="hc-kb-entity-filter" value={selectedTarget} onChange={(event) => onSelectTarget(event.target.value)} disabled={disabled || databases.length === 0} aria-label="目标知识库">
          {databases.length === 0 ? <option value="">无可选知识库</option> : databases.map((db) => (
            <option key={db.db_id ?? db.name ?? ""} value={db.db_id ?? ""}>{db.name || "未命名知识库"}</option>
          ))}
        </select>
        <button type="button" className="hc-kb-topbar-btn hc-kb-topbar-btn--primary" disabled={disabled || !selectedTarget} onClick={() => onAction(item.kind === "classify" ? "confirm_classify" : "confirm_force")}>
          {processing ? "处理中" : primaryLabel}
        </button>
        <button type="button" className="hc-kb-topbar-btn" disabled={disabled} onClick={() => onAction(item.kind === "classify" ? "reject_classify" : "reject_force")}>退回</button>
      </div>
    );
  }
  if (item.kind === "entity") {
    const candidate = item.raw.candidates?.[0];
    const entityName = candidate?.canonical_name || (candidate?.entity_id ? "已有档案" : "");
    return (
      <div className="hc-kb-todo-actions">
        <button type="button" className="hc-kb-topbar-btn hc-kb-topbar-btn--primary" disabled={disabled || !defaultEntityIdForTodo(item)} title={entityName || "没有可关联档案"} onClick={() => onAction("confirm_existing")}>
          {entityName ? `关联 ${trimActionText(entityName)}` : "关联候选"}
        </button>
        <button type="button" className="hc-kb-topbar-btn" disabled={disabled} onClick={() => onAction("create_new")}>新建草稿</button>
        <button type="button" className="hc-kb-topbar-btn" disabled={disabled} onClick={() => onAction("skip_entity")}>跳过</button>
        <button type="button" className="hc-kb-topbar-btn" disabled={disabled} onClick={() => onAction("reject_entity")}>退回</button>
      </div>
    );
  }
  if (item.kind === "conflict") {
    return (
      <div className="hc-kb-todo-actions">
        <button type="button" className="hc-kb-topbar-btn hc-kb-topbar-btn--primary" disabled={disabled} onClick={() => onAction("conflict_apply")}>
          {processing ? "处理中" : "采纳字段"}
        </button>
        <button type="button" className="hc-kb-topbar-btn" disabled={disabled} onClick={() => onAction("conflict_reject")}>拒绝</button>
        <button type="button" className="hc-kb-topbar-btn" disabled={disabled} onClick={() => onAction("conflict_skip")}>跳过</button>
      </div>
    );
  }
  return (
    <div className="hc-kb-todo-actions">
      <button type="button" className="hc-kb-topbar-btn hc-kb-topbar-btn--primary" disabled={disabled} onClick={() => onAction("dup_replace")}>替换</button>
      <button type="button" className="hc-kb-topbar-btn" disabled={disabled} onClick={() => onAction("dup_copy")}>保留副本</button>
      <button type="button" className="hc-kb-topbar-btn" disabled={disabled} onClick={() => onAction("dup_archive")}>保留旧版</button>
      <button type="button" className="hc-kb-topbar-btn" disabled={disabled} onClick={() => onAction("dup_reject")}>拒绝</button>
    </div>
  );
}

function trimActionText(value: string): string {
  return value.length > 8 ? `${value.slice(0, 8)}...` : value;
}
