/* codex: home page hero ICU keys home.hero.* (welcome-page-*.js) */
/*
 * Hero copy mirrors Codex Desktop's home page (welcome-page-*.js):
 *   - home.hero.whatShouldWeBuild              → "What should we build?"
 *   - home.hero.whatShouldWeWorkOnInProject    → "What should we work on in {project}?"
 *   - "Let's build" subtitle (Codex home slogan; locked by onboarding test)
 * Project-scoped key is selected when `workspace` resolves to a real project
 * folder rather than a generic placeholder (`~`, empty, root, etc.).
 */
import { useMemo } from "react";

interface OnboardingEmptyStateProps {
  onDismissPromo?: () => void;
  onStartChat?: () => void;
  onUseExistingFolder?: () => void;
  showPromo: boolean;
  workspace: string;
}

const GENERIC_WORKSPACE_VALUES = new Set<string>(["", "~", "/", "."]);

function projectBasename(workspace: string): string | null {
  if (workspace == null) return null;
  const trimmed = workspace.trim();
  if (trimmed.length === 0) return null;
  if (GENERIC_WORKSPACE_VALUES.has(trimmed)) return null;
  // Strip trailing path separators (POSIX or Windows) before extracting tail.
  const normalized = trimmed.replace(/[\\/]+$/, "");
  if (normalized.length === 0) return null;
  const lastSeparator = Math.max(
    normalized.lastIndexOf("/"),
    normalized.lastIndexOf("\\"),
  );
  const tail = lastSeparator >= 0 ? normalized.slice(lastSeparator + 1) : normalized;
  if (tail.length === 0) return null;
  if (GENERIC_WORKSPACE_VALUES.has(tail)) return null;
  return tail;
}

export function OnboardingEmptyState({
  onDismissPromo,
  onStartChat,
  onUseExistingFolder,
  showPromo,
  workspace,
}: OnboardingEmptyStateProps) {
  const project = useMemo(() => projectBasename(workspace), [workspace]);
  const headline = project
    ? `What should we work on in ${project}?`
    : "What should we build?";

  return (
    <div className="hc-onboarding-empty" data-onboarding-empty="true">
      <div className="hc-onboarding-empty-content">
        <div className="hc-onboarding-empty-copy">
          <h2 className="hc-onboarding-empty-headline">{headline}</h2>
          <p className="hc-onboarding-empty-subtitle">Let&apos;s build</p>
        </div>
        {showPromo ? (
          <OnboardingFirstThreadPromo
            onDismissPromo={onDismissPromo}
            onStartChat={onStartChat}
            onUseExistingFolder={onUseExistingFolder}
          />
        ) : null}
      </div>
    </div>
  );
}

interface OnboardingFirstThreadPromoProps {
  onDismissPromo?: () => void;
  onStartChat?: () => void;
  onUseExistingFolder?: () => void;
}

function OnboardingFirstThreadPromo({
  onDismissPromo,
  onStartChat,
  onUseExistingFolder,
}: OnboardingFirstThreadPromoProps) {
  return (
    <div
      className="hc-onboarding-empty-promo"
      data-onboarding-promo="first-new-thread"
      role="region"
      aria-label="Welcome to HiCodex"
    >
      <button
        type="button"
        className="hc-onboarding-empty-promo-dismiss"
        aria-label="Dismiss welcome"
        onClick={() => onDismissPromo?.()}
      >
        <span aria-hidden="true">×</span>
      </button>
      <div className="hc-onboarding-empty-promo-body">
        <h3 className="hc-onboarding-empty-promo-title">Welcome to HiCodex</h3>
        <p className="hc-onboarding-empty-promo-text">
          Connect external agents, configure MCP servers, or begin a new
          conversation to get started.
        </p>
      </div>
      <div className="hc-onboarding-empty-promo-actions">
        <button
          type="button"
          className="hc-onboarding-empty-promo-action hc-onboarding-empty-promo-action-primary"
          onClick={() => onStartChat?.()}
        >
          Begin new conversation
        </button>
        <button
          type="button"
          className="hc-onboarding-empty-promo-action hc-onboarding-empty-promo-action-secondary"
          onClick={() => onUseExistingFolder?.()}
        >
          Open existing folder
        </button>
      </div>
    </div>
  );
}
