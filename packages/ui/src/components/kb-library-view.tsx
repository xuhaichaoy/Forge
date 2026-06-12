import { useCallback, useEffect, useRef, useState } from "react";
import { useKbLibraryDataSource } from "./kb-library-data-source";
import { useKbLibraryDocumentDetail } from "./kb-library-document-detail-state";
import {
  useKbLibraryDocumentActions,
  useKbLibraryTaskActions,
} from "./kb-library-document-actions";
import { useKbLibraryDocumentWorkspaceState } from "./kb-library-document-workspace-state";
import { useKbLibraryManagementActions } from "./kb-library-management-actions";
import { LibraryListFilter } from "./kb-library-navigation";
import { useConfirmDialog } from "./confirm-dialog";
import { KbLibraryUploadPanel } from "./kb-library-upload-panel";
import { useKbLibraryUploadActions } from "./kb-library-upload-actions";
import { UploadBatchTable } from "./kb-library-upload-runs";
import { KbLibraryWorkspaceContent } from "./kb-library-workspace-content";
import {
  KbCreateLibraryDialog,
  KbLibrarySearchSection,
  KbLibraryTopbar,
  KbLibraryToolbar,
  type KbDocumentStatusFilter,
  type KbDocumentTypeFilter,
} from "./kb-library-workspace";
import type { KbLibraryWorkspaceTab } from "./kb-library-workspace-tabs";

