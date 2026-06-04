## Why

Browser and Computer Use currently appear in HiCodex Settings as Codex Desktop route placeholders. The project already exposes app-server plugin management surfaces, and the local Codex marketplace contains Browser and Computer Use plugins, so these settings pages should show real plugin status and setup actions instead of only source-evidence placeholders.

## What Changes

- Replace the static Browser and Computer Use Settings placeholders with plugin-backed setup/status panels.
- Reuse existing app-server plugin surfaces (`plugin/list`, `plugin/installed`, `plugin/install`, plugin config writes) instead of inventing local plugin state.
- Map the Browser settings route (`browser-use`) to the current Browser plugin identity (`browser`) while retaining `browser-use` as a Desktop route/source-evidence alias.
- Surface clear limitations: installing or enabling a plugin does not guarantee an active in-app browser backend or OS-level Computer Use permissions.
- Do not implement native screen control, in-app browser rendering, website allowlist writes, or Computer Use app approvals in this change.

## Capabilities

### New Capabilities
- `plugin-backed-settings`: Settings pages that expose plugin install/status actions for Desktop-backed capabilities.

### Modified Capabilities

## Impact

- Affected UI/settings state: `packages/ui/src/state/settings-panel-loader.ts`, `packages/ui/src/state/settings-panel-workflow.ts`.
- Affected UI rendering: `packages/ui/src/components/model-settings-panel.tsx` and shared management-panel rendering if needed.
- Affected tests: settings panel and command panel projection tests under `packages/ui/test`.
- No protocol schema, Codex core, native OS permission, or app-server implementation changes are intended.
