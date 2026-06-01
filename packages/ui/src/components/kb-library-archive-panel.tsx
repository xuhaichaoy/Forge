import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, RefreshCw } from "lucide-react";
import {
  listYuxiEntities,
  type YuxiCategoryMeta,
  type YuxiEntity,
  type YuxiKnowledgeDatabase,
  yuxiBusinessLineLabel,
  yuxiEntityTypeLabel,
} from "../lib/yuxi-client";
import {
  AUTHORITY_LABEL,
  authorityClass,
  entityTags,
  formatEntityDate,
} from "./kb-archive-model";

export function KbLibraryArchivePanel({
  selectedCategory,
  selectedDatabase,
}: {
  selectedCategory: YuxiCategoryMeta | null;
  selectedDatabase: YuxiKnowledgeDatabase | null;
}) {
  const [items, setItems] = useState<YuxiEntity[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEntities = useCallback(async () => {
    if (!selectedCategory) {
      setItems([]);
      setTotal(0);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await listYuxiEntities({
        dbId: selectedDatabase?.db_id ?? null,
        category: selectedCategory.key,
        businessLine: selectedCategory.line,
        limit: 100,
      });
      setItems(result.items ?? []);
      setTotal(result.total ?? result.items?.length ?? 0);
    } catch (err) {
      setItems([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, selectedDatabase?.db_id]);

  useEffect(() => {
    void loadEntities();
  }, [loadEntities]);

  const referenceTotal = useMemo(
    () => items.reduce((sum, item) => sum + (item.reference_count ?? 0), 0),
    [items],
  );
  const typeSummary = useMemo(() => summarizeEntityTypes(items), [items]);
  const needsReview = useMemo(
    () => items.filter((item) => item.authority_status !== "authoritative").length,
    [items],
  );

  if (!selectedCategory) {
    return (
      <section className="hc-kb-management-panel" aria-label="档案关联">
        <div className="hc-kb-empty">
          <div className="hc-kb-empty-content">
            <div className="hc-kb-empty-title">先在左侧选择知识库</div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="hc-kb-management-panel" aria-label="档案关联">
      <div className="hc-kb-panel-head">
        <div>
          <div className="hc-kb-section-title">{selectedCategory.label} · 档案关联</div>
          <div className="hc-kb-section-subtitle">
            {yuxiBusinessLineLabel(selectedCategory.line)} · 上传资料提取出的业务档案和来源依据
          </div>
        </div>
        <button type="button" className="hc-kb-topbar-btn" onClick={() => void loadEntities()} disabled={loading}>
          <RefreshCw size={13} strokeWidth={2.2} aria-hidden="true" />
          {loading ? "刷新中" : "刷新"}
        </button>
      </div>

      {error && <div className="hc-kb-inline-alert" data-tone="danger">{error}</div>}

      <div className="hc-kb-metric-strip">
        <Metric label="关联档案" value={String(total)} />
        <Metric label="来源资料" value={String(referenceTotal)} />
        <Metric label="待完善" value={String(needsReview)} />
        <Metric label="档案类型" value={String(typeSummary.length)} />
      </div>

      <div className="hc-kb-table-wrap">
        {items.length === 0 ? (
          <div className="hc-kb-empty">
            <div className="hc-kb-empty-content">
              <div className="hc-kb-empty-title">{loading ? "正在读取档案关联" : "暂无档案关联"}</div>
              <div className="hc-kb-empty-subtitle">上传资料后，讲师、课程、客户、案例等业务档案会在这里按当前知识库归集。</div>
            </div>
          </div>
        ) : (
          <table className="hc-kb-table">
            <thead>
              <tr>
                <th style={{ width: "28%" }}>档案</th>
                <th style={{ width: "14%" }}>类型</th>
                <th>来源依据</th>
                <th style={{ width: "12%" }}>状态</th>
                <th style={{ width: "14%" }}>更新时间</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id ?? item.canonical_name}>
                  <td>
                    <div className="hc-kb-file-name">{item.canonical_name || "未命名档案"}</div>
                    <div className="hc-kb-tags">
                      {entityTags(item).slice(0, 3).map((tag) => <span key={tag} className="hc-kb-tag">{tag}</span>)}
                    </div>
                  </td>
                  <td>{yuxiEntityTypeLabel(item.entity_type)}</td>
                  <td style={{ fontSize: 12, color: "var(--hc-text-secondary)" }}>
                    {(item.reference_count ?? 0) > 0 ? `${item.reference_count} 处资料引用` : "暂无来源引用"}
                  </td>
                  <td>
                    <span className={`hc-kb-status ${authorityClass(item.authority_status)}`}>
                      {AUTHORITY_LABEL[item.authority_status ?? ""] ?? "待完善"}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--hc-text-secondary)" }}>{formatEntityDate(item.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="hc-kb-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function summarizeEntityTypes(items: YuxiEntity[]): string[] {
  return [...new Set(items.map((item) => item.entity_type).filter((value): value is string => typeof value === "string" && value.length > 0))];
}
