import { ChevronRight, TriangleAlert, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { stringField } from "../lib/format";
import type { ConversationRenderUnit } from "../state/render-groups";
import { isItemInProgress, itemType } from "../state/thread-item-fields";
import { AnimatedDisclosure } from "./animated-disclosure";
import { ToolActivityDetail } from "./tool-activity-detail";

type ThreadItemUnit = Extract<ConversationRenderUnit, { kind: "threadItem" }>;

export function ThreadItemView({
  unit,
}: {
  unit: ThreadItemUnit;
}) {
  const type = itemType(unit.item);
  if (type === "exec") return <ExecThreadItemView unit={unit} />;
  if (type === "hook") return <HookThreadItemView unit={unit} />;
  if (type === "automatic-approval-review") return <AutoReviewThreadItemView unit={unit} />;
  return <DynamicToolCallThreadItemView unit={unit} />;
}

function ExecThreadItemView({
  unit,
}: {
  unit: ThreadItemUnit;
}) {
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

function DynamicToolCallThreadItemView({
  unit,
}: {
  unit: ThreadItemUnit;
}) {
  const running = isItemInProgress(unit.item);
  const label = dynamicToolCallLabel(unit.item);
  return (
    <div
      className="hc-thread-item-row group"
      data-content-search-unit-key={unit.key}
      data-item-ids={unit.item.id}
      data-item-type="dynamic-tool-call"
    >
      <div className="hc-thread-item-inline text-[13px] leading-5 text-stone-500">
        <span className={`truncate ${running ? "animate-pulse" : ""}`}>{label}</span>
      </div>
    </div>
  );
}

function AutoReviewThreadItemView({
  unit,
}: {
  unit: ThreadItemUnit;
}) {
  const record = unit.item as Record<string, unknown>;
  const title = autoReviewTitle(record);
  const body = autoReviewBody(record);
  const running = stringField(record, "status") === "inProgress";
  const highRiskDenied = stringField(record, "status") === "denied" && stringField(record, "riskLevel") === "high";
  const canExpand = body.length > 0;
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [unit.key]);

  const toneClass = highRiskDenied ? "text-amber-700" : "text-stone-500 group-hover:text-slate-700";
  const titleNode = (
    <>
      {highRiskDenied && (
        <TriangleAlert aria-hidden className="shrink-0 text-amber-700" size={14} />
      )}
      <span className={`min-w-0 truncate ${toneClass} ${running ? "animate-pulse" : ""}`}>
        {title}
      </span>
      {canExpand && (
        <ChevronRight
          aria-hidden
          className={`shrink-0 text-stone-400 transition-[opacity,transform] duration-200 ${
            expanded ? "rotate-90 opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          size={14}
        />
      )}
    </>
  );

  return (
    <div
      className="hc-thread-item-row group"
      data-content-search-unit-key={unit.key}
      data-item-ids={unit.item.id}
      data-item-type="automatic-approval-review"
    >
      {canExpand ? (
        <button
          type="button"
          aria-expanded={expanded}
          className="group flex w-fit max-w-full min-w-0 items-center gap-1.5 px-0 py-0 text-left text-[13px] leading-5"
          onClick={() => setExpanded((value) => !value)}
        >
          {titleNode}
        </button>
      ) : (
        <div className="hc-thread-item-inline text-[13px] leading-5">
          {titleNode}
        </div>
      )}
      {canExpand && (
        <AnimatedDisclosure
          className="hc-thread-item-disclosure"
          innerClassName="hc-thread-item-body"
          open={expanded}
        >
          <p className="hc-thread-item-copy max-w-[80ch] whitespace-pre-wrap pt-1 text-[13px] leading-6 text-stone-500">
            {body}
          </p>
        </AnimatedDisclosure>
      )}
    </div>
  );
}

function HookThreadItemView({
  unit,
}: {
  unit: ThreadItemUnit;
}) {
  const record = unit.item as Record<string, unknown>;
  const run = objectField(record, "run");
  const status = stringField(run, "status") || stringField(record, "status") || "completed";
  const running = status === "running";
  const summary = hookSummary(record);
  const entries = hookEntries(run);
  const hasEntries = entries.length > 0;
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [unit.key]);

  return (
    <div
      className="hc-thread-item-row"
      data-content-search-unit-key={unit.key}
      data-item-ids={unit.item.id}
      data-item-type="hook"
    >
      {hasEntries ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={running ? `${summary} running` : summary}
          className="hc-thread-item-button group flex w-fit max-w-full min-w-0 items-center gap-1.5 rounded-md border border-transparent px-0 py-0 text-left text-[13px] leading-5 text-stone-500 transition-colors hover:bg-black/5 hover:text-slate-700"
          onClick={() => setExpanded((value) => !value)}
        >
          <Wrench aria-hidden className="shrink-0 text-stone-400 group-hover:text-stone-500" size={14} />
          <span className={`min-w-0 flex-1 truncate ${running ? "animate-pulse" : ""}`}>{summary}</span>
          <ChevronRight
            aria-hidden
            className={`hc-thread-item-chevron shrink-0 text-stone-400 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
            size={14}
          />
        </button>
      ) : (
        <div className="hc-thread-item-inline text-[13px] leading-5 text-stone-500">
          <Wrench aria-hidden className="shrink-0 text-stone-400" size={14} />
          <span className={`truncate ${running ? "animate-pulse" : ""}`}>{summary}</span>
        </div>
      )}
      {hasEntries && (
        <AnimatedDisclosure
          className="hc-thread-item-disclosure"
          innerClassName="hc-thread-item-body"
          open={expanded}
        >
          <div className="-mx-1 mt-1 flex flex-col gap-1.5 px-1">
            {entries.map((entry, index) => (
              <p className="hc-thread-item-copy whitespace-pre-wrap text-[13px] leading-6 text-stone-600" key={`${entry.kind}:${index}`}>
                <span className="font-medium text-stone-500">{hookEntryLabel(entry.kind)}:</span>{" "}
                {entry.text}
              </p>
            ))}
          </div>
        </AnimatedDisclosure>
      )}
    </div>
  );
}

export function dynamicToolCallLabel(item: ThreadItemUnit["item"]): string {
  const record = item as Record<string, unknown>;
  const tool = stringField(record, "tool") || stringField(record, "namespace");
  if (!tool) return isItemInProgress(item) ? "Running tool" : "Ran tool";
  if (isItemInProgress(item)) {
    return DYNAMIC_TOOL_RUNNING_LABELS[tool] ?? humanizeToolLabel(tool);
  }
  return DYNAMIC_TOOL_COMPLETED_LABELS[tool] ?? humanizeToolLabel(tool);
}

export function autoReviewTitle(record: Record<string, unknown>): string {
  const status = stringField(record, "status");
  if (status === "approved") return "Auto-review approved";
  if (status === "denied") return stringField(record, "riskLevel") === "high" ? "Auto-review denied high risk" : "Auto-review denied";
  if (status === "timedOut") return "Auto-review timed out";
  if (status === "aborted") return "Auto-review stopped";
  return "Auto-reviewing";
}

export function autoReviewBody(record: Record<string, unknown>): string {
  const rationale = stringField(record, "rationale").trim();
  if (rationale) return rationale;
  const status = stringField(record, "status");
  if (status === "aborted") {
    return "A carefully prompted reviewer agent stopped reviewing this request before Codex ran it.";
  }
  if (status === "timedOut") {
    return "A carefully prompted reviewer agent timed out before Codex ran this request.";
  }
  if (status === "inProgress") {
    return "A carefully prompted reviewer agent is reviewing this request before Codex runs it.";
  }
  return "A carefully prompted reviewer agent reviewed this request.";
}

function hookSummary(record: Record<string, unknown>): string {
  const run = objectField(record, "run");
  const hookLabel = `${hookEventNameLabel(run, record)} hook`;
  const statusMessage = stringField(run, "statusMessage").trim();
  const terminalStatus = hookTerminalStatusLabel(stringField(run, "status"));
  if (!statusMessage) return terminalStatus ? `${hookLabel} ${terminalStatus}` : hookLabel;
  return terminalStatus ? `${hookLabel} ${terminalStatus} - ${statusMessage}` : `${hookLabel} - ${statusMessage}`;
}

function hookEventNameLabel(run: Record<string, unknown>, record: Record<string, unknown>): string {
  const eventName = stringField(run, "eventName") || stringField(record, "key");
  if (eventName === "preToolUse") return "PreToolUse";
  if (eventName === "permissionRequest") return "PermissionRequest";
  if (eventName === "postToolUse") return "PostToolUse";
  if (eventName === "preCompact") return "PreCompact";
  if (eventName === "postCompact") return "PostCompact";
  if (eventName === "sessionStart") return "SessionStart";
  if (eventName === "userPromptSubmit") return "UserPromptSubmit";
  if (eventName === "stop") return "Stop";
  return eventName ? humanizeToolLabel(eventName).replace(/\s+/g, "") : "Hook";
}

function hookTerminalStatusLabel(status: string): string {
  if (status === "blocked") return "blocked";
  if (status === "failed") return "failed";
  if (status === "stopped") return "stopped";
  return "";
}

function hookEntries(run: Record<string, unknown>): Array<{ kind: string; text: string }> {
  const entries = Array.isArray(run.entries) ? run.entries : [];
  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const kind = stringField(entry, "kind") || "context";
    const text = stringField(entry, "text");
    return text ? [{ kind, text }] : [];
  });
}

function hookEntryLabel(kind: string): string {
  if (kind === "warning") return "warning";
  if (kind === "stop") return "stop";
  if (kind === "feedback") return "feedback";
  if (kind === "error") return "error";
  return "context";
}

function objectField(value: unknown, key: string): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  const field = (value as Record<string, unknown>)[key];
  return field && typeof field === "object" ? field as Record<string, unknown> : {};
}

function humanizeToolLabel(value: string): string {
  return value
    .trim()
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((segment) => segment.slice(0, 1).toUpperCase() + segment.slice(1))
    .join(" ");
}

const DYNAMIC_TOOL_COMPLETED_LABELS: Record<string, string> = {
  automation_update: "Automation updated",
  load_workspace_dependencies: "Loaded workspace dependencies",
  read_thread_terminal: "Read thread terminal",
};

const DYNAMIC_TOOL_RUNNING_LABELS: Record<string, string> = {
  automation_update: "Updating automation",
  load_workspace_dependencies: "Loading workspace dependencies",
  read_thread_terminal: "Reading thread terminal",
};
