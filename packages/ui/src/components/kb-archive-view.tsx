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
  listYuxiKnowledgeDatabases,
  listYuxiEntities,
  mergeYuxiEntity,
  refreshYuxiEntityMetrics,
  updateYuxiEntity,
  YUXI_CATEGORIES,
  yuxiBusinessLineLabel,
  yuxiCategoryMeta,
  type YuxiBusinessLine,
  type YuxiEntity,
  type YuxiEntityAttributeDiff,
  type YuxiEntityDetail,
  type YuxiEntityHistoryEntry,
  type YuxiEntityMutationPayload,
  type YuxiEntityRelatedResponse,
  type YuxiEntityType,
  type YuxiKnowledgeDatabase,
} from "../lib/yuxi-client";
import { EntityEditDialog, EntityMergeDialog } from "./kb-archive-entity-dialog";
import { EntityDetailPanel } from "./kb-archive-detail";
import {
  ENTITY_TABS,
  type EntityTab,
} from "./kb-archive-model";
import { EntityTable } from "./kb-archive-table";

export function KbArchiveView() {
  const [activeTab, setActiveTab] = useState<EntityTab>("teacher");
  const [archiveBizLine, setArchiveBizLine] = useState<"all" | YuxiBusinessLine>("all");
  const [archiveCategory, setArchiveCategory] = useState("all");
  const [sourceDbId, setSourceDbId] = useState("all");
  const [queries, setQueries] = useState<Record<EntityTab, string>>(() => makeEntityTabRecord(""));
  const [items, setItems] = useState<YuxiEntity[]>([]);
  const [databases, setDatabases] = useState<YuxiKnowledgeDatabase[]>([]);
  const [authorityFilter, setAuthorityFilter] = useState("all");
  const [entityFilters, setEntityFilters] = useState<Record<string, string>>({});
  const [counts, setCounts] = useState<Record<EntityTab, number>>(() => makeEntityTabRecord(0));
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tab = ENTITY_TABS.find((item) => item.id === activeTab)!;
  const query = queries[activeTab];
  const setQuery = (value: string) => setQueries((prev) => ({ ...prev, [activeTab]: value }));
  const scopeFilters = useMemo(
    () => ({
      businessLine: archiveBizLine === "all" ? null : archiveBizLine,
      category: archiveCategory === "all" ? null : archiveCategory,
      dbId: sourceDbId === "all" ? null : sourceDbId,
    }),
    [archiveBizLine, archiveCategory, sourceDbId],
  );
  const sourceDatabases = useMemo(
    () => databases.filter((database) => {
      if (archiveBizLine !== "all" && database.business_line !== archiveBizLine) return false;
      if (archiveCategory !== "all" && database.category !== archiveCategory) return false;
      return true;
    }),
    [archiveBizLine, archiveCategory, databases],
  );

  const loadDatabases = useCallback(async () => {
    try {
      const result = await listYuxiKnowledgeDatabases();
      setDatabases(result.databases ?? []);
    } catch {
      setDatabases([]);
    }
  }, []);

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
      const [current, ...countResults] = await Promise.all([
        listYuxiEntities({
          type: activeTab as YuxiEntityType,
          query: query.trim() || null,
          businessLine: scopeFilters.businessLine,
          category: scopeFilters.category,
          dbId: scopeFilters.dbId,
          limit: 80,
        }),
        ...ENTITY_TABS.map((item) => listYuxiEntities({
          type: item.id as YuxiEntityType,
          businessLine: scopeFilters.businessLine,
          category: scopeFilters.category,
          dbId: scopeFilters.dbId,
          limit: 1,
        }).catch(() => ({ total: 0, items: [] }))),
      ]);
      const nextItems = current.items ?? [];
      setItems(nextItems);
      setCounts(Object.fromEntries(ENTITY_TABS.map((item, index) => [item.id, countResults[index]?.total ?? 0])) as Record<EntityTab, number>);
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
      setLoading(false);
    }
  }, [activeTab, query, scopeFilters.businessLine, scopeFilters.category, scopeFilters.dbId, selectedId]);

  useEffect(() => {
    void loadEntities();
  }, [loadEntities]);

  useEffect(() => {
    void loadDatabases();
  }, [loadDatabases]);

  useEffect(() => {
    if (sourceDbId === "all") return;
    if (sourceDatabases.some((database) => database.db_id === sourceDbId)) return;
    setSourceDbId("all");
  }, [sourceDatabases, sourceDbId]);

  useEffect(() => {
    void loadDetail(selectedId);
  }, [loadDetail, selectedId]);

  const pendingCount = useMemo(() => items.filter((item) => item.authority_status !== "authoritative").length, [items]);
  const presalesArchiveCount = counts.teacher + counts.course + counts.case + counts.customer;
  const biddingArchiveCount = counts.bid_project + counts.bid_requirement + counts.bid_risk + counts.bid_competitor + counts.bid_template;
  const archiveTabs = useMemo(
    () => ENTITY_TABS.filter((item) => archiveBizLine === "all" || entityTabBusinessLine(item.id) === archiveBizLine),
    [archiveBizLine],
  );
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

  const selectArchiveBusinessLine = useCallback((value: "all" | YuxiBusinessLine) => {
    setArchiveBizLine(value);
    setArchiveCategory("all");
    setSourceDbId("all");
    if (value !== "all" && entityTabBusinessLine(activeTab) !== value) {
      setActiveTab(firstEntityTabForLine(value));
      setAuthorityFilter("all");
      setEntityFilters({});
    }
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
    if (!globalThis.confirm(`确定删除档案「${name}」吗？来源引用也会解除关联。`)) return;
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
  }, [detail, loadEntities, selectedId]);

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
            <div className="hc-kb-filter-label">业务线</div>
            <button
              type="button"
              className="hc-kb-filter-opt"
              data-active={archiveBizLine === "all" ? "true" : undefined}
              onClick={() => selectArchiveBusinessLine("all")}
            >
              <span className="hc-kb-filter-opt-name">全部档案</span>
              <span className="hc-kb-filter-opt-count">{(presalesArchiveCount + biddingArchiveCount).toLocaleString()}</span>
            </button>
            <button
              type="button"
              className="hc-kb-filter-opt"
              data-active={archiveBizLine === "training_presales" ? "true" : undefined}
              onClick={() => selectArchiveBusinessLine("training_presales")}
            >
              <span className="hc-kb-filter-opt-name">售前</span>
              <span className="hc-kb-filter-opt-count">{presalesArchiveCount.toLocaleString()}</span>
            </button>
            <button
              type="button"
              className="hc-kb-filter-opt"
              data-active={archiveBizLine === "bidding" ? "true" : undefined}
              onClick={() => selectArchiveBusinessLine("bidding")}
            >
              <span className="hc-kb-filter-opt-name">投标</span>
              <span className="hc-kb-filter-opt-count">{biddingArchiveCount.toLocaleString()}</span>
            </button>
          </div>

          <div className="hc-kb-filter-section">
            <div className="hc-kb-filter-label">档案分类</div>
            {archiveTabs.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className="hc-kb-filter-opt"
                data-active={activeTab === id ? "true" : undefined}
                onClick={() => {
                  setActiveTab(id);
                  setAuthorityFilter("all");
                  setEntityFilters({});
                  resetSelection();
                }}
              >
                <span className="hc-kb-filter-opt-name">{label}</span>
                <span className="hc-kb-filter-opt-count">{counts[id].toLocaleString()}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="hc-kb-results-area">
          <div className="hc-kb-archive-content">
            <div className="hc-kb-archive-main-head">
              <div>
                <div className="hc-kb-archive-title-row">
                  <h2>{tab.label}档案</h2>
                  <span>{visibleItems.length.toLocaleString()} 条</span>
                </div>
                <p>
                  {yuxiBusinessLineLabel(entityTabBusinessLine(activeTab))} · {scopeSummaryLabel(archiveBizLine, archiveCategory, sourceDbId, sourceDatabases)}
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
                  <div className="hc-kb-empty-subtitle">资料上传并提取档案后，会出现在当前分类下。</div>
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
    </KbPageShell>
  );
}

function makeEntityTabRecord<T>(value: T): Record<EntityTab, T> {
  return Object.fromEntries(ENTITY_TABS.map((item) => [item.id, value])) as Record<EntityTab, T>;
}

function entityTabBusinessLine(tab: EntityTab): YuxiBusinessLine {
  return tab.startsWith("bid_") ? "bidding" : "training_presales";
}

function firstEntityTabForLine(line: YuxiBusinessLine): EntityTab {
  return line === "bidding" ? "bid_project" : "teacher";
}

function scopeSummaryLabel(
  businessLine: "all" | YuxiBusinessLine,
  category: string,
  dbId: string,
  databases: YuxiKnowledgeDatabase[],
): string {
  if (dbId !== "all") {
    const database = databases.find((item) => item.db_id === dbId);
    return database?.name || dbId;
  }
  if (category !== "all") {
    return yuxiCategoryMeta(category)?.label || category;
  }
  if (businessLine !== "all") {
    return `${yuxiBusinessLineLabel(businessLine)}档案`;
  }
  return "全部档案";
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
