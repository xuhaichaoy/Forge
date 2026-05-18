import {
  projectDiffViewer,
  sideBySideDiffRows,
} from "../src/state/diff-viewer";

export default function runDiffViewerTests(): void {
  parsesUnifiedDiffForHunkNavigation();
  pairsRemoveAddBlocksForSideBySideRows();
  parsesQuotedDiffPaths();
}

function parsesUnifiedDiffForHunkNavigation(): void {
  const diff = [
    "diff --git a/src/app.ts b/src/app.ts",
    "index 111..222 100644",
    "--- a/src/app.ts",
    "+++ b/src/app.ts",
    "@@ -1,3 +1,4 @@ function main",
    " keep",
    "-old",
    "+new",
    "+extra",
    "@@ -20,2 +21,2 @@ tail",
    "-left",
    "+right",
  ].join("\n");

  const model = projectDiffViewer(diff);
  assertEqual(model.files.length, 1, "diff viewer should expose one changed file");
  assertEqual(model.linesAdded, 3, "diff viewer should count additions");
  assertEqual(model.linesRemoved, 2, "diff viewer should count removals");
  assertEqual(model.hunkNav.length, 2, "diff viewer should expose hunk navigation");
  assertEqual(model.hunkNav[0]?.label, "app.ts:1", "first hunk label should use file basename and new start");
  assertEqual(model.hunkNav[1]?.label, "app.ts:21 #2", "second hunk label should include ordinal");
}

function pairsRemoveAddBlocksForSideBySideRows(): void {
  const model = projectDiffViewer([
    "--- a/src/app.ts",
    "+++ b/src/app.ts",
    "@@ -4,3 +4,3 @@",
    " keep",
    "-old a",
    "-old b",
    "+new a",
    " tail",
  ].join("\n"));

  const rows = sideBySideDiffRows(model.files[0].hunks[0]);
  assertDeepEqual(
    rows.map((row) => ({
      kind: row.kind,
      oldLineNumber: row.oldLineNumber ?? null,
      newLineNumber: row.newLineNumber ?? null,
      oldText: row.oldText,
      newText: row.newText,
    })),
    [
      { kind: "context", oldLineNumber: 4, newLineNumber: 4, oldText: "keep", newText: "keep" },
      { kind: "change", oldLineNumber: 5, newLineNumber: 5, oldText: "old a", newText: "new a" },
      { kind: "remove", oldLineNumber: 6, newLineNumber: null, oldText: "old b", newText: "" },
      { kind: "context", oldLineNumber: 7, newLineNumber: 6, oldText: "tail", newText: "tail" },
    ],
    "side-by-side rows should pair adjacent remove/add blocks",
  );
}

function parsesQuotedDiffPaths(): void {
  const model = projectDiffViewer([
    'diff --git "a/src/file with spaces.ts" "b/src/file with spaces.ts"',
    '--- "a/src/file with spaces.ts"',
    '+++ "b/src/file with spaces.ts"',
    "@@ -1 +1 @@",
    "-old",
    "+new",
  ].join("\n"));

  assertEqual(model.files[0]?.path, "src/file with spaces.ts", "quoted diff paths should be unquoted");
  assertEqual(model.hunkNav[0]?.label, "file with spaces.ts:1", "hunk nav should keep quoted path basename");
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual<T>(actual: T, expected: T, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
