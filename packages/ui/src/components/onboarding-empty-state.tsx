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
import { isProjectlessWorkspace } from "../state/thread-workflow";
import { useForgeIntl } from "./i18n-provider";

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
  // codex: a projectless workspace (empty / `~` / a generated ~/Documents/Codex cwd
  // synced in from an active projectless thread) has no project name — the hero shows
  // the generic "What should we work on?", never "…in 2-3?".
  if (isProjectlessWorkspace(trimmed)) return null;
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
  const { formatMessage } = useForgeIntl();
  // The project name's position differs by locale ("…work on in {project}?" vs
  // "我们应该在{project}中做些什么？"), so split the localized template on {project}
  // and render the clickable selector between the two halves.
  const headlineTemplate = project
    ? formatMessage({ id: "hc.home.hero.whatShouldWeWorkOnInProject", defaultMessage: "What should we work on in {project}?" })
    : formatMessage({ id: "hc.home.hero.whatShouldWeWorkOn", defaultMessage: "What should we work on?" });
  const [headlineBefore, headlineAfter = ""] = project ? headlineTemplate.split("{project}") : [headlineTemplate];
  const changeFolderLabel = formatMessage({ id: "hc.home.hero.changeProjectFolder", defaultMessage: "Change project folder" });
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
                {headlineBefore}
                {/* codex pE: the project name is a clickable selector that opens the
                    workspace-root picker. The trailing "?" / locale suffix lives in
                    headlineAfter so the project name moves position correctly across
                    locales (zh-CN renders 我们应该在 {project} 中做些什么？). */}
                {onUseExistingFolder ? (
                  <button
                    type="button"
                    className="hc-onboarding-empty-project-trigger"
                    title={changeFolderLabel}
                    onClick={() => onUseExistingFolder()}
                  >
                    {project}
                  </button>
                ) : (
                  project
                )}
                {headlineAfter}
              </>
            ) : (
              headlineBefore
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
  const { formatMessage } = useForgeIntl();
  // codex sidebarElectron.newThread (= "New chat") drives the primary new-thread
  // action; codex projectSetup.addProjectMenu.useExistingFolder (= "Use an
  // existing folder") drives the secondary open-folder action. Both reuse Codex's
  // existing i18n labels rather than inventing onboarding-card copy.
  const startChatLabel = formatMessage({ id: "hc.onboarding.promo.newChat", defaultMessage: "New chat" });
  const useExistingFolderLabel = formatMessage({ id: "projectSetup.addProjectMenu.useExistingFolder", defaultMessage: "Use an existing folder" });
  return (
    <div
      className="hc-onboarding-empty-promo"
      data-onboarding-promo="first-new-thread"
      role="region"
      aria-label="Welcome to Forge"
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
        <h3 className="hc-onboarding-empty-promo-title">Welcome to Forge</h3>
        {/* codex first-run codex.legal.mistakes.* — AI fallibility / review-output disclaimer.
            Keeps the "Codex" brand verbatim (bundle defaultMessage). */}
        <p className="hc-onboarding-empty-promo-disclaimer">
          {formatMessage({ id: "codex.legal.mistakes.title", defaultMessage: "Codex can make mistakes" })}
          {" "}
          {formatMessage({ id: "codex.legal.mistakes.review", defaultMessage: "Review the code it writes and commands it runs" })}
        </p>
      </div>
      <div className="hc-onboarding-empty-promo-actions">
        <button
          type="button"
          className="hc-onboarding-empty-promo-action hc-onboarding-empty-promo-action-primary"
          onClick={() => onStartChat?.()}
        >
          {startChatLabel}
        </button>
        <button
          type="button"
          className="hc-onboarding-empty-promo-action hc-onboarding-empty-promo-action-secondary"
          onClick={() => onUseExistingFolder?.()}
        >
          {useExistingFolderLabel}
        </button>
      </div>
    </div>
  );
}
