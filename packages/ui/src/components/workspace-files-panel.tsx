/*
 * codex: workspace-directory-tree-CHHgPVoD.pretty.js :_e (panel root,
 *   browse-vs-search switch, reveal-active-file effect, expanded paths state)
 *   + file-tree-search-input-Cg1SVtq4 :qc (search input).
 *
 * MVP scope (vs Codex Desktop full implementation):
 *   - Browse mode: lazy `host_workspace_list_dir` per expanded directory.
 *   - Search mode: client-side substring filter over already-loaded entries.
 *   - State is component-local (`useState`). Persistence to disk and per-route
 *     atoms are TODO.
 *
 * TODO: fuzzy file-search session (Codex uses streaming `createFuzzyFileSearchSession`).
 * TODO: `fs/watch` driven auto-refresh on mtime change (Codex bumps `refreshKey`).
 * TODO: keyboard navigation (Up/Down/Left/Right/Enter) — Codex implements in :_e.
 * TODO: `revealSelectedPath` auto-scroll into view — needs measuring/virtualizer.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { FileTree } from "./file-tree";
import { FileTreeSearchInput } from "./file-tree-search-input";
import {
  isTauriRuntime,
  readTextFile,
  revealPath,
  workspaceListDir,
  type WorkspaceDirEntry,
} from "../lib/tauri-host";

export interface WorkspaceFilesPanelProps {
  /** Absolute path to the workspace root. */
  workspaceRoot: string;
  /** When set, the panel auto-expands ancestors and highlights this file. */
  activeFilePath?: string | null;
  /** Single-click on a file. */
  onSelectFile?: (relPath: string) => void;
  /** Show files/dirs starting with '.' */
  includeHidden?: boolean;
}

