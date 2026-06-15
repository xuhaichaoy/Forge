# Codex Alignment — Reasoning, Thinking Placeholder, Exploration

Alignment reference for how Codex Desktop renders reasoning, the "Thinking" placeholder, and the exploration activity card. Use this when changing `tool-activity-grouping.ts`, `project-conversation.ts::desktopThinkingPlaceholderItem`, `event-unit.tsx::ReasoningActivityView`, or `animated-disclosure.tsx`.

Linked: [dispatcher](./codex-alignment-dispatcher.md), [plan](./codex-alignment-plan.md), [gap matrix](./codex-alignment-gap-matrix.md).

## 1. Reasoning ThreadItem is NOT rendered in the agent timeline

This is the most-violated rule. Codex Desktop has a `ReasoningItem` render function (`Ux` in the bundle) and three i18n strings (`reasoningItem.thinking`, `reasoningItem.thought`, `reasoningItem.thoughtWithElapsed`) — **all of these are dead code paths.** The agent timeline never reaches them.

Evidence chain (see Codex bundle, search `split-items-into-render-groups-*.js` and `local-conversation-thread-*.js`):

```text
buildAgentItems()       -> agentItems = [...includes reasoning items]
filterRenderableAgentItems({agentItems})
  -> reasoning items are either appended to a live exploration buffer, or dropped
  -> they are NEVER pushed as { kind: 'item', item: reasoningItem }
dispatchUnit({unit})
  -> for unit.entry.kind === 'item' && item.type === 'reasoning': renderResult = null
```

In words: `filterRenderableAgentItems` skips reasoning entirely (it can ride along inside an exploration buffer so the buffer flushes on turn end, but it never becomes its own renderable entry). `dispatchUnit` has a defensive `item.type === 'reasoning' -> null` branch that fires only if the upstream filter regresses.

### Two indirect signals reasoning still produces

1. Joining an exploration buffer keeps `buffer.length > 0`, so the buffer is flushed (not dropped) at turn end.
2. `buffer.some(item => isInProgress(item))` stays true, keeping the exploration card status `exploring` rather than `explored`.

### Protocol vs render projection

```text
reasoningProtocolItem = {                       // stored by reducer
  id, type: 'reasoning',
  summary: string[],                            // grows via summaryTextDelta
  content: string[],                            // grows via textDelta, retained but unused for render
}

reasoningRenderItem = {                         // synthesized by the local-conversation-thread layer
  type: 'reasoning',
  content: joinSummary(protocolItem.summary),   // joins summary, NOT content
  completed: !isStreamingLastItem,
}
```

The renderer reads from `summary`, not `content`. `content` is stored only for protocol fidelity / future use.

### Forge implementation rule

Forge injects a synthetic live placeholder via `desktopThinkingPlaceholderItem` (`project-conversation.ts`) and renders it through `ReasoningActivityView` (`event-unit.tsx`) only while the turn is in progress. This mirrors Codex's real placeholder path rather than the dead-code `Ux`/`qx` ReasoningItem path.

The label projection in `tool-activity-grouping.ts` still carries the Codex i18n string defaults (`Thinking` / `Thought for {time}` / `Thought`) for helper and defensive paths, but completed reasoning items are dropped by the turn projection and do not leave a visible `Thought` row.

## 2. The real "Thinking" UX path

Codex's actual on-screen "Thinking" surface comes from a separate placeholder pipeline driven by a 4-state classifier (`BC` in the bundle). The classifier inputs are:

```text
{ isTurnInProgress, assistantItem, proposedPlanItem,
  isExploring, hasActiveWebSearch,
  isAnyNonExploringAgentItemInProgress, hasBlockingRequest,
  forceThinking }
```

Outputs:

