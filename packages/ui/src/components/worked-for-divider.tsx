import { useEffect, useState } from "react";
import type { ConversationRenderUnit } from "../state/render-groups";
import { formatDuration } from "../state/thread-item-fields";

type WorkedForUnit = Extract<ConversationRenderUnit, { kind: "toolActivity" }>;

/**
 * Codex Desktop's in-progress worked-for divider (`Ah` at
 * codex-local-conversation-thread.pretty.js :3315-3326): a non-interactive row
 * with a live "Working for {time}" / "Working" / "Worked for {time}" label
 * (`kh` :3305-3313) followed by a full-width 1px rule. Invoked from the
 * thread-item render loop at :7434 for `case 'worked-for'`. Codex uses
 * framer-motion (`initial: { opacity: 0, height: 0 }`,
 * `animate: { opacity: 1, height: 'auto' }`, `transition: yo`); HiCodex has no
 * framer-motion dep, so we fade in via plain CSS.
 */
export function WorkedForDivider({ unit }: { unit: WorkedForUnit }) {
  const item = workedForItem(unit);
  const status = typeof item?.status === "string" ? item.status : "";
  const startedAtMs = readNumber(item, "startedAtMs");
  const completedAtMs = readNumber(item, "completedAtMs");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (status !== "working" || startedAtMs === null || completedAtMs !== null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [completedAtMs, startedAtMs, status]);

  const label = workedForLabel({ status, startedAtMs, completedAtMs, now });

  return (
    <div
      className="hc-worked-for-live"
      data-content-search-unit-key={unit.key}
      data-item-ids={unit.items.map((it) => it.id).join(" ")}
    >
      {/*
        * Inner div mirrors Codex `Ah` (:3325)
        * `text-size-chat flex min-h-0 flex-col items-start gap-2 overflow-hidden
        * text-token-text-secondary`. The outer wrapper provides the
        * height/opacity animation that Codex achieves with framer-motion.
        */}
      <div className="hc-worked-for-live-inner">
        <span className="hc-worked-for-live-label">{label}</span>
        <div className="hc-worked-for-live-rule" aria-hidden />
      </div>
    </div>
  );
}

function workedForItem(unit: WorkedForUnit): Record<string, unknown> | undefined {
  return unit.items.find(
    (item) => item.type === "worked-for" || item.type === "workedFor",
  ) as Record<string, unknown> | undefined;
}

function readNumber(record: Record<string, unknown> | undefined, key: string): number | null {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function workedForLabel({
  status,
  startedAtMs,
  completedAtMs,
  now,
}: {
  status: string;
  startedAtMs: number | null;
  completedAtMs: number | null;
  now: number;
}): string {
  if (startedAtMs === null) {
    return status === "working" ? "Working" : "Worked";
  }
  const elapsedMs = Math.max((completedAtMs ?? now) - startedAtMs, 0);
  if (status === "working") {
    return elapsedMs >= 1_000 ? `Working for ${formatDuration(elapsedMs)}` : "Working";
  }
  return elapsedMs >= 1_000 ? `Worked for ${formatDuration(elapsedMs)}` : "Worked for 0s";
}
