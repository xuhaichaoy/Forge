import {
  clampThreadFindIndex,
  findThreadFindMatches,
  nextThreadFindIndex,
  normalizedThreadFindQuery,
} from "../src/state/thread-find";

export default function runThreadFindTests(): void {
  matchesRenderedUnitsCaseInsensitively();
  keepsNavigationBoundedAndWrapping();
  ignoresBlankQueries();
}

function matchesRenderedUnitsCaseInsensitively(): void {
  const matches = findThreadFindMatches([
    { unitKey: "user:1", text: "Build the inline find bar." },
    { unitKey: "assistant:1", text: "Find should jump to the current find result." },
  ], "find");

  assertEqual(matches.length, 3, "all rendered unit matches should be counted");
  assertEqual(matches[0]?.unitKey, "user:1", "first match should keep its unit key");
  assertEqual(matches[1]?.unitKey, "assistant:1", "second match should keep its unit key");
  assertEqual(matches[2]?.matchIndex, 1, "unit-local match index should increment");
  assertEqual(matches[1]?.start, 0, "case-insensitive matching should preserve source offsets");
}

function keepsNavigationBoundedAndWrapping(): void {
  assertEqual(nextThreadFindIndex(0, 3, 1), 1, "next should advance");
  assertEqual(nextThreadFindIndex(2, 3, 1), 0, "next should wrap");
  assertEqual(nextThreadFindIndex(0, 3, -1), 2, "previous should wrap");
  assertEqual(nextThreadFindIndex(8, 0, 1), 0, "empty navigation should stay at zero");
  assertEqual(clampThreadFindIndex(4, 3), 2, "clamp should keep the current index in range");
  assertEqual(clampThreadFindIndex(-1, 3), 0, "clamp should normalize negative indexes");
}

function ignoresBlankQueries(): void {
  assertEqual(normalizedThreadFindQuery("  needle  "), "needle", "query should be trimmed");
  assertEqual(findThreadFindMatches([{ unitKey: "a", text: "needle" }], "   ").length, 0, "blank query should not match");
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
