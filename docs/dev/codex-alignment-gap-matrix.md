# Codex Alignment — HiCodex vs Codex Desktop Gap Matrix

Actionable status of HiCodex's intermediate-output parity with Codex Desktop, last reconciled 2026-05-20.

This is the index doc for what is **done**, what is **deliberate divergence**, and what remains open work. Each row links to the per-topic deep dive.

Linked:
- [dispatcher](./codex-alignment-dispatcher.md)
- [reasoning](./codex-alignment-reasoning.md)
- [plan](./codex-alignment-plan.md)
- [unified diff](./codex-alignment-unified-diff.md)
- [collab agent](./codex-alignment-collab-agent.md)
- [image generation](./codex-alignment-image-generation.md)

Legend: 🟢 aligned · 🟡 minor divergence (visual or non-blocking) · 🔴 functional gap · ✅ recently closed · ~~ID~~ retracted (was a false positive).

## A. Streaming delta (dispatcher)

| ID | Codex | HiCodex | Gap | Status |
| --- | --- | --- | --- | :-: |
| A1 | 5 text/output delta channels; `patchUpdated` independent; `summaryPartAdded` break; `fileChange/outputDelta` sampled; `mcpToolCall/progress` ignored | reducer was over-subscribed; 4 non-Desktop channels retired, 1 (`fileChange/patchUpdated`) kept as documented HiCodex extension | converged | ✅ |

See [dispatcher doc](./codex-alignment-dispatcher.md) for the channel list and rationale.

## B. Reasoning + Thinking placeholder

All B1–B3, B5–B6, B8, B10 entries were retracted after the 2026-05-20 deep dive (see [reasoning doc](./codex-alignment-reasoning.md)). The agent timeline in Codex never renders reasoning ThreadItems — the `Ux` / `qx` render path is dead code. HiCodex's synthetic `desktopThinkingPlaceholderItem` is more user-explicit than Codex but does not violate the parity rule.

Remaining items:

| ID | Item | Codex behavior | HiCodex | Status |
| --- | --- | --- | --- | :-: |
| B4 | Composer ReasoningEffort selector (6 labels None/Minimal/Low/Medium/High/Extra High) | implemented in Codex `reasoning-minimal-*.js` chunk | scope = Composer parity (not intermediate-output) | 🟡 reclassified |
| B7 | Exploration counts conjunction | `Intl.formatList({ type: 'conjunction' })` -> "X, Y, and Z" | `tool-activity-grouping.ts::joinConjunction` aligned | ✅ |
| B9 | Reasoning-complete remnant | Codex placeholder disappears (`BC` returns `none`) | HiCodex leaves a `Thought for {time}` row | 🔴 deliberate divergence — HiCodex chose to keep elapsed visible |

## C. Plan summary card

See [plan doc](./codex-alignment-plan.md).

| ID | Item | Codex defaultMessage | HiCodex | Status |
| --- | --- | --- | --- | :-: |
| C1 | fadeType | `completed ? 'none' : 'indexed'` | same | 🟢 |
| C2 | Header title | `Plan` / `Writing plan` | same | 🟢 |
| C3 | Download filename | `PLAN.md` | same | 🟢 |
| C4 | Toggle aria-label | `Expand plan summary` / `Collapse plan summary` | aligned (`plan-summary-card.tsx`) | ✅ |
| C5 | Toggle tooltip | `Expand` / `Collapse` | aligned | ✅ |
| C6 | "Open in new window" button + `show-plan-summary` dispatch | exists in Codex but its main-process handler is `break;` (stub) | HiCodex stub-aligned with noop onClick | ✅ (Codex itself is a stub) |
| C7 | Collapsed-bottom "Expand plan" gradient button | `Expand plan` | same | 🟢 |

## D. Collab agent (multi-agent tool calls)

See [collab agent doc](./codex-alignment-collab-agent.md).

The entire D section was retracted after the 2026-05-20 reconciliation. HiCodex `multiAgentRowVerb` (row form, `Failed spawning` etc.) and `multiAgentSendInputPromptVerb` (prompted form, `Failed to message`) match Codex's `rowAction.*` and `rowAction.sendInput.messaged.*` tables respectively. The earlier "Failed to spawn" mismatch was a misread of the header table.

