/*
 * codex: file-tree-search-input-*.pretty.js (tree renderer) +
 *        workspace-directory-tree-*.pretty.js (selection + expand state).
 *
 * Codex Desktop uses a hand-rolled virtual scroller keyed on a packed
 * `depthAndFlags` integer plus chunked visible-row sums so that ~10k-node
 * workspaces stay smooth. HiCodex MVP renders the tree recursively and lets
 * the browser paint the lot; we keep the same prop surface so the renderer
 * can be swapped in later.
 *
 * TODO: replace the recursive renderer with a packed-tree virtual scroller —
 *   see file-tree-search-input for the chunked visible-count sums.
 */
import { ChevronRight, FolderOpen } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { fileIconComponent } from "../lib/file-icon";
import { resolveFileIcon, type FileIconFamily } from "../lib/file-icon-resolver";
import { osRevealLabel } from "../state/command-registry";
import { ContextMenu, type ContextMenuItem } from "./context-menu";
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

type FileTreeContextMenuOpener = (event: MouseEvent, entry: WorkspaceDirEntry) => void;
const FileTreeContextMenuContext = createContext<FileTreeContextMenuOpener | null>(null);

export function FileTree(props: FileTreeProps) {
  // codex context-menu-*.js — file rows open a right-click context menu (the file-tree TODO).
  const [menu, setMenu] = useState<{ entry: WorkspaceDirEntry; x: number; y: number } | null>(null);
  const openMenu = useCallback<FileTreeContextMenuOpener>((event, entry) => {
    event.preventDefault();
    setMenu({ entry, x: event.clientX, y: event.clientY });
  }, []);
  const closeMenu = useCallback(() => setMenu(null), []);

  // codex: workspace-directory-tree — search mode renders a flat result list; browse mode renders the tree.
  const body = props.searchMatches != null
    ? <SearchResultsList entries={props.searchMatches} {...props} />
    : (
        <div className="hc-file-tree" role="tree">
          {props.rootEntries.map((entry) => (
            <FileTreeNode key={entry.path} entry={entry} depth={0} {...props} />
          ))}
        </div>
      );

  return (
    <FileTreeContextMenuContext.Provider value={openMenu}>
      {body}
      {menu != null && (
        <ContextMenu
          items={fileTreeContextMenuItems(menu.entry, {
            onSelect: props.onSelect,
            onAddEntryToChat: props.onAddEntryToChat,
            onRevealEntry: props.onRevealEntry,
            onCopyEntryContents: props.onCopyEntryContents,
          })}
          x={menu.x}
          y={menu.y}
          onClose={closeMenu}
        />
      )}
    </FileTreeContextMenuContext.Provider>
  );
}

/*
 * codex workspace-file-context-menu-ZTEfnsSe.js + file-tree-search-input-*.js
 * (`threadSidePanel.workspaceBrowser.addToChat`) — the rendered menu starts
 * with open target(s), then a separator, then copy/add-to-chat/reveal actions.
 * Two fidelity points extracted from the file-reference menu chunk:
 *   1. Only the "Open with" app-target rows carry an icon (`icon:e.icon`); the
 *      copy-path / copy-contents / reveal-path rows have NO leading icon — so
 *      HiCodex renders them icon-less to match (it previously added icons).
 *   2. The reveal row's label is platform-switched by `C(platform)`:
 *      darwin→"Reveal in Finder", win32→"Open in Explorer", else→"Open in File Manager".
 * Codex's "Open in {app}" targets need OS app-discovery HiCodex lacks; HiCodex
 * substitutes its in-app file viewer under Codex's own `viewFile` label ("Open file").
 */
export function fileTreeContextMenuItems(
  entry: WorkspaceDirEntry,
  handlers: {
    onSelect: (entry: WorkspaceDirEntry, options: FileTreeSelectOptions) => void;
    onAddEntryToChat?: (entry: WorkspaceDirEntry) => void;
    onRevealEntry?: (entry: WorkspaceDirEntry) => void;
    onCopyEntryContents?: (entry: WorkspaceDirEntry) => void;
  },
): ContextMenuItem[] {
  const isFile = entry.type !== "directory";
  const items: ContextMenuItem[] = [];
  // Open section — in-app viewer under Codex's `viewFile` ("Open file") label (files only).
  if (isFile) {
    items.push({ id: "open-file", label: "Open file", onSelect: () => handlers.onSelect(entry, { isPreview: false }) });
    items.push({ id: "open-separator", separator: true });
  }
  // codex `workspace-file-copy-path` — copies the (workspace-relative) path.
  items.push({
    id: "copy-path",
    label: "Copy path",
    onSelect: () => {
      void navigator.clipboard?.writeText(entry.path);
    },
  });
  // codex `threadSidePanel.workspaceBrowser.addToChat` — files only.
  if (isFile && handlers.onAddEntryToChat != null) {
    const onAddEntryToChat = handlers.onAddEntryToChat;
    items.push({
      id: "add-to-chat",
      label: "Add to chat",
      onSelect: () => onAddEntryToChat(entry),
    });
  }
  // codex `workspace-file-copy-contents` — reads + copies the file's text (files only).
  if (isFile && handlers.onCopyEntryContents != null) {
    const onCopyEntryContents = handlers.onCopyEntryContents;
    items.push({
      id: "copy-contents",
      label: "Copy file contents",
      onSelect: () => onCopyEntryContents(entry),
    });
  }
  // codex `workspace-file-reveal-path` — reveal in the OS file manager.
  if (handlers.onRevealEntry != null) {
    const onRevealEntry = handlers.onRevealEntry;
    items.push({ id: "reveal-path", label: osRevealLabel(), onSelect: () => onRevealEntry(entry) });
  }
  return items;
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
  // codex: workspace-directory-tree — search results are rendered flat with parent paths dimmed.
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
            onClick={() => onSelect(entry, { isPreview: true })}
            onOpen={() => onSelect(entry, { isPreview: false })}
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
  onOpen?: () => void;
}

function Row({ depth, entry, isExpanded, isSelected, isLoading, secondaryLabel, onClick, onOpen }: RowProps) {
  const family = useMemo(
    () => resolveFileIcon(entry.name, entry.type === "directory", isExpanded),
    [entry.name, entry.type, isExpanded],
  );
  const openContextMenu = useContext(FileTreeContextMenuContext);
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
      onContextMenu={openContextMenu ? (event) => openContextMenu(event, entry) : undefined}
    >
      <span className="hc-file-tree-indent" aria-hidden="true">
        {/* codex: workspace-directory-tree indent — width derived from `depth`. */}
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
  // codex: get-file-icon — tree rows use the same extension/MIME icon family
  // map as file mentions and source/output rows; only expanded folders differ.
  if (family === "folder-open") {
    return <FolderOpen className="hc-file-tree-icon" size={13} aria-hidden="true" />;
  }
  const Icon = fileIconComponent(family);
  return <Icon className="hc-file-tree-icon" size={13} aria-hidden="true" />;
}
