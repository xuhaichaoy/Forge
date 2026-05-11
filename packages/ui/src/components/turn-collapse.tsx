import { useCallback, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import type { AccumulatedThreadItem, ConversationRenderUnit } from "../state/render-groups";
import { AnimatedDisclosure } from "./animated-disclosure";

export function useTurnCollapsed(
  turnId: string | null | undefined,
  defaultCollapsed: boolean,
  collapsedOverride?: boolean,
  onCollapsedChange?: (collapsed: boolean) => void,
): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState<boolean>(defaultCollapsed);

  useEffect(() => {
    if (collapsedOverride === undefined) setCollapsed(defaultCollapsed);
  }, [collapsedOverride, defaultCollapsed, turnId]);

  const effectiveCollapsed = collapsedOverride ?? collapsed;

  const toggle = useCallback(() => {
    const next = !effectiveCollapsed;
    if (onCollapsedChange) onCollapsedChange(next);
    else setCollapsed(next);
  }, [effectiveCollapsed, onCollapsedChange]);

  return [effectiveCollapsed, toggle];
}

export function getUnitTurnId(unit: ConversationRenderUnit): string | null {
  if (unit.kind === "message" || unit.kind === "event" || unit.kind === "threadItem") {
    return readTurnId(unit.item);
  }
  if (unit.kind === "toolActivity") {
    for (const item of unit.items) {
      const id = readTurnId(item);
      if (id) return id;
    }
  }
  return null;
}

