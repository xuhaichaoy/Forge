import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FileTree, fileTreeContextMenuItems } from "../src/components/file-tree";
import type { WorkspaceDirEntry } from "../src/lib/tauri-host";

export default function runFileTreeTests(): void {
  rendersRowsWithKeyboardNavigationAnchors();
  contextMenuAddsWorkspaceFileToChat();
}

function rendersRowsWithKeyboardNavigationAnchors(): void {
  const rootEntries: WorkspaceDirEntry[] = [
    { type: "directory", path: "src", name: "src" },
    { type: "file", path: "README.md", name: "README.md" },
  ];
  const entriesByDir = new Map<string, WorkspaceDirEntry[]>([
    ["src", [{ type: "file", path: "src/app.ts", name: "app.ts" }]],
  ]);
  const html = renderToStaticMarkup(createElement(FileTree, {
    rootEntries,
    entriesByDir,
    expandedPaths: new Set(["src"]),
    selectedPath: "src/app.ts",
    onToggle: () => undefined,
    onSelect: () => undefined,
    loadingPaths: new Set<string>(),
    searchMatches: null,
  }));

  assertIncludes(html, 'data-file-tree-path="src"', "directory rows should expose a stable path for arrow-key navigation");
  assertIncludes(html, 'data-file-tree-path="src/app.ts"', "child rows should expose a stable path for parent focus");
  assertIncludes(html, 'data-depth="1"', "expanded child rows should keep depth information");
  assertIncludes(html, 'data-selected="true"', "selected path should still mark the active row");
  assertIncludes(html, "hc-file-icon-typescript", "workspace tree should use Desktop's TypeScript icon family");
  assertIncludes(html, "hc-file-icon-document", "workspace tree should map Markdown to Desktop's document icon family");
}

function contextMenuAddsWorkspaceFileToChat(): void {
  const file: WorkspaceDirEntry = { type: "file", path: "src/app.ts", name: "app.ts" };
  const directory: WorkspaceDirEntry = { type: "directory", path: "src", name: "src" };
  let addedPath = "";
  const items = fileTreeContextMenuItems(file, {
    onSelect: () => undefined,
    onAddEntryToChat: (entry) => {
      addedPath = entry.path;
    },
  });
  assertIncludes(
    items.map((item) => item.id).join(","),
    "add-to-chat",
    "file context menu should include Desktop's Add to chat item",
  );
  items.find((item) => item.id === "add-to-chat")?.onSelect?.();
  assertEqual(addedPath, "src/app.ts", "Add to chat should receive the selected file entry");

  const directoryItems = fileTreeContextMenuItems(directory, {
    onSelect: () => undefined,
    onAddEntryToChat: () => {
      throw new Error("directories should not expose Add to chat");
    },
  });
  assertEqual(
    directoryItems.some((item) => item.id === "add-to-chat"),
    false,
    "directory context menu should not include Add to chat",
  );
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(actual: string, expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}
