import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import {
  fetchYuxiKnowledgeUrl,
  intakeYuxiKnowledgeFile,
  processYuxiKnowledgeDocuments,
  uploadYuxiKnowledgeFile,
  type YuxiBusinessLine,
  type YuxiKnowledgeDatabase,
} from "../lib/yuxi-client";
import { updateUploadRun, type LibraryUploadRun } from "./kb-library-model";
import {
  isDoneTask,
  isFailedTask,
  isQueuedIntake,
  makeBatchId,
  pendingIdsFromIntake,
  taskMessage,
  uploadDoneMessage,
  uploadRunPatchFromIntake,
  waitForYuxiTask,
} from "./kb-library-upload-workflow";

export interface KbLibraryUploadActionsOptions {
  businessLine: YuxiBusinessLine | null;
  requireSelectedDatabase: () => YuxiKnowledgeDatabase;
  refreshLibraryData: () => Promise<void>;
  reportError: (message: string | null) => void;
  reportNotice: (message: string | null) => void;
  showPendingQueue: () => void;
}

export interface KbLibraryUploadActionsState {
  uploadRuns: LibraryUploadRun[];
  setUploadRuns: Dispatch<SetStateAction<LibraryUploadRun[]>>;
  focusPendingIds: number[];
  setFocusPendingIds: Dispatch<SetStateAction<number[]>>;
  urlValue: string;
  setUrlValue: Dispatch<SetStateAction<string>>;
  uploading: boolean;
  urlIngesting: boolean;
  handleUploadFiles: (files: FileList | File[]) => Promise<void>;
  handleIngestUrl: () => Promise<void>;
}

export interface YuxiUploadDuplicateMetadata {
  same_name_files?: unknown;
  has_same_name?: unknown;
}

export function yuxiSameNameCount(metadata: YuxiUploadDuplicateMetadata): number {
  return Array.isArray(metadata.same_name_files)
    ? metadata.same_name_files.length
    : metadata.has_same_name ? 1 : 0;
}

export function assertDuplicateContentHash(
  sameNameCount: number,
  contentHash: string,
  message: string,
): void {
  if (sameNameCount > 0 && !contentHash) {
    throw new Error(message);
  }
}

