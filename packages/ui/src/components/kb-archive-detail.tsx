import { useState } from "react";
import {
  getYuxiKnowledgeDocumentDetail,
  type YuxiEntityAttributeDiff,
  type YuxiEntityDetail,
  type YuxiEntityHistoryEntry,
  type YuxiEntityReference,
  type YuxiEntityRelatedResponse,
  type YuxiKnowledgeDocumentDetail,
  type YuxiRelatedEntity,
  yuxiEntityTypeLabel,
} from "../lib/yuxi-client";
import {
  AUTHORITY_LABEL,
  attributeEntries,
  authorityClass,
  businessFieldLabel,
  formatEntityDate,
  referenceSubtitle,
  referenceTitle,
} from "./kb-archive-model";

export function EntityDetailPanel({
  detail,
  loading,
  error,
  authorityBusy,
  mutationBusy,
  related,
  relatedLoading,
  history,
  historyLoading,
  attributeDraft,
  attributeDiffs,
  attributeBusy,
  attributeError,
  onAttributeDraftChange,
  onPreviewAttributeDiff,
  onApplyAttributeDiff,
  onChangeAuthority,
  onEdit,
  onDelete,
  onMerge,
  onRefreshMetrics,
}: {
  detail: YuxiEntityDetail | null;
  loading: boolean;
  error: string | null;
  authorityBusy: boolean;
  mutationBusy: boolean;
  related: YuxiEntityRelatedResponse | null;
  relatedLoading: boolean;
  history: YuxiEntityHistoryEntry[];
  historyLoading: boolean;
  attributeDraft: string;
  attributeDiffs: YuxiEntityAttributeDiff[];
  attributeBusy: boolean;
  attributeError: string | null;
  onAttributeDraftChange: (value: string) => void;
  onPreviewAttributeDiff: () => void;
  onApplyAttributeDiff: () => void;
  onChangeAuthority: (status: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onMerge: () => void;
  onRefreshMetrics: () => void;
}) {
  const [sourcePreviewKey, setSourcePreviewKey] = useState<string | null>(null);
  const [sourcePreview, setSourcePreview] = useState<YuxiKnowledgeDocumentDetail | null>(null);
  const [sourcePreviewLoading, setSourcePreviewLoading] = useState(false);
  const [sourcePreviewError, setSourcePreviewError] = useState<string | null>(null);

  const openSourcePreview = async (ref: YuxiEntityReference) => {
    const key = referenceKey(ref);
    setSourcePreviewKey(key);
    setSourcePreview(null);
    setSourcePreviewError(null);
    if (!ref.db_id || !ref.file_id) {
      setSourcePreviewError("这条来源信息不完整，不能定位原文。");
      return;
    }
    setSourcePreviewLoading(true);
    try {
      const result = await getYuxiKnowledgeDocumentDetail({
        db_id: ref.db_id,
        file_id: ref.file_id,
        filename: ref.file_meta?.filename ?? ref.file_id,
      });
      setSourcePreview(result);
    } catch (err) {
      setSourcePreviewError(err instanceof Error ? err.message : String(err));
    } finally {
      setSourcePreviewLoading(false);
    }
  };

  if (loading) {
    return (
      <aside className="hc-kb-entity-detail">
        <div className="hc-kb-empty">
          <div className="hc-kb-empty-content">
            <div className="hc-kb-empty-title">正在读取档案</div>
            <div className="hc-kb-empty-subtitle">加载状态、基础信息和来源资料。</div>
          </div>
        </div>
      </aside>
    );
  }
  if (error) {
    return (
      <aside className="hc-kb-entity-detail">
        <div className="hc-kb-inline-alert" data-tone="danger">{error}</div>
      </aside>
    );
  }
  if (!detail) {
    return (
      <aside className="hc-kb-entity-detail">
        <div className="hc-kb-empty">
          <div className="hc-kb-empty-content">
            <div className="hc-kb-empty-title">选择一个档案</div>
            <div className="hc-kb-empty-subtitle">这里会展示来源资料、相关档案和当前确认状态。</div>
          </div>
        </div>
      </aside>
    );
  }

  const attrs = attributeEntries(detail.attributes).slice(0, 8);
  const metrics = attributeEntries(detail.metrics);
  const references = detail.references ?? [];
  const relatedTotal = related?.related ? relatedCount(related.related) : 0;
  return (
    <aside className="hc-kb-entity-detail">
      <div className="hc-kb-entity-detail-head">
        <div>
          <div className="hc-kb-section-title">{detail.canonical_name || `未命名档案 #${detail.id ?? "-"}`}</div>
          <div className="hc-kb-section-subtitle">
            {yuxiEntityTypeLabel(detail.entity_type)}
            {detail.aliases && detail.aliases.length > 0 ? ` · 别名：${detail.aliases.join(" / ")}` : ""}
          </div>
        </div>
        <span className={`hc-kb-status ${authorityClass(detail.authority_status)}`}>
          {AUTHORITY_LABEL[detail.authority_status || ""] || detail.authority_status || "未确认"}
        </span>
      </div>

      <div className="hc-kb-entity-trust-row">
        <div>
          <span>状态</span>
          <strong>{AUTHORITY_LABEL[detail.authority_status || ""] || detail.authority_status || "未确认"}</strong>
        </div>
        <div>
          <span>来源资料</span>
          <strong>{references.length} 份</strong>
        </div>
        <div>
          <span>关联档案</span>
          <strong>{relatedLoading ? "读取中" : `${relatedTotal} 个`}</strong>
        </div>
        <div>
          <span>最近更新</span>
          <strong>{formatEntityDate(detail.updated_at)}</strong>
        </div>
      </div>

      <div className="hc-kb-entity-detail-actions">
        <button
          type="button"
          className="hc-kb-topbar-btn hc-kb-topbar-btn--primary"
          disabled={authorityBusy || detail.authority_status === "authoritative"}
          onClick={() => onChangeAuthority("authoritative")}
        >
          确认可用
        </button>
        <button
          type="button"
          className="hc-kb-topbar-btn"
          disabled={authorityBusy || detail.authority_status === "candidate"}
          onClick={() => onChangeAuthority("candidate")}
        >
          退回待核对
        </button>
        <button type="button" className="hc-kb-topbar-btn" disabled={mutationBusy} onClick={onEdit}>
          编辑信息
        </button>
      </div>

      {detail.description && (
        <section className="hc-kb-entity-detail-block">
          <strong>档案摘要</strong>
          <p>{detail.description}</p>
        </section>
      )}

      <section className="hc-kb-entity-detail-block">
        <strong>这条档案记录了什么</strong>
        {attrs.length === 0 ? (
          <p>暂无补充信息。</p>
        ) : (
          <div className="hc-kb-entity-kv">
            {attrs.map(([key, value]) => (
              <div key={key}><span>{key}</span><strong>{value}</strong></div>
            ))}
          </div>
        )}
      </section>

      <section className="hc-kb-entity-detail-block">
        <strong>来源依据</strong>
        {references.length === 0 ? (
          <p>暂无来源资料，后续上传并确认关联后会出现在这里。</p>
        ) : (
          <div className="hc-kb-reference-list">
            {references.map((ref) => (
              <article key={referenceKey(ref)} className="hc-kb-reference-item">
                <div className="hc-kb-reference-main">
                  <div className="hc-kb-reference-title">{referenceTitle(ref)}</div>
                  <div className="hc-kb-file-meta">{referenceSubtitle(ref)} · {formatEntityDate(ref.created_at)}</div>
                  {typeof ref.confidence === "number" && (
                    <div className="hc-kb-reference-score">可信度 {Math.round(ref.confidence * 100)}%</div>
                  )}
                  {ref.extracted_text && <p><b>提取依据：</b>{ref.extracted_text}</p>}
                </div>
                <button
                  type="button"
                  className="hc-kb-topbar-btn"
                  disabled={!ref.db_id || !ref.file_id || sourcePreviewLoading}
                  onClick={() => void openSourcePreview(ref)}
                >
                  查看原文
                </button>
              </article>
            ))}
          </div>
        )}
        {(sourcePreviewKey || sourcePreviewError) && (
          <SourcePreview
            reference={references.find((ref) => referenceKey(ref) === sourcePreviewKey) ?? null}
            detail={sourcePreview}
            loading={sourcePreviewLoading}
            error={sourcePreviewError}
          />
        )}
      </section>

      <section className="hc-kb-entity-detail-block">
        <strong>相关档案</strong>
        {relatedLoading ? (
          <p>正在读取相关档案。</p>
        ) : related && related.related && relatedCount(related.related) > 0 ? (
          <div className="hc-kb-related-list">
            {Object.entries(related.related).map(([type, items]) => (
              <div key={type} className="hc-kb-related-group">
                <span>{yuxiEntityTypeLabel(type)}</span>
                <div className="hc-kb-tags">
                  {items.map((item) => <RelatedChip key={`${type}:${item.id}`} item={item} />)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p>暂无相关讲师、课程、客户或案例。</p>
        )}
      </section>

      <details className="hc-kb-entity-detail-block hc-kb-entity-advanced">
        <summary>管理员维护</summary>
        <div className="hc-kb-entity-advanced-body">
          <div className="hc-kb-entity-advanced-actions">
            <button type="button" className="hc-kb-topbar-btn" disabled={mutationBusy} onClick={onMerge}>
              合并档案
            </button>
            <button
              type="button"
              className="hc-kb-topbar-btn"
              disabled={authorityBusy || detail.authority_status === "stale"}
              onClick={() => onChangeAuthority("stale")}
            >
              标记过期
            </button>
            <button type="button" className="hc-kb-topbar-btn" disabled={mutationBusy} onClick={onRefreshMetrics}>
              刷新引用
            </button>
            <button type="button" className="hc-kb-topbar-btn hc-kb-topbar-btn--danger" disabled={mutationBusy} onClick={onDelete}>
              删除档案
            </button>
          </div>
          <section className="hc-kb-entity-advanced-section">
            <strong>维护记录</strong>
            {historyLoading ? (
              <p>正在读取记录。</p>
            ) : history.length === 0 ? (
              <p>暂无变更记录。</p>
            ) : (
              <div className="hc-kb-history-list">
                {history.slice(0, 5).map((entry) => (
                  <div key={entry.id ?? `${entry.field}:${entry.created_at}`} className="hc-kb-history-row">
                    <div>
                      <strong>{businessFieldLabel(entry.field) || entry.change_type || "信息更新"}</strong>
                      <span>{formatEntityDate(entry.created_at)}{entry.reason ? ` · ${entry.reason}` : ""}</span>
                    </div>
                    <em>{formatChangeValue(entry.new_value)}</em>
                  </div>
                ))}
              </div>
            )}
          </section>
          {metrics.length > 0 && (
            <div className="hc-kb-entity-kv">
              {metrics.map(([key, value]) => (
                <div key={key}><span>{key}</span><strong>{value}</strong></div>
              ))}
            </div>
          )}
          <details className="hc-kb-attr-update hc-kb-entity-advanced-fields">
            <summary>批量补充信息</summary>
            <textarea
              value={attributeDraft}
              placeholder='按结构化格式填写，如 {"报价": "3 万/天", "专长": ["领导力", "金融"]}'
              onChange={(event) => onAttributeDraftChange(event.target.value)}
            />
            <div className="hc-kb-form-actions">
              <button type="button" className="hc-kb-topbar-btn" disabled={attributeBusy || !attributeDraft.trim()} onClick={onPreviewAttributeDiff}>
                {attributeBusy ? "比对中" : "预览变化"}
              </button>
              <button type="button" className="hc-kb-topbar-btn hc-kb-topbar-btn--primary" disabled={attributeBusy || attributeDiffs.length === 0} onClick={onApplyAttributeDiff}>
                保存补充信息
              </button>
            </div>
            {attributeError && <div className="hc-kb-inline-alert" data-tone="danger">{attributeError}</div>}
            {attributeDiffs.length > 0 && (
              <div className="hc-kb-attr-diff-list">
                {attributeDiffs.map((diff) => (
                  <div key={diff.field ?? `${diff.change}:${formatChangeValue(diff.new)}`} className="hc-kb-attr-diff-row">
                    <span>{diff.change === "added" ? "新增" : "修改"}</span>
                    <strong>{businessFieldLabel(diff.field)}</strong>
                    <em>{formatChangeValue(diff.old) || "空"}{" -> "}{formatChangeValue(diff.new) || "空"}</em>
                  </div>
                ))}
              </div>
            )}
          </details>
        </div>
      </details>
    </aside>
  );
}

function SourcePreview({
  reference,
  detail,
  loading,
  error,
}: {
  reference: YuxiEntityReference | null;
  detail: YuxiKnowledgeDocumentDetail | null;
  loading: boolean;
  error: string | null;
}) {
  const chunk = reference && detail ? findReferenceChunk(detail, reference) : "";
  return (
    <div className="hc-kb-reference-preview">
      <div className="hc-kb-reference-preview-head">
        <strong>原文定位</strong>
        {reference && <span>{referenceSubtitle(reference)}</span>}
      </div>
      {loading ? (
        <p>正在读取来源文件。</p>
      ) : error ? (
        <p data-tone="danger">{error}</p>
      ) : chunk ? (
        <p>{chunk}</p>
      ) : (
        <p>已读取来源文件，但没有命中对应片段。</p>
      )}
    </div>
  );
}

function RelatedChip({ item }: { item: YuxiRelatedEntity }) {
  const label = item.canonical_name || `未命名档案 #${item.id ?? "-"}`;
  const count = typeof item.co_occurrence === "number" ? ` · 一起出现 ${item.co_occurrence} 次` : "";
  return <span className="hc-kb-tag" title={`${label}${count}`}>{label}{count}</span>;
}

function relatedCount(value: Record<string, YuxiRelatedEntity[]>): number {
  return Object.values(value).reduce((sum, items) => sum + items.length, 0);
}

function formatChangeValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return businessTextValue(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(formatChangeValue).filter(Boolean).join(" / ");
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, raw]) => `${businessFieldLabel(key)}：${formatChangeValue(raw)}`)
      .filter((item) => !item.endsWith("："))
      .slice(0, 4)
      .join(" / ");
  }
  return String(value);
}

function businessTextValue(value: string): string {
  const map: Record<string, string> = {
    active: "活跃",
    inactive: "停用",
    authoritative: "已确认",
    candidate: "待核对",
    stale: "已过期",
    unconfirmed: "未确认",
  };
  return map[value.toLowerCase()] || value;
}

function referenceKey(ref: YuxiEntityReference): string {
  return `${ref.db_id ?? ""}:${ref.file_id ?? ""}:${ref.chunk_id ?? ""}:${ref.created_at ?? ""}`;
}

function findReferenceChunk(detail: YuxiKnowledgeDocumentDetail, ref: YuxiEntityReference): string {
  const chunks = detail.lines ?? [];
  const byId = chunks.find((chunk) => {
    if (!ref.chunk_id) return false;
    return chunk.id === ref.chunk_id || chunk.chunk_id === ref.chunk_id;
  });
  if (byId?.content) return trimReferenceText(byId.content);
  const needle = ref.extracted_text?.replace(/\s+/g, " ").trim();
  if (needle) {
    const byText = chunks.find((chunk) => typeof chunk.content === "string" && chunk.content.replace(/\s+/g, " ").includes(needle.slice(0, 80)));
    if (byText?.content) return trimReferenceText(byText.content);
    return trimReferenceText(needle);
  }
  return "";
}

function trimReferenceText(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 900 ? `${compact.slice(0, 900)}...` : compact;
}
