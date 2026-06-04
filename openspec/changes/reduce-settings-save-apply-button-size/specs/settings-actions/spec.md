## ADDED Requirements

### Requirement: Settings footer actions are compact
Settings footer primary actions SHALL render as compact action buttons that fit their icon and label instead of visually occupying most of the footer width.

#### Scenario: Models footer save action
- **WHEN** the user opens Settings -> Models
- **THEN** the `Save and apply` action is right-aligned, remains a button, and does not span the settings content width.

#### Scenario: Footer summary remains visible
- **WHEN** the Models footer includes both configured-model summary text and the save action
- **THEN** the summary remains readable and the save action remains visually separate from the summary.

#### Scenario: Localized label fits
- **WHEN** the save action label is rendered as Chinese text
- **THEN** the label fits on one line without clipping, overlapping, or forcing the button into a full-width layout.

### Requirement: Settings footer actions preserve behavior
Settings footer action sizing changes MUST NOT alter the callbacks, persistence behavior, or enabled interaction for existing Settings actions.

#### Scenario: Models save behavior is unchanged
- **WHEN** the user clicks the compact Models `Save and apply` action
- **THEN** the existing model save/apply callback is invoked exactly as before.

#### Scenario: Comparable footer actions remain usable
- **WHEN** the user opens another Settings panel that uses the same footer action pattern
- **THEN** its primary action remains accessible, readable, and aligned consistently with the Models footer.
