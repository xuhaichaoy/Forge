## ADDED Requirements

### Requirement: Isolated Forge home registers bundled capability marketplace
Forge SHALL register the local OpenAI bundled marketplace in the isolated Codex home when that marketplace is present on disk.

#### Scenario: First-run config with bundled marketplace present
- **WHEN** Forge creates a new isolated `config.toml`
- **AND** `~/.codex/.tmp/bundled-marketplaces/openai-bundled` exists
- **THEN** the config contains `[marketplaces.openai-bundled]` pointing at that directory.

#### Scenario: Existing config missing bundled marketplace
- **WHEN** Forge refreshes an existing isolated `config.toml`
- **AND** the bundled marketplace directory exists
- **THEN** the config gains the missing marketplace table without removing existing settings.

#### Scenario: Bundled marketplace absent
- **WHEN** the bundled marketplace directory is absent
- **THEN** Forge leaves bundled marketplace config absent rather than writing a broken source path.

### Requirement: Browser plugin can be enabled from isolated config
Forge SHALL seed Browser plugin enablement in isolated configs when the bundled marketplace is present.

#### Scenario: First-run Browser plugin entry
- **WHEN** Forge creates a new isolated `config.toml`
- **AND** the bundled marketplace directory exists
- **THEN** the config contains `[plugins."browser@openai-bundled"]` with `enabled = true`.

#### Scenario: Existing config preserves plugin choices
- **WHEN** an existing config already has `[plugins."browser@openai-bundled"]`
- **THEN** Forge does not overwrite that table.

### Requirement: Computer Use is not auto-enabled
Forge MUST NOT auto-enable Computer Use during isolated home bootstrap.

#### Scenario: Bundled marketplace present
- **WHEN** Forge writes bundled marketplace bootstrap config
- **THEN** it does not write `[plugins."computer-use@openai-bundled"]`.
