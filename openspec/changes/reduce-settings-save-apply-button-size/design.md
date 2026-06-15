## Context

The Models settings panel renders its footer inside `ModelSettingsForm` with a summary label on the left and a primary `Save and apply` button on the right. In the current screenshot, the primary action visually expands too far across the footer, which conflicts with Forge's dense desktop settings guidance.

The existing save behavior is owned by the `onSaveModel` callback passed from `SettingsPanel` into `ModelSettingsForm`; styling is shared through `.hc-settings-footer`, `.hc-button`, and `.hc-button-primary`.

## Goals / Non-Goals

**Goals:**
- Make the footer primary action compact and right-aligned.
- Preserve the current footer summary, click target, icon, label, and save callback.
- Keep comparable settings footer actions visually consistent.
- Avoid layout shifts at desktop and narrow modal widths.

**Non-Goals:**
- No changes to model config persistence, validation, app-server config writes, or sidecar restart behavior.
- No redesign of the whole Settings modal.
- No new design system dependency.

## Decisions

- Add a settings-footer-specific action treatment instead of changing every `.hc-button-primary`.
  - Rationale: global primary button rules may be used outside Settings, and this issue is specific to modal footer actions.
  - Alternative considered: shrink `.hc-button-primary` globally. Rejected because it can unintentionally change composer, dialog, or command actions.

- Keep the button content as icon plus text.
  - Rationale: the action is not a common standalone icon affordance; text is useful because applying model configuration has durable side effects.
  - Alternative considered: icon-only footer action. Rejected because it would reduce clarity for a destructive-adjacent configuration action.

- Prefer `width: auto`, a reasonable max width, and stable horizontal padding over fixed pixel width.
  - Rationale: labels can be localized, and the button should fit translated text without becoming a full-width control.
  - Alternative considered: hard-code a fixed width. Rejected because it is fragile for localization and future label changes.

## Risks / Trade-offs

- Compacting the button too much could make the label wrap or clip. -> Use no-wrap text, maintain minimum hit height, and verify on the Chinese label shown in the screenshot.
- Adjusting shared footer styles could affect the Images settings footer. -> Either use a targeted action class or verify all footers using `.hc-settings-footer`.
- Sticky/footer alignment may expose narrow-width issues. -> Verify the settings modal at desktop and narrow widths after implementation.