export function KbLibraryView() {
  const {
    activeDbId,
    setActiveDbId,
    searchQuery,
    setSearchQuery,
    searchText,
    documents,
    allDocuments,
    databases,
    searchGroups,
    searchErrors,
    searchedKbCount,
    taskRows,
    tasksLoading,
    tasksError,
    setTasksError,
    pendingSummary,
    loading,
    error,
    setError,
    notice,
    setNotice,
    lastUpdatedAt,
    selectedDatabase,
    selectedCategory,
    businessLine,
    selectedDatabases,
    activeTaskCount,
    sourceSystemCount,
    loadDocuments,
    loadTasks,
    loadPendingSummary,
    refreshLibraryData,
    commitSearch,
    addDatabaseIfMissing,
  } = useKbLibraryDataSource();
  const [libraryMode, setLibraryMode] = useState<KbLibraryWorkspaceTab>("documents");
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [documentStatusFilter, setDocumentStatusFilter] = useState<KbDocumentStatusFilter>("all");
  const [documentTypeFilter, setDocumentTypeFilter] = useState<KbDocumentTypeFilter>("all");
  const uploadInputRef = useRef<HTMLInputElement>(null);
  // 应用内确认对话框（Tauri WebView 的 window.confirm 是 no-op，不能用）
  const { confirmDialog, confirmDialogNode } = useConfirmDialog();

  // 「全部」视图下只看资料总览，管理类视图(设置/入库问题/系统来源/记录)需先选库。
  useEffect(() => {
    if (!selectedDatabase && libraryMode !== "documents") {
      setLibraryMode("documents");
    }
  }, [libraryMode, selectedDatabase]);

  const {
    allRows,
    hasDocuments,
    rows,
    selectedFile,
    totalCount,
    navDatabases,
    selectedDatabaseCount,
    selectedRowId,
    highlightChunkId,
    highlightQuery,
    checkedRowIds,
    checkedRows,
    clearSelectedRow,
    clearCheckedRows,
    resetDocumentSelection,
    selectDocumentRow,
    selectSearchResult,
    toggleCheckedRow,
    toggleAllCheckedRows,
  } = useKbLibraryDocumentWorkspaceState({
    documents,
    allDocuments,
    databases,
    selectedDatabase,
    statusFilter: documentStatusFilter,
    typeFilter: documentTypeFilter,
  });
  const {
    documentDetail,
    documentAnalysis,
    analysisLoading,
    analysisError,
    hydeQuestions,
    hydeLoading,
    hydeError,
    detailLoading,
    detailError,
    analyzeSelectedFile,
    generateSelectedFileQuestions,
    clearDocumentDetail,
  } = useKbLibraryDocumentDetail(selectedFile);
  const pendingTotal = pendingSummary ?? 0;
  const {
    handleDownload,
    handleDelete,
    handleBatchDelete,
  } = useKbLibraryDocumentActions({
    checkedRows,
    selectedRowId,
    confirmDialog,
    clearCheckedRows,
    clearSelectedRow,
    clearDocumentDetail,
    loadDocuments,
    reportError: setError,
    reportNotice: setNotice,
  });
  const {
    handleCancelTask,
    handleDeleteTask,
    handleRetryTask,
  } = useKbLibraryTaskActions({
    confirmDialog,
    loadTasks,
    reportError: setTasksError,
    reportNotice: setNotice,
  });

  const resetSelectionView = useCallback(() => {
    setDocumentStatusFilter("all");
    setDocumentTypeFilter("all");
    resetDocumentSelection();
    setLibraryMode("documents");
  }, [resetDocumentSelection]);

  const {
    createLibraryDialog,
    createLibrarySaving,
    governanceSaving,
    requireSelectedDatabase,
    saveGovernance,
    selectAllLibraries,
    selectDatabase,
    openCreateLibraryDialog,
    closeCreateLibraryDialog,
    setCreateLibraryName,
    setCreateLibraryDescription,
    submitCreateLibrary,
  } = useKbLibraryManagementActions({
    selectedDatabase,
    databases,
    loadDocuments,
    addDatabaseIfMissing,
    setActiveDbId,
    setSearchQuery,
    setLibraryMode,
    resetSelectionView,
    setError,
    setNotice,
  });

  const showPendingQueue = useCallback(() => {
    setLibraryMode("pending");
  }, []);
  const {
    uploadRuns,
    setUploadRuns,
    focusPendingIds,
    setFocusPendingIds,
    urlValue,
    setUrlValue,
    uploading,
    urlIngesting,
    handleUploadFiles,
    handleIngestUrl,
  } = useKbLibraryUploadActions({
    businessLine,
    requireSelectedDatabase,
    refreshLibraryData,
    reportError: setError,
    reportNotice: setNotice,
    showPendingQueue,
  });

  const updatedLabel = lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "";
  const canUploadToSelectedLibrary = !!selectedDatabase?.db_id && !uploading && !urlIngesting;
  const activeLibraryLabel = selectedDatabase?.name || "全部知识库";

  return (
    <main className="hc-main hc-kb-main" aria-label="知识库管理">
      <KbLibraryTopbar
        loading={loading}
        updatedLabel={updatedLabel}
        onRefresh={() => void loadDocuments()}
      />

      <div className="hc-kb-body">
        <input
          ref={uploadInputRef}
          type="file"
          multiple
          accept=".doc,.docx,.pdf,.ppt,.pptx,.xls,.xlsx,.md,.txt"
          hidden
          onChange={(event) => {
            const files = event.currentTarget.files;
            if (files) void handleUploadFiles(files);
            event.currentTarget.value = "";
          }}
        />
        <aside className="hc-kb-filters" aria-label="知识库列表">
          <LibraryListFilter
            activeDbId={activeDbId}
            databases={navDatabases}
            totalCount={totalCount}
            onSelectAll={selectAllLibraries}
            onSelectDatabase={selectDatabase}
            onCreateLibrary={openCreateLibraryDialog}
          />
        </aside>

        <div className="hc-kb-results-area">
          <KbLibrarySearchSection
            selectedDatabaseName={selectedDatabase?.name ?? null}
            searchQuery={searchQuery}
            error={error}
            notice={notice}
            onSearchQueryChange={setSearchQuery}
            onCommitSearch={commitSearch}
          />

          <KbLibraryToolbar
            activeLibraryLabel={activeLibraryLabel}
            showTabs={!searchText}
            activeTab={libraryMode}
            disabledManagement={!selectedDatabase}
            counts={{
              documents: selectedDatabaseCount,
              pending: pendingTotal,
              integrations: sourceSystemCount,
              tasks: activeTaskCount,
            }}
            canUpload={canUploadToSelectedLibrary}
            uploading={uploading}
            onSelectTab={setLibraryMode}
            onUpload={() => {
              setSearchQuery("");
              setUploadDialogOpen(true);
            }}
          />

          {/* 弹窗打开时进度在弹窗内展示；关闭弹窗后这里仍保留结果区，便于回看上一批结果。 */}
          {uploadRuns.length > 0 && !uploadDialogOpen && (
            <UploadBatchTable
              runs={uploadRuns}
              onClear={() => setUploadRuns([])}
              onOpenPending={(pendingIds) => {
                setFocusPendingIds(pendingIds);
                setLibraryMode("pending");
              }}
              onOpenTasks={() => {
                setLibraryMode("tasks");
              }}
              onChooseFiles={() => uploadInputRef.current?.click()}
            />
          )}

          <KbLibraryWorkspaceContent
            activeTab={libraryMode}
            search={{
              activeText: searchText,
              groups: searchGroups,
              loading,
              errors: searchErrors,
              searchedKbCount,
              onOpenResult: (target) => {
                const doc = allDocuments.find((file) => file.file_id === target.fileId);
                if (!doc) return;
                selectSearchResult(doc, target.chunkId || null, searchQuery.trim() || null);
              },
            }}
            pending={{
              selectedCategory,
              selectedDatabase,
              selectedDatabases,
              allDatabases: databases,
              focusPendingIds,
              onResolved: () => {
                void loadDocuments();
                void loadPendingSummary();
              },
            }}
            storage={{
              selectedCategory,
              selectedDatabase,
              onUpload: () => setUploadDialogOpen(true),
              onSaveGovernance: (database, draft) => void saveGovernance(database, draft),
              governanceSaving,
            }}
            integrations={{
              selectedCategory,
              selectedDatabase,
            }}
            tasks={{
              rows: taskRows,
              loading: tasksLoading,
              error: tasksError,
              selectedDatabase,
              onRefresh: () => void loadTasks(),
              onCancel: (task) => void handleCancelTask(task),
              onDelete: (task) => void handleDeleteTask(task),
              onRetry: (task) => void handleRetryTask(task),
            }}
            documents={{
              hasDocuments,
              rows,
              allRowsCount: allRows.length,
              loading,
              selectedRowId,
              checkedRowIds,
              checkedCount: checkedRows.length,
              statusFilter: documentStatusFilter,
              typeFilter: documentTypeFilter,
              detailOpen: Boolean(selectedFile),
              onStatusFilterChange: (nextValue) => {
                setDocumentStatusFilter(nextValue);
                clearCheckedRows();
              },
              onTypeFilterChange: (nextValue) => {
                setDocumentTypeFilter(nextValue);
                clearCheckedRows();
              },
              onBatchDelete: () => void handleBatchDelete(),
              onSelect: selectDocumentRow,
              onToggleChecked: toggleCheckedRow,
              onToggleAll: toggleAllCheckedRows,
              onDownload: (file) => void handleDownload(file),
              onDelete: (file) => void handleDelete(file),
              onUpload: () => setUploadDialogOpen(true),
            }}
            detail={{
              file: selectedFile,
              detail: documentDetail,
              analysis: documentAnalysis,
              analysisLoading,
              analysisError,
              hydeQuestions,
              hydeLoading,
              hydeError,
              loading: detailLoading,
              error: detailError,
              selectedCategory,
              selectedDatabase,
              highlightChunkId,
              highlightQuery,
              onClose: clearSelectedRow,
              onDownload: (file) => void handleDownload(file),
              onDelete: (file) => void handleDelete(file),
              onAnalyze: (file) => void analyzeSelectedFile(file),
              onGenerateQuestions: (file) => void generateSelectedFileQuestions(file),
            }}
          />
          {uploadDialogOpen && (
            <KbLibraryUploadPanel
              activeLibraryLabel={activeLibraryLabel}
              categoryLabel={selectedDatabase ? "" : "未选择知识库"}
              canUpload={canUploadToSelectedLibrary}
              uploading={uploading}
              urlIngesting={urlIngesting}
              urlValue={urlValue}
              uploadRuns={uploadRuns}
              onChooseFiles={() => uploadInputRef.current?.click()}
              onUploadFiles={(files) => void handleUploadFiles(files)}
              onUrlChange={setUrlValue}
              onSubmitUrl={() => void handleIngestUrl()}
              onClearRuns={() => setUploadRuns([])}
              onOpenPending={(pendingIds) => {
                setFocusPendingIds(pendingIds);
                setLibraryMode("pending");
                setUploadDialogOpen(false);
              }}
              onOpenTasks={() => {
                setLibraryMode("tasks");
                setUploadDialogOpen(false);
              }}
              onClose={() => setUploadDialogOpen(false)}
            />
          )}
          {createLibraryDialog && (
            <KbCreateLibraryDialog
              name={createLibraryDialog.name}
              description={createLibraryDialog.description}
              saving={createLibrarySaving}
              onNameChange={(nextValue) => {
                setCreateLibraryName(nextValue);
              }}
              onDescriptionChange={(nextValue) => {
                setCreateLibraryDescription(nextValue);
              }}
              onSubmit={() => void submitCreateLibrary()}
              onClose={closeCreateLibraryDialog}
            />
          )}
        </div>
      </div>
      {confirmDialogNode}
    </main>
  );
}
