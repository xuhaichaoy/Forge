import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  KbCreateLibraryDialog,
  KbLibraryDocumentBulkbar,
  KbLibrarySearchSection,
  KbLibraryToolbar,
} from "../src/components/kb-library-workspace";

export default function runKbLibraryWorkspaceTests(): void {
  rendersSearchSectionWithScopedPlaceholderAndAlerts();
  rendersToolbarTabsAndUploadState();
  rendersDocumentBulkbarFiltersAndSelectionState();
  rendersCreateLibraryDialogState();
}

function rendersSearchSectionWithScopedPlaceholderAndAlerts(): void {
  const markup = renderToStaticMarkup(
    createElement(KbLibrarySearchSection, {
      selectedDatabaseName: "方案库",
      searchQuery: "培训",
      error: "检索失败",
      notice: "已同步",
      onSearchQueryChange: () => undefined,
      onCommitSearch: () => undefined,
    }),
  );
  assertIncludes(markup, "搜索方案库资料", "search placeholder should include selected library name");
  assertIncludes(markup, "检索失败", "search section should render errors");
  assertIncludes(markup, "已同步", "search section should render notices");
  assertIncludes(markup, "清除搜索", "clear button should be available when query is non-empty");
}

function rendersToolbarTabsAndUploadState(): void {
  const markup = renderToStaticMarkup(
    createElement(KbLibraryToolbar, {
      activeLibraryLabel: "全部知识库",
      showTabs: true,
      activeTab: "documents",
      disabledManagement: true,
      counts: { documents: 12, pending: 2, integrations: 3, tasks: 1 },
      canUpload: false,
      uploading: false,
      onSelectTab: () => undefined,
      onUpload: () => undefined,
    }),
  );
  assertIncludes(markup, "全部知识库", "toolbar should render active library label");
  assertIncludes(markup, "资料", "toolbar should render workspace tabs");
  assertIncludes(markup, "上传资料", "toolbar should render upload action label");
  assertIncludes(markup, "disabled=\"\"", "upload action should be disabled when no library is selected");
}

function rendersDocumentBulkbarFiltersAndSelectionState(): void {
  const markup = renderToStaticMarkup(
    createElement(KbLibraryDocumentBulkbar, {
      selectedCount: 2,
      filteredCount: 3,
      totalCount: 9,
      statusFilter: "indexed",
      typeFilter: "PDF",
      onStatusFilterChange: () => undefined,
      onTypeFilterChange: () => undefined,
      onBatchDelete: () => undefined,
    }),
  );
  assertIncludes(markup, "已选 2 条", "bulkbar should prefer selected count over row count");
  assertIncludes(markup, "全部状态", "bulkbar should render status filter");
  assertIncludes(markup, "PDF", "bulkbar should render type filter");
  assert(!markup.includes("disabled=\"\""), "batch delete should be enabled when rows are selected");
}

function rendersCreateLibraryDialogState(): void {
  const markup = renderToStaticMarkup(
    createElement(KbCreateLibraryDialog, {
      name: "",
      description: "",
      saving: false,
      onNameChange: () => undefined,
      onDescriptionChange: () => undefined,
      onSubmit: () => undefined,
      onClose: () => undefined,
    }),
  );
  assertIncludes(markup, "新建知识库", "dialog should render title");
  assertIncludes(markup, "知识库名称", "dialog should render name field");
  assertIncludes(markup, "创建知识库", "dialog should render submit action");
  assertIncludes(markup, "disabled=\"\"", "submit should be disabled when name is blank");
}

function assertIncludes(haystack: string, needle: string, message: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(`${message}: expected ${JSON.stringify(haystack)} to include ${JSON.stringify(needle)}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}