function readTurnId(item: AccumulatedThreadItem | undefined): string | null {
  if (!item) return null;
  const raw = (item as Record<string, unknown>)._turnId;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export function isUserMessageUnit(unit: ConversationRenderUnit): boolean {
  return unit.kind === "message" && unit.role === "user";
}

export function isPersistentSteeringUserUnit(unit: ConversationRenderUnit): boolean {
  if (unit.kind !== "message" || unit.role !== "user") return false;
  return (unit.item as Record<string, unknown>).steeringStatus != null;
}

export function isFinalAssistantUnit(unit: ConversationRenderUnit): boolean {
  return unit.kind === "message" && unit.role === "assistant";
}

export function isWorkedForUnit(unit: ConversationRenderUnit): boolean {
  return unit.kind === "toolActivity" && unit.summary.groupType === "worked-for";
}

export interface TurnGroup {
  turnId: string | null;
  units: ConversationRenderUnit[];
}

export function groupUnitsByTurn(units: ConversationRenderUnit[]): TurnGroup[] {
  const groups: TurnGroup[] = [];
  let current: TurnGroup | null = null;
  for (const unit of units) {
    const turnId = getUnitTurnId(unit);
    if (!turnId) {
      if (current) {
        groups.push(current);
        current = null;
      }
      groups.push({ turnId: null, units: [unit] });
      continue;
    }
    if (!current || current.turnId !== turnId) {
      if (current) groups.push(current);
      current = { turnId, units: [unit] };
    } else {
      current.units.push(unit);
    }
  }
  if (current) groups.push(current);
  return groups;
}

export interface TurnUnitSplit {
  leadingUnits: ConversationRenderUnit[];
  expandedAgentUnits: ConversationRenderUnit[];
  collapsibleAgentUnits: ConversationRenderUnit[];
  persistentAgentUnits: ConversationRenderUnit[];
  workedForUnit: ConversationRenderUnit | null;
  trailingUnits: ConversationRenderUnit[];
  hasFinalAssistantStarted: boolean;
  preventAutoCollapse: boolean;
}

export function splitTurnUnits(units: ConversationRenderUnit[]): TurnUnitSplit {
  const finalAssistantIndex = lastIndexOf(units, isFinalAssistantUnit);
  const agentEnd = finalAssistantIndex >= 0 ? finalAssistantIndex : units.length;
  const leadingUnits: ConversationRenderUnit[] = [];
  const agentUnits: ConversationRenderUnit[] = [];
  const trailingUnits = finalAssistantIndex >= 0 ? units.slice(finalAssistantIndex) : [];
  let hasSeenAgentUnit = false;

  units.slice(0, agentEnd).forEach((unit) => {
    if (!hasSeenAgentUnit && isUserMessageUnit(unit) && !isPersistentSteeringUserUnit(unit)) {
      leadingUnits.push(unit);
      return;
    }
    hasSeenAgentUnit = true;
    agentUnits.push(unit);
  });

  const expandedAgentUnits: ConversationRenderUnit[] = [];
  const collapsibleAgentUnits: ConversationRenderUnit[] = [];
  const persistentAgentUnits: ConversationRenderUnit[] = [];
  let workedForUnit: ConversationRenderUnit | null = null;

  for (const unit of agentUnits) {
    if (isWorkedForUnit(unit)) {
      workedForUnit = unit;
      continue;
    }
    expandedAgentUnits.push(unit);
    if (isPersistentSteeringUserUnit(unit)) {
      persistentAgentUnits.push(unit);
    } else {
      collapsibleAgentUnits.push(unit);
    }
  }

  return {
    leadingUnits,
    expandedAgentUnits,
    collapsibleAgentUnits,
    persistentAgentUnits,
    workedForUnit,
    trailingUnits,
    hasFinalAssistantStarted: finalAssistantIndex >= 0,
    preventAutoCollapse: shouldPreventTurnAutoCollapse(agentUnits),
  };
}

export function shouldPreventTurnAutoCollapse(units: ConversationRenderUnit[]): boolean {
  return units.some((unit) => {
    if (unit.kind === "toolActivity") {
      if (
        unit.summary.groupType === "pending-mcp-tool-calls"
        || unit.summary.groupType === "multi-agent-group"
        || unit.summary.inProgress
      ) {
        return true;
      }
      return unit.items.some(itemPreventsAutoCollapse);
    }
    return itemPreventsAutoCollapse(unit.item);
  });
}

export function shouldAllowTurnCollapse(input: {
  hasFinalAssistantStarted: boolean;
  isTurnCancelled: boolean;
  hasRenderableAgentItems: boolean;
}): boolean {
  return input.hasFinalAssistantStarted && !input.isTurnCancelled && input.hasRenderableAgentItems;
}

export interface TurnFrameProps {
  collapsedOverride?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  turnId: string;
  units: ConversationRenderUnit[];
  renderUnit: (unit: ConversationRenderUnit, key: string) => ReactNode;
}

export function TurnCollapseFrame({
  collapsedOverride,
  onCollapsedChange,
  turnId,
  units,
  renderUnit,
}: TurnFrameProps) {
  const split = splitTurnUnits(units);
  const hasToggleContent = split.collapsibleAgentUnits.length > 0 && !singleContextCompactionUnit(split.collapsibleAgentUnits);
  const canCollapse = shouldAllowTurnCollapse({
    hasFinalAssistantStarted: split.hasFinalAssistantStarted,
    isTurnCancelled: isTurnCancelled(units),
    hasRenderableAgentItems: split.expandedAgentUnits.length > 0,
  });
  const showToggle = canCollapse && hasToggleContent;
  const [frameCollapsed, toggle] = useTurnCollapsed(
    turnId,
    !split.preventAutoCollapse,
    collapsedOverride,
    onCollapsedChange,
  );
  const collapsed = showToggle && frameCollapsed;
  const animatedAgentUnits = collapsed ? split.collapsibleAgentUnits : split.expandedAgentUnits;

  if (!showToggle) {
    return <>{units.map((unit) => renderUnit(unit, unit.key))}</>;
  }

  return (
    <>
      {split.leadingUnits.map((unit) => renderUnit(unit, unit.key))}
      <TurnCollapseToggle
        collapsed={collapsed}
        count={split.collapsibleAgentUnits.length}
        label={turnCollapseLabel(split)}
        onToggle={toggle}
      />
      {!collapsed && <div className="hc-turn-collapse-rule" aria-hidden />}
      {collapsed && split.persistentAgentUnits.map((unit) => renderUnit(unit, unit.key))}
      <AnimatedDisclosure
        className="hc-turn-collapse-motion"
        innerClassName="hc-turn-collapse-content"
        open={!collapsed}
      >
        {animatedAgentUnits.map((unit) => renderUnit(unit, unit.key))}
      </AnimatedDisclosure>
      {split.trailingUnits.map((unit) => renderUnit(unit, unit.key))}
    </>
  );
}

function TurnCollapseToggle({
  collapsed,
  count,
  label,
  onToggle,
}: {
  collapsed: boolean;
  count: number;
  label: string;
  onToggle: () => void;
}) {
  return (
    <div className="hc-turn-collapse-row">
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-label={labelForAria(label, count)}
        className="hc-turn-collapse-toggle inline-flex items-center gap-1 rounded-md border border-transparent px-1 py-px text-left text-[13px] leading-5 text-stone-500 transition-colors hover:bg-black/5 hover:text-slate-700 focus-visible:outline-none"
        data-collapsed={collapsed}
        onClick={onToggle}
      >
        <span>{label}</span>
        <ChevronRight
          size={14}
          className={`hc-turn-collapse-chevron text-stone-400 transition-transform duration-200 ${collapsed ? "" : "is-open rotate-90"}`}
        />
      </button>
    </div>
  );
}

function turnCollapseLabel(split: TurnUnitSplit): string {
  if (split.workedForUnit?.kind === "toolActivity" && split.workedForUnit.summary.label) {
    return split.workedForUnit.summary.label;
  }
  const count = split.collapsibleAgentUnits.length;
  return count === 1 ? "1 previous message" : `${count} previous messages`;
}

function labelForAria(label: string, count: number): string {
  const suffix = count === 1 ? "1 hidden item" : `${count} hidden items`;
  return `${label}, ${suffix}`;
}

function isTurnCancelled(units: ConversationRenderUnit[]): boolean {
  return units.some((unit) => {
    if (unit.kind === "toolActivity") {
      return unit.items.some(itemIsCancelled);
    }
    return itemIsCancelled(unit.item);
  });
}

function itemIsCancelled(item: AccumulatedThreadItem): boolean {
  const status = (item as Record<string, unknown>)._turnStatus;
  return status === "cancelled" || status === "canceled";
}

function itemPreventsAutoCollapse(item: AccumulatedThreadItem): boolean {
  const record = item as Record<string, unknown>;
  const type = String(record.type ?? "");
  const status = String(record.status ?? record.executionStatus ?? "");
  if (status === "inProgress" || status === "running" || status === "pending") return true;
  return (
    type === "mcp-tool-call"
    || type === "mcpToolCall"
    || type === "dynamic-tool-call"
    || type === "dynamicToolCall"
    || type === "mcp-server-elicitation"
    || type === "mcpServerElicitation"
    || type === "permission-request"
    || type === "permissionRequest"
    || type === "userInput"
  );
}

function singleContextCompactionUnit(units: ConversationRenderUnit[]): boolean {
  if (units.length !== 1) return false;
  const unit = units[0];
  return unit?.kind === "event" && (unit.item.type === "context-compaction" || unit.item.type === "contextCompaction");
}

function lastIndexOf<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index] as T)) return index;
  }
  return -1;
}
