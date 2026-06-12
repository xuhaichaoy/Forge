import type { FileRow } from "../src/components/kb-library-model";
import { knowledgeFileIdentity } from "../src/components/kb-library-document-detail-state";

export default function runKbLibraryDocumentDetailStateTests(): void {
  readsKnowledgeFileIdentity();
  rejectsIncompleteKnowledgeFileIdentity();
}

function readsKnowledgeFileIdentity(): void {
  assertDeepEqual(
    knowledgeFileIdentity(fileRow({ db_id: "db-a", file_id: "file-a" })),
    { dbId: "db-a", fileId: "file-a" },
    "detail actions should use Yuxi database and file ids",
  );
}

function rejectsIncompleteKnowledgeFileIdentity(): void {
  assertDeepEqual(
    knowledgeFileIdentity(fileRow({ db_id: "db-a", file_id: null })),
    null,
    "detail actions should reject missing file ids",
  );
  assertDeepEqual(
    knowledgeFileIdentity(fileRow({ db_id: null, file_id: "file-a" })),
    null,
    "detail actions should reject missing database ids",
  );
}

function fileRow(raw: FileRow["raw"]): FileRow {
  return {
    id: `${raw.db_id ?? "missing"}:${raw.file_id ?? "missing"}`,
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
    raw,
  };
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Assertion failed: ${message}\n  expected: ${expectedJson}\n  actual:   ${actualJson}`);
  }
}
