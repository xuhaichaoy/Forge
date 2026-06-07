/*
 * codex: inline-mentions-*.js / user-message-attachments-*.js both wrap their
 * file-reference elements with the shared workspace-file context menu
 * (context-menu-*.js wrapper + workspace-file-context-menu-*.js builder, i18n
 * `markdown.fileReference.*`). This leaf module centralizes HiCodex's mirror so
 * the transcript file-citation anchors (message-unit.tsx) and the user-message
 * attachment pills (user-message-content-render.tsx) share one menu definition
 * without importing each other (those two files already form a parent→child
 * pair, so the context/builder must live outside both to avoid a cycle).
 *
 * The reveal + copy-contents actions need host access + path resolution, so they
 * are supplied via `FileCitationMenuContext` (provided once above the conversation
 * in HiCodexApp, where `useArtifactPreviewActions` lives). When the context is
 * absent (non-Tauri / test), those rows simply drop out — only the always-safe
 * "Open file" / "Copy path" rows remain.
 */
import { createContext } from "react";
import { osRevealLabel } from "../state/command-registry";
import type { ContextMenuItem } from "./context-menu";
import type { FileReference } from "./file-reference-types";
import type { HiCodexIntlContextValue } from "./i18n-provider";

export interface FileCitationMenuActions {
  /** codex `workspace-file-reveal-path` — reveal in the OS file manager. */
  onReveal?: (reference: FileReference) => void;
  /** codex `workspace-file-copy-contents` — read + copy the file's text. */
  onCopyContents?: (reference: FileReference) => void;
}

export const FileCitationMenuContext = createContext<FileCitationMenuActions | null>(null);

/*
 * Build the workspace-file context-menu items for a single file reference,
 * matching the subset HiCodex can support (the "Open in {target}" / "Open with"
 * / "View in browser" rows need OS app-discovery / an in-app browser HiCodex
 * lacks, so they are omitted — same rationale as the file-tree menu). Order
 * mirrors Codex: open / separator / copy-path / copy-contents / reveal, and the
 * copy/reveal rows carry no leading icon (only Codex's open-with app rows do).
 */
export function fileReferenceContextMenuItems({
  reference,
  onOpenFileReference,
  menuActions,
  formatMessage,
}: {
  reference: FileReference;
  onOpenFileReference?: (reference: FileReference) => void;
  menuActions: FileCitationMenuActions | null;
  formatMessage: HiCodexIntlContextValue["formatMessage"];
}): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];
  if (onOpenFileReference) {
    // codex markdown.fileReference.viewFile "Open file" — reuse the in-app open path.
    items.push({ id: "open-file", label: formatMessage({ id: "markdown.fileReference.viewFile", defaultMessage: "Open file" }), onSelect: () => onOpenFileReference(reference) });
    items.push({ id: "open-separator", separator: true });
  }
  // codex markdown.fileReference.copyPath
  items.push({
    id: "copy-path",
    label: formatMessage({ id: "markdown.fileReference.copyPath", defaultMessage: "Copy path" }),
    onSelect: () => {
      void navigator.clipboard?.writeText(reference.path);
    },
  });
  if (menuActions?.onCopyContents) {
    // codex markdown.fileReference.copyFileContents
    const onCopyContents = menuActions.onCopyContents;
    items.push({ id: "copy-contents", label: formatMessage({ id: "markdown.fileReference.copyFileContents", defaultMessage: "Copy file contents" }), onSelect: () => onCopyContents(reference) });
  }
  if (menuActions?.onReveal) {
    // codex markdown.fileReference.openInFinder / openInExplorer / openInFileManager
    const onReveal = menuActions.onReveal;
    items.push({ id: "reveal-path", label: osRevealLabel(), onSelect: () => onReveal(reference) });
  }
  return items;
}
