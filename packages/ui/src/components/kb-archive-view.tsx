import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Search, X } from "lucide-react";
import { KbPageShell } from "./kb-page-shell";
import {
  applyYuxiEntityAttributes,
  changeYuxiEntityAuthority,
  createYuxiEntity,
  deleteYuxiEntity,
  diffYuxiEntityAttributes,
  getYuxiEntity,
  getYuxiEntityHistory,
  getYuxiEntityRelated,
  listYuxiEntities,
  mergeYuxiEntity,
  refreshYuxiEntityMetrics,
  updateYuxiEntity,
  type YuxiEntity,
  type YuxiEntityAttributeDiff,
  type YuxiEntityDetail,
  type YuxiEntityHistoryEntry,
  type YuxiEntityMutationPayload,
  type YuxiEntityRelatedResponse,
  type YuxiEntityType,
} from "../lib/yuxi-client";
import { EntityEditDialog, EntityMergeDialog } from "./kb-archive-entity-dialog";
import { useConfirmDialog } from "./confirm-dialog";
import { EntityDetailPanel } from "./kb-archive-detail";
import {
  resolveTabConfig,
  type EntityTab,
} from "./kb-archive-model";
import { EntityTable } from "./kb-archive-table";

/** 左侧动态档案分类：从真实实体聚合出的 distinct entity_type + 每类计数 + 中文标签。 */
interface ArchiveCategory {
  type: string;
  label: string;
  count: number;
}

interface ArchiveViewSnapshot {
  activeTab: EntityTab;
  categories: ArchiveCategory[];
  items: YuxiEntity[];
}

let archiveViewSnapshot: ArchiveViewSnapshot | null = null;

