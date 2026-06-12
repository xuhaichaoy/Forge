import { Download, Eye, FileSearch, FolderOpen, RefreshCw, Trash2, Upload } from "lucide-react";
import type { FileRow } from "./kb-library-model";

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

export function LibraryDocumentsEmptyState({
  loading,
  emptyTitle,
  emptySubtitle,
  emptyActionLabel,
  onEmptyAction,
}: {
  loading: boolean;
  emptyTitle?: string;
  emptySubtitle?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
}) {
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

export function LibraryDocumentRow({
  file,
  selected,
  checked,
  onSelect,
  onToggleChecked,
  onDownload,
  onParse,
  onIndex,
  onMove,
  onDelete,
}: {
  file: FileRow;
  selected: boolean;
  checked: boolean;
  onSelect: (file: FileRow) => void;
  onToggleChecked?: (file: FileRow, checked: boolean) => void;
  onDownload: (file: FileRow) => void;
  onParse?: (file: FileRow) => void;
  onIndex?: (file: FileRow) => void;
  onMove?: (file: FileRow) => void;
  onDelete: (file: FileRow) => void;
}) {
  const rowCheckable = Boolean(file.raw.db_id && file.raw.file_id);
  return (
    <tr
      data-active={selected ? "true" : undefined}
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
          checked={checked}
          disabled={!rowCheckable}
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
              disabled={!rowCheckable}
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
              disabled={!rowCheckable}
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
              disabled={!rowCheckable}
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
