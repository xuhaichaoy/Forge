import { ChevronRight, Terminal } from "lucide-react";
import { useEffect, useState } from "react";
import { formatDuration } from "../state/thread-item-fields";
import { AnimatedDisclosure } from "./animated-disclosure";
import { useForgeIntl, type ForgeIntlContextValue } from "./i18n-provider";
import type { ThreadItemUnit } from "./thread-item-types";
import {
  initialExecShellExpanded,
  normalizeDesktopShellCommand,
  ToolActivityDetail,
  toolActivityDetailViewModel,
} from "./tool-activity-detail";

export function ExecThreadItemView({
  unit,
}: {
  unit: ThreadItemUnit;
}) {
  const { formatMessage } = useForgeIntl();
  const detail = toolActivityDetailViewModel(unit.item);
  const canExpand = detail.kind === "exec";
  const [expanded, setExpanded] = useState(() => detail.kind === "exec" && initialExecShellExpanded(detail));

  useEffect(() => {
    setExpanded(detail.kind === "exec" && initialExecShellExpanded(detail));
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- 故意以 detail.id/kind 为重置键：仅切换条目时重置展开态，detail 投影逐渲染新引用不得触发回弹
  }, [detail.id, detail.kind]);

  /*
   * codex: a running command appends a live "for {elapsed}" timer to its status
   * (toolSummaryForCmd.runningTimer = ` for {elapsed}`, e.g. "Running command
   * for 4s"), ticking each second off the item's ItemStarted `startedAtMs` and
   * dropped once the command completes.
   */
  const running = detail.kind === "exec" && detail.running;
  const startedAtMs = detail.kind === "exec" ? detail.startedAtMs : null;
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!running || startedAtMs == null) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running, startedAtMs]);

  if (!canExpand) {
    return (
      <div
        className="hc-thread-item-row"
        data-content-search-unit-key={unit.key}
        data-item-ids={unit.item.id}
        data-item-type="exec"
      >
        <ToolActivityDetail item={unit.item} />
      </div>
    );
  }

  const bodyOpen = detail.running || expanded;
  const label = execThreadItemSummaryLabel(detail, bodyOpen, formatMessage);
  const runningTimer = running && startedAtMs != null && nowMs - startedAtMs >= 1000
    ? formatMessage(
        { id: "toolSummaryForCmd.runningTimer", defaultMessage: " for {elapsed}" },
        { elapsed: formatDuration(nowMs - startedAtMs) },
      )
    : null;

  return (
    <div
      className="hc-thread-item-row group"
      data-content-search-unit-key={unit.key}
      data-item-ids={unit.item.id}
      data-item-type="exec"
    >
      <button
        type="button"
        aria-expanded={bodyOpen}
        className="group flex w-fit max-w-full min-w-0 appearance-none items-center self-start gap-1.5 border-0 bg-transparent px-0 py-0 text-left text-[13px] leading-5 text-stone-500 shadow-none transition-colors hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black/20"
        onClick={() => setExpanded((value) => !value)}
      >
        <Terminal aria-hidden className="shrink-0 text-stone-400 transition-colors group-hover:text-stone-500" size={14} />
        <span className={`min-w-0 flex-1 truncate ${detail.running ? "animate-pulse" : ""}`}>
          {label}{runningTimer && <span className="tabular-nums">{runningTimer}</span>}
        </span>
        <ChevronRight
          aria-hidden
          className={`shrink-0 text-stone-400 transition-[opacity,transform] duration-300 ${
            bodyOpen ? "rotate-90 opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          size={14}
        />
      </button>
      <AnimatedDisclosure
        className="hc-thread-item-disclosure"
        innerClassName="hc-thread-item-body"
        open={bodyOpen}
      >
        <div className="pt-2">
          <ToolActivityDetail forceExecExpanded item={unit.item} />
        </div>
      </AnimatedDisclosure>
    </div>
  );
}

// codex toolSummaryForCmd.* — Codex wraps the verb in a <status> tag and appends
// {timer}; Forge renders the status tag-free (its own span styling) and appends
// the live timer separately (runningTimer), so the i18n values here are the
// tag/timer-stripped base. formatMessage is optional so the locale-free callers
// (and tests) keep the English output unchanged.
export function execThreadItemSummaryLabel(
  detail: Extract<ReturnType<typeof toolActivityDetailViewModel>, { kind: "exec" }>,
  expanded: boolean,
  formatMessage?: ForgeIntlContextValue["formatMessage"],
): string {
  if (detail.running) {
    return formatMessage
      ? formatMessage({ id: "toolSummaryForCmd.runningGenericCommand", defaultMessage: "Running command" })
      : "Running command";
  }
  if (detail.footer === "Stopped") {
    if (expanded) {
      return formatMessage
        ? formatMessage({ id: "toolSummaryForCmd.stoppedGenericCommand", defaultMessage: "Stopped command" })
        : "Stopped command";
    }
    return formatMessage
      ? formatMessage({ id: "toolSummaryForCmd.stoppedSpecificCommand", defaultMessage: "Stopped {command}" }, { command: detail.command })
      : `Stopped ${detail.command}`;
  }
  const command = normalizeDesktopShellCommand(detail.command).trim();
  if (!expanded && command) {
    return formatMessage
      ? formatMessage({ id: "toolSummaryForCmd.ranSpecificCommand", defaultMessage: "Ran {command}" }, { command })
      : `Ran ${command}`;
  }
  return formatMessage
    ? formatMessage({ id: "toolSummaryForCmd.ranGenericCommand", defaultMessage: "Ran command" })
    : "Ran command";
}
