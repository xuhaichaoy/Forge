export const meta = {
  name: 'hicodex-provenance-audit',
  description: 'Audit the current working-tree diff: is every substantive change GROUNDED in the extracted Codex Desktop bundle (the parsed local app source), or INVENTED? Adversarially verify each consequential verdict.',
  phases: [
    { title: 'Audit', detail: 'one agent per feature/surface — provenance verdict per change' },
    { title: 'Verify', detail: 'skeptic re-checks each invented / divergence / new-feature-grounded verdict' },
  ],
}

const REPO = '/Users/haichao/Desktop/data/HiCodex'
const BUNDLE = '/private/tmp/codex-asar/webview/assets'

const METHOD = `
PROVENANCE AUDIT — is each change backed by the REAL Codex Desktop source, or invented?

HiCodex is a clean-room re-implementation of Codex Desktop. The user needs assurance that
every change in the current working tree is GROUNDED IN the extracted Codex Desktop bundle
(the parsed local app source) — NOT made up out of thin air.

GROUND TRUTH (read-only):
- Extracted bundle: ${BUNDLE}/  (~1542 minified .js chunks + app-main-*.css).
  · App UI/logic lives in chunks named app-main-*, local-conversation-thread-*, app-server-*,
    agent-settings-*, composer-*, and other FEATURE-named chunks — gold standard for STRUCTURE/LOGIC/THRESHOLDS.
  · User-facing STRINGS / ICU message ids ALSO appear in per-locale chunks (am-, ar-, zh-CN-, ta-IN-, my-MM-, …);
    finding a string there confirms it is a real Codex string, but for BEHAVIOR confirm it in an app chunk too.
  · Resolved CSS values (px/rem/hex): use app-main-*.css (Tailwind utilities → concrete values).
  · Chunk hashes change between app versions — locate chunks with grep -rl, never assume a hash.
  · SKIP for speed: runtime.worker-*, workbook-*, c4Diagram/mermaid, giant language-pack chunks (unless a targeted search truly needs them).
- Generated protocol types: ${REPO}/packages/codex-protocol/src/generated/v2/* are generated FROM Codex's
  app-server protocol. A data shape backed by such a type (RateLimitSnapshot, HookMetadata, …) is GROUNDED at the
  data layer; the remaining question is whether the DISPLAY logic (labels, formats, thresholds, structure) matches the bundle.

WORKING TREE (what to audit), repo at ${REPO}:
- MODIFIED files: run \`git -C ${REPO} diff -- <file>\` and audit the ADDED/CHANGED (+) lines only.
- NEW files (untracked, marked NEW below): Read the whole file — all of it is new and must be justified.

METHOD, per SUBSTANTIVE change (a user-facing string, ICU id, constant/threshold, structural element, behavior/logic rule, or CSS value — skip pure whitespace/import/type noise):
1. State the CLAIM the change makes about Codex (what Codex thing it purports to match).
2. Note any in-code CODEX-REF/codex: comment or gap-matrix entry citing a durable token — but DO NOT trust it at face value.
3. GREP THE BUNDLE to CONFIRM that token/string/value/structure actually exists. Quote what you find (chunk filename + the literal text).
4. Assign verdict:
   · grounded — you FOUND matching bundle evidence (quote chunk + snippet).
   · invented — you searched and it is NOT in the bundle (list the EXACT greps you ran that came up empty). This is the user's main worry — hunt for these.
   · intentional_divergence — a CODEX-REF/doc says HiCodex deliberately differs from / extends Codex; has a rationale but is NOT a 1:1 bundle match. Flag it.
   · mechanical — refactor/rename/type-only/test-wiring with no Codex-alignment claim.
   · unverifiable — genuinely cannot determine (say why, and what you'd need).

RULES:
- A citation to a token that ISN'T in the bundle is itself INVENTED — verify the token exists; don't trust the comment.
- For behavior/structure claims, prefer confirming in an app/logic chunk over a locale chunk.
- Quote REAL bundle text for every grounded verdict; list REAL greps for every invented verdict. No speculation.
- Report the substantive changes for your unit (typically 3-12). severity = how consequential it is if the verdict turns out to be "invented".
`

