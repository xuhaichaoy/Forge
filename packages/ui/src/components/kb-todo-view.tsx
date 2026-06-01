import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { KbPageShell } from "./kb-page-shell";
import {
  confirmYuxiClassifyPending,
  confirmYuxiEntityPending,
  confirmYuxiForcePending,
  listYuxiConflicts,
  listYuxiKnowledgeDatabases,
  listYuxiPendingQueue,
  rejectYuxiClassifyPending,
  rejectYuxiEntityPending,
  rejectYuxiForcePending,
  resolveYuxiConflict,
  resolveYuxiDupPending,
  type YuxiConflictItem,
  type YuxiKnowledgeDatabase,
  type YuxiPendingItem,
  type YuxiPendingQueue,
} from "../lib/yuxi-client";
import { TodoActions } from "./kb-todo-actions";
import {
  defaultDbIdForTodo,
  defaultEntityIdForTodo,
  projectTodos,
  SOURCE_LABEL,
  STATUS_CSS,
  STATUS_LABEL,
  type TodoAction,
  type TodoItem,
} from "./kb-todo-model";

export function KbTodoView() {
  const [queues, setQueues] = useState<Record<YuxiPendingQueue, YuxiPendingItem[]>>({
    classify: [],
    entity: [],
    dup: [],
    force: [],
  });
  const [conflicts, setConflicts] = useState<YuxiConflictItem[]>([]);
  const [databases, setDatabases] = useState<YuxiKnowledgeDatabase[]>([]);
  const [targetByTodo, setTargetByTodo] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTodos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [classify, entity, dup, force, conflictsResult, dbs] = await Promise.all([
        listYuxiPendingQueue("classify", { scope: "mine" }),
        listYuxiPendingQueue("entity", { scope: "mine" }),
        listYuxiPendingQueue("dup", { scope: "mine" }),
        listYuxiPendingQueue("force", { scope: "mine" }),
        listYuxiConflicts({ status: "pending", limit: 100 }),
        listYuxiKnowledgeDatabases().catch(() => ({ databases: [] as YuxiKnowledgeDatabase[] })),
      ]);
      setQueues({
        classify: classify.items ?? [],
        entity: entity.items ?? [],
        dup: dup.items ?? [],
        force: force.items ?? [],
      });
      setConflicts(conflictsResult.items ?? []);
      setDatabases(dbs.databases ?? []);
    } catch (err) {
      setConflicts([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTodos();
  }, [loadTodos]);

  const items = useMemo(() => projectTodos(queues, conflicts), [conflicts, queues]);
  const pendingCount = items.length;

  const runTodoAction = useCallback(async (
    item: TodoItem,
    action: TodoAction,
  ) => {
    if (item.numericId == null) return;
    setProcessingId(item.id);
    setError(null);
    try {
      if (action === "confirm_classify") {
        const dbId = targetByTodo[item.id] || defaultDbIdForTodo(item, databases);
        if (!dbId) throw new Error("需要先选择目标知识库");
        await confirmYuxiClassifyPending(item.numericId, dbId);
      } else if (action === "reject_classify") {
        await rejectYuxiClassifyPending(item.numericId);
      } else if (action === "confirm_existing") {
        const targetEntityId = defaultEntityIdForTodo(item);
        if (!targetEntityId) throw new Error("没有可关联的候选档案");
        await confirmYuxiEntityPending(item.numericId, "confirm_existing", targetEntityId);
      } else if (action === "create_new") {
        await confirmYuxiEntityPending(item.numericId, "create_new");
      } else if (action === "skip_entity") {
        await confirmYuxiEntityPending(item.numericId, "skip");
      } else if (action === "reject_entity") {
        await rejectYuxiEntityPending(item.numericId);
      } else if (action === "dup_replace") {
        await resolveYuxiDupPending(item.numericId, "replace");
      } else if (action === "dup_copy") {
        await resolveYuxiDupPending(item.numericId, "kept_as_copy");
      } else if (action === "dup_archive") {
        await resolveYuxiDupPending(item.numericId, "archived");
      } else if (action === "dup_reject") {
        await resolveYuxiDupPending(item.numericId, "rejected");
      } else if (action === "confirm_force") {
        const dbId = targetByTodo[item.id] || defaultDbIdForTodo(item, databases);
        if (!dbId) throw new Error("需要先选择目标知识库");
        await confirmYuxiForcePending(item.numericId, dbId);
      } else if (action === "reject_force") {
        await rejectYuxiForcePending(item.numericId);
      } else if (action === "conflict_apply") {
        await resolveYuxiConflict(item.numericId, "apply", {
          acceptedFields: item.conflict?.incoming_attrs ?? null,
          reason: "HiCodex 待办中心采纳权威字段冲突",
        });
      } else if (action === "conflict_reject") {
        await resolveYuxiConflict(item.numericId, "reject", {
          reason: "HiCodex 待办中心拒绝字段冲突",
        });
      } else if (action === "conflict_skip") {
        await resolveYuxiConflict(item.numericId, "skip", {
          reason: "HiCodex 待办中心跳过字段冲突",
        });
      }
      await loadTodos();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessingId(null);
    }
  }, [databases, loadTodos, targetByTodo]);

  return (
    <KbPageShell
      title="待办中心"
      ariaLabel="待办中心"
      actions={
        <>
          <span className="hc-kb-topbar-stats">
            <strong style={{ color: "#854d0e" }}>{pendingCount}</strong>
            <span style={{ marginLeft: 4 }}>条待处理</span>
          </span>
          <button type="button" className="hc-kb-topbar-btn" onClick={() => void loadTodos()} disabled={loading}>
            <RefreshCw size={13} strokeWidth={2.2} aria-hidden="true" />
            {loading ? "刷新中" : "刷新"}
          </button>
        </>
      }
    >
      {error && <div className="hc-kb-inline-alert" data-tone="danger">{error}</div>}
      <div className="hc-kb-table-wrap">
        {items.length === 0 ? (
          <div className="hc-kb-empty">
            <div className="hc-kb-empty-content">
              <div className="hc-kb-empty-title">{loading ? "正在读取待办" : "暂无待处理事项"}</div>
              <div className="hc-kb-empty-subtitle">来自资料上传、分类确认、重复版本、档案关联和字段冲突的事项会显示在这里。</div>
            </div>
          </div>
        ) : (
          <TodoTable
            items={items}
            databases={databases}
            targetByTodo={targetByTodo}
            processingId={processingId}
            onSelectTarget={(itemId, dbId) => setTargetByTodo((prev) => ({ ...prev, [itemId]: dbId }))}
            onAction={(item, action) => void runTodoAction(item, action)}
          />
        )}
      </div>
    </KbPageShell>
  );
}

