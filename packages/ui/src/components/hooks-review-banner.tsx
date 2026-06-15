/*
 * codex: composer-*.js HooksReviewBanner above-composer slot.
 * Desktop v26.527.31326 filters `hooks/list` entries with
 * trustStatus "untrusted" / "modified" and its Trust all action writes
 * `hooks.state` trusted_hash values through config/batchWrite.
 */
import { TriangleAlert } from "lucide-react";
import type { ReactElement } from "react";
import { AboveComposerPanel, PanelRow } from "./above-composer-panel";
import { useForgeIntl } from "./i18n-provider";

export interface HooksReviewBannerProps {
  // codex: composer-*.js — count of hooks needing review.
  count: number;
  // codex: composer-*.js — "Trust all" action button handler.
  onTrustAll?: () => void;
  // codex: composer-*.js — "Review" button handler (opens /hooks panel).
  onReview?: () => void;
}

export function HooksReviewBanner(props: HooksReviewBannerProps): ReactElement | null {
  const { formatMessage } = useForgeIntl();
  if (!props || props.count <= 0) return null;

  const { count, onTrustAll, onReview } = props;
  const summary = formatMessage({
    id: "codex.hooksReviewBanner.summary",
    defaultMessage: "{count, plural, one {# hook needs review before it can run} other {# hooks need review before they can run}}",
  }, { count });
  const trustAll = formatMessage({ id: "codex.hooksReviewBanner.trustAll", defaultMessage: "Trust all" });
  const review = formatMessage({ id: "codex.hooksReviewBanner.review", defaultMessage: "Review hooks" });

  return (
    <AboveComposerPanel className="hc-hooks-review-banner">
      <PanelRow
        className="hc-hooks-review-banner-row"
        icon={<TriangleAlert className="hc-hooks-review-banner-icon" size={14} aria-hidden="true" />}
        titleClassName="hc-hooks-review-banner-title"
        title={(
          <span>{summary}</span>
        )}
        actions={(
          <>
            <button
              type="button"
              className="hc-hooks-review-banner-action"
              onClick={onTrustAll}
            >
              {trustAll}
            </button>
            <button
              type="button"
              className="hc-hooks-review-banner-action"
              onClick={onReview}
            >
              {review}
            </button>
          </>
        )}
      />
    </AboveComposerPanel>
  );
}
