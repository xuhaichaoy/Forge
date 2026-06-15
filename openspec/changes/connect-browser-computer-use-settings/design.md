## Context

Forge Settings currently treats `browser-use` and `computer-use` as `DesktopBackedLocalSettingsPanel` placeholders. The placeholder is useful for parity evidence, but it does not expose the plugin lifecycle that already exists elsewhere in Forge.

The app-server plugin management path already exists:
- `loadPluginManagementEntries` reads marketplace, installed, shared, and app state through app-server.
- `projectPluginEntries` turns those protocol responses into `CommandPanelEntry` rows.
- `use-command-panel-actions` handles `installPlugin`, `uninstallPlugin`, and `writePluginConfig` actions.

The current bundled plugin identities differ from the Desktop route names:
- Settings route: `browser-use`; plugin manifest name: `browser`; aliases include `browser-use`.
- Settings route and plugin manifest name: `computer-use`.

## Goals / Non-Goals

**Goals:**
- Make Browser and Computer Use settings panels actionable by showing their plugin row and install/enable/disable actions.
- Keep the existing Desktop route evidence visible enough to explain what remains unimplemented.
- Use existing plugin app-server methods and command-panel actions.
- Preserve offline/error behavior when the app-server cannot return plugin lists.

**Non-Goals:**
- No implementation of Browser backend creation, tab rendering, or site allowlist persistence.
- No implementation of Computer Use macOS/Windows GUI control, app approvals, Screen Recording, Accessibility, or locked-use flows.
- No local mutation of Codex plugin files or global Codex config outside existing app-server plugin APIs.
- No new docs outside this OpenSpec change.

## Decisions

- Treat Browser and Computer Use as plugin-backed settings panels, not generic Desktop placeholders.
  - Rationale: the current app-server already owns plugin lifecycle state; Settings can expose that state without inventing a new source of truth.
  - Alternative considered: keep placeholders until full native bridge parity. Rejected because it hides currently available plugin setup actions.

- Match Browser settings to both `browser` and `browser-use` plugin identities.
  - Rationale: Codex Desktop route/source evidence uses `browser-use`, while the current bundled plugin manifest uses `browser`.
  - Alternative considered: hard-code only `browser-use`. Rejected because it would miss the installed bundled Browser plugin on the current machine.

- Reuse `CommandPanelEntry` and existing secondary action handlers.
  - Rationale: install/enable/disable behavior is already tested and routed through app-server protocol methods.
  - Alternative considered: build bespoke Settings buttons with direct JSON-RPC calls. Rejected because it would duplicate plugin lifecycle behavior.

## Risks / Trade-offs

- Plugin installed/enabled state may not mean a usable Browser backend exists. -> Show explicit details that backend/session availability is separate from plugin lifecycle.
- Computer Use install may require OS permission flows outside Forge. -> Show explicit setup limitation and keep native control out of scope.
- Browser identity may drift again. -> Keep matching alias-based and local to the Browser/Computer Use settings helper.
