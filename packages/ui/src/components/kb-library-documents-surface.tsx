import { X } from "lucide-react";
import type {
  YuxiCategoryMeta,
  YuxiFileAnalysisResponse,
  YuxiKnowledgeDatabase,
  YuxiKnowledgeDocumentDetail,
} from "../lib/yuxi-client";
import type { FileRow } from "./kb-library-model";
import { KbLibraryDetailPanel } from "./kb-library-detail";
import { LibraryDocumentsTable } from "./kb-library-tables";
import {
  KbLibraryDocumentBulkbar,
  type KbDocumentStatusFilter,
  type KbDocumentTypeFilter,
} from "./kb-library-workspace";

export interface KbLibraryDocumentsSectionProps {
  hasDocuments: boolean;
  rows: FileRow[];
  allRowsCount: number;
  loading: boolean;
  selectedRowId: string | null;
  checkedRowIds: ReadonlySet<string>;
  checkedCount: number;
  statusFilter: KbDocumentStatusFilter;
  typeFilter: KbDocumentTypeFilter;
  detailOpen: boolean;
  onStatusFilterChange: (value: KbDocumentStatusFilter) => void;
  onTypeFilterChange: (value: KbDocumentTypeFilter) => void;
  onBatchDelete: () => void;
  onSelect: (file: FileRow) => void;
  onToggleChecked: (file: FileRow, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onDownload: (file: FileRow) => void;
  onDelete: (file: FileRow) => void;
  onUpload: () => void;
}

export function KbLibraryDocumentsSection({
  hasDocuments,
  rows,
  allRowsCount,
  loading,
  selectedRowId,
  checkedRowIds,
  checkedCount,
  statusFilter,
  typeFilter,
  detailOpen,
  onStatusFilterChange,
  onTypeFilterChange,
  onBatchDelete,
  onSelect,
  onToggleChecked,
  onToggleAll,
  onDownload,
  onDelete,
  onUpload,
}: KbLibraryDocumentsSectionProps) {
  return (
    <div className="hc-kb-library-content" data-detail-open={detailOpen ? "true" : undefined}>
      <div className="hc-kb-documents-region">
        {hasDocuments && (
          <KbLibraryDocumentBulkbar
            selectedCount={checkedCount}
            filteredCount={rows.length}
            totalCount={allRowsCount}
            statusFilter={statusFilter}
            typeFilter={typeFilter}
            onStatusFilterChange={onStatusFilterChange}
            onTypeFilterChange={onTypeFilterChange}
            onBatchDelete={onBatchDelete}
          />
        )}
        <div className="hc-kb-table-wrap">
          <LibraryDocumentsTable
            rows={rows}
            loading={loading}
            selectedRowId={selectedRowId}
            checkedRowIds={checkedRowIds}
            onSelect={onSelect}
            onToggleChecked={onToggleChecked}
            onToggleAll={onToggleAll}
            onDownload={onDownload}
            onDelete={onDelete}
            emptyTitle={hasDocuments ? "暂无匹配资料" : "暂无资料"}
            emptySubtitle={hasDocuments ? "换一个状态、类型或关键词再试。" : "上传资料后会进入解析、提取档案和入库；异常事项会进入入库问题。"}
            emptyActionLabel={hasDocuments ? undefined : "上传资料"}
            onEmptyAction={hasDocuments ? undefined : onUpload}
          />
        </div>
      </div>
    </div>
  );
}

export interface KbLibraryDetailDrawerProps {
  file: FileRow;
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
  highlightChunkId: string | null;
  highlightQuery: string | null;
  onClose: () => void;
  onDownload: (file: FileRow) => void;
  onDelete: (file: FileRow) => void;
  onAnalyze: (file: FileRow) => void;
  onGenerateQuestions: (file: FileRow) => void;
}

export function KbLibraryDetailDrawer({
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
  onClose,
  onDownload,
  onDelete,
  onAnalyze,
  onGenerateQuestions,
}: KbLibraryDetailDrawerProps) {
  return (
    <div className="hc-kb-archive-drawer hc-kb-archive-drawer--fixed" role="presentation">
      <button
        type="button"
        className="hc-kb-archive-drawer-scrim"
        aria-label="关闭资料详情"
        onClick={onClose}
      />
      <aside className="hc-kb-archive-drawer-panel" role="dialog" aria-modal="true" aria-label="资料详情">
        <button type="button" className="hc-kb-archive-drawer-close" onClick={onClose}>
          <X size={14} strokeWidth={2.2} aria-hidden="true" />
          关闭
        </button>
        <KbLibraryDetailPanel
          file={file}
          detail={detail}
          analysis={analysis}
          analysisLoading={analysisLoading}
          analysisError={analysisError}
          hydeQuestions={hydeQuestions}
          hydeLoading={hydeLoading}
          hydeError={hydeError}
          loading={loading}
          error={error}
          selectedCategory={selectedCategory}
          selectedDatabase={selectedDatabase}
          highlightChunkId={highlightChunkId}
          highlightQuery={highlightQuery}
          onDownload={onDownload}
          onDelete={onDelete}
          onAnalyze={onAnalyze}
          onGenerateQuestions={onGenerateQuestions}
        />
      </aside>
    </div>
  );
}