/** 聚合一批实体里真实存在的 entity_type（去重 + 计数），按计数降序、同数按标签排序。 */
function aggregateArchiveCategories(entities: YuxiEntity[]): ArchiveCategory[] {
  const counts = new Map<string, number>();
  for (const item of entities) {
    const type = (item.entity_type ?? "").trim();
    if (!type) continue;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, label: resolveTabConfig(type).label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-CN"));
}

export function KbArchiveView() {
  // 应用内确认对话框（Tauri WebView 的 window.confirm 是 no-op，不能用）
  const { confirmDialog, confirmDialogNode } = useConfirmDialog();
  const [activeTab, setActiveTab] = useState<EntityTab>(() => archiveViewSnapshot?.activeTab ?? "teacher");
  const [queries, setQueries] = useState<Record<string, string>>({});
  const [items, setItems] = useState<YuxiEntity[]>(() => archiveViewSnapshot?.items ?? []);
  const [authorityFilter, setAuthorityFilter] = useState("all");
  const [entityFilters, setEntityFilters] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<ArchiveCategory[]>(() => archiveViewSnapshot?.categories ?? []);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<YuxiEntityDetail | null>(null);
  const [related, setRelated] = useState<YuxiEntityRelatedResponse | null>(null);
  const [history, setHistory] = useState<YuxiEntityHistoryEntry[]>([]);
  const [attributeDraft, setAttributeDraft] = useState("");
  const [attributeDiffs, setAttributeDiffs] = useState<YuxiEntityAttributeDiff[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [attributeBusy, setAttributeBusy] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [attributeError, setAttributeError] = useState<string | null>(null);
  const [authorityBusy, setAuthorityBusy] = useState(false);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [entityDialogMode, setEntityDialogMode] = useState<"create" | "edit" | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => archiveViewSnapshot == null);
  const [hasLoadedEntities, setHasLoadedEntities] = useState(() => archiveViewSnapshot != null);
  const [error, setError] = useState<string | null>(null);

  const tab = useMemo(() => {
    const activeLabel = categories.find((category) => category.type === activeTab)?.label;
    return resolveTabConfig(activeTab, activeLabel);
  }, [activeTab, categories]);
  const query = queries[activeTab] ?? "";
  const setQuery = (value: string) => setQueries((prev) => ({ ...prev, [activeTab]: value }));

  const loadDetail = useCallback(async (entityId: number | null) => {
    if (entityId == null) {
      setDetail(null);
      setRelated(null);
      setHistory([]);
      setAttributeDraft("");
      setAttributeDiffs([]);
      setDetailError(null);
      setAttributeError(null);
      return;
    }
    setDetailLoading(true);
    setRelatedLoading(true);
    setHistoryLoading(true);
    setDetailError(null);
    setAttributeError(null);
    setAttributeDraft("");
    setAttributeDiffs([]);
    try {
      const [nextDetail, nextRelated, nextHistory] = await Promise.all([
        getYuxiEntity(entityId),
        getYuxiEntityRelated(entityId).catch(() => null),
        getYuxiEntityHistory(entityId).catch(() => ({ history: [] })),
      ]);
      setDetail(nextDetail);
      setRelated(nextRelated);
      setHistory(nextHistory.history ?? []);
    } catch (err) {
      setDetail(null);
      setRelated(null);
      setHistory([]);
      setDetailError(err instanceof Error ? err.message : String(err));
    } finally {
      setDetailLoading(false);
      setRelatedLoading(false);
      setHistoryLoading(false);
    }
  }, []);

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
        setSelectedId(null);
        setDetail(null);
        setRelated(null);
        setHistory([]);
        setAttributeDraft("");
        setAttributeDiffs([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setItems([]);
    } finally {
      setHasLoadedEntities(true);
      setLoading(false);
    }
  }, [activeTab, query, selectedId]);

  useEffect(() => {
    void loadEntities();
  }, [loadEntities]);

  useEffect(() => {
    if (!hasLoadedEntities) return;
    archiveViewSnapshot = { activeTab, categories, items };
  }, [activeTab, categories, hasLoadedEntities, items]);

  useEffect(() => {
    void loadDetail(selectedId);
  }, [loadDetail, selectedId]);

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
  }, []);

  const resetSelection = useCallback(() => {
    setSelectedId(null);
    setDetail(null);
    setRelated(null);
    setHistory([]);
    setAttributeDraft("");
    setAttributeDiffs([]);
  }, []);

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

  const changeAuthority = useCallback(async (status: string) => {
    if (selectedId == null) return;
    setAuthorityBusy(true);
    setDetailError(null);
    try {
      await changeYuxiEntityAuthority(selectedId, status, "HiCodex 档案中心手动调整");
      await Promise.all([loadDetail(selectedId), loadEntities()]);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : String(err));
    } finally {
      setAuthorityBusy(false);
    }
  }, [loadDetail, loadEntities, selectedId]);

  const openCreateEntity = useCallback(() => {
    setMutationError(null);
    setEntityDialogMode("create");
  }, []);

  const openEditEntity = useCallback(() => {
    if (!detail) return;
    setMutationError(null);
    setEntityDialogMode("edit");
  }, [detail]);

  const saveEntity = useCallback(async (payload: YuxiEntityMutationPayload) => {
    setMutationBusy(true);
    setMutationError(null);
    try {
      let nextSelectedId = selectedId;
      if (entityDialogMode === "create") {
        const created = await createYuxiEntity({ ...payload, entity_type: activeTab });
        nextSelectedId = typeof created.entity_id === "number" ? created.entity_id : null;
        setSelectedId(nextSelectedId);
      } else if (entityDialogMode === "edit") {
        if (selectedId == null) throw new Error("缺少档案 ID");
        await updateYuxiEntity(selectedId, payload);
      }
      setEntityDialogMode(null);
      await loadEntities();
      if (nextSelectedId != null) await loadDetail(nextSelectedId);
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : String(err));
    } finally {
      setMutationBusy(false);
    }
  }, [activeTab, entityDialogMode, loadDetail, loadEntities, selectedId]);

  const deleteEntity = useCallback(async () => {
    if (selectedId == null || !detail) return;
    const name = detail.canonical_name || `未命名档案 #${selectedId}`;
    if (!(await confirmDialog(`确定删除档案「${name}」吗？来源引用也会解除关联。`))) return;
    setMutationBusy(true);
    setDetailError(null);
    try {
      await deleteYuxiEntity(selectedId);
      setSelectedId(null);
      setDetail(null);
      setRelated(null);
      setHistory([]);
      setAttributeDraft("");
      setAttributeDiffs([]);
      await loadEntities();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : String(err));
    } finally {
      setMutationBusy(false);
    }
  }, [confirmDialog, detail, loadEntities, selectedId]);

  const mergeEntity = useCallback(async (targetId: number, mergeAttributes: boolean) => {
    if (selectedId == null) return;
    setMutationBusy(true);
    setMutationError(null);
    try {
      await mergeYuxiEntity(selectedId, targetId, mergeAttributes);
      setMergeOpen(false);
      setSelectedId(targetId);
      await loadEntities();
      await loadDetail(targetId);
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : String(err));
    } finally {
      setMutationBusy(false);
    }
  }, [loadDetail, loadEntities, selectedId]);

  const refreshMetrics = useCallback(async () => {
    setMutationBusy(true);
    setDetailError(null);
    try {
      await refreshYuxiEntityMetrics(selectedId);
      await loadEntities();
      if (selectedId != null) await loadDetail(selectedId);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : String(err));
    } finally {
      setMutationBusy(false);
    }
  }, [loadDetail, loadEntities, selectedId]);

  const previewAttributeDiff = useCallback(async () => {
    if (selectedId == null) return;
    setAttributeBusy(true);
    setAttributeError(null);
    try {
      const incoming = parseAttributeDraft(attributeDraft);
      const result = await diffYuxiEntityAttributes(selectedId, incoming);
      setAttributeDiffs(result.diffs ?? []);
    } catch (err) {
      setAttributeDiffs([]);
      setAttributeError(err instanceof Error ? err.message : String(err));
    } finally {
      setAttributeBusy(false);
    }
  }, [attributeDraft, selectedId]);

  const applyAttributeDiff = useCallback(async () => {
    if (selectedId == null || attributeDiffs.length === 0) return;
    setAttributeBusy(true);
    setAttributeError(null);
    try {
      const fields = Object.fromEntries(attributeDiffs
        .filter((diff) => diff.field)
        .map((diff) => [diff.field as string, diff.new]));
      await applyYuxiEntityAttributes(selectedId, fields, "HiCodex 档案中心采纳字段更新");
      setAttributeDraft("");
      setAttributeDiffs([]);
      await Promise.all([loadEntities(), loadDetail(selectedId)]);
    } catch (err) {
      setAttributeError(err instanceof Error ? err.message : String(err));
    } finally {
      setAttributeBusy(false);
    }
  }, [attributeDiffs, loadDetail, loadEntities, selectedId]);

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
          <div className="hc-kb-archive-drawer" role="presentation">
            <button
              type="button"
              className="hc-kb-archive-drawer-scrim"
              aria-label="关闭档案详情"
              onClick={resetSelection}
            />
            <aside className="hc-kb-archive-drawer-panel" role="dialog" aria-modal="true" aria-label="档案详情">
              <button type="button" className="hc-kb-archive-drawer-close" onClick={resetSelection}>
                <X size={14} strokeWidth={2.2} aria-hidden="true" />
                关闭
              </button>
              <EntityDetailPanel
                detail={detail}
                loading={detailLoading}
                error={detailError}
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
                onEdit={openEditEntity}
                onDelete={() => void deleteEntity()}
                onMerge={() => {
                  setMutationError(null);
                  setMergeOpen(true);
                }}
                onRefreshMetrics={() => void refreshMetrics()}
              />
            </aside>
          </div>
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
          onClose={() => {
            if (!mutationBusy) setEntityDialogMode(null);
          }}
          onSubmit={(payload) => void saveEntity(payload)}
        />
      )}
      {mergeOpen && detail && (
        <EntityMergeDialog
          detail={detail}
          candidates={items}
          saving={mutationBusy}
          error={mutationError}
          onClose={() => {
            if (!mutationBusy) setMergeOpen(false);
          }}
          onSubmit={(targetId, mergeAttributes) => void mergeEntity(targetId, mergeAttributes)}
        />
      )}
      {confirmDialogNode}
    </KbPageShell>
  );
}

