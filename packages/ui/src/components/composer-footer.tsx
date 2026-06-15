import { ArrowUp, ListChecks, Loader2, Plus, Square, Target } from "lucide-react";
import { forwardRef } from "react";
import type { ComposerMode, ComposerSubmitState } from "../state/composer-workflow";
import { useForgeIntl } from "./i18n-provider";
import { Tooltip } from "./tooltip";

export interface ComposerFooterLeftProps {
  attachmentPickerOpen: boolean;
  mode: ComposerMode;
  goalMode: boolean;
  onPlanSelected?: () => void;
  onPursueGoal?: () => void;
  onShowAttachmentMenu: () => void;
}

export const ComposerFooterLeft = forwardRef<HTMLDivElement, ComposerFooterLeftProps>(function ComposerFooterLeft({
  attachmentPickerOpen,
  mode,
  goalMode,
  onPlanSelected,
  onPursueGoal,
  onShowAttachmentMenu,
}, ref) {
  const { formatMessage } = useForgeIntl();
  const addContextLabel = formatMessage({ id: "composer.addContextDropdown.ariaLabel", defaultMessage: "Add files and more" });
  return (
    <div className="hc-composer-footer-left" ref={ref}>
      <button
        className="hc-composer-plus"
        type="button"
        // codex composer.addContextDropdown.ariaLabel — "Add files and more"
        title={addContextLabel}
        aria-label={addContextLabel}
        aria-expanded={attachmentPickerOpen}
        onClick={onShowAttachmentMenu}
      >
        <Plus size={18} />
      </button>
      {mode === "plan" && (
        /*
         * codex composer-CwxGJF3C.js — the plan-mode indicator tooltip is a
         * styled Tooltip with three centred segments, not a one-line `title`:
         *   composer.planModeIndicator.tooltipText     = "Create a plan"
         *   composer.planModeIndicator.tooltipShortcut = "{shortcut}" (kbd)
         *   composer.planModeIndicator.tooltipToggle   = "to toggle"
         * rendered `flex flex-col items-center text-center` with the shortcut in
         * a keycap. Forge injects "Shift + Tab" as the shortcut (matching the
         * Codex bundle's literal value) and renders it inside <kbd>.
         */
        <Tooltip content={<PlanModeTooltipContent />}>
          <button
            type="button"
            className="hc-composer-mode-pill"
            aria-label={formatMessage({ id: "composer.planModeDropdown.ariaLabel", defaultMessage: "Plan mode" })}
            onClick={() => onPlanSelected?.()}
          >
            <ListChecks size={13} />
            <span className="composer-footer__label--sm">{formatMessage({ id: "composer.planModeIndicator", defaultMessage: "Plan" })}</span>
          </button>
        </Tooltip>
      )}
      {goalMode && (
        /*
         * codex composer-CwxGJF3C.js — goal-mode indicator pill: label
         * composer.goalModeIndicator = "Goal", tooltip composer.goalModeIndicator.tooltip
         * = "Clear goal". Clicking it toggles goal mode back off (onPursueGoal).
         */
        <button
          type="button"
          className="hc-composer-mode-pill"
          aria-label={formatMessage({ id: "composer.goalDropdown.ariaLabel", defaultMessage: "Goal" })}
          title={formatMessage({ id: "composer.goalModeIndicator.tooltip", defaultMessage: "Clear goal" })}
          onClick={() => onPursueGoal?.()}
        >
          <Target size={13} />
          <span className="composer-footer__label--sm">{formatMessage({ id: "composer.goalModeIndicator", defaultMessage: "Goal" })}</span>
        </button>
      )}
    </div>
  );
});

/*
 * codex composer-CwxGJF3C.js — `flex flex-col items-center text-center
 * leading-tight` container: tooltipText on the first line, then a line with the
 * shortcut keycap followed by tooltipToggle ("to toggle").
 */
function PlanModeTooltipContent() {
  const { formatMessage } = useForgeIntl();
  return (
    <span className="hc-plan-tooltip">
      <span>{formatMessage({ id: "composer.planModeIndicator.tooltipText", defaultMessage: "Create a plan" })}</span>
      <span className="hc-plan-tooltip-shortcut-row">
        <kbd className="hc-plan-tooltip-kbd">
          {formatMessage({ id: "composer.planModeIndicator.tooltipShortcut", defaultMessage: "{shortcut}" }, { shortcut: "Shift + Tab" })}
        </kbd>
        <span>{formatMessage({ id: "composer.planModeIndicator.tooltipToggle", defaultMessage: "to toggle" })}</span>
      </span>
    </span>
  );
}

export interface ComposerSubmitButtonProps {
  submitState: ComposerSubmitState;
  submitTitle: string;
}

export const ComposerSubmitButton = forwardRef<HTMLButtonElement, ComposerSubmitButtonProps>(function ComposerSubmitButton({
  submitState,
  submitTitle,
}, ref) {
  return (
    <button
      ref={ref}
      className="hc-send-button"
      type="submit"
      title={submitTitle}
      aria-label={submitTitle}
      disabled={submitState.disabled}
      data-mode={submitState.submitButtonMode}
    >
      {/* codex send/stop glyphs are uniform icon-sm (18px) */}
      {submitState.threadRuntimeStatus === "connecting"
        ? <Loader2 className="hc-spin" size={18} />
        : submitState.submitButtonMode === "stop" ? <Square size={18} /> : <ArrowUp size={18} />}
    </button>
  );
});
