/*
 * Pure type leaf for the file-tree prop shapes shared between file-tree.tsx
 * and file-tree-rows.tsx. Extracted so the rows module's type-only back edge
 * (FileTreeProps) no longer closes a cycle with file-tree's value imports of
 * the row renderers. Both modules re-export these names in place, so existing
 * import paths keep working unchanged.
 */
import type { MouseEvent } from "react";
import type { WorkspaceDirEntry } from "../lib/tauri-host";

export interface FileTreeProps {
  /** Direct children of the workspace root, in render order. */
  rootEntries: WorkspaceDirEntry[];
  /** Cached child listings keyed by relative directory path ('' for the root). */
  entriesByDir: Map<string, WorkspaceDirEntry[]>;
  expandedPaths: Set<string>;
  selectedPath: string | null;
  onToggle: (path: string) => void;
  onSelect: (entry: WorkspaceDirEntry, options: FileTreeSelectOptions) => void;
  /** codex threadSidePanel.workspaceBrowser.addToChat — add a file row to composer context. */
  onAddEntryToChat?: (entry: WorkspaceDirEntry) => void;
  /** codex workspace-file-context-menu `workspace-file-reveal-path` — reveal in OS file manager. Omitted in non-Tauri/test. */
  onRevealEntry?: (entry: WorkspaceDirEntry) => void;
  /** codex workspace-file-context-menu `workspace-file-copy-contents` — copy file contents (files only). */
  onCopyEntryContents?: (entry: WorkspaceDirEntry) => void;
  loadingPaths?: Set<string>;
  /** When set, render the matching subset only (search results mode). */
  searchMatches?: WorkspaceDirEntry[] | null;
}

export interface FileTreeSelectOptions {
  isPreview: boolean;
}

export type FileTreeContextMenuOpener = (event: MouseEvent, entry: WorkspaceDirEntry) => void;
