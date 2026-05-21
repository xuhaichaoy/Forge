# Codex Alignment — Collab Agent Tool Calls

Alignment reference for `CollabAgentToolCall` ThreadItems (multi-agent spawn / sendInput / resume / close). Use this when changing `tool-activity-detail.tsx::multiAgentRowVerb` / `multiAgentSendInputPromptVerb` or anything that renders sub-agent rows.

Linked: [gap matrix](./codex-alignment-gap-matrix.md).

## 1. Verb tables (action x status)

Codex uses three distinct verb tables that share verbs for `InProgress` and `Completed` states but diverge on `Failed`.

### rowAction (row-level verb, per sub-agent row)

`localConversation.multiAgentAction.rowAction.{action}.{status}`:

| action | InProgress | Completed | Failed |
| --- | --- | --- | --- |
| `spawn` | `Spawning` | `Spawned` | `Failed spawning` |
| `sendInput` | `Messaging` | `Messaged` | `Failed messaging` |
| `resume` | `Resuming` | `Resumed` | `Failed resuming` |
| `close` | `Closing` | `Closed` | `Failed closing` |

### header (group-level title, summarizing the multi-agent action)

`localConversation.multiAgentAction.header.{action}.{status}`:

| action | InProgress | Completed | Failed |
| --- | --- | --- | --- |
| `spawn` | `Spawning` | `Spawned` | `Failed to spawn` |
| `sendInput` | `Messaging` | `Messaged` | `Failed to message` |
| `resume` | `Resuming` | `Resumed` | `Failed to resume` |
| `close` | `Closing` | `Closed` | `Failed to close` |

### prompted sendInput row (sendInput when a prompt is attached)

`localConversation.multiAgentAction.rowAction.sendInput.messaged.{status}`:

| InProgress | Completed | Failed |
| --- | --- | --- |
| `Messaging` | `Messaged` | `Failed to message` |

## 2. Failed-state divergence rule

Only the `Failed` state diverges across the three tables:

- Row verb (`rowAction.*`): `Failed <gerund>` (e.g. `Failed spawning`).
- Header verb (`header.*`): `Failed to <infinitive>` (e.g. `Failed to spawn`).
- Prompted sendInput row: also `Failed to <infinitive>` — closer to the header form than to the plain row form.

InProgress and Completed share the same word across all three tables.

## 3. HiCodex implementation rule

- `multiAgentRowVerb` (in `tool-activity-detail.tsx`) must return the `rowAction.*` form (`Failed spawning` etc.) for plain rows.
- `multiAgentSendInputPromptVerb` must return the `rowAction.sendInput.messaged.*` form (`Failed to message`) when a prompt is attached.
- Any group-level summary header must use the `header.*` form (`Failed to spawn` etc.) — do NOT reuse the row verb for headers.

The 2026-05-20 pass confirmed HiCodex already implements both row and prompted-row forms correctly. Earlier gap-matrix entries flagging these as "Failed spawning" mismatches were retracted.

## 4. Data flow

- `remote-conversation-page` projects `receiver_thread_ids: string[]` from the protocol item into `[{ threadId, thread: null }]`; sub-thread details lazy-load on hydration.
- Each receiver thread surfaces in the right-rail Side chats section; clicking switches the side-chat panel to that thread.

## 5. Related Codex bundle areas

Search breadcrumbs (do not cite minified symbols or line offsets in commits):

- Collab agent rows + verbs: Codex `local-conversation-thread-*.js` (multi-agent action region).
- Receiver-thread projection: Codex `remote-conversation-page-*.js`.
