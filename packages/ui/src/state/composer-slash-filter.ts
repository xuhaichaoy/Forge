export type SlashCommandFilterItem = {
  id: string;
  title: string;
  aliases?: string[];
  description?: string;
};

export function filterSlashCommandList<T extends SlashCommandFilterItem>(
  query: string,
  commands: T[],
): T[] {
  const normalized = normalizeSlashQuery(query);
  // NOTE (parity): codex sorts the no-query slash list by [group, title]
  // (local-remote-selection `sortBy(e,[e=>e.group ?? "", e=>e.title])`). HiCodex
  // keeps declaration order here; the slash command set itself still differs.
  if (!normalized) return commands;
  /*
   * codex: slash-command-item-*.js - Codex Desktop ranks slash matches
   * via a shared `score-query-match` scorer. Plain substring filtering misses
   * typos / split-token queries and returns results in arbitrary registration
   * order. We mirror Codex's behavior with a weighted scorer: exact id >
   * prefix > substring > subsequence (fuzzy).
   */
  const scored: Array<{ command: T; score: number; index: number }> = [];
  for (let index = 0; index < commands.length; index++) {
    const command = commands[index]!;
    const score = scoreSlashCommandMatch(normalized, command);
    if (score > 0) scored.push({ command, score, index });
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  });
  return scored.map((entry) => entry.command);
}

function normalizeSlashQuery(query: string): string {
  return query.trim().replace(/^\/+/, "").toLowerCase();
}

/*
 * codex: slash-command-item-*.js - per-field score with weights.
 * Returns 0 when no haystack field has any match. Field weights mirror Codex's
 * priority: id > title > alias > description.
 */
function scoreSlashCommandMatch(needle: string, command: SlashCommandFilterItem): number {
  const fields: Array<{ value: string; weight: number }> = [
    { value: command.id, weight: 3 },
    { value: command.title, weight: 2.5 },
    ...((command.aliases ?? []).map((alias) => ({ value: alias, weight: 2 }))),
    { value: command.description ?? "", weight: 1 },
  ];
  let best = 0;
  for (const { value, weight } of fields) {
    if (!value) continue;
    const fieldScore = scoreFuzzyField(needle, value) * weight;
    if (fieldScore > best) best = fieldScore;
  }
  return best;
}

/*
 * codex: `score-query-match` style ranker.
 *
 * Tiers (higher is better):
 *   exact equality          : 1000
 *   prefix match            : 800 - (haystack.length - needle.length)
 *   substring match         : 500 - matchIndex
 *   subsequence (fuzzy) hit : 200 - totalGap, clamped to [50, ...]
 * Returns 0 when the needle is not even a subsequence of haystack.
 */
function scoreFuzzyField(needle: string, haystack: string): number {
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  if (h === n) return 1000;
  if (h.startsWith(n)) return 800 - Math.max(0, h.length - n.length);
  const idx = h.indexOf(n);
  if (idx >= 0) return 500 - idx;
  // Subsequence: scan needle chars left-to-right; bail when a char is missing.
  let hi = 0;
  let gaps = 0;
  for (let i = 0; i < n.length; i++) {
    const c = n.charCodeAt(i);
    let found = -1;
    while (hi < h.length) {
      if (h.charCodeAt(hi) === c) {
        found = hi;
        hi++;
        break;
      }
      hi++;
    }
    if (found < 0) return 0;
    gaps += found - (i === 0 ? found : hi - 1);
  }
  return Math.max(50, 200 - gaps);
}
