## Context

The previous plugin-backed settings change made Browser and Computer Use installable and visible in HiCodex's isolated Codex home. Desktop evidence shows that Browser runtime state is a separate browser-sidebar snapshot source, and Computer Use relies on a bundled macOS helper with MCP and OS permissions.

## Design Principles

- Runtime state must come from an explicit source: app-server notification/request data, Tauri host bridge, or native helper status.
- UI must preserve the difference between installed, enabled, ready, and controlling.
- The Browser right rail is hidden when no real Browser runtime snapshot exists.
- Computer Use setup can expose helper/app/permission readiness without pretending the assistant has direct GUI control.
- Browser and Computer Use host bridges are additive and must not disturb existing plugin, MCP, or settings behavior.

## Browser Runtime

Browser runtime state is represented as a small summary model:

- `available`: host/app-server bridge exists.
- `active`: an actual browser tab/session is active.
- `title`, `displayUrl`, and `tabId`: projected from the browser snapshot when present.
- `error`: host/runtime error detail suitable for settings, not a transcript item.

`RightRailBrowserInput` is populated only when `available && active` and a non-empty non-`about:blank` URL/title exists. Clicking the rail row must call an opener that targets the real Browser surface.

If no host/browser bridge exists, Browser settings may show plugin installed/enabled plus "runtime unavailable"; the rail stays hidden.

## Browser Extension Backend Parity Spike

The Desktop Browser client discovers Browser backends by scanning the native pipe directory and calling `getInfo()` on each candidate. The returned backend `type` separates `extension`, `iab`, and `cdp`; `iab` candidates are additionally filtered by session metadata, while `extension` candidates are retained as browser backends and may carry Chrome extension metadata such as `extensionId` and `extensionInstanceId`.

For full Desktop parity, HiCodex must first prove one of these paths:

- A real Chrome Browser extension can connect to HiCodex and expose a Browser backend that the bundled Browser client reports as `type: "extension"`.
- Or HiCodex can host a clean extension-compatible backend with the same stable JSON-RPC contract, metadata, and capability behavior expected by the bundled Browser client.

This spike is the critical path for "same as Codex Desktop". The existing `iab` probe remains useful for the in-app Browser surface, smoke testing, and local dev workflows, but it is not the parity backend. Work on IAB must not delay or be confused with the extension-backend feasibility decision.

The spike should be read-only or probe-only until the contract is clear:

- Inspect Desktop/plugin evidence for `getInfo()` backend fields, native pipe location, backend selection, and capability gating.
- Start from the bundled Browser client's discovery flow and verify whether a controlled `type: "extension"` backend is discovered under HiCodex.
- If a real Chrome extension is required, verify installation/setup URL, extension id, local profile metadata, and whether it recognizes HiCodex's app identity/session.
- Record blockers separately from IAB feature gaps.

## Computer Use Readiness

Computer Use readiness is represented separately from plugin lifecycle:

- `pluginInstalled` / `pluginEnabled`: app-server plugin state.
- `helperAvailable`: bundled `Codex Computer Use.app` and MCP client are present in the installed plugin cache or marketplace source.
- `mcpConfigured` / `mcpStartupStatus`: app-server MCP data when available.
- `screenRecording`, `accessibility`, `appApprovals`: native status when a host bridge can read it.
- `setupActions`: open helper, open installer, open System Settings privacy panes, refresh status.

When a field is unknown because no bridge exists, the UI renders unknown/needs setup instead of successful.

## Risks

- Browser Desktop chunks contain implementation-specific names; only stable behavior and data boundaries are used.
- macOS permission introspection is limited; action links may be the only reliable first step.
- Existing dirty/staged worktree means this change must stay narrowly scoped.

## Verification

- OpenSpec validation.
- UI tests for hidden Browser rail without runtime, visible Browser rail with runtime summary, and Browser opener action.
- Settings tests for Computer Use plugin installed but readiness unknown, and helper available with setup actions.
- Host tests for path discovery that do not require actual macOS permissions.
