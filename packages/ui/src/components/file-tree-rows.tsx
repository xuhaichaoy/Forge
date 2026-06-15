import { ChevronRight, FolderOpen } from "lucide-react";
import { useMemo, type KeyboardEvent, type ReactNode } from "react";
import { fileIconComponent } from "../lib/file-icon";
import { resolveFileIcon, type FileIconFamily } from "../lib/file-icon-resolver";
import type { WorkspaceDirEntry } from "../lib/tauri-host";
import { useForgeIntl } from "./i18n-provider";
import type { FileTreeContextMenuOpener, FileTreeProps } from "./file-tree-types";

/*
 * FileTreeContextMenuOpener moved to ./file-tree-types (pure type leaf) so it
 * can be shared with file-tree.tsx without an import cycle. Re-exported in
 * place to keep historical import paths working.
 */
export type { FileTreeContextMenuOpener } from "./file-tree-types";

interface FileTreeNodeProps extends FileTreeProps {
  entry: WorkspaceDirEntry;
  depth: number;
  onOpenContextMenu?: FileTreeContextMenuOpener;
}

export function FileTreeNode({
  entry,
  depth,
  entriesByDir,
  expandedPaths,
  selectedPath,
  onToggle,
  onSelect,
  loadingPaths,
  onOpenContextMenu,
}: FileTreeNodeProps) {
  const isDir = entry.type === "directory";
  const isExpanded = isDir && expandedPaths.has(entry.path);
  const isSelected = selectedPath === entry.path;
  const isLoading = loadingPaths?.has(entry.path) ?? false;
  const childEntries = isExpanded ? entriesByDir.get(entry.path) ?? null : null;

  return (
    <div className="hc-file-tree-node" role="treeitem" aria-expanded={isDir ? isExpanded : undefined}>
      <FileTreeRow
        depth={depth}
        entry={entry}
        isExpanded={isExpanded}
        isSelected={isSelected}
        isLoading={isLoading}
        onOpenContextMenu={onOpenContextMenu}
        onClick={() => {
          if (isDir) {
            onToggle(entry.path);
            return;
          }
          onSelect(entry, { isPreview: true });
        }}
        onOpen={() => {
          if (isDir) return;
          onSelect(entry, { isPreview: false });
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
              onOpenContextMenu={onOpenContextMenu}
            />
          ))
        : null}
    </div>
  );
}

export function SearchResultsList({
  entries,
  selectedPath,
  onSelect,
  onOpenContextMenu,
}: { entries: WorkspaceDirEntry[]; onOpenContextMenu?: FileTreeContextMenuOpener } & FileTreeProps) {
  const { formatMessage } = useForgeIntl();
  // codex: workspace-directory-tree - search results are rendered flat with parent paths dimmed.
  if (entries.length === 0) {
    // codex workspace-directory-tree empty state uses the workspace-browser id
    // (`thread.fileTreePanel.noMatchingFiles`), distinct from the review/diff
    // panel's `codex.review.fileSearch.empty`.
    return (
      <div className="hc-file-tree-empty">
        {formatMessage({ id: "thread.fileTreePanel.noMatchingFiles", defaultMessage: "No matching files" })}
      </div>
    );
  }
  return (
    <div className="hc-file-tree" role="tree">
      {entries.map((entry) => {
        const lastSlash = entry.path.lastIndexOf("/");
        const dirPart = lastSlash >= 0 ? entry.path.slice(0, lastSlash + 1) : "";
        return (
          <FileTreeRow
            key={entry.path}
            depth={0}
            entry={entry}
            isExpanded={false}
            isSelected={selectedPath === entry.path}
            isLoading={false}
            secondaryLabel={dirPart || null}
            onOpenContextMenu={onOpenContextMenu}
            onClick={() => onSelect(entry, { isPreview: true })}
            onOpen={() => onSelect(entry, { isPreview: false })}
          />
        );
      })}
    </div>
  );
}

interface FileTreeRowProps {
  depth: number;
  entry: WorkspaceDirEntry;
  isExpanded: boolean;
  isSelected: boolean;
  isLoading: boolean;
  secondaryLabel?: string | null;
  onClick: () => void;
  onOpen?: () => void;
  onOpenContextMenu?: FileTreeContextMenuOpener;
}

