import { AlertCircle } from "lucide-react";
import type { ComposerQuotaBannerModel } from "../state/account-state";
import { formatMessage } from "../state/i18n";
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
            {/*
             * codex: upsell banner CTA — ICU id `codex.upsellBanner.cta.viewUsage`
             * defaultMessage:`View Usage` (zh `查看使用情况`). Codex routes to the
             * usage surface here; HiCodex opens the composer status panel.
             */}
            {formatMessage({ id: "codex.upsellBanner.cta.viewUsage", defaultMessage: "View Usage" })}
          </button>
        )}
      />
    </AboveComposerPanel>
  );
}
