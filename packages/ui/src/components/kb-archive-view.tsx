import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Search, X } from "lucide-react";
import { KbPageShell } from "./kb-page-shell";
import {
  listYuxiEntities,
  type YuxiEntity,
  type YuxiEntityType,
} from "../lib/yuxi-client";
import { EntityEditDialog, EntityMergeDialog } from "./kb-archive-entity-dialog";
import { useKbArchiveEntityActions } from "./kb-archive-entity-actions";
import { useConfirmDialog } from "./confirm-dialog";
import { KbArchiveDetailDrawer } from "./kb-archive-detail-drawer";
import { useKbArchiveDetailState } from "./kb-archive-detail-state";
import {
  resolveTabConfig,
  type EntityTab,
} from "./kb-archive-model";
import { EntityTable } from "./kb-archive-table";
import {
  aggregateArchiveCategories,
  applyEntityFilters,
  type ArchiveCategory,
} from "./kb-archive-view-model";

interface ArchiveViewSnapshot {
  activeTab: EntityTab;
  categories: ArchiveCategory[];
  items: YuxiEntity[];
}

let archiveViewSnapshot: ArchiveViewSnapshot | null = null;

export function KbArchiveView() {
  // 应用内确认对话框（Tauri WebView 的 window.confirm 是 no-op，不能用）
  const { confirmDialog, confirmDialogNode } = useConfirmDialog();
  const [activeTab, setActiveTab] = useState<EntityTab>(() => archiveViewSnapshot?.activeTab ?? "teacher");
  const [queries, setQueries] = useState<Record<string, string>>({});
  const [items, setItems] = useState<YuxiEntity[]>(() => archiveViewSnapshot?.items ?? []);
  const [authorityFilter, setAuthorityFilter] = useState("all");
  const [entityFilters, setEntityFilters] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<ArchiveCategory[]>(() => archiveViewSnapshot?.categories ?? []);
  const {
    selectedId,
    setSelectedId,
    detail,
    related,
    history,
    attributeDraft,
    setAttributeDraft,
    attributeDiffs,
    setAttributeDiffs,
    detailLoading,
    relatedLoading,
    historyLoading,
    attributeBusy,
    setAttributeBusy,
    detailError,
    setDetailError,
    attributeError,
    setAttributeError,
    loadDetail,
    resetSelection,
  } = useKbArchiveDetailState();
  const [loading, setLoading] = useState(() => archiveViewSnapshot == null);
  const [hasLoadedEntities, setHasLoadedEntities] = useState(() => archiveViewSnapshot != null);
  const [error, setError] = useState<string | null>(null);

  const tab = useMemo(() => {
    const activeLabel = categories.find((category) => category.type === activeTab)?.label;
    return resolveTabConfig(activeTab, activeLabel);
  }, [activeTab, categories]);
  const query = queries[activeTab] ?? "";
  const setQuery = (value: string) => setQueries((prev) => ({ ...prev, [activeTab]: value }));

  const loadEntities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 一次广撷（不按 type 过滤）→ 聚合出 Yuxi 真实存在的 entity_type 分类与计数；
      // 同时按当前选中类型 + 搜索词单独拉一页用于右侧表格。
      const [current, overview] = await Promise.all([
        listYuxiEntities({
          type: activeTab as YuxiEntityType,
          query: query.trim() || null,
          limit: 80,
        }),
        listYuxiEntities({ limit: 200 }).catch(() => ({ total: 0, items: [] })),
      ]);
      const nextItems = current.items ?? [];
      const nextCategories = aggregateArchiveCategories(overview.items ?? []);
      setItems(nextItems);
      setCategories(nextCategories);
      archiveViewSnapshot = {
        activeTab,
        categories: nextCategories,
        items: nextItems,
      };
      if (selectedId != null && !nextItems.some((item) => item.id === selectedId)) {
        resetSelection();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setItems([]);
    } finally {
      setHasLoadedEntities(true);
      setLoading(false);
    }
  }, [activeTab, query, resetSelection, selectedId]);

  useEffect(() => {
    void loadEntities();
  }, [loadEntities]);

  useEffect(() => {
    if (!hasLoadedEntities) return;
    archiveViewSnapshot = { activeTab, categories, items };
  }, [activeTab, categories, hasLoadedEntities, items]);

  // 选中的分类若在真实分类里已不存在（例如该类型被清空），回退到第一个真实分类。
  useEffect(() => {
    if (categories.length === 0) return;
    if (categories.some((category) => category.type === activeTab)) return;
    setActiveTab(categories[0].type as EntityTab);
    setAuthorityFilter("all");
    setEntityFilters({});
    setItems([]);
    setLoading(true);
  }, [activeTab, categories]);

  const pendingCount = useMemo(() => items.filter((item) => item.authority_status !== "authoritative").length, [items]);
  const totalArchiveCount = useMemo(
    () => categories.reduce((sum, category) => sum + category.count, 0),
    [categories],
  );
  const initialArchiveLoading = loading && !hasLoadedEntities && categories.length === 0 && items.length === 0;
  const visibleItems = useMemo(
    () => applyEntityFilters(items, authorityFilter, entityFilters, tab.filters),
    [authorityFilter, entityFilters, items, tab.filters],
  );

  const selectEntity = useCallback((item: YuxiEntity) => {
    if (typeof item.id !== "number") return;
    setSelectedId(item.id);
  }, [setSelectedId]);

  const selectArchiveCategory = useCallback((type: string) => {
    if (type === activeTab) return;
    setActiveTab(type as EntityTab);
    setAuthorityFilter("all");
    setEntityFilters({});
    setItems([]);
    setError(null);
    setLoading(true);
    resetSelection();
  }, [activeTab, resetSelection]);

  const {
    authorityBusy,
    mutationBusy,
    entityDialogMode,
    mergeOpen,
    mutationError,
    changeAuthority,
    openCreateEntity,
    openEditEntity,
    closeEntityDialog,
    saveEntity,
    deleteEntity,
    openMerge,
    closeMerge,
    mergeEntity,
    refreshMetrics,
    previewAttributeDiff,
    applyAttributeDiff,
  } = useKbArchiveEntityActions({
    activeTab,
    attributeDiffs,
    attributeDraft,
    confirmDialog,
    detail,
    loadDetail,
    loadEntities,
    resetSelection,
    selectedId,
    setAttributeBusy,
    setAttributeDiffs,
    setAttributeDraft,
    setAttributeError,
    setDetailError,
    setSelectedId,
  });

  return (
    <KbPageShell
      title="档案中心"
      ariaLabel="档案管理"
      actions={
        <>
          <button type="button" className="hc-kb-topbar-btn" onClick={() => void loadEntities()} disabled={loading}>
            <RefreshCw size={13} strokeWidth={2.2} aria-hidden="true" />
            {loading ? "刷新中" : "刷新"}
          </button>
          <button type="button" className="hc-kb-topbar-btn hc-kb-topbar-btn--primary" onClick={openCreateEntity}>
            <Plus size={13} strokeWidth={2.2} aria-hidden="true" />
            新建档案
          </button>
        </>
      }
    >
      <div className="hc-kb-body">
        <aside className="hc-kb-filters hc-kb-archive-sidebar" aria-label="档案分类">
          <div className="hc-kb-filter-section">
            <div className="hc-kb-filter-label">档案分类</div>
            {categories.length > 0 && (
              categories.map(({ type, label, count }) => (
                <button
                  key={type}
                  type="button"
                  className="hc-kb-filter-opt"
                  data-active={activeTab === type ? "true" : undefined}
                  onClick={() => selectArchiveCategory(type)}
                >
                  <span className="hc-kb-filter-opt-name">{label}</span>
                  <span className="hc-kb-filter-opt-count">{count.toLocaleString()}</span>
                </button>
              ))
            )}
          </div>
        </aside>

        <div className="hc-kb-results-area">
          <div className="hc-kb-archive-content">
            <div className="hc-kb-archive-main-head">
              <div>
                <div className="hc-kb-archive-title-row">
                  <h2>{tab.label}档案</h2>
                  <span>{initialArchiveLoading ? "读取中" : `${visibleItems.length.toLocaleString()} 条`}</span>
                </div>
                <p>
                  {initialArchiveLoading
                    ? "正在读取档案分类和统计"
                    : `共 ${totalArchiveCount.toLocaleString()} 条档案 · ${categories.length} 个分类`}
                  {pendingCount > 0 ? ` · ${pendingCount} 条待确认` : ""}
                </p>
              </div>
            </div>

            <div className="hc-kb-search-section hc-kb-search-section--archive">
              <div className="hc-kb-search-wrap">
                <Search size={14} aria-hidden="true" />
                <input
                  key={activeTab}
                  type="search"
                  className="hc-kb-search hc-kb-search--prominent"
                  placeholder={tab.searchPlaceholder}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label={`搜索${tab.label}`}
                />
                {query && (
                  <button type="button" className="hc-kb-search-clear" onClick={() => setQuery("")} aria-label="清除搜索">
                    <X size={12} aria-hidden="true" />
                  </button>
                )}
              </div>
              {error && <div className="hc-kb-inline-alert" data-tone="danger">{error}</div>}
            </div>

        <div className="hc-kb-archive-layout">
          <div className="hc-kb-table-wrap">
            {visibleItems.length === 0 ? (
              <div className="hc-kb-empty">
                <div className="hc-kb-empty-content">
                  <div className="hc-kb-empty-title">{loading ? "正在读取档案" : "暂无档案"}</div>
                  <div className="hc-kb-empty-subtitle">
                    {loading ? "正在同步当前分类内容。" : "资料上传并提取档案后，会出现在当前分类下。"}
                  </div>
                </div>
              </div>
            ) : (
              <EntityTable items={visibleItems} selectedId={selectedId} onSelect={selectEntity} />
            )}
          </div>
        </div>
        {selectedId != null && (
          <KbArchiveDetailDrawer
            detail={detail}
            detailLoading={detailLoading}
            detailError={detailError}
            authorityBusy={authorityBusy}
            mutationBusy={mutationBusy}
            related={related}
            relatedLoading={relatedLoading}
            history={history}
            historyLoading={historyLoading}
            attributeDraft={attributeDraft}
            attributeDiffs={attributeDiffs}
            attributeBusy={attributeBusy}
            attributeError={attributeError}
            onAttributeDraftChange={setAttributeDraft}
            onPreviewAttributeDiff={() => void previewAttributeDiff()}
            onApplyAttributeDiff={() => void applyAttributeDiff()}
            onChangeAuthority={changeAuthority}
            onClose={resetSelection}
            onEdit={openEditEntity}
            onDelete={() => void deleteEntity()}
            onMerge={openMerge}
            onRefreshMetrics={() => void refreshMetrics()}
          />
        )}
          </div>
        </div>
      </div>
      {entityDialogMode && (
        <EntityEditDialog
          mode={entityDialogMode}
          entityType={activeTab as YuxiEntityType}
          detail={entityDialogMode === "edit" ? detail : null}
          saving={mutationBusy}
          error={mutationError}
          onClose={closeEntityDialog}
          onSubmit={(payload) => void saveEntity(payload)}
        />
      )}
      {mergeOpen && detail && (
        <EntityMergeDialog
          detail={detail}
          candidates={items}
          saving={mutationBusy}
          error={mutationError}
          onClose={closeMerge}
          onSubmit={(targetId, mergeAttributes) => void mergeEntity(targetId, mergeAttributes)}
        />
      )}
      {confirmDialogNode}
    </KbPageShell>
  );
}
