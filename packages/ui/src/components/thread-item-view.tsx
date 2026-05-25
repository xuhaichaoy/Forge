import {
  CheckCircle2,
  ChevronRight,
  Circle,
  GitFork,
  LoaderCircle,
  Terminal,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { stringField } from "../lib/format";
import type { ConversationRenderUnit } from "../state/render-groups";
import { isItemInProgress, itemType } from "../state/thread-item-fields";
import { AnimatedDisclosure } from "./animated-disclosure";
import { useHiCodexIntl, type HiCodexIntlContextValue } from "./i18n-provider";
import { PlanSummaryCard } from "./plan-summary-card";
import {
  initialExecShellExpanded,
  type McpAppHostCallHandler,
  type ReadMcpResourceHandler,
  normalizeDesktopShellCommand,
  ToolActivityDetail,
  toolActivityDetailViewModel,
} from "./tool-activity-detail";

type ThreadItemUnit = Extract<ConversationRenderUnit, { kind: "threadItem" }>;

export function ThreadItemView({
  onMcpAppHostCall,
  onReadMcpResource,
  threadId = null,
  unit,
}: {
  onMcpAppHostCall?: McpAppHostCallHandler;
  onReadMcpResource?: ReadMcpResourceHandler;
  threadId?: string | null;
  unit: ThreadItemUnit;
}) {
  const type = itemType(unit.item);
  if (type === "exec") return <ExecThreadItemView unit={unit} />;
  if (type === "mcp-tool-call") {
    return (
      <McpToolCallThreadItemView
        unit={unit}
        onMcpAppHostCall={onMcpAppHostCall}
        onReadMcpResource={onReadMcpResource}
        threadId={threadId}
      />
    );
  }
  if (type === "mcp-server-elicitation") return <McpServerElicitationThreadItemView unit={unit} />;
  if (type === "todo-list") return <TodoListThreadItemView unit={unit} />;
  if (type === "proposed-plan") return <PlanSummaryCard unit={unit} />;
  /*
   * Plan ThreadItem 独立渲染。
   * 协议层 Plan { id, text }（v2/item.rs:236）独立 variant，与 proposed-plan 共用
   * PlanSummaryCard 渲染（plan-summary-card.tsx planSummaryContent 同时支持 text/content）。
   *
   * 注：其余 ThreadItem variant（hookPrompt / enteredReviewMode / exitedReviewMode /
   * contextCompaction / imageView / imageGeneration）按 DEVELOPMENT.md:114-116 规则
   * 不渲染为 standalone row：hook 由 user-message hookStats 字段承担，reasoning 仅
   * thinking-placeholder 渲染，其他由 event-projection 处理为 markdown event 或丢弃。
   */
  if (type === "plan") return <PlanSummaryCard unit={unit} />;
  if (type === "automatic-approval-review") return <AutoReviewThreadItemView unit={unit} />;
  return <DynamicToolCallThreadItemView unit={unit} />;
}

function McpToolCallThreadItemView({
  onMcpAppHostCall,
  onReadMcpResource,
  threadId,
  unit,
}: {
  onMcpAppHostCall?: McpAppHostCallHandler;
  onReadMcpResource?: ReadMcpResourceHandler;
  threadId: string | null;
  unit: ThreadItemUnit;
}) {
  return (
    <div
      className="hc-thread-item-row"
      data-content-search-unit-key={unit.key}
      data-item-ids={unit.item.id}
      data-item-type="mcp-tool-call"
    >
      <ToolActivityDetail
        item={unit.item}
        onMcpAppHostCall={onMcpAppHostCall}
        onReadMcpResource={onReadMcpResource}
        threadId={threadId}
      />
    </div>
  );
}

function TodoListThreadItemView({
  unit,
}: {
  unit: ThreadItemUnit;
}) {
  const { formatMessage } = useHiCodexIntl();
  const plan = todoPlanItems(unit.item);
  const [expanded, setExpanded] = useState(true);
  const activePlanItemRef = useRef<HTMLLIElement | null>(null);
  const summary = todoListSummaryLabel(unit.item, formatMessage);
  const activePlanIndex = plan.findIndex((entry) => normalizedTodoStatus(entry.status) === "inProgress");
  const completed = plan.length > 0 && plan.every((entry) => normalizedTodoStatus(entry.status) === "completed");

  // codex: local-conversation-thread-CecHj6JI.js#tv — Desktop tracks the
  // current `in_progress` plan index and calls `scrollIntoView({block:
  // "center", behavior: "smooth"})` when that index changes.
  useEffect(() => {
    if (!expanded || activePlanIndex < 0) return;
    activePlanItemRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activePlanIndex, expanded]);

  return (
    <div
      // codex: local-conversation-thread-CecHj6JI.js#Uv — wrapper has the
      // `group` modifier so the chevron's `group-hover:opacity-100` rule can
      // light up on row hover when the card is collapsed.
      className="hc-thread-item-row group"
      data-content-search-unit-key={unit.key}
      data-item-ids={unit.item.id}
      data-item-type="todo-list"
    >
      <div className="hc-inline-plan-card">
        <button
          aria-expanded={expanded}
          className="hc-inline-plan-header"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          <span className="hc-inline-plan-header-icon" aria-hidden="true">
            {completed ? <CheckCircle2 size={14} /> : <Circle size={14} />}
          </span>
          <span className="hc-inline-plan-summary">{summary}</span>
          {/* codex: local-conversation-thread-CecHj6JI.js#Uv — chevron uses
              `opacity-0 group-hover:opacity-100` when collapsed and stays at
              `rotate-180 opacity-100` when expanded. */}
          <ChevronRight
            aria-hidden
            className={`hc-thread-item-chevron hc-inline-plan-chevron shrink-0 text-stone-400 transition-[opacity,transform] duration-200 ${
              expanded ? "is-open" : ""
            }`}
            size={14}
          />
        </button>
        <AnimatedDisclosure
          className="hc-thread-item-disclosure"
          innerClassName="hc-inline-plan-body"
          open={expanded}
        >
          {/* codex: local-conversation-thread-CecHj6JI.js#Uv — body uses
              `vertical-scroll-fade-mask max-h-40 space-y-1 overflow-y-auto
              [--edge-fade-distance:2rem]`. We mirror the mask + max-height via
              the existing `hc-inline-plan-list` class with an extra `.is-fade`
              modifier so the fade only applies inside the todo card. */}
          <ol className="hc-inline-plan-list is-fade">
            {plan.map((entry, index) => (
              <li
                className="hc-inline-plan-row"
                key={`${entry.step}:${index}`}
                ref={index === activePlanIndex ? activePlanItemRef : null}
              >
                <span className="hc-inline-plan-prefix">
                  <span className="hc-inline-plan-status" aria-hidden="true">
                    {todoStatusIcon(entry.status)}
                  </span>
                  <span className="hc-inline-plan-index">
                    {formatMessage({
                      id: "codex.todoPlan.stepIndexPrefix",
                      defaultMessage: "{index}.",
                      description: "Prefix numbering for a plan step, including a trailing period",
                    }, { index: index + 1 })}
                  </span>
                </span>
                <span
                  className="hc-inline-plan-step"
                  data-status={normalizedTodoStatus(entry.status)}
                >
                  {entry.step}
                </span>
              </li>
            ))}
          </ol>
        </AnimatedDisclosure>
      </div>
    </div>
  );
}

// codex: local-conversation-thread-CecHj6JI.js#tv — the inline todo-list
// ThreadItem header always uses
// `localConversationPage.planItemsCompleted`: "{completedItems} out of
// {totalItems, plural, one {# task completed} other {# tasks completed}}".
// The separate `codex.plan.todoListCreated` copy belongs to a different
// collapsed activity component and should not be used for this standalone row.
export function todoListSummaryLabel(
  item: ThreadItemUnit["item"],
  formatMessage: HiCodexIntlContextValue["formatMessage"] = fallbackTodoListFormatMessage,
): string {
  const plan = todoPlanItems(item);
  const total = plan.length;
  const completed = plan.reduce((count, entry) =>
    count + (normalizedTodoStatus(entry.status) === "completed" ? 1 : 0), 0);
  return formatMessage({
    id: "localConversationPage.planItemsCompleted",
    defaultMessage: "{completedItems} out of {totalItems, plural, one {# task completed} other {# tasks completed}}",
    description: "Title for a plan that the model generates font-medium",
  }, { completedItems: completed, totalItems: total });
}

function fallbackTodoListFormatMessage(
  descriptor: Parameters<HiCodexIntlContextValue["formatMessage"]>[0],
  values: Parameters<HiCodexIntlContextValue["formatMessage"]>[1] = {},
): string {
  return descriptor.defaultMessage
    .replace(/\{totalItems,\s*plural,\s*one\s*\{# task completed\}\s*other\s*\{# tasks completed\}\s*\}/g, () => {
      const total = Number(values.totalItems ?? 0);
      return `${values.totalItems ?? 0} ${total === 1 ? "task" : "tasks"} completed`;
    })
    .replace(/\{completedItems\}/g, String(values.completedItems ?? 0));
}

function todoPlanItems(item: ThreadItemUnit["item"]): Array<{ step: string; status: string }> {
  const record = item as Record<string, unknown>;
  if (!Array.isArray(record.plan)) return [];
  return record.plan.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const planEntry = entry as Record<string, unknown>;
    const step = typeof planEntry.step === "string" ? planEntry.step.trim() : "";
    if (!step) return [];
    const status = typeof planEntry.status === "string" ? planEntry.status : "";
    return [{ step, status }];
  });
}

