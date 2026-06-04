## Why

HiCodex runs Codex app-server with an isolated `CODEX_HOME` by default. That home is bootstrapped with model/profile config, but it does not register the bundled OpenAI capability marketplace. As a result, Browser and Computer Use settings can only show protocol-limited fallback rows even when the local Codex installation has the bundled plugins available.

## What Changes

- Extend HiCodex host config bootstrap to register the local `openai-bundled` marketplace when the bundled marketplace directory exists.
- Add a default Browser plugin enablement entry for first-run configs so Browser plugin lifecycle can become usable immediately after app-server restart.
- Refresh existing isolated configs by adding missing bundled marketplace/plugin entries without overwriting user-authored settings.
- Keep Computer Use as installable only; do not auto-enable it because it needs explicit native permissions and app approvals.

## Out of Scope

- Implementing an in-app Browser tab/snapshot/open-tab host bridge.
- Implementing Computer Use OS control, Screen Recording/Accessibility checks, or app approval writes.
- Copying plugin packages into the repo or inventing plugin state when the bundled marketplace path does not exist.
