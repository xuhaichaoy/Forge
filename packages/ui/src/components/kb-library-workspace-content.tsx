import type {
  YuxiCategoryMeta,
  YuxiFileAnalysisResponse,
  YuxiKnowledgeDatabase,
  YuxiKnowledgeDocumentDetail,
  YuxiSearchGroup,
  YuxiTask,
} from "../lib/yuxi-client";
import { KbLibraryDetailDrawer, KbLibraryDocumentsSection } from "./kb-library-documents-surface";
import { KbLibraryIntegrationPanel } from "./kb-library-integration-panel";
import type { FileRow, LibraryGovernanceDraft } from "./kb-library-model";
import { KbLibraryPendingPanel } from "./kb-library-pending-panel";
import { KbLibraryStoragePanel } from "./kb-library-storage-panel";
import { KbLibraryTaskPanel } from "./kb-library-task-panel";
import { SearchResultsTable } from "./kb-library-tables";
import type {
  KbDocumentStatusFilter,
  KbDocumentTypeFilter,
} from "./kb-library-workspace";
import type { KbLibraryWorkspaceTab } from "./kb-library-workspace-tabs";

type SearchError = { db_id?: string; error?: string; kb_name?: string };

interface KbLibrarySearchContentProps {
  activeText: string;
  groups: YuxiSearchGroup[];
  loading: boolean;
  errors: SearchError[];
  searchedKbCount: number;
  onOpenResult: (target: { fileId: string; chunkId: string }) => void;
}

interface KbLibraryPendingContentProps {
  selectedCategory: YuxiCategoryMeta | null;
  selectedDatabase: YuxiKnowledgeDatabase | null;
  selectedDatabases: YuxiKnowledgeDatabase[];
  allDatabases: YuxiKnowledgeDatabase[];
  focusPendingIds: number[];
  onResolved: () => void;
}

interface KbLibraryStorageContentProps {
  selectedCategory: YuxiCategoryMeta | null;
  selectedDatabase: YuxiKnowledgeDatabase | null;
  onUpload: () => void;
  onSaveGovernance: (database: YuxiKnowledgeDatabase | null, draft: LibraryGovernanceDraft) => void;
  governanceSaving: boolean;
}

interface KbLibraryTaskContentProps {
  rows: YuxiTask[];
  loading: boolean;
  error: string | null;
  selectedDatabase: YuxiKnowledgeDatabase | null;
  onRefresh: () => void;
  onCancel: (task: YuxiTask) => void;
  onDelete: (task: YuxiTask) => void;
  onRetry: (task: YuxiTask) => void;
}

interface KbLibraryDocumentsContentProps {
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

interface KbLibraryDetailContentProps {
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
  highlightChunkId: string | null;
  highlightQuery: string | null;
  onClose: () => void;
  onDownload: (file: FileRow) => void;
  onDelete: (file: FileRow) => void;
  onAnalyze: (file: FileRow) => void;
  onGenerateQuestions: (file: FileRow) => void;
}

export interface KbLibraryWorkspaceContentProps {
  activeTab: KbLibraryWorkspaceTab;
  search: KbLibrarySearchContentProps;
  pending: KbLibraryPendingContentProps;
  storage: KbLibraryStorageContentProps;
  integrations: {
    selectedCategory: YuxiCategoryMeta | null;
    selectedDatabase: YuxiKnowledgeDatabase | null;
  };
  tasks: KbLibraryTaskContentProps;
  documents: KbLibraryDocumentsContentProps;
  detail: KbLibraryDetailContentProps;
}

export function KbLibraryWorkspaceContent({
  activeTab,
  search,
  pending,
  storage,
  integrations,
  tasks,
  documents,
  detail,
}: KbLibraryWorkspaceContentProps) {
  return (
    <>
      {search.activeText ? (
        <div className="hc-kb-table-wrap">
          <SearchResultsTable
            groups={search.groups}
            loading={search.loading}
            errors={search.errors}
            searchedKbCount={search.searchedKbCount}
            onOpen={search.onOpenResult}
          />
        </div>
      ) : activeTab === "pending" ? (
        <KbLibraryPendingPanel
          selectedCategory={pending.selectedCategory}
          selectedDatabase={pending.selectedDatabase}
          selectedDatabases={pending.selectedDatabases}
          allDatabases={pending.allDatabases}
          focusPendingIds={pending.focusPendingIds}
          onResolved={pending.onResolved}
        />
      ) : activeTab === "storage" ? (
        <KbLibraryStoragePanel
          selectedCategory={storage.selectedCategory}
          selectedDatabase={storage.selectedDatabase}
          onUpload={storage.onUpload}
          onSaveGovernance={storage.onSaveGovernance}
          governanceSaving={storage.governanceSaving}
        />
      ) : activeTab === "integrations" ? (
        <KbLibraryIntegrationPanel
          selectedCategory={integrations.selectedCategory}
          selectedDatabase={integrations.selectedDatabase}
        />
      ) : activeTab === "tasks" ? (
        <KbLibraryTaskPanel
          tasks={tasks.rows}
          loading={tasks.loading}
          error={tasks.error}
          selectedDatabase={tasks.selectedDatabase}
          onRefresh={tasks.onRefresh}
          onCancel={tasks.onCancel}
          onDelete={tasks.onDelete}
          onRetry={tasks.onRetry}
        />
      ) : (
        <KbLibraryDocumentsSection
          hasDocuments={documents.hasDocuments}
          rows={documents.rows}
          allRowsCount={documents.allRowsCount}
          loading={documents.loading}
          selectedRowId={documents.selectedRowId}
          checkedRowIds={documents.checkedRowIds}
          checkedCount={documents.checkedCount}
          statusFilter={documents.statusFilter}
          typeFilter={documents.typeFilter}
          detailOpen={documents.detailOpen}
          onStatusFilterChange={documents.onStatusFilterChange}
          onTypeFilterChange={documents.onTypeFilterChange}
          onBatchDelete={documents.onBatchDelete}
          onSelect={documents.onSelect}
          onToggleChecked={documents.onToggleChecked}
          onToggleAll={documents.onToggleAll}
          onDownload={documents.onDownload}
          onDelete={documents.onDelete}
          onUpload={documents.onUpload}
        />
      )}
      {detail.file && (
        <KbLibraryDetailDrawer
          file={detail.file}
          detail={detail.detail}
          analysis={detail.analysis}
          analysisLoading={detail.analysisLoading}
          analysisError={detail.analysisError}
          hydeQuestions={detail.hydeQuestions}
          hydeLoading={detail.hydeLoading}
          hydeError={detail.hydeError}
          loading={detail.loading}
          error={detail.error}
          selectedCategory={detail.selectedCategory}
          selectedDatabase={detail.selectedDatabase}
          highlightChunkId={detail.highlightChunkId}
          highlightQuery={detail.highlightQuery}
          onClose={detail.onClose}
          onDownload={detail.onDownload}
          onDelete={detail.onDelete}
          onAnalyze={detail.onAnalyze}
          onGenerateQuestions={detail.onGenerateQuestions}
        />
      )}
    </>
  );
}
