import { Download, FileSearch, FileText, FolderOpen, Sparkles, Trash2 } from "lucide-react";
import { type ReactNode } from "react";
import {
  yuxiBusinessLineLabel,
  yuxiEntityTypeLabel,
  yuxiLibraryGovernance,
  type YuxiCategoryMeta,
  type YuxiFileAnalysisEntity,
  type YuxiFileAnalysisResponse,
  type YuxiKnowledgeDatabase,
  type YuxiKnowledgeDocumentDetail,
} from "../lib/yuxi-client";
import { type FileRow } from "./kb-library-model";

export function KbLibraryDetailPanel({
  file,
  detail,
  analysis,
  analysisLoading,
  analysisError,
  hydeQuestions,
  hydeLoading,
  hydeError,
  loading,
  error,
  selectedCategory,
  selectedDatabase,
  highlightChunkId,
  highlightQuery,
  onDownload,
  onDelete,
  onAnalyze,
  onGenerateQuestions,
}: {
  file: FileRow | null;
  detail: YuxiKnowledgeDocumentDetail | null;
  analysis: YuxiFileAnalysisResponse | null;
  analysisLoading: boolean;
  analysisError: string | null;
  hydeQuestions: string[];
  hydeLoading: boolean;
  hydeError: string | null;
  loading: boolean;
  error: string | null;
  selectedCategory: YuxiCategoryMeta | null;
  selectedDatabase: YuxiKnowledgeDatabase | null;
  highlightChunkId?: string | null;
  highlightQuery?: string | null;
  onDownload: (file: FileRow) => void;
  onDelete: (file: FileRow) => void;
  onAnalyze: (file: FileRow) => void;
  onGenerateQuestions: (file: FileRow) => void;
}) {
  if (!file) {
    return (
      <LibraryProfilePanel
        selectedCategory={selectedCategory}
        selectedDatabase={selectedDatabase}
      />
    );
  }

  const meta = detail?.meta ?? {};
  const chunks = detail?.lines ?? [];
  const contentPreview = typeof detail?.content === "string" ? detail.content : "";
  const fileStatus = stringValue(meta.status) || file.raw.status || "未记录";

  // 阅读视图：优先用带 chunk_id 的解析分段（便于命中段定位高亮），没有再退回完整正文按空行分段。
  const readingBlocks = (chunks.length > 0
    ? chunks.map((chunk) => ({
        chunkId: typeof chunk.chunk_id === "string" ? chunk.chunk_id : null,
        text: (typeof chunk.content === "string" ? chunk.content : "").trim(),
      }))
    : contentPreview.split(/\n{2,}/).map((text) => ({ chunkId: null as string | null, text: text.trim() }))
  ).filter((block) => block.text);
  const readingPreview = readingBlocks.slice(0, 60);
  const readingMore = readingBlocks.length - readingPreview.length;

  return (
    <aside className="hc-kb-detail-panel" aria-label="资料详情">
      <div className="hc-kb-detail-head">
        <div className="hc-kb-detail-title-wrap">
          <FileText size={15} strokeWidth={2.2} aria-hidden="true" />
          <div>
            <div className="hc-kb-detail-title" title={file.name}>{file.name}</div>
            <div className="hc-kb-detail-subtitle">{file.source}</div>
          </div>
        </div>
        <div className="hc-kb-detail-actions">
          <button type="button" className="hc-kb-row-btn" title="提炼摘要与档案" aria-label={`提炼 ${file.name}`} onClick={() => onAnalyze(file)}>
            <Sparkles size={13} strokeWidth={2.2} aria-hidden="true" />
          </button>
          <button type="button" className="hc-kb-row-btn" title="生成可问问题" aria-label={`生成 ${file.name} 的可问问题`} onClick={() => onGenerateQuestions(file)}>
            <FileSearch size={13} strokeWidth={2.2} aria-hidden="true" />
          </button>
          <button type="button" className="hc-kb-row-btn" title="下载原文件" aria-label={`下载 ${file.name}`} onClick={() => onDownload(file)}>
            <Download size={13} strokeWidth={2.2} aria-hidden="true" />
          </button>
          <button type="button" className="hc-kb-row-btn" title="删除资料" aria-label={`删除 ${file.name}`} onClick={() => onDelete(file)}>
            <Trash2 size={13} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
      </div>

      {error && <div className="hc-kb-detail-alert">{error}</div>}
      {analysisError && <div className="hc-kb-detail-alert">{analysisError}</div>}
      {hydeError && <div className="hc-kb-detail-alert">{hydeError}</div>}

      <DetailBlock title="资料信息">
        <div className="hc-kb-detail-kv">
          <Kv label="状态" value={statusLabel(fileStatus)} />
          <Kv label="业务线" value={yuxiBusinessLineLabel(file.raw.business_line)} />
          <Kv label="资料范围" value={selectedCategory?.label ?? file.raw.category ?? "未分类"} />
          <Kv label="文件大小" value={formatBytes(file.raw.file_size)} />
          <Kv label="上传时间" value={file.date} />
        </div>
      </DetailBlock>

      <DetailBlock title="提炼结果">
        <div className="hc-kb-analysis-actions">
          <button type="button" className="hc-kb-topbar-btn" onClick={() => onAnalyze(file)} disabled={analysisLoading}>
            <Sparkles size={13} strokeWidth={2.2} aria-hidden="true" />
            {analysisLoading ? "提炼中" : analysis ? "重新提炼" : "提炼摘要与档案"}
          </button>
          <button type="button" className="hc-kb-topbar-btn" onClick={() => onGenerateQuestions(file)} disabled={hydeLoading}>
            <FileSearch size={13} strokeWidth={2.2} aria-hidden="true" />
            {hydeLoading ? "生成中" : hydeQuestions.length > 0 ? "重新生成问题" : "生成可问问题"}
          </button>
        </div>
        {analysisLoading ? (
          <div className="hc-kb-detail-muted">正在从资料内容里提炼摘要、标签、风险和可关联档案。</div>
        ) : analysis ? (
          <DocumentAnalysisView analysis={analysis} />
        ) : (
          <div className="hc-kb-detail-muted">点击提炼后，可以看到这份资料抽出了哪些业务信息和档案关系。</div>
        )}
        {hydeQuestions.length > 0 && (
          <div className="hc-kb-hyde-list">
            <div className="hc-kb-chunk-title">这份资料可回答的问题</div>
            <div className="hc-kb-tags">
              {hydeQuestions.map((question) => (
                <span key={question} className="hc-kb-tag">{question}</span>
              ))}
            </div>
          </div>
        )}
      </DetailBlock>

      <DetailBlock title="入库文本预览">
        <div className="hc-kb-ingested-preview-note">
          <span>系统解析后的可搜索文本，不是原始文件版式。</span>
          <button type="button" className="hc-kb-inline-link" onClick={() => onDownload(file)}>
            <Download size={12} strokeWidth={2.2} aria-hidden="true" />
            原文件
          </button>
        </div>
        {loading ? (
          <div className="hc-kb-detail-muted">正在读取内容</div>
        ) : readingPreview.length > 0 ? (
          <div className="hc-kb-doc-reading">
            {readingPreview.map((block, index) => {
              const hit = highlightChunkId != null && block.chunkId === highlightChunkId;
              return (
                <p
                  key={block.chunkId ?? index}
                  ref={hit ? scrollHitIntoView : undefined}
                  data-hit={hit ? "true" : undefined}
                >
                  {renderWithQuery(block.text, highlightQuery)}
                </p>
              );
            })}
            {readingMore > 0 && (
              <div className="hc-kb-detail-muted">还有 {readingMore} 段，下载原文件查看完整内容。</div>
            )}
          </div>
        ) : (
          <div className="hc-kb-detail-muted">暂无可预览的内容</div>
        )}
      </DetailBlock>
    </aside>
  );
}

