## 1. Evidence And Protocol

- [x] 1.1 Confirm current app-server/protocol Browser and Computer Use readiness interfaces.
- [x] 1.2 Confirm Desktop Browser snapshot/opener behavior from local ASAR evidence.
- [x] 1.3 Confirm bundled Computer Use helper/MCP paths and host-open constraints.

## 2. Browser Runtime

- [x] 2.0 Run the Browser extension-backend feasibility spike before calling Browser parity complete: the bundled Browser client discovers and selects the env-gated HiCodex `type: "extension"` host-compatible spike; this validates discovery/handshake only, while real Chrome extension parity remains incomplete.
- [x] 2.1 Add a Browser runtime summary state/projection module.
- [x] 2.2 Wire runtime-backed Browser summary into right-rail projection without synthetic fallback rows.
- [x] 2.3 Add Browser open/focus action plumbing through the available runtime bridge.
- [x] 2.4 Add tests for active, blank, and unavailable Browser runtime states.
- [x] 2.5 Add Browser settings runtime readiness row and Open/Focus Browser action without claiming bundled `iab` agent control.
- [x] 2.6 Register the Browser `iab` nativePipe under the Browser client scan path with stable tab ids.
- [x] 2.7 Add limited Browser `iab` CDP support for basic navigation, page JS evaluation, layout metrics, and basic event input while keeping unsupported surfaces explicit.
- [x] 2.8 Add macOS visible-window `Page.captureScreenshot` fallback while keeping full-page/native capture limits explicit.
- [x] 2.9 Add lightweight Browser `iab` DOM lookup/geometry and point-scroll CDP support for common Browser client paths.
- [x] 2.10 Add coordinate DOM hit testing, limited frame owner lookup, same-document navigation events, and JS dialog no-op compatibility while keeping unsupported Browser surfaces explicit.
- [x] 2.11 Clean stale HiCodex Browser `iab` probe sockets on startup so historical probe files do not slow or confuse backend discovery.
- [x] 2.12 Report Browser `iab` `codexAppBuildFlavor` metadata with a Desktop-compatible `prod` default so session-owned discovery can match Browser client policy.
- [x] 2.13 Add a lightweight accessibility snapshot path for Browser client's `playwright_dom_snapshot` without claiming full Playwright DOM refs/cursors.
- [x] 2.14 Preserve `file://` Browser targets and default loopback URLs without a scheme to `http://` instead of `https://`.
- [x] 2.15 Validate extension-backend core tab lifecycle routing with the bundled Browser client: discovery, create, goto, list, title/url lookup, and close, while keeping Chrome extension user-tab claiming/finalize parity as a remaining gap.

## 3. Computer Use Readiness

- [x] 3.1 Add host/native discovery for bundled Computer Use helper and MCP client paths.
- [x] 3.2 Add UI readiness projection for helper, MCP, and OS permission state.
- [x] 3.3 Add setup/open actions through Tauri host wrappers where available.
- [x] 3.4 Add tests for installed-but-unknown and helper-available readiness states.
- [x] 3.5 Parse bundled `.mcp.json` and show MCP command, cwd, resolved command path, and executable readiness.
- [x] 3.6 Split Computer Use native diagnostics into helper/signature, MCP command, and permissions/app-approval checklist rows.
- [x] 3.7 Probe macOS Screen Recording and Accessibility readiness through native preflight APIs while keeping app approval status explicit.
- [x] 3.8 Reorder MCP readiness details so startup, probe, and timeout-risk diagnostics stay visible before tool inventory.
- [x] 3.9 Surface Computer Use-specific diagnostics when the `list_apps` MCP probe times out.
- [x] 3.10 Report all local Computer Use bundle candidates and show signed-valid repair-source readiness before MCP probing.
- [x] 3.11 Add a guarded Computer Use repair action that installs only revalidated signed-valid local candidates into the HiCodex plugin cache.
- [x] 3.12 Trust-check Computer Use `.mcp.json` command, cwd, and args before marking candidates repair-usable or allowing MCP probing.
- [x] 3.13 Block the safe `list_apps` MCP probe when native permission preflight proves Screen Recording or Accessibility is not granted.

## 4. Verification

- [x] 4.1 Run `openspec validate connect-browser-computer-use-runtime-readiness --strict`.
- [x] 4.2 Run focused UI and host tests.
- [x] 4.3 Run typecheck for touched packages.
