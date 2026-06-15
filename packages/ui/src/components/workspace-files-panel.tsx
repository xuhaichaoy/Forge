/*
 * codex: workspace-directory-tree-CHHgPVoD.pretty.js :_e (panel root,
 *   browse-vs-search switch, reveal-active-file effect, expanded paths state)
 *   + file-tree-search-input-Cg1SVtq4 :qc (search input).
 *
 * MVP scope (vs Codex Desktop full implementation):
 *   - Browse mode: lazy `host_workspace_list_dir` per expanded directory.
 *   - Search mode: app-server fuzzy search when provided, with local
 *     already-loaded substring search as a browser/test fallback.
 *   - State is component-local (`useState`). Persistence to disk and per-route
 *     atoms are TODO.
 *
 * TODO: `fs/watch` driven auto-refresh on mtime change (Codex bumps `refreshKey`).
 * TODO: `revealSelectedPath` auto-scroll into view — needs measuring/virtualizer.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { FileTree } from "./file-tree";
import type { FileTreeSelectOptions } from "./file-tree";
import { FileTreeSearchInput } from "./file-tree-search-input";
import { useForgeIntl } from "./i18n-provider";
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
  onSelectFile?: (relPath: string, options: WorkspaceFileSelectOptions) => void;
  /** Right-click `Add to chat` action for file rows. */
  onAddFileToChat?: (relPath: string) => void;
  /** Desktop-style workspace fuzzy file search backed by app-server. */
  searchWorkspaceFiles?: (query: string, workspaceRoot: string) => Promise<WorkspaceDirEntry[]>;
  /** Show files/dirs starting with '.' */
  includeHidden?: boolean;
}

export interface WorkspaceFileSelectOptions {
  isPreview: boolean;
}

export type WorkspaceFilesRootState = "loading" | "empty" | "tree";

export function WorkspaceFilesPanel({
  workspaceRoot,
  activeFilePath,
  onSelectFile,
  onAddFileToChat,
  searchWorkspaceFiles,
  includeHidden = false,
}: WorkspaceFilesPanelProps) {
  const { formatMessage } = useForgeIntl();
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
  const [remoteSearch, setRemoteSearch] = useState<{
    query: string;
    status: "loading" | "ready" | "error";
    matches: WorkspaceDirEntry[];
    error?: string;
  } | null>(null);

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
    (entry: WorkspaceDirEntry, options: FileTreeSelectOptions) => {
      if (entry.type !== "file") return;
      setSelectedPath(entry.path);
      onSelectFile?.(entry.path, options);
    },
    [onSelectFile],
  );
  const handleAddToChat = useCallback(
    (entry: WorkspaceDirEntry) => {
      if (entry.type !== "file") return;
      onAddFileToChat?.(entry.path);
    },
    [onAddFileToChat],
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
  const normalizedSearchQuery = searchQuery.trim();
  const trimmedQuery = normalizedSearchQuery.toLowerCase();
  const rootState = workspaceFilesRootState({
    entriesByDir,
    loadingPaths,
    rootEntries,
    hasSearchQuery: trimmedQuery.length > 0,
  });
  const localSearchMatches = useMemo(() => {
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
  const useRemoteSearch = Boolean(searchWorkspaceFiles && normalizedSearchQuery.length > 0);
  useEffect(() => {
    if (!searchWorkspaceFiles || normalizedSearchQuery.length === 0) {
      setRemoteSearch(null);
      return;
    }
    let cancelled = false;
    const query = normalizedSearchQuery;
    setRemoteSearch({ query, status: "loading", matches: [] });
    void searchWorkspaceFiles(query, workspaceRoot)
      .then((matches) => {
        if (cancelled) return;
        setRemoteSearch({ query, status: "ready", matches });
      })
      .catch((error) => {
        if (cancelled) return;
        setRemoteSearch({
          query,
          status: "error",
          matches: [],
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [searchWorkspaceFiles, normalizedSearchQuery, workspaceRoot]);
  const remoteSearchForQuery = remoteSearch?.query === normalizedSearchQuery ? remoteSearch : null;
  const searchMatches = normalizedSearchQuery.length === 0
    ? null
    : useRemoteSearch
      ? (remoteSearchForQuery?.matches ?? [])
      : localSearchMatches;

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
        ) : useRemoteSearch && remoteSearchForQuery?.status === "loading" ? (
          <div className="hc-file-tree-empty">
            {formatMessage({ id: "thread.fileTreePanel.searchingFiles", defaultMessage: "Searching files…" })}
          </div>
        ) : useRemoteSearch && remoteSearchForQuery?.status === "error" ? (
          <div className="hc-file-tree-error">{remoteSearchForQuery.error ?? "File search failed."}</div>
        ) : rootState === "loading" ? (
          <div className="hc-file-tree-empty">
            {formatMessage({ id: "threadSidePanel.workspaceBrowser.loading", defaultMessage: "Loading directory entries…" })}
          </div>
        ) : rootState === "empty" ? (
          <div className="hc-file-tree-empty">
            {formatMessage({ id: "threadSidePanel.workspaceBrowser.empty", defaultMessage: "No files in this folder" })}
          </div>
        ) : (
          <FileTree
            rootEntries={rootEntries}
            entriesByDir={entriesByDir}
            expandedPaths={expandedPaths}
            selectedPath={selectedPath}
            onToggle={handleToggle}
            onSelect={handleSelect}
            onAddEntryToChat={onAddFileToChat ? handleAddToChat : undefined}
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

export function workspaceFilesRootState({
  entriesByDir,
  loadingPaths,
  rootEntries,
  hasSearchQuery,
}: {
  entriesByDir: ReadonlyMap<string, WorkspaceDirEntry[]>;
  loadingPaths: ReadonlySet<string>;
  rootEntries: readonly WorkspaceDirEntry[];
  hasSearchQuery: boolean;
}): WorkspaceFilesRootState {
  if (hasSearchQuery) return "tree";
  if (!entriesByDir.has("") || loadingPaths.has("")) return "loading";
  if (entriesByDir.has("") && rootEntries.length === 0) return "empty";
  return "tree";
}

/** Resolve a workspace-relative entry path against the absolute root. */
function joinWorkspacePath(root: string, relPath: string): string {
  if (!relPath) return root;
  const base = root.endsWith("/") ? root.slice(0, -1) : root;
  return `${base}/${relPath}`;
}
