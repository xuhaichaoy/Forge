import type { YuxiKnowledgeDatabase, YuxiLibraryDocument, YuxiTask } from "../src/lib/yuxi-client";
import type { FileRow } from "../src/components/kb-library-model";
import {
  buildLibraryDocumentWorkspace,
  countActiveTasks,
  databaseAsCategory,
  documentRowMatchesFilters,
  documentStatusGroup,
  groupRowsByDatabase,
  objectRecord,
  selectCheckedDocumentRows,
  stringArray,
  taskPayloadDbId,
  taskPayloadHasDbId,
} from "../src/components/kb-library-view-model";

export default function runKbLibraryViewModelTests(): void {
  groupsRowsByDatabaseAndSkipsIncompleteRows();
  mapsDocumentStatusesAndFiltersRows();
  buildsDocumentWorkspaceProjection();
  countsActiveTasksByDatabase();
  readsTaskPayloadHelpersDefensively();
  mapsDatabaseToPanelCategoryShape();
}

function groupsRowsByDatabaseAndSkipsIncompleteRows(): void {
  assertDeepEqual(
    groupRowsByDatabase([
      fileRow("db-a", "file-1"),
      fileRow("db-a", "file-2"),
      fileRow("db-b", "file-3"),
      fileRow(null, "file-4"),
      fileRow("db-c", null),
    ]),
    [
      { dbId: "db-a", fileIds: ["file-1", "file-2"] },
      { dbId: "db-b", fileIds: ["file-3"] },
    ],
    "batch operations should group complete rows by db id",
  );
}

function mapsDocumentStatusesAndFiltersRows(): void {
  assertEqual(documentStatusGroup("done"), "indexed", "done should count as indexed");
  assertEqual(documentStatusGroup("error_parsing"), "failed", "parse errors should count as failed");
  assertEqual(documentStatusGroup("running"), "processing", "running should count as processing");
  assertEqual(documentStatusGroup(null), "unknown", "missing status should be unknown");
  assert(documentRowMatchesFilters(fileRow("db-a", "file-1", { ext: "PDF", status: "done" }), "indexed", "PDF"), "matching row should pass filters");
  assert(!documentRowMatchesFilters(fileRow("db-a", "file-1", { ext: "PDF", status: "done" }), "failed", "PDF"), "status mismatch should fail filters");
  assert(!documentRowMatchesFilters(fileRow("db-a", "file-1", { ext: "DOC", status: "done" }), "indexed", "PDF"), "type mismatch should fail filters");
}

function buildsDocumentWorkspaceProjection(): void {
  const documents: YuxiLibraryDocument[] = [
    libraryDocument("db-a", "file-a", "方案.pdf", { status: "done" }),
    libraryDocument("db-a", "file-b", "失败.docx", { status: "failed" }),
  ];
  const allDocuments: YuxiLibraryDocument[] = [
    ...documents,
    libraryDocument("db-b", "file-c", "搜索命中.pdf", { status: "done" }),
  ];
  const databases: YuxiKnowledgeDatabase[] = [
    { db_id: "db-a", name: "方案库" },
    { db_id: "db-b", name: "历史库", file_count: 7 },
  ];
  const projection = buildLibraryDocumentWorkspace({
    documents,
    allDocuments,
    databases,
    selectedDatabase: databases[0] ?? null,
    selectedRowId: "db-b:file-c",
    statusFilter: "indexed",
    typeFilter: "PDF",
  });
  const checkedRows = selectCheckedDocumentRows(projection.rows, new Set(["db-a:file-a", "db-b:file-c"]));

  assertEqual(projection.hasDocuments, true, "workspace should report existing documents before filters");
  assertDeepEqual(projection.rows.map((row) => row.id), ["db-a:file-a"], "workspace should apply status and type filters");
  assertEqual(projection.selectedFile?.id, "db-b:file-c", "search state should resolve selected file from all documents");
  assertDeepEqual(checkedRows.map((row) => row.id), ["db-a:file-a"], "checked rows should be limited to current filtered rows");
  assertEqual(projection.totalCount, 3, "total count should use all documents");
  assertEqual(projection.selectedDatabaseCount, 2, "selected database count should fall back to all document counts");
  assertDeepEqual(
    projection.navDatabases.map((db) => [db.db_id, db.file_count]),
    [["db-a", 2], ["db-b", 7]],
    "navigation database counts should prefer server count and fall back to documents",
  );
}

