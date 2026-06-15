/*
 * Leaf i18n label helpers for the tool-activity grouping projection, extracted
 * verbatim from tool-activity-grouping.ts (mechanical split). Pure wrappers
 * over formatMessage/formatDuration plus the shared string utilities
 * (joinConjunction, lowerInitial); no module state, no item parsing.
 */
import { formatMessage } from "./i18n";
import { formatDuration } from "./thread-item-fields";

export function joinConjunction(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join("");
  if (typeof Intl !== "undefined" && typeof Intl.ListFormat === "function") {
    try {
      return new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(parts);
    } catch {
      /* fall through to fallback below */
    }
  }
  // Fallback for environments without Intl.ListFormat: "a, b, and c"
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

export function lowerInitial(value: string): string {
  return value.length === 0 ? value : value[0].toLowerCase() + value.slice(1);
}

// Activity header / row label helpers. These wrap the runtime formatMessage calls so the
// in-loop `summarizeToolActivity` body and `activityLabel` stay readable; each resolves
// against the active locale at call time (formatMessage reads the module-level i18n bundle).
export function thinkingLabel(): string {
  return formatMessage({ id: "reasoningItem.thinking", defaultMessage: "Thinking" });
}

export function thoughtLabel(): string {
  return formatMessage({ id: "reasoningItem.thought", defaultMessage: "Thought" });
}

export function thoughtForLabel(totalDurationMs: number): string {
  return formatMessage(
    { id: "reasoningItem.thoughtWithElapsed", defaultMessage: "Thought for {elapsed}" },
    { elapsed: formatDuration(totalDurationMs) },
  );
}

export function exploringLabel(): string {
  return formatMessage({ id: "localConversationTurn.exploration.accordion.header.active", defaultMessage: "Exploring" });
}

export function exploredLabel(): string {
  return formatMessage({ id: "localConversationTurn.exploration.accordion.header.complete", defaultMessage: "Explored" });
}

export function searchingTheWebLabel(): string {
  return formatMessage({ id: "codex.webSearch.summary.verb.inProgress", defaultMessage: "Searching the web" });
}

export function searchedWebLabel(): string {
  return formatMessage({ id: "codex.webSearch.summary.verb.completed", defaultMessage: "Searched web" });
}

export function creatingFolderLabel(): string {
  return formatMessage(
    { id: "localConversation.toolActivitySummary.folders.creating.leading", defaultMessage: "{count, plural, one {Creating folder} other {Creating # folders}}" },
    { count: 1 },
  );
}

export function workingLabel(): string {
  return formatMessage({ id: "localConversation.working", defaultMessage: "Working" });
}

export function workedLabel(): string {
  return formatMessage({ id: "hc.toolActivity.worked", defaultMessage: "Worked" });
}

export function workedForDurationLabel(totalDurationMs: number, inProgress: boolean): string {
  const time = formatDuration(totalDurationMs);
  return inProgress
    ? formatMessage({ id: "localConversation.workingFor", defaultMessage: "Working for {time}" }, { time })
    : formatMessage({ id: "localConversation.workedFor", defaultMessage: "Worked for {time}" }, { time });
}

export function updatedPlanLabel(): string {
  return formatMessage({ id: "hc.toolActivity.updatedPlan", defaultMessage: "Updated plan" });
}

export function updatedProgressLabel(): string {
  return formatMessage({ id: "hc.toolActivity.updatedProgress", defaultMessage: "Updated progress" });
}

export function waitingOnMcpToolLabel(): string {
  return formatMessage({ id: "hc.toolActivity.waitingOnMcpTool", defaultMessage: "Waiting on MCP tool" });
}

export function approvedRequestRowLabel(): string {
  return formatMessage(
    { id: "localConversation.toolActivitySummary.approvedRequests.leading", defaultMessage: "{count, plural, one {Approved request} other {Approved # requests}}" },
    { count: 1 },
  );
}

export function deniedRequestRowLabel(): string {
  return formatMessage(
    { id: "localConversation.toolActivitySummary.deniedRequests.leading", defaultMessage: "{count, plural, one {Denied request} other {Denied # requests}}" },
    { count: 1 },
  );
}

export function calledToolLabel(name: string, inProgress: boolean): string {
  return inProgress
    ? formatMessage({ id: "hc.toolActivity.callingTool", defaultMessage: "Calling {name}" }, { name })
    : formatMessage({ id: "hc.toolActivity.calledTool", defaultMessage: "Called {name}" }, { name });
}

export function webSearchRowLabel(detail: string, inProgress: boolean): string {
  const label = inProgress ? searchingTheWebLabel() : searchedWebLabel();
  const details = detail
    ? formatMessage({ id: "codex.webSearch.summary.details", defaultMessage: " for {query}" }, { query: detail })
    : "";
  return formatMessage(
    { id: "codex.webSearch.summary", defaultMessage: "{label}{details}" },
    { label, details },
  );
}