function normalizedTodoStatus(status: string): "completed" | "inProgress" | "pending" {
  if (status === "completed" || status === "complete" || status === "done") return "completed";
  if (status === "in_progress" || status === "inProgress" || status === "running" || status === "active") {
    return "inProgress";
  }
  return "pending";
}

function todoStatusIcon(status: string) {
  const normalized = normalizedTodoStatus(status);
  if (normalized === "completed") return <CheckCircle2 size={14} />;
  if (normalized === "inProgress") return <LoaderCircle className="hc-inline-plan-spinner" size={14} />;
  return <Circle size={14} />;
}

function ExecThreadItemView({
  unit,
}: {
  unit: ThreadItemUnit;
}) {
  const detail = toolActivityDetailViewModel(unit.item);
  const canExpand = detail.kind === "exec";
  const [expanded, setExpanded] = useState(() => detail.kind === "exec" && initialExecShellExpanded(detail));

  useEffect(() => {
    setExpanded(detail.kind === "exec" && initialExecShellExpanded(detail));
  }, [detail.id, detail.kind]);

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
  const label = execThreadItemSummaryLabel(detail, bodyOpen);

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
        <span className={`min-w-0 flex-1 truncate ${detail.running ? "animate-pulse" : ""}`}>{label}</span>
        <ChevronRight
          aria-hidden
          className={`shrink-0 text-stone-400 transition-[opacity,transform] duration-200 ${
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

export function execThreadItemSummaryLabel(
  detail: Extract<ReturnType<typeof toolActivityDetailViewModel>, { kind: "exec" }>,
  expanded: boolean,
): string {
  if (detail.running) return "Running command";
  if (detail.footer === "Stopped") return expanded ? "Stopped command" : `Stopped ${detail.command}`;
  const command = normalizeDesktopShellCommand(detail.command).trim();
  return !expanded && command ? `Ran ${command}` : "Ran command";
}

function DynamicToolCallThreadItemView({
  unit,
}: {
  unit: ThreadItemUnit;
}) {
  const running = isItemInProgress(unit.item);
  const label = dynamicToolCallLabel(unit.item);
  const appControl = isManageCodexThreadsItem(unit.item);
  return (
    <div
      className="hc-thread-item-row group"
      data-content-search-unit-key={unit.key}
      data-item-ids={unit.item.id}
      data-item-type="dynamic-tool-call"
    >
      <div className={`hc-thread-item-inline text-[13px] leading-5 text-stone-500 ${appControl ? "gap-2" : ""}`}>
        {appControl && <GitFork aria-hidden className="shrink-0 text-stone-400" size={14} />}
        <span className={`truncate ${running ? "animate-pulse" : ""}`}>{label}</span>
      </div>
    </div>
  );
}

function McpServerElicitationThreadItemView({
  unit,
}: {
  unit: ThreadItemUnit;
}) {
  return (
    <div
      className="hc-thread-item-row group"
      data-content-search-unit-key={unit.key}
      data-item-ids={stringField(unit.item as Record<string, unknown>, "id") || stringField(unit.item as Record<string, unknown>, "requestId")}
      data-item-type="mcp-server-elicitation"
    >
      <div className="hc-thread-item-inline text-[13px] leading-5 text-stone-500">
        <span className="hc-thinking-shimmer-text truncate">Awaiting approval</span>
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

export function dynamicToolCallLabel(item: ThreadItemUnit["item"]): string {
  const record = item as Record<string, unknown>;
  const tool = stringField(record, "tool") || stringField(record, "namespace");
  if (!tool) return isItemInProgress(item) ? "Running tool" : "Ran tool";
  const manageThreadsLabel = manageCodexThreadsLabel(record, isItemInProgress(item));
  if (manageThreadsLabel) return manageThreadsLabel;
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

function manageCodexThreadsLabel(record: Record<string, unknown>, running: boolean): string | null {
  if (stringField(record, "tool") !== "manage_codex_threads") return null;
  const action = stringField(objectField(record, "arguments"), "type");
  return running
    ? MANAGE_CODEX_THREADS_RUNNING_LABELS[action] ?? null
    : MANAGE_CODEX_THREADS_COMPLETED_LABELS[action] ?? null;
}

function isManageCodexThreadsItem(item: ThreadItemUnit["item"]): boolean {
  const record = item as Record<string, unknown>;
  return manageCodexThreadsLabel(record, isItemInProgress(item)) !== null;
}

const MANAGE_CODEX_THREADS_COMPLETED_LABELS: Record<string, string> = {
  "app.help": "Checked thread actions",
  "threads.create": "Created new thread",
  "threads.create_in_worktree": "Created worktree thread",
  "threads.list": "Listed threads",
  "threads.read": "Read thread",
  "threads.send_message": "Sent message to thread",
  "threads.set_archived": "Updated thread archive",
  "threads.set_pinned": "Updated thread pin",
  "threads.set_title": "Renamed thread",
};

const MANAGE_CODEX_THREADS_RUNNING_LABELS: Record<string, string> = {
  "app.help": "Checking thread actions",
  "threads.create": "Creating new thread",
  "threads.create_in_worktree": "Creating worktree thread",
  "threads.list": "Listing threads",
  "threads.read": "Reading thread",
  "threads.send_message": "Sending message to thread",
  "threads.set_archived": "Updating thread archive",
  "threads.set_pinned": "Updating thread pin",
  "threads.set_title": "Renaming thread",
};
