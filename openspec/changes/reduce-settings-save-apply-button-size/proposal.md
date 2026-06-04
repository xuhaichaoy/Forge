## Why

The Settings -> Models footer action currently renders the `Save and apply` button too large for the dense desktop settings layout. The oversized action competes with the form content and makes the footer feel like a full-width primary panel instead of a compact confirmation control.

## What Changes

- Reduce the visual footprint of the Models footer primary action while preserving the existing save behavior.
- Keep the footer summary text and sticky/footer positioning behavior intact.
- Apply the same compact action rule to comparable settings footer actions when they share the same pattern, so Models and Images do not diverge unintentionally.
- Do not change model configuration persistence, validation, protocol writes, or sidecar restart behavior.

## Capabilities

### New Capabilities
- `settings-actions`: Settings-panel action controls, including footer button sizing, alignment, and interaction expectations.

### Modified Capabilities

## Impact

- Affected UI implementation: `packages/ui/src/components/model-settings-panel.tsx`.
- Affected styling: `packages/ui/src/styles/settings-command.css` and any shared button rules it relies on.
- No API, protocol, dependency, or runtime data model changes are intended.
