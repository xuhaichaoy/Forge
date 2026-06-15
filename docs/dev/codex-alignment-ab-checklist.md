# Codex-alignment A/B verification checklist

This session applied **~165 CSS-value alignments** (gap-matrix §M-58–64) by resolving Forge's
CSS against the real Codex Desktop bundle. Every change is correct **by resolved value**, but the
headless contract method **cannot confirm rendered pixels** — so each is flagged `A/B-pending`
in-comment. This checklist organizes them by surface for a side-by-side pass.

**How to use:** open Forge and Codex Desktop side-by-side on the same content; for each surface
below, eyeball the listed properties. If a row looks wrong, the gap-matrix section in brackets has
the exact change + the Codex evidence to re-check or revert.

---

## Check these first — the biggest visual shifts (most likely to want a second look)

- **Toasts moved bottom-right → TOP-CENTER** `[§M-63 #37]`. Trigger any toast; it should now appear
  centered at the top (max 560px wide), matching Codex `fixed inset-0 mx-auto my-2 max-w-[560px]`.
  *Re-QA'd against the bundle — confirmed top-center.* If you prefer bottom-right, this is the one to revert (`base.css .hc-toast-viewport`).
- **Command-palette rows are now FLAT** (no border, transparent bg) instead of opaque cards `[§M-63 #1-2]`.
  Open ⌘K — rows should highlight only on hover (5% fill), like Codex's cmdk list. kbd hints are now
  sans-serif + borderless + `bg-current/10`; group headings mixed-case (not UPPERCASE-bold).
- **Chat body font 13→14px, line-height 22px** `[§M-59]` — affects ALL message text. Compare overall
  text size + line spacing against Codex. (Source-confirmed: the chain resolves to `--text-base`=14px.)
- **Plan card lost its border + shadow → subtle 5% wash** `[§M-61]`; "Open" is now an outline pill.
- **Markdown headings re-tiered** to 24/20/17/15px `[§M-58]` — compare h2–h4 sizes in assistant prose.

---

## By surface

| Surface (open in both apps) | What changed → look for | Ref |
|---|---|---|
| **Assistant message body** | 14px/22px text; color `#1a1c1f`; paragraph `0 0 11px`; hr 28px; code-block 14px margin + 10px radius; list model (10px lists, 8px between items, nested 8px top) | §M-58/59/60 |
| **Markdown headings** | h1 24, h2 20, h3/4 17, h5/6 15px; uniform 20/0/10 margins | §M-58 |
| **Conversation top bar** | env-icon 14px, summary-rail icon 18px, title weight 500, ghost-hover 5% tint, rail-trigger radius | §M-58 |
| **Composer** | send button fill `#1a1c1f`, "+" icon 18px, input inset 12px, multiline corner `rounded-3xl` | §M-58/61 |
| **Right rail** | container corner `rounded-3xl`; summary-row/source-icon/env-selector radii (6px); resource-card icon 24px | §M-57/61 |
| **Tool-activity** | summary label 40% muted; leading icon 16px; **no green "running" tint** (shimmer is the cue); chevron 50% | §M-61 |
| **Plan card** | no border/shadow, 5% wash, `rounded-lg`, symmetric header padding, 24px action buttons, Open = outline pill | §M-61 |
| **Sidebar** | project-row + thread-row corners (`rounded-lg` 10px), section-action radius, meta/timestamp 50% muted | §M-57/61 |
| **Reasoning picker** | item 12px/`rounded-lg`, header mixed-case 12px (no UPPERCASE/tracking), gap 6/padding 5-8, checkmark 16px, no active-bold | §M-61 |
| **Model picker** | header mixed-case 12px, model-item `rounded-lg`, model-name **sans** (not monospace), no selected-row bg (checkmark only) | §M-61/63 |
| **Dialogs (settings/command)** | panel `rounded-3xl`, body padding 20, footer gap 12, header weight 600, 14px body, 24px close | §M-57 |
| **Approval / pending requests** | option-row padding 8, options gap 4, action buttons 28px h / 8px pad, label weight 500 | §M-57 |
| **Find bar** (⌘F) | input height 24px, prev/next/close buttons **16px** (smaller), left inset 16px | §M-62 |
| **Image lightbox** | nav + toolbar buttons 40px | §M-62 |
| **Command palette** (⌘K) | flat rows (5px/8px pad), 14px titles, 50% descriptions; kbd hints sans/borderless/`rounded-md`; headings mixed-case 12px | §M-63 |
| **User-message edit mode** | edit form `rounded-3xl` + 5% wash + no shadow/outline; full-width; Save = `#1a1c1f`; buttons 14px/`rounded-lg`; **per-message timestamp 11px** | §M-63 |
| **Toasts** | **top-center** (see above), gap 6, padding 8, `rounded-2xl`, 14px body, circular close, 16px icon | §M-63 |
| **Multi-agent / collab blocks** | title + rows 14px, title weight 430, header 40% muted | §M-64 |
| **Empty / loading states** | message + empty text 14px | §M-64 |
| **Sidebar account trigger** | nav-row tokens: 31px row, 8px inset, `rounded-lg`, 18px avatar | §M-64 |

---

## Deliberately NOT changed (no Codex baseline / needs your call)

- **Forge-only features** (no Codex counterpart — left as-is): the file-preview **side-by-side diff**
  + its `+N/-N` line-count colors, the KB / model-gateway business shell, the left nav-rail.
- **Composer min-height** (`composer.css` 112px): Codex's composer is content-driven (~84px). Removing
  the floor is genuinely rendering-dependent (footer/editor heights), so it needs your eyeball, not a
  blind value swap. Adjust if the composer looks too tall vs Codex.
- **In-chat diff colors** (`.hc-turn-diff-*`): verified **already aligned** (`--green-500`/`--red-500`) — no change needed.

> Each table row maps to a `/* … A/B-pending */` comment at the cited CSS location. When you've
> confirmed a surface looks right, the comment can be trimmed to drop the `A/B-pending` tag.
