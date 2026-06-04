## ADDED Requirements

### Requirement: Browser settings expose plugin lifecycle
The Browser settings page SHALL show the Browser plugin lifecycle state and setup actions when app-server plugin management data is available.

#### Scenario: Browser plugin is installed
- **WHEN** app-server plugin management reports the Browser plugin as installed
- **THEN** the Browser settings page shows the Browser plugin row with installed or enabled status.

#### Scenario: Browser plugin can be installed
- **WHEN** app-server plugin management reports the Browser plugin as installable
- **THEN** the Browser settings page exposes the existing install action for that plugin.

#### Scenario: Browser route aliases are supported
- **WHEN** plugin data identifies the Browser plugin as `browser` or `browser-use`
- **THEN** the Browser settings page treats it as the Browser capability plugin.

### Requirement: Computer Use settings expose plugin lifecycle
The Computer Use settings page SHALL show the Computer Use plugin lifecycle state and setup actions when app-server plugin management data is available.

#### Scenario: Computer Use plugin is installed
- **WHEN** app-server plugin management reports the Computer Use plugin as installed
- **THEN** the Computer Use settings page shows the Computer Use plugin row with installed or enabled status.

#### Scenario: Computer Use plugin can be installed
- **WHEN** app-server plugin management reports the Computer Use plugin as installable
- **THEN** the Computer Use settings page exposes the existing install action for that plugin.

### Requirement: Native capability limits are explicit
Browser and Computer Use settings SHALL distinguish plugin lifecycle state from native/backend readiness.

#### Scenario: Browser local runtime is separate from plugin lifecycle
- **WHEN** the Browser plugin is installed or enabled
- **THEN** the Browser settings page shows Browser plugin lifecycle separately from the local Tauri Browser runtime readiness row.

#### Scenario: Browser agent control is not guaranteed
- **WHEN** the local Tauri Browser runtime can open or focus a Browser window
- **THEN** the Browser settings page still explains that bundled Browser `iab` agent control is not proven by that local runtime.

#### Scenario: Computer Use OS permissions are not implemented
- **WHEN** the Computer Use plugin is installed or installable
- **THEN** the Computer Use settings page explains that OS permissions and app approvals remain native/product-owned setup requirements.

#### Scenario: Computer Use MCP command readiness is visible
- **WHEN** the bundled Computer Use `.mcp.json` can be read
- **THEN** the Computer Use settings page shows the configured MCP command, cwd, resolved command path, and executable status separately from plugin lifecycle.

#### Scenario: Computer Use MCP probe is readiness-only
- **WHEN** the Computer Use settings page exposes a safe MCP probe action
- **THEN** that action is shown under MCP readiness and does not alter or replace plugin install/enable actions.

### Requirement: Offline plugin data keeps a safe placeholder
Browser and Computer Use settings MUST NOT fake plugin state when app-server plugin management data is unavailable.

#### Scenario: app-server plugin list fails
- **WHEN** plugin management data cannot be loaded
- **THEN** the settings page shows an error or protocol-limited placeholder instead of marking Browser or Computer Use as available.
