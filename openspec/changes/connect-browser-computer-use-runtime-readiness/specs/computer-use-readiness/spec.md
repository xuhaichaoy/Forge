## ADDED Requirements

### Requirement: Computer Use settings separate plugin state from readiness
Computer Use settings SHALL show native/MCP readiness separately from plugin install and enablement state.

#### Scenario: Plugin installed but native readiness unknown
- **WHEN** Computer Use plugin is installed or enabled
- **AND** no native readiness bridge has reported OS permission or helper state
- **THEN** Computer Use settings show plugin lifecycle as available but native readiness as unknown or setup-required.

#### Scenario: Helper is discoverable
- **WHEN** HiCodex can locate the bundled Computer Use helper app or MCP client
- **THEN** Computer Use settings show the helper as available and expose setup/open actions.

#### Scenario: MCP command is discoverable
- **WHEN** HiCodex can read the bundled Computer Use `.mcp.json`
- **THEN** Computer Use settings show the configured MCP command, configured cwd, resolved command path, and executable status.
- **AND** settings show whether the `.mcp.json` is trusted for the bundled Computer Use command, cwd, and args.

#### Scenario: MCP config is not trusted
- **WHEN** the bundled Computer Use `.mcp.json` command does not resolve to the bundled `SkyComputerUseClient`
- **OR** the configured cwd does not resolve to the Computer Use plugin root
- **OR** the configured args are not exactly `["mcp"]`
- **THEN** Computer Use settings mark the MCP config as untrusted.
- **AND** HiCodex does not mark native readiness as helper-available solely because the helper and command file exist.

#### Scenario: Native readiness diagnostics are not hidden by row truncation
- **WHEN** Computer Use native readiness is projected into settings
- **THEN** HiCodex shows separate helper/signature, MCP command, and permissions/app-approval checklist rows.
- **AND** each checklist row exposes its critical readiness details without depending on the native readiness row's full detail list.

#### Scenario: Native permission status is probed on macOS
- **WHEN** HiCodex reads Computer Use native readiness on macOS
- **THEN** the host reports Screen Recording and Accessibility as `granted` or `not granted` from native permission preflight APIs.
- **AND** settings explain that the preflight applies to the current HiCodex host process, not proof that every Computer Use helper/app approval is ready.
- **AND** settings explain that missing permissions or app approvals can make `list_apps` and GUI-control tool calls time out.
- **AND** app approval status remains `unknown` until a product-owned helper/app-approval bridge can prove it.

#### Scenario: Safe MCP probe is available
- **WHEN** app-server reports a Computer Use MCP server with a `list_apps` tool
- **AND** a HiCodex thread is active
- **AND** native readiness has not proven helper or MCP command setup is invalid
- **THEN** Computer Use settings expose a probe action that calls `mcpServer/tool/call` for `list_apps` on that active thread.

#### Scenario: Safe MCP probe is blocked by invalid native readiness
- **WHEN** app-server reports a Computer Use MCP server with a `list_apps` tool
- **AND** native readiness proves the helper signature, MCP client signature, helper availability, MCP config trust, or MCP command executable state is invalid
- **THEN** Computer Use settings do not expose the `Probe MCP` action.
- **AND** Computer Use MCP readiness explains which native readiness check blocks the probe.

#### Scenario: Safe MCP probe is blocked by missing native permission
- **WHEN** app-server reports a Computer Use MCP server with a `list_apps` tool
- **AND** native readiness proves Screen Recording or Accessibility is not granted
- **THEN** Computer Use settings do not expose the `Probe MCP` action.
- **AND** Computer Use MCP readiness explains that the missing native permission blocks probing before `list_apps` can time out.

#### Scenario: MCP startup and probe diagnostics stay visible
- **WHEN** app-server reports a Computer Use MCP server with one or more tools
- **THEN** Computer Use MCP readiness shows startup status, startup error when present, probe availability, tool timeout, and timeout risk before listing the tool inventory.
- **AND** those diagnostics remain visible even when the settings row truncates long detail lists.

#### Scenario: Bundle candidates and repair sources are visible
- **WHEN** HiCodex reads Computer Use native readiness
- **THEN** the host reports every local Computer Use bundle candidate it can inspect from the installed cache and bundled marketplace.
- **AND** Computer Use settings show each candidate's source, plugin root, helper signature, MCP client signature, installer signature, MCP executable state, and repair usability.
- **AND** settings show whether a signed-valid local repair source is available before exposing follow-up repair or probe guidance.
- **AND** a repair-usable source requires signed-valid helper, signed-valid MCP client, signed-valid installer, a trusted MCP config, and an executable MCP command.

