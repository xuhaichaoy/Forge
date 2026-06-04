## Design

The safest place to make Browser/Computer Use discoverable is the existing host-side bootstrap for the isolated Codex home:

- `AppServerHost::start` resolves the target `codex_home`.
- `ensure_default_hicodex_profile` creates or refreshes `config.toml`.
- app-server reads `CODEX_HOME/config.toml` after the host starts it.

The change appends TOML sections only when they are missing:

- `[marketplaces.openai-bundled]`
- `[plugins."browser@openai-bundled"]`

The marketplace source path is discovered from the user's local Codex CLI home:

`~/.codex/.tmp/bundled-marketplaces/openai-bundled`

That mirrors the path already used by Codex CLI on this machine. If the directory is absent, HiCodex leaves the isolated config unchanged and the settings page continues to show a safe fallback.

## Safety

- No plugin packages are copied into the repository.
- Existing config tables are not overwritten.
- Computer Use is not auto-enabled. It remains installable from the marketplace and still requires explicit native setup.
- The host remains the owner of isolated `CODEX_HOME`; UI keeps using app-server plugin APIs.
