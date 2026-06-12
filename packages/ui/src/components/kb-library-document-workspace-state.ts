import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  YuxiKnowledgeDatabase,
  YuxiLibraryDocument,
} from "../lib/yuxi-client";
import { toFileRow, type FileRow } from "./kb-library-model";
import type {
  KbDocumentStatusFilter,
  KbDocumentTypeFilter,
} from "./kb-library-workspace";
import {
  buildLibraryDocumentWorkspace,
  selectCheckedDocumentRows,
} from "./kb-library-view-model";

interface UseKbLibraryDocumentWorkspaceStateInput {
  documents: YuxiLibraryDocument[];
  allDocuments: YuxiLibraryDocument[];
  databases: YuxiKnowledgeDatabase[];
  selectedDatabase: YuxiKnowledgeDatabase | null;
  statusFilter: KbDocumentStatusFilter;
  typeFilter: KbDocumentTypeFilter;
}

export function useKbLibraryDocumentWorkspaceState({
  documents,
  allDocuments,
  databases,
  selectedDatabase,
  statusFilter,
  typeFilter,
}: UseKbLibraryDocumentWorkspaceStateInput) {
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [highlightChunkId, setHighlightChunkId] = useState<string | null>(null);
  const [highlightQuery, setHighlightQuery] = useState<string | null>(null);
  const [checkedRowIds, setCheckedRowIds] = useState<Set<string>>(() => new Set());

  const workspace = useMemo(
    () => buildLibraryDocumentWorkspace({
      documents,
      allDocuments,
      databases,
      selectedDatabase,
      selectedRowId,
      statusFilter,
      typeFilter,
    }),
    [
      allDocuments,
      databases,
      documents,
      selectedDatabase,
      selectedRowId,
      statusFilter,
      typeFilter,
    ],
  );
  const { rows } = workspace;
  const checkedRows = useMemo(
    () => selectCheckedDocumentRows(rows, checkedRowIds),
    [checkedRowIds, rows],
  );

  useEffect(() => {
    // 搜索态 rows 为空，但命中的文件在 allDocuments 里——两处都找不到才清空选中。
    if (
      selectedRowId
      && !rows.some((row) => row.id === selectedRowId)
      && !allDocuments.some((file) => toFileRow(file).id === selectedRowId)
    ) {
      setSelectedRowId(null);
    }
    setCheckedRowIds((prev) => {
      const existing = new Set(rows.map((row) => row.id));
      const next = new Set([...prev].filter((id) => existing.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [allDocuments, rows, selectedRowId]);

  const clearSelectedRow = useCallback(() => {
    setSelectedRowId(null);
  }, []);

  const clearCheckedRows = useCallback(() => {
    setCheckedRowIds(new Set());
  }, []);

  const resetDocumentSelection = useCallback(() => {
    setSelectedRowId(null);
    setCheckedRowIds(new Set());
  }, []);

  const selectDocumentRow = useCallback((file: FileRow) => {
    setSelectedRowId(file.id);
    setHighlightChunkId(null);
    setHighlightQuery(null);
  }, []);

  const selectSearchResult = useCallback((
    file: YuxiLibraryDocument,
    chunkId: string | null,
    query: string | null,
  ) => {
    setSelectedRowId(toFileRow(file).id);
    setHighlightChunkId(chunkId);
    setHighlightQuery(query);
  }, []);

  const toggleCheckedRow = useCallback((file: FileRow, checked: boolean) => {
    setCheckedRowIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(file.id);
      else next.delete(file.id);
      return next;
    });
  }, []);

  const toggleAllCheckedRows = useCallback((checked: boolean) => {
    setCheckedRowIds((prev) => {
      const next = new Set(prev);
      for (const row of rows) {
        if (!row.raw.db_id || !row.raw.file_id) continue;
        if (checked) next.add(row.id);
        else next.delete(row.id);
      }
      return next;
    });
  }, [rows]);

  return {
    ...workspace,
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
  };
}
