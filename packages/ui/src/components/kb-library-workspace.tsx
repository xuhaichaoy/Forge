import { Loader2, RefreshCw, Search, Upload, X } from "lucide-react";
import { startTopbarWindowDrag } from "../lib/window-drag";
import { KbLibraryWorkspaceTabs, type KbLibraryWorkspaceTab } from "./kb-library-workspace-tabs";

export type KbDocumentStatusFilter = "all" | "indexed" | "processing" | "failed" | "unknown";
export type KbDocumentTypeFilter = "all" | "DOC" | "PDF" | "PPT" | "XLS" | "MD" | "TXT";

export interface KbLibraryTopbarProps {
  loading: boolean;
  updatedLabel: string;
  onRefresh: () => void;
}

export function KbLibraryTopbar({
  loading,
  updatedLabel,
  onRefresh,
}: KbLibraryTopbarProps) {
  return (
    <header className="hc-topbar" data-tauri-drag-region onMouseDown={startTopbarWindowDrag}>
      <div className="hc-topbar-main" data-tauri-drag-region>
        <div className="hc-top-title" data-tauri-drag-region>知识库</div>
      </div>
      <div className="hc-topbar-actions" data-tauri-drag-region>
        <button
          type="button"
          className="hc-kb-topbar-btn"
          onClick={onRefresh}
          disabled={loading}
          aria-label="同步平台数据"
          title={updatedLabel ? `最近同步 ${updatedLabel}` : "同步平台数据"}
        >
          <RefreshCw size={13} strokeWidth={2.2} aria-hidden="true" />
          {loading ? "同步中" : "同步"}
        </button>
      </div>
    </header>
  );
}

export interface KbLibrarySearchSectionProps {
  selectedDatabaseName: string | null;
  searchQuery: string;
  error: string | null;
  notice: string | null;
  onSearchQueryChange: (value: string) => void;
  onCommitSearch: () => void;
}

export function KbLibrarySearchSection({
  selectedDatabaseName,
  searchQuery,
  error,
  notice,
  onSearchQueryChange,
  onCommitSearch,
}: KbLibrarySearchSectionProps) {
  return (
    <div className="hc-kb-search-section">
      <div className="hc-kb-search-wrap">
        <Search size={14} aria-hidden="true" />
        <input
          type="search"
          className="hc-kb-search hc-kb-search--prominent"
          placeholder={`搜索${selectedDatabaseName ?? "全部知识库"}资料`}
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onCommitSearch();
          }}
          aria-label="搜索知识库资料"
        />
        {searchQuery && (
          <button type="button" className="hc-kb-search-clear" onClick={() => onSearchQueryChange("")} aria-label="清除搜索">
            <X size={12} aria-hidden="true" />
          </button>
        )}
      </div>
      {error && (
        <div className="hc-kb-inline-alert" data-tone="danger">
          {error}
        </div>
      )}
      {notice && (
        <div className="hc-kb-inline-alert">
          {notice}
        </div>
      )}
    </div>
  );
}

export interface KbLibraryToolbarProps {
  activeLibraryLabel: string;
  showTabs: boolean;
  activeTab: KbLibraryWorkspaceTab;
  disabledManagement: boolean;
  counts: {
    documents: number;
    pending: number;
    integrations: number;
    tasks: number;
  };
  canUpload: boolean;
  uploading: boolean;
  onSelectTab: (tab: KbLibraryWorkspaceTab) => void;
  onUpload: () => void;
}

export function KbLibraryToolbar({
  activeLibraryLabel,
  showTabs,
  activeTab,
  disabledManagement,
  counts,
  canUpload,
  uploading,
  onSelectTab,
  onUpload,
}: KbLibraryToolbarProps) {
  return (
    <div className="hc-kb-library-toolbar">
      <div className="hc-kb-library-toolbar-main">
        <div className="hc-kb-library-title">{activeLibraryLabel}</div>
        {showTabs && (
          <KbLibraryWorkspaceTabs
            active={activeTab}
            disabledManagement={disabledManagement}
            counts={counts}
            onSelect={onSelectTab}
          />
        )}
      </div>
      <div className="hc-kb-library-actions">
        <button
          type="button"
          className="hc-kb-topbar-btn hc-kb-topbar-btn--primary"
          onClick={onUpload}
          disabled={!canUpload}
        >
          {uploading ? <Loader2 size={13} strokeWidth={2.2} aria-hidden="true" /> : <Upload size={13} strokeWidth={2.2} aria-hidden="true" />}
          {uploading ? "上传中" : "上传资料"}
        </button>
      </div>
    </div>
  );
}