- `forceThinking` -> `{ type: 'thinking', isVisible: true }`
- not in turn -> `{ type: 'none' }`
- in turn + exploring (exec read/list/search active) -> `{ type: 'exploring' }`
- in turn + proposedPlanItem incomplete -> `{ type: 'planning' }`
- in turn + (hasBlockingRequest or assistantItem has streamed text or web-search active) -> `{ type: 'none' }`
- in turn + assistantItem still incomplete -> `{ type: 'thinking', isVisible: true }`
- in turn + only non-exploring agent items running -> `{ type: 'none' }`
- fallthrough -> `{ type: 'thinking', isVisible: true }`

Lifecycle (recorded from a Codex Desktop session 2026-05-20):

| Phase | classifier output | UI |
| --- | --- | --- |
| Submit, model only reasoning | `thinking` | "Thinking" shimmer (no timer) |
| assistantItem starts streaming text | `none` | placeholder disappears |
| proposedPlan in progress | `planning` | (no separate placeholder — handled by the proposedPlan card) |
| Exec read/list/search starts | `exploring` | exploration card (see §3) |
| Web search / other activity | `none` | top "Working for {time}" + activity row |
| Turn complete | `none` | placeholder disappears |

The "Working for {time}" timer that appears once tools start is a separate "worked-for divider" surface, not the placeholder.

### Shimmer detail

The thinking placeholder uses a `cadencedShimmer` mask animation: 4000ms cycle, 1000ms shimmer window, 600ms initial delay. Forge implements an equivalent CSS animation (`hc-thinking-shimmer`).

### Forge alignment

Forge's `desktopThinkingPlaceholderItem` is guarded by `turnStatus === "in_progress"`, so it vanishes when the turn completes just like Codex's `Iy` classifier returning `{ type: 'none' }`. Completed real reasoning ThreadItems are dropped by `pushActivityItem`; they remain in reducer state for protocol fidelity but do not render as transcript rows.

## 3. Exploration card (`_v` / `Cv`)

Exploration is the agent-timeline surface for `exec read/list/search` activity, with reasoning items folded in as buffer riders (see §1).

Inputs: `{ items, status, hideHeader?, threadDetailLevel, resolvedApps }`, where `status: 'exploring' | 'explored'`.

### Header (three states)

| Condition | Render |
| --- | --- |
| `exploring` + has activeLabel (last in-progress exec) | icon + activeLabel (e.g. "Reading foo.ts") |
| `exploring` + no activeLabel | `exploration.accordion.header.active = Exploring` + optional counts |
| `explored` | `exploration.accordion.header.complete.withCounts = Explored {counts}` |

### Counts

The three plural count fragments are joined with the plain separator string
`localConversationTurn.exploration.accordion.count.separator` (defaultMessage `, `),
**not** an Intl conjunction — so the header reads "Explored 1 file, 2 searches, 3 lists"
(no Oxford "and"):

- `{n, plural, one {# file} other {# files}}`
- `{n, plural, one {# search} other {# searches}}`
- `{n, plural, one {# list} other {# lists}}`

Forge `tool-activity-grouping.ts::explorationSummaryLabel` joins these with `", "`.
The `Intl.formatList({ type: 'conjunction' })` form ("X, Y, and Z") is used **only** for the
separate cross-type web-search/MCP activity summary, where Forge keeps `joinConjunction`.
Re-verified against Codex Desktop v26.519.81530 (corrects the earlier conjunction claim).

### Body

Body rows render only `item.type === 'exec'` (with sub-types `read | search | list_files | format | test | lint | noop | unknown`). Reasoning items are invisible in the body — they exist in the buffer only as flush/status signals (§1).

### Collapse (3-state)

```text
preview:    7rem max-height
expanded:  20rem max-height
collapsed:  0 max-height
```

- `exploring` initial state: `preview` (but the header is mid-flight, body hidden by `!hasUserToggled`)
- `explored` initial state: `collapsed`
- Click toggles between `expanded` and `collapsed`.
- Body animation uses framer-motion `height + opacity` with the shared transition (`duration: 0.5s`, `cubic-bezier(0.19, 1, 0.22, 1)`).

Forge uses CSS-driven equivalents in `tool-activity.css`; behavior is aligned, the implementation primitive differs.

