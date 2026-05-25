/*
 * codex: local-conversation-page-LOEPC6Ja.pretty.js
 *   - `Zt` (line 1292-1401)  → drawer body: header button + chevron rotate-90 +
 *     framer-motion `animate={{ height: expanded ? "auto" : 0, opacity }}` +
 *     AutoScrollContainer with `maxHeightByState: { expanded: "18rem", collapsed: "0px" }`
 *   - `en` (line 1404-1517)  → data wrapper (current turn + pendingApprovals filter)
 *   - `fn` (line 1893-1942)  → caller: `useState(false)` driving `expanded`,
 *     `<en/>` injected as `aboveComposerContent` with layout="header"
 *
 * i18n strings (Codex defaults):
 *   composer.latestTurn.working = "Working"
 *   composer.latestTurn         = "Latest turn"
 *   Header label override (Pf): "Working for {duration}" / "Worked for {duration}"
 *
 * HiCodex has no framer-motion → animation is plain CSS transitions on
 * `[data-expanded="true"]` (see .hc-working-turn-drawer-body in composer.css).
 */
import { ChevronRight } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { AboveComposerPanel } from "./above-composer-panel";

export interface WorkingTurnDrawerProps {
  isTurnInProgress: boolean;
  startedAtMs: number | null;
  completedAtMs: number | null;
  threadPreview: ReactNode;
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
  /** When set, overrides the auto-computed Working/Latest-turn label. */
  headerLabelOverride?: string | null;
}

export function WorkingTurnDrawer({
  isTurnInProgress,
  startedAtMs,
  completedAtMs,
  threadPreview,
  expanded,
  onExpandedChange,
  headerLabelOverride,
}: WorkingTurnDrawerProps) {
  // codex: local-conversation-page Zt (button + collapsible body composition)
  const elapsedMs = useElapsedMs(startedAtMs, isTurnInProgress && completedAtMs === null);

  const headerLabel =
    headerLabelOverride ??
    computeHeaderLabel({ isTurnInProgress, startedAtMs, completedAtMs, elapsedMs });

  return (
    <AboveComposerPanel className="hc-working-turn-drawer">
      <button
        type="button"
        className="hc-working-turn-drawer-header"
        aria-expanded={expanded}
        onClick={() => onExpandedChange(!expanded)}
      >
        <span className="hc-working-turn-drawer-label">{headerLabel}</span>
        {/* codex: Zt chevron Ge (icon-2xs text-current transition-transform duration-300 + rotate-90 when expanded) */}
        <span
          className="hc-working-turn-drawer-chevron"
          data-expanded={expanded}
          aria-hidden="true"
        >
          <ChevronRight size={14} />
        </span>
      </button>
      {/* codex: Zt motion.div + AutoScrollContainer (max 18rem; pointer-events gated on expanded) */}
      <div
        className="hc-working-turn-drawer-body"
        data-expanded={expanded}
        role="region"
        aria-hidden={!expanded}
      >
        <div className="hc-working-turn-drawer-scroll">{threadPreview}</div>
      </div>
    </AboveComposerPanel>
  );
}

/**
 * codex: Pf header-label calculator (`Working` / `Working for X` / `Latest turn` /
 * `Worked for X`).  Threshold for showing the duration suffix is >= 1s, matching
 * worked-for-divider's existing rule.
 */
function computeHeaderLabel({
  isTurnInProgress,
  startedAtMs,
  completedAtMs,
  elapsedMs,
}: {
  isTurnInProgress: boolean;
  startedAtMs: number | null;
  completedAtMs: number | null;
  elapsedMs: number;
}): string {
  if (isTurnInProgress) {
    if (startedAtMs === null) return "Working";
    return elapsedMs >= 1_000 ? `Working for ${formatDuration(elapsedMs)}` : "Working";
  }
  if (startedAtMs !== null && completedAtMs !== null && completedAtMs > startedAtMs) {
    const ms = completedAtMs - startedAtMs;
    if (ms >= 1_000) return `Worked for ${formatDuration(ms)}`;
  }
  return "Latest turn";
}

/**
 * codex-adjacent: identical pattern to worked-for-divider.tsx :23-27 (1Hz tick).
 * We keep the same cadence to avoid an extra timer; "Working for X" updates once
 * per second which is sufficient for the visual label.
 */
function useElapsedMs(startedAtMs: number | null, tick: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!tick || startedAtMs === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [tick, startedAtMs]);
  if (startedAtMs === null) return 0;
  return Math.max(now - startedAtMs, 0);
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1_000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}
