import { useCallback } from "react";
import {
  batchDeleteYuxiKnowledgeDocuments,
  cancelYuxiTask,
  deleteYuxiKnowledgeDocument,
  deleteYuxiTask,
  downloadYuxiKnowledgeDocument,
  type YuxiTask,
} from "../lib/yuxi-client";
import type { FileRow } from "./kb-library-model";
import { retryYuxiKnowledgeTask } from "./kb-library-upload-workflow";
import { groupRowsByDatabase } from "./kb-library-view-model";

type MessageReporter = (message: string | null) => void;
type ConfirmDialog = (message: string) => Promise<boolean>;
type DeleteDocument = typeof deleteYuxiKnowledgeDocument;
type BatchDeleteDocuments = typeof batchDeleteYuxiKnowledgeDocuments;
type TaskByIdAction = (taskId: string) => Promise<unknown>;
type RetryTaskAction = typeof retryYuxiKnowledgeTask;

interface KbLibraryDocumentActionsOptions {
  checkedRows: FileRow[];
  selectedRowId: string | null;
  confirmDialog: ConfirmDialog;
  clearCheckedRows: () => void;
  clearSelectedRow: () => void;
  clearDocumentDetail: () => void;
  loadDocuments: () => Promise<void>;
  reportError: MessageReporter;
  reportNotice: MessageReporter;
}

interface KbLibraryDocumentCommandOptions extends KbLibraryDocumentActionsOptions {
  deleteDocument?: DeleteDocument;
  batchDeleteDocuments?: BatchDeleteDocuments;
}

interface DeleteDocumentCommandOptions extends Omit<KbLibraryDocumentCommandOptions, "checkedRows" | "clearCheckedRows" | "batchDeleteDocuments"> {
  file: FileRow;
}

interface BatchDeleteDocumentsCommandOptions extends Omit<KbLibraryDocumentCommandOptions, "selectedRowId" | "deleteDocument"> {}

interface DownloadDocumentCommandOptions {
  file: FileRow;
  reportError: MessageReporter;
}

export async function executeKbLibraryDocumentDownload({
  file,
  reportError,
}: DownloadDocumentCommandOptions): Promise<void> {
  reportError(null);
  try {
    const blob = await downloadYuxiKnowledgeDocument(file.raw);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    reportError(err instanceof Error ? err.message : String(err));
  }
}

export async function executeKbLibraryDocumentDelete({
  file,
  selectedRowId,
  confirmDialog,
  clearSelectedRow,
  clearDocumentDetail,
  loadDocuments,
  reportError,
  reportNotice,
  deleteDocument = deleteYuxiKnowledgeDocument,
}: DeleteDocumentCommandOptions): Promise<void> {
  if (!(await confirmDialog(`确定删除「${file.name}」吗？`))) return;
  reportError(null);
  reportNotice(null);
  try {
    await deleteDocument(file.raw);
    if (selectedRowId === file.id) {
      clearSelectedRow();
      clearDocumentDetail();
    }
    await loadDocuments();
  } catch (err) {
    reportError(err instanceof Error ? err.message : String(err));
  }
}

export async function executeKbLibraryDocumentBatchDelete({
  checkedRows,
  confirmDialog,
  clearCheckedRows,
  clearSelectedRow,
  clearDocumentDetail,
  loadDocuments,
  reportError,
  reportNotice,
  batchDeleteDocuments = batchDeleteYuxiKnowledgeDocuments,
}: BatchDeleteDocumentsCommandOptions): Promise<void> {
  const groups = groupRowsByDatabase(checkedRows);
  const total = groups.reduce((sum, item) => sum + item.fileIds.length, 0);
  if (total === 0) {
    reportError("请先选择要删除的资料。");
    return;
  }
  if (!(await confirmDialog(`确定批量删除 ${total} 条资料吗？`))) return;
  reportError(null);
  reportNotice(null);
  try {
    for (const group of groups) {
      await batchDeleteDocuments(group.dbId, group.fileIds);
    }
    clearCheckedRows();
    clearSelectedRow();
    clearDocumentDetail();
    reportNotice(`已删除 ${total} 条资料`);
    await loadDocuments();
  } catch (err) {
    reportError(err instanceof Error ? err.message : String(err));
  }
}

