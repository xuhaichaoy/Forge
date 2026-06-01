import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, Search, Upload, X } from "lucide-react";
import {
  analyzeYuxiKnowledgeFile,
  batchDeleteYuxiKnowledgeDocuments,
  cancelYuxiTask,
  createYuxiKnowledgeDatabase,
  deleteYuxiKnowledgeDocument,
  deleteYuxiTask,
  downloadYuxiKnowledgeDocument,
  fetchYuxiKnowledgeUrl,
  getYuxiEmbeddingModelsStatus,
  getYuxiKnowledgeDocumentDetail,
  getYuxiTask,
  generateYuxiHydeQuestions,
  indexYuxiKnowledgeDocuments,
  intakeYuxiKnowledgeFile,
  listYuxiKnowledgeDatabases,
  listYuxiLibraryDocuments,
  listYuxiConflicts,
  listYuxiPendingQueue,
  listYuxiTasks,
  parseYuxiKnowledgeDocuments,
  processYuxiKnowledgeDocuments,
  searchYuxiLibrary,
  updateYuxiKnowledgeDatabase,
  type YuxiKnowledgeDatabase,
  type YuxiKnowledgeDocumentDetail,
  type YuxiFileAnalysisResponse,
  type YuxiIntakeResponse,
  type YuxiSearchResponse,
  type YuxiLibraryDocument,
  type YuxiSearchGroup,
  type YuxiTask,
  uploadYuxiKnowledgeFile,
  YUXI_CATEGORIES,
  yuxiBusinessLineLabel,
  yuxiCategoryMeta,
  yuxiLibraryGovernance,
} from "../lib/yuxi-client";
import { KbYuxiConnectionControl } from "./kb-page-shell";
import { KbLibraryIntegrationPanel } from "./kb-library-integration-panel";
import { KbLibraryIngestPipeline, uploadRunPipelineSteps } from "./kb-library-ingest-pipeline";
import {
  toFileRow,
  updateUploadRun,
  type BizLine,
  type LibraryGovernanceDraft,
  type LibraryUploadRun,
} from "./kb-library-model";
import {
  BusinessLineFilter,
  LibraryTreeFilter,
} from "./kb-library-navigation";
import { KbLibraryDetailPanel } from "./kb-library-detail";
import { KbLibraryPendingPanel } from "./kb-library-pending-panel";
import { KbLibraryStoragePanel } from "./kb-library-storage-panel";
import { KbLibraryTaskPanel } from "./kb-library-task-panel";
import { LibraryDocumentsTable, SearchResultsTable } from "./kb-library-tables";
import { KbLibraryUploadPanel } from "./kb-library-upload-panel";
import { KbLibraryWorkspaceTabs, type KbLibraryWorkspaceTab } from "./kb-library-workspace-tabs";
import { projectTodos, todoBelongsToCurrentLibrary } from "./kb-todo-model";

