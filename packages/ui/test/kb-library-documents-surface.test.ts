import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { FileRow } from "../src/components/kb-library-model";
import {
  KbLibraryDetailDrawer,
  KbLibraryDocumentsSection,
} from "../src/components/kb-library-documents-surface";

export default function runKbLibraryDocumentsSurfaceTests(): void {
  rendersEmptyDocumentsSectionUploadAction();
  rendersDocumentsBulkbarAndRows();
  rendersDetailDrawerWithCloseAction();
}

function rendersEmptyDocumentsSectionUploadAction(): void {
  const html = renderToStaticMarkup(createElement(KbLibraryDocumentsSection, {
    hasDocuments: false,
    rows: [],
    allRowsCount: 0,
    loading: false,
    selectedRowId: null,
    checkedRowIds: new Set<string>(),
    checkedCount: 0,
    statusFilter: "all",
    typeFilter: "all",
    detailOpen: false,
    onStatusFilterChange: () => undefined,
    onTypeFilterChange: () => undefined,
    onBatchDelete: () => undefined,
    onSelect: () => undefined,
    onToggleChecked: () => undefined,
    onToggleAll: () => undefined,
    onDownload: () => undefined,
    onDelete: () => undefined,
    onUpload: () => undefined,
  }));
  assertIncludes(html, "暂无资料", "empty section should render empty title");
  assertIncludes(html, "上传资料", "empty section should expose upload action");
}

function rendersDocumentsBulkbarAndRows(): void {
  const row = fileRow();
  const html = renderToStaticMarkup(createElement(KbLibraryDocumentsSection, {
    hasDocuments: true,
    rows: [row],
    allRowsCount: 3,
    loading: false,
    selectedRowId: row.id,
    checkedRowIds: new Set([row.id]),
    checkedCount: 1,
    statusFilter: "indexed",
    typeFilter: "PDF",
    detailOpen: true,
    onStatusFilterChange: () => undefined,
    onTypeFilterChange: () => undefined,
    onBatchDelete: () => undefined,
    onSelect: () => undefined,
    onToggleChecked: () => undefined,
    onToggleAll: () => undefined,
    onDownload: () => undefined,
    onDelete: () => undefined,
    onUpload: () => undefined,
  }));
  assertIncludes(html, "已选 1 条", "bulkbar should render checked count");
  assertIncludes(html, "方案.pdf", "table should render file row");
  assertIncludes(html, "data-detail-open=\"true\"", "section should reflect detail-open layout state");
}

function rendersDetailDrawerWithCloseAction(): void {
  const html = renderToStaticMarkup(createElement(KbLibraryDetailDrawer, {
    file: fileRow(),
    detail: null,
    analysis: null,
    analysisLoading: false,
    analysisError: null,
    hydeQuestions: [],
    hydeLoading: false,
    hydeError: null,
    loading: false,
    error: null,
    selectedCategory: null,
    selectedDatabase: null,
    highlightChunkId: null,
    highlightQuery: null,
    onClose: () => undefined,
    onDownload: () => undefined,
    onDelete: () => undefined,
    onAnalyze: () => undefined,
    onGenerateQuestions: () => undefined,
  }));
  assertIncludes(html, "资料详情", "drawer should render dialog label");
  assertIncludes(html, "关闭资料详情", "drawer should render scrim close label");
  assertIncludes(html, "方案.pdf", "drawer should render detail panel content");
}

function fileRow(): FileRow {
  return {
    id: "db-a:file-a",
    name: "方案.pdf",
    ext: "PDF",
    date: "2026-06-11",
    updatedDate: "2026-06-11",
    source: "方案库",
    uploadedBy: "tester",
    batchLabel: "batch",
    versionLabel: "首次入库",
    pendingReason: "无待处理",
    categories: [],
    bizLine: "all",
    raw: {
      db_id: "db-a",
      file_id: "file-a",
      filename: "方案.pdf",
      status: "done",
    },
  };
}

function assertIncludes(actual: string, expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}
