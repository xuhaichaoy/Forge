## ADDED Requirements

### Requirement: Browser rail uses runtime-backed state
Forge SHALL render the Browser right-rail section only from a real Browser runtime state source.

#### Scenario: Browser runtime has active page
- **WHEN** Browser runtime state reports an active tab with a non-empty URL that is not `about:blank`
- **THEN** the right rail shows a Browser row with the runtime title and display URL.

#### Scenario: Browser plugin is installed but no runtime exists
- **WHEN** Browser plugin lifecycle data reports installed or enabled
- **AND** no Browser runtime state source exists
- **THEN** the right rail does not show a Browser row.

#### Scenario: Browser runtime is blank
- **WHEN** Browser runtime state has no URL or only `about:blank`
- **THEN** the right rail does not show a Browser row.

### Requirement: Browser opener targets the real Browser surface
Forge SHALL open Browser UI through an explicit Browser runtime opener when a Browser rail row is selected.

#### Scenario: Runtime opener is available
- **WHEN** the user selects the Browser rail row
- **AND** a Browser runtime opener is available
- **THEN** Forge opens or focuses the Browser side-panel/runtime surface for the reported tab.

#### Scenario: Runtime opener is unavailable
- **WHEN** Browser runtime state is missing or not openable
- **THEN** Forge does not expose a fake Browser open action.

### Requirement: Browser settings expose local runtime readiness
Forge SHALL expose local Browser runtime readiness in Browser settings without claiming bundled Browser agent control.

#### Scenario: Local Browser runtime bridge is available
- **WHEN** the Tauri host Browser runtime bridge is available
- **THEN** Browser settings expose an action to open or focus the local Browser runtime surface.

#### Scenario: Local runtime is not agent control
- **WHEN** Browser settings show the local Browser runtime readiness row
- **THEN** the row states that bundled Browser `iab` agent control is not connected yet.
- **AND** the row identifies the missing nativePipe-backed browser backend and browser sidebar control bridge.
- **AND** the primary readiness status does not mark Browser as agent-ready when only the local Browser window surface is available.

#### Scenario: Native iab probe backend is registered
- **WHEN** the Tauri host registers a nativePipe `iab` probe backend
- **THEN** Browser settings identify the registered backend and socket path.
- **AND** the readiness row states that basic navigation, page JS evaluation, lightweight accessibility snapshots, lightweight DOM lookup/geometry reads, coordinate hit testing, limited frame owner lookup, point scrolling, same-document navigation events, visible-window screenshots, JavaScript dialog no-op handling, and basic event input are available while full Playwright DOM snapshots with element refs/cursors, native input, full-page capture, resource export, and file-transfer control remain unavailable.
- **AND** the socket is registered under the Browser client scan directory `/tmp/codex-browser-use` on Unix platforms.

#### Scenario: Stale iab probe sockets are cleaned on startup
- **WHEN** Forge starts the nativePipe `iab` probe backend on Unix
- **THEN** it removes old `hicodex-*-iab.sock` files from the Browser client scan directory before binding the current process socket.
- **AND** it does not remove the current process socket, non-Forge sockets, or non-socket files.

### Requirement: Browser iab probe supports discovery, basic navigation, and limited page control
Forge SHALL expose a minimal Browser `iab` probe backend for discovery, tab inventory, basic navigation, page JS evaluation, layout metrics, lightweight accessibility snapshots, lightweight DOM lookup/geometry reads, coordinate hit testing, limited frame owner lookup, point scrolling, visible-window screenshot capture, JavaScript dialog no-op handling, and basic event input without claiming full Browser automation.

#### Scenario: Browser client requests backend info
- **WHEN** a Browser client sends `getInfo` to the nativePipe `iab` probe
- **THEN** the response identifies the backend type as `iab`.
- **AND** the response echoes the requested Codex session id in metadata.
- **AND** the response reports a `codexAppBuildFlavor` metadata value that matches the Browser client expectation, defaulting to `prod` when no explicit `BROWSER_USE_CODEX_APP_BUILD_FLAVOR` environment override is present.
- **AND** the response reports probe-only Browser and tab capabilities.

#### Scenario: Browser client requests tabs
- **WHEN** a Browser client sends `getTabs` to the nativePipe `iab` probe
- **THEN** the response lists open local Browser runtime tabs with stable positive numeric ids and active-tab state.

