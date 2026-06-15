import { CheckCircle2, ChevronRight, Circle, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { normalizePlanStepStatus } from "../state/thread-item-fields";
import { AnimatedDisclosure } from "./animated-disclosure";
import { useForgeIntl, type ForgeIntlContextValue } from "./i18n-provider";
import type { ThreadItemUnit } from "./thread-item-types";

export function TodoListThreadItemView({
  unit,
}: {
  unit: ThreadItemUnit;
}) {
  const { formatMessage } = useForgeIntl();
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
              completed" summary). Forge previously rendered an extra Circle/
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
  formatMessage: ForgeIntlContextValue["formatMessage"] = fallbackTodoListFormatMessage,
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
  descriptor: Parameters<ForgeIntlContextValue["formatMessage"]>[0],
  values: Parameters<ForgeIntlContextValue["formatMessage"]>[1] = {},
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
  // hoisted out of grouping). Forge keeps a subtle spinner as its in-progress
  // affordance, sized to the 10px step-icon row.
  const normalized = normalizePlanStepStatus(status);
  if (normalized === "completed") return <CheckCircle2 size={10} />;
  if (normalized === "inProgress") return <LoaderCircle className="hc-inline-plan-spinner" size={10} />;
  return <Circle size={10} />;
}
