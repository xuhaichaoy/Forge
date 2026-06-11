import {
  CheckCircle2,
  ChevronRight,
  Circle,
  GitFork,
  LoaderCircle,
  Network,
  Terminal,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { stringField } from "../lib/format";
import type { ConversationRenderUnit } from "../state/render-groups";
import { formatDuration, isItemInProgress, itemType, normalizePlanStepStatus } from "../state/thread-item-fields";
import { AnimatedDisclosure } from "./animated-disclosure";
import { autoReviewBody, autoReviewTitle } from "./auto-review-view-model";
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
  if (type === "proposed-plan") {
    return <PlanSummaryCard unit={unit} threadId={threadId} />;
  }
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
  if (type === "plan") return <PlanSummaryCard unit={unit} threadId={threadId} />;
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
  const detail = toolActivityDetailViewModel(unit.item);
  const running = isItemInProgress(unit.item);
  /*
   * codex: a standalone MCP tool call renders as a collapsible summary row
   * (server/tool icon + tool label + hover chevron) over an animated disclosure
   * holding ONLY the result body — the tool label is NOT repeated inside. The
   * summary label shimmers while the call is active (`no active={!completed}`).
   *
   * Codex inits the open flag `V = a && L` (an MCP app with a ready resource)
   * and a one-shot effect only ever calls `H(true)` — so a regular tool call
   * stays FOLDED while running and after completion, and only MCP apps expand
   * themselves; nothing auto-collapses.
   *
   * (HiCodex keeps its own "server:tool" identity as the label instead of
   * Codex's per-connector `MS` formatting, which needs connector/app metadata
   * HiCodex does not carry; the icon falls back to the MCP `Network` glyph,
   * matching Codex's no-logo fallback.)
   */
  const isMcpApp = detail.kind === "mcpApp";
  const [expanded, setExpanded] = useState(isMcpApp);
  const lastItemId = useRef(unit.item.id);
  useEffect(() => {
    if (lastItemId.current !== unit.item.id) {
      lastItemId.current = unit.item.id;
      setExpanded(isMcpApp);
    } else if (isMcpApp) {
      setExpanded(true);
    }
  }, [unit.item.id, isMcpApp]);

  const label = mcpToolCallSummaryLabel(detail);

  return (
    <div
      className="hc-thread-item-row group"
      data-content-search-unit-key={unit.key}
      data-item-ids={unit.item.id}
      data-item-type="mcp-tool-call"
    >
      <button
        type="button"
        aria-expanded={expanded}
        className="group flex w-fit max-w-full min-w-0 appearance-none items-center self-start gap-1.5 border-0 bg-transparent px-0 py-0 text-left text-[13px] leading-5 text-stone-500 shadow-none transition-colors hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black/20"
        onClick={() => setExpanded((value) => !value)}
      >
        <Network aria-hidden className="shrink-0 text-stone-400 transition-colors group-hover:text-stone-500" size={14} />
        <span className={`min-w-0 flex-1 truncate ${running ? "animate-pulse" : ""}`}>{label}</span>
        <ChevronRight
          aria-hidden
          className={`shrink-0 text-stone-400 transition-[opacity,transform] duration-300 ${
            expanded ? "rotate-90 opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          size={14}
        />
      </button>
      <AnimatedDisclosure
        className="hc-thread-item-disclosure"
        innerClassName="hc-thread-item-body"
        open={expanded}
      >
        <div className="pt-2">
          <ToolActivityDetail
            hideToolTitle
            item={unit.item}
            onMcpAppHostCall={onMcpAppHostCall}
            onReadMcpResource={onReadMcpResource}
            threadId={threadId}
          />
        </div>
      </AnimatedDisclosure>
    </div>
  );
}

function mcpToolCallSummaryLabel(detail: ReturnType<typeof toolActivityDetailViewModel>): string {
  if (detail.kind === "tool" || detail.kind === "mcpApp" || detail.kind === "pendingTool") {
    // detail.name is "server:tool"; the summary label is the humanized TOOL.
    const colon = detail.name.indexOf(":");
    const tool = colon >= 0 ? detail.name.slice(colon + 1) : detail.name;
    return humanizeMcpToolName(tool);
  }
  return "Tool call";
}

/*
 * codex: Codex's MCP summary label `MS(...)` uses per-connector generators ONLY
 * when a `matchingApp` is resolved from the user's connected-connector registry
 * (`resolvedApps`). HiCodex carries no connector registry → `matchingApp` is
 * always null → Codex itself falls back to `HS = WS(US(toolName))`: split the
 * tool name into alphanumeric words (`GS`: lowercase, split on /[^a-z0-9]+/),
 * join with spaces (`US`, no prefix to strip when there's no app), and
 * sentence-case (`WS`). So `create_issue` → "Create issue". This is the faithful
 * no-connector rendering; the server identity rides on the (logo) icon in Codex,
 * which HiCodex shows as the generic `Network` fallback either way.
 */
function humanizeMcpToolName(toolName: string): string {
  const words = toolName.trim().toLowerCase().split(/[^a-z0-9]+/g).filter((word) => word.length > 0);
  const joined = words.length === 0 ? toolName : words.join(" ");
  return joined.length === 0 ? joined : joined.charAt(0).toUpperCase() + joined.slice(1);
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
  const activePlanIndex = plan.findIndex((entry) => normalizePlanStepStatus(entry.status) === "inProgress");

  // codex: local-conversation-thread-*.js — Desktop tracks the
  // current `in_progress` plan index and calls `scrollIntoView({block:
  // "center", behavior: "smooth"})` when that index changes.
  useEffect(() => {
    if (!expanded || activePlanIndex < 0) return;
    activePlanItemRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activePlanIndex, expanded]);

  return (
    <div
      // codex: local-conversation-thread-*.js — wrapper has the
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
          {/* codex nT: the to-do card header is summary text + chevron ONLY — no
              leading status icon (completion is conveyed by the "N out of M tasks
              completed" summary). HiCodex previously rendered an extra Circle/
              CheckCircle2 glyph here; dropped to match. */}
          <span className="hc-inline-plan-summary">{summary}</span>
          {/* codex: local-conversation-thread-*.js — chevron uses
              `opacity-0 group-hover:opacity-100` when collapsed and stays at
              `rotate-180 opacity-100` when expanded. */}
          <ChevronRight
            aria-hidden
            className={`hc-thread-item-chevron hc-inline-plan-chevron shrink-0 text-stone-400 transition-[opacity,transform] duration-300 ${
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
          {/* codex: local-conversation-thread-*.js — body uses
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
                  data-status={normalizePlanStepStatus(entry.status)}
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

// codex: local-conversation-thread-*.js — the inline todo-list
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
    count + (normalizePlanStepStatus(entry.status) === "completed" ? 1 : 0), 0);
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

function todoStatusIcon(status: string) {
  // codex `ow`/`uw` (the REACHABLE standalone todo-list step icon) is `icon-3xs` = 10px
  // (completed → check, else → empty circle; Codex's in-progress glyph `or` is a hair
  // smaller at 9px). This previously cited the unreachable compact `nT` (`icon-xxs` =
  // 12px) by mistake — `nT` never renders in the aligned flow (the last todo-list is
  // hoisted out of grouping). HiCodex keeps a subtle spinner as its in-progress
  // affordance, sized to the 10px step-icon row.
  const normalized = normalizePlanStepStatus(status);
  if (normalized === "completed") return <CheckCircle2 size={10} />;
  if (normalized === "inProgress") return <LoaderCircle className="hc-inline-plan-spinner" size={10} />;
  return <Circle size={10} />;
}

function ExecThreadItemView({
  unit,
}: {
  unit: ThreadItemUnit;
}) {
  const { formatMessage } = useHiCodexIntl();
  const detail = toolActivityDetailViewModel(unit.item);
  const canExpand = detail.kind === "exec";
  const [expanded, setExpanded] = useState(() => detail.kind === "exec" && initialExecShellExpanded(detail));

  useEffect(() => {
    setExpanded(detail.kind === "exec" && initialExecShellExpanded(detail));
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
// {timer}; HiCodex renders the status tag-free (its own span styling) and appends
// the live timer separately (runningTimer), so the i18n values here are the
// tag/timer-stripped base. formatMessage is optional so the locale-free callers
// (and tests) keep the English output unchanged.
export function execThreadItemSummaryLabel(
  detail: Extract<ReturnType<typeof toolActivityDetailViewModel>, { kind: "exec" }>,
  expanded: boolean,
  formatMessage?: HiCodexIntlContextValue["formatMessage"],
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

// codex localConversation.appControlToolCall.* — the manage_codex_threads action
// labels Codex localizes. Only the six actions whose HiCodex English exactly
// matches the bundle are mapped here (list/read/sendMessage/setArchived/
// setPinned/setTitle); create/create_in_worktree keep HiCodex's "thread"
// wording (Codex rebranded those to "chat") so they stay locale-free. Reverse-
// mapped at render so the locale-free dynamicToolCallLabel + its tests are stable.
const APP_CONTROL_LABEL_I18N: Record<string, { id: string; defaultMessage: string }> = {
  "Listing threads": { id: "localConversation.appControlToolCall.threadsList.active", defaultMessage: "Listing threads" },
  "Listed threads": { id: "localConversation.appControlToolCall.threadsList.completed", defaultMessage: "Listed threads" },
  "Reading thread": { id: "localConversation.appControlToolCall.threadsRead.active", defaultMessage: "Reading thread" },
  "Read thread": { id: "localConversation.appControlToolCall.threadsRead.completed", defaultMessage: "Read thread" },
  "Sending message to thread": { id: "localConversation.appControlToolCall.threadsSendMessage.active", defaultMessage: "Sending message to thread" },
  "Sent message to thread": { id: "localConversation.appControlToolCall.threadsSendMessage.completed", defaultMessage: "Sent message to thread" },
  "Updating thread archive": { id: "localConversation.appControlToolCall.threadsSetArchived.active", defaultMessage: "Updating thread archive" },
  "Updated thread archive": { id: "localConversation.appControlToolCall.threadsSetArchived.completed", defaultMessage: "Updated thread archive" },
  "Updating thread pin": { id: "localConversation.appControlToolCall.threadsSetPinned.active", defaultMessage: "Updating thread pin" },
  "Updated thread pin": { id: "localConversation.appControlToolCall.threadsSetPinned.completed", defaultMessage: "Updated thread pin" },
  "Renaming thread": { id: "localConversation.appControlToolCall.threadsSetTitle.active", defaultMessage: "Renaming thread" },
  "Renamed thread": { id: "localConversation.appControlToolCall.threadsSetTitle.completed", defaultMessage: "Renamed thread" },
};

function DynamicToolCallThreadItemView({
  unit,
}: {
  unit: ThreadItemUnit;
}) {
  const { formatMessage } = useHiCodexIntl();
  const running = isItemInProgress(unit.item);
  const rawLabel = dynamicToolCallLabel(unit.item);
  const appControl = isManageCodexThreadsItem(unit.item);
  const labelDescriptor = appControl ? APP_CONTROL_LABEL_I18N[rawLabel] : undefined;
  const label = labelDescriptor ? formatMessage(labelDescriptor) : rawLabel;
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

/*
 * codex split-items-into-render-groups-*.js `Pg`: a `dynamic-tool-call-group`
 * renders as a collapsible section — a summary header (Codex `Ig`: the grouped
 * tool labels with per-label repeat counts) over a body holding each call's row.
 */
export function DynamicToolCallGroupView({
  unit,
}: {
  unit: Extract<ConversationRenderUnit, { kind: "dynamicToolCallGroup" }>;
}) {
  const { formatMessage } = useHiCodexIntl();
  const [expanded, setExpanded] = useState(false);
  const running = unit.items.some((item) => isItemInProgress(item));
  const summary = dynamicToolCallGroupSummary(unit.items, formatMessage);
  return (
    <div className="hc-thread-item-row group" data-content-search-unit-key={unit.key} data-item-type="dynamic-tool-call-group">
      <button
        type="button"
        aria-expanded={expanded}
        className="group flex w-fit max-w-full min-w-0 appearance-none items-center self-start gap-1.5 border-0 bg-transparent px-0 py-0 text-left text-[13px] leading-5 text-stone-500 shadow-none transition-colors hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black/20"
        onClick={() => setExpanded((value) => !value)}
      >
        <span className={`min-w-0 flex-1 truncate ${running ? "animate-pulse" : ""}`}>{summary}</span>
        <ChevronRight
          aria-hidden
          className={`shrink-0 text-stone-400 transition-[opacity,transform] duration-300 ${
            expanded ? "rotate-90 opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          size={14}
        />
      </button>
      <AnimatedDisclosure className="hc-thread-item-disclosure" innerClassName="hc-thread-item-body" open={expanded}>
        <div className="pt-1">
          {unit.items.map((item) => (
            <DynamicToolCallThreadItemView key={item.id} unit={{ kind: "threadItem", key: item.id, item }} />
          ))}
        </div>
      </AnimatedDisclosure>
    </div>
  );
}

/*
 * codex `Ig` + `Bg` + `zg`: dedup the grouped calls by label and append the
 * repeat count (`localConversation.dynamicToolCallGroup.repeatCount` =
 * " {count} times") when a label repeats; join distinct labels with a comma.
 */
function dynamicToolCallGroupSummary(
  items: Extract<ConversationRenderUnit, { kind: "dynamicToolCallGroup" }>["items"],
  formatMessage?: HiCodexIntlContextValue["formatMessage"],
): string {
  const groups: { label: string; count: number }[] = [];
  for (const item of items) {
    const label = dynamicToolCallLabel(item);
    const existing = groups.find((group) => group.label === label);
    if (existing) existing.count += 1;
    else groups.push({ label, count: 1 });
  }
  return groups.map((group) => {
    if (group.count <= 1) return group.label;
    // codex localConversation.dynamicToolCallGroup.repeatCount = " {count} times"
    // (zh "{count} 次") — appended directly to the label like the bundle does.
    const repeat = formatMessage
      ? formatMessage({ id: "localConversation.dynamicToolCallGroup.repeatCount", defaultMessage: " {count} times" }, { count: String(group.count) })
      : ` ${group.count} times`;
    return `${group.label}${repeat}`;
  }).join(", ");
}

function McpServerElicitationThreadItemView({
  unit,
}: {
  unit: ThreadItemUnit;
}) {
  const { formatMessage } = useHiCodexIntl();
  return (
    <div
      className="hc-thread-item-row group"
      data-content-search-unit-key={unit.key}
      data-item-ids={stringField(unit.item as Record<string, unknown>, "id") || stringField(unit.item as Record<string, unknown>, "requestId")}
      data-item-type="mcp-server-elicitation"
    >
      <div className="hc-thread-item-inline text-[13px] leading-5 text-stone-500">
        <span className="hc-thinking-shimmer-text truncate">{formatMessage({ id: "localConversation.approvalRequest.inProgress", defaultMessage: "Awaiting approval" })}</span>
      </div>
    </div>
  );
}

function AutoReviewThreadItemView({
  unit,
}: {
  unit: ThreadItemUnit;
}) {
  const { formatMessage } = useHiCodexIntl();
  const record = unit.item as Record<string, unknown>;
  const title = autoReviewTitle(record, formatMessage);
  const body = autoReviewBody(record, formatMessage);
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
          className={`shrink-0 text-stone-400 transition-[opacity,transform] duration-300 ${
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

export { autoReviewBody, autoReviewTitle } from "./auto-review-view-model";

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
