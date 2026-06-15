import {
  fileReferenceDisplayPath,
  fileReferenceKey,
  fileReferenceLineLabel,
  fileReferenceResolutionContext,
  fileReferenceSidePanelContextMenuItems,
  fileReferenceSidePanelTabKind,
  fileReferenceSidePanelTabId,
  normalizeFileReference,
  resolveFileReferencePathCandidates,
} from "../src/state/file-references";
import { createI18nBundle, formatI18nMessage } from "../src/state/i18n";

const enFormat = (
  descriptor: Parameters<typeof formatI18nMessage>[1],
  values?: Parameters<typeof formatI18nMessage>[2],
) => formatI18nMessage(createI18nBundle("en-US"), descriptor, values);

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
  dropsHostDefaultCwdSoBareRefsDoNotAnchorToHome();
}

function dropsHostDefaultCwdSoBareRefsDoNotAnchorToHome(): void {
  const home = "/Users/haichao";
  // Workspace-less thread: workspace + thread cwd both come from the host default
  // ($HOME). codex never resolves against $HOME, so those roots are dropped → a bare
  // filename stays relative instead of mis-anchoring to /Users/haichao/<name>.
  const noWorkspace = fileReferenceResolutionContext({ workspace: home, threadCwd: home, defaultCwd: home });
  assertDeepEqual(
    noWorkspace,
    { workspaceRoot: "", cwd: "" },
    "a workspace-less thread (cwd == host default) must not use $HOME as a resolution root",
  );
  assertDeepEqual(
    resolveFileReferencePathCandidates("报价表.docx", noWorkspace),
    ["报价表.docx"],
    "a bare filename with no real workspace stays relative (no $HOME/<name> candidate)",
  );
  // A real workspace / thread cwd (different from the host default) is preserved.
  assertDeepEqual(
    fileReferenceResolutionContext({ workspace: "/repo/app", threadCwd: "/repo/app/pkg", defaultCwd: home }),
    { workspaceRoot: "/repo/app", cwd: "/repo/app/pkg" },
    "a real workspace/thread cwd is preserved as the resolution root",
  );
  // Absolute references resolve as-is regardless of the (empty) context.
  assertDeepEqual(
    resolveFileReferencePathCandidates("/Users/haichao/Downloads/拆标输出/标项一.docx", noWorkspace),
    ["/Users/haichao/Downloads/拆标输出/标项一.docx"],
    "absolute references resolve as-is even with no workspace",
  );
}

function normalizesClickedReferenceForPreview(): void {
  assertDeepEqual(
    normalizeFileReference({ path: " packages/ui/src/ForgeApp.tsx ", lineStart: 12, lineEnd: 18 }),
    { path: "packages/ui/src/ForgeApp.tsx", lineStart: 12, lineEnd: 18 },
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
  }, enFormat);
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
      workspaceRoot: "/workspace/Forge",
      cwd: "/workspace/Forge/apps/desktop/src-tauri",
    }).slice(0, 4),
    [
      "/workspace/Forge/docs/DEVELOPMENT.md",
      "/workspace/docs/DEVELOPMENT.md",
      "/docs/DEVELOPMENT.md",
      "/workspace/Forge/apps/desktop/src-tauri/docs/DEVELOPMENT.md",
    ],
    "repo-relative paths should try the workspace root before the thread cwd",
  );
}

function prefersCwdForBareAndDotRelativePaths(): void {
  assertDeepEqual(
    resolveFileReferencePathCandidates("beijing_weather_next_7_days.csv", {
      workspaceRoot: "/workspace/Forge",
      cwd: "/workspace/Forge/apps/desktop/src-tauri",
    }).slice(0, 4),
    [
      "/workspace/Forge/apps/desktop/src-tauri/beijing_weather_next_7_days.csv",
      "/workspace/Forge/apps/desktop/beijing_weather_next_7_days.csv",
      "/workspace/Forge/apps/beijing_weather_next_7_days.csv",
      "/workspace/Forge/beijing_weather_next_7_days.csv",
    ],
    "bare filenames should stay anchored to the thread cwd first",
  );

  assertDeepEqual(
    resolveFileReferencePathCandidates("../docs/DEVELOPMENT.md", {
      workspaceRoot: "/workspace/Forge",
      cwd: "/workspace/Forge/apps/desktop/src-tauri",
    }).slice(0, 4),
    [
      "/workspace/Forge/apps/desktop/src-tauri/../docs/DEVELOPMENT.md",
      "/workspace/Forge/apps/desktop/../docs/DEVELOPMENT.md",
      "/workspace/Forge/apps/../docs/DEVELOPMENT.md",
      "/workspace/Forge/../docs/DEVELOPMENT.md",
    ],
    "explicit dot-relative paths should also prefer the thread cwd",
  );
}

function walksUpFromNestedThreadCwdForRepoRelativePaths(): void {
  const candidates = resolveFileReferencePathCandidates("docs/DEVELOPMENT.md", {
    workspaceRoot: "/workspace/Forge/apps/desktop/src-tauri",
    cwd: "/workspace/Forge/apps/desktop/src-tauri",
  });

  assertEqual(
    candidates.includes("/workspace/Forge/docs/DEVELOPMENT.md"),
    true,
    "nested thread cwd should still find repo-root relative artifacts",
  );
  assertEqual(
    candidates.indexOf("/workspace/Forge/docs/DEVELOPMENT.md") < candidates.indexOf("docs/DEVELOPMENT.md"),
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
