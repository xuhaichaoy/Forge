import { useCallback, useEffect, useState } from "react";
import {
  getYuxiEntity,
  getYuxiEntityHistory,
  getYuxiEntityRelated,
  type YuxiEntityAttributeDiff,
  type YuxiEntityDetail,
  type YuxiEntityHistoryEntry,
  type YuxiEntityRelatedResponse,
} from "../lib/yuxi-client";

export function useKbArchiveDetailState() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<YuxiEntityDetail | null>(null);
  const [related, setRelated] = useState<YuxiEntityRelatedResponse | null>(null);
  const [history, setHistory] = useState<YuxiEntityHistoryEntry[]>([]);
  const [attributeDraft, setAttributeDraft] = useState("");
  const [attributeDiffs, setAttributeDiffs] = useState<YuxiEntityAttributeDiff[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [attributeBusy, setAttributeBusy] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [attributeError, setAttributeError] = useState<string | null>(null);

  const clearDetailState = useCallback(() => {
    setDetail(null);
    setRelated(null);
    setHistory([]);
    setAttributeDraft("");
    setAttributeDiffs([]);
    setDetailError(null);
    setAttributeError(null);
  }, []);

  const resetSelection = useCallback(() => {
    setSelectedId(null);
    clearDetailState();
  }, [clearDetailState]);

  const loadDetail = useCallback(async (entityId: number | null) => {
    if (entityId == null) {
      clearDetailState();
      return;
    }
    setDetailLoading(true);
    setRelatedLoading(true);
    setHistoryLoading(true);
    setDetailError(null);
    setAttributeError(null);
    setAttributeDraft("");
    setAttributeDiffs([]);
    try {
      const [nextDetail, nextRelated, nextHistory] = await Promise.all([
        getYuxiEntity(entityId),
        getYuxiEntityRelated(entityId).catch(() => null),
        getYuxiEntityHistory(entityId).catch(() => ({ history: [] })),
      ]);
      setDetail(nextDetail);
      setRelated(nextRelated);
      setHistory(nextHistory.history ?? []);
    } catch (err) {
      setDetail(null);
      setRelated(null);
      setHistory([]);
      setDetailError(err instanceof Error ? err.message : String(err));
    } finally {
      setDetailLoading(false);
      setRelatedLoading(false);
      setHistoryLoading(false);
    }
  }, [clearDetailState]);

  useEffect(() => {
    void loadDetail(selectedId);
  }, [loadDetail, selectedId]);

  return {
    selectedId,
    setSelectedId,
    detail,
    related,
    history,
    attributeDraft,
    setAttributeDraft,
    attributeDiffs,
    setAttributeDiffs,
    detailLoading,
    relatedLoading,
    historyLoading,
    attributeBusy,
    setAttributeBusy,
    detailError,
    setDetailError,
    attributeError,
    setAttributeError,
    loadDetail,
    resetSelection,
  };
}
