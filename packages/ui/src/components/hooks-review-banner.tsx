/*
 * codex: composer-D0cvMZjq.js#T_ — HooksReviewBanner above-composer slot 5.
 *
 * In Codex Desktop this banner sits between the BackgroundSubagents slot and
 * the WindowsSandbox / aboveComposerHeaderContent slots inside the shared
 * `createPortal(<vs>{children}</vs>, So)` stack. Gating expression in the
 * minified bundle is (paraphrased):
 *
 *     pl && fl > 0 && !vs
 *
 * where:
 *   - `pl`  → activeThread.isNew (only render for fresh / first-turn threads)
 *   - `fl`  → hooksNeedingReview.length (count of untrusted/modified hooks)
 *   - `vs`  → dismissed-for-this-thread flag held in component state
 *
 * Codex pulls `fl` from the `hooks/list` response (`HooksListResponse.data[].hooks`)
 * by filtering entries where `trustStatus === "untrusted" || "modified"` (see
 * packages/codex-protocol/src/generated/v2/HookTrustStatus.ts —
 *   "managed" | "untrusted" | "trusted" | "modified"
 * ). Codex caches that list in app state and refreshes it on
 * `hook/completed` notifications + on `/hooks` slash-command refresh.
 *
 * HiCodex audit (test_v2, 2026-05):
 *   - protocol DOES expose `hooks/list` (ClientRequest.ts → HooksListParams /
 *     HooksListResponse with HookMetadata.trustStatus). See
 *     packages/codex-protocol/src/generated/v2/HookMetadata.ts and
 *     packages/codex-protocol/src/generated/v2/HooksListResponse.ts.
 *   - HiCodex `codex-reducer.ts` consumes `hook/started` + `hook/completed`
 *     notifications as log lines only — it does NOT store a hooks list and
 *     has no `hooksNeedingReview` slice. (Confirmed: state/codex-reducer.ts
 *     hook handling at lines 1259-1303 only emits log text.)
 *   - The two existing `hooks/list` callers
 *     (state/slash-request-workflow.ts:293 → `/hooks` command panel,
 *      state/settings-panel-loader.ts:448 → Settings → Hooks panel) project
 *     the response into command-panel entries and discard it; nothing feeds
 *     a banner count.
 *   - There is no `trustStatus` mutation request wired client-side, so
 *     `onTrustAll` would have nowhere to dispatch to in the current build.
 *
 * Decision: keep the component contract in place (props mirror Codex's API)
 * but render `null` until a future change adds:
 *   1. a `hooksNeedingReview: number` (or `Array<HookMetadata>`) slice on
 *      AppState plus the `hooks/list` dispatch wiring; and
 *   2. a backend action / RPC for `trust all` (Codex parity: a `hooks/trust`
 *      request — not yet generated in `packages/codex-protocol/src/generated/`).
 *
 * Mount point reserved in HiCodexApp.tsx is documented at the
 * `AboveComposerPanelContainer` (~ line 4030) between `QueuedFollowUpStack`
 * and `StatusTextPanel`; intentionally NOT wired in this revision.
 */
import { ShieldCheck } from "lucide-react";
import type { ReactElement } from "react";
import { AboveComposerPanel, PanelRow } from "./above-composer-panel";

export interface HooksReviewBannerProps {
  // codex: composer-D0cvMZjq.js#T_ — `fl` (count of hooks needing review).
  count: number;
  // codex: composer-D0cvMZjq.js#T_ — "Trust all" action button handler.
  onTrustAll?: () => void;
  // codex: composer-D0cvMZjq.js#T_ — "Review" button handler (opens /hooks panel).
  onReview?: () => void;
  // codex: composer-D0cvMZjq.js#T_ — `vs` setter (dismiss-for-thread).
  onDismiss?: () => void;
}

/**
 * Above-composer banner that surfaces a "{n} hook(s) need review" prompt
 * with Trust-all / Review actions, matching Codex Desktop's slot 5 UI.
 *
 * Currently audit-only: returns `null` because HiCodex's state layer does
 * not yet track hooks-needing-review (see top-of-file comment for the
 * exact wiring gap and reducer locations).
 */
export function HooksReviewBanner(props: HooksReviewBannerProps): ReactElement | null {
  // codex: composer-D0cvMZjq.js#T_ — count <= 0 → no render (matches `fl > 0` gate).
  // TODO(hicodex): replace this guard with the real `pl && fl > 0 && !vs`
  // expression once `state.hooksNeedingReview` and the dismiss flag exist.
  if (!props || props.count <= 0) return null;

  // Audit-mode short-circuit: HiCodex has no count source today (see comment
  // block above). Returning null until protocol-layer wiring is added keeps
  // the contract stable without injecting placeholder UI.
  // TODO(hicodex): remove this guard once `hooks/list` results are projected
  // into AppState. The render below is the intended Codex-parity output.
  if (!isHooksReviewBannerDataAvailable()) return null;

  const { count, onTrustAll, onReview } = props;
  const noun = count === 1 ? "hook" : "hooks";

  return (
    <AboveComposerPanel className="hc-hooks-review-banner">
      {/*
       * codex: composer-D0cvMZjq.js#T_ — PanelRow with ShieldCheck icon,
       * "{count} hook(s) need review" title, and two trailing buttons.
       */}
      <PanelRow
        icon={<ShieldCheck size={15} aria-hidden="true" />}
        title={(
          <span className="hc-hooks-review-banner-title">
            {`${count} ${noun} need review`}
          </span>
        )}
        actions={(
          <>
            {/* codex: composer-D0cvMZjq.js#T_ — Trust-all action (primary). */}
            <button
              type="button"
              className="hc-hooks-review-banner-action hc-hooks-review-banner-action--primary"
              onClick={onTrustAll}
            >
              Trust all
            </button>
            {/* codex: composer-D0cvMZjq.js#T_ — Review action (opens panel). */}
            <button
              type="button"
              className="hc-hooks-review-banner-action"
              onClick={onReview}
            >
              Review
            </button>
          </>
        )}
      />
    </AboveComposerPanel>
  );
}

/**
 * Exported for tests / future wiring. Today returns `false` because HiCodex's
 * AppState does not yet carry a hooks-needing-review slice. When the protocol
 * `hooks/list` projection is added to `codex-reducer.ts`, swap this to read
 * from that slice (or just delete this gate and pass the count from the
 * caller).
 */
export function isHooksReviewBannerDataAvailable(): boolean {
  // codex: HiCodex audit — no `state.hooksNeedingReview` slice exists yet.
  return false;
}
