import type { ConversationRenderUnit } from "../state/render-groups";
import { mcpAppResourceUri } from "../state/thread-item-fields";
import { isRunningSkillDefinitionRead } from "../state/tool-activity-grouping";

export type ToolActivityViewState = "collapsed" | "expanded" | "preview";

export function workedForExpandedDetailItems(
  unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>,
): Extract<ConversationRenderUnit, { kind: "toolActivity" }>["items"] {
  if (unit.summary.groupType !== "worked-for") return [];
  return toolActivityDetailItems(unit);
}

export function initialToolActivityExpanded(unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>): boolean {
  return initialToolActivityViewState(unit) !== "collapsed";
}

export function initialToolActivityViewState(
  unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>,
): ToolActivityViewState {
  if (typeof unit.summary.defaultExpanded === "boolean") {
    return unit.summary.defaultExpanded ? "expanded" : "collapsed";
  }
  if (unit.summary.groupType === "web-search-group") return unit.summary.inProgress ? "collapsed" : "expanded";
  if (unit.summary.groupType === "exploration") return unit.summary.inProgress ? "preview" : "collapsed";
  if (unit.summary.groupType === "reasoning") return "collapsed";
  if (
    unit.summary.groupType === "collapsed-tool-activity"
    && unit.items.some((item) => Boolean(mcpAppResourceUri(item)))
  ) {
    return "expanded";
  }
  return (
    unit.summary.inProgress
    && unit.summary.groupType === "multi-agent-group"
  ) ? "expanded" : "collapsed";
}

export function isToolActivityExpandable(unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>): boolean {
  if (unit.summary.groupType === "reasoning") return false;
  if (unit.summary.groupType === "exploration" && unit.summary.inProgress) return false;
  if (unit.summary.groupType === "web-search-group" && unit.summary.inProgress) return false;
  return toolActivityDetailItems(unit).length > 0;
}

export function shouldShowToolActivityInlineDetail(
  unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>,
  detail: string | null | undefined,
): boolean {
  return Boolean(
    detail
      && unit.summary.inProgress
      && unit.summary.groupType !== "worked-for"
      && unit.summary.groupType !== "multi-agent-group"
      && unit.summary.groupType !== "collapsed-tool-activity"
      && unit.summary.groupType !== "web-search-group",
  );
}

export function toolActivityDetailItems(unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>) {
  if (unit.summary.groupType === "worked-for") {
    return unit.items.filter((item) => item.type !== "worked-for" && item.type !== "workedFor");
  }
  if (unit.summary.groupType === "exploration") {
    return unit.items.filter((item) => item.type === "exec" || item.type === "commandExecution");
  }
  /*
   * Reasoning items live inside cross-type mergeable buckets per Codex `Ge` :7782
   * but are never rendered as their own detail row — `Jw` :7881 maps reasoning
   * entries to `F2 = null`. Without filtering them out here, `GenericToolActivityView`
   * would iterate them as ordinary detail rows and the `ItemBlock` fallback would
   * serialize the raw ThreadItem as JSON, producing the `"type": "reasoning"` blocks
   * the user reported.
   */
  return unit.items.filter((item) => item.type !== "reasoning" && !isRunningSkillDefinitionRead(item));
}
