import { workspaceFilesRootState } from "../src/components/workspace-files-panel";
import type { WorkspaceDirEntry } from "../src/lib/tauri-host";

export default function runWorkspaceFilesPanelTests(): void {
  projectsDesktopRootLoadingAndEmptyStates();
}

function projectsDesktopRootLoadingAndEmptyStates(): void {
  const file: WorkspaceDirEntry = { type: "file", path: "README.md", name: "README.md" };

  assertEqual(
    workspaceFilesRootState({
      entriesByDir: new Map(),
      loadingPaths: new Set([""]),
      rootEntries: [],
      hasSearchQuery: false,
    }),
    "loading",
    "initial root load should show Desktop loading text",
  );
  assertEqual(
    workspaceFilesRootState({
      entriesByDir: new Map(),
      loadingPaths: new Set(),
      rootEntries: [],
      hasSearchQuery: false,
    }),
    "loading",
    "missing root entries should not render a blank tree before the load effect runs",
  );
  assertEqual(
    workspaceFilesRootState({
      entriesByDir: new Map([["", []]]),
      loadingPaths: new Set(),
      rootEntries: [],
      hasSearchQuery: false,
    }),
    "empty",
    "loaded empty root should show Desktop empty text",
  );
  assertEqual(
    workspaceFilesRootState({
      entriesByDir: new Map([["", []]]),
      loadingPaths: new Set(),
      rootEntries: [],
      hasSearchQuery: true,
    }),
    "tree",
    "search mode should keep FileTree responsible for search empty state",
  );
  assertEqual(
    workspaceFilesRootState({
      entriesByDir: new Map([["", [file]]]),
      loadingPaths: new Set(),
      rootEntries: [file],
      hasSearchQuery: false,
    }),
    "tree",
    "loaded root entries should render the file tree",
  );
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
