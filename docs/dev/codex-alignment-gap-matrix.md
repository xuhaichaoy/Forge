# Codex Alignment — HiCodex vs Codex Desktop Gap Matrix

Actionable status of HiCodex's intermediate-output parity with Codex Desktop, last reconciled 2026-05-24.

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

All B1–B3, B5–B6, B8, B10 entries were retracted after the 2026-05-20 deep dive (see [reasoning doc](./codex-alignment-reasoning.md)). The agent timeline in Codex never renders reasoning ThreadItems — the `Ux` / `qx` render path is dead code. HiCodex's synthetic `desktopThinkingPlaceholderItem` mirrors Codex's live placeholder path and is only rendered while the turn is in progress.

Remaining items:

| ID | Item | Codex behavior | HiCodex | Status |
| --- | --- | --- | --- | :-: |
| B4 | Composer ReasoningEffort selector (6 labels None/Minimal/Low/Medium/High/Extra High) | implemented in Codex `reasoning-minimal-*.js` chunk | scope = Composer parity (not intermediate-output) | 🟡 reclassified |
| B7 | Exploration counts join | plain `, ` separator (`...accordion.count.separator`), NOT a conjunction (see §I RA10) | `explorationSummaryLabel` joins with `", "`; `joinConjunction` kept only for the cross-type summary | ✅ (corrected 2026-05-29) |
| B9 | Reasoning-complete remnant | Codex placeholder disappears (`BC` / `Iy` returns `none`) | HiCodex drops completed reasoning and does not leave a `Thought for {time}` row | ✅ |

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
| E-inline | Edited-file detail list (per-file rows, line counts, show-more, large-file placeholder) | Codex renders full list; single-file detail row uses `Details` and omits duplicate stats | HiCodex inline card matches | ✅ |

## F. Turn container / Worked-for divider

| ID | Item | Codex | HiCodex | Status |
| --- | --- | --- | --- | :-: |
| F1 | `Working` / `Working for {time}` / `Worked for {time}` with 1000ms threshold | 1000ms threshold | `worked-for-divider.tsx` matches | 🟢 |

## G. Image generation

See [image generation doc](./codex-alignment-image-generation.md).

| ID | Item | Codex | HiCodex | Status |
| --- | --- | --- | --- | :-: |
| G1 | Turn-level inline gallery (`MAX_GALLERY_ROW = 4`, hover prev/next, overflow badge) | implemented | `GeneratedImageGallery` + turn projection implemented | ✅ |
| G2 | Right-rail Artifacts 6-item cap + Show more/less | `Qd = 6` + `showMore`/`showLess` | `RAIL_LIST_PREVIEW_LIMIT = 6` verified | ✅ |
| G3 | Full-screen lightbox (Prev / Next / Close) | implemented | `ImagePreviewLightbox` controlled mode with nav/close/zoom implemented | ✅ |

## H. Plan / Todo summary

| ID | Item | Codex defaultMessage | HiCodex | Status |
| --- | --- | --- | --- | :-: |
| H1 | tasks completed | `{completed} out of {total} tasks completed` | `${completed} out of ${plan.length} ${taskLabel} completed` | 🟢 |
| H2 | step index prefix | `{index}.` (1-based) | `${index + 1}.` | 🟢 |

## I. 2026-05-29 re-audit (Codex Desktop v26.519.81530, May 27 ASAR)

The installed Desktop app updated to v26.519.81530 (May 27), post-dating the 2026-05-24 pass — the exact "re-audit after an app update" trigger. A multi-agent re-audit of all 8 intermediate-output surfaces (each finding adversarially evidence-verified against the fresh ASAR) surfaced 24 divergences: 18 applied this pass, 6 deferred. Every change cites a durable token (ICU id / defaultMessage / constant / data-attr / behavior) verified against the fresh build.

Applied:

| ID | Surface | Change | Durable evidence |
| --- | --- | --- | --- |
| RA1 | dispatcher | `model/rerouted` now synthesizes a `modelRerouted` timeline item (was log-only); `itemType` normalizes the camelCase protocol type to `model-rerouted` | onNotification pushes `{type:'modelRerouted',fromModel,toModel,reason}`; renderer gates on `reason==='highRiskCyberActivity'` |
| RA2 | unified-diff | Failure Dialog title is a 4-way selector (not-git-repo / Some changes / No changes / Failed to) | `codex.unifiedDiff.{revertPatchPartial,revertPatchNoChanges,revertPatchError}` branched on appliedPaths/skipped/conflicted |
| RA3 | unified-diff | Body intro line (description tone) above the path list; only the path block caps at 40vh | `patchFailureDetailsIntro*` / `patchNotGitRepoDescription` as body copy; `max-h-[40vh]` on the path list |
| RA4 | unified-diff | Clean apply → success toast; thrown action → danger toast (dialog reserved for partial/conflict results) | `revertPatchSuccess` / `revertPatchError`, toast id `turnDiffPatchAction` |
| RA5 | unified-diff | execOutput folded into the intro as single-line "Git apply error: {message}" (removed collapsible `<details>`) | `patchErrorOutputSummary`="Git apply error: {message}" |
| RA6 | unified-diff | Completed-card trailing Review button "Review changes" → "Review" | `codex.unifiedDiff.viewDiffTooltip`="Review" |
| RA7 | unified-diff | Hover subtitle = "Review changes" + a separate arrow icon (dropped the literal "→") | `reviewChangesHover`="Review changes" + icon element |
| RA8 | plan | Copy uses shared "Copy"/"Copied" (was "Copy plan"); removed invented "Copied to clipboard" toast; reset 1500→2000ms | `copyButton.copyAriaLabel`/`copiedAriaLabel`; `2e3` reset |
| RA9 | plan | Collapsed fade overlay 112→160px; "Expand plan" button restyled as filled primary | `h-40 bg-gradient-to-t from-token-input-background to-transparent`; `color:"primary"` |
| RA10 | exploration | Header counts joined with plain ", " (was Oxford comma + "and"); cross-type summary keeps the conjunction | `localConversationTurn.exploration.accordion.count.separator`=", " — corrects the earlier B7/§3 claim |
| RA11 | exploration | Accordion body heights set to {preview 7rem, expanded 20rem scroll, collapsed 0} | height map `{preview:7rem,expanded:20rem,collapsed:0px}` |
| RA12 | image-gen | Removed invented `role`/`aria-label` from the pending tile and carousel nav wrapper (kept per-button labels) | "Generating image"/"Generated image carousel" absent from all chunks |
| RA13 | render-groups | Restored the per-message timestamp as the trailing hover/focus affordance in the assistant action row (today/weekday/date buckets) | action row appends a trailing `sentAtMs` span revealed on hover/focus |
| RA14 | render-groups | Selected turn-rating thumb swaps to a filled glyph | thumb icon selected→filled, outline otherwise |
| RA15 | turn-rating | Removed invented "Feedback sent" post-submit node (Desktop just closes the popover) | string absent from `plan-summary-item-content-*.js` |
| RA16 | markdown | Link/autolink href allowlist = http/https/irc/ircs/mailto/xmpp/codex; dropped ftp; codex:// stays clickable | `/^(https?\|ircs?\|mailto\|xmpp\|codex)$/i` |
| RA17 | markdown | Image `src` sanitized (data:image/video, file/relative, allowlisted schemes; drops javascript: etc.) | `ut()` img-src sanitizer, `/^data:(?:image\|video)\//i` |