export interface KbLibraryDocumentBulkbarProps {
  selectedCount: number;
  filteredCount: number;
  totalCount: number;
  statusFilter: KbDocumentStatusFilter;
  typeFilter: KbDocumentTypeFilter;
  onStatusFilterChange: (value: KbDocumentStatusFilter) => void;
  onTypeFilterChange: (value: KbDocumentTypeFilter) => void;
  onBatchDelete: () => void;
}

export function KbLibraryDocumentBulkbar({
  selectedCount,
  filteredCount,
  totalCount,
  statusFilter,
  typeFilter,
  onStatusFilterChange,
  onTypeFilterChange,
  onBatchDelete,
}: KbLibraryDocumentBulkbarProps) {
  return (
    <div className="hc-kb-bulkbar">
      <span>{selectedCount > 0 ? `已选 ${selectedCount} 条` : `资料列表 ${filteredCount}/${totalCount}`}</span>
      <div className="hc-kb-document-filters" aria-label="资料筛选">
        <select
          value={statusFilter}
          onChange={(event) => onStatusFilterChange(event.currentTarget.value as KbDocumentStatusFilter)}
          aria-label="按处理状态筛选"
        >
          <option value="all">全部状态</option>
          <option value="indexed">已入库</option>
          <option value="processing">处理中</option>
          <option value="failed">失败</option>
          <option value="unknown">未记录</option>
        </select>
        <select
          value={typeFilter}
          onChange={(event) => onTypeFilterChange(event.currentTarget.value as KbDocumentTypeFilter)}
          aria-label="按文件类型筛选"
        >
          <option value="all">全部类型</option>
          <option value="DOC">DOC</option>
          <option value="PDF">PDF</option>
          <option value="PPT">PPT</option>
          <option value="XLS">XLS</option>
          <option value="MD">MD</option>
          <option value="TXT">TXT</option>
        </select>
      </div>
      <div className="hc-kb-bulkbar-actions">
        <button type="button" className="hc-kb-topbar-btn hc-kb-topbar-btn--danger" disabled={selectedCount === 0} onClick={onBatchDelete}>
          批量删除
        </button>
      </div>
    </div>
  );
}

export interface KbCreateLibraryDialogProps {
  name: string;
  description: string;
  saving: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

export function KbCreateLibraryDialog({
  name,
  description,
  saving,
  onNameChange,
  onDescriptionChange,
  onSubmit,
  onClose,
}: KbCreateLibraryDialogProps) {
  return (
    <div className="hc-kb-upload-dialog-backdrop" role="presentation">
      <div className="hc-kb-upload-dialog hc-kb-create-library-dialog" role="dialog" aria-modal="true" aria-label="新建知识库">
        <div className="hc-kb-upload-dialog-head">
          <div className="hc-kb-upload-dialog-title">
            <strong>新建知识库</strong>
            <span>填写库名后即可创建，资料直接上传到该库</span>
          </div>
          <button
            type="button"
            className="hc-kb-upload-dialog-close"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        <div className="hc-kb-upload-dialog-body">
          <label className="hc-kb-create-library-field">
            <span>知识库名称</span>
            <input
              value={name}
              onChange={(event) => onNameChange(event.currentTarget.value)}
              autoFocus
            />
          </label>
          <label className="hc-kb-create-library-field">
            <span>资料范围</span>
            <textarea
              value={description}
              onChange={(event) => onDescriptionChange(event.currentTarget.value)}
              rows={3}
            />
          </label>
          <div className="hc-kb-create-library-actions">
            <button type="button" className="hc-kb-topbar-btn" onClick={onClose} disabled={saving}>
              取消
            </button>
            <button
              type="button"
              className="hc-kb-topbar-btn hc-kb-topbar-btn--primary"
              onClick={onSubmit}
              disabled={saving || !name.trim()}
            >
              {saving ? "创建中" : "创建知识库"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
