import type {
  YuxiBusinessLine,
  YuxiCategoryMeta,
  YuxiKnowledgeDatabase,
  YuxiLibraryDocument,
  YuxiTask,
} from "../lib/yuxi-client";
import { toFileRow, type FileRow } from "./kb-library-model";
import type { KbDocumentStatusFilter, KbDocumentTypeFilter } from "./kb-library-workspace";

export function groupRowsByDatabase(rows: FileRow[]): Array<{ dbId: string; fileIds: string[] }> {
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const dbId = row.raw.db_id;
    const fileId = row.raw.file_id;
    if (!dbId || !fileId) continue;
    const current = grouped.get(dbId) ?? [];
    current.push(fileId);
    grouped.set(dbId, current);
  }
  return [...grouped.entries()].map(([dbId, fileIds]) => ({ dbId, fileIds }));
}

export function documentRowMatchesFilters(
  row: FileRow,
  statusFilter: KbDocumentStatusFilter,
  typeFilter: KbDocumentTypeFilter,
): boolean {
  if (typeFilter !== "all" && row.ext !== typeFilter) return false;
  if (statusFilter === "all") return true;
  return documentStatusGroup(row.raw.status) === statusFilter;
}

export function documentStatusGroup(value: string | null | undefined): Exclude<KbDocumentStatusFilter, "all"> {
  const status = (value ?? "").toLowerCase();
  if (["indexed", "done", "completed", "success"].includes(status)) return "indexed";
  if (["failed", "error", "error_parsing"].includes(status)) return "failed";
  if (["uploaded", "parsed", "processing", "pending", "running"].includes(status)) return "processing";
  return "unknown";
}

export function countActiveTasks(tasks: YuxiTask[], dbId: string | null): number {
  return tasks.filter((task) => {
    if (!["pending", "running"].includes(String(task.status ?? ""))) return false;
    if (!dbId) return true;
    return taskPayloadHasDbId(task.payload, dbId);
  }).length;
}

export interface BuildLibraryDocumentWorkspaceInput {
  documents: YuxiLibraryDocument[];
  allDocuments: YuxiLibraryDocument[];
  databases: YuxiKnowledgeDatabase[];
  selectedDatabase: YuxiKnowledgeDatabase | null;
  selectedRowId: string | null;
  statusFilter: KbDocumentStatusFilter;
  typeFilter: KbDocumentTypeFilter;
}

export interface LibraryDocumentWorkspaceProjection {
  allRows: FileRow[];
  hasDocuments: boolean;
  rows: FileRow[];
  selectedFile: FileRow | null;
  totalCount: number;
  navDatabases: YuxiKnowledgeDatabase[];
  selectedDatabaseCount: number;
}

export function buildLibraryDocumentWorkspace({
  documents,
  allDocuments,
  databases,
  selectedDatabase,
  selectedRowId,
  statusFilter,
  typeFilter,
}: BuildLibraryDocumentWorkspaceInput): LibraryDocumentWorkspaceProjection {
  const allRows = documents.map(toFileRow);
  const rows = allRows.filter((row) => documentRowMatchesFilters(row, statusFilter, typeFilter));
  const selectedFile = selectedRowId ? findSelectedFileRow(selectedRowId, rows, allDocuments) : null;
  const totalCount = allDocuments.length;
  const documentCountByDb = countDocumentsByDatabase(allDocuments);
  const navDatabases = databases.map((db) => {
    const dbId = db.db_id ?? "";
    const fallback = dbId ? documentCountByDb.get(dbId) : undefined;
    const known = typeof db.file_count === "number"
      ? db.file_count
      : typeof db.row_count === "number" ? db.row_count : undefined;
    return { ...db, file_count: known ?? fallback ?? 0 };
  });
  const selectedDatabaseCount = selectedDatabase?.db_id
    ? (documentCountByDb.get(selectedDatabase.db_id)
      ?? (typeof selectedDatabase.file_count === "number" ? selectedDatabase.file_count : 0))
    : totalCount;

  return {
    allRows,
    hasDocuments: allRows.length > 0,
    rows,
    selectedFile,
    totalCount,
    navDatabases,
    selectedDatabaseCount,
  };
}

export function selectCheckedDocumentRows(rows: FileRow[], checkedRowIds: ReadonlySet<string>): FileRow[] {
  return rows.filter((row) => checkedRowIds.has(row.id) && row.raw.db_id && row.raw.file_id);
}

function findSelectedFileRow(
  selectedRowId: string,
  rows: FileRow[],
  allDocuments: YuxiLibraryDocument[],
): FileRow | null {
  const inRows = rows.find((row) => row.id === selectedRowId);
  if (inRows) return inRows;
  // 搜索态下表格 rows 为空，命中的文件从全量资料里解析。
  for (const file of allDocuments) {
    const row = toFileRow(file);
    if (row.id === selectedRowId) return row;
  }
  return null;
}

function countDocumentsByDatabase(documents: YuxiLibraryDocument[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const file of documents) {
    if (!file.db_id) continue;
    counts.set(file.db_id, (counts.get(file.db_id) ?? 0) + 1);
  }
  return counts;
}

export function taskPayloadHasDbId(payload: Record<string, unknown> | undefined, dbId: string): boolean {
  if (!payload) return false;
  const direct = payload.db_id ?? payload.dbId;
  if (direct === dbId) return true;
  const dbIds = payload.db_ids ?? payload.dbIds;
  return Array.isArray(dbIds) && dbIds.includes(dbId);
}

export function taskPayloadDbId(payload: Record<string, unknown>): string | null {
  const direct = payload.db_id ?? payload.dbId;
  if (typeof direct === "string" && direct.length > 0) return direct;
  return null;
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

export function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/**
 * Map the selected Yuxi library into the category shape consumed by settings,
 * pending, integrations, and detail panels. The navigation is library-first;
 * this keeps those panel contracts stable without reintroducing static
 * category mappings.
 */
export function databaseAsCategory(database: YuxiKnowledgeDatabase | null): YuxiCategoryMeta | null {
  if (!database?.db_id) return null;
  const line: YuxiBusinessLine = database.business_line === "bidding" ? "bidding" : "training_presales";
  return {
    key: database.category ?? "",
    label: database.name || "知识库",
    line,
    kind: "proposal",
    description: database.description ?? "",
  };
}
