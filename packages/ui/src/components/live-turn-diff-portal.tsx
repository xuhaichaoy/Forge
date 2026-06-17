import type { TurnPlanSnapshot } from "../state/codex-ui-types";
import { normalizePlanStepStatus } from "../state/thread-item-fields";
import { DiffStatsDisplay } from "./diff-stats-display";
import { useForgeIntl } from "./i18n-provider";
import {
  formatTurnDiffFilesChanged,
  turnDiffViewModel,
} from "./turn-diff-view-model";

export interface LiveTurnFixedContentProps {
  activeTurnId: string | null;
  diff: string;
  hasBlockingRequest: boolean;
  isThreadRunning: boolean;
  onOpenDiff?: (filePath?: string) => void;
  plan: TurnPlanSnapshot | null;
  turnId: string | null;
  conversationDetailLevel?: "STEPS_COMMANDS" | "STEPS_PROSE";
}

export function shouldRenderLiveTurnFixedContent(props: LiveTurnFixedContentProps): boolean {
  return shouldRenderLiveTurnPlanPortal(props) || shouldRenderLiveTurnDiffPortal(props);
}

export function LiveTurnFixedContent(props: LiveTurnFixedContentProps) {
  const showPlan = shouldRenderLiveTurnPlanPortal(props);
  const showDiff = shouldRenderLiveTurnDiffPortal(props);
  if (!showPlan && !showDiff) return null;

  return (
    <div className="hc-live-turn-fixed-content">
      <div className="hc-live-turn-fixed-spacer" aria-hidden="true" />
      <div className="hc-live-turn-fixed-overlay" data-live-turn-fixed-content="true">
        <div className="hc-live-turn-fixed-gradient" aria-hidden="true" />
        <div className="hc-live-turn-fixed-row">
          {showPlan && (
            <LiveTurnPlanPortal
              activeTurnId={props.activeTurnId}
              plan={props.plan}
              isThreadRunning={props.isThreadRunning}
              hasBlockingRequest={props.hasBlockingRequest}
            />
          )}
          {showDiff && (
            <LiveTurnDiffPortal
              activeTurnId={props.activeTurnId}
              diff={props.diff}
              isThreadRunning={props.isThreadRunning}
              hasBlockingRequest={props.hasBlockingRequest}
              turnId={props.turnId}
              conversationDetailLevel={props.conversationDetailLevel}
              onOpenDiff={props.onOpenDiff}
              showLeadingSeparator={showPlan}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export interface LiveTurnDiffPortalProps {
  activeTurnId: string | null;
  diff: string;
  isThreadRunning: boolean;
  hasBlockingRequest: boolean;
  turnId: string | null;
  showLeadingSeparator?: boolean;
  conversationDetailLevel?: "STEPS_COMMANDS" | "STEPS_PROSE";
  onOpenDiff?: (filePath?: string) => void;
}

export function shouldRenderLiveTurnDiffPortal({
  activeTurnId,
  diff,
  isThreadRunning,
  hasBlockingRequest,
  turnId,
  conversationDetailLevel = "STEPS_COMMANDS",
}: Pick<LiveTurnDiffPortalProps, "activeTurnId" | "diff" | "isThreadRunning" | "hasBlockingRequest" | "turnId" | "conversationDetailLevel">): boolean {
  return Boolean(
    isThreadRunning
      && !hasBlockingRequest
      && activeTurnId
      && turnId === activeTurnId
      && conversationDetailLevel !== "STEPS_PROSE"
      && diff.trim().length > 0,
  );
}

export function LiveTurnDiffPortal({
  activeTurnId,
  diff,
  isThreadRunning,
  hasBlockingRequest,
  turnId,
  showLeadingSeparator = false,
  conversationDetailLevel = "STEPS_COMMANDS",
  onOpenDiff,
}: LiveTurnDiffPortalProps) {
  const { formatMessage } = useForgeIntl();
  if (!shouldRenderLiveTurnDiffPortal({
    activeTurnId,
    diff,
    isThreadRunning,
    hasBlockingRequest,
    turnId,
    conversationDetailLevel,
  })) {
    return null;
  }
  const model = turnDiffViewModel(diff);
  if (!model.hasChanges) return null;
  const label = formatTurnDiffFilesChanged(model.fileCount, formatMessage);

  return (
    <div className="hc-live-turn-diff-portal">
      {showLeadingSeparator && (
        <span className="hc-live-turn-separator" aria-hidden="true">
          {formatMessage({
            id: "codex.ui.bulletSeparator",
            defaultMessage: "·",
            description: "Middle dot separator used between inline items",
          })}
        </span>
      )}
      <button
        className="hc-live-turn-diff-chip"
        type="button"
        onClick={() => onOpenDiff?.()}
        aria-label={formatMessage({ id: "codex.unifiedDiff.reviewChangedFiles", defaultMessage: "Review changed files" })}
      >
        <span className="hc-live-turn-diff-label">{label}</span>
        <DiffStatsDisplay
          className="hc-live-turn-diff-stats"
          linesAdded={model.linesAdded}
          linesRemoved={model.linesRemoved}
        />
      </button>
    </div>
  );
}

export interface LiveTurnPlanPortalProps {
  activeTurnId: string | null;
  plan: TurnPlanSnapshot | null;
  isThreadRunning: boolean;
  hasBlockingRequest: boolean;
}

interface LiveTurnPlanEntry {
  step: string;
  status: string;
}

export function shouldRenderLiveTurnPlanPortal({
  activeTurnId,
  plan,
  isThreadRunning,
  hasBlockingRequest,
}: LiveTurnPlanPortalProps): boolean {
  return Boolean(
    isThreadRunning
      && !hasBlockingRequest
      && activeTurnId
      && plan?.turnId === activeTurnId
      && liveTurnPlanEntries(plan).length > 0,
  );
}

export function LiveTurnPlanPortal({
  activeTurnId,
  plan,
  isThreadRunning,
  hasBlockingRequest,
}: LiveTurnPlanPortalProps) {
  const { formatMessage } = useForgeIntl();
  const entries = liveTurnPlanEntries(plan);
  if (!shouldRenderLiveTurnPlanPortal({ activeTurnId, plan, isThreadRunning, hasBlockingRequest })) {
    return null;
  }

  const activeIndex = liveTurnPlanActiveIndex(entries);
  const completed = entries.filter((entry) => normalizePlanStepStatus(entry.status) === "completed").length;
  const percent = Math.max(0, Math.min(100, (completed / entries.length) * 100));
  const label = formatMessage({
    id: "codex.todoPlan.pillProgress",
    defaultMessage: "Step {stepNumber} / {stepCount}",
    description: "Compact step count shown in the in-progress plan pill above the composer",
  }, {
    stepNumber: activeIndex + 1,
    stepCount: entries.length,
  });
  const stepPreview = entries.map((entry, index) => `${index + 1}. ${entry.step}`).join("\n");

  return (
    <div className="hc-live-turn-plan-portal">
      <div className="hc-live-turn-plan-pill" aria-label={label} title={stepPreview}>
        <span
          className="hc-live-turn-plan-donut"
          aria-hidden="true"
          style={{
            background: `conic-gradient(#4f7cff ${percent}%, rgba(79, 124, 255, 0.2) 0)`,
          }}
        />
        <span className="hc-live-turn-plan-label">{label}</span>
      </div>
    </div>
  );
}

function liveTurnPlanEntries(plan: TurnPlanSnapshot | null): LiveTurnPlanEntry[] {
  if (!plan || !Array.isArray(plan.plan)) return [];
  return plan.plan.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const step = typeof record.step === "string" ? record.step.trim() : "";
    if (!step) return [];
    const status = typeof record.status === "string" ? record.status : "";
    return [{ step, status }];
  });
}

function liveTurnPlanActiveIndex(entries: LiveTurnPlanEntry[]): number {
  const inProgress = entries.findIndex((entry) => normalizePlanStepStatus(entry.status) === "inProgress");
  if (inProgress >= 0) return inProgress;
  const nextOpen = entries.findIndex((entry) => normalizePlanStepStatus(entry.status) !== "completed");
  if (nextOpen >= 0) return nextOpen;
  return Math.max(0, entries.length - 1);
}
