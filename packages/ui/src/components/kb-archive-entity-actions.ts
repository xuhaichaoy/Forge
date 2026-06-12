import { useCallback, useState } from "react";
import {
  applyYuxiEntityAttributes,
  changeYuxiEntityAuthority,
  createYuxiEntity,
  deleteYuxiEntity,
  diffYuxiEntityAttributes,
  mergeYuxiEntity,
  refreshYuxiEntityMetrics,
  updateYuxiEntity,
  type YuxiEntityAttributeDiff,
  type YuxiEntityDetail,
  type YuxiEntityMutationPayload,
  type YuxiEntityType,
} from "../lib/yuxi-client";
import type { EntityTab } from "./kb-archive-model";
import { parseAttributeDraft } from "./kb-archive-view-model";

type EntityDialogMode = "create" | "edit";

interface KbArchiveEntityActionsArgs {
  activeTab: EntityTab;
  attributeDiffs: YuxiEntityAttributeDiff[];
  attributeDraft: string;
  confirmDialog: (message: string) => Promise<boolean>;
  detail: YuxiEntityDetail | null;
  loadDetail: (entityId: number | null) => Promise<void>;
  loadEntities: () => Promise<void>;
  resetSelection: () => void;
  selectedId: number | null;
  setAttributeBusy: (busy: boolean) => void;
  setAttributeDiffs: (diffs: YuxiEntityAttributeDiff[]) => void;
  setAttributeDraft: (draft: string) => void;
  setAttributeError: (error: string | null) => void;
  setDetailError: (error: string | null) => void;
  setSelectedId: (entityId: number | null) => void;
}

