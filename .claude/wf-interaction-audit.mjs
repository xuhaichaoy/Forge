export const meta = {
  name: 'hicodex-interaction-audit',
  description: 'Audit HiCodex INTERACTION/behavior (keyboard, focus, hover-reveal, scroll, disclosure, dismiss) vs the Codex bundle logic — not visual; then adversarially verify each finding',
  phases: [
    { title: 'Audit', detail: 'one agent per interaction surface' },
    { title: 'Verify', detail: 'adversarially confirm each behavioral gap is real + evidence-backed' },
  ],
}

const BUNDLE = '/private/tmp/codex-asar/webview/assets'
const THREAD = `${BUNDLE}/local-conversation-thread-DAwsPWah.js`

const RULES = `
You audit BEHAVIOR/INTERACTION (NOT colors/spacing — that dimension is already done).
Compare HiCodex's interaction LOGIC for your surface against the Codex Desktop bundle's
logic, and report concrete BEHAVIORAL divergences ONLY, each backed by BOTH a HiCodex
file:line AND a bundle evidence snippet.

Evidence:
- Codex transcript/popup logic (minified, but identifiers + string literals survive):
  ${THREAD} and other assets/*.js chunks (grep by handler name, event, aria, key).
- HiCodex source: packages/ui/src/components/*.tsx + packages/ui/src/state/*.ts.

Behaviors to compare (whichever apply to your surface):
- keyboard: which keys do what (Esc/Enter/Cmd+Enter/Arrow/Tab), preventDefault, focus traps
- focus management: autoFocus, focus-on-open, focus-restore-on-close, roving tabindex
- hover/focus reveal: what appears on hover vs focus-visible, which region scopes it
- dismiss: outside-click / Esc / which closes what; backdrop behavior
- scroll: auto-scroll-to-bottom, stick-to-bottom, scroll-to-bottom button thresholds
- disclosure: expand/collapse triggers, default-open logic, what persists
- click targets: overlay buttons, stop-propagation, single vs double action
- streaming/in-progress: what updates live, debounce/throttle

RULES:
- Report ONLY genuine behavioral divergences with bundle evidence. NO visual/CSS findings.
- HiCodex has extensive CODEX-REF/codex comments documenting intentional behavior — grep for
  one near your finding; if it already documents this as intentional/matching, DON'T report it.
- If you can't find bundle evidence for the behavior, don't report it.
- 0-4 of the HIGHEST-confidence real behavioral gaps. Empty list is a valid good answer.
`

const FINDINGS_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['surface', 'findings'],
  properties: {
    surface: { type: 'string' },
    findings: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['title', 'category', 'hicodex', 'codexEvidence', 'recommendation'],
      properties: {
        title: { type: 'string' },
        category: { type: 'string', enum: ['keyboard', 'focus', 'hover-reveal', 'dismiss', 'scroll', 'disclosure', 'click', 'streaming'] },
        hicodex: { type: 'string' },
        codexEvidence: { type: 'string' },
        recommendation: { type: 'string' },
      },
    } },
  },
}
const VERDICT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['isRealGap', 'confidence', 'reasoning'],
  properties: {
    isRealGap: { type: 'boolean' }, confidence: { type: 'string', enum: ['high', 'medium', 'low'] }, reasoning: { type: 'string' },
  },
}

const SURFACES = [
  { key: 'right-rail', label: 'Right rail interactions', files: 'right-rail.tsx + hooks/use-section-collapse.ts', focus: 'section collapse/expand triggers + persistence, row click→open, status-footer menu open/dismiss (Esc/outside-click), environment selector, keyboard on rows' },
  { key: 'settings', label: 'Settings panel interactions', files: 'model-settings-panel.tsx', focus: 'nav selection (click/keyboard), refresh button, form input commit (blur/Enter/Esc), toggle/segmented control keyboard, scroll' },
  { key: 'sidebar', label: 'Sidebar interactions', files: 'sidebar.tsx', focus: 'thread row click/hover/pin, account/profile menu open + dismiss (Esc/outside-click), project search, keyboard nav, rename' },
  { key: 'preview-lightbox', label: 'File preview + image lightbox interactions', files: 'file-preview-panel.tsx, image-preview-lightbox.tsx', focus: 'expand/restore toggle, external open, close, lightbox prev/next nav + keyboard (Arrow/Esc) + zoom, focus trap' },
  { key: 'approval-popup', label: 'Approval / permission request interactions', files: 'pending-request-stack.tsx + state/approval-requests.ts', focus: 'approve/deny keyboard (Enter/Esc/shortcut), option selection, multi-request stacking/advance, autofocus, button order' },
]

phase('Audit')
const results = await pipeline(
  SURFACES,
  (s) => agent(`${RULES}\n\nYOUR SURFACE: ${s.label}\nHiCodex files: ${s.files}\nFocus: ${s.focus}`,
    { label: `audit:${s.key}`, phase: 'Audit', schema: FINDINGS_SCHEMA, agentType: 'Explore' }),
  (audit, s) => {
    if (!audit || !audit.findings || !audit.findings.length) return { surface: s.label, confirmed: [] }
    return parallel(audit.findings.map((f) => () =>
      agent(`Adversarially verify this claimed HiCodex-vs-Codex BEHAVIORAL gap. Be skeptical; default to NOT-a-gap unless evidence is solid and not already handled by a CODEX-REF comment.\nSurface: ${s.label}\nClaim: ${f.title}\nCategory: ${f.category}\nHiCodex: ${f.hicodex}\nCodex evidence: ${f.codexEvidence}\nRecommendation: ${f.recommendation}\nRe-read both sides (incl. nearby CODEX-REF comments + the bundle at ${THREAD}).`,
        { label: `verify:${s.key}`, phase: 'Verify', schema: VERDICT_SCHEMA, agentType: 'Explore' })
        .then((v) => ({ ...f, surface: s.label, verdict: v }))
    )).then((vs) => ({ surface: s.label, confirmed: vs.filter(Boolean) }))
  },
)

const confirmed = []
for (const r of results.filter(Boolean)) for (const f of (r.confirmed || [])) if (f.verdict && f.verdict.isRealGap) confirmed.push(f)
log(`Confirmed ${confirmed.length} real behavioral gaps`)
return {
  confirmedGapCount: confirmed.length,
  bySurface: results.filter(Boolean).map((r) => ({ surface: r.surface, confirmed: (r.confirmed || []).filter((f) => f.verdict && f.verdict.isRealGap).length, total: (r.confirmed || []).length })),
  gaps: confirmed.map((f) => ({ surface: f.surface, title: f.title, category: f.category, confidence: f.verdict.confidence, hicodex: f.hicodex, codexEvidence: f.codexEvidence, recommendation: f.recommendation, verifyReasoning: f.verdict.reasoning })),
}