export function useKbLibraryUploadActions({
  businessLine,
  requireSelectedDatabase,
  refreshLibraryData,
  reportError,
  reportNotice,
  showPendingQueue,
}: KbLibraryUploadActionsOptions): KbLibraryUploadActionsState {
  const [uploadRuns, setUploadRuns] = useState<LibraryUploadRun[]>([]);
  const [focusPendingIds, setFocusPendingIds] = useState<number[]>([]);
  const [urlValue, setUrlValue] = useState("");
  const [urlIngesting, setUrlIngesting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleUploadFiles = useCallback(async (files: FileList | File[]) => {
    const selected = Array.from(files);
    if (selected.length === 0) return;
    let targetDb: YuxiKnowledgeDatabase;
    try {
      targetDb = requireSelectedDatabase();
    } catch (err) {
      reportError(err instanceof Error ? err.message : String(err));
      return;
    }
    const dbId = targetDb.db_id ?? "";
    const targetName = targetDb.name || "知识库";
    if (!dbId) {
      reportError("系统未返回知识库连接信息。");
      return;
    }
    // 选完文件后不再关闭弹窗--进度/结果直接在弹窗内展示，用户在弹窗里看全过程。
    setUploading(true);
    reportError(null);
    reportNotice(null);
    const batchId = makeBatchId("FILE");
    const createdAt = Date.now();
    setUploadRuns(selected.map((file) => ({
      id: `${dbId}:${file.name}:${file.lastModified}:${file.size}`,
      batchId,
      filename: file.name,
      targetName,
      sourceType: "file",
      status: "uploading",
      message: "上传原文件",
      createdAt,
    })));

    let queuedCount = 0;
    let ingestedCount = 0;
    const queuedPendingIds: number[] = [];
    for (const file of selected) {
      const id = `${dbId}:${file.name}:${file.lastModified}:${file.size}`;
      try {
        const uploaded = await uploadYuxiKnowledgeFile(file, dbId);
        const filePath = uploaded.file_path || uploaded.minio_path;
        if (!filePath) throw new Error("上传成功但系统未返回文件信息");
        const contentHash = uploaded.content_hash ?? "";
        const sameNameCount = yuxiSameNameCount(uploaded);
        assertDuplicateContentHash(sameNameCount, contentHash, "上传成功但系统未返回校验信息，无法进入重复版本处理");
        setUploadRuns((prev) => updateUploadRun(prev, id, {
          contentHash,
          sameNameCount,
          status: "processing",
          message: sameNameCount > 0 ? `发现 ${sameNameCount} 个同名版本，进入入库问题` : "解析、提取档案、入库",
        }));
        if (sameNameCount > 0) {
          const intake = await intakeYuxiKnowledgeFile({
            file_path: filePath,
            filename: uploaded.original_filename || uploaded.filename || file.name,
            file_size: uploaded.size ?? file.size,
            content_hash: contentHash,
            business_line_hint: businessLine,
            scenario_hint: targetDb.category ?? null,
            auto_ingest_db_id: dbId,
          });
          if (isQueuedIntake(intake)) queuedCount += 1;
          else ingestedCount += 1;
          queuedPendingIds.push(...pendingIdsFromIntake(intake));
          setUploadRuns((prev) => updateUploadRun(prev, id, {
            ...uploadRunPatchFromIntake(intake),
          }));
          continue;
        }
        const processResult = await processYuxiKnowledgeDocuments(dbId, [filePath], {
          auto_index: true,
          content_hashes: { [filePath]: contentHash },
        });
        if (!processResult.task_id) {
          const failed = processResult.status === "failed";
          if (!failed) ingestedCount += 1;
          setUploadRuns((prev) => updateUploadRun(prev, id, {
            status: failed ? "failed" : "done",
            progress: failed ? null : 100,
            message: processResult.message || uploadDoneMessage(),
          }));
          continue;
        }
        setUploadRuns((prev) => updateUploadRun(prev, id, {
          status: "processing",
          taskId: processResult.task_id,
          progress: 0,
          message: "解析、提取档案、入库任务已提交",
        }));
        const task = await waitForYuxiTask(processResult.task_id, (nextTask) => {
          setUploadRuns((prev) => updateUploadRun(prev, id, {
            status: isFailedTask(nextTask) ? "failed" : isDoneTask(nextTask) ? "done" : "processing",
            progress: nextTask.progress ?? null,
            message: taskMessage(nextTask),
          }));
        });
        const done = isDoneTask(task);
        if (done) ingestedCount += 1;
        setUploadRuns((prev) => updateUploadRun(prev, id, {
          status: done ? "done" : "failed",
          progress: task.progress ?? (done ? 100 : null),
          message: done ? uploadDoneMessage() : task.error || task.message || "处理失败",
        }));
      } catch (err) {
        setUploadRuns((prev) => updateUploadRun(prev, id, {
          status: "failed",
          message: err instanceof Error ? err.message : String(err),
        }));
      }
    }
    setUploading(false);
    await refreshLibraryData();
    if (queuedCount > 0) {
      setFocusPendingIds(queuedPendingIds);
      reportNotice(`${ingestedCount} 条已入库，${queuedCount} 条进入入库问题`);
      showPendingQueue();
    } else if (ingestedCount > 0) {
      reportNotice(`${ingestedCount} 条资料已解析并入库`);
    }
  }, [businessLine, refreshLibraryData, reportError, reportNotice, requireSelectedDatabase, showPendingQueue]);

  const handleIngestUrl = useCallback(async () => {
    const rawUrl = urlValue.trim();
    if (!rawUrl) return;
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("只支持 http 或 https 地址。");
      }
    } catch (err) {
      reportError(err instanceof Error ? err.message : "请输入完整网页地址。");
      return;
    }

    setUrlIngesting(true);
    reportError(null);
    reportNotice(null);
    let targetDb: YuxiKnowledgeDatabase;
    try {
      targetDb = requireSelectedDatabase();
    } catch (err) {
      setUrlIngesting(false);
      reportError(err instanceof Error ? err.message : String(err));
      return;
    }
    const dbId = targetDb.db_id ?? "";
    const targetName = targetDb.name || "知识库";
    if (!dbId) {
      setUrlIngesting(false);
      reportError("系统未返回知识库连接信息。");
      return;
    }

    // 网页抓取进度同样留在弹窗内展示，不在选完后立即关闭。
    const id = `${dbId}:url:${Date.now()}`;
    const createdAt = Date.now();
    setUploadRuns((prev) => [{
      id,
      batchId: makeBatchId("网页"),
      filename: rawUrl,
      targetName,
      sourceType: "url" as const,
      status: "uploading" as const,
      message: "抓取网页",
      createdAt,
    }, ...prev].slice(0, 12));

    try {
      const fetched = await fetchYuxiKnowledgeUrl(rawUrl, dbId);
      const filePath = fetched.file_path || fetched.minio_path;
      if (!filePath) throw new Error("网页已抓取，但系统未返回文件信息");
      const contentHash = fetched.content_hash ?? "";
      const sameNameCount = yuxiSameNameCount(fetched);
      assertDuplicateContentHash(sameNameCount, contentHash, "网页已抓取，但系统未返回校验信息，无法进入重复版本处理");
      setUploadRuns((prev) => updateUploadRun(prev, id, {
        contentHash,
        sameNameCount,
        status: "processing",
        message: sameNameCount > 0 ? `发现 ${sameNameCount} 个同名版本，进入入库问题` : "解析、提取档案、入库",
      }));

      let queued = false;
      let queuedPendingIds: number[] = [];
      if (sameNameCount > 0) {
        const intake = await intakeYuxiKnowledgeFile({
          file_path: filePath,
          filename: fetched.original_filename || fetched.filename || rawUrl,
          file_size: fetched.size ?? 0,
          content_hash: contentHash,
          business_line_hint: businessLine,
          scenario_hint: targetDb.category ?? null,
          auto_ingest_db_id: dbId,
        });
        queued = isQueuedIntake(intake);
        queuedPendingIds = pendingIdsFromIntake(intake);
        setUploadRuns((prev) => updateUploadRun(prev, id, {
          ...uploadRunPatchFromIntake(intake),
        }));
      } else {
        const processResult = await processYuxiKnowledgeDocuments(dbId, [filePath], {
          auto_index: true,
          source_url: rawUrl,
          content_hashes: { [filePath]: contentHash },
        });
        if (!processResult.task_id) {
          const failed = processResult.status === "failed";
          setUploadRuns((prev) => updateUploadRun(prev, id, {
            status: failed ? "failed" : "done",
            progress: failed ? null : 100,
            message: processResult.message || uploadDoneMessage(),
          }));
        } else {
          setUploadRuns((prev) => updateUploadRun(prev, id, {
            status: "processing",
            taskId: processResult.task_id,
            progress: 0,
            message: "解析、提取档案、入库任务已提交",
          }));
          const task = await waitForYuxiTask(processResult.task_id, (nextTask) => {
            setUploadRuns((prev) => updateUploadRun(prev, id, {
              status: isFailedTask(nextTask) ? "failed" : isDoneTask(nextTask) ? "done" : "processing",
              progress: nextTask.progress ?? null,
              message: taskMessage(nextTask),
            }));
          });
          const done = isDoneTask(task);
          setUploadRuns((prev) => updateUploadRun(prev, id, {
            status: done ? "done" : "failed",
            progress: task.progress ?? (done ? 100 : null),
            message: done ? uploadDoneMessage() : task.error || task.message || "处理失败",
          }));
        }
      }
      setUrlValue("");
      await refreshLibraryData();
      if (queued) {
        setFocusPendingIds(queuedPendingIds);
        reportNotice("网页资料已进入入库问题");
        showPendingQueue();
      } else {
        reportNotice("网页资料已解析、提取档案并入库");
      }
    } catch (err) {
      setUploadRuns((prev) => updateUploadRun(prev, id, {
        status: "failed",
        message: err instanceof Error ? err.message : String(err),
      }));
      reportError(err instanceof Error ? err.message : String(err));
    } finally {
      setUrlIngesting(false);
    }
  }, [businessLine, refreshLibraryData, reportError, reportNotice, requireSelectedDatabase, showPendingQueue, urlValue]);

  return {
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
  };
}
