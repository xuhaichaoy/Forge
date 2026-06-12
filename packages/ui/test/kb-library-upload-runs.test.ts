import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  formatUploadTime,
  summarizeUploadRuns,
  UploadBatchTable,
  uploadRunStatusLabel,
  uploadRunStatusTone,
} from "../src/components/kb-library-upload-runs";
import type { LibraryUploadRun } from "../src/components/kb-library-model";

export default function runKbLibraryUploadRunsTests(): void {
  summarizesUploadRunStates();
  mapsUploadRunStatusLabelsAndTones();
  rendersUploadBatchActions();
}

function summarizesUploadRunStates(): void {
  assertDeepEqual(
    summarizeUploadRuns([
      uploadRun("done", "done.docx"),
      uploadRun("failed", "failed.docx"),
      uploadRun("queued", "queued.docx"),
      uploadRun("processing", "processing.docx"),
      uploadRun("uploading", "uploading.docx"),
    ]),
    { done: 1, failed: 1, queued: 1, processing: 2 },
    "upload run summary should bucket uploading as processing",
  );
}

function mapsUploadRunStatusLabelsAndTones(): void {
  assertEqual(uploadRunStatusLabel("done"), "完成", "done status label");
  assertEqual(uploadRunStatusLabel("failed"), "失败", "failed status label");
  assertEqual(uploadRunStatusLabel("queued"), "需处理", "queued status label");
  assertEqual(uploadRunStatusLabel("processing"), "处理中", "processing status label");
  assertEqual(uploadRunStatusTone("done"), "ok", "done status tone");
  assertEqual(uploadRunStatusTone("failed"), "fail", "failed status tone");
  assertEqual(uploadRunStatusTone("uploading"), "pending", "uploading status tone");
  assertEqual(formatUploadTime(0), "未记录", "missing upload timestamp should be explicit");
}

function rendersUploadBatchActions(): void {
  const html = renderToStaticMarkup(createElement(UploadBatchTable, {
    runs: [
      uploadRun("done", "done.docx"),
      uploadRun("failed", "failed.docx"),
      uploadRun("queued", "queued.docx", { pendingIds: [7, 8] }),
      uploadRun("processing", "processing.docx", { taskId: "task-1", progress: 34 }),
    ],
    onClear: () => undefined,
    onOpenPending: () => undefined,
    onOpenTasks: () => undefined,
    onChooseFiles: () => undefined,
  }));

  assertIncludes(html, "4 条资料 · 已入库 1 · 需处理 1 · 失败 1", "summary row should render counts");
  assertIncludes(html, "去处理", "queued summary action should render");
  assertIncludes(html, "查看记录", "processing summary action should render");
  assertIncludes(html, "重新选择文件", "failed summary action should render");
  assertIncludes(html, "处理", "queued row action should render");
  assertIncludes(html, "记录", "task row action should render");
  assertIncludes(html, "重试", "failed row action should render");
  assertIncludes(html, "hc-kb-detail-muted", "done row should render muted no-op next step");
  assertIncludes(html, "未记录", "missing timestamp should render explicit fallback");
}

function uploadRun(
  status: LibraryUploadRun["status"],
  filename: string,
  patch: Partial<LibraryUploadRun> = {},
): LibraryUploadRun {
  return {
    id: `${status}:${filename}`,
    batchId: "batch-1",
    filename,
    targetName: "默认知识库",
    sourceType: "file",
    status,
    message: status === "failed" ? "上传失败" : "处理中",
    createdAt: 0,
    ...patch,
  };
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}

function assertIncludes(actual: string, expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}