## E. Unified diff (inline card + Failure Dialog)

See [unified diff doc](./codex-alignment-unified-diff.md).

| ID | Item | Codex | HiCodex | Status |
| --- | --- | --- | --- | :-: |
| E1 (a) | Review button label | `Review here` | aligned in `event-unit.tsx` | ✅ |
| E1 (b) | Review file count tooltip / aria | `Review changed files` + `Review` | aligned | ✅ |
| E1 (c) | Undo / Reapply per-file tooltips | `Undo` / `Reapply` | aligned | ✅ |
| E2 (UI) | Failure Dialog with 13 strings, 3 tone classes, max-h-40vh | clean-room `UnifiedDiffFailureDialog` implemented | ✅ |
| E2 (backend) | `host_apply_patch_action` Tauri command running `git apply` / `git apply --reverse` with non-git detection | implemented in `apps/desktop/src-tauri/src/main.rs` | ✅ |
| E2 (state) | `applyPatchAction` bridge + Dialog wiring | `tauri-host.ts` + `HiCodexApp.tsx` + `conversation-view.tsx` + `event-unit.tsx::ToolBlock` | ✅ |
| E-inline | Edited-file detail list (per-file rows, line counts, show-more, large-file placeholder) | Codex renders full list | HiCodex inline card omits the detail list | 🔴 visual gap |

## F. Turn container / Worked-for divider

| ID | Item | Codex | HiCodex | Status |
| --- | --- | --- | --- | :-: |
| F1 | `Working` / `Working for {time}` / `Worked for {time}` with 1000ms threshold | 1000ms threshold | `worked-for-divider.tsx` matches | 🟢 |

## G. Image generation

See [image generation doc](./codex-alignment-image-generation.md).

| ID | Item | Codex | HiCodex | Status |
| --- | --- | --- | --- | :-: |
| G1 | Turn-level inline gallery (`MAX_GALLERY_ROW = 4`, hover prev/next, overflow badge) | implemented | not implemented; HiCodex emits markdown image + right-rail artifact | 🔴 |
| G2 | Right-rail Artifacts 6-item cap + Show more/less | `Qd = 6` + `showMore`/`showLess` | `rail-projection.ts` projects artifacts; cap needs re-verification | 🟡 |
| G3 | Full-screen lightbox (Prev / Next / Close) | implemented | not yet implemented | 🟡 |

## H. Plan / Todo summary

| ID | Item | Codex defaultMessage | HiCodex | Status |
| --- | --- | --- | --- | :-: |
| H1 | tasks completed | `{completed} out of {total} tasks completed` | `${completed} out of ${plan.length} ${taskLabel} completed` | 🟢 |
| H2 | step index prefix | `{index}.` (1-based) | `${index + 1}.` | 🟢 |

## I. Remaining open work

After the 2026-05-20 reconciliation, only three categories of work remain on the intermediate-output parity track:

| Item | Blocker | Note |
| --- | --- | --- |
| C6 (multi-window detail page) | Tauri multi-window architecture (new entry + `WebviewWindowBuilder`) | Codex itself ships a stub; current HiCodex stub-alignment is sufficient. |
| G1 / G3 (turn-level gallery + lightbox) | UI work, no backend dependency | Tracked for a future visual-polish pass. |
| E-inline (edited-file detail list inside inline diff card) | UI work | Tracked alongside G1/G3. |

All "Codex-source-backed pure UI / string alignment" work is closed.

## Quick history

- 2026-05-20: Codex Desktop re-extracted; reasoning (`B1`–`B3`), collab agent (`D`), and several `B5`–`B6`/`B8`/`B10` entries retracted after evidence review showed Codex either does not render the surface (`Ux` dead code) or already matches HiCodex semantics.
- E2 (Failure Dialog + `host_apply_patch_action`) shipped in the same pass.
- A1 reducer convergence (4 channels retired) shipped in the same pass.
