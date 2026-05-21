# Codex Alignment — Streaming Delta Dispatcher

Alignment reference for the app-server notification dispatcher that drives streaming text/output deltas. Use this when changing `packages/ui/src/state/codex-reducer.ts` or anything that consumes `item/*/*Delta` notifications.

Linked: [reasoning](./codex-alignment-reasoning.md), [plan](./codex-alignment-plan.md), [unified diff](./codex-alignment-unified-diff.md), [gap matrix](./codex-alignment-gap-matrix.md).

## Codex dispatcher cases (durable list)

Codex consumes a fixed set of streaming notification methods. The breadcrumbs below identify the responsible code in the Codex bundle; do not hard-code minified symbols or byte offsets — re-extract `app.asar` (see DEVELOPMENT.md §4 evidence workflow) when verifying.

Five text/output channels enter the streaming queues:

| method | target field | queue |
| --- | --- | --- |
| `item/agentMessage/delta` | `agentMessage.text` | frameTextDelta |
| `item/plan/delta` | `plan.text` | frameTextDelta |
| `item/reasoning/summaryTextDelta` | `reasoning.summary[summaryIndex]` | frameTextDelta |
| `item/reasoning/textDelta` | `reasoning.content[contentIndex]` | frameTextDelta |
| `item/commandExecution/outputDelta` | `commandExecution.aggregatedOutput` | outputDelta |

The same dispatcher also handles non-text channels:

| method | behavior |
| --- | --- |
| `item/reasoning/summaryPartAdded` | case exists but is a bare `break` — no state change |
| `item/commandExecution/terminalInteraction` | direct `applyTerminalInteraction(...)` mutation; no UI state stored |
| `item/fileChange/outputDelta` | sampled for delta-byte / burst telemetry only; no UI state update |
| `item/fileChange/patchUpdated` | `updateTurnState(...)` — creates/updates a `fileChange` item with `inProgress` status |
| `item/mcpToolCall/progress` | debug-ignored when a matching item is found; no UI state update |

Lifecycle channels handled in the same switch (turn/item level, not item delta):

- `turn/started` / `turn/completed` / `turn/diff/updated` / `turn/plan/updated`
- `item/started` / `item/completed`

## Helpers (semantic, not minified)

The Codex dispatcher uses two private helpers worth naming in clean-room form:

- `findItemByIdAndType(items, itemId, type)` — returns the item or `null`.
- `extendArrayToIndex(arr, index, defaultValue)` — ensures `arr.length > index`, filling holes with `defaultValue`. Required because `reasoning.summary` and `reasoning.content` are sparse arrays keyed by `summaryIndex` / `contentIndex`.

A small `transformOnStarted(item)` step special-cases `imageGeneration` / `collabAgentToolCall` initialization at `item/started`.

## HiCodex alignment rule

HiCodex `packages/ui/src/state/codex-reducer.ts` must keep its `applyNotification` switch strictly to the 5-channel set above, plus `fileChange/patchUpdated` as a deliberate HiCodex extension (documented inline).

Channels Codex Desktop does NOT consume in its UI state machine — and which HiCodex must not re-introduce as durable reducer state:

- `summaryPartAdded` — already covered by `appendReasoningText`.
- `commandExecution/terminalInteraction` — no UI consumer.
- `fileChange/outputDelta` — protocol-deprecated, sample only.
- `mcpToolCall/progress` — no UI consumer.

These were retired from `codex-reducer.ts` in the 2026-05-20 pass; do not re-add them without first identifying a real UI consumer.

## 5-channel rationale

The 5 text/output channels are the minimum needed for streaming parity:

1. `agentMessage` — assistant streaming text (markdown).
2. `plan` — proposed-plan streaming text (markdown, see [plan doc](./codex-alignment-plan.md)).
3. `reasoning.summaryTextDelta` — the "shown to user" reasoning summary (see [reasoning doc](./codex-alignment-reasoning.md)).
4. `reasoning.textDelta` — full reasoning content (stored in protocol item; not rendered by Desktop in the agent timeline — see §27.1 in the reasoning doc).
5. `commandExecution.outputDelta` — terminal aggregated output.

Anything beyond these is either a non-streaming lifecycle event (`item/started`, `item/completed`), an item-replacement event (`patchUpdated`), or a Codex Desktop no-op. HiCodex's reducer should match this shape.

## Turn-level fan-out

`turn/plan/updated` and `turn/diff/updated` are turn-level notifications, not item-level deltas. They drive:

- right-rail Progress projection (plan)
- unified diff inline card and Failure Dialog (diff) — see [unified diff doc](./codex-alignment-unified-diff.md)

## Cross-reference

For the full notification table and item lifecycle cases (`item/autoApprovalReview/*`, `item/commandExecution|fileChange|permissions/requestApproval`, `item/tool/call`, `item/tool/requestUserInput`, `thread/goal/updated`, `thread/goal/cleared`, `thread/compacted` deprecation), see DEVELOPMENT.md row `app-server-manager-signals-*.js notification table`.
