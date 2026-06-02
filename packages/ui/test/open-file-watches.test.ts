import {
  nextOpenFileWatchRefreshKey,
  openFileWatchId,
  openFileWatchTargetsFromSidePanelTabs,
} from "../src/state/open-file-watches";

export default function runOpenFileWatchTests(): void {
  projectsWorkspaceFileTabsIntoWatchTargets();
  groupsTabsThatShareAWorkspaceFile();
  ignoresNonWorkspaceAndUnresolvedRelativeTabs();
  bumpsRefreshKeysForChangedFiles();
}

function projectsWorkspaceFileTabsIntoWatchTargets(): void {
  const targets = openFileWatchTargetsFromSidePanelTabs([{
    tabId: "file:local:/repo/src/app.ts",
    kind: "workspaceFile:local",
    props: {
      path: "src/app.ts",
      workspaceRoot: "/repo",
      cwd: "/repo/packages/ui",
      hostId: "local",
    },
  }]);

  assertEqual(targets.length, 1, "workspace file tab should create one watch target");
  assertEqual(targets[0]?.hostId, "local", "host id should come from tab props");
  assertEqual(targets[0]?.watchPath, "/repo/src/app.ts", "relative path should resolve from workspace root");
  assertEqual(targets[0]?.watchId, openFileWatchId("local", "/repo/src/app.ts"), "watch id should be stable");
  assertDeepEqual(targets[0]?.tabIds, ["file:local:/repo/src/app.ts"], "watch target should remember tab ids");
}

function groupsTabsThatShareAWorkspaceFile(): void {
  const targets = openFileWatchTargetsFromSidePanelTabs([
    {
      tabId: "file:local:/repo/src/app.ts",
      kind: "workspaceFile:local",
      props: { path: "/repo/src/app.ts", hostId: "local" },
    },
    {
      tabId: "artifact:source",
      kind: "workspaceFile:local",
      props: { path: "/repo/src/app.ts", hostId: "local", refreshKey: 2 },
    },
  ]);

  assertEqual(targets.length, 1, "same host/path should share one watch");
  assertDeepEqual(
    targets[0]?.tabIds,
    ["file:local:/repo/src/app.ts", "artifact:source"],
    "shared watch should update every matching tab",
  );
}

function ignoresNonWorkspaceAndUnresolvedRelativeTabs(): void {
  const targets = openFileWatchTargetsFromSidePanelTabs([
    {
      tabId: "settings",
      kind: "settings",
      props: { path: "/repo/src/app.ts" },
    },
    {
      tabId: "relative-without-root",
      kind: "workspaceFile:local",
      props: { path: "src/app.ts" },
    },
  ]);

  assertEqual(targets.length, 0, "only absolute resolved workspace file paths should be watched");
}

function bumpsRefreshKeysForChangedFiles(): void {
  assertEqual(nextOpenFileWatchRefreshKey(undefined), 1, "missing refresh key should start at one");
  assertEqual(nextOpenFileWatchRefreshKey(2), 3, "numeric refresh key should increment");
  assertEqual(nextOpenFileWatchRefreshKey(Number.NaN), 1, "invalid refresh key should reset to one");
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
