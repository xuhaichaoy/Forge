/*
 * codex: file-tree-search-input-Cg1SVtq4.pretty.js (tree renderer `x`) +
 *        workspace-directory-tree-CHHgPVoD.pretty.js :_e (selection + expand state).
 *
 * Codex Desktop uses a hand-rolled virtual scroller keyed on a packed
 * `depthAndFlags` integer plus chunked visible-row sums so that ~10k-node
 * workspaces stay smooth. HiCodex MVP renders the tree recursively and lets
 * the browser paint the lot; we keep the same prop surface so the renderer
 * can be swapped in later.
 *
 * TODO: replace the recursive renderer with a packed-tree virtual scroller —
 *   see file-tree-search-input :x for the chunked visible-count sums.
 * TODO: right-click context menu (Copy path, Open in split, Reveal in OS) —
 *   Codex Desktop wires it through context-menu-TJfRSX1h.js.
 * TODO: single-click preview vs double-click open — Codex `isPreview: true|false`
 *   on the selection callback (workspace-directory-tree :Me/:Ne/:Pe/:Fe).
 */
import { ChevronRight, FileText, Folder, FolderOpen } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { resolveFileIcon, type FileIconFamily } from "../lib/file-icon-resolver";
import type { WorkspaceDirEntry } from "../lib/tauri-host";

export interface FileTreeProps {
  /** Direct children of the workspace root, in render order. */
  rootEntries: WorkspaceDirEntry[];
  /** Cached child listings keyed by relative directory path ('' for the root). */
  entriesByDir: Map<string, WorkspaceDirEntry[]>;
  expandedPaths: Set<string>;
  selectedPath: string | null;
  onToggle: (path: string) => void;
  onSelect: (entry: WorkspaceDirEntry) => void;
  loadingPaths?: Set<string>;
  /** When set, render the matching subset only (search results mode). */
  searchMatches?: WorkspaceDirEntry[] | null;
}

export function FileTree(props: FileTreeProps) {
  // codex: _e — search mode renders a flat result list; browse mode renders the tree.
  if (props.searchMatches != null) {
    return <SearchResultsList entries={props.searchMatches} {...props} />;
  }
  return (
    <div className="hc-file-tree" role="tree">
      {props.rootEntries.map((entry) => (
        <FileTreeNode key={entry.path} entry={entry} depth={0} {...props} />
      ))}
    </div>
  );
}

interface FileTreeNodeProps extends FileTreeProps {
  entry: WorkspaceDirEntry;
  depth: number;
}

function FileTreeNode({
  entry,
  depth,
  entriesByDir,
  expandedPaths,
  selectedPath,
  onToggle,
  onSelect,
  loadingPaths,
}: FileTreeNodeProps) {
  const isDir = entry.type === "directory";
  const isExpanded = isDir && expandedPaths.has(entry.path);
  const isSelected = selectedPath === entry.path;
  const isLoading = loadingPaths?.has(entry.path) ?? false;
  const childEntries = isExpanded ? entriesByDir.get(entry.path) ?? null : null;

  return (
    <div className="hc-file-tree-node" role="treeitem" aria-expanded={isDir ? isExpanded : undefined}>
      <Row
        depth={depth}
        entry={entry}
        isExpanded={isExpanded}
        isSelected={isSelected}
        isLoading={isLoading}
        onClick={() => {
          if (isDir) {
            onToggle(entry.path);
            return;
          }
          onSelect(entry);
        }}
      />
      {isExpanded && childEntries != null
        ? childEntries.map((child) => (
            <FileTreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              entriesByDir={entriesByDir}
              expandedPaths={expandedPaths}
              selectedPath={selectedPath}
              onToggle={onToggle}
              onSelect={onSelect}
              loadingPaths={loadingPaths}
              rootEntries={[]}
            />
          ))
        : null}
    </div>
  );
}

function SearchResultsList({
  entries,
  selectedPath,
  onSelect,
}: { entries: WorkspaceDirEntry[] } & FileTreeProps) {
  // codex: _e — search results are rendered flat with parent paths dimmed.
  if (entries.length === 0) {
    return <div className="hc-file-tree-empty">No matching files</div>;
  }
  return (
    <div className="hc-file-tree" role="tree">
      {entries.map((entry) => {
        const lastSlash = entry.path.lastIndexOf("/");
        const dirPart = lastSlash >= 0 ? entry.path.slice(0, lastSlash + 1) : "";
        return (
          <Row
            key={entry.path}
            depth={0}
            entry={entry}
            isExpanded={false}
            isSelected={selectedPath === entry.path}
            isLoading={false}
            secondaryLabel={dirPart || null}
            onClick={() => onSelect(entry)}
          />
        );
      })}
    </div>
  );
}

interface RowProps {
  depth: number;
  entry: WorkspaceDirEntry;
  isExpanded: boolean;
  isSelected: boolean;
  isLoading: boolean;
  secondaryLabel?: string | null;
  onClick: () => void;
}

function Row({ depth, entry, isExpanded, isSelected, isLoading, secondaryLabel, onClick }: RowProps) {
  const family = useMemo(
    () => resolveFileIcon(entry.name, entry.type === "directory", isExpanded),
    [entry.name, entry.type, isExpanded],
  );
  return (
    <button
      type="button"
      className="hc-file-tree-row"
      data-depth={depth}
      data-selected={isSelected || undefined}
      data-loading={isLoading || undefined}
      onClick={onClick}
    >
      <span className="hc-file-tree-indent" aria-hidden="true">
        {/* codex: _e indent — width derived from `depth`. */}
        {Array.from({ length: depth }, (_, i) => (
          <span key={i} className="hc-file-tree-indent-unit" />
        ))}
      </span>
      <span
        className="hc-file-tree-chevron"
        data-visible={entry.type === "directory"}
        data-expanded={isExpanded}
        aria-hidden="true"
      >
        <ChevronRight size={12} />
      </span>
      <FileIconGlyph family={family} />
      <span className="hc-file-tree-label">
        {secondaryLabel != null && secondaryLabel.length > 0 ? (
          <span className="hc-file-tree-label-parent">{secondaryLabel}</span>
        ) : null}
        <span className="hc-file-tree-label-name">{entry.name}</span>
      </span>
    </button>
  );
}

function FileIconGlyph({ family }: { family: FileIconFamily }): ReactNode {
  // codex: iconResolver — folder/folder-open/.md badge/generic file.
  switch (family) {
    case "folder":
      return <Folder className="hc-file-tree-icon" size={13} aria-hidden="true" />;
    case "folder-open":
      return <FolderOpen className="hc-file-tree-icon" size={13} aria-hidden="true" />;
    case "markdown":
      return (
        <span className="hc-file-tree-icon hc-file-tree-icon--markdown" aria-hidden="true">
          M
        </span>
      );
    case "file":
    default:
      return <FileText className="hc-file-tree-icon" size={13} aria-hidden="true" />;
  }
}
