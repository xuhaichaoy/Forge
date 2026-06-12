import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listYuxiKnowledgeDatabases,
  listYuxiLibraryDocuments,
  listYuxiConflicts,
  listYuxiPendingQueue,
  listYuxiTasks,
  searchYuxiLibrary,
  type YuxiBusinessLine,
  type YuxiCategoryMeta,
  type YuxiKnowledgeDatabase,
  type YuxiLibraryDocument,
  type YuxiSearchGroup,
  type YuxiSearchResponse,
  type YuxiTask,
  yuxiLibraryGovernance,
} from "../lib/yuxi-client";
import { projectTodos, todoBelongsToCurrentLibrary } from "./kb-todo-model";
import {
  countActiveTasks,
  databaseAsCategory,
} from "./kb-library-view-model";

export function useKbLibraryDataSource() {
  // 选中态直接是 Yuxi 真实库的 db_id；null 表示「全部」(展示所有库资料)。
  const [activeDbId, setActiveDbId] = useState<string | null>(null);
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  // 防抖后的检索词：每个 KB 的检索底层要跑一次关键词 LLM，逐字符触发会让中间态
  // 废请求在后端排队、挤占真正的最终查询（也是检索超时的放大器）。
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // 回车强制重搜的计数器：同词重按回车也要重新请求（重试失败的库）。
  const [searchNonce, setSearchNonce] = useState(0);
  // 乱序竞态守卫：慢的旧请求后返回时不得覆盖新结果。
  const requestSeqRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const searchText = debouncedSearch.trim();
  // 当前选中库（activeDbId 为 null 时表示「全部」，selectedDatabase 为 null）。
  const selectedDatabase = useMemo(
    () => (activeDbId ? databases.find((db) => db.db_id === activeDbId) ?? null : null),
    [activeDbId, databases],
  );
  // 选中库时合成一个 category 形态的对象给下游面板（设置/入库问题/系统来源/详情）复用，
  // 这样导航改成纯库列表后这些面板的接口契约和功能不变（label/governance 回退仍走库自身字段）。
  const selectedCategory = useMemo<YuxiCategoryMeta | null>(
    () => databaseAsCategory(selectedDatabase),
    [selectedDatabase],
  );
  // 选中库的业务线（库自身字段，用于按库过滤资料/任务/待处理；「全部」时不限定）。
  const dbBusinessLine = selectedDatabase?.business_line;
  const businessLine: YuxiBusinessLine | null =
    dbBusinessLine === "training_presales" || dbBusinessLine === "bidding"
      ? dbBusinessLine
      : null;
  // 选中库的资料查询/计数都以 db_id 为准；保留 category 仅作兼容传参（库有则带上）。
  const category = selectedDatabase?.category ?? null;
  // 「全部」视图下，下游面板按全部库聚合 pending/计数。
  const selectedDatabases = useMemo(
    () => (selectedDatabase ? [selectedDatabase] : databases),
    [databases, selectedDatabase],
  );

  const loadDocuments = useCallback(async () => {
    // 竞态守卫：只有最新一次请求才有权写入状态（慢的旧响应直接丢弃）。
    const seq = ++requestSeqRef.current;
    const isStale = () => seq !== requestSeqRef.current;
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
        if (isStale()) return;
        const dbList = dbResult.databases ?? [];
        setAllDocuments(all.items ?? []);
        setDatabases(dbList);
        setDocuments([]);
        setSearchGroups(filtered.groups ?? []);
        // 失败明细补库名，前端能点名"哪个库、什么原因"
        setSearchErrors(
          (filtered.errors ?? []).map((item) => ({
            ...item,
            kb_name: dbList.find((db) => db.db_id === item.db_id)?.name,
          })),
        );
        setSearchedKbCount(filtered.total_kbs_searched ?? 0);
        setLastUpdatedAt(Date.now());
        return;
      }
      const [all, dbResult, filtered] = await Promise.all([
        allPromise,
        databasesPromise,
        listYuxiLibraryDocuments({ businessLine, category, dbId: activeDbId, limit: 500 }),
      ]);
      if (isStale()) return;
      setAllDocuments(all.items ?? []);
      setDatabases(dbResult.databases ?? []);
      setDocuments(filtered.items ?? []);
      setSearchGroups([]);
      setSearchErrors([]);
      setSearchedKbCount(0);
      setLastUpdatedAt(Date.now());
    } catch (err) {
      if (isStale()) return;
      setError(err instanceof Error ? err.message : String(err));
      setDocuments([]);
      setSearchGroups([]);
      setSearchErrors([]);
      setSearchedKbCount(0);
    } finally {
      if (!isStale()) setLoading(false);
    }
    // searchNonce 仅用于"同词回车强制重搜"，不参与请求参数
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDbId, businessLine, category, searchText, searchNonce]);

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
        for (const db of databases) {
          if (db.db_id) libraryDbIds.add(db.db_id);
        }
      }
      const currentItems = projectTodos({
        classify: classify.items ?? [],
        entity: entity.items ?? [],
        dup: dup.items ?? [],
        force: force.items ?? [],
      }, conflictResult.items ?? []).filter((item) => todoBelongsToCurrentLibrary(item.raw, category, libraryDbIds));
      setPendingSummary(currentItems.length);
    } catch {
      setPendingSummary(null);
    }
  }, [activeDbId, businessLine, category, databases]);

  const refreshLibraryData = useCallback(async () => {
    await Promise.all([loadDocuments(), loadTasks()]);
  }, [loadDocuments, loadTasks]);

  const commitSearch = useCallback(() => {
    // 跳过防抖立即生效；同词回车也强制重搜（重试失败的库）
    setDebouncedSearch(searchQuery);
    setSearchNonce((n) => n + 1);
  }, [searchQuery]);

  const addDatabaseIfMissing = useCallback((database: YuxiKnowledgeDatabase) => {
    setDatabases((prev) => prev.some((db) => db.db_id === database.db_id) ? prev : [...prev, database]);
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    void loadPendingSummary();
  }, [loadPendingSummary]);

  // 选中的库被删除/不存在时，回到「全部」。
  useEffect(() => {
    if (activeDbId && !databases.some((db) => db.db_id === activeDbId)) {
      setActiveDbId(null);
    }
  }, [activeDbId, databases]);

  const activeTaskCount = useMemo(
    () => countActiveTasks(taskRows, activeDbId),
    [activeDbId, taskRows],
  );
  const sourceSystemCount = yuxiLibraryGovernance(selectedDatabase?.category)?.externalSystems.length ?? 0;

  return {
    activeDbId,
    setActiveDbId,
    searchQuery,
    setSearchQuery,
    searchText,
    documents,
    allDocuments,
    databases,
    searchGroups,
    searchErrors,
    searchedKbCount,
    taskRows,
    tasksLoading,
    tasksError,
    setTasksError,
    pendingSummary,
    loading,
    error,
    setError,
    notice,
    setNotice,
    lastUpdatedAt,
    selectedDatabase,
    selectedCategory,
    businessLine,
    selectedDatabases,
    activeTaskCount,
    sourceSystemCount,
    loadDocuments,
    loadTasks,
    loadPendingSummary,
    refreshLibraryData,
    commitSearch,
    addDatabaseIfMissing,
  };
}
