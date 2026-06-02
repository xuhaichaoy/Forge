import { WorkspaceFilesPanel, type WorkspaceFileSelectOptions } from "./workspace-files-panel";
import type { WorkspaceDirEntry } from "../lib/tauri-host";

/*
 * Files tab content — wraps the existing `WorkspaceFilesPanel` for use as a
 * tab inside the side-panel tab host.
 *
 * Source — Codex Desktop's Files tab uses
 * `/private/tmp/codex-asar/pretty/workspace-directory-tree-CHHgPVoD.pretty.js`
 * (`_e` at line 135-403) as the tab Component. Opening the tab goes through
 *   `open-workspace-file-DFjZ10XZ.pretty.js` -> `k(...)` (export `t`, line 84-225)
 * which routes `{ scope, openInSidePanel: true }` to the right-panel tab
 * controller's `openTab(component: workspaceDirectoryTree, props: { root,
 * activeFilePath, onSelectFile })` (see card invocation at
 * `thread-app-shell-chrome-BVkAxLhy.pretty.js:636-639`):
 *
 *     let Qe = () => {
 *       U != null && (de(p, null, { hostId: I.id, target: f, workspaceRoot: U }), l?.());
 *     };
 *
 * Where `U` is the resolved workspace root and `de` ultimately calls
 * `controller.openTab(_e, { props: { root: U, ... } })`.
 *
 * HiCodex doesn't have a Codex-equivalent `_e`; we wrap our existing
 * `WorkspaceFilesPanel` (which is HiCodex's port of `_e`) so the tab system
 * can address it via the same SidePanelTabComponent contract.
 *
 * Props passed from the controller's renderer (Codex `B()` factory at
 * app-shell-tab-controller-B2eCi4Le.pretty.js:286-307):
 *   `Component(..., onClose, tabId, isActive, tabState, setTabState)`
 * We only use `workspaceRoot` / `activeFilePath` / `onSelectFile` from the
 * Tab `props` slot — the tab-state plumbing is unused here because
 * `WorkspaceFilesPanel` manages its own state internally (matching Codex
 * `_e` which also keeps `expandedPaths/searchQuery/selectedPath` in component
 * state — workspace-directory-tree-CHHgPVoD.pretty.js:167-168).
 */
export interface FilesTabContentProps {
  readonly workspaceRoot: string;
  readonly activeFilePath?: string | null;
  readonly onSelectFile?: (relPath: string, options: WorkspaceFileSelectOptions) => void;
  readonly onAddFileToChat?: (relPath: string) => void;
  readonly searchWorkspaceFiles?: (query: string, workspaceRoot: string) => Promise<WorkspaceDirEntry[]>;
  readonly includeHidden?: boolean;
}

export function FilesTabContent({
  workspaceRoot,
  activeFilePath,
  onSelectFile,
  onAddFileToChat,
  searchWorkspaceFiles,
  includeHidden,
}: FilesTabContentProps) {
  return (
    <WorkspaceFilesPanel
      workspaceRoot={workspaceRoot}
      {...(activeFilePath !== undefined ? { activeFilePath } : {})}
      {...(onSelectFile !== undefined ? { onSelectFile } : {})}
      {...(onAddFileToChat !== undefined ? { onAddFileToChat } : {})}
      {...(searchWorkspaceFiles !== undefined ? { searchWorkspaceFiles } : {})}
      {...(includeHidden !== undefined ? { includeHidden } : {})}
    />
  );
}
