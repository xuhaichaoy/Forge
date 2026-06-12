import { X } from "lucide-react";
import type {
  YuxiEntityAttributeDiff,
  YuxiEntityDetail,
  YuxiEntityHistoryEntry,
  YuxiEntityRelatedResponse,
} from "../lib/yuxi-client";
import { EntityDetailPanel } from "./kb-archive-detail";

export function KbArchiveDetailDrawer({
  attributeBusy,
  attributeDiffs,
  attributeDraft,
  attributeError,
  authorityBusy,
  detail,
  detailError,
  detailLoading,
  history,
  historyLoading,
  mutationBusy,
  related,
  relatedLoading,
  onApplyAttributeDiff,
  onAttributeDraftChange,
  onChangeAuthority,
  onClose,
  onDelete,
  onEdit,
  onMerge,
  onPreviewAttributeDiff,
  onRefreshMetrics,
}: {
  attributeBusy: boolean;
  attributeDiffs: YuxiEntityAttributeDiff[];
  attributeDraft: string;
  attributeError: string | null;
  authorityBusy: boolean;
  detail: YuxiEntityDetail | null;
  detailError: string | null;
  detailLoading: boolean;
  history: YuxiEntityHistoryEntry[];
  historyLoading: boolean;
  mutationBusy: boolean;
  related: YuxiEntityRelatedResponse | null;
  relatedLoading: boolean;
  onApplyAttributeDiff: () => void;
  onAttributeDraftChange: (value: string) => void;
  onChangeAuthority: (status: string) => void;
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onMerge: () => void;
  onPreviewAttributeDiff: () => void;
  onRefreshMetrics: () => void;
}) {
  return (
    <div className="hc-kb-archive-drawer" role="presentation">
      <button
        type="button"
        className="hc-kb-archive-drawer-scrim"
        aria-label="关闭档案详情"
        onClick={onClose}
      />
      <aside className="hc-kb-archive-drawer-panel" role="dialog" aria-modal="true" aria-label="档案详情">
        <button type="button" className="hc-kb-archive-drawer-close" onClick={onClose}>
          <X size={14} strokeWidth={2.2} aria-hidden="true" />
          关闭
        </button>
        <EntityDetailPanel
          detail={detail}
          loading={detailLoading}
          error={detailError}
          authorityBusy={authorityBusy}
          mutationBusy={mutationBusy}
          related={related}
          relatedLoading={relatedLoading}
          history={history}
          historyLoading={historyLoading}
          attributeDraft={attributeDraft}
          attributeDiffs={attributeDiffs}
          attributeBusy={attributeBusy}
          attributeError={attributeError}
          onAttributeDraftChange={onAttributeDraftChange}
          onPreviewAttributeDiff={onPreviewAttributeDiff}
          onApplyAttributeDiff={onApplyAttributeDiff}
          onChangeAuthority={onChangeAuthority}
          onEdit={onEdit}
          onDelete={onDelete}
          onMerge={onMerge}
          onRefreshMetrics={onRefreshMetrics}
        />
      </aside>
    </div>
  );
}