#### Scenario: Browser client navigates a tab
- **WHEN** a Browser client issues the CDP calls needed by `tab.goto` or `tab.reload`
- **THEN** the probe maps the call to the local Browser runtime surface.
- **AND** the probe emits page navigation CDP events before returning success.
- **AND** hash-only same-document navigations emit `Page.navigatedWithinDocument` instead of full load events.

#### Scenario: Browser client opens local development targets
- **WHEN** a Browser client opens `localhost`, `127.0.0.1`, `[::1]`, or `file://` targets
- **THEN** Forge preserves explicit `file://` URLs and defaults loopback targets without a scheme to `http://`.
- **AND** non-local targets without a scheme continue to default to `https://`.

#### Scenario: Browser client evaluates page state
- **WHEN** a Browser client issues `Runtime.evaluate`, `Page.createIsolatedWorld`, or `Page.getLayoutMetrics`
- **THEN** the probe evaluates against the live local Browser webview when available.
- **AND** the response uses CDP-style `result`, `executionContextId`, or layout metrics shapes.

#### Scenario: Browser client requests a lightweight page snapshot
- **WHEN** a Browser client issues the `playwright_dom_snapshot` path that evaluates an `ariaSnapshot` request
- **THEN** the probe returns a text accessibility snapshot derived from the live local Browser webview.
- **AND** the snapshot omits Playwright element refs/cursors and does not claim full DOM automation parity.

#### Scenario: Browser client captures the visible Browser window
- **WHEN** a Browser client issues `Page.captureScreenshot`
- **THEN** the probe returns a CDP-style `{ data }` response containing base64 screenshot bytes when the live Browser window and host screenshot permission are available.
- **AND** the capture is limited to the visible Browser webview window or requested visible clip.

#### Scenario: Browser client dispatches basic input
- **WHEN** a Browser client issues `moveMouse`, `Input.dispatchMouseEvent`, `Input.dispatchKeyEvent`, or `Input.insertText`
- **THEN** the probe maps the call to no-op pointer tracking or JavaScript-dispatched DOM events in the local Browser webview.

#### Scenario: Browser client requests lightweight DOM targeting
- **WHEN** a Browser client issues `DOM.getDocument`, `DOM.querySelector`, `DOM.describeNode`, `DOM.getNodeForLocation`, `DOM.getFrameOwner`, `DOM.getContentQuads`, `DOM.getBoxModel`, or `DOM.scrollIntoViewIfNeeded`
- **THEN** the probe returns CDP-shaped node or geometry data derived from the live local Browser webview.
- **AND** node ids are scoped to the current local Browser webview document.
- **AND** frame owner lookup is limited to iframe/frame elements visible in that local webview document and does not claim OOPIF or native target attachment.

#### Scenario: Browser client handles JavaScript dialogs
- **WHEN** a Browser client issues `Page.handleJavaScriptDialog`
- **THEN** the probe returns success as a no-op compatibility response.
- **AND** settings continue to explain that native dialog control is not full Browser automation.

#### Scenario: Browser client requests point scrolling
- **WHEN** a Browser client issues `Input.synthesizeScrollGesture`
- **THEN** the probe maps the gesture to JavaScript scrolling at the requested viewport point.

#### Scenario: Browser client requests unsupported automation
- **WHEN** a Browser client requests full Playwright DOM snapshots with element refs/cursors, native input, full-page capture, user-tab claiming, resource export, Fetch interception, or file-transfer behavior
- **THEN** the probe returns an explicit JSON-RPC unsupported-capability error instead of hanging, except for the explicitly supported limited CDP subset.

### Requirement: Browser parity depends on extension backend feasibility
Forge SHALL treat Browser `extension` backend feasibility as the critical path for full Codex Desktop Browser parity.

#### Scenario: Extension backend spike is not complete
- **WHEN** the local Browser `iab` probe supports navigation, screenshots, DOM reads, or page evaluation
- **AND** no `type: "extension"` backend has been validated under Forge
- **THEN** Forge does not claim full Browser parity.
- **AND** OpenSpec tasks keep the extension-backend feasibility spike open.

#### Scenario: Browser client discovers an extension backend
- **WHEN** the bundled Browser client scans the native pipe directory and receives backend info with `type: "extension"`
- **THEN** Forge records whether the backend came from a real Chrome extension or a clean host-compatible extension backend.
- **AND** the spike validates required metadata, session behavior, capabilities, tab ownership, and command routing before marking Browser parity complete.