export function useKbLibraryDocumentActions({
  checkedRows,
  selectedRowId,
  confirmDialog,
  clearCheckedRows,
  clearSelectedRow,
  clearDocumentDetail,
  loadDocuments,
  reportError,
  reportNotice,
}: KbLibraryDocumentActionsOptions) {
  const handleDownload = useCallback(async (file: FileRow) => {
    await executeKbLibraryDocumentDownload({ file, reportError });
  }, [reportError]);

  const handleDelete = useCallback(async (file: FileRow) => {
    await executeKbLibraryDocumentDelete({
      file,
      selectedRowId,
      confirmDialog,
      clearSelectedRow,
      clearDocumentDetail,
      loadDocuments,
      reportError,
      reportNotice,
    });
  }, [
    clearDocumentDetail,
    clearSelectedRow,
    confirmDialog,
    loadDocuments,
    reportError,
    reportNotice,
    selectedRowId,
  ]);

  const handleBatchDelete = useCallback(async () => {
    await executeKbLibraryDocumentBatchDelete({
      checkedRows,
      confirmDialog,
      clearCheckedRows,
      clearSelectedRow,
      clearDocumentDetail,
      loadDocuments,
      reportError,
      reportNotice,
    });
  }, [
    checkedRows,
    clearCheckedRows,
    clearDocumentDetail,
    clearSelectedRow,
    confirmDialog,
    loadDocuments,
    reportError,
    reportNotice,
  ]);

  return {
    handleDownload,
    handleDelete,
    handleBatchDelete,
  };
}

interface KbLibraryTaskActionsOptions {
  confirmDialog: ConfirmDialog;
  loadTasks: () => Promise<void>;
  reportError: MessageReporter;
  reportNotice: MessageReporter;
}

interface TaskActionCommandOptions extends KbLibraryTaskActionsOptions {
  task: YuxiTask;
  taskAction?: TaskByIdAction;
  retryTask?: RetryTaskAction;
}

export async function executeKbLibraryTaskCancel({
  task,
  loadTasks,
  reportError,
  taskAction = cancelYuxiTask,
}: TaskActionCommandOptions): Promise<void> {
  if (!task.id) return;
  reportError(null);
  try {
    await taskAction(task.id);
    await loadTasks();
  } catch (err) {
    reportError(err instanceof Error ? err.message : String(err));
  }
}

export async function executeKbLibraryTaskDelete({
  task,
  confirmDialog,
  loadTasks,
  reportError,
  taskAction = deleteYuxiTask,
}: TaskActionCommandOptions): Promise<void> {
  if (!task.id) return;
  if (!(await confirmDialog(`清理处理记录「${task.name || task.id}」吗？这不会影响已入库资料。`))) return;
  reportError(null);
  try {
    await taskAction(task.id);
    await loadTasks();
  } catch (err) {
    reportError(err instanceof Error ? err.message : String(err));
  }
}

export async function executeKbLibraryTaskRetry({
  task,
  loadTasks,
  reportError,
  reportNotice,
  retryTask = retryYuxiKnowledgeTask,
}: TaskActionCommandOptions): Promise<void> {
  reportError(null);
  reportNotice(null);
  try {
    await retryTask(task);
    reportNotice("重试任务已提交");
    await loadTasks();
  } catch (err) {
    reportError(err instanceof Error ? err.message : String(err));
  }
}

export function useKbLibraryTaskActions({
  confirmDialog,
  loadTasks,
  reportError,
  reportNotice,
}: KbLibraryTaskActionsOptions) {
  const handleCancelTask = useCallback(async (task: YuxiTask) => {
    await executeKbLibraryTaskCancel({ task, confirmDialog, loadTasks, reportError, reportNotice });
  }, [confirmDialog, loadTasks, reportError, reportNotice]);

  const handleDeleteTask = useCallback(async (task: YuxiTask) => {
    await executeKbLibraryTaskDelete({ task, confirmDialog, loadTasks, reportError, reportNotice });
  }, [confirmDialog, loadTasks, reportError, reportNotice]);

  const handleRetryTask = useCallback(async (task: YuxiTask) => {
    await executeKbLibraryTaskRetry({ task, confirmDialog, loadTasks, reportError, reportNotice });
  }, [confirmDialog, loadTasks, reportError, reportNotice]);

  return {
    handleCancelTask,
    handleDeleteTask,
    handleRetryTask,
  };
}
