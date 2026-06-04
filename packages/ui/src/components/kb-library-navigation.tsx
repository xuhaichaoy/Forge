import { type YuxiKnowledgeDatabase } from "../lib/yuxi-client";

/**
 * 左侧知识库列表：直接按 Yuxi 真实库（listYuxiKnowledgeDatabases）平铺，不再写死业务线/类目。
 * - 顶部「全部」展示所有库资料总数（activeDbId 为 null）。
 * - 每个库展示其资料数（file_count / row_count）。
 */
export function LibraryListFilter({
  activeDbId,
  databases,
  totalCount,
  onSelectAll,
  onSelectDatabase,
  onCreateLibrary,
}: {
  activeDbId?: string | null;
  databases: readonly YuxiKnowledgeDatabase[];
  totalCount: number;
  onSelectAll: () => void;
  onSelectDatabase: (dbId: string) => void;
  onCreateLibrary?: () => void;
}) {
  return (
    <div className="hc-kb-filter-section hc-kb-tree-section">
      <div className="hc-kb-filter-label-row">
        <div className="hc-kb-filter-label">知识库</div>
        {onCreateLibrary && (
          <button type="button" className="hc-kb-filter-add" onClick={() => onCreateLibrary()} aria-label="新建知识库">
            +
          </button>
        )}
      </div>
      <div className="hc-kb-tree">
        <button
          type="button"
          className="hc-kb-filter-opt"
          data-active={!activeDbId ? "true" : undefined}
          onClick={onSelectAll}
        >
          <span className="hc-kb-filter-opt-name">全部</span>
          <span className="hc-kb-filter-opt-count">{totalCount}</span>
        </button>
        {databases.length === 0 ? (
          <div className="hc-kb-tree-empty">还没有知识库，点击右上角 + 新建。</div>
        ) : (
          databases.map((db) => {
            const dbId = db.db_id ?? "";
            const dbCount = typeof db.file_count === "number"
              ? db.file_count
              : typeof db.row_count === "number" ? db.row_count : 0;
            return (
              <button
                key={dbId || db.name || "db"}
                type="button"
                className="hc-kb-filter-opt"
                data-active={dbId && activeDbId === dbId ? "true" : undefined}
                disabled={!dbId}
                onClick={() => dbId && onSelectDatabase(dbId)}
                title={db.description ?? db.name ?? undefined}
              >
                <span className="hc-kb-filter-opt-name">{db.name || "未命名知识库"}</span>
                <span className="hc-kb-filter-opt-count">{dbCount}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
