export const meta = {
  name: 'hicodex-align-audit',
  description: 'Audit HiCodex transcript + right-side popups vs the Codex Desktop bundle for remaining evidence-backed gaps, then adversarially verify each finding',
  phases: [
    { title: 'Audit', detail: 'one agent per surface, compare vs bundle' },
    { title: 'Verify', detail: 'adversarially confirm each finding is a real, evidence-backed gap' },
  ],
}

// Read-only audit: agents compare HiCodex's current implementation against the
// extracted Codex Desktop bundle and report ONLY genuine remaining divergences
// (not already-documented-intentional ones). No file mutation → no worktree.

const BUNDLE = '/private/tmp/codex-asar/webview/assets'
const THREAD_CHUNK = `${BUNDLE}/local-conversation-thread-DAwsPWah.js`
const APP_CSS = `${BUNDLE}/app-main-DGDTSRlh.css`

const METHOD = `
You are doing a STYLE/STRUCTURE/BEHAVIOR contract audit of HiCodex (a clean-room
re-implementation) against the real Codex Desktop bundle. Ground truth = the bundle.

Bundle (minified, single-line) evidence files:
- Transcript/popup logic + className strings: ${THREAD_CHUNK}
- Resolved Tailwind utilities → concrete px/rem/hex: ${APP_CSS}

METHOD:
1. Read the HiCodex source + its CSS for your surface.
2. grep the bundle chunk for the matching React structure / className strings / logic.
3. Resolve the bundle's Tailwind classes to concrete values via the app-main CSS
   (e.g. find ".px-2{padding-left:.5rem...}" → 8px) and compare to HiCodex's CSS.
4. Compare: element structure/order, spacing/padding/gap, font-size/weight, colors
   (must be theme tokens, check dark too), icon sizes, hover/focus/active states,
   empty/loading/in-progress states, truncation, conditional rendering.

CRITICAL RULES:
- HiCodex already has EXTENSIVE alignment with "CODEX-REF:" / "codex:" comments that
  document INTENTIONAL choices and prior decisions. Before reporting a gap, grep for a
  nearby CODEX-REF/codex comment — if it already documents this exact thing as
  intentional or already-matching, DO NOT report it.
- Report ONLY concrete divergences you can back with BOTH a HiCodex file:line AND a
  bundle evidence snippet (the className/value/logic you found in the chunk or CSS).
- NO speculation. If you cannot find bundle evidence, do not report it.
- Quality over quantity: 0-5 of the HIGHEST-value real gaps. An empty list is a valid,
  good answer if the surface is already aligned.
- Mark needsVisualConfirm=true when the gap is a pixel/color nuance that only a human
  looking at both apps can truly confirm (vs a clear structural/logic divergence).
`

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['surface', 'findings'],
  properties: {
    surface: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'category', 'severity', 'hicodex', 'codexEvidence', 'recommendation', 'needsVisualConfirm'],
        properties: {
          title: { type: 'string', description: 'one-line gap summary' },
          category: { type: 'string', enum: ['spacing', 'color', 'layout', 'structure', 'typography', 'icon', 'state', 'behavior'] },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          hicodex: { type: 'string', description: 'HiCodex file:line + the current value/structure' },
          codexEvidence: { type: 'string', description: 'bundle file + the className/resolved-value/logic snippet proving Codex differs' },
          recommendation: { type: 'string', description: 'the concrete change to make' },
          needsVisualConfirm: { type: 'boolean' },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['isRealGap', 'confidence', 'reasoning'],
  properties: {
    isRealGap: { type: 'boolean', description: 'true only if this is a genuine remaining divergence with solid bundle evidence and NOT already handled by a CODEX-REF comment' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    reasoning: { type: 'string', description: 'why real or not — cite the counter-evidence you checked' },
  },
}

const SURFACES = [
  {
    key: 'composer',
    label: 'Composer input + footer chips',
    files: 'packages/ui/src/components/composer-external-footer.tsx + packages/ui/src/styles/composer.css (+ composer.tsx if present)',
    focus: 'input padding/min-height, footer model/reasoning/permission chips (size/radius/gap/blur), send + attachment buttons, placeholder, in-bubble settings chip row',
  },
  {
    key: 'markdown-code',
    label: 'Markdown + code block rendering (intermediate output)',
    files: 'packages/ui/src/styles/markdown.css + the markdown/code renderer components',
    focus: 'code block container (radius/padding/bg/header), copy button, inline code, tables, lists, blockquote, links, heading sizes/weights, paragraph spacing',
  },
  {
    key: 'end-resource-cards',
    label: 'Assistant end-of-turn resource cards',
    files: 'packages/ui/src/components/assistant-end-resource-cards.tsx + rail-cards / end-resource CSS',
    focus: 'card layout/padding/radius, icon, title/subtitle, hover state, file vs image vs dir cards, grid/stack spacing',
  },
  {
    key: 'command-panel-dropdown',
    label: 'Command panel / slash dropdown (右侧/浮层)',
    files: 'packages/ui/src/components/command-panel.tsx + packages/ui/src/styles/settings-command.css (command parts)',
    focus: 'popover container radius/shadow/width, entry row height/padding, group headings, icons, selected/hover state, status/empty states, scroll',
  },
  {
    key: 'settings-content',
    label: 'Settings content panels (right-side settings popup body)',
    files: 'packages/ui/src/components/model-settings-panel.tsx (content area, NOT nav) + settings CSS',
    focus: 'content header, section spacing, form rows/labels/inputs, toggles, the route-placeholder shell, scroll, refresh button',
  },
  {
    key: 'reasoning-stream',
    label: 'Reasoning output stream (intermediate model output)',
    files: 'packages/ui/src/components/message-unit.tsx (reasoning blocks) + message.css',
    focus: 'reasoning section header/toggle, streaming text style/color/size, collapsed vs expanded, spacing vs answer body, in-progress shimmer/caret',
  },
  {
    key: 'approval-flow',
    label: 'Approval / permission request flow (右侧弹窗)',
    files: 'packages/ui/src/state/approval-requests.ts + packages/ui/src/components/pending-request-stack.tsx',
    focus: 'request title/body, command/patch preview, approve/deny/always buttons (label/order/tone), option list, keyboard hints, multi-request stacking',
  },
]

phase('Audit')

const results = await pipeline(
  SURFACES,
  (surface) => agent(
    `${METHOD}\n\nYOUR SURFACE: ${surface.label}\nHiCodex files: ${surface.files}\nFocus areas: ${surface.focus}\n\nProduce the findings list for this surface only.`,
    { label: `audit:${surface.key}`, phase: 'Audit', schema: FINDINGS_SCHEMA, agentType: 'Explore' },
  ),
  // For each surface's findings, adversarially verify each finding as it completes.
  (audit, surface) => {
    if (!audit || !audit.findings || audit.findings.length === 0) return { surface: surface.label, confirmed: [] }
    return parallel(audit.findings.map((f) => () =>
      agent(
        `Adversarially verify this claimed HiCodex-vs-Codex alignment gap. Be skeptical — default to NOT a real gap unless the evidence is solid and it is not already handled.\n\n` +
        `Surface: ${surface.label}\nClaim: ${f.title}\nCategory: ${f.category}\nHiCodex: ${f.hicodex}\nCodex evidence cited: ${f.codexEvidence}\nRecommendation: ${f.recommendation}\n\n` +
        `Re-read BOTH the HiCodex source (incl. any nearby CODEX-REF/codex comment that might already document this as intentional) AND the bundle evidence at ${THREAD_CHUNK} / ${APP_CSS}. ` +
        `Decide if this is a genuine remaining divergence worth fixing.`,
        { label: `verify:${surface.key}`, phase: 'Verify', schema: VERDICT_SCHEMA, agentType: 'Explore' },
      ).then((v) => ({ ...f, surface: surface.label, verdict: v }))
    )).then((verified) => ({ surface: surface.label, confirmed: verified.filter(Boolean) }))
  },
)

// Synthesize: keep only findings the verifier confirmed as real.
const confirmed = []
for (const r of results.filter(Boolean)) {
  for (const f of (r.confirmed || [])) {
    if (f.verdict && f.verdict.isRealGap) confirmed.push(f)
  }
}

const order = { high: 0, medium: 1, low: 2 }
confirmed.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3))

log(`Confirmed ${confirmed.length} real gaps across ${SURFACES.length} surfaces`)

return {
  confirmedGapCount: confirmed.length,
  bySurface: results.filter(Boolean).map((r) => ({
    surface: r.surface,
    confirmed: (r.confirmed || []).filter((f) => f.verdict && f.verdict.isRealGap).length,
    total: (r.confirmed || []).length,
  })),
  gaps: confirmed.map((f) => ({
    surface: f.surface,
    title: f.title,
    category: f.category,
    severity: f.severity,
    confidence: f.verdict.confidence,
    needsVisualConfirm: f.needsVisualConfirm,
    hicodex: f.hicodex,
    codexEvidence: f.codexEvidence,
    recommendation: f.recommendation,
    verifyReasoning: f.verdict.reasoning,
  })),
}
