import type { AccumulatedThreadItem, ConversationRenderUnit } from "./render-groups";
import { mcpAppResourceUri } from "./render-groups";

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
  if (unit.kind === "generatedImageGallery") {
    return unit.turnId;
  }
  if (unit.kind === "assistantEndResources") {
    return unit.turnId;
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
  return unit.kind === "message" && unit.role === "assistant" && unit.assistantPhase !== "commentary";
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
    if (isUserMessageUnit(unit) || isPersistentSteeringUserUnit(unit)) {
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
  /*
   * CODEX-REF split-items-into-render-groups-BuC48F2v.js `dc` (exported `C`):
   *   function C({entries,mcpServerStatuses}){
   *     return entries.some(e=>e.kind==="item"&&e.item.type==="mcp-tool-call"&&x({item:e.item,mcpServerStatuses}))
   *   }
   *   // x(...) === b(...) !== "not-mcp-app"; b(...) keys on the tool-call's
   *   // successful result resolving to an MCP-app resource URI.
   * Consumed in local-conversation-thread-Kn0WAsVa.js `Yb`:
   *   vt = renderMcpApps && shouldAutoExpandMcpApps;        // K && z
   *   bt = vt && dc({entries:ht,mcpServerStatuses:yt});     // preventAutoCollapse
   *   {isCollapsed} = Ib({..., preventAutoCollapse: bt});   // isCollapsed = persisted ?? !bt
   * So the default-EXPANDED state is keyed PURELY on "the turn contains an
   * MCP-app tool-call" - there is NO in-progress / pending / hasPending check.
   *
   * A live (in-progress) turn does not get wrongly auto-collapsed by dropping
   * the old in-progress checks: `Ib`/`shouldAllowTurnCollapse` require
   * hasFinalAssistantStarted, so while the turn is running shouldAllowCollapse
   * is false and isCollapsed is forced false regardless of preventAutoCollapse.
   *
   * HiCodex does not thread the renderMcpApps/shouldAutoExpandMcpApps settings
   * into this pure helper (Codex defaults: renderMcpApps=true,
   * shouldAutoExpandMcpApps=false), so we faithfully reproduce the inner `dc`
   * predicate - MCP-app presence - using the same item-level detection that
   * event-unit.tsx uses for default-expanded tool activity (`mcpAppResourceUri`).
   */
  return units.some(unitHasMcpApp);
}

function unitHasMcpApp(unit: ConversationRenderUnit): boolean {
  if (unit.kind === "toolActivity") {
    return unit.items.some(itemIsMcpApp);
  }
  if (unit.kind === "message" || unit.kind === "event" || unit.kind === "threadItem") {
    return itemIsMcpApp(unit.item);
  }
  // generatedImageGallery / assistantEndResources carry no mcp-tool-call items.
  return false;
}

function itemIsMcpApp(item: AccumulatedThreadItem): boolean {
  // Mirrors event-unit.tsx default-expand detection: a successful mcp-tool-call
  // that resolves to an MCP-app resource URI. `mcpAppResourceUri` already gates
  // on type === "mcp-tool-call" and returns "" otherwise.
  return Boolean(mcpAppResourceUri(item));
}

export function shouldAllowTurnCollapse(input: {
  hasFinalAssistantStarted: boolean;
  isTurnCancelled: boolean;
  hasRenderableAgentItems: boolean;
}): boolean {
  return input.hasFinalAssistantStarted && !input.isTurnCancelled && input.hasRenderableAgentItems;
}

function lastIndexOf<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index] as T)) return index;
  }
  return -1;
}
