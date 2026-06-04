## 1. Pre-implementation Checks

- [x] 1.1 Run GitNexus upstream impact analysis for `ModelSettingsForm` before editing `packages/ui/src/components/model-settings-panel.tsx`.
- [x] 1.2 Review all current `.hc-settings-footer` usages so the compact action treatment does not accidentally break other settings panels.

## 2. UI Implementation

- [x] 2.1 Add a settings-footer-specific action class or wrapper for primary footer actions instead of changing global `.hc-button-primary` behavior.
- [x] 2.2 Update the Models footer `Save and apply` action to use the compact footer action treatment while preserving the existing `onSave` callback.
- [x] 2.3 Apply or verify the same footer action treatment for comparable settings footer actions, including the Images footer action.

## 3. Verification

- [x] 3.1 Verify Settings -> Models visually at the screenshot-like desktop width: the button is compact, right-aligned, readable, and not full width.
- [x] 3.2 Verify a narrow Settings modal width: the footer summary and action do not overlap, clip, or force layout shifts.
- [x] 3.3 Run the smallest relevant checks for this UI-only change, at minimum `npm run typecheck`.
