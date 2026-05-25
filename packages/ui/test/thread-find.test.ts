import {
  clampThreadFindIndex,
  findThreadFindMatches,
  isSearchableThreadFindTextNodeParent,
  nextThreadFindIndex,
  normalizedThreadFindQuery,
} from "../src/state/thread-find";

export default function runThreadFindTests(): void {
  matchesRenderedUnitsCaseInsensitively();
  keepsNavigationBoundedAndWrapping();
  ignoresBlankQueries();
  rejectsTextNodesUnderDataThreadFindSkip();
  rejectsTextNodesUnderLiveFormControls();
  rejectsTextNodesInsideExistingHighlightMark();
  acceptsTextNodesUnderRegularConversationContainers();
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

/*
 * The walker filter in `collectSearchableTextNodes` is the only enforcement
 * point for HiCodex's `data-thread-find-skip` contract (DEVELOPMENT.md §13).
 * Codex Desktop's `local-conversation-thread-CecHj6JI.js` sets the attribute
 * on subtrees the find bar must never traverse (composer drafts, pending
 * request scaffolding). HiCodex previously declared the attribute but didn't
 * enforce it, so these tests pin the contract with mock parents.
 */
type MockSelectorMatcher = (selector: string) => boolean;

function mockSearchableParent(
  tagName: string,
  options: { matches?: MockSelectorMatcher } = {},
): HTMLElement {
  const matches = options.matches ?? (() => false);
  return {
    tagName,
    closest(selector: string): HTMLElement | null {
      return matches(selector) ? ({ tagName } as unknown as HTMLElement) : null;
    },
  } as unknown as HTMLElement;
}

function rejectsTextNodesUnderDataThreadFindSkip(): void {
  const parent = mockSearchableParent("DIV", {
    matches: (selector) => selector === "[data-thread-find-skip]",
  });
  assertEqual(
    isSearchableThreadFindTextNodeParent(parent),
    false,
    "[data-thread-find-skip] subtree must be excluded from the find walker",
  );
}

function rejectsTextNodesUnderLiveFormControls(): void {
  const parent = mockSearchableParent("DIV", {
    matches: (selector) => selector.startsWith("button, input, textarea"),
  });
  assertEqual(
    isSearchableThreadFindTextNodeParent(parent),
    false,
    "live form controls keep their pre-existing exclusion behavior",
  );
}

function rejectsTextNodesInsideExistingHighlightMark(): void {
  const parent = mockSearchableParent("MARK", {
    matches: (selector) => selector === "mark.hc-thread-find-mark",
  });
  assertEqual(
    isSearchableThreadFindTextNodeParent(parent),
    false,
    "existing highlight marks must not be re-walked when re-running find",
  );
}

function acceptsTextNodesUnderRegularConversationContainers(): void {
  const parent = mockSearchableParent("DIV");
  assertEqual(
    isSearchableThreadFindTextNodeParent(parent),
    true,
    "plain conversation containers stay searchable so user/assistant text is matched",
  );
  const scriptParent = mockSearchableParent("SCRIPT");
  assertEqual(
    isSearchableThreadFindTextNodeParent(scriptParent),
    false,
    "non-content tag names (script/style/noscript) keep their exclusion",
  );
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
