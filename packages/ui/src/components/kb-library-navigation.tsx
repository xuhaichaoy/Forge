import { YUXI_CATEGORIES, type YuxiKnowledgeDatabase } from "../lib/yuxi-client";
import { type BizLine } from "./kb-library-model";

export function BusinessLineFilter({
  bizLine,
  presalesCount,
  bidCount,
  onSelect,
}: {
  bizLine: BizLine;
  presalesCount: number;
  bidCount: number;
  onSelect: (value: BizLine) => void;
}) {
  return (
    <div className="hc-kb-filter-section">
      <div className="hc-kb-filter-label">业务线</div>
      {([
        { id: "training_presales", label: "售前", count: presalesCount },
        { id: "bidding", label: "投标", count: bidCount },
      ] as const).map(({ id, label, count }) => (
        <button
          key={id}
          type="button"
          className="hc-kb-filter-opt"
          data-active={bizLine === id ? "true" : undefined}
          onClick={() => onSelect(id)}
        >
          {label}
          <span className="hc-kb-filter-opt-count">{count}</span>
        </button>
      ))}
    </div>
  );
}

export function CategoryFilter({
  activeCat,
  currentCats,
  categoryCounts,
  onSelect,
  title = "分类",
  allLabel = "全部分类",
  showAll = true,
}: {
  activeCat: string;
  currentCats: readonly (typeof YUXI_CATEGORIES)[number][];
  categoryCounts: Map<string, number>;
  onSelect: (category: string) => void;
  title?: string;
  allLabel?: string;
  showAll?: boolean;
}) {
  return (
    <div className="hc-kb-filter-section">
      <div className="hc-kb-filter-label">{title}</div>
      {showAll && (
        <button type="button" className="hc-kb-filter-opt" data-active={activeCat === "all" ? "true" : undefined} onClick={() => onSelect("all")}>
          {allLabel}
        </button>
      )}
      {currentCats.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          className="hc-kb-filter-opt"
          data-active={activeCat === key ? "true" : undefined}
          onClick={() => onSelect(key)}
        >
          {label}
          <span className="hc-kb-filter-opt-count">{categoryCounts.get(key) ?? 0}</span>
        </button>
      ))}
    </div>
  );
}

export function LibraryTreeFilter({
  activeCat,
  activeDbId,
  currentCats,
  categoryCounts,
  databases,
  onSelectCategory,
  onSelectDatabase,
  onCreateLibrary,
}: {
  activeCat: string;
  activeDbId?: string | null;
  currentCats: readonly (typeof YUXI_CATEGORIES)[number][];
  categoryCounts: Map<string, number>;
  databases?: readonly YuxiKnowledgeDatabase[];
  onSelectCategory: (category: string) => void;
  onSelectDatabase?: (category: string, dbId: string) => void;
  onCreateLibrary?: (category: string) => void;
}) {
  return (
    <div className="hc-kb-filter-section hc-kb-tree-section">
      <div className="hc-kb-filter-label-row">
        <div className="hc-kb-filter-label">知识库</div>
        {onCreateLibrary && (
          <button type="button" className="hc-kb-filter-add" onClick={() => onCreateLibrary(activeCat)} aria-label="新建知识库">
            +
          </button>
        )}
      </div>
      <div className="hc-kb-tree">
        {currentCats.map((category) => {
          const active = activeCat === category.key;
          const categoryCount = categoryCounts.get(category.key) ?? 0;
          const categoryDatabases = (databases ?? []).filter((db) => db.category === category.key);
          return (
            <div key={category.key} className="hc-kb-tree-group" data-active={active ? "true" : undefined}>
              <button
                type="button"
                className="hc-kb-tree-category"
                data-active={active ? "true" : undefined}
                onClick={() => onSelectCategory(category.key)}
              >
                <span className="hc-kb-tree-category-name">{category.label}</span>
                <span className="hc-kb-tree-category-count">{categoryCount}</span>
              </button>
              {categoryDatabases.length > 1 && (
                <div className="hc-kb-tree-children">
                  {categoryDatabases.map((db) => {
                    const dbId = db.db_id ?? "";
                    const dbCount = typeof db.file_count === "number" ? db.file_count : typeof db.row_count === "number" ? db.row_count : 0;
                    return (
                      <button
                        key={dbId || db.name || category.key}
                        type="button"
                        className="hc-kb-tree-database"
                        data-active={dbId && activeDbId === dbId ? "true" : undefined}
                        disabled={!dbId}
                        onClick={() => dbId && onSelectDatabase?.(category.key, dbId)}
                      >
                        <span className="hc-kb-tree-db-name">{db.name || "未命名知识库"}</span>
                        <span className="hc-kb-tree-db-count">{dbCount}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SimpleFilter({
  title,
  active,
  items,
  allLabel,
  onSelect,
}: {
  title: string;
  active: string;
  items: readonly string[];
  allLabel: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="hc-kb-filter-section">
      <div className="hc-kb-filter-label">{title}</div>
      <button type="button" className="hc-kb-filter-opt" data-active={active === "all" ? "true" : undefined} onClick={() => onSelect("all")}>
        {allLabel}
      </button>
      {items.map((item) => (
        <button key={item} type="button" className="hc-kb-filter-opt" data-active={active === item ? "true" : undefined} onClick={() => onSelect(item)}>
          {item}
        </button>
      ))}
    </div>
  );
}

export function BusinessLineTabs({
  bizLine,
  totalCount,
  presalesCount,
  bidCount,
  onSelect,
}: {
  bizLine: BizLine;
  totalCount: number;
  presalesCount: number;
  bidCount: number;
  onSelect: (value: BizLine) => void;
}) {
  return (
    <div className="hc-kb-line-tabs" role="tablist" aria-label="业务线">
      {([
        { id: "all", label: "全部", count: totalCount },
        { id: "training_presales", label: "售前", count: presalesCount },
        { id: "bidding", label: "投标", count: bidCount },
      ] as const).map(({ id, label, count }) => (
        <button
          key={id}
          type="button"
          role="tab"
          className="hc-kb-line-tab"
          data-active={bizLine === id ? "true" : undefined}
          aria-selected={bizLine === id}
          onClick={() => onSelect(id)}
        >
          {label}
          <span className="hc-kb-line-tab-count">{count}</span>
        </button>
      ))}
    </div>
  );
}

export function CategoryTabs({
  activeCat,
  currentCats,
  categoryCounts,
  onSelect,
  allLabel = "全部",
  showAll = true,
}: {
  activeCat: string;
  currentCats: readonly (typeof YUXI_CATEGORIES)[number][];
  categoryCounts: Map<string, number>;
  onSelect: (category: string) => void;
  allLabel?: string;
  showAll?: boolean;
}) {
  return (
    <div className="hc-kb-cat-tabs" role="tablist" aria-label="分类">
      {showAll && (
        <button type="button" role="tab" className="hc-kb-cat-tab" data-active={activeCat === "all" ? "true" : undefined} aria-selected={activeCat === "all"} onClick={() => onSelect("all")}>
          {allLabel}
        </button>
      )}
      {currentCats.map(({ key, label }) => (
        <button key={key} type="button" role="tab" className="hc-kb-cat-tab" data-active={activeCat === key ? "true" : undefined} aria-selected={activeCat === key} onClick={() => onSelect(key)}>
          {label}
          <span className="hc-kb-cat-tab-count">{categoryCounts.get(key) ?? 0}</span>
        </button>
      ))}
    </div>
  );
}
