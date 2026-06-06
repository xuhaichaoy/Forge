import { Download, Eye, FileSearch, FolderOpen, RefreshCw, Trash2, Upload } from "lucide-react";
import {
  yuxiBusinessLineLabel,
  yuxiCategoryMeta,
  type YuxiSearchGroup,
} from "../lib/yuxi-client";
import { summarizeSearchResult, type FileRow } from "./kb-library-model";

function FileIcon({ ext }: { ext: FileRow["ext"] }) {
  const cls = {
    DOC: "hc-kb-file-icon--doc",
    PDF: "hc-kb-file-icon--pdf",
    PPT: "hc-kb-file-icon--ppt",
    XLS: "hc-kb-file-icon--xls",
    MD: "hc-kb-file-icon--md",
    TXT: "hc-kb-file-icon--txt",
  }[ext];
  return <span className={`hc-kb-file-icon ${cls}`}>{ext}</span>;
}

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
    if (loading) {
      return <div className="hc-kb-empty" aria-busy="true" aria-live="polite" />;
    }
    return (
      <div className="hc-kb-empty">
        <div className="hc-kb-empty-content">
          <div className="hc-kb-empty-title">{emptyTitle ?? "暂无匹配资料"}</div>
          <div className="hc-kb-empty-subtitle">{emptySubtitle ?? "当前知识库还没有资料，或筛选条件没有命中。"}</div>
          {emptyActionLabel && onEmptyAction && (
            <button type="button" className="hc-kb-topbar-btn hc-kb-topbar-btn--primary" onClick={onEmptyAction}>
              <Upload size={13} strokeWidth={2.2} aria-hidden="true" />
              {emptyActionLabel}
            </button>
          )}
        </div>
      </div>
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
          <tr
            key={file.id}
            data-active={selectedRowId === file.id ? "true" : undefined}
            tabIndex={0}
            onClick={() => onSelect(file)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(file);
              }
            }}
          >
            <td>
              <input
                type="checkbox"
                className="hc-kb-table-checkbox"
                checked={checkedRowIds?.has(file.id) ?? false}
                disabled={!file.raw.db_id || !file.raw.file_id}
                aria-label={`选择 ${file.name}`}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => onToggleChecked?.(file, event.currentTarget.checked)}
              />
            </td>
            <td>
              <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                <FileIcon ext={file.ext} />
                <div className="hc-kb-file-name">{file.name}</div>
              </div>
            </td>
            <td>
              <div className="hc-kb-file-name">{file.source}</div>
              <div className="hc-kb-tags">
                {file.categories.map((cat) => (
                  <span key={cat.label} className={`hc-kb-tag hc-kb-tag--${cat.kind}`}>
                    {cat.label}
                  </span>
                ))}
              </div>
            </td>
            <td>
              <div className="hc-kb-file-name">{file.uploadedBy}</div>
              <div className="hc-kb-file-meta" style={{ whiteSpace: "nowrap" }}>{file.date}</div>
            </td>
            <td>
              <span className={`hc-kb-status hc-kb-status--${documentStatusTone(file.raw.status)}`}>
                {documentStatusLabel(file.raw.status)}
              </span>
            </td>
            <td>
              <div className="hc-kb-file-name">{file.versionLabel}</div>
            </td>
            <td>
              <div className="hc-kb-row-actions" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="hc-kb-row-btn"
                  title="查看详情"
                  aria-label={`查看 ${file.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(file);
                  }}
                >
                  <Eye size={13} strokeWidth={2.2} aria-hidden="true" />
                </button>
                {onParse && (
                  <button
                    type="button"
                    className="hc-kb-row-btn"
                    title="重新解析"
                    aria-label={`重新解析 ${file.name}`}
                    disabled={!file.raw.db_id || !file.raw.file_id}
                    onClick={(event) => {
                      event.stopPropagation();
                      onParse(file);
                    }}
                  >
                    <FileSearch size={13} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                )}
                {onIndex && (
                  <button
                    type="button"
                    className="hc-kb-row-btn"
                    title="重新入库"
                    aria-label={`重新入库 ${file.name}`}
                    disabled={!file.raw.db_id || !file.raw.file_id}
                    onClick={(event) => {
                      event.stopPropagation();
                      onIndex(file);
                    }}
                  >
                    <RefreshCw size={13} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                )}
                {onMove && (
                  <button
                    type="button"
                    className="hc-kb-row-btn"
                    title="移动到文件夹"
                    aria-label={`移动 ${file.name}`}
                    disabled={!file.raw.db_id || !file.raw.file_id}
                    onClick={(event) => {
                      event.stopPropagation();
                      onMove(file);
                    }}
                  >
                    <FolderOpen size={13} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  className="hc-kb-row-btn"
                  title="下载原文件"
                  aria-label={`下载 ${file.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDownload(file);
                  }}
                >
                  <Download size={13} strokeWidth={2.2} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="hc-kb-row-btn"
                  title="删除资料"
                  aria-label={`删除 ${file.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(file);
                  }}
                >
                  <Trash2 size={13} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function documentStatusLabel(value: string | null | undefined): string {
  if (value === "indexed" || value === "done" || value === "completed" || value === "success") return "已入库";
  if (value === "indexing") return "入库中";
  if (value === "parsing") return "解析中";
  if (value === "waiting") return "排队中";
  if (value === "parsed") return "已解析";
  if (value === "uploaded") return "已上传";
  if (value === "processing" || value === "pending" || value === "running") return "处理中";
  if (value === "error_indexing") return "入库失败";
  if (value === "failed" || value === "error" || value === "error_parsing") return "失败";
  return value || "未记录";
}

function documentStatusTone(value: string | null | undefined): "ok" | "fail" | "pending" | "archive" {
  if (value === "indexed" || value === "done" || value === "completed" || value === "success") return "ok";
  if (value === "failed" || value === "error" || value === "error_parsing" || value === "error_indexing") return "fail";
  if (
    value === "uploaded" ||
    value === "parsed" ||
    value === "processing" ||
    value === "indexing" ||
    value === "parsing" ||
    value === "waiting"
  )
    return "pending";
  return "archive";
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
  errors?: Array<{ db_id?: string; error?: string }>;
  searchedKbCount?: number;
  onOpen?: (target: { fileId: string; chunkId: string }) => void;
}) {
  const rows = groups.flatMap((group) => (group.results ?? []).map((result, index) => {
    const raw = (result.result ?? {}) as Record<string, unknown>;
    const chunkId = typeof raw.chunk_id === "string" ? raw.chunk_id : "";
    const fileId = typeof raw.file_id === "string"
      ? raw.file_id
      : chunkId
        ? chunkId.split("#")[0]
        : "";
    return {
      id: `${group.business_line ?? "line"}:${group.category ?? "cat"}:${result.db_id ?? index}:${index}`,
      kbName: result.kb_name || "知识库",
      category: group.label || yuxiCategoryMeta(group.category)?.label || group.category || "未分类",
      businessLine: yuxiBusinessLineLabel(group.business_line),
      result: summarizeSearchResult(result.result),
      evidence: summarizeSearchEvidence(result.result),
      fileId,
      chunkId,
    };
  }));
  if (rows.length === 0) {
    return (
      <div className="hc-kb-empty">
        <div className="hc-kb-empty-content">
          <div className="hc-kb-empty-title">{loading ? "正在检索知识库" : "暂无检索结果"}</div>
          <div className="hc-kb-empty-subtitle">{loading ? "正在读取检索结果。" : "换一个关键词，或切换左侧知识库。"}</div>
        </div>
      </div>
    );
  }
  return (
    <>
      <div className="hc-kb-search-audit">
        <span>已检索 {searchedKbCount || rows.length} 个知识库</span>
        <span>命中 {rows.length} 组结果</span>
        {errors.length > 0 && <span data-tone="danger">{errors.length} 个知识库检索失败</span>}
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
              <td style={{ fontSize: 12, color: "var(--hc-text-secondary)", lineHeight: 1.5 }}>{row.result}</td>
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
