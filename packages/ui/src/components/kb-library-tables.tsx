import { RefreshCw } from "lucide-react";
import {
  yuxiBusinessLineLabel,
  yuxiCategoryMeta,
  type YuxiSearchGroup,
  type YuxiSearchSnippet,
} from "../lib/yuxi-client";
import {
  LibraryDocumentRow,
  LibraryDocumentsEmptyState,
} from "./kb-library-document-table-parts";
import { summarizeSearchResult, type FileRow } from "./kb-library-model";

export function LibraryDocumentsTable({
  rows,
  loading,
  selectedRowId,
  checkedRowIds,
  onSelect,
  onToggleChecked,
  onToggleAll,
  onDownload,
  onParse,
  onIndex,
  onMove,
  onDelete,
  emptyTitle,
  emptySubtitle,
  emptyActionLabel,
  onEmptyAction,
}: {
  rows: FileRow[];
  loading: boolean;
  selectedRowId?: string | null;
  checkedRowIds?: ReadonlySet<string>;
  onSelect: (file: FileRow) => void;
  onToggleChecked?: (file: FileRow, checked: boolean) => void;
  onToggleAll?: (checked: boolean) => void;
  onDownload: (file: FileRow) => void;
  onParse?: (file: FileRow) => void;
  onIndex?: (file: FileRow) => void;
  onMove?: (file: FileRow) => void;
  onDelete: (file: FileRow) => void;
  emptyTitle?: string;
  emptySubtitle?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
}) {
  if (rows.length === 0) {
    return (
      <LibraryDocumentsEmptyState
        loading={loading}
        emptyTitle={emptyTitle}
        emptySubtitle={emptySubtitle}
        emptyActionLabel={emptyActionLabel}
        onEmptyAction={onEmptyAction}
      />
    );
  }
  const checkableRows = rows.filter((file) => file.raw.db_id && file.raw.file_id);
  const checkedCount = checkableRows.filter((file) => checkedRowIds?.has(file.id)).length;
  const allChecked = checkableRows.length > 0 && checkedCount === checkableRows.length;
  const partiallyChecked = checkedCount > 0 && checkedCount < checkableRows.length;
  return (
    <table className="hc-kb-table">
      <thead>
        <tr>
          <th style={{ width: 34 }}>
            <input
              type="checkbox"
              className="hc-kb-table-checkbox"
              checked={allChecked}
              ref={(node) => {
                if (node) node.indeterminate = partiallyChecked;
              }}
              onChange={(event) => onToggleAll?.(event.currentTarget.checked)}
              aria-label="选择当前页资料"
            />
          </th>
          <th style={{ width: "28%" }}>资料名称</th>
          <th style={{ width: "11%" }}>所属知识库</th>
          <th style={{ width: "16%" }}>上传</th>
          <th style={{ width: "11%" }}>处理状态</th>
          <th style={{ width: "22%" }}>入库情况</th>
          <th style={{ width: "12%", textAlign: "right" }}>操作</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((file) => (
          <LibraryDocumentRow
            key={file.id}
            file={file}
            selected={selectedRowId === file.id}
            checked={checkedRowIds?.has(file.id) ?? false}
            onSelect={onSelect}
            onToggleChecked={onToggleChecked}
            onDownload={onDownload}
            onParse={onParse}
            onIndex={onIndex}
            onMove={onMove}
            onDelete={onDelete}
          />
        ))}
      </tbody>
    </table>
  );
}