/** 命中段的稳定 ref 回调：节点挂载时把它居中滚入视图。模块级保证 ref 身份稳定、只触发一次。 */
function scrollHitIntoView(node: HTMLParagraphElement | null) {
  if (node) node.scrollIntoView({ block: "center" });
}

/** 在正文里把命中的关键词高亮（语义命中时关键词不一定出现，出现则加亮）。 */
function renderWithQuery(text: string, query: string | null | undefined): ReactNode {
  const q = (query ?? "").trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const lowerQ = q.toLowerCase();
  if (!lower.includes(lowerQ)) return text;
  const parts: ReactNode[] = [];
  let from = 0;
  let at = lower.indexOf(lowerQ, from);
  let key = 0;
  while (at !== -1) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(<mark key={key++} className="hc-kb-doc-mark">{text.slice(at, at + q.length)}</mark>);
    from = at + q.length;
    at = lower.indexOf(lowerQ, from);
  }
  if (from < text.length) parts.push(text.slice(from));
  return parts;
}

function LibraryProfilePanel({
  selectedCategory,
  selectedDatabase,
}: {
  selectedCategory: YuxiCategoryMeta | null;
  selectedDatabase: YuxiKnowledgeDatabase | null;
}) {
  const governance = yuxiLibraryGovernance(selectedCategory?.key);
  return (
    <aside className="hc-kb-detail-panel" aria-label="当前知识库">
      <div className="hc-kb-detail-head">
        <div className="hc-kb-detail-title-wrap">
          <FolderOpen size={15} strokeWidth={2.2} aria-hidden="true" />
          <div>
            <div className="hc-kb-detail-title">{selectedCategory?.label ?? "全部知识库"}</div>
            <div className="hc-kb-detail-subtitle">{selectedCategory?.description ?? "左侧选择知识库后管理资料"}</div>
          </div>
        </div>
      </div>
      {selectedCategory && (
        <DetailBlock title="当前知识库">
          {selectedDatabase ? (
            <>
              <div className="hc-kb-detail-kv">
                <Kv label="知识库" value={selectedCategory.label} />
                <Kv label="资料数" value={String(selectedDatabase.file_count ?? selectedDatabase.row_count ?? 0)} />
                <Kv label="状态" value={selectedDatabase.status || "可用"} />
                <Kv label="入库流程" value={selectedDatabase.db_id ? "已准备" : "未准备"} />
              </div>
            </>
          ) : (
            <div className="hc-kb-storage-empty">
              <span>首次上传时自动初始化</span>
            </div>
          )}
        </DetailBlock>
      )}
      {governance ? (
        <>
          <DetailBlock title="库设置">
            <div className="hc-kb-detail-kv">
              <Kv label="负责人" value={governance.ownerRole} />
              <Kv label="更新方式" value={governance.updateRule} />
              <Kv label="权威口径" value={governance.authorityRule} />
              <Kv label="引用范围" value={governance.citationScope} />
            </div>
          </DetailBlock>
        </>
      ) : (
        <DetailBlock title="管理方式">
          <div className="hc-kb-detail-muted">知识库按左侧分组独立上传、独立检索、独立维护。</div>
        </DetailBlock>
      )}
    </aside>
  );
}

