import { AlertCircle } from "lucide-react";
import type { ComposerQuotaBannerModel } from "../state/account-state";
import { AboveComposerPanel, PanelRow } from "./above-composer-panel";

export interface ComposerQuotaBannerProps {
  banner: ComposerQuotaBannerModel | null;
  onViewStatus: () => void;
}

export function ComposerQuotaBanner({
  banner,
  onViewStatus,
}: ComposerQuotaBannerProps) {
  if (!banner) return null;
  return (
    <AboveComposerPanel className="hc-composer-quota-banner" data-tone={banner.tone}>
      <PanelRow
        icon={<AlertCircle size={14} />}
        title={banner.title}
        meta={banner.detail}
        actions={(
          <button
            type="button"
            className="hc-composer-quota-banner-action"
            onClick={onViewStatus}
          >
            View status
          </button>
        )}
      />
    </AboveComposerPanel>
  );
}