export function SearchResultsTable({
  groups,
  loading,
  errors = [],
  searchedKbCount = 0,
  onOpen,
}: {
  groups: YuxiSearchGroup[];
  loading: boolean;
  errors?: Array<{ db_id?: string; error?: string; kb_name?: string }>;
  searchedKbCount?: number;
  onOpen?: (target: { fileId: string; chunkId: string }) => void;
}) {
  const rows = groups.flatMap((group) => (group.results ?? []).map((result, index) => {
    // 服务端已规整的片段优先；缺失时（旧版后端）降级走启发式解析
    const snippets = Array.isArray(result.snippets) && result.snippets.length > 0 ? result.snippets : null;
    const raw = (result.result ?? {}) as Record<string, unknown>;
    // 行点击打开文件详情：优先取片段携带的 file_id/chunk_id（服务端已映射）
    const locatedSnippet = snippets?.find((s) => s.file_id);
    const chunkId = locatedSnippet?.chunk_id
      ?? (typeof raw.chunk_id === "string" ? raw.chunk_id : "");
    const fileId = locatedSnippet?.file_id
      ?? (typeof raw.file_id === "string"
        ? raw.file_id
        : chunkId
          ? chunkId.split("#")[0]
          : "");
    const snippetEvidence = snippets
      ? [...new Set(snippets.map((s) => snippetEvidenceLabel(s)).filter(Boolean))]
      : null;
    return {
      id: `${group.business_line ?? "line"}:${group.category ?? "cat"}:${result.db_id ?? index}:${index}`,
      kbName: result.kb_name || "知识库",
      category: group.label || yuxiCategoryMeta(group.category)?.label || group.category || "未分类",
      businessLine: yuxiBusinessLineLabel(group.business_line),
      snippets,
      result: snippets ? "" : summarizeSearchResult(result.result),
      evidence: snippetEvidence ?? summarizeSearchEvidence(result.result),
      fileId,
      chunkId,
    };
  }));
  if (rows.length === 0) {
    return (
      <div className="hc-kb-empty">
        <div className="hc-kb-empty-content">
          {loading && (
            <div className="hc-kb-empty-icon">
              <RefreshCw size={20} className="hc-kb-search-loading-icon" />
            </div>
          )}
          <div className="hc-kb-empty-title">{loading ? "正在检索知识库" : "暂无检索结果"}</div>
          <div className="hc-kb-empty-subtitle">
            {loading ? "逐库语义检索中，通常需要几秒到十几秒。" : "换一个关键词，或切换左侧知识库。"}
          </div>
        </div>
      </div>
    );
  }
  return (
    <>
      <div className="hc-kb-search-audit">
        <span>已检索 {searchedKbCount || rows.length} 个知识库</span>
        <span>命中 {rows.length} 组结果</span>
        {errors.length > 0 && (
          <span
            data-tone="danger"
            title={errors.map((item) => `${item.kb_name || item.db_id || "未知库"}：${item.error || "未知错误"}`).join("\n")}
          >
            {errors.map((item) => item.kb_name || item.db_id).filter(Boolean).join("、")} 检索失败（可回车重试）
          </span>
        )}
        {loading && (
          <span className="hc-kb-search-refreshing">
            <RefreshCw size={12} className="hc-kb-search-loading-icon" aria-hidden="true" /> 检索中…
          </span>
        )}
      </div>
      <table className="hc-kb-table">
        <thead>
          <tr>
            <th style={{ width: "22%" }}>命中知识库</th>
            <th style={{ width: "15%" }}>分类</th>
            <th>答案片段</th>
            <th style={{ width: "22%" }}>依据</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              tabIndex={row.fileId ? 0 : undefined}
              onClick={row.fileId ? () => onOpen?.({ fileId: row.fileId, chunkId: row.chunkId }) : undefined}
              style={row.fileId ? { cursor: "pointer" } : undefined}
            >
              <td>
                <div className="hc-kb-file-name">{row.kbName}</div>
                <div className="hc-kb-file-meta">{row.businessLine}</div>
              </td>
              <td><span className="hc-kb-tag">{row.category}</span></td>
              <td style={{ fontSize: 12, color: "var(--hc-text-secondary)", lineHeight: 1.5 }}>
                {row.snippets
                  ? row.snippets.map((snippet, snippetIndex) => (
                      <div key={snippetIndex} style={{ marginBottom: snippetIndex < row.snippets!.length - 1 ? 6 : 0 }}>
                        {snippet.matched === false && (
                          <span className="hc-kb-tag" style={{ marginRight: 6 }}>弱相关</span>
                        )}
                        {snippet.text}
                      </div>
                    ))
                  : row.result}
              </td>
              <td>
                <div className="hc-kb-evidence-list">
                  {row.evidence.length > 0 ? row.evidence.map((item) => <span key={item}>{item}</span>) : <span>系统未返回文件/段落定位</span>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function snippetEvidenceLabel(snippet: YuxiSearchSnippet): string {
  const chunk = snippet.chunk_id ? `段 ${snippet.chunk_id.replace(/^chunk-/, "").slice(0, 8)}` : "";
  return [snippet.filename, chunk].filter(Boolean).join(" · ");
}

function summarizeSearchEvidence(value: unknown): string[] {
  const records = flattenSearchRecords(value).slice(0, 4);
  const evidence = records.map((record) => {
    const filename = textField(record, ["filename", "file_name", "source", "document", "title"]);
    const chunk = textField(record, ["chunk_id", "chunkId", "id"]);
    const page = textField(record, ["page", "page_no", "pageNo"]);
    const score = numberField(record, ["score", "similarity", "confidence"]);
    const parts = [
      filename,
      page ? `页 ${page}` : "",
      chunk ? `段 ${chunk}` : "",
      typeof score === "number" ? `匹配 ${Math.round(score * 100)}%` : "",
    ].filter(Boolean);
    return parts.join(" · ");
  }).filter(Boolean);
  return [...new Set(evidence)];
}

function flattenSearchRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap((item) => flattenSearchRecords(item));
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const nested = ["results", "sources", "chunks", "context", "items"].flatMap((key) => flattenSearchRecords(record[key]));
  return [record, ...nested];
}

function textField(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function numberField(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}