function countsActiveTasksByDatabase(): void {
  const tasks: YuxiTask[] = [
    { id: "1", status: "pending", payload: { db_id: "db-a" } },
    { id: "2", status: "running", payload: { dbIds: ["db-a", "db-b"] } },
    { id: "3", status: "success", payload: { db_id: "db-a" } },
    { id: "4", status: "failed", payload: { db_id: "db-b" } },
  ];
  assertEqual(countActiveTasks(tasks, null), 2, "all libraries should count pending and running tasks");
  assertEqual(countActiveTasks(tasks, "db-a"), 2, "selected library should count matching direct and array db ids");
  assertEqual(countActiveTasks(tasks, "db-b"), 1, "selected library should count matching array db ids");
}

function readsTaskPayloadHelpersDefensively(): void {
  assert(taskPayloadHasDbId({ db_id: "db-a" }, "db-a"), "direct db_id should match");
  assert(taskPayloadHasDbId({ dbIds: ["db-b", "db-c"] }, "db-c"), "camel-case dbIds should match");
  assert(!taskPayloadHasDbId(undefined, "db-a"), "missing payload should not match");
  assertEqual(taskPayloadDbId({ dbId: "db-a" }), "db-a", "taskPayloadDbId should read camel-case id");
  assertEqual(taskPayloadDbId({ db_ids: ["db-a"] }), null, "taskPayloadDbId should only return direct ids");
  assertDeepEqual(stringArray(["a", "", 2, "b"]), ["a", "b"], "stringArray should keep only non-empty strings");
  assertDeepEqual(objectRecord({ a: 1 }), { a: 1 }, "objectRecord should keep plain records");
  assertDeepEqual(objectRecord(["a"]), {}, "objectRecord should reject arrays");
}

function mapsDatabaseToPanelCategoryShape(): void {
  assertDeepEqual(databaseAsCategory(null), null, "missing database should not project a category");
  assertDeepEqual(
    databaseAsCategory({
      db_id: "db-a",
      name: "方案库",
      category: "proposal",
      business_line: "bidding",
      description: "投标资料",
    }),
    {
      key: "proposal",
      label: "方案库",
      line: "bidding",
      kind: "proposal",
      description: "投标资料",
    },
    "database category projection should preserve library-owned fields",
  );
}

function fileRow(
  dbId: string | null,
  fileId: string | null,
  overrides: Partial<FileRow> & { status?: string | null } = {},
): FileRow {
  return {
    id: `${dbId ?? "missing"}:${fileId ?? "missing"}`,
    name: "file.pdf",
    ext: overrides.ext ?? "PDF",
    date: "2026-06-11",
    updatedDate: "2026-06-11",
    source: "知识库",
    uploadedBy: "tester",
    batchLabel: "batch",
    versionLabel: "首次入库",
    pendingReason: "无待处理",
    categories: [],
    bizLine: "all",
    raw: {
      db_id: dbId,
      file_id: fileId,
      filename: "file.pdf",
      status: overrides.status ?? null,
    },
    ...overrides,
  };
}

function libraryDocument(
  dbId: string,
  fileId: string,
  filename: string,
  overrides: Partial<YuxiLibraryDocument> = {},
): YuxiLibraryDocument {
  return {
    db_id: dbId,
    file_id: fileId,
    filename,
    kb_name: dbId === "db-a" ? "方案库" : "历史库",
    status: "done",
    created_at: "2026-06-11T10:00:00Z",
    ...overrides,
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}\n  expected: ${String(expected)}\n  actual:   ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Assertion failed: ${message}\n  expected: ${expectedJson}\n  actual:   ${actualJson}`);
  }
}
