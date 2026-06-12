import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  createYuxiKnowledgeDatabase,
  updateYuxiKnowledgeDatabase,
  type YuxiKnowledgeDatabase,
} from "../lib/yuxi-client";
import type { LibraryGovernanceDraft } from "./kb-library-model";
import { resolveYuxiEmbeddingModelName } from "./kb-library-upload-workflow";
import type { KbLibraryWorkspaceTab } from "./kb-library-workspace-tabs";

interface CreateLibraryDialogState {
  name: string;
  description: string;
}

interface UseKbLibraryManagementActionsInput {
  selectedDatabase: YuxiKnowledgeDatabase | null;
  databases: YuxiKnowledgeDatabase[];
  loadDocuments: () => Promise<void>;
  addDatabaseIfMissing: (database: YuxiKnowledgeDatabase) => void;
  setActiveDbId: Dispatch<SetStateAction<string | null>>;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  setLibraryMode: Dispatch<SetStateAction<KbLibraryWorkspaceTab>>;
  resetSelectionView: () => void;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
}

export function useKbLibraryManagementActions({
  selectedDatabase,
  databases,
  loadDocuments,
  addDatabaseIfMissing,
  setActiveDbId,
  setSearchQuery,
  setLibraryMode,
  resetSelectionView,
  setError,
  setNotice,
}: UseKbLibraryManagementActionsInput) {
  const [createLibraryDialog, setCreateLibraryDialog] = useState<CreateLibraryDialogState | null>(null);
  const [createLibrarySaving, setCreateLibrarySaving] = useState(false);
  const [governanceSaving, setGovernanceSaving] = useState(false);

  // 上传/保存设置统一以「当前选中的库」为目标；未选库时提示先选或新建。
  const requireSelectedDatabase = useCallback((): YuxiKnowledgeDatabase => {
    if (!selectedDatabase?.db_id) {
      throw new Error("请先在左侧选择一个知识库，或点击「新建库」。");
    }
    return selectedDatabase;
  }, [selectedDatabase]);

  const saveGovernance = useCallback(async (
    database: YuxiKnowledgeDatabase | null,
    draft: LibraryGovernanceDraft,
  ) => {
    setGovernanceSaving(true);
    setError(null);
    setNotice(null);
    try {
      const targetDatabase = database?.db_id ? database : requireSelectedDatabase();
      if (!targetDatabase.db_id) throw new Error("系统未返回知识库连接信息。");
      await updateYuxiKnowledgeDatabase(targetDatabase.db_id, {
        name: targetDatabase.name || "知识库",
        description: targetDatabase.description || "",
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
  }, [loadDocuments, requireSelectedDatabase, setError, setNotice]);

  const selectAllLibraries = useCallback(() => {
    setActiveDbId(null);
    resetSelectionView();
  }, [resetSelectionView, setActiveDbId]);

  const selectDatabase = useCallback((dbId: string) => {
    setActiveDbId(dbId);
    setSearchQuery("");
    resetSelectionView();
  }, [resetSelectionView, setActiveDbId, setSearchQuery]);

  const openCreateLibraryDialog = useCallback(() => {
    setCreateLibraryDialog({ name: "", description: "" });
    setError(null);
  }, [setError]);

  const closeCreateLibraryDialog = useCallback(() => {
    setCreateLibraryDialog(null);
  }, []);

  const setCreateLibraryName = useCallback((nextValue: string) => {
    setCreateLibraryDialog((prev) => prev ? { ...prev, name: nextValue } : prev);
  }, []);

  const setCreateLibraryDescription = useCallback((nextValue: string) => {
    setCreateLibraryDialog((prev) => prev ? { ...prev, description: nextValue } : prev);
  }, []);

  const submitCreateLibrary = useCallback(async () => {
    if (!createLibraryDialog) return;
    const name = createLibraryDialog.name.trim();
    if (!name) {
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
        description: createLibraryDialog.description.trim(),
        embed_model_name: embedModelName,
        kb_type: "lightrag",
        additional_params: {},
        share_config: {},
      });
      if (!created.db_id) throw new Error("系统未返回知识库连接信息。");
      addDatabaseIfMissing(created);
      setActiveDbId(created.db_id);
      setLibraryMode("documents");
      setCreateLibraryDialog(null);
      setNotice(`已创建知识库「${created.name || name}」`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreateLibrarySaving(false);
    }
  }, [
    addDatabaseIfMissing,
    createLibraryDialog,
    databases,
    setActiveDbId,
    setError,
    setLibraryMode,
    setNotice,
  ]);

  return {
    createLibraryDialog,
    createLibrarySaving,
    governanceSaving,
    requireSelectedDatabase,
    saveGovernance,
    selectAllLibraries,
    selectDatabase,
    openCreateLibraryDialog,
    closeCreateLibraryDialog,
    setCreateLibraryName,
    setCreateLibraryDescription,
    submitCreateLibrary,
  };
}