export function useKbArchiveEntityActions({
  activeTab,
  attributeDiffs,
  attributeDraft,
  confirmDialog,
  detail,
  loadDetail,
  loadEntities,
  resetSelection,
  selectedId,
  setAttributeBusy,
  setAttributeDiffs,
  setAttributeDraft,
  setAttributeError,
  setDetailError,
  setSelectedId,
}: KbArchiveEntityActionsArgs) {
  const [authorityBusy, setAuthorityBusy] = useState(false);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [entityDialogMode, setEntityDialogMode] = useState<EntityDialogMode | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const changeAuthority = useCallback(async (status: string) => {
    if (selectedId == null) return;
    setAuthorityBusy(true);
    setDetailError(null);
    try {
      await changeYuxiEntityAuthority(selectedId, status, "HiCodex 档案中心手动调整");
      await Promise.all([loadDetail(selectedId), loadEntities()]);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : String(err));
    } finally {
      setAuthorityBusy(false);
    }
  }, [loadDetail, loadEntities, selectedId, setDetailError]);

  const openCreateEntity = useCallback(() => {
    setMutationError(null);
    setEntityDialogMode("create");
  }, []);

  const openEditEntity = useCallback(() => {
    if (!detail) return;
    setMutationError(null);
    setEntityDialogMode("edit");
  }, [detail]);

  const closeEntityDialog = useCallback(() => {
    if (!mutationBusy) setEntityDialogMode(null);
  }, [mutationBusy]);

  const saveEntity = useCallback(async (payload: YuxiEntityMutationPayload) => {
    setMutationBusy(true);
    setMutationError(null);
    try {
      let nextSelectedId = selectedId;
      if (entityDialogMode === "create") {
        const created = await createYuxiEntity({ ...payload, entity_type: activeTab as YuxiEntityType });
        nextSelectedId = typeof created.entity_id === "number" ? created.entity_id : null;
        setSelectedId(nextSelectedId);
      } else if (entityDialogMode === "edit") {
        if (selectedId == null) throw new Error("缺少档案 ID");
        await updateYuxiEntity(selectedId, payload);
      }
      setEntityDialogMode(null);
      await loadEntities();
      if (nextSelectedId != null) await loadDetail(nextSelectedId);
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : String(err));
    } finally {
      setMutationBusy(false);
    }
  }, [activeTab, entityDialogMode, loadDetail, loadEntities, selectedId, setSelectedId]);

  const deleteEntity = useCallback(async () => {
    if (selectedId == null || !detail) return;
    const name = detail.canonical_name || `未命名档案 #${selectedId}`;
    if (!(await confirmDialog(`确定删除档案「${name}」吗？来源引用也会解除关联。`))) return;
    setMutationBusy(true);
    setDetailError(null);
    try {
      await deleteYuxiEntity(selectedId);
      resetSelection();
      await loadEntities();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : String(err));
    } finally {
      setMutationBusy(false);
    }
  }, [confirmDialog, detail, loadEntities, resetSelection, selectedId, setDetailError]);

  const openMerge = useCallback(() => {
    setMutationError(null);
    setMergeOpen(true);
  }, []);

  const closeMerge = useCallback(() => {
    if (!mutationBusy) setMergeOpen(false);
  }, [mutationBusy]);

  const mergeEntity = useCallback(async (targetId: number, mergeAttributes: boolean) => {
    if (selectedId == null) return;
    setMutationBusy(true);
    setMutationError(null);
    try {
      await mergeYuxiEntity(selectedId, targetId, mergeAttributes);
      setMergeOpen(false);
      setSelectedId(targetId);
      await loadEntities();
      await loadDetail(targetId);
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : String(err));
    } finally {
      setMutationBusy(false);
    }
  }, [loadDetail, loadEntities, selectedId, setSelectedId]);

  const refreshMetrics = useCallback(async () => {
    setMutationBusy(true);
    setDetailError(null);
    try {
      await refreshYuxiEntityMetrics(selectedId);
      await loadEntities();
      if (selectedId != null) await loadDetail(selectedId);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : String(err));
    } finally {
      setMutationBusy(false);
    }
  }, [loadDetail, loadEntities, selectedId, setDetailError]);

  const previewAttributeDiff = useCallback(async () => {
    if (selectedId == null) return;
    setAttributeBusy(true);
    setAttributeError(null);
    try {
      const incoming = parseAttributeDraft(attributeDraft);
      const result = await diffYuxiEntityAttributes(selectedId, incoming);
      setAttributeDiffs(result.diffs ?? []);
    } catch (err) {
      setAttributeDiffs([]);
      setAttributeError(err instanceof Error ? err.message : String(err));
    } finally {
      setAttributeBusy(false);
    }
  }, [
    attributeDraft,
    selectedId,
    setAttributeBusy,
    setAttributeDiffs,
    setAttributeError,
  ]);

  const applyAttributeDiff = useCallback(async () => {
    if (selectedId == null || attributeDiffs.length === 0) return;
    setAttributeBusy(true);
    setAttributeError(null);
    try {
      const fields = Object.fromEntries(attributeDiffs
        .filter((diff) => diff.field)
        .map((diff) => [diff.field as string, diff.new]));
      await applyYuxiEntityAttributes(selectedId, fields, "HiCodex 档案中心采纳字段更新");
      setAttributeDraft("");
      setAttributeDiffs([]);
      await Promise.all([loadEntities(), loadDetail(selectedId)]);
    } catch (err) {
      setAttributeError(err instanceof Error ? err.message : String(err));
    } finally {
      setAttributeBusy(false);
    }
  }, [
    attributeDiffs,
    loadDetail,
    loadEntities,
    selectedId,
    setAttributeBusy,
    setAttributeDiffs,
    setAttributeDraft,
    setAttributeError,
  ]);

  return {
    authorityBusy,
    mutationBusy,
    entityDialogMode,
    mergeOpen,
    mutationError,
    changeAuthority,
    openCreateEntity,
    openEditEntity,
    closeEntityDialog,
    saveEntity,
    deleteEntity,
    openMerge,
    closeMerge,
    mergeEntity,
    refreshMetrics,
    previewAttributeDiff,
    applyAttributeDiff,
  };
}
