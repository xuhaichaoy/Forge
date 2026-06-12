import {
  executeKbLibraryDocumentBatchDelete,
  executeKbLibraryDocumentDelete,
  executeKbLibraryTaskCancel,
  executeKbLibraryTaskDelete,
  executeKbLibraryTaskRetry,
} from "../src/components/kb-library-document-actions";
import type { FileRow } from "../src/components/kb-library-model";
import type { YuxiLibraryDocument, YuxiTask } from "../src/lib/yuxi-client";

export default async function runKbLibraryDocumentActionsTests(): Promise<void> {
  await skipsDeleteWhenConfirmationIsRejected();
  await deletesSelectedDocumentAndRefreshes();
  await batchDeletesRowsGroupedByDatabase();
  await reportsEmptyBatchSelection();
  await cancelsAndDeletesTasksById();
  await retriesTaskAndReportsFailures();
}

async function skipsDeleteWhenConfirmationIsRejected(): Promise<void> {
  const calls: string[] = [];
  await executeKbLibraryDocumentDelete({
    file: fileRow("db-a", "file-a", "方案.pdf"),
    selectedRowId: "db-a:file-a",
    confirmDialog: async () => false,
    clearSelectedRow: () => calls.push("clear-selected"),
    clearDocumentDetail: () => calls.push("clear-detail"),
    loadDocuments: async () => {
      calls.push("load-documents");
    },
    reportError: (message) => calls.push(`error:${String(message)}`),
    reportNotice: (message) => calls.push(`notice:${String(message)}`),
    deleteDocument: async () => {
      calls.push("delete");
      return {};
    },
  });

  assertDeepEqual(calls, [], "rejected delete confirmation should leave state untouched");
}

async function deletesSelectedDocumentAndRefreshes(): Promise<void> {
  const calls: string[] = [];
  await executeKbLibraryDocumentDelete({
    file: fileRow("db-a", "file-a", "方案.pdf"),
    selectedRowId: "db-a:file-a",
    confirmDialog: async (message) => {
      calls.push(message);
      return true;
    },
    clearSelectedRow: () => calls.push("clear-selected"),
    clearDocumentDetail: () => calls.push("clear-detail"),
    loadDocuments: async () => {
      calls.push("load-documents");
    },
    reportError: (message) => calls.push(`error:${String(message)}`),
    reportNotice: (message) => calls.push(`notice:${String(message)}`),
    deleteDocument: async (file) => {
      calls.push(`delete:${file.file_id ?? ""}`);
      return {};
    },
  });

  assertDeepEqual(calls, [
    "确定删除「方案.pdf」吗？",
    "error:null",
    "notice:null",
    "delete:file-a",
    "clear-selected",
    "clear-detail",
    "load-documents",
  ], "selected document delete should clear detail and refresh");
}

async function batchDeletesRowsGroupedByDatabase(): Promise<void> {
  const calls: string[] = [];
  await executeKbLibraryDocumentBatchDelete({
    checkedRows: [
      fileRow("db-a", "file-a", "A.pdf"),
      fileRow("db-a", "file-b", "B.pdf"),
      fileRow("db-b", "file-c", "C.pdf"),
      fileRow(null, "file-d", "D.pdf"),
    ],
    confirmDialog: async (message) => {
      calls.push(message);
      return true;
    },
    clearCheckedRows: () => calls.push("clear-checked"),
    clearSelectedRow: () => calls.push("clear-selected"),
    clearDocumentDetail: () => calls.push("clear-detail"),
    loadDocuments: async () => {
      calls.push("load-documents");
    },
    reportError: (message) => calls.push(`error:${String(message)}`),
    reportNotice: (message) => calls.push(`notice:${String(message)}`),
    batchDeleteDocuments: async (dbId, fileIds) => {
      calls.push(`delete:${dbId}:${fileIds.join(",")}`);
      return {};
    },
  });

  assertDeepEqual(calls, [
    "确定批量删除 3 条资料吗？",
    "error:null",
    "notice:null",
    "delete:db-a:file-a,file-b",
    "delete:db-b:file-c",
    "clear-checked",
    "clear-selected",
    "clear-detail",
    "notice:已删除 3 条资料",
    "load-documents",
  ], "batch delete should group valid rows by database");
}