export function KbLibraryView() {
  const [bizLine, setBizLine] = useState<BizLine>("training_presales");
  const [activeCat, setActiveCat] = useState<string>("lecturer");
  const [searchQuery, setSearchQuery] = useState("");
  const [documents, setDocuments] = useState<YuxiLibraryDocument[]>([]);
  const [allDocuments, setAllDocuments] = useState<YuxiLibraryDocument[]>([]);
  const [databases, setDatabases] = useState<YuxiKnowledgeDatabase[]>([]);
  const [searchGroups, setSearchGroups] = useState<YuxiSearchGroup[]>([]);
  const [searchErrors, setSearchErrors] = useState<NonNullable<YuxiSearchResponse["errors"]>>([]);
  const [searchedKbCount, setSearchedKbCount] = useState(0);
  const [taskRows, setTaskRows] = useState<YuxiTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [pendingSummary, setPendingSummary] = useState<number | null>(null);
  const [libraryMode, setLibraryMode] = useState<KbLibraryWorkspaceTab>("documents");
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [createLibraryDialog, setCreateLibraryDialog] = useState<{
    categoryKey: string;
    name: string;
    description: string;
  } | null>(null);
  const [createLibrarySaving, setCreateLibrarySaving] = useState(false);
  const [documentStatusFilter, setDocumentStatusFilter] = useState<"all" | "indexed" | "processing" | "failed" | "unknown">("all");
  const [documentTypeFilter, setDocumentTypeFilter] = useState<"all" | "DOC" | "PDF" | "PPT" | "XLS" | "MD" | "TXT">("all");
  const [uploadTargetDbId, setUploadTargetDbId] = useState<string>("");
  const [uploadRuns, setUploadRuns] = useState<LibraryUploadRun[]>([]);
  const [focusPendingIds, setFocusPendingIds] = useState<number[]>([]);
  const [governanceSaving, setGovernanceSaving] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [highlightChunkId, setHighlightChunkId] = useState<string | null>(null);
  const [highlightQuery, setHighlightQuery] = useState<string | null>(null);
  const [checkedRowIds, setCheckedRowIds] = useState<Set<string>>(() => new Set());
  const [documentDetail, setDocumentDetail] = useState<YuxiKnowledgeDocumentDetail | null>(null);
  const [documentAnalysis, setDocumentAnalysis] = useState<YuxiFileAnalysisResponse | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [hydeQuestions, setHydeQuestions] = useState<string[]>([]);
  const [hydeLoading, setHydeLoading] = useState(false);
  const [hydeError, setHydeError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [urlValue, setUrlValue] = useState("");
  const [urlIngesting, setUrlIngesting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const businessLine = bizLine === "all" ? null : bizLine;
  const category = activeCat;
  const searchText = searchQuery.trim();
  const currentCats = YUXI_CATEGORIES.filter((cat) => bizLine === "all" || cat.line === bizLine);
  const selectedCategory = yuxiCategoryMeta(activeCat);
  const selectedDatabases = useMemo(
    () => databases.filter((db) => db.category === activeCat),
    [activeCat, databases],
  );
  const currentTreeDatabases = useMemo(
    () => databases.filter((db) => currentCats.some((cat) => cat.key === db.category)),
    [currentCats, databases],
  );
  const selectedDatabase = useMemo(
    () => selectedDatabases.find((db) => db.db_id === uploadTargetDbId) ?? selectedDatabases.find((db) => db.db_id) ?? null,
    [selectedDatabases, uploadTargetDbId],
  );
  const activeDbId = selectedDatabase?.db_id ?? (uploadTargetDbId || null);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const allPromise = listYuxiLibraryDocuments({ limit: 500 });
      const databasesPromise = listYuxiKnowledgeDatabases().catch(() => ({ databases: [] as YuxiKnowledgeDatabase[] }));
      if (searchText) {
        const [all, dbResult, filtered] = await Promise.all([
          allPromise,
          databasesPromise,
          searchYuxiLibrary({
            query: searchText,
            businessLine,
            category,
            dbId: activeDbId,
            maxKbs: activeDbId ? 1 : 16,
          }),
        ]);
        setAllDocuments(all.items ?? []);
        setDatabases(dbResult.databases ?? []);
        setDocuments([]);
        setSearchGroups(filtered.groups ?? []);
        setSearchErrors(filtered.errors ?? []);
        setSearchedKbCount(filtered.total_kbs_searched ?? 0);
        setLastUpdatedAt(Date.now());
        return;
      }
      const [all, dbResult, filtered] = await Promise.all([
        allPromise,
        databasesPromise,
        listYuxiLibraryDocuments({ businessLine, category, dbId: activeDbId, limit: 500 }),
      ]);
      setAllDocuments(all.items ?? []);
      setDatabases(dbResult.databases ?? []);
      setDocuments(filtered.items ?? []);
      setSearchGroups([]);
      setSearchErrors([]);
      setSearchedKbCount(0);
      setLastUpdatedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDocuments([]);
      setSearchGroups([]);
      setSearchErrors([]);
      setSearchedKbCount(0);
    } finally {
      setLoading(false);
    }
  }, [activeDbId, businessLine, category, searchText]);

  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    setTasksError(null);
    try {
      const result = await listYuxiTasks({
        limit: 100,
        dbId: activeDbId,
        category,
        businessLine,
      });
      setTaskRows(result.tasks ?? []);
    } catch (err) {
      setTaskRows([]);
      setTasksError(err instanceof Error ? err.message : String(err));
    } finally {
      setTasksLoading(false);
    }
  }, [activeDbId, businessLine, category]);

  const loadPendingSummary = useCallback(async () => {
    if (!selectedCategory) {
      setPendingSummary(null);
      return;
    }
    const query = {
      scope: "team" as const,
      limit: 100,
      dbId: activeDbId,
      category,
      businessLine,
    };
    try {
      const [classify, entity, dup, force, conflictResult] = await Promise.all([
        listYuxiPendingQueue("classify", query),
        listYuxiPendingQueue("entity", query),
        listYuxiPendingQueue("dup", query),
        listYuxiPendingQueue("force", query),
        listYuxiConflicts({ status: "pending", limit: 100 }),
      ]);
      const libraryDbIds = new Set<string>();
      if (activeDbId) {
        libraryDbIds.add(activeDbId);
      } else {
        for (const db of selectedDatabases) {
          if (db.db_id) libraryDbIds.add(db.db_id);
        }
      }
      const currentItems = projectTodos({
        classify: classify.items ?? [],
        entity: entity.items ?? [],
        dup: dup.items ?? [],
        force: force.items ?? [],
      }, conflictResult.items ?? []).filter((item) => todoBelongsToCurrentLibrary(item.raw, selectedCategory.key, libraryDbIds));
      setPendingSummary(currentItems.length);
    } catch {
      setPendingSummary(null);
    }
  }, [activeDbId, businessLine, category, selectedCategory, selectedDatabases]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    void loadPendingSummary();
  }, [loadPendingSummary]);

  useEffect(() => {
    if (!selectedCategory) {
      setUploadTargetDbId("");
      return;
    }
    if (selectedDatabases.some((db) => db.db_id === uploadTargetDbId)) return;
    setUploadTargetDbId(selectedDatabases.find((db) => db.db_id)?.db_id ?? "");
  }, [selectedCategory, selectedDatabases, uploadTargetDbId]);

  useEffect(() => {
    if (!selectedCategory && libraryMode !== "documents") {
      setLibraryMode("documents");
    }
  }, [libraryMode, selectedCategory]);

  const allRows = useMemo(() => documents.map(toFileRow), [documents]);
  const hasDocuments = allRows.length > 0;
  const rows = useMemo(
    () => allRows.filter((row) => documentRowMatchesFilters(row, documentStatusFilter, documentTypeFilter)),
    [allRows, documentStatusFilter, documentTypeFilter],
  );
  const selectedFile = useMemo(() => {
    if (!selectedRowId) return null;
    const inRows = rows.find((row) => row.id === selectedRowId);
    if (inRows) return inRows;
    // 搜索态下表格 rows 为空，命中的文件从全量资料里解析
    const doc = allDocuments.find((file) => toFileRow(file).id === selectedRowId);
    return doc ? toFileRow(doc) : null;
  }, [allDocuments, rows, selectedRowId]);
  const checkedRows = useMemo(
    () => rows.filter((row) => checkedRowIds.has(row.id) && row.raw.db_id && row.raw.file_id),
    [checkedRowIds, rows],
  );
  const totalCount = allDocuments.length;
  const presalesCount = allDocuments.filter((file) => file.business_line === "training_presales").length;
  const bidCount = allDocuments.filter((file) => file.business_line === "bidding").length;
  const selectedCategoryCount = allDocuments.filter((file) => file.category === activeCat).length;
  const selectedDatabaseCount = selectedDatabase?.db_id
    ? allDocuments.filter((file) => file.db_id === selectedDatabase.db_id).length
    : selectedCategoryCount;
  const activeTaskCount = useMemo(
    () => countActiveTasks(taskRows, activeDbId),
    [activeDbId, taskRows],
  );
  const pendingTotal = pendingSummary ?? 0;
  const sourceSystemCount = yuxiLibraryGovernance(selectedCategory?.key)?.externalSystems.length ?? 0;
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const file of allDocuments) {
      if (!file.category) continue;
      counts.set(file.category, (counts.get(file.category) ?? 0) + 1);
    }
    return counts;
  }, [allDocuments]);
  useEffect(() => {
    // 搜索态 rows 为空，但命中的文件在 allDocuments 里——两处都找不到才清空选中
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

  useEffect(() => {
    if (!selectedFile) {
      setDocumentDetail(null);
      setDocumentAnalysis(null);
      setAnalysisError(null);
      setAnalysisLoading(false);
      setHydeQuestions([]);
      setHydeError(null);
      setHydeLoading(false);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }
    setDocumentAnalysis(null);
    setAnalysisError(null);
    setAnalysisLoading(false);
    setHydeQuestions([]);
    setHydeError(null);
    setHydeLoading(false);
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    getYuxiKnowledgeDocumentDetail(selectedFile.raw)
      .then((detail) => {
        if (cancelled) return;
        setDocumentDetail(detail);
      })
      .catch((err) => {
        if (cancelled) return;
        setDocumentDetail(null);
        setDetailError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedFile]);

  const analyzeSelectedFile = useCallback(async (file: ReturnType<typeof toFileRow>) => {
    const dbId = file.raw.db_id;
    const fileId = file.raw.file_id;
    if (!dbId || !fileId) {
      setAnalysisError("缺少知识库或文件信息，不能提炼。");
      return;
    }
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const result = await analyzeYuxiKnowledgeFile({ dbId, fileId, maxChunks: 8 });
      setDocumentAnalysis(result);
    } catch (err) {
      setDocumentAnalysis(null);
      setAnalysisError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalysisLoading(false);
    }
  }, []);

  const generateSelectedFileQuestions = useCallback(async (file: ReturnType<typeof toFileRow>) => {
    const dbId = file.raw.db_id;
    const fileId = file.raw.file_id;
    if (!dbId || !fileId) {
      setHydeError("缺少知识库或文件信息，不能生成问题。");
      return;
    }
    setHydeLoading(true);
    setHydeError(null);
    try {
      const result = await generateYuxiHydeQuestions({ dbId, fileId, n: 6, maxChunks: 8 });
      setHydeQuestions(result.questions ?? []);
    } catch (err) {
      setHydeQuestions([]);
      setHydeError(err instanceof Error ? err.message : String(err));
    } finally {
      setHydeLoading(false);
    }
  }, []);

  const handleDownload = useCallback(async (file: ReturnType<typeof toFileRow>) => {
    setError(null);
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
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const handleDelete = useCallback(async (file: ReturnType<typeof toFileRow>) => {
    if (!globalThis.confirm(`确定删除「${file.name}」吗？`)) return;
    setError(null);
    setNotice(null);
    try {
      await deleteYuxiKnowledgeDocument(file.raw);
      if (selectedRowId === file.id) {
        setSelectedRowId(null);
        setDocumentDetail(null);
      }
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [loadDocuments, selectedRowId]);

  const toggleCheckedRow = useCallback((file: ReturnType<typeof toFileRow>, checked: boolean) => {
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

  const handleBatchDelete = useCallback(async () => {
    const groups = groupRowsByDatabase(checkedRows);
    const total = groups.reduce((sum, item) => sum + item.fileIds.length, 0);
    if (total === 0) {
      setError("请先选择要删除的资料。");
      return;
    }
    if (!globalThis.confirm(`确定批量删除 ${total} 条资料吗？`)) return;
    setError(null);
    setNotice(null);
    try {
      for (const group of groups) {
        await batchDeleteYuxiKnowledgeDocuments(group.dbId, group.fileIds);
      }
      setCheckedRowIds(new Set());
      setSelectedRowId(null);
      setDocumentDetail(null);
      setNotice(`已删除 ${total} 条资料`);
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [checkedRows, loadDocuments]);

  const handleCancelTask = useCallback(async (task: YuxiTask) => {
    if (!task.id) return;
    setTasksError(null);
    try {
      await cancelYuxiTask(task.id);
      await loadTasks();
    } catch (err) {
      setTasksError(err instanceof Error ? err.message : String(err));
    }
  }, [loadTasks]);

  const handleDeleteTask = useCallback(async (task: YuxiTask) => {
    if (!task.id) return;
    if (!globalThis.confirm(`清理处理记录「${task.name || task.id}」吗？这不会影响已入库资料。`)) return;
    setTasksError(null);
    try {
      await deleteYuxiTask(task.id);
      await loadTasks();
    } catch (err) {
      setTasksError(err instanceof Error ? err.message : String(err));
    }
  }, [loadTasks]);

  const handleRetryTask = useCallback(async (task: YuxiTask) => {
    const payload = task.payload ?? {};
    const dbId = taskPayloadDbId(payload);
    if (!dbId) {
      setTasksError("任务记录缺少知识库信息，不能重试。");
      return;
    }
    setTasksError(null);
    setNotice(null);
    try {
      if (task.type === "knowledge_ingest") {
        const items = stringArray(payload.items);
        if (items.length === 0) throw new Error("任务记录缺少原始文件路径，不能重试。");
        const result = await processYuxiKnowledgeDocuments(dbId, items, objectRecord(payload.params));
        if (result.status === "failed") throw new Error(result.message || "重试提交失败");
      } else if (task.type === "knowledge_parse") {
        const fileIds = stringArray(payload.file_ids);
        if (fileIds.length === 0) throw new Error("任务记录缺少文件 ID，不能重试。");
        const result = await parseYuxiKnowledgeDocuments(dbId, fileIds);
        if (result.status === "failed") throw new Error(result.message || "重试提交失败");
      } else if (task.type === "knowledge_index") {
        const fileIds = stringArray(payload.file_ids);
        if (fileIds.length === 0) throw new Error("任务记录缺少文件 ID，不能重试。");
        const result = await indexYuxiKnowledgeDocuments(dbId, fileIds, objectRecord(payload.params));
        if (result.status === "failed") throw new Error(result.message || "重试提交失败");
      } else {
        throw new Error("只支持资料解析或入库任务重试。");
      }
      setNotice("重试任务已提交");
      await loadTasks();
    } catch (err) {
      setTasksError(err instanceof Error ? err.message : String(err));
    }
  }, [loadTasks]);

  const ensureSelectedCategoryDatabase = useCallback(async (): Promise<YuxiKnowledgeDatabase> => {
    if (!selectedCategory) {
      throw new Error("请先在左侧选择一个知识库。");
    }
    const existing = selectedDatabases.find((db) => db.db_id === uploadTargetDbId)
      ?? selectedDatabases.find((db) => db.db_id);
    if (existing?.db_id) {
      if (existing.db_id !== uploadTargetDbId) setUploadTargetDbId(existing.db_id);
      return existing;
    }
    const embedModelName = await resolveYuxiEmbeddingModelName(databases);
    const created = await createYuxiKnowledgeDatabase({
      database_name: selectedCategory.label,
      description: selectedCategory.description,
      embed_model_name: embedModelName,
      kb_type: "lightrag",
      business_line: selectedCategory.line,
      category: selectedCategory.key,
      additional_params: {},
      share_config: {},
    });
    if (!created.db_id) throw new Error("系统未返回知识库连接信息。");
    setUploadTargetDbId(created.db_id);
    setDatabases((prev) => {
      if (prev.some((db) => db.db_id === created.db_id)) return prev;
      return [...prev, created];
    });
    return created;
  }, [databases, selectedCategory, selectedDatabases, uploadTargetDbId]);

  const handleUploadFiles = useCallback(async (files: FileList | File[]) => {
    const selected = Array.from(files);
    if (selected.length === 0) return;
    if (!selectedCategory) {
      setError("请先在左侧选择一个知识库。");
      return;
    }
    let targetDb: YuxiKnowledgeDatabase;
    try {
      targetDb = await ensureSelectedCategoryDatabase();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    const dbId = targetDb.db_id ?? "";
    const targetName = targetDb.name || selectedCategory.label;
    if (!dbId) {
      setError("系统未返回知识库连接信息。");
      return;
    }
    setUploadDialogOpen(false);
    setUploading(true);
    setError(null);
    setNotice(null);
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
        const sameNameCount = Array.isArray(uploaded.same_name_files)
          ? uploaded.same_name_files.length
          : uploaded.has_same_name ? 1 : 0;
        if (sameNameCount > 0 && !contentHash) {
          throw new Error("上传成功但系统未返回校验信息，无法进入重复版本处理");
        }
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
            business_line_hint: selectedCategory.line,
            scenario_hint: selectedCategory.key,
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
    await Promise.all([loadDocuments(), loadTasks()]);
    if (queuedCount > 0) {
      setFocusPendingIds(queuedPendingIds);
      setNotice(`${ingestedCount} 条已入库，${queuedCount} 条进入入库问题`);
      setLibraryMode("pending");
    } else if (ingestedCount > 0) {
      setNotice(`${ingestedCount} 条资料已解析并入库`);
    }
  }, [ensureSelectedCategoryDatabase, loadDocuments, loadTasks, selectedCategory]);

  const handleIngestUrl = useCallback(async () => {
    const rawUrl = urlValue.trim();
    if (!rawUrl) return;
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("只支持 http 或 https 地址。");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "请输入完整网页地址。");
      return;
    }

    if (!selectedCategory) {
      setError("请先在左侧选择一个知识库。");
      return;
    }

    setUrlIngesting(true);
    setError(null);
    setNotice(null);
    let targetDb: YuxiKnowledgeDatabase;
    try {
      targetDb = await ensureSelectedCategoryDatabase();
    } catch (err) {
      setUrlIngesting(false);
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    const dbId = targetDb.db_id ?? "";
    const targetName = targetDb.name || selectedCategory.label;
    if (!dbId) {
      setUrlIngesting(false);
      setError("系统未返回知识库连接信息。");
      return;
    }

    setUploadDialogOpen(false);
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
      const sameNameCount = Array.isArray(fetched.same_name_files)
        ? fetched.same_name_files.length
        : fetched.has_same_name ? 1 : 0;
      if (sameNameCount > 0 && !contentHash) {
        throw new Error("网页已抓取，但系统未返回校验信息，无法进入重复版本处理");
      }
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
          business_line_hint: selectedCategory.line,
          scenario_hint: selectedCategory.key,
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
      await Promise.all([loadDocuments(), loadTasks()]);
      if (queued) {
        setFocusPendingIds(queuedPendingIds);
        setNotice("网页资料已进入入库问题");
        setLibraryMode("pending");
      } else {
        setNotice("网页资料已解析、提取档案并入库");
      }
    } catch (err) {
      setUploadRuns((prev) => updateUploadRun(prev, id, {
        status: "failed",
        message: err instanceof Error ? err.message : String(err),
      }));
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUrlIngesting(false);
    }
  }, [ensureSelectedCategoryDatabase, loadDocuments, loadTasks, selectedCategory, urlValue]);

  const saveGovernance = useCallback(async (
    database: YuxiKnowledgeDatabase | null,
    draft: LibraryGovernanceDraft,
  ) => {
    if (!selectedCategory) return;
    setGovernanceSaving(true);
    setError(null);
    setNotice(null);
    try {
      const targetDatabase = database?.db_id ? database : await ensureSelectedCategoryDatabase();
      if (!targetDatabase.db_id) throw new Error("系统未返回知识库连接信息。");
      await updateYuxiKnowledgeDatabase(targetDatabase.db_id, {
        name: targetDatabase.name || selectedCategory.label,
        description: targetDatabase.description || selectedCategory.description,
        share_config: {
          ...(targetDatabase.share_config ?? {}),
          hicodex_governance: draft,
        },
      });
      setNotice("当前知识库设置已保存");
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGovernanceSaving(false);
    }
  }, [ensureSelectedCategoryDatabase, loadDocuments, selectedCategory]);

  const selectBizLine = useCallback((value: BizLine) => {
    setBizLine(value);
    const nextCategory = YUXI_CATEGORIES.find((cat) => value === "all" || cat.line === value)?.key ?? "lecturer";
    setActiveCat(nextCategory);
    setUploadTargetDbId("");
    setDocumentStatusFilter("all");
    setDocumentTypeFilter("all");
    setSelectedRowId(null);
    setCheckedRowIds(new Set());
    setLibraryMode("documents");
  }, []);

  const selectCategory = useCallback((value: string) => {
    setActiveCat(value);
    setUploadTargetDbId("");
    setDocumentStatusFilter("all");
    setDocumentTypeFilter("all");
    setSelectedRowId(null);
    setCheckedRowIds(new Set());
    setLibraryMode("documents");
  }, []);

  const selectDatabase = useCallback((categoryKey: string, dbId: string) => {
    setActiveCat(categoryKey);
    setUploadTargetDbId(dbId);
    setDocumentStatusFilter("all");
    setDocumentTypeFilter("all");
    setSelectedRowId(null);
    setCheckedRowIds(new Set());
    setSearchQuery("");
    setLibraryMode("documents");
  }, []);

  const openCreateLibraryDialog = useCallback((categoryKey: string) => {
    const categoryMeta = yuxiCategoryMeta(categoryKey) ?? selectedCategory ?? currentCats[0];
    if (!categoryMeta) {
      setError("请先选择业务线和知识库分类。");
      return;
    }
    setCreateLibraryDialog({
      categoryKey: categoryMeta.key,
      name: categoryMeta.label,
      description: categoryMeta.description,
    });
    setError(null);
  }, [currentCats, selectedCategory]);

  const submitCreateLibrary = useCallback(async () => {
    if (!createLibraryDialog) return;
    const categoryMeta = yuxiCategoryMeta(createLibraryDialog.categoryKey);
    const name = createLibraryDialog.name.trim();
    if (!categoryMeta || !name) {
      setError("请填写知识库名称。");
      return;
    }
    setCreateLibrarySaving(true);
    setError(null);
    setNotice(null);
    try {
      const embedModelName = await resolveYuxiEmbeddingModelName(databases);
      const created = await createYuxiKnowledgeDatabase({
        database_name: name,
        description: createLibraryDialog.description.trim() || categoryMeta.description,
        embed_model_name: embedModelName,
        kb_type: "lightrag",
        business_line: categoryMeta.line,
        category: categoryMeta.key,
        additional_params: {},
        share_config: {},
      });
      if (!created.db_id) throw new Error("系统未返回知识库连接信息。");
      setDatabases((prev) => prev.some((db) => db.db_id === created.db_id) ? prev : [...prev, created]);
      setBizLine(categoryMeta.line);
      setActiveCat(categoryMeta.key);
      setUploadTargetDbId(created.db_id);
      setLibraryMode("documents");
      setCreateLibraryDialog(null);
      setNotice(`已创建知识库「${created.name || name}」`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreateLibrarySaving(false);
    }
  }, [createLibraryDialog, databases]);

  const updatedLabel = lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "";
  const canUploadToSelectedLibrary = !!selectedCategory && !uploading && !urlIngesting;
  const activeLibraryLabel = selectedDatabase?.name || selectedCategory?.label || "知识库";
  const creatingCategory = createLibraryDialog ? yuxiCategoryMeta(createLibraryDialog.categoryKey) : null;

  return (
    <main className="hc-main hc-kb-main" aria-label="知识库管理">
      <header className="hc-topbar">
        <div className="hc-topbar-main">
          <div className="hc-top-title">知识库</div>
        </div>
        <div className="hc-topbar-actions">
          <button
            type="button"
            className="hc-kb-topbar-btn"
            onClick={() => void loadDocuments()}
            disabled={loading}
            aria-label="同步平台数据"
            title={updatedLabel ? `最近同步 ${updatedLabel}` : "同步平台数据"}
          >
            <RefreshCw size={13} strokeWidth={2.2} aria-hidden="true" />
            {loading ? "同步中" : "同步"}
          </button>
          <KbYuxiConnectionControl />
        </div>
      </header>

      <div className="hc-kb-body">
        <input
          ref={uploadInputRef}
          type="file"
          multiple
          accept=".doc,.docx,.pdf,.ppt,.pptx,.xls,.xlsx,.md,.txt"
          hidden
          onChange={(event) => {
            const files = event.currentTarget.files;
            if (files) void handleUploadFiles(files);
            event.currentTarget.value = "";
          }}
        />
        <aside className="hc-kb-filters" aria-label="知识库列表">
          <BusinessLineFilter
            bizLine={bizLine}
            totalCount={totalCount}
            presalesCount={presalesCount}
            bidCount={bidCount}
            onSelect={selectBizLine}
          />
          <LibraryTreeFilter
            activeCat={activeCat}
            activeDbId={activeDbId}
            currentCats={currentCats}
            categoryCounts={categoryCounts}
            databases={currentTreeDatabases}
            onSelectCategory={selectCategory}
            onSelectDatabase={selectDatabase}
            onCreateLibrary={openCreateLibraryDialog}
          />
        </aside>

        <div className="hc-kb-results-area">
          <div className="hc-kb-search-section">
            <div className="hc-kb-search-wrap">
              <Search size={14} aria-hidden="true" />
              <input
                type="search"
                className="hc-kb-search hc-kb-search--prominent"
                placeholder={`搜索${selectedCategory?.label ?? "知识库"}资料`}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                aria-label="搜索知识库资料"
              />
              {searchQuery && (
                <button type="button" className="hc-kb-search-clear" onClick={() => setSearchQuery("")} aria-label="清除搜索">
                  <X size={12} aria-hidden="true" />
                </button>
              )}
            </div>
            {error && (
              <div className="hc-kb-inline-alert" data-tone="danger">
                {error}
              </div>
            )}
            {notice && (
              <div className="hc-kb-inline-alert">
                {notice}
              </div>
            )}
          </div>

          <div className="hc-kb-library-toolbar">
            <div className="hc-kb-library-toolbar-main">
              <div className="hc-kb-library-title">{activeLibraryLabel}</div>
              {!searchText && (
                <KbLibraryWorkspaceTabs
                  active={libraryMode}
                  disabledManagement={!selectedCategory}
                  counts={{
                    documents: selectedDatabaseCount,
                    pending: pendingTotal,
                    integrations: sourceSystemCount,
                    tasks: activeTaskCount,
                  }}
                  onSelect={setLibraryMode}
                />
              )}
            </div>
            <div className="hc-kb-library-actions">
              <button
                type="button"
                className="hc-kb-topbar-btn hc-kb-topbar-btn--primary"
                onClick={() => {
                  setSearchQuery("");
                  setUploadDialogOpen(true);
                }}
                disabled={!canUploadToSelectedLibrary}
              >
                {uploading ? <Loader2 size={13} strokeWidth={2.2} aria-hidden="true" /> : <Upload size={13} strokeWidth={2.2} aria-hidden="true" />}
                {uploading ? "上传中" : "上传资料"}
              </button>
            </div>
          </div>

          {uploadRuns.length > 0 && (
            <UploadBatchTable
              runs={uploadRuns}
              onClear={() => setUploadRuns([])}
              onOpenPending={(pendingIds) => {
                setFocusPendingIds(pendingIds);
                setLibraryMode("pending");
              }}
              onOpenTasks={() => {
                setLibraryMode("tasks");
              }}
              onChooseFiles={() => uploadInputRef.current?.click()}
            />
          )}

          {searchText ? (
            <div className="hc-kb-table-wrap">
              <SearchResultsTable
                groups={searchGroups}
                loading={loading}
                errors={searchErrors}
                searchedKbCount={searchedKbCount}
                onOpen={(target) => {
                  const doc = allDocuments.find((file) => file.file_id === target.fileId);
                  if (!doc) return;
                  setSelectedRowId(toFileRow(doc).id);
                  setHighlightChunkId(target.chunkId || null);
                  setHighlightQuery(searchQuery.trim() || null);
                }}
              />
            </div>
          ) : libraryMode === "pending" ? (
            <KbLibraryPendingPanel
              selectedCategory={selectedCategory}
              selectedDatabase={selectedDatabase}
              selectedDatabases={selectedDatabases}
              allDatabases={databases}
              focusPendingIds={focusPendingIds}
              onResolved={() => {
                void loadDocuments();
                void loadPendingSummary();
              }}
            />
          ) : libraryMode === "storage" ? (
            <KbLibraryStoragePanel
              selectedCategory={selectedCategory}
              selectedDatabase={selectedDatabase}
              onUpload={() => setUploadDialogOpen(true)}
              onSaveGovernance={(database, draft) => void saveGovernance(database, draft)}
              governanceSaving={governanceSaving}
            />
          ) : libraryMode === "integrations" ? (
            <KbLibraryIntegrationPanel
              selectedCategory={selectedCategory}
              selectedDatabase={selectedDatabase}
            />
          ) : libraryMode === "tasks" ? (
            <KbLibraryTaskPanel
              tasks={taskRows}
              loading={tasksLoading}
              error={tasksError}
              selectedDatabase={selectedDatabase}
              onRefresh={() => void loadTasks()}
              onCancel={(task) => void handleCancelTask(task)}
              onDelete={(task) => void handleDeleteTask(task)}
              onRetry={(task) => void handleRetryTask(task)}
            />
          ) : (
            <div className="hc-kb-library-content" data-detail-open={selectedFile ? "true" : undefined}>
              <div className="hc-kb-documents-region">
                {hasDocuments && (
                  <div className="hc-kb-bulkbar">
                    <span>{checkedRows.length > 0 ? `已选 ${checkedRows.length} 条` : `资料列表 ${rows.length}/${allRows.length}`}</span>
                    <div className="hc-kb-document-filters" aria-label="资料筛选">
                      <select
                        value={documentStatusFilter}
                        onChange={(event) => {
                          setDocumentStatusFilter(event.currentTarget.value as typeof documentStatusFilter);
                          setCheckedRowIds(new Set());
                        }}
                        aria-label="按处理状态筛选"
                      >
                        <option value="all">全部状态</option>
                        <option value="indexed">已入库</option>
                        <option value="processing">处理中</option>
                        <option value="failed">失败</option>
                        <option value="unknown">未记录</option>
                      </select>
                      <select
                        value={documentTypeFilter}
                        onChange={(event) => {
                          setDocumentTypeFilter(event.currentTarget.value as typeof documentTypeFilter);
                          setCheckedRowIds(new Set());
                        }}
                        aria-label="按文件类型筛选"
                      >
                        <option value="all">全部类型</option>
                        <option value="DOC">DOC</option>
                        <option value="PDF">PDF</option>
                        <option value="PPT">PPT</option>
                        <option value="XLS">XLS</option>
                        <option value="MD">MD</option>
                        <option value="TXT">TXT</option>
                      </select>
                    </div>
                    <div className="hc-kb-bulkbar-actions">
                      <button type="button" className="hc-kb-topbar-btn hc-kb-topbar-btn--danger" disabled={checkedRows.length === 0} onClick={() => void handleBatchDelete()}>
                        批量删除
                      </button>
                    </div>
                  </div>
                )}
                <div className="hc-kb-table-wrap">
                  <LibraryDocumentsTable
                    rows={rows}
                    loading={loading}
                    selectedRowId={selectedRowId}
                    checkedRowIds={checkedRowIds}
                    onSelect={(file) => {
                      setSelectedRowId(file.id);
                      setHighlightChunkId(null);
                      setHighlightQuery(null);
                    }}
                    onToggleChecked={toggleCheckedRow}
                    onToggleAll={toggleAllCheckedRows}
                    onDownload={(file) => void handleDownload(file)}
                    onDelete={(file) => void handleDelete(file)}
                    emptyTitle={hasDocuments ? "暂无匹配资料" : `${activeLibraryLabel}还没有资料`}
                    emptySubtitle={hasDocuments ? "换一个状态、类型或关键词再试。" : "上传资料后会进入解析、提取档案和入库；异常事项会进入入库问题。"}
                    emptyActionLabel={hasDocuments ? undefined : "上传资料"}
                    onEmptyAction={hasDocuments ? undefined : () => setUploadDialogOpen(true)}
                  />
                </div>
              </div>
            </div>
          )}
          {selectedFile && (
            <div className="hc-kb-archive-drawer hc-kb-archive-drawer--fixed" role="presentation">
              <button
                type="button"
                className="hc-kb-archive-drawer-scrim"
                aria-label="关闭资料详情"
                onClick={() => setSelectedRowId(null)}
              />
              <aside className="hc-kb-archive-drawer-panel" role="dialog" aria-modal="true" aria-label="资料详情">
                <button type="button" className="hc-kb-archive-drawer-close" onClick={() => setSelectedRowId(null)}>
                  <X size={14} strokeWidth={2.2} aria-hidden="true" />
                  关闭
                </button>
                <KbLibraryDetailPanel
                  file={selectedFile}
                  detail={documentDetail}
                  analysis={documentAnalysis}
                  analysisLoading={analysisLoading}
                  analysisError={analysisError}
                  hydeQuestions={hydeQuestions}
                  hydeLoading={hydeLoading}
                  hydeError={hydeError}
                  loading={detailLoading}
                  error={detailError}
                  selectedCategory={selectedCategory}
                  selectedDatabase={selectedDatabase}
                  highlightChunkId={highlightChunkId}
                  highlightQuery={highlightQuery}
                  onDownload={(file) => void handleDownload(file)}
                  onDelete={(file) => void handleDelete(file)}
                  onAnalyze={(file) => void analyzeSelectedFile(file)}
                  onGenerateQuestions={(file) => void generateSelectedFileQuestions(file)}
                />
              </aside>
            </div>
          )}
          {uploadDialogOpen && (
            <KbLibraryUploadPanel
              activeLibraryLabel={activeLibraryLabel}
              categoryLabel={selectedCategory ? "" : "未选择知识库"}
              canUpload={canUploadToSelectedLibrary}
              uploading={uploading}
              urlIngesting={urlIngesting}
              urlValue={urlValue}
              onChooseFiles={() => uploadInputRef.current?.click()}
              onUploadFiles={(files) => void handleUploadFiles(files)}
              onUrlChange={setUrlValue}
              onSubmitUrl={() => void handleIngestUrl()}
              onClose={() => setUploadDialogOpen(false)}
            />
          )}
          {createLibraryDialog && creatingCategory && (
            <div className="hc-kb-upload-dialog-backdrop" role="presentation">
              <div className="hc-kb-upload-dialog hc-kb-create-library-dialog" role="dialog" aria-modal="true" aria-label="新建知识库">
                <div className="hc-kb-upload-dialog-head">
                  <div className="hc-kb-upload-dialog-title">
                    <strong>新建知识库</strong>
                    <span>{yuxiBusinessLineLabel(creatingCategory.line)} / {creatingCategory.label}</span>
                  </div>
                  <button
                    type="button"
                    className="hc-kb-upload-dialog-close"
                    onClick={() => setCreateLibraryDialog(null)}
                    aria-label="关闭"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
                <div className="hc-kb-upload-dialog-body">
                  <label className="hc-kb-create-library-field">
                    <span>知识库名称</span>
                    <input
                      value={createLibraryDialog.name}
                      onChange={(event) => setCreateLibraryDialog((prev) => prev ? { ...prev, name: event.currentTarget.value } : prev)}
                      autoFocus
                    />
                  </label>
                  <label className="hc-kb-create-library-field">
                    <span>资料范围</span>
                    <textarea
                      value={createLibraryDialog.description}
                      onChange={(event) => setCreateLibraryDialog((prev) => prev ? { ...prev, description: event.currentTarget.value } : prev)}
                      rows={3}
                    />
                  </label>
                  <div className="hc-kb-create-library-actions">
                    <button type="button" className="hc-kb-topbar-btn" onClick={() => setCreateLibraryDialog(null)} disabled={createLibrarySaving}>
                      取消
                    </button>
                    <button
                      type="button"
                      className="hc-kb-topbar-btn hc-kb-topbar-btn--primary"
                      onClick={() => void submitCreateLibrary()}
                      disabled={createLibrarySaving || !createLibraryDialog.name.trim()}
                    >
                      {createLibrarySaving ? "创建中" : "创建知识库"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function UploadBatchTable({
  runs,
  onClear,
  onOpenPending,
  onOpenTasks,
  onChooseFiles,
}: {
  runs: LibraryUploadRun[];
  onClear: () => void;
  onOpenPending: (pendingIds: number[]) => void;
  onOpenTasks: () => void;
  onChooseFiles: () => void;
}) {
  const summary = summarizeUploadRuns(runs);
  const pendingIds = runs.flatMap((run) => run.pendingIds ?? []);
  return (
    <section className="hc-kb-upload-batch" aria-label="上传结果">
      <div className="hc-kb-upload-batch-head">
        <div>
          <strong>上传结果</strong>
          <span>
            {runs.length} 条资料 · 已入库 {summary.done} · 需处理 {summary.queued} · 失败 {summary.failed}
          </span>
        </div>
        <div className="hc-kb-row-actions hc-kb-row-actions--always">
          {summary.queued > 0 && (
            <button type="button" className="hc-kb-topbar-btn" onClick={() => onOpenPending(pendingIds)}>去处理</button>
          )}
          {summary.processing > 0 && (
            <button type="button" className="hc-kb-topbar-btn" onClick={onOpenTasks}>查看记录</button>
          )}
          {summary.failed > 0 && (
            <button type="button" className="hc-kb-topbar-btn" onClick={onChooseFiles}>重新选择文件</button>
          )}
          <button type="button" className="hc-kb-topbar-btn" onClick={onClear}>收起结果</button>
        </div>
      </div>
      <table className="hc-kb-table hc-kb-upload-batch-table">
        <thead>
          <tr>
            <th style={{ width: "10%" }}>状态</th>
            <th style={{ width: "32%" }}>资料</th>
            <th style={{ width: "18%" }}>目标知识库</th>
            <th>处理结果</th>
            <th style={{ width: "12%", textAlign: "right" }}>下一步</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td>
                <span className={`hc-kb-status hc-kb-status--${run.status === "done" ? "ok" : run.status === "failed" ? "fail" : run.status === "queued" ? "pending" : "pending"}`}>
                  {uploadRunStatusLabel(run.status)}
                </span>
              </td>
              <td>
                <div className="hc-kb-file-name" title={run.filename}>{run.filename}</div>
                <div className="hc-kb-file-meta">
                  {run.sourceType === "url" ? "网页" : "文件"} · {formatUploadTime(run.createdAt)}
                  {run.sameNameCount ? ` · 同名 ${run.sameNameCount}` : ""}
                </div>
              </td>
              <td>
                <span className="hc-kb-tag">{run.targetName}</span>
              </td>
              <td>
                <div className="hc-kb-upload-batch-message">
                  {typeof run.progress === "number" && <span>{Math.round(run.progress)}%</span>}
                  <strong>{run.message}</strong>
                </div>
                <KbLibraryIngestPipeline steps={uploadRunPipelineSteps(run)} compact />
              </td>
              <td>
                <div className="hc-kb-row-actions hc-kb-row-actions--always" style={{ justifyContent: "flex-end" }}>
                  {run.status === "queued" ? (
                    <button type="button" className="hc-kb-topbar-btn" onClick={() => onOpenPending(run.pendingIds ?? [])}>处理</button>
                  ) : run.taskId ? (
                    <button type="button" className="hc-kb-topbar-btn" onClick={onOpenTasks}>记录</button>
                  ) : run.status === "failed" ? (
                    <button type="button" className="hc-kb-topbar-btn" onClick={onChooseFiles}>重试</button>
                  ) : (
                    <span className="hc-kb-detail-muted">-</span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function summarizeUploadRuns(runs: LibraryUploadRun[]): { done: number; failed: number; queued: number; processing: number } {
  return runs.reduce((acc, run) => {
    if (run.status === "done") acc.done += 1;
    else if (run.status === "failed") acc.failed += 1;
    else if (run.status === "queued") acc.queued += 1;
    else acc.processing += 1;
    return acc;
  }, { done: 0, failed: 0, queued: 0, processing: 0 });
}

function formatUploadTime(value: number): string {
  if (!value) return "未记录";
  return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function makeBatchId(prefix: string): string {
  const stamp = new Date().toISOString().slice(2, 16).replace(/[-:T]/g, "");
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${stamp}-${random}`;
}

function groupRowsByDatabase(rows: Array<ReturnType<typeof toFileRow>>): Array<{ dbId: string; fileIds: string[] }> {
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

function documentRowMatchesFilters(
  row: ReturnType<typeof toFileRow>,
  statusFilter: "all" | "indexed" | "processing" | "failed" | "unknown",
  typeFilter: "all" | "DOC" | "PDF" | "PPT" | "XLS" | "MD" | "TXT",
): boolean {
  if (typeFilter !== "all" && row.ext !== typeFilter) return false;
  if (statusFilter === "all") return true;
  return documentStatusGroup(row.raw.status) === statusFilter;
}

function documentStatusGroup(value: string | null | undefined): "indexed" | "processing" | "failed" | "unknown" {
  const status = (value ?? "").toLowerCase();
  if (["indexed", "done", "completed", "success"].includes(status)) return "indexed";
  if (["failed", "error", "error_parsing"].includes(status)) return "failed";
  if (["uploaded", "parsed", "processing", "pending", "running"].includes(status)) return "processing";
  return "unknown";
}

function countActiveTasks(tasks: YuxiTask[], dbId: string | null): number {
  return tasks.filter((task) => {
    if (!["pending", "running"].includes(String(task.status ?? ""))) return false;
    if (!dbId) return true;
    return taskPayloadHasDbId(task.payload, dbId);
  }).length;
}

function taskPayloadHasDbId(payload: Record<string, unknown> | undefined, dbId: string): boolean {
  if (!payload) return false;
  const direct = payload.db_id ?? payload.dbId;
  if (direct === dbId) return true;
  const dbIds = payload.db_ids ?? payload.dbIds;
  return Array.isArray(dbIds) && dbIds.includes(dbId);
}

function taskPayloadDbId(payload: Record<string, unknown>): string | null {
  const direct = payload.db_id ?? payload.dbId;
  if (typeof direct === "string" && direct.length > 0) return direct;
  return null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function waitForYuxiTask(taskId: string, onTask: (task: YuxiTask) => void): Promise<YuxiTask> {
  let lastTask: YuxiTask = { id: taskId, status: "pending", progress: 0, message: "等待执行" };
  for (let index = 0; index < 180; index += 1) {
    await delay(1500);
    const response = await getYuxiTask(taskId);
    const task = response.task ?? lastTask;
    lastTask = task;
    onTask(task);
    if (isDoneTask(task) || isFailedTask(task)) return task;
  }
  return { ...lastTask, status: "failed", progress: lastTask.progress ?? 100, message: "任务超时，请稍后同步查看结果" };
}

function isDoneTask(task: YuxiTask): boolean {
  return task.status === "success";
}

function isFailedTask(task: YuxiTask): boolean {
  return task.status === "failed" || task.status === "cancelled";
}

function taskMessage(task: YuxiTask): string {
  if (task.error) return task.error;
  return task.message || task.status || "处理中";
}

function uploadRunPatchFromIntake(
  response: YuxiIntakeResponse,
): Pick<LibraryUploadRun, "status" | "message" | "progress" | "pendingIds"> {
  const pending = pendingSuffix(response);
  const pendingIds = pendingIdsFromIntake(response);
  if (response.action === "auto_ingested") {
    return {
      status: "done",
      progress: 100,
      pendingIds: [],
      message: "已解析并入库",
    };
  }
  if (response.action === "queued_classify") {
    return { status: "queued", progress: null, pendingIds, message: `归属需处理${pending}` };
  }
  if (response.action === "queued_dup") {
    return { status: "queued", progress: null, pendingIds, message: `重复版本需处理${pending}` };
  }
  if (response.action === "queued_force") {
    const reason = response.failure_reason ? `：${response.failure_reason}` : pending;
    return { status: "queued", progress: null, pendingIds, message: `待人工处理${reason}` };
  }
  return {
    status: "processing",
    progress: null,
    pendingIds: [],
    message: response.action || "已提交处理流程",
  };
}

function pendingIdsFromIntake(response: YuxiIntakeResponse): number[] {
  if (Array.isArray(response.pending_ids)) return response.pending_ids.filter((value): value is number => typeof value === "number");
  return typeof response.pending_id === "number" ? [response.pending_id] : [];
}

function pendingSuffix(response: YuxiIntakeResponse): string {
  if (Array.isArray(response.pending_ids) && response.pending_ids.length > 0) {
    return ` #${response.pending_ids.join(", #")}`;
  }
  if (response.pending_id != null) return ` #${response.pending_id}`;
  return "";
}

function isQueuedIntake(response: YuxiIntakeResponse): boolean {
  return typeof response.action === "string" && response.action.startsWith("queued_");
}

function uploadRunStatusLabel(status: LibraryUploadRun["status"]): string {
  if (status === "done") return "完成";
  if (status === "failed") return "失败";
  if (status === "queued") return "需处理";
  return "处理中";
}

function uploadDoneMessage(): string {
  return "已解析、提取档案并入库；需要人工判断的内容会进入入库问题";
}

async function resolveYuxiEmbeddingModelName(databases: YuxiKnowledgeDatabase[]): Promise<string> {
  const existingModel = databases.map(embeddingModelNameFromDatabase).find((value): value is string => Boolean(value));
  if (existingModel) return existingModel;

  const response = await getYuxiEmbeddingModelsStatus();
  const models = response.status?.models ?? {};
  const availableModel = firstAvailableEmbeddingModel(models);
  if (availableModel) return availableModel;

  throw new Error("系统没有可用的检索模型，不能创建知识库。请先在系统连接中配置可用模型后再上传资料。");
}

function embeddingModelNameFromDatabase(database: YuxiKnowledgeDatabase): string | null {
  const embedInfo = objectRecord(database.embed_info);
  const fromEmbedInfo = stringRecordValue(embedInfo, "model_id");
  if (fromEmbedInfo) return fromEmbedInfo;

  const params = objectRecord(database.additional_params);
  return stringRecordValue(params, "embed_model_name")
    ?? stringRecordValue(params, "embed_model")
    ?? stringRecordValue(params, "model_id");
}

function firstAvailableEmbeddingModel(models: Record<string, unknown>): string | null {
  for (const [fallbackId, raw] of Object.entries(models)) {
    const record = objectRecord(raw);
    const status = stringRecordValue(record, "status")?.toLowerCase();
    if (status && !["available", "success", "ok", "ready", "healthy"].includes(status)) continue;
    const modelId = stringRecordValue(record, "model_id") ?? fallbackId;
    if (modelId) return modelId;
  }
  return null;
}

function stringRecordValue(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}