function applyEntityFilters(
  items: YuxiEntity[],
  authorityFilter: string,
  filters: Record<string, string>,
  config: Array<{ label: string; options: readonly string[] }>,
): YuxiEntity[] {
  let next = authorityFilter === "all"
    ? items
    : items.filter((item) => (item.authority_status || "unconfirmed") === authorityFilter);
  for (const filter of config) {
    const value = filters[filter.label];
    if (!value || filter.label === "排序") continue;
    next = next.filter((item) => entityFilterText(item).includes(value.toLowerCase()));
  }
  const sortValue = filters["排序"];
  return sortValue ? [...next].sort((a, b) => compareEntities(a, b, sortValue)) : next;
}

function entityFilterText(item: YuxiEntity): string {
  const parts = [
    item.canonical_name,
    item.description,
    ...(item.aliases ?? []),
    JSON.stringify(item.attributes ?? {}),
    JSON.stringify(item.metrics ?? {}),
  ].filter(Boolean);
  return parts.join(" ").toLowerCase();
}

function compareEntities(a: YuxiEntity, b: YuxiEntity, sortValue: string): number {
  if (sortValue.includes("提及") || sortValue.includes("复用") || sortValue.includes("项目数") || sortValue.includes("采购次数") || sortValue.includes("中标次数") || sortValue.includes("发生次数")) {
    return (b.reference_count ?? 0) - (a.reference_count ?? 0);
  }
  if (sortValue.includes("时间") || sortValue.includes("活跃") || sortValue.includes("触达") || sortValue.includes("更新")) {
    return dateValue(b.updated_at) - dateValue(a.updated_at);
  }
  return String(a.canonical_name ?? "").localeCompare(String(b.canonical_name ?? ""), "zh-CN");
}

function dateValue(value: string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function parseAttributeDraft(value: string): Record<string, unknown> {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("请先填写要补充的信息。");
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error("补充信息格式不正确，请按结构化模板填写。");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("补充信息需要是一组字段和值。");
  }
  return parsed as Record<string, unknown>;
}
