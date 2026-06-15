/*
 * codex: file-tree-search-input-*.pretty.js (tree renderer) +
 *        workspace-directory-tree-*.pretty.js (selection + expand state).
 *
 * Codex Desktop uses a hand-rolled virtual scroller keyed on a packed
 * `depthAndFlags` integer plus chunked visible-row sums so that ~10k-node
 * workspaces stay smooth. Forge MVP renders the tree recursively and lets
 * the browser paint the lot; we keep the same prop surface so the renderer
 * can be swapped in later.
 *
 * TODO: replace the recursive renderer with a packed-tree virtual scroller —
 *   see file-tree-search-input for the chunked visible-count sums.
 */
import {
  useCallback,
  useState,
} from "react";
import { osRevealLabel } from "../state/command-registry";
import { formatMessage } from "../state/i18n";
import { ContextMenu, type ContextMenuItem } from "./context-menu";
import {
  FileTreeNode,
  SearchResultsList,
} from "./file-tree-rows";
import type {
  FileTreeContextMenuOpener,
  FileTreeProps,
  FileTreeSelectOptions,
} from "./file-tree-types";
import type { WorkspaceDirEntry } from "../lib/tauri-host";

/*
 * The prop shapes were extracted to ./file-tree-types (pure type leaf) so
 * file-tree-rows.tsx can reference them without importing back into this
 * module. Re-exported in place to keep historical import paths working.
 */
export type { FileTreeProps, FileTreeSelectOptions } from "./file-tree-types";

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
    ? <SearchResultsList entries={props.searchMatches} onOpenContextMenu={openMenu} {...props} />
    : (
        <div className="hc-file-tree" role="tree">
          {props.rootEntries.map((entry) => (
            <FileTreeNode key={entry.path} entry={entry} depth={0} onOpenContextMenu={openMenu} {...props} />
          ))}
        </div>
      );

  return (
    <>
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
    </>
  );
}

/*
 * codex workspace-file-context-menu-ZTEfnsSe.js + file-tree-search-input-*.js
 * (`threadSidePanel.workspaceBrowser.addToChat`) — the rendered menu starts
 * with open target(s), then a separator, then copy/add-to-chat/reveal actions.
 * Two fidelity points extracted from the file-reference menu chunk:
 *   1. Only the "Open with" app-target rows carry an icon (`icon:e.icon`); the
 *      copy-path / copy-contents / reveal-path rows have NO leading icon — so
 *      Forge renders them icon-less to match (it previously added icons).
 *   2. The reveal row's label is platform-switched by `C(platform)`:
 *      darwin→"Reveal in Finder", win32→"Open in Explorer", else→"Open in File Manager".
 * Codex's "Open in {app}" targets need OS app-discovery Forge lacks; Forge
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
  // codex labels go through the module-level formatMessage so the ZH locale
  // localizes the menu (this helper is a pure function with no React hook).
  if (isFile) {
    items.push({
      id: "open-file",
      label: formatMessage({ id: "markdown.fileReference.viewFile", defaultMessage: "Open file" }),
      onSelect: () => handlers.onSelect(entry, { isPreview: false }),
    });
    items.push({ id: "open-separator", separator: true });
  }
  // codex `workspace-file-copy-path` — copies the (workspace-relative) path.
  items.push({
    id: "copy-path",
    label: formatMessage({ id: "codex.review.fileTree.contextMenu.copyPath", defaultMessage: "Copy path" }),
    onSelect: () => {
      void navigator.clipboard?.writeText(entry.path);
    },
  });
  // codex `threadSidePanel.workspaceBrowser.addToChat` — files only.
  if (isFile && handlers.onAddEntryToChat != null) {
    const onAddEntryToChat = handlers.onAddEntryToChat;
    items.push({
      id: "add-to-chat",
      label: formatMessage({ id: "threadSidePanel.workspaceBrowser.addToChat", defaultMessage: "Add to chat" }),
      onSelect: () => onAddEntryToChat(entry),
    });
  }
  // codex `workspace-file-copy-contents` — reads + copies the file's text (files only).
  if (isFile && handlers.onCopyEntryContents != null) {
    const onCopyEntryContents = handlers.onCopyEntryContents;
    items.push({
      id: "copy-contents",
      label: formatMessage({ id: "markdown.fileReference.copyFileContents", defaultMessage: "Copy file contents" }),
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
