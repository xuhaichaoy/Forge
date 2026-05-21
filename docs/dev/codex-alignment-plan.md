# Codex Alignment — Plan Summary Card

Alignment reference for the proposed-plan UI surfaces (inline `Writing plan` / `Plan` card plus the standalone plan detail page). Use this when changing `packages/ui/src/components/plan-summary-card.tsx` or any code that consumes `plan` ThreadItems.

Linked: [dispatcher](./codex-alignment-dispatcher.md), [reasoning](./codex-alignment-reasoning.md), [gap matrix](./codex-alignment-gap-matrix.md).

## 1. Protocol shape (single text field)

```ts
plan = {
  id: string,
  type: 'plan',
  text: string,             // streamed via item/plan/delta
  completed: boolean,
}
```

There is no structured todo state. The plan is one markdown blob; the model writes `- [ ] foo` / `- [x] foo` itself.

`item/plan/delta` appends to `plan.text`; `item/completed` sets `completed: true`. See [dispatcher doc](./codex-alignment-dispatcher.md).

## 2. UI behavior

- `completed: boolean` drives the title and fadeType.
- Fade behavior: `fadeType = completed ? 'none' : 'indexed'` (last line softens while streaming).
- Markdown rendered via the shared markdown pipeline (`markdown-*` chunks).
- Header actions: a Download button (generates a `Blob` and triggers download with constant filename `PLAN.md`) and a Copy button.
- Collapsible: `aria-expanded={expanded}`; chevron icon rotates 180deg when expanded.
- Detail page entry: an "Open" action dispatches a `show-plan-summary` message with `{ planContent, conversationId }` payload to open the plan in a separate window.

## 3. i18n strings (10 keys, durable)

| id | defaultMessage | usage |
| --- | --- | --- |
| `localConversation.planSummary.title` | `Plan` | header title (completed) |
| `localConversation.planSummary.titleWriting` | `Writing plan` | header title (streaming) |
| `localConversation.planSummary.download` | `Download plan` | download button aria-label |
| `localConversation.planSummary.expand` | `Expand plan summary` | toggle aria-label (collapsed) |
| `localConversation.planSummary.collapse` | `Collapse plan summary` | toggle aria-label (expanded) |
| `localConversation.planSummary.expandTooltip` | `Expand` | toggle tooltip (collapsed) |
| `localConversation.planSummary.collapseTooltip` | `Collapse` | toggle tooltip (expanded) |
| `localConversation.planSummary.viewPlan` | `Expand plan` | label on the collapsed-bottom gradient button |
| `localConversation.planSummary.openInNewWindow` | `Open` | detail button label |
| `localConversation.planSummary.openInNewWindow.tooltip` | `Open in new window` | detail button tooltip |

## 4. Open button is a stub in Codex itself

The `dispatchMessage("show-plan-summary", ...)` handler in Codex's Electron main process is a noop `case "show-plan-summary": break;`. The button exists but does not open a window in the shipped build.

HiCodex implementation rule: render the Open button with the matching aria-label/tooltip (`Open` / `Open in new window`) and wire `onClick` to a noop, matching Codex behavior. A real multi-window implementation would require a new Tauri `WebviewWindowBuilder` entry; treat that as future work, not parity.

## 5. Todo summary i18n

The Progress section in the right rail surfaces task completion. Codex uses:

- `{completed} out of {total} tasks completed`
- Step indices rendered as `{index}.` (1-based).

HiCodex right-rail Progress projection follows the same shape.

## 6. Related Codex bundle areas

For the durable evidence map, these Codex chunks are the search breadcrumbs (do not cite minified symbols or line offsets in commits):

- Plan card render + i18n: Codex `plan-summary-item-content-*.js`.
- Plan detail page: Codex `plan-summary-page-*.js`.
- Plan feature gate: Codex `is-plan-event-enabled-*.js`.

For markdown rendering of `plan.text`, see DEVELOPMENT.md markdown rows.