#### Scenario: Invalid bundle has no signed repair source
- **WHEN** the active Computer Use helper or MCP client signature is invalid
- **AND** no local candidate has a signed-valid helper, signed-valid MCP client, trusted MCP config, and executable MCP command
- **THEN** Computer Use settings explain that no signed-valid local repair source is available.
- **AND** settings direct the user to install or update Codex.app with a signed-valid Computer Use bundle before probing Computer Use MCP again.

#### Scenario: Invalid bundle has a signed repair source
- **WHEN** the active Computer Use helper or MCP client signature is invalid
- **AND** a local candidate has a signed-valid helper, signed-valid MCP client, trusted MCP config, and executable MCP command
- **THEN** Computer Use settings expose a repair action for the local Computer Use bundle.
- **AND** the repair action installs that signed-valid bundle into the HiCodex `codex-home` plugin cache before MCP probing.
- **AND** the repair action re-reads native readiness and shows the resulting installed-cache signature and MCP executable status.

#### Scenario: Safe MCP probe timeout is diagnosed
- **WHEN** the Computer Use MCP probe for `list_apps` times out
- **THEN** the probe result explains that `list_apps` can time out because the helper is not running, helper signatures fail, Screen Recording or Accessibility permission is missing, app approval is pending, MCP startup failed, or a native prompt is blocking the helper.
- **AND** the probe result directs the user to open the helper or installer, grant permissions and app approvals, restart MCP or start a new thread, and probe again.

#### Scenario: Transcript MCP timeout is diagnosed
- **WHEN** a normal transcript MCP tool call for `computer-use/list_apps` times out
- **THEN** the tool error callout preserves the original timeout message.
- **AND** the callout appends Computer Use diagnostics covering helper signatures, Screen Recording, Accessibility, app approvals, MCP startup or restart state, and native prompts blocking the helper.

#### Scenario: Safe MCP probe cannot run without a thread
- **WHEN** app-server reports a Computer Use MCP server with a `list_apps` tool
- **AND** no HiCodex thread is active
- **THEN** Computer Use settings explain that the probe requires an active thread instead of exposing a non-functional action.

### Requirement: Computer Use setup actions use native bridges
Computer Use settings SHALL use native/host actions for setup instead of inventing protocol-only state.

#### Scenario: Open helper action
- **WHEN** the bundled Computer Use helper app is available
- **THEN** the settings page exposes an action that opens the helper through the host.

#### Scenario: Open permission setup action
- **WHEN** native setup is required
- **THEN** the settings page exposes actions to open relevant macOS permission setup locations when the host supports them.

#### Scenario: Repair source is revalidated before install
- **WHEN** the user runs the Computer Use repair action
- **THEN** the host revalidates the selected local repair source from the discovered candidate list.
- **AND** the host refuses repair if the source is missing, signature-invalid, signature-unknown, has no helper, has no MCP client, has no signed-valid installer, has an untrusted MCP config, or has a non-executable MCP command.
- **AND** the host refuses to write outside HiCodex's own Computer Use plugin cache.
- **AND** the host refuses to copy symlinks, non-file entries, or overlapping source/destination directories.

### Requirement: Computer Use control is not claimed without proof
HiCodex MUST NOT claim Computer Use can control Mac GUI unless helper, MCP, and required permission readiness are proven.

#### Scenario: Missing readiness proof
- **WHEN** plugin install state is available but helper/MCP/permission readiness is missing, failed, or unknown
- **THEN** the settings page does not mark Computer Use GUI control as ready.

#### Scenario: MCP command is not executable
- **WHEN** the configured Computer Use MCP command path exists but is not executable
- **THEN** the native readiness row remains setup-required instead of helper-available.

#### Scenario: MCP config is untrusted
- **WHEN** the configured Computer Use MCP command, cwd, or args do not match the bundled Computer Use MCP contract
- **THEN** the native readiness row remains setup-required or config-untrusted instead of helper-available.
- **AND** the MCP probe action is not exposed.

#### Scenario: Helper or MCP client signature is invalid
- **WHEN** the bundled Computer Use helper or MCP client exists but macOS code-signature verification fails
- **THEN** the native readiness row shows signature-invalid state and explains that Computer Use MCP tool calls may time out.
- **AND** the row instructs the user to reinstall or update Codex.app before relying on macOS permission grants.

#### Scenario: Helper signature is valid but permissions are not proven
- **WHEN** the bundled Computer Use helper and MCP client signatures verify
- **AND** native Screen Recording, Accessibility, or app approval status is not proven granted
- **THEN** the native readiness row directs the user to open the helper or installer, grant the native permissions, and probe Computer Use from an active thread.
