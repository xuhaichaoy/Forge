import { useEffect, useState } from "react";
import type { ConversationRenderUnit } from "../state/render-groups";
import { isItemInProgress, itemType } from "../state/thread-item-fields";
import { useHiCodexIntl } from "./i18n-provider";

type ToolActivityUnit = Extract<ConversationRenderUnit, { kind: "toolActivity" }>;

export function useToolActivitySummaryLabel(unit: ToolActivityUnit): string {
  const { formatMessage } = useHiCodexIntl();
  const [now, setNow] = useState(() => Date.now());
  const workedForItem = unit.summary.groupType === "worked-for" ? workedForActivityItem(unit.items) : undefined;
  const status = typeof workedForItem?.status === "string" ? workedForItem.status : "";
  const startedAtMs = numberField(workedForItem, "startedAtMs");
  const completedAtMs = numberField(workedForItem, "completedAtMs");

  useEffect(() => {
    if (status !== "working" || startedAtMs === null || completedAtMs !== null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [completedAtMs, startedAtMs, status]);

  if (!workedForItem || startedAtMs === null || status !== "working") return unit.summary.label;
  const elapsedMs = Math.max((completedAtMs ?? now) - startedAtMs, 0);
  // CODEX-REF local-conversation-thread-CEeZyOcp.js
  //   id:`localConversation.workingFor`, defaultMessage:`Working for {time}`
  //   id:`localConversation.working`,    defaultMessage:`Working`
  return elapsedMs >= 1_000
    ? formatMessage(
        { id: "localConversation.workingFor", defaultMessage: "Working for {time}" },
        { time: formatWorkedDuration(elapsedMs) },
      )
    : formatMessage({ id: "localConversation.working", defaultMessage: "Working" });
}

function numberField(record: Record<string, unknown> | undefined, field: string): number | null {
  const value = record?.[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function workedForActivityItem(items: ToolActivityUnit["items"]) {
  return items.find((item) => item.type === "worked-for" || item.type === "workedFor") as Record<string, unknown> | undefined;
}

// codex `zu`/`Bu`: floor to whole seconds (not round) + hours tier, zero units trimmed.
function formatWorkedDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1_000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    const parts = [`${hours}h`];
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0) parts.push(`${seconds}s`);
    return parts.join(" ");
  }
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

/**
 * Codex's single-command / exec summary row appends a live `toolSummaryForCmd
 * .runningTimer` (" for {elapsed}", tabular-nums) span after the status text while
 * the command runs (e.g. "Running command for 4s", ticking each second). HiCodex
 * only timed the worked-for group, so this hook supplies the per-command elapsed
 * for an in-progress single exec row in a collapsed-tool-activity unit.
 *
 * Scope mirrors the finding: a single in-progress `exec` item that is NOT routed to
 * exploration (own group type) or a running web-search command. Uses the item's
 * `startedAtMs` with the same floor-seconds format as worked-for.
 */
function runningCommandStartedAtMs(unit: ToolActivityUnit): number | null {
  if (unit.summary.groupType !== "collapsed-tool-activity" || !unit.summary.inProgress) return null;
  if (unit.summary.counts.runningWebSearchCommands > 0) return null;
  if (unit.items.length !== 1) return null;
  const item = unit.items[0];
  if (!item || itemType(item) !== "exec" || !isItemInProgress(item)) return null;
  return numberField(item as Record<string, unknown>, "startedAtMs");
}

export function useRunningCommandElapsed(unit: ToolActivityUnit): string | null {
  const startedAtMs = runningCommandStartedAtMs(unit);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAtMs === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [startedAtMs]);

  if (startedAtMs === null) return null;
  const elapsedMs = Math.max(now - startedAtMs, 0);
  return elapsedMs >= 1_000 ? formatWorkedDuration(elapsedMs) : null;
}
