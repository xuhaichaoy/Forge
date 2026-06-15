import {
  clampThreadFindIndex,
  collectThreadFindUnitsFromConversation,
  currentDomThreadFindMatchId,
  findThreadFindMatches,
  isSearchableThreadFindTextNodeParent,
  nextThreadFindIndex,
  normalizedThreadFindQuery,
} from "../src/state/thread-find";
import type { ConversationRenderUnit } from "../src/state/render-group-types";

export default function runThreadFindTests(): void {
  matchesRenderedUnitsCaseInsensitively();
  keepsNavigationBoundedAndWrapping();
  ignoresBlankQueries();
  collectsSearchableUnitsFromConversationState();
  correlatesCurrentDomMatchByUnitKeyAndIndex();
  rejectsTextNodesUnderDataThreadFindSkip();
  rejectsTextNodesUnderLiveFormControls();
  rejectsTextNodesInsideExistingHighlightMark();
  acceptsTextNodesUnderRegularConversationContainers();
}

/*
 * ⌘F matches are computed from conversation state because the turn list is
 * virtualized — these tests pin which units contribute searchable text so a
 * long conversation stays fully searchable without being mounted.
 */
function collectsSearchableUnitsFromConversationState(): void {
  const units: ConversationRenderUnit[] = [
    {
      kind: "message",
      key: "user:1",
      role: "user",
      item: { id: "u1", type: "userMessage" },
      text: "raw fallback",
      userContent: [
        { kind: "text", text: "Find the config", textElements: [] },
        { kind: "chip", chipKind: "file", label: "settings.json", path: "/tmp/settings.json" },
        { kind: "image", source: "local", src: "x", label: "screenshot.png" },
      ],
    },
    {
      kind: "message",
      key: "assistant:1",
      role: "assistant",
      item: { id: "a1", type: "agentMessage" },
      text: "The config lives in settings.json",
      assistantAfter: [
        { kind: "assistantAfterEvent", key: "after:1", item: { id: "e1", type: "event" }, label: "Patched", text: "config updated" },
        { kind: "assistantEndResources", key: "after:2", resources: [{ type: "file", path: "/repo/config.ts" }], cwd: null, turnId: null },
      ],
    },
    {
      kind: "toolActivity",
      key: "activity:1",
      items: [],
      summary: {
        groupType: "exploration",
        icon: "search",
        label: "Explored",
        activeDetail: "src/state",
        details: ["Read config.ts"],
        inProgress: false,
        totalDurationMs: null,
        counts: {
          commands: 0, webSearchCommands: 0, runningWebSearchCommands: 0,
          runningFolderCreationCommands: 0, exploredFiles: 1, searches: 0, lists: 0,
          fileChanges: 0, createdFiles: 0, editedFiles: 0, deletedFiles: 0,
          mcpCalls: 0, dynamicCalls: 0, webSearches: 0, reasoning: 0, plans: 0, other: 0,
        },
      },
    },
    { kind: "generatedImageGallery", key: "gallery:1", images: [], hasPending: false, turnId: null },
    { kind: "threadItem", key: "item:1", item: { id: "t1", type: "plan", text: "Step one: find usages" } },
  ];

  const collected = collectThreadFindUnitsFromConversation(units);
  const byKey = new Map(collected.map((unit) => [unit.unitKey, unit.text]));

  assertEqual(byKey.has("user:1"), true, "user message should be searchable from state");
  assertEqual(byKey.get("user:1")?.includes("Find the config"), true, "user text parts should contribute");
  assertEqual(byKey.get("user:1")?.includes("settings.json"), true, "chip labels should contribute");
  assertEqual(byKey.get("user:1")?.includes("raw fallback"), false, "userContent should replace the raw text fallback");
  assertEqual(byKey.has("assistant:1"), true, "assistant message should be searchable");
  assertEqual(byKey.has("after:1"), true, "assistantAfter event sub-units should be searchable under their own key");
  assertEqual(byKey.get("after:2"), "/repo/config.ts", "end-resource paths should be searchable");
  assertEqual(byKey.get("activity:1")?.includes("Explored"), true, "tool activity label should contribute");
  assertEqual(byKey.get("activity:1")?.includes("Read config.ts"), true, "tool activity details should contribute");
  assertEqual(byKey.has("gallery:1"), false, "image galleries carry no searchable text");
  assertEqual(byKey.get("item:1")?.includes("Step one"), true, "thread items should expose best-effort text");

  const matches = findThreadFindMatches(collected, "config");
  assertEqual(matches.length >= 4, true, "state matches should span units regardless of what is mounted");
}

function correlatesCurrentDomMatchByUnitKeyAndIndex(): void {
  const domMatches = findThreadFindMatches([
    { unitKey: "user:1", text: "config config" },
    { unitKey: "assistant:1", text: "config" },
  ], "config");

  assertEqual(
    currentDomThreadFindMatchId(domMatches, { unitKey: "user:1", matchIndex: 1 }),
    domMatches[1]?.id ?? null,
    "exact (unitKey, matchIndex) should resolve to the DOM match id",
  );
  assertEqual(
    currentDomThreadFindMatchId(domMatches, { unitKey: "user:1", matchIndex: 9 }),
    domMatches[1]?.id ?? null,
    "an out-of-range state index should clamp to the unit's last DOM match",
  );
  assertEqual(
    currentDomThreadFindMatchId(domMatches, { unitKey: "missing", matchIndex: 0 }),
    null,
    "an unmounted unit has no DOM match id",
  );
  assertEqual(currentDomThreadFindMatchId(domMatches, null), null, "no current state match means no current mark");
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
 * point for Forge's `data-thread-find-skip` contract (DEVELOPMENT.md §13).
 * Codex Desktop's `local-conversation-thread-CecHj6JI.js` sets the attribute
 * on subtrees the find bar must never traverse (composer drafts, pending
 * request scaffolding). Forge previously declared the attribute but didn't
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