function FileTreeRow({
  depth,
  entry,
  isExpanded,
  isSelected,
  isLoading,
  secondaryLabel,
  onClick,
  onOpen,
  onOpenContextMenu,
}: FileTreeRowProps) {
  const family = useMemo(
    () => resolveFileIcon(entry.name, entry.type === "directory", isExpanded),
    [entry.name, entry.type, isExpanded],
  );
  return (
    <button
      type="button"
      className="hc-file-tree-row"
      data-depth={depth}
      data-file-tree-path={entry.path}
      data-selected={isSelected || undefined}
      data-loading={isLoading || undefined}
      onClick={onClick}
      onDoubleClick={onOpen}
      onKeyDown={(event) => handleFileTreeRowKeyDown(event, { entry, isExpanded, onClick, onOpen })}
      onContextMenu={onOpenContextMenu ? (event) => onOpenContextMenu(event, entry) : undefined}
    >
      <span className="hc-file-tree-indent" aria-hidden="true">
        {/* codex: workspace-directory-tree indent - width derived from `depth`. */}
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

const FILE_TREE_ROW_SELECTOR = ".hc-file-tree-row[data-file-tree-path]";

function handleFileTreeRowKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
  row: {
    entry: WorkspaceDirEntry;
    isExpanded: boolean;
    onClick: () => void;
    onOpen?: () => void;
  },
): void {
  const rows = visibleFileTreeRowElements(event.currentTarget);
  const index = rows.indexOf(event.currentTarget);
  if (index < 0) return;

  let handled = true;
  switch (event.key) {
    case "ArrowDown":
      focusFileTreeRow(rows, index + 1);
      break;
    case "ArrowUp":
      focusFileTreeRow(rows, index - 1);
      break;
    case "Home":
      focusFileTreeRow(rows, 0);
      break;
    case "End":
      focusFileTreeRow(rows, rows.length - 1);
      break;
    case "ArrowRight":
      if (row.entry.type === "directory" && !row.isExpanded) {
        row.onClick();
      } else {
        focusFileTreeRow(rows, index + 1);
      }
      break;
    case "ArrowLeft":
      if (row.entry.type === "directory" && row.isExpanded) {
        row.onClick();
      } else {
        focusFileTreeParentRow(rows, row.entry.path);
      }
      break;
    case "Enter":
      (row.onOpen ?? row.onClick)();
      break;
    default:
      handled = false;
  }
  if (!handled) return;
  event.preventDefault();
  event.stopPropagation();
}

function visibleFileTreeRowElements(current: HTMLButtonElement): HTMLButtonElement[] {
  const tree = current.closest(".hc-file-tree");
  if (!tree) return [current];
  return Array.from(tree.querySelectorAll<HTMLButtonElement>(FILE_TREE_ROW_SELECTOR));
}

function focusFileTreeRow(rows: HTMLButtonElement[], index: number): void {
  const boundedIndex = Math.max(0, Math.min(index, rows.length - 1));
  rows[boundedIndex]?.focus();
}

function focusFileTreeParentRow(rows: HTMLButtonElement[], path: string): void {
  const parentPath = parentDirPath(path);
  if (parentPath == null) return;
  const parent = rows.find((row) => row.dataset.fileTreePath === parentPath);
  parent?.focus();
}

function parentDirPath(path: string): string | null {
  const slash = path.lastIndexOf("/");
  return slash > 0 ? path.slice(0, slash) : null;
}

function FileIconGlyph({ family }: { family: FileIconFamily }): ReactNode {
  // codex: get-file-icon - tree rows use the same extension/MIME icon family
  // map as file mentions and source/output rows; only expanded folders differ.
  if (family === "folder-open") {
    return <FolderOpen className="hc-file-tree-icon" size={13} aria-hidden="true" />;
  }
  const Icon = fileIconComponent(family);
  return <Icon className="hc-file-tree-icon" size={13} aria-hidden="true" />;
}
