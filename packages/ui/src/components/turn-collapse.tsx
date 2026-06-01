import { useCallback, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import type { AccumulatedThreadItem, ConversationRenderUnit } from "../state/render-groups";
import { mcpAppResourceUri } from "../state/render-groups";
import { AnimatedDisclosure } from "./animated-disclosure";
import { WorkedForDivider } from "./worked-for-divider";

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
   * MCP-app tool-call" — there is NO in-progress / pending / hasPending check.
   *
   * A live (in-progress) turn does not get wrongly auto-collapsed by dropping
   * the old in-progress checks: `Ib`/`shouldAllowTurnCollapse` require
   * hasFinalAssistantStarted, so while the turn is running shouldAllowCollapse
   * is false and isCollapsed is forced false regardless of preventAutoCollapse.
   *
   * HiCodex does not thread the renderMcpApps/shouldAutoExpandMcpApps settings
   * into this pure helper (Codex defaults: renderMcpApps=true,
   * shouldAutoExpandMcpApps=false), so we faithfully reproduce the inner `dc`
   * predicate — MCP-app presence — using the same item-level detection that
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
    // Codex renders the worked-for thread item as a non-interactive divider via `Ah`
    // (codex-local-conversation-thread.pretty.js :7434 in the per-item render loop).
    // While `showToggle === false` (i.e. turn still in-progress, cancelled, or no
    // collapsible agent items), intercept the worked-for unit and replace it with the
    // live `WorkedForDivider` instead of letting it render as a regular tool-activity
    // button card. After the final assistant arrives `showToggle` flips true and the
    // worked-for label moves into the `Ph` collapse toggle (:8408) — no divider needed.
    return (
      <>
        {units.map((unit) =>
          split.workedForUnit && unit.key === split.workedForUnit.key && unit.kind === "toolActivity"
            ? <WorkedForDivider key={unit.key} unit={unit} />
            : renderUnit(unit, unit.key),
        )}
      </>
    );
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
      <div className="hc-turn-collapse-rule-wrap" aria-hidden>
        <div className="hc-turn-collapse-rule" />
      </div>
      {/*
        * Codex Desktop inserts an `F_` spacer (`:4269-4271`, plain `<div aria-hidden
        * className="w-full" style={{ height: NT }}/>`) at `:8410` between the divider
        * rule and the agent body whenever the collapse toggle is shown
        * (`c2 ? <F_ size={NT}/> : null` with key `agent-body-toggle-gap`). `NT` resolves
        * to `var(--conversation-tool-assistant-gap, 8px)` (`:8238`). Without it the rule
        * sits flush against the next sibling.
        */}
      <div
        aria-hidden
        className="hc-turn-collapse-gap"
        data-key="agent-body-toggle-gap"
      />
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
  /*
   * Codex `Ph` button (codex-local-conversation-thread.pretty.js :3375):
   *   className="text-size-chat hover:bg-token-bg-subtle inline-flex items-center
   *              gap-1 rounded-md border border-transparent
   *              focus-visible:ring-2 focus-visible:ring-token-focus-border
   *              focus-visible:outline-none"
   * No px/py padding; relies on the inner span and icon's intrinsic size.
   *
   * Codex chevron (`Ha`) at :3371:
   *   className="icon-2xs text-token-foreground/40 transition-transform duration-200"
   * `icon-2xs` ≈ 10px; `text-token-foreground/40` is 40% of foreground.
   *
   * We don't have the token system in HiCodex, so map to equivalent literal
   * values: foreground/40 ≈ rgba(0, 0, 0, 0.4); bg-token-bg-subtle ≈ near-black
   * 6% (similar to original bg-black/5 within 1% delta).
   */
  return (
    <div className="hc-turn-collapse-row">
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-label={labelForAria(label, count)}
        className="hc-turn-collapse-toggle inline-flex items-center gap-1 rounded-md border border-transparent text-[13px] leading-5 text-stone-500 transition-colors hover:bg-stone-900/[0.06] hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500/30"
        data-collapsed={collapsed}
        onClick={onToggle}
      >
        <span>{label}</span>
        <ChevronRight
          size={14}
          className={`hc-turn-collapse-chevron text-stone-900/40 transition-transform duration-200 ${collapsed ? "rotate-0" : "is-open rotate-90"}`}
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
    if (unit.kind === "generatedImageGallery") {
      // Gallery aggregates generated-image items. A cancelled turn's images
      // still carry the cancelled turn-status stamp, so inspect each.
      return unit.images.some(itemIsCancelled);
    }
    if (unit.kind === "assistantEndResources") return false;
    if (unit.kind === "message" && unit.role === "assistant") {
      return (unit.assistantAfter ?? []).some((after) =>
        after.kind === "generatedImageGallery" && after.images.some(itemIsCancelled)
      );
    }
    if (unit.kind === "dynamicToolCallGroup") {
      return unit.items.some(itemIsCancelled);
    }
    return itemIsCancelled(unit.item);
  });
}

function itemIsCancelled(item: AccumulatedThreadItem): boolean {
  const status = (item as Record<string, unknown>)._turnStatus;
  return status === "cancelled" || status === "canceled";
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
