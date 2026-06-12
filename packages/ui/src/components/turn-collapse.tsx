import { useCallback, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import type { AccumulatedThreadItem, ConversationRenderUnit } from "../state/render-groups";
import { formatMessage } from "../state/i18n";
import {
  shouldAllowTurnCollapse,
  splitTurnUnits,
  type TurnUnitSplit,
} from "../state/turn-collapse-projection";
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
  // CODEX-REF local-conversation-thread-CEeZyOcp.js :8901
  //   id:`localConversation.previousMessagesSummary`,
  //   defaultMessage:`{count, plural, one {# previous message} other {# previous messages}}`
  return formatMessage(
    {
      id: "localConversation.previousMessagesSummary",
      defaultMessage: "{count, plural, one {# previous message} other {# previous messages}}",
    },
    { count },
  );
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