export function WorkspaceFilesPanel({
  workspaceRoot,
  activeFilePath,
  onSelectFile,
  includeHidden = false,
}: WorkspaceFilesPanelProps) {
  // codex: _e — atom `me` { expandedPaths, scrollTop, searchQuery, selectedPath }.
  // MVP: hold equivalent state in component-local React state.
  const [entriesByDir, setEntriesByDir] = useState<Map<string, WorkspaceDirEntry[]>>(
    () => new Map(),
  );
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(activeFilePath ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadDir = useCallback(
    async (dirPath: string): Promise<void> => {
      if (!workspaceRoot) return;
      setLoadingPaths((prev) => {
        if (prev.has(dirPath)) return prev;
        const next = new Set(prev);
        next.add(dirPath);
        return next;
      });
      try {
        // codex: workspace-directory-entries query — non-recursive list.
        const entries = await workspaceListDir({
          root: workspaceRoot,
          dirPath,
          includeHidden,
        });
        setEntriesByDir((prev) => {
          const next = new Map(prev);
          next.set(dirPath, entries);
          return next;
        });
        setLoadError(null);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : String(error));
      } finally {
        setLoadingPaths((prev) => {
          if (!prev.has(dirPath)) return prev;
          const next = new Set(prev);
          next.delete(dirPath);
          return next;
        });
      }
    },
    [workspaceRoot, includeHidden],
  );

  // codex: _e — initial mount loads the root.
  useEffect(() => {
    if (!workspaceRoot) return;
    setEntriesByDir(new Map());
    setExpandedPaths(new Set());
    setSelectedPath(activeFilePath ?? null);
    void loadDir("");
    // We intentionally re-key the panel on root change; activeFilePath alone
    // should not trigger a wholesale reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceRoot, loadDir]);

  // codex: _e activeFilePath reveal — expand all ancestor dirs and select.
  useEffect(() => {
    if (!activeFilePath) return;
    const ancestors: string[] = [];
    let cursor = activeFilePath;
    while (true) {
      const slash = cursor.lastIndexOf("/");
      if (slash < 0) break;
      cursor = cursor.slice(0, slash);
      ancestors.unshift(cursor);
    }
    setExpandedPaths((prev) => {
      let mutated = false;
      const next = new Set(prev);
      for (const ancestor of ancestors) {
        if (!next.has(ancestor)) {
          next.add(ancestor);
          mutated = true;
        }
      }
      return mutated ? next : prev;
    });
    for (const ancestor of ancestors) {
      if (!entriesByDir.has(ancestor)) {
        void loadDir(ancestor);
      }
    }
    setSelectedPath(activeFilePath);
  }, [activeFilePath, entriesByDir, loadDir]);

  const handleToggle = useCallback(
    (path: string) => {
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        return next;
      });
      if (!entriesByDir.has(path)) {
        void loadDir(path);
      }
    },
    [entriesByDir, loadDir],
  );

  const handleSelect = useCallback(
    (entry: WorkspaceDirEntry) => {
      if (entry.type !== "file") return;
      setSelectedPath(entry.path);
      onSelectFile?.(entry.path);
    },
    [onSelectFile],
  );

  // codex workspace-file-context-menu `workspace-file-reveal-path` — reveal the
  // entry in the OS file manager via the host. `entry.path` is workspace-relative,
  // so resolve against the absolute root before handing it to the host command.
  const handleReveal = useCallback(
    (entry: WorkspaceDirEntry) => {
      void revealPath(joinWorkspacePath(workspaceRoot, entry.path)).catch((error) => {
        // A reveal failure should not blow away the tree (loadError hides it);
        // surface to the console like other non-fatal host action failures.
        console.error("reveal path failed", error);
      });
    },
    [workspaceRoot],
  );

  // codex workspace-file-context-menu `workspace-file-copy-contents` — read the
  // file's text via the host and copy it to the clipboard.
  const handleCopyContents = useCallback(
    (entry: WorkspaceDirEntry) => {
      void (async () => {
        try {
          const contents = await readTextFile(joinWorkspacePath(workspaceRoot, entry.path));
          await navigator.clipboard?.writeText(contents);
        } catch (error) {
          console.error("copy file contents failed", error);
        }
      })();
    },
    [workspaceRoot],
  );

  const rootEntries = entriesByDir.get("") ?? [];
  const trimmedQuery = searchQuery.trim().toLowerCase();
  const searchMatches = useMemo(() => {
    if (trimmedQuery.length === 0) return null;
    // codex: workspace-directory-tree-CHHgPVoD :_e search mode — flatten loaded
    // entries; the streaming fuzzy session is a TODO above. We deliberately
    // return only `file` entries so the dropdown does not surface directories.
    const flat: WorkspaceDirEntry[] = [];
    for (const entries of entriesByDir.values()) {
      for (const entry of entries) {
        if (entry.type === "file" && entry.path.toLowerCase().includes(trimmedQuery)) {
          flat.push(entry);
        }
      }
    }
    flat.sort((a, b) => a.path.localeCompare(b.path));
    return flat;
  }, [entriesByDir, trimmedQuery]);

  return (
    <div className="hc-workspace-files-panel">
      {/* codex: _e header — `shrink-0 px-2 pt-2 pb-px` */}
      <div className="hc-workspace-files-panel-header">
        <FileTreeSearchInput
          searchQuery={searchQuery}
          onQueryChange={setSearchQuery}
        />
      </div>
      <div className="hc-workspace-files-panel-body">
        {loadError != null ? (
          <div className="hc-file-tree-error">{loadError}</div>
        ) : (
          <FileTree
            rootEntries={rootEntries}
            entriesByDir={entriesByDir}
            expandedPaths={expandedPaths}
            selectedPath={selectedPath}
            onToggle={handleToggle}
            onSelect={handleSelect}
            // OS-integration context-menu actions only exist when a Tauri host
            // is present; omitting them in browser/test hides those menu rows.
            onRevealEntry={isTauriRuntime() ? handleReveal : undefined}
            onCopyEntryContents={isTauriRuntime() ? handleCopyContents : undefined}
            loadingPaths={loadingPaths}
            searchMatches={searchMatches}
          />
        )}
      </div>
    </div>
  );
}

/** Resolve a workspace-relative entry path against the absolute root. */
function joinWorkspacePath(root: string, relPath: string): string {
  if (!relPath) return root;
  const base = root.endsWith("/") ? root.slice(0, -1) : root;
  return `${base}/${relPath}`;
}