const FINDINGS_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['unit', 'overall', 'changes'],
  properties: {
    unit: { type: 'string' },
    overall: { type: 'string', enum: ['all_grounded', 'mostly_grounded', 'mixed', 'has_invented'], description: 'unit-level summary verdict' },
    changes: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['claim', 'location', 'isNewFile', 'verdict', 'severity', 'evidence'],
        properties: {
          claim: { type: 'string', description: 'what Codex thing this change purports to match' },
          location: { type: 'string', description: 'hicodex file:line or file + symbol' },
          isNewFile: { type: 'boolean', description: 'true if this change is in an untracked NEW file' },
          verdict: { type: 'string', enum: ['grounded', 'invented', 'intentional_divergence', 'mechanical', 'unverifiable'] },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          evidence: { type: 'string', description: 'grounded: bundle chunk + quoted snippet. invented: the exact greps that came up empty. divergence: the CODEX-REF/doc rationale.' },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['finalVerdict', 'auditUpheld', 'confidence', 'reasoning'],
  properties: {
    finalVerdict: { type: 'string', enum: ['grounded', 'invented', 'intentional_divergence', 'mechanical', 'unverifiable'] },
    auditUpheld: { type: 'boolean', description: 'true if the auditor verdict stands after skeptical re-check' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    reasoning: { type: 'string', description: 'cite the counter-evidence you checked (the grep you ran, the chunk you read)' },
  },
}

// 17 units. NEW-feature units first (highest scrutiny — zero in-code citations), then modified surfaces.
const UNITS = [
  { key: 'rate-limit-quota', newFeature: true,
    label: 'Rate-limit / usage quota (composer banner + status panel)',
    files: 'NEW: components/composer-quota-banner.tsx, components/composer-status-panel.tsx, state/rate-limit-summary.ts; MODIFIED: state/account-state.ts, components/above-composer-panel.tsx',
    focus: 'RateLimitSnapshot/RateLimitWindow projection, "limit:" section label, remaining %/text, reset metadata + reset text formatting, primary/secondary windows, the heading + compact summary strings, where it renders above the composer' },
  { key: 'background-subagents', newFeature: true,
    label: 'Background subagents stack + stop-all traversal',
    files: 'NEW: components/background-subagents-stack.tsx, state/background-subagents-stop.ts; MODIFIED: state/background-agents.ts',
    focus: 'DEFAULT_MAX_STOP_THREADS=50 cap, BFS over receiver thread ids from thread snapshots, the stack UI strings/structure, what Codex calls "background" subagents + its stop affordance' },
  { key: 'thread-goal-banner', newFeature: true,
    label: 'Thread goal banner',
    files: 'NEW: components/thread-goal-banner.tsx; MODIFIED: state/user-message-content.ts, state/thread-item-fields.ts',
    focus: 'does Codex render a thread/turn "goal" banner at all? the banner strings, where the goal text comes from (user message content fields), conditional rendering' },
  { key: 'hooks-review', newFeature: true,
    label: 'Hooks trust review banner',
    files: 'NEW: state/hooks-review.ts; MODIFIED: components/hooks-review-banner.tsx',
    focus: 'HookMetadata.trustStatus "untrusted"/"modified" gating, HooksListResponse shape, per-cwd hook filtering, the banner copy + the "review hooks" action/settings-focus' },
  { key: 'open-file-watches', newFeature: true,
    label: 'Open-file watches (live file re-read)',
    files: 'NEW: state/open-file-watches.ts; MODIFIED: state/file-references.ts, components/workspace-files-panel.tsx, components/files-tab-content.tsx',
    focus: 'does Codex register file watches for open workspace-file tabs? watchId/hostId/watchPath derivation, the host_open_file_watch (or equivalent) command name, path-candidate resolution' },

  { key: 'approval-pending', newFeature: false,
    label: 'Approval / permission request stack',
    files: 'state/approval-requests.ts, components/pending-request-stack.tsx, state/pending-request-scope.ts, styles/pending-requests.css',
    focus: 'request title/body copy, command/patch preview, approve/deny/always option labels + order + tone, multi-request stacking/advance, scope grouping, the css values vs app-main' },
  { key: 'sidebar', newFeature: false,
    label: 'Sidebar (threads / projects / account)',
    files: 'components/sidebar.tsx',
    focus: 'new rows/sections, labels, hover/pin affordances, account/profile menu items, grouping/sort — each vs a bundle string or structure' },
  { key: 'right-rail-side-panel', newFeature: false,
    label: 'Right rail + side-panel tabs/host',
    files: 'components/right-rail.tsx, state/right-rail.ts, components/side-panel-host.tsx, components/side-panel-tab-bar.tsx, state/side-panel-tab-host.ts, styles/right-rail.css, styles/side-panel-host.css',
    focus: 'rail sections + caps, tab bar labels/order/icons, host routing, the css values, collapse/persist — vs bundle' },
  { key: 'message-render-groups', newFeature: false,
    label: 'Message unit + render groups',
    files: 'components/message-unit.tsx, state/render-group-types.ts, styles/message.css',
    focus: 'render-group types, per-message timestamp/action-row affordances, reasoning blocks, message css values — vs local-conversation-thread chunk + app-main css' },
  { key: 'plan-summary', newFeature: false,
    label: 'Plan summary card',
    files: 'components/plan-summary-card.tsx',
    focus: 'header titles, copy/copied labels + reset ms, collapsed fade height, "Expand plan" button style, download filename, aria — vs bundle defaultMessages' },
  { key: 'file-tree-preview', newFeature: false,
    label: 'File tree / preview / artifact / icons',
    files: 'components/file-tree.tsx, components/file-preview-panel.tsx, components/artifact-preview-panel.tsx, state/artifact-preview.ts, lib/file-icon-resolver.ts, lib/file-icon.tsx, styles/workspace-files.css',
    focus: 'icon mapping per extension, preview/expand controls, artifact cap + show-more, tree behavior — vs bundle' },
  { key: 'reducer-commands-slash', newFeature: false,
    label: 'Codex reducer + commands + slash workflow',
    files: 'state/codex-reducer.ts, state/commands.ts, state/slash-request-workflow.ts, state/composer-workflow.ts, state/project-conversation.ts',
    focus: 'new reducer cases / timeline item types, command list entries, slash request lifecycle, the protocol notification names these gate on — vs app-server chunk' },
  { key: 'chrome-view-context-cards', newFeature: false,
    label: 'Conversation chrome/view + context menu + end-resource cards',
    files: 'components/conversation-chrome.tsx, components/conversation-view.tsx, components/context-menu.tsx, components/assistant-end-resource-cards.tsx',
    focus: 'context-menu items/labels, chrome header affordances, end-of-turn resource cards layout/strings — vs bundle' },
  { key: 'unified-diff-backend', newFeature: false,
    label: 'Unified-diff failure dialog + git-apply backend',
    files: 'components/unified-diff-failure-dialog.tsx, apps/desktop/src-tauri/src/main.rs',
    focus: 'the 13 dialog strings + tone classes + 40vh cap, the host_apply_patch_action git apply / git apply --reverse behavior + non-git detection — vs bundle ICU ids (codex.unifiedDiff.*) and behavior' },
  { key: 'settings-i18n', newFeature: false,
    label: 'Settings panel loader + i18n',
    files: 'state/settings-panel-loader.ts, state/i18n.ts, styles/settings-command.css',
    focus: 'settings route/panel ids, i18n keys/locale wiring, command css values — vs bundle (note: i18n scaffold may be a HiCodex extension; flag divergence vs grounded)' },
  { key: 'css-value-sweep', newFeature: false,
    label: 'Base + composer CSS value sweep',
    files: 'styles/base.css, styles/composer.css',
    focus: 'each changed concrete value (px/rem/hex/radius/gap/font) — resolve the matching Tailwind utility in app-main-*.css and confirm the value matches; flag any value with no bundle source' },
  { key: 'gap-matrix-ledger', newFeature: false,
    label: 'Gap-matrix ledger honesty (the evidence doc itself)',
    files: 'docs/dev/codex-alignment-gap-matrix.md',
    focus: 'for the NEWLY-ADDED rows in the doc diff, take each cited "durable evidence" (ICU id / defaultMessage / constant / data-attr) and CONFIRM it actually exists in the bundle; a ledger row citing a non-existent token is an invented claim' },
]

phase('Audit')

const results = await pipeline(
  UNITS,
  (u) => agent(
    `${METHOD}\n\nYOUR UNIT: ${u.label}\nFiles: ${u.files}\nFocus: ${u.focus}\n` +
      (u.newFeature ? `\nNOTE: this is a NEW feature with ZERO in-code Codex citations — scrutinize hard. Either find solid bundle evidence that Codex has this exact feature/behavior, or mark it invented.\n` : '') +
      `\nProduce the provenance change-list for THIS unit only.`,
    { label: `audit:${u.key}`, phase: 'Audit', schema: FINDINGS_SCHEMA, agentType: 'Explore' },
  ),
  // As each unit's audit lands, skeptically re-verify the CONSEQUENTIAL verdicts.
  (audit, u) => {
    if (!audit || !Array.isArray(audit.changes) || audit.changes.length === 0) {
      return { unit: u.label, key: u.key, newFeature: !!u.newFeature, verified: [] }
    }
    const consequential = audit.changes.filter((c) =>
      c.verdict === 'invented' ||
      c.verdict === 'intentional_divergence' ||
      c.verdict === 'unverifiable' ||
      (c.verdict === 'grounded' && c.isNewFile && c.severity !== 'low'))
    const passthrough = audit.changes
      .filter((c) => !consequential.includes(c))
      .map((c) => ({ ...c, unit: u.label, key: u.key, finalVerdict: c.verdict, auditUpheld: true, confidence: 'medium', verifyReasoning: 'not separately re-verified (grounded, low-stakes)' }))
    if (consequential.length === 0) return { unit: u.label, key: u.key, newFeature: !!u.newFeature, verified: passthrough }
    return parallel(consequential.map((c) => () => {
      const aim = c.verdict === 'invented'
        ? 'The auditor says this is INVENTED (no bundle basis). Try HARD to PROVE THEM WRONG: search the bundle with several query variants (different chunk names, synonyms, ICU-id fragments, the constant value, locale chunks for strings). If you find solid evidence, overturn to grounded and quote it. Only uphold "invented" if your own searches also come up empty.'
        : c.verdict === 'grounded'
        ? 'The auditor says this NEW-file change is GROUNDED. Be skeptical: re-run the search and check the quoted snippet REALLY supports this exact claim (right feature, not an incidental substring / unrelated context / a mere translation string with no matching app logic). Overturn to invented or intentional_divergence if the evidence does not actually hold.'
        : c.verdict === 'intentional_divergence'
        ? 'The auditor calls this an INTENTIONAL DIVERGENCE. Confirm a real CODEX-REF/doc rationale exists (not just an unverified guess), and that it is genuinely NOT a 1:1 bundle match. If Codex actually does match, correct to grounded; if there is no documented rationale, correct to invented.'
        : 'The auditor marked this UNVERIFIABLE. Make a real attempt to resolve it to grounded or invented with concrete bundle searches; only keep unverifiable if it truly cannot be determined.'
      return agent(
        `Adversarially verify ONE provenance verdict on HiCodex vs the Codex Desktop bundle (${BUNDLE}/, repo ${REPO}).\n\n` +
          `Unit: ${u.label}\nClaim: ${c.claim}\nLocation: ${c.location}\nNew file: ${c.isNewFile}\nAuditor verdict: ${c.verdict} (severity ${c.severity})\nAuditor evidence: ${c.evidence}\n\n` +
          `${aim}\n\nRe-read the HiCodex source (incl. nearby CODEX-REF comments) AND grep the bundle yourself. Decide the final verdict.`,
        { label: `verify:${u.key}`, phase: 'Verify', schema: VERDICT_SCHEMA, agentType: 'Explore' },
      ).then((v) => ({
        ...c, unit: u.label, key: u.key,
        finalVerdict: (v && v.finalVerdict) || c.verdict,
        auditUpheld: v ? v.auditUpheld : true,
        confidence: (v && v.confidence) || 'low',
        verifyReasoning: (v && v.reasoning) || 'verify agent returned nothing',
      }))
    })).then((verified) => ({ unit: u.label, key: u.key, newFeature: !!u.newFeature, verified: passthrough.concat(verified.filter(Boolean)) }))
  },
)

// Synthesize across all units using the POST-VERIFY (final) verdicts.
const all = []
for (const r of results.filter(Boolean)) for (const c of (r.verified || [])) all.push(c)

const bucket = (v) => all.filter((c) => c.finalVerdict === v)
const invented = bucket('invented')
const divergence = bucket('intentional_divergence')
const unverifiable = bucket('unverifiable')
const grounded = bucket('grounded')
const mechanical = bucket('mechanical')

const sev = { high: 0, medium: 1, low: 2 }
invented.sort((a, b) => (sev[a.severity] ?? 3) - (sev[b.severity] ?? 3))
divergence.sort((a, b) => (sev[a.severity] ?? 3) - (sev[b.severity] ?? 3))

log(`Audited ${all.length} substantive changes — grounded ${grounded.length}, intentional-divergence ${divergence.length}, INVENTED ${invented.length}, unverifiable ${unverifiable.length}, mechanical ${mechanical.length}`)

const slim = (c) => ({ unit: c.unit, claim: c.claim, location: c.location, isNewFile: c.isNewFile, severity: c.severity, confidence: c.confidence, evidence: c.evidence, verifyReasoning: c.verifyReasoning })

return {
  headline: {
    totalChanges: all.length,
    grounded: grounded.length,
    intentionalDivergence: divergence.length,
    invented: invented.length,
    unverifiable: unverifiable.length,
    mechanical: mechanical.length,
    allGrounded: invented.length === 0 && unverifiable.length === 0,
  },
  byUnit: results.filter(Boolean).map((r) => ({
    unit: r.unit, key: r.key, newFeature: r.newFeature,
    total: (r.verified || []).length,
    grounded: (r.verified || []).filter((c) => c.finalVerdict === 'grounded').length,
    invented: (r.verified || []).filter((c) => c.finalVerdict === 'invented').length,
    divergence: (r.verified || []).filter((c) => c.finalVerdict === 'intentional_divergence').length,
    unverifiable: (r.verified || []).filter((c) => c.finalVerdict === 'unverifiable').length,
  })),
  invented: invented.map(slim),
  intentionalDivergence: divergence.map(slim),
  unverifiable: unverifiable.map(slim),
}
