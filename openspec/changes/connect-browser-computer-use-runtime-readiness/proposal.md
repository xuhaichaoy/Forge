## Why

Browser and Computer Use are now discoverable through the bundled plugin marketplace, but plugin installation is not the same as runtime readiness. Browser still needs a real host/browser state source and opener before right-rail or side-panel UI can be honest. Computer Use still needs native helper, MCP, and macOS permission readiness before settings can claim local GUI control is available.

## What Changes

- Add a Browser runtime readiness layer that can show Browser right-rail/side-panel state only when a real host or app-server source reports an active Browser surface.
- Add Browser opener plumbing that routes through an explicit host/browser bridge instead of synthesizing Browser rows from transcript or plugin state.
- Add an explicit Browser extension-backend feasibility spike for Desktop parity: verify whether the Browser client accepts a HiCodex-provided or Chrome-extension-provided backend with `type: "extension"` before treating the Browser work as parity-complete.
- Add a limited Browser `iab` nativePipe bridge for discovery, tab inventory, basic navigation, page JS evaluation, layout metrics, visible-window screenshot capture, JavaScript-dispatched event input, point scrolling, and lightweight DOM lookup/geometry reads.
- Add Computer Use readiness projection that combines plugin install state with native helper/MCP/permission status when available.
- Add Computer Use setup actions for opening the bundled helper or relevant native setup locations when available.
- Keep plugin lifecycle status visible, but continue to distinguish it from Browser runtime readiness and Computer Use OS control readiness.

## Non-Goals

- Do not synthesize Browser rows from MCP text, web-search activity, transcript items, or plugin installation alone.
- Do not treat the local `iab` probe as full Desktop Browser parity; full parity depends on a validated `extension` backend path or an explicit product decision to replace it.
- Do not implement full Browser origin allowlist, full-page/high-fidelity screenshot capture, full DOM snapshot fidelity, native input, full history/file-transfer policy, user-tab ownership, or clear-browser-data settings unless the required extension/host bridge is present.
- Do not claim Computer Use can move/click/type unless the native helper/MCP readiness path proves it.
- Do not bypass macOS Screen Recording, Accessibility, or app approval requirements.

## Capabilities

### New Capabilities
- `browser-runtime`: Runtime-backed Browser rail/side-panel readiness.
- `computer-use-readiness`: Native/MCP-backed Computer Use setup and readiness state.

### Modified Capabilities
- `plugin-backed-settings`: Plugin lifecycle remains the setup baseline, but readiness adds a separate native/runtime dimension.

## Impact

- Affected UI state: `packages/ui/src/state/right-rail.ts`, `packages/ui/src/state/settings-panel-loader.ts`, `packages/ui/src/state/settings-panel-workflow.ts`, and new focused state modules as needed.
- Affected UI components: `packages/ui/src/components/right-rail.tsx`, `packages/ui/src/components/model-settings-panel.tsx`, side-panel tab components, and `packages/ui/src/HiCodexApp.tsx` wiring.
- Affected host/runtime: `crates/host/src/lib.rs`, `apps/desktop/src-tauri/src/main.rs`, and `packages/ui/src/lib/tauri-host.ts` if native helper/browser readiness is host-owned.
- Affected tests: UI projection/settings tests and host unit tests for readiness path discovery.
