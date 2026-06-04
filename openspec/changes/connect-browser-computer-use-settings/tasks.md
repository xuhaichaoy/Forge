## 1. Pre-implementation Checks

- [x] 1.1 Run GitNexus impact analysis for settings/plugin symbols before editing them.
- [x] 1.2 Verify current Browser and Computer Use plugin identities from the local bundled marketplace.
- [x] 1.3 Review existing plugin management projection and action handlers for reuse.

## 2. Settings Data Flow

- [x] 2.1 Add a helper that maps `browser-use` and `computer-use` settings panels to plugin identity aliases.
- [x] 2.2 Load plugin management entries for Browser and Computer Use settings panels through existing app-server plugin APIs.
- [x] 2.3 Filter plugin management entries to the relevant capability plugin while preserving existing install/config actions.
- [x] 2.4 Keep a safe fallback entry when no matching plugin row is available.

## 3. Settings Rendering

- [x] 3.1 Render Browser and Computer Use as plugin-backed settings content instead of static Desktop route placeholders.
- [x] 3.2 Include explicit limitation details for Browser backend readiness and Computer Use OS permissions/app approvals.
- [x] 3.3 Preserve Desktop route/source evidence as supporting context, not the primary status.
- [x] 3.4 Append Browser local runtime readiness and Computer Use MCP command readiness without treating either as plugin lifecycle.

## 4. Verification

- [x] 4.1 Add or update tests for Browser and Computer Use settings loading and plugin row filtering.
- [x] 4.2 Run targeted UI tests for settings/plugin projections.
- [x] 4.3 Run `npm run typecheck`.
- [x] 4.4 Validate Browser/Computer Use OpenSpec changes after runtime readiness updates.
