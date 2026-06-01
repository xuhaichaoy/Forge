export const meta = {
  name: 'hicodex-dark-theme',
  description: 'Propose dark-theme overrides for transcript/rail/popup CSS that hardcodes light-only colors (the root of "theme 不起作用"), mapping each to HiCodex dark tokens; adversarially verify each proposal',
  phases: [
    { title: 'Propose', detail: 'one agent per gap CSS file' },
    { title: 'Verify', detail: 'adversarially confirm each proposed override is correct + conservative' },
  ],
}

// Read-only proposal workflow: agents do NOT edit files — they return a ready
// `[data-theme="dark"]` CSS block per file + a per-entry table. The parent reviews
// and applies. Light is never touched (overrides are dark-scoped).

const PALETTE = `
HiCodex's dark theme is driven by these tokens (defined in base.css :root + the
.hc-app[data-theme="dark"] block). Map each hardcoded LIGHT color to the token
whose ROLE matches, and emit the override using the token var (so it resolves to
the dark value automatically). Light values shown for matching; DARK is what
renders under [data-theme="dark"]:
  --hc-text-primary    light #202124    dark #ffffff              (body / emphasis / interactive text, near-black hexes: #202124 #27313d #4f5855 #38352f #2a2d2b #222823 #262b28 #171717 #2b2f2c …)
  --hc-text-strong     light #171717    dark #ffffff              (headings / strong)
  --hc-text-secondary  light #8a8b84    dark rgba(255,255,255,.70) (muted / meta / description grays: #6f716b #74776f #8a8d86 #7a7468 #7a7d76 #77786f #9a9488 #5f625d #666961 #4b4d48 …)
  --hc-text-accent     light #2d5562    dark #7aa9b8              (teal accent / links: #2d5562 #267348-ish)
  --hc-surface-hover   light rgba(34,38,43,.08)  dark rgba(255,255,255,.08)
  --hc-surface-soft    light rgba(34,38,43,.06)  dark rgba(255,255,255,.05)
  --hc-border-default  (dark) rgba(255,255,255,.08)               (hairline borders using dark-ink rgba)
`

const RULES = `
You are closing HiCodex's DARK-THEME gaps. HiCodex hardcodes many LIGHT-theme
colors (dark ink hexes / rgba(34,38,43,X)) with NO [data-theme="dark"] override,
so on a dark surface they are unreadable/invisible. Codex uses theme-aware tokens.

YOUR JOB for your assigned CSS file: find each rule whose color / background /
border-color is a hardcoded LIGHT-only value that would be WRONG on dark and has
NO existing dark override, and propose a dark override mapping it to the matching
HiCodex dark token (see palette).

STRICT CONSERVATISM (this is applied without per-pixel visual check, so only
high-confidence cases):
- INCLUDE: near-black / dark-gray TEXT or icon \`color\`; muted-gray text; hairline
  \`border-color\` using dark ink; subtle \`background\` using rgba(34,38,43,X) on
  elements shown in dark.
- EXCLUDE (do NOT propose): status/semantic colors that already work on dark
  (reds #b84645, greens #267348/#1a7f37, yellows, charts); pure #fff/#ffffff;
  anything that ALREADY has a \`.hc-app[data-theme="dark"]\` override for that
  selector+property (grep the file first); light-only elements (e.g. a print or
  light-locked context); gradients/shadows unless clearly broken; values you are
  not confident map to a single token role.
- Preserve LIGHT exactly — your output is ONLY \`.hc-app[data-theme="dark"] <selector> { <prop>: var(--hc-...); }\` rules. Never change the existing light rule.
- Reuse the EXACT selector from the light rule. If a light rule sets multiple
  themed properties (e.g. color + background), emit them together.
- Prefer the token var over a literal, so it stays consistent.

Output a single ready-to-append CSS block (with a short header comment) plus the
per-entry table. If the file has no high-confidence gaps, return an empty block.
`

const PROPOSAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['file', 'cssBlock', 'entries'],
  properties: {
    file: { type: 'string' },
    cssBlock: { type: 'string', description: 'ready-to-append CSS; only .hc-app[data-theme="dark"] rules; empty string if no gaps' },
    entries: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['selector', 'property', 'lightValue', 'darkToken', 'role', 'confidence'],
        properties: {
          selector: { type: 'string' },
          property: { type: 'string', enum: ['color', 'background', 'background-color', 'border-color', 'border-top-color', 'border-bottom-color', 'fill', 'stroke'] },
          lightValue: { type: 'string' },
          darkToken: { type: 'string', description: 'the var(--hc-...) used' },
          role: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['approvedCssBlock', 'rejectedCount', 'notes'],
  properties: {
    approvedCssBlock: { type: 'string', description: 'the cssBlock with any wrong/uncertain/duplicate overrides removed; empty if none survive' },
    rejectedCount: { type: 'number' },
    notes: { type: 'string', description: 'what was rejected and why (duplicates of existing dark rules, status colors, light-only, wrong role…)' },
  },
}

const FILES = [
  'message.css',
  'markdown.css',
  'settings-command.css',
  'pending-requests.css',
  'conversation.css',
  'automations.css',
]

phase('Propose')

const results = await pipeline(
  FILES,
  (file) => agent(
    `${RULES}\n${PALETTE}\nYOUR FILE: packages/ui/src/styles/${file}\nGrep it for existing \`data-theme="dark"\` rules FIRST so you never duplicate. Then produce the proposal.`,
    { label: `propose:${file}`, phase: 'Propose', schema: PROPOSAL_SCHEMA, agentType: 'Explore' },
  ),
  (proposal, file) => {
    if (!proposal || !proposal.cssBlock || !proposal.cssBlock.trim()) {
      return { file, approvedCssBlock: '', rejectedCount: 0, notes: 'no proposals' }
    }
    return agent(
      `Adversarially verify these proposed DARK-THEME overrides for packages/ui/src/styles/${file}. Be strict — REMOVE any override that: duplicates an existing \`.hc-app[data-theme="dark"]\` rule for the same selector+property (re-grep the file to check), targets a status/semantic color (red/green/yellow) that already works on dark, targets a light-only element, uses the wrong token role, or you are not confident about. Re-read the file + the light rule for each. Return the surviving CSS block (approvedCssBlock) verbatim-minus-rejects.\n\nProposed block:\n${proposal.cssBlock}\n\nEntries:\n${JSON.stringify(proposal.entries, null, 2)}`,
      { label: `verify:${file}`, phase: 'Verify', schema: VERDICT_SCHEMA, agentType: 'Explore' },
    ).then((v) => ({ file, approvedCssBlock: v.approvedCssBlock || '', rejectedCount: v.rejectedCount || 0, notes: v.notes || '', proposedEntries: proposal.entries.length }))
  },
)

const out = results.filter(Boolean)
const withBlocks = out.filter((r) => r.approvedCssBlock && r.approvedCssBlock.trim())
log(`Dark-theme proposals: ${withBlocks.length}/${FILES.length} files have approved overrides`)

return {
  files: out.map((r) => ({
    file: r.file,
    proposedEntries: r.proposedEntries || 0,
    rejectedCount: r.rejectedCount,
    hasApproved: !!(r.approvedCssBlock && r.approvedCssBlock.trim()),
    notes: r.notes,
  })),
  approvedBlocks: withBlocks.map((r) => ({ file: r.file, cssBlock: r.approvedCssBlock })),
}
