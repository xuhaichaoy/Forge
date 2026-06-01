/*
 * codex app-main home hero (fE) — a SINGLE centered heading, no subtitle:
 *   - home.hero.whatShouldWeWorkOnInProject → "What should we work on in {project}?"
 *   - home.hero.whatShouldWeWorkOn          → "What should we work on?"  (no project / non-git)
 * The project-scoped key is used when `workspace` resolves to a real folder.
 * NOTE: the "build" greeting variants (home.hero.whatShouldWeBuild*) and the
 * "Let's build" label belong to the SEPARATE hotkey-window new-thread page
 * (hotkey-window-new-thread-page-*.js), NOT the main home — so the main home hero
 * has no "Let's build" subtitle (letsBuild appears 0× in app-main).
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
  // codex app-main home hero (fE): no-project / non-git case uses
  // home.hero.whatShouldWeWorkOn ("What should we work on?"), NOT "build" — the
  // "build" + "Let's build" strings live on the separate hotkey-window new-thread
  // page, not the main home, so the main home hero is a single heading (no subtitle).
  return (
    <div className="hc-onboarding-empty" data-onboarding-empty="true">
      <div className="hc-onboarding-empty-content">
        <div className="hc-onboarding-empty-copy">
          <h2 className="hc-onboarding-empty-headline">
            {project ? (
              <>
                What should we work on in{" "}
                {/* codex pE: the project name is a clickable selector with a rounded hover
                    pill that opens the workspace-root picker. HiCodex wires it to the
                    change-folder action (open-folder is part of Codex's hero selector); a
                    full recent-roots dropdown would duplicate the composer footer picker. */}
                {onUseExistingFolder ? (
                  <button
                    type="button"
                    className="hc-onboarding-empty-project-trigger"
                    title="Change project folder"
                    onClick={() => onUseExistingFolder()}
                  >
                    {project}?
                  </button>
                ) : (
                  `${project}?`
                )}
              </>
            ) : (
              "What should we work on?"
            )}
          </h2>
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
        {/* codex first-run codex.legal.mistakes.* — AI fallibility / review-output disclaimer. */}
        <p className="hc-onboarding-empty-promo-disclaimer">
          Codex can make mistakes. Review the code it writes and commands it runs.
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
