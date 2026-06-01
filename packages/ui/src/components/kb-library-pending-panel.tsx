import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  confirmYuxiClassifyPending,
  confirmYuxiEntityPending,
  confirmYuxiForcePending,
  listYuxiConflicts,
  listYuxiPendingQueue,
  rejectYuxiClassifyPending,
  rejectYuxiEntityPending,
  rejectYuxiForcePending,
  resolveYuxiConflict,
  resolveYuxiDupPending,
  type YuxiConflictItem,
  type YuxiCategoryMeta,
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
  todoBelongsToCurrentLibrary,
} from "./kb-todo-model";

export function KbLibraryPendingPanel({
  selectedCategory,
  selectedDatabase,
  selectedDatabases,
  allDatabases,
  focusPendingIds = [],
  onResolved,
}: {
  selectedCategory: YuxiCategoryMeta | null;
  selectedDatabase: YuxiKnowledgeDatabase | null;
  selectedDatabases: YuxiKnowledgeDatabase[];
  allDatabases: YuxiKnowledgeDatabase[];
  focusPendingIds?: number[];
  onResolved?: () => Promise<void> | void;
}) {
  const [queues, setQueues] = useState<Record<YuxiPendingQueue, YuxiPendingItem[]>>({
    classify: [],
    entity: [],
    dup: [],
    force: [],
  });
  const [conflicts, setConflicts] = useState<YuxiConflictItem[]>([]);
  const [targetByTodo, setTargetByTodo] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedDbId = selectedDatabase?.db_id ?? null;
  const selectedCategoryKey = selectedCategory?.key ?? null;
  const selectedBusinessLine = selectedCategory?.line ?? null;

  const loadPending = useCallback(async () => {
    setLoading(true);
    setError(null);
    const query = {
      scope: "team" as const,
      limit: 100,
      dbId: selectedDbId,
      category: selectedCategoryKey,
      businessLine: selectedBusinessLine,
    };
    try {
      const [classify, entity, dup, force, conflictResult] = await Promise.all([
        listYuxiPendingQueue("classify", query),
        listYuxiPendingQueue("entity", query),
        listYuxiPendingQueue("dup", query),
        listYuxiPendingQueue("force", query),
        listYuxiConflicts({ status: "pending", limit: 100 }),
      ]);
      setQueues({
        classify: classify.items ?? [],
        entity: entity.items ?? [],
        dup: dup.items ?? [],
        force: force.items ?? [],
      });
      setConflicts(conflictResult.items ?? []);
    } catch (err) {
      setConflicts([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [selectedBusinessLine, selectedCategoryKey, selectedDbId]);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  const libraryDbIds = useMemo(
    () => {
      if (selectedDbId) return new Set([selectedDbId]);
      return new Set(selectedDatabases.map((db) => db.db_id).filter((dbId): dbId is string => typeof dbId === "string" && dbId.length > 0));
    },
    [selectedDbId, selectedDatabases],
  );
  const currentDatabases = selectedDatabase
    ? [selectedDatabase]
    : selectedDatabases.length > 0 ? selectedDatabases : allDatabases.filter((db) => db.category === selectedCategory?.key);
  const items = useMemo(
    () => projectTodos(queues, conflicts).filter((item) => todoBelongsToCurrentLibrary(item.raw, selectedCategory?.key ?? null, libraryDbIds)),
    [conflicts, libraryDbIds, queues, selectedCategory?.key],
  );
  const focusSet = useMemo(() => new Set(focusPendingIds), [focusPendingIds]);

  useEffect(() => {
    if (focusPendingIds.length === 0) return;
    const node = globalThis.document?.querySelector?.("[data-pending-focus='true']");
    if (node instanceof HTMLElement) {
      node.scrollIntoView({ block: "center" });
    }
  }, [focusPendingIds, items]);

  const runAction = useCallback(async (item: TodoItem, action: TodoAction) => {
    if (item.numericId == null) return;
    setProcessingId(item.id);
    setError(null);
    try {
      if (action === "confirm_classify") {
        const dbId = targetByTodo[item.id] || defaultDbIdForTodo(item, currentDatabases);
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
        const dbId = targetByTodo[item.id] || defaultDbIdForTodo(item, currentDatabases);
        if (!dbId) throw new Error("需要先选择目标知识库");
        await confirmYuxiForcePending(item.numericId, dbId);
      } else if (action === "reject_force") {
        await rejectYuxiForcePending(item.numericId);
      } else if (action === "conflict_apply") {
        await resolveYuxiConflict(item.numericId, "apply", {
          acceptedFields: item.conflict?.incoming_attrs ?? null,
          reason: "HiCodex 入库问题采纳字段冲突",
        });
      } else if (action === "conflict_reject") {
        await resolveYuxiConflict(item.numericId, "reject", {
          reason: "HiCodex 入库问题拒绝字段冲突",
        });
      } else if (action === "conflict_skip") {
        await resolveYuxiConflict(item.numericId, "skip", {
          reason: "HiCodex 入库问题跳过字段冲突",
        });
      }
      await loadPending();
      await onResolved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessingId(null);
    }
  }, [currentDatabases, loadPending, onResolved, targetByTodo]);

  if (!selectedCategory) {
    return (
      <section className="hc-kb-management-panel" aria-label="当前知识库入库问题">
        <div className="hc-kb-empty">
          <div className="hc-kb-empty-content">
            <div className="hc-kb-empty-title">先在左侧选择知识库</div>
            <div className="hc-kb-empty-subtitle">重复资料、识别不清、档案冲突和读取异常会按当前知识库处理。</div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="hc-kb-management-panel" aria-label="当前知识库入库问题">
      <div className="hc-kb-panel-head">
        <div>
          <div className="hc-kb-section-title">{selectedDatabase?.name || selectedCategory.label} · 入库问题</div>
        </div>
        <button type="button" className="hc-kb-topbar-btn" onClick={() => void loadPending()} disabled={loading}>
          <RefreshCw size={13} strokeWidth={2.2} aria-hidden="true" />
          {loading ? "刷新中" : "刷新"}
        </button>
      </div>
      {error && <div className="hc-kb-inline-alert" data-tone="danger">{error}</div>}
      <div className="hc-kb-table-wrap">
        {items.length === 0 ? (
          <div className="hc-kb-empty">
            <div className="hc-kb-empty-content">
              <div className="hc-kb-empty-title">{loading ? "正在读取入库问题" : "暂无入库问题"}</div>
              <div className="hc-kb-empty-subtitle">重复资料、识别不清、档案冲突和读取异常会出现在这里。</div>
            </div>
          </div>
        ) : (
          <table className="hc-kb-table">
            <thead>
              <tr>
                <th style={{ width: "30%" }}>事项</th>
                <th style={{ width: "12%" }}>来源</th>
                <th style={{ width: "30%" }}>为什么需要处理</th>
                <th style={{ width: "12%" }}>状态</th>
                <th style={{ textAlign: "right" }}>处理</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const focused = item.numericId != null && focusSet.has(item.numericId);
                return (
                <tr key={item.id} data-pending-id={item.numericId ?? undefined} data-pending-focus={focused ? "true" : undefined}>
                  <td><div className="hc-kb-file-name" style={{ fontWeight: 560 }}>{item.title}</div></td>
                  <td><span style={{ fontSize: 12, color: "var(--hc-text-secondary)" }}>{SOURCE_LABEL[item.source]}</span></td>
                  <td style={{ fontSize: 12, color: "var(--hc-text-secondary)", lineHeight: 1.5 }}>{item.reason}</td>
                  <td><span className={`hc-kb-status ${STATUS_CSS[item.status]}`}>{STATUS_LABEL[item.status]}</span></td>
                  <td>
                    <TodoActions
                      item={item}
                      databases={currentDatabases}
                      selectedTarget={targetByTodo[item.id] || defaultDbIdForTodo(item, currentDatabases)}
                      processing={processingId === item.id}
                      onSelectTarget={(dbId) => setTargetByTodo((prev) => ({ ...prev, [item.id]: dbId }))}
                      onAction={(action) => void runAction(item, action)}
                    />
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

