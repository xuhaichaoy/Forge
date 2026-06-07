import { ListChecks, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useHiCodexIntl } from "./i18n-provider";
import {
  PLAN_KEYWORD_SUGGESTION_ID,
  shouldShowPlanKeywordSuggestion,
  type ComposerMode,
} from "../state/composer-workflow";

interface AboveComposerPlanSuggestionProps {
  composerText: string;
  conversationId?: string | null;
  hasPlanMode: boolean;
  mode: ComposerMode;
  onPlanSelected: () => void;
  showPlanKeywordSuggestion?: boolean;
}

export function AboveComposerPlanSuggestion({
  composerText,
  conversationId,
  hasPlanMode,
  mode,
  onPlanSelected,
  showPlanKeywordSuggestion = true,
}: AboveComposerPlanSuggestionProps) {
  const { formatMessage } = useHiCodexIntl();
  const suggestionScope = conversationId ?? "__new-thread__";
  const [dismissedByScope, setDismissedByScope] = useState<Record<string, string[]>>({});
  const dismissed = dismissedByScope[suggestionScope] ?? [];
  const isDismissed = dismissed.includes(PLAN_KEYWORD_SUGGESTION_ID);
  const shouldShow = shouldShowPlanKeywordSuggestion({
    composerText,
    hasPlanMode,
    isPlanMode: mode === "plan",
    isDismissed,
    showPlanKeywordSuggestion,
  });

  useEffect(() => {
    if (mode !== "plan" || !isDismissed) return;
    setDismissedByScope((current) => {
      const currentScope = current[suggestionScope] ?? [];
      const nextScope = currentScope.filter((id) => id !== PLAN_KEYWORD_SUGGESTION_ID);
      if (nextScope.length === currentScope.length) return current;
      return { ...current, [suggestionScope]: nextScope };
    });
  }, [isDismissed, mode, suggestionScope]);

  if (!shouldShow) return null;

  const dismiss = () => {
    setDismissedByScope((current) => {
      const currentScope = current[suggestionScope] ?? [];
      if (currentScope.includes(PLAN_KEYWORD_SUGGESTION_ID)) return current;
      return { ...current, [suggestionScope]: [...currentScope, PLAN_KEYWORD_SUGGESTION_ID] };
    });
  };

  return (
    <div className="hc-above-composer-suggestion-wrap">
      <div className="hc-above-composer-suggestion" data-codex-above-composer-suggestion={PLAN_KEYWORD_SUGGESTION_ID}>
        <div className="hc-above-composer-suggestion-main">
          <ListChecks className="hc-above-composer-suggestion-icon" size={15} aria-hidden="true" />
          <span className="hc-above-composer-suggestion-title">{formatMessage({ id: "composer.aboveSuggestion.plan.title", defaultMessage: "Create a plan" })}</span>
          <span className="hc-above-composer-suggestion-meta">
            <kbd>Shift + Tab</kbd>
          </span>
        </div>
        <div className="hc-above-composer-suggestion-actions">
          <button
            type="button"
            className="hc-above-composer-suggestion-action"
            onClick={() => {
              onPlanSelected();
              dismiss();
            }}
          >
            {formatMessage({ id: "composer.aboveSuggestion.plan.action", defaultMessage: "Use plan mode" })}
          </button>
          <button
            type="button"
            className="hc-above-composer-suggestion-dismiss"
            aria-label={formatMessage({ id: "composer.aboveSuggestion.dismiss", defaultMessage: "Dismiss suggestion" })}
            onClick={dismiss}
          >
            <X size={13} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
