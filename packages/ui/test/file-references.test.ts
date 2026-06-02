import {
  fileReferenceDisplayPath,
  fileReferenceKey,
  fileReferenceLineLabel,
  fileReferenceSidePanelContextMenuItems,
  fileReferenceSidePanelTabKind,
  fileReferenceSidePanelTabId,
  normalizeFileReference,
  resolveFileReferencePathCandidates,
} from "../src/state/file-references";

export default function runFileReferenceTests(): void {
  normalizesClickedReferenceForPreview();
  defaultsInvalidLinesToSingleLine();
  formatsPreviewLabelsAndKeys();
  buildsDesktopSidePanelTabIds();
  buildsDesktopWorkspaceFileContextMenuSubset();
  shortensLongPathsFromTheLeft();
  prefersWorkspaceRootForRepoRelativePaths();
  prefersCwdForBareAndDotRelativePaths();
  walksUpFromNestedThreadCwdForRepoRelativePaths();
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

function buildsDesktopSidePanelTabIds(): void {
  assertEqual(
    fileReferenceSidePanelTabId("/workspace/src/app.ts"),
    "file:/workspace/src/app.ts",
    "local file tabs without host id should use Desktop's file:path id",
  );
  assertEqual(
    fileReferenceSidePanelTabId("/workspace/src/app.ts", "host-1"),
    "file:host-1:/workspace/src/app.ts",
    "host-backed file tabs should include host id",
  );
  assertEqual(
    fileReferenceSidePanelTabKind("host-1"),
    "workspaceFile:host-1",
    "workspace file tab kind should use Desktop's host-scoped kind",
  );
}

function buildsDesktopWorkspaceFileContextMenuSubset(): void {
  const items = fileReferenceSidePanelContextMenuItems({
    onOpenFile: () => undefined,
    onCopyPath: () => undefined,
    onCopyContents: () => undefined,
    onRevealPath: () => undefined,
    revealLabel: "Reveal in Finder",
  });
  assertEqual(items.length, 5, "source tab menu should include open, separator, copy, contents, reveal");
  assertEqual(items[0]?.id, "workspace-file-open-file", "first row is Open file");
  assertEqual(items[1]?.separator, true, "open section should be separated from file actions");
  assertEqual(items[2]?.label, "Copy path", "copy path row");
  assertEqual(items[3]?.label, "Copy file contents", "copy contents row");
  assertEqual(items[4]?.label, "Reveal in Finder", "platform reveal label");
}

function shortensLongPathsFromTheLeft(): void {
  assertEqual(fileReferenceDisplayPath("/tmp/example.ts", 30), "/tmp/example.ts", "short path should stay intact");
  assertEqual(
    fileReferenceDisplayPath("/workspace/packages/ui/src/components/file-reference-panel.tsx", 27),
    "...file-reference-panel.tsx",
    "long path should preserve the filename tail",
  );
}

function prefersWorkspaceRootForRepoRelativePaths(): void {
  assertDeepEqual(
    resolveFileReferencePathCandidates("docs/DEVELOPMENT.md", {
      workspaceRoot: "/workspace/HiCodex",
      cwd: "/workspace/HiCodex/apps/desktop/src-tauri",
    }).slice(0, 4),
    [
      "/workspace/HiCodex/docs/DEVELOPMENT.md",
      "/workspace/docs/DEVELOPMENT.md",
      "/docs/DEVELOPMENT.md",
      "/workspace/HiCodex/apps/desktop/src-tauri/docs/DEVELOPMENT.md",
    ],
    "repo-relative paths should try the workspace root before the thread cwd",
  );
}

function prefersCwdForBareAndDotRelativePaths(): void {
  assertDeepEqual(
    resolveFileReferencePathCandidates("beijing_weather_next_7_days.csv", {
      workspaceRoot: "/workspace/HiCodex",
      cwd: "/workspace/HiCodex/apps/desktop/src-tauri",
    }).slice(0, 4),
    [
      "/workspace/HiCodex/apps/desktop/src-tauri/beijing_weather_next_7_days.csv",
      "/workspace/HiCodex/apps/desktop/beijing_weather_next_7_days.csv",
      "/workspace/HiCodex/apps/beijing_weather_next_7_days.csv",
      "/workspace/HiCodex/beijing_weather_next_7_days.csv",
    ],
    "bare filenames should stay anchored to the thread cwd first",
  );

  assertDeepEqual(
    resolveFileReferencePathCandidates("../docs/DEVELOPMENT.md", {
      workspaceRoot: "/workspace/HiCodex",
      cwd: "/workspace/HiCodex/apps/desktop/src-tauri",
    }).slice(0, 4),
    [
      "/workspace/HiCodex/apps/desktop/src-tauri/../docs/DEVELOPMENT.md",
      "/workspace/HiCodex/apps/desktop/../docs/DEVELOPMENT.md",
      "/workspace/HiCodex/apps/../docs/DEVELOPMENT.md",
      "/workspace/HiCodex/../docs/DEVELOPMENT.md",
    ],
    "explicit dot-relative paths should also prefer the thread cwd",
  );
}

function walksUpFromNestedThreadCwdForRepoRelativePaths(): void {
  const candidates = resolveFileReferencePathCandidates("docs/DEVELOPMENT.md", {
    workspaceRoot: "/workspace/HiCodex/apps/desktop/src-tauri",
    cwd: "/workspace/HiCodex/apps/desktop/src-tauri",
  });

  assertEqual(
    candidates.includes("/workspace/HiCodex/docs/DEVELOPMENT.md"),
    true,
    "nested thread cwd should still find repo-root relative artifacts",
  );
  assertEqual(
    candidates.indexOf("/workspace/HiCodex/docs/DEVELOPMENT.md") < candidates.indexOf("docs/DEVELOPMENT.md"),
    true,
    "ancestor candidates should be tried before the raw relative path",
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
