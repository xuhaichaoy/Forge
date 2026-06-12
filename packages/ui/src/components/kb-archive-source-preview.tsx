import { useState } from "react";
import {
  getYuxiKnowledgeDocumentDetail,
  type YuxiEntityReference,
  type YuxiKnowledgeDocumentDetail,
} from "../lib/yuxi-client";
import {
  formatEntityDate,
  referenceSubtitle,
  referenceTitle,
} from "./kb-archive-model";

export function EntitySourceReferences({
  references,
}: {
  references: YuxiEntityReference[];
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

  return (
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