function DocumentAnalysisView({ analysis }: { analysis: YuxiFileAnalysisResponse }) {
  const tags = analysis.tags ?? [];
  const risks = analysis.risks ?? [];
  const entities = analysis.entities ?? [];
  return (
    <div className="hc-kb-analysis">
      {analysis.summary ? (
        <p className="hc-kb-analysis-summary">{analysis.summary}</p>
      ) : (
        <div className="hc-kb-detail-muted">系统没有返回摘要。</div>
      )}
      {tags.length > 0 && (
        <div>
          <div className="hc-kb-chunk-title">标签</div>
          <div className="hc-kb-tags">
            {tags.slice(0, 12).map((tag, index) => (
              <span key={`${tag.group ?? "tag"}:${tag.name ?? index}`} className="hc-kb-tag">
                {[tag.group, tag.name].filter(Boolean).join(" / ")}
              </span>
            ))}
          </div>
        </div>
      )}
      {risks.length > 0 && (
        <div>
          <div className="hc-kb-chunk-title">风险与缺口</div>
          <div className="hc-kb-risk-list">
            {risks.slice(0, 6).map((risk) => <span key={risk}>{risk}</span>)}
          </div>
        </div>
      )}
      {entities.length > 0 ? (
        <div>
          <div className="hc-kb-chunk-title">识别出的档案</div>
          <div className="hc-kb-extracted-entities">
            {entities.slice(0, 8).map((entity, index) => (
              <ExtractedEntityRow key={`${entity.entity_type ?? "entity"}:${entity.canonical_name ?? index}`} entity={entity} />
            ))}
          </div>
        </div>
      ) : (
        <div className="hc-kb-detail-muted">暂未识别出可关联档案。</div>
      )}
    </div>
  );
}

function ExtractedEntityRow({ entity }: { entity: YuxiFileAnalysisEntity }) {
  const confidence = typeof entity.confidence === "number" ? `${Math.round(entity.confidence * 100)}%` : "";
  return (
    <div className="hc-kb-extracted-entity">
      <div className="hc-kb-extracted-entity-head">
        <span className="hc-kb-tag">{yuxiEntityTypeLabel(entity.entity_type)}</span>
        <strong>{entity.canonical_name || "未命名档案"}</strong>
        {confidence && <em>{confidence}</em>}
      </div>
      {entity.aliases && entity.aliases.length > 0 && (
        <div className="hc-kb-file-meta">别名：{entity.aliases.slice(0, 4).join(" / ")}</div>
      )}
      {entity.extracted_text && <p>{trimPreview(entity.extracted_text, 160)}</p>}
    </div>
  );
}

function DetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="hc-kb-detail-block">
      <strong>{title}</strong>
      {children}
    </section>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong title={value}>{value}</strong>
    </div>
  );
}

function statusLabel(value: string): string {
  if (value === "indexed" || value === "done" || value === "completed" || value === "success") return "已入库可搜索";
  if (value === "parsed") return "已解析";
  if (value === "uploaded") return "已上传";
  if (value === "failed" || value === "error") return "失败";
  return value;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function trimPreview(value: string, maxLength = 520): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact;
}

function formatBytes(value: number | null | undefined): string {
  if (!value || value <= 0) return "未记录";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