## 4. i18n strings (durable defaults)

Reasoning ThreadItem (Codex dead code path — keep defaults for synthetic placeholder text):

| id | defaultMessage | trigger |
| --- | --- | --- |
| `reasoningItem.thinking` | `Thinking` | reasoning in progress |
| `reasoningItem.thought` | `Thought` | reasoning complete, no elapsed |
| `reasoningItem.thoughtWithElapsed` | `Thought for {elapsed}` | reasoning complete with elapsed |

Composer ReasoningEffort selector (six values, lives in the Codex `reasoning-minimal-*.js` chunk — NOT in the thread item renderer):

| case | id | defaultMessage |
| --- | --- | --- |
| `none` | `composer.mode.local.reasoning.none.label` | `None` |
| `minimal` | `composer.mode.local.reasoning.minimal.label` | `Minimal` |
| `low` | `composer.mode.local.reasoning.low.label` | `Low` |
| `medium` | `composer.mode.local.reasoning.medium.label` | `Medium` |
| `high` | `composer.mode.local.reasoning.high.label` | `High` |
| `xhigh` | `composer.mode.local.reasoning.xhigh.label` | `Extra High` (NOT `xhigh`) |

Exploration (live i18n; this is the surface users actually see):

```text
localConversationTurn.exploration.accordion.header.active               = Exploring
localConversationTurn.exploration.accordion.header.active.withCounts    = {counts}
localConversationTurn.exploration.accordion.header.complete             = Explored
localConversationTurn.exploration.accordion.header.complete.withCounts  = Explored {counts}
localConversationTurn.exploration.accordion.count.files                 = <countText>{count, plural, one {# file} other {# files}}</countText>
localConversationTurn.exploration.accordion.count.searches              = <countText>{count, plural, one {# search} other {# searches}}</countText>
localConversationTurn.exploration.accordion.count.lists                 = <countText>{count, plural, one {# list} other {# lists}}</countText>
localConversationTurn.exploration.accordion.count.separator             = ", " (comma + space)
```

Worked-for divider (used as `Working` / `Working for {time}` / `Worked for {time}` with a 1000ms elapsed threshold):

| defaultMessage | trigger |
| --- | --- |
| `Working` | running, elapsed < 1000ms |
| `Working for {time}` | running, elapsed >= 1000ms |
| `Worked for {time}` | completed |

## 5. Shared animation infrastructure

Codex bundles one global transition constant used across multiple disclosure surfaces (reasoning Ux, exploration accordion body, MCP tool call body, shell command body, etc.):

```js
{ duration: 0.5, ease: [0.19, 1, 0.22, 1] }  // easeOutExpo-ish
```

Forge constraint: the `AnimatedDisclosure` exit-animation duration (`DISCLOSURE_EXIT_MS` in `animated-disclosure.tsx`) must equal `--hc-codex-transition-duration` (500ms). See DEVELOPMENT.md §13.

A shared `useScrollHeight()` hook in the Codex bundle wraps a height ResizeObserver and returns `{ elementHeightPx, elementRef }`. Forge uses the same pattern in components that need "measure body, animate to that height".

### `vertical-scroll-fade-mask` CSS (Codex `app-main-*.css`)

Codex uses `animation-timeline: scroll(self y)` (Chrome 115+ scroll-driven animations) to fade mask gradients at the top/bottom of scrollable disclosure bodies:

```css
.vertical-scroll-fade-mask {
  --top-fade: var(--edge-fade-distance, 1rem);
  --bottom-fade: var(--edge-fade-distance, 1rem);
  mask: linear-gradient(to bottom in oklch,
    oklch(60% 0 0 / 0),
    oklch(85% 0 0) var(--top-fade) calc(100% - var(--bottom-fade)),
    oklch(60% 0 0 / 0));
  animation-name: edge-fade;
  animation-timing-function: linear;
  animation-fill-mode: both;
  animation-timeline: scroll(self y);
}
```

Forge does not currently implement this mask. It is a visual-polish gap, not a behavior gap.