function TodoTable({
  items,
  databases,
  targetByTodo,
  processingId,
  onSelectTarget,
  onAction,
}: {
  items: TodoItem[];
  databases: YuxiKnowledgeDatabase[];
  targetByTodo: Record<string, string>;
  processingId: string | null;
  onSelectTarget: (itemId: string, dbId: string) => void;
  onAction: (item: TodoItem, action: TodoAction) => void;
}) {
  return (
    <table className="hc-kb-table">
      <thead>
        <tr>
          <th style={{ width: "30%" }}>事项</th>
          <th style={{ width: "12%" }}>来源</th>
          <th style={{ width: "32%" }}>处理原因</th>
          <th style={{ width: "12%" }}>状态</th>
          <th style={{ textAlign: "right" }}>处理</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td>
              <div className="hc-kb-file-name" style={{ fontWeight: 560 }}>{item.title}</div>
            </td>
            <td>
              <span style={{ fontSize: 12, color: "var(--hc-text-secondary)" }}>
                {SOURCE_LABEL[item.source]}
              </span>
            </td>
            <td style={{ fontSize: 12, color: "var(--hc-text-secondary)", lineHeight: 1.5 }}>
              {item.reason}
            </td>
            <td>
              <span className={`hc-kb-status ${STATUS_CSS[item.status]}`}>
                {STATUS_LABEL[item.status]}
              </span>
            </td>
            <td>
              <TodoActions
                item={item}
                databases={databases}
                selectedTarget={targetByTodo[item.id] || defaultDbIdForTodo(item, databases)}
                processing={processingId === item.id}
                onSelectTarget={(dbId) => onSelectTarget(item.id, dbId)}
                onAction={(action) => onAction(item, action)}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