Deferred (rationale):

- **RD1 dispatcher** — `turn/plan/updated` synthesizing a `todo-list` item is internal-only: Desktop does not render todo-list as a standalone transcript row, and HiCodex's `turnPlan` snapshot already drives the same live right-rail Progress (no visible divergence).
- **RD2 dispatcher** — the `requestApproval`/`tool/call`/`requestUserInput` cases in `applyNotification` are dead (id-bearing → `onServerRequest`); removing them is cleanup with no visible change.
- **RD3 unified-diff** — failure-dialog path rows as file-open buttons need `cwd`/`hostId` plumbed through `HiCodexApp`.
- **RD4 markdown** — `<sub>` containing a link → `<span>` is niche; needs inline-link detection in the sub renderer.
- **RD5 plan** — "Writing plan" gradient text-shimmer vs HiCodex's opacity-pulse + indexed fade; the indexed fade is already accepted as a clean-room choice.
- **RD6 markdown** — hljs token-scope coverage (shiki vs hljs); exact token boundaries differ by tokenizer.

Pre-existing (not from this pass): `tool-activity-detail.test.ts::buildsMcpDetails` (MCP text-result "plaintext" code-container title) fails on the current staged tree, inside `tool-activity-detail.tsx` which this pass did not touch — flagged for the owner of that in-progress MCP work.

Keep live visual verification as a separate audit before claiming complete product parity. This table is evidence-backed for the inspected local Desktop build (v26.519.81530) only; re-audit after the next app update.

## Quick history

- 2026-05-29: Codex Desktop updated to v26.519.81530 (May 27 ASAR); multi-agent re-audit of all 8 intermediate-output surfaces (§I). 18 source-backed fixes applied — `model/rerouted` timeline item; unified-diff failure-dialog 4-way title + body intro + success/danger toasts + "Git apply error" line + "Review" label + arrow icon; plan shared copy strings + filled fade button + 2000ms reset; exploration plain-comma counts + accordion heights; generated-image aria trim; restored hover-revealed per-message timestamp; filled selected thumb; removed invented "Feedback sent"/"Copied to clipboard"/gallery aria literals; markdown href + image scheme allowlists (codex:// clickable, ftp dropped). 6 deferred. Corrects the earlier exploration-count "conjunction" claim (B7 / reasoning §3): Desktop uses a plain ", " separator; the conjunction is only the cross-type web-search/MCP summary. typecheck + build + 73 UI tests green.
- 2026-05-24: Codex Desktop ASAR re-checked for assistant memory citations. HiCodex now renders citation source rows through the Desktop-style file-reference button path rather than fallback `href` anchors, while keeping the localized summary/line labels, full-path truncation, and note layout aligned.
- 2026-05-24: Codex Desktop ASAR re-checked for automation citation chips. HiCodex now keeps chips static until an automation id and open route are available, then routes the button through the Automations panel instead of logging a debug-only click.
- 2026-05-24: Codex Desktop ASAR re-checked for inline diff detail rows. HiCodex now renders the edited-file detail list, show-more/collapse behavior, large-file placeholder, and Desktop's single-file `Details` row without duplicate per-row stats.
- 2026-05-24: Codex Desktop ASAR re-checked for reasoning placeholder and generated-image surfaces. HiCodex drops completed reasoning remnants, renders the turn-level generated-image gallery, keeps the right-rail 6-item Artifacts cap, and opens generated images in the Desktop-style lightbox.
- 2026-05-20: Codex Desktop re-extracted; reasoning (`B1`–`B3`), collab agent (`D`), and several `B5`–`B6`/`B8`/`B10` entries retracted after evidence review showed Codex either does not render the surface (`Ux` dead code) or already matches HiCodex semantics.
- E2 (Failure Dialog + `host_apply_patch_action`) shipped in the same pass.
- A1 reducer convergence (4 channels retired) shipped in the same pass.
