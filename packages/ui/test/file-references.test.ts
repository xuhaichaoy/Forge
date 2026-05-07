import {
  fileReferenceDisplayPath,
  fileReferenceKey,
  fileReferenceLineLabel,
  normalizeFileReference,
} from "../src/state/file-references";

export default function runFileReferenceTests(): void {
  normalizesClickedReferenceForPreview();
  defaultsInvalidLinesToSingleLine();
  formatsPreviewLabelsAndKeys();
  shortensLongPathsFromTheLeft();
}

function normalizesClickedReferenceForPreview(): void {
  assertDeepEqual(
    normalizeFileReference({ path: " packages/ui/src/HiCodexApp.tsx ", lineStart: 12, lineEnd: 18 }),
    { path: "packages/ui/src/HiCodexApp.tsx", lineStart: 12, lineEnd: 18 },
    "file reference should trim path and keep range",
  );
}

function defaultsInvalidLinesToSingleLine(): void {
  assertDeepEqual(
    normalizeFileReference({ path: "/tmp/memory.md", lineStart: 0, lineEnd: -3 }),
    { path: "/tmp/memory.md", lineStart: 1, lineEnd: 1 },
    "invalid line values should default to line one",
  );
  assertEqual(normalizeFileReference({ path: "   ", lineStart: 2 }), null, "blank paths should not preview");
  assertDeepEqual(
    normalizeFileReference({ path: "/tmp/reversed.md", lineStart: 9, lineEnd: 4 }),
    { path: "/tmp/reversed.md", lineStart: 9, lineEnd: 9 },
    "reversed line ranges should clamp to the starting line",
  );
}

function formatsPreviewLabelsAndKeys(): void {
  const reference = { path: "/tmp/memory.md", lineStart: 3, lineEnd: 5 };
  assertEqual(fileReferenceLineLabel(reference), "Lines 3-5", "line range label");
  assertEqual(fileReferenceLineLabel({ ...reference, lineEnd: 3 }), "Line 3", "single line label");
  assertEqual(fileReferenceKey(reference), "/tmp/memory.md:3-5", "stable file reference key");
}

function shortensLongPathsFromTheLeft(): void {
  assertEqual(fileReferenceDisplayPath("/tmp/example.ts", 30), "/tmp/example.ts", "short path should stay intact");
  assertEqual(
    fileReferenceDisplayPath("/workspace/packages/ui/src/components/file-reference-panel.tsx", 27),
    "...file-reference-panel.tsx",
    "long path should preserve the filename tail",
  );
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