async function reportsEmptyBatchSelection(): Promise<void> {
  const calls: string[] = [];
  await executeKbLibraryDocumentBatchDelete({
    checkedRows: [fileRow(null, null, "missing.pdf")],
    confirmDialog: async () => {
      calls.push("confirm");
      return true;
    },
    clearCheckedRows: () => calls.push("clear-checked"),
    clearSelectedRow: () => calls.push("clear-selected"),
    clearDocumentDetail: () => calls.push("clear-detail"),
    loadDocuments: async () => {
      calls.push("load-documents");
    },
    reportError: (message) => calls.push(`error:${String(message)}`),
    reportNotice: (message) => calls.push(`notice:${String(message)}`),
    batchDeleteDocuments: async () => {
      calls.push("delete");
      return {};
    },
  });

  assertDeepEqual(calls, ["error:请先选择要删除的资料。"], "empty batch delete should report a selection error");
}

async function cancelsAndDeletesTasksById(): Promise<void> {
  const cancelCalls: string[] = [];
  await executeKbLibraryTaskCancel({
    task: { id: "task-a" },
    confirmDialog: async () => false,
    loadTasks: async () => {
      cancelCalls.push("load-tasks");
    },
    reportError: (message) => cancelCalls.push(`error:${String(message)}`),
    reportNotice: (message) => cancelCalls.push(`notice:${String(message)}`),
    taskAction: async (taskId) => {
      cancelCalls.push(`cancel:${taskId}`);
    },
  });

  const deleteCalls: string[] = [];
  await executeKbLibraryTaskDelete({
    task: { id: "task-b", name: "导入资料" },
    confirmDialog: async (message) => {
      deleteCalls.push(message);
      return true;
    },
    loadTasks: async () => {
      deleteCalls.push("load-tasks");
    },
    reportError: (message) => deleteCalls.push(`error:${String(message)}`),
    reportNotice: (message) => deleteCalls.push(`notice:${String(message)}`),
    taskAction: async (taskId) => {
      deleteCalls.push(`delete:${taskId}`);
    },
  });

  assertDeepEqual(cancelCalls, ["error:null", "cancel:task-a", "load-tasks"], "task cancel should clear error and refresh tasks");
  assertDeepEqual(deleteCalls, [
    "清理处理记录「导入资料」吗？这不会影响已入库资料。",
    "error:null",
    "delete:task-b",
    "load-tasks",
  ], "task delete should require confirmation and refresh tasks");
}

async function retriesTaskAndReportsFailures(): Promise<void> {
  const successCalls: string[] = [];
  await executeKbLibraryTaskRetry({
    task: { id: "task-a" },
    confirmDialog: async () => true,
    loadTasks: async () => {
      successCalls.push("load-tasks");
    },
    reportError: (message) => successCalls.push(`error:${String(message)}`),
    reportNotice: (message) => successCalls.push(`notice:${String(message)}`),
    retryTask: async (task) => {
      successCalls.push(`retry:${task.id ?? ""}`);
    },
  });

  const failureCalls: string[] = [];
  await executeKbLibraryTaskRetry({
    task: { id: "task-b" },
    confirmDialog: async () => true,
    loadTasks: async () => {
      failureCalls.push("load-tasks");
    },
    reportError: (message) => failureCalls.push(`error:${String(message)}`),
    reportNotice: (message) => failureCalls.push(`notice:${String(message)}`),
    retryTask: async () => {
      throw new Error("重试失败");
    },
  });

  assertDeepEqual(successCalls, [
    "error:null",
    "notice:null",
    "retry:task-a",
    "notice:重试任务已提交",
    "load-tasks",
  ], "task retry should report submission and refresh tasks");
  assertDeepEqual(failureCalls, [
    "error:null",
    "notice:null",
    "error:重试失败",
  ], "task retry failure should report the error");
}

function fileRow(dbId: string | null, fileId: string | null, name: string): FileRow {
  return {
    id: `${dbId ?? "missing"}:${fileId ?? "missing"}`,
    name,
    ext: "PDF",
    date: "2026-06-11",
    updatedDate: "2026-06-11",
    source: "知识库",
    uploadedBy: "tester",
    batchLabel: "batch",
    versionLabel: "首次入库",
    pendingReason: "无待处理",
    categories: [],
    bizLine: "all",
    raw: libraryDocument(dbId, fileId, name),
  };
}

function libraryDocument(dbId: string | null, fileId: string | null, filename: string): YuxiLibraryDocument {
  return {
    db_id: dbId,
    file_id: fileId,
    filename,
    kb_name: dbId ?? "",
    status: "done",
    created_at: "2026-06-11T10:00:00Z",
  };
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Assertion failed: ${message}\n  expected: ${expectedJson}\n  actual:   ${actualJson}`);
  }
}
