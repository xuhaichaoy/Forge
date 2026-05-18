export function OnboardingEmptyState({
  workspace: _workspace,
}: {
  onDismissPromo: () => void;
  onStartChat: () => void;
  onUseExistingFolder: () => void;
  showPromo: boolean;
  workspace: string;
}) {
  return (
    <div className="hc-onboarding-empty" data-onboarding-empty="true">
      <div className="hc-onboarding-empty-content">
        <div className="hc-onboarding-empty-copy">
          <h2>Let's build</h2>
        </div>
      </div>
    </div>
  );
}
