import { ChevronRight, GitFork } from "lucide-react";
import { useState } from "react";
import { stringField } from "../lib/format";
import type { ConversationRenderUnit } from "../state/render-groups";
import { isItemInProgress } from "../state/thread-item-fields";
import { AnimatedDisclosure } from "./animated-disclosure";
import { useHiCodexIntl, type HiCodexIntlContextValue } from "./i18n-provider";

type ThreadItemUnit = Extract<ConversationRenderUnit, { kind: "threadItem" }>;

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

export function DynamicToolCallThreadItemView({
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
