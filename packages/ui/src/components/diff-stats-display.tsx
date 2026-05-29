// CODEX-REF: diff-unified-*.js — the diff stats renderer.
// Codex Desktop renders +N -N diff stats as two `shrink-0 leading-none` spans inside an
// `inline-flex items-center gap-1 leading-none align-middle disambiguated-digits tabular-nums
// tracking-tight` wrapper. The added span uses
// `text-token-git-decoration-added-resource-foreground` and the removed span uses
// `text-token-git-decoration-deleted-resource-foreground`. Each number is run through
// `intl.formatNumber` so it picks up thousands separators automatically.
export interface DiffStatsDisplayProps {
  linesAdded: number;
  linesRemoved: number;
  className?: string;
}

export function DiffStatsDisplay({
  linesAdded,
  linesRemoved,
  className,
}: DiffStatsDisplayProps) {
  const classes = ["hc-diff-stats", className].filter(Boolean).join(" ");
  return (
    <span className={classes}>
      <span className="hc-diff-stats-added">+{formatCount(linesAdded)}</span>
      <span className="hc-diff-stats-removed">-{formatCount(linesRemoved)}</span>
    </span>
  );
}

function formatCount(value: number): string {
  // CODEX-REF: diff-unified-*.js — Codex uses intl.formatNumber which yields locale
  // thousands separators. `toLocaleString` mirrors that behaviour for the active locale.
  if (!Number.isFinite(value) || value < 0) return "0";
  return Math.trunc(value).toLocaleString();
}
