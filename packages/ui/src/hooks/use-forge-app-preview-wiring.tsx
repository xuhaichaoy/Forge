import type { MutableRefObject } from "react";
import { useCallback, useEffect, useMemo } from "react";
import type { Thread } from "@forge/codex-protocol";
import { FileText, FolderOpen, Globe } from "lucide-react";
import { ArtifactPreviewPanel } from "../components/artifact-preview-panel";
import { FileReferencePreviewTab } from "../components/file-preview-panel";
import { FilesTabContent } from "../components/files-tab-content";
import { HtmlPreviewTabContent } from "../components/html-preview-tab";
import type { SidePanelNewTabAction } from "../components/side-panel-new-tab-page";
import { patchFailurePathForOpen } from "../lib/format";
import { isTauriRuntime } from "../lib/tauri-host";
import { memoriesRootFromCodexHome } from "../state/app-shell-helpers";
import { artifactPreviewTabId, projectArtifactPreview, shouldOpenArtifactPreview } from "../state/artifact-preview";
import { isHtmlPath, openBrowserRuntime } from "../state/browser-runtime";
import type { CodexUiState } from "../state/codex-reducer";
import { osRevealLabel } from "../state/command-registry";
import type { CommandPanelKind, CommandPanelOptions } from "../state/command-panel";
import {
  mergeComposerAttachments,
  type ComposerAttachment,
} from "../state/composer-workflow";
import {
  basenameFromPath,
} from "../state/fuzzy-file-search-session";
import {
  fileReferenceSidePanelContextMenuItems,
  fileReferenceSidePanelTabKind,
  fileReferenceSidePanelTabId,
} from "../state/file-references";
import type { RailEntry, RailEntryReference } from "../state/render-groups";
import { threadTitle } from "../state/thread-workflow";
import { useArtifactPreviewActions } from "./use-artifact-preview-actions";
import type { useCommandPanelFileSearch } from "./use-command-panel-file-search";
import type { useSidePanelTabHost } from "./use-side-panel-tab-host";
import type { useUiPreferences } from "./use-ui-preferences";

const LOCAL_SIDE_PANEL_HOST_ID = "local";

/*
 * Mechanical extraction of a CONTIGUOUS hook cluster from ForgeAppBody
 * (artifact-preview actions + file-reference side-panel tab opener + Files
 * tab / new-tab landing actions + assistant artifact routing + active diff
 * panel). Hook call order inside the cluster is unchanged, and the cluster is
 * invoked from the exact source position the first extracted hook previously
 * occupied, so React's linear hook sequence is preserved.
 */
export interface ForgeAppPreviewWiringArgs {
  FILES_TAB_ID: string;
  activeDiff: string;
  activeThread: Thread | null;
  activeThreadScrollKey: string;
  formatUiMessage: ReturnType<typeof useUiPreferences>["formatUiMessage"];
  openArtifactPreviewTabRef: MutableRefObject<((entry: RailEntry) => void) | null>;
  openBrowserSurface: (tabId?: string | null) => void;
  openCommandPanel: (panel: CommandPanelKind, options?: CommandPanelOptions) => void;
  openFilesTabRef: MutableRefObject<(() => void) | null>;
  searchWorkspaceFilesForFilesTab: ReturnType<typeof useCommandPanelFileSearch>["searchWorkspaceFilesForFilesTab"];
  setArtifactPreview: (entry: RailEntry | null) => void;
  setComposerAttachments: (updater: (current: ComposerAttachment[]) => ComposerAttachment[]) => void;
  sidePanel: ReturnType<typeof useSidePanelTabHost>;
  state: CodexUiState;
  threadScrollOffsetsRef: MutableRefObject<Map<string, number>>;
  workspace: string;
  worktreeStatusCwd: string;
}

export function useForgeAppPreviewWiring(args: ForgeAppPreviewWiringArgs) {
  const {
    FILES_TAB_ID,
    activeDiff,
    activeThread,
    activeThreadScrollKey,
    formatUiMessage,
    openArtifactPreviewTabRef,
    openBrowserSurface,
    openCommandPanel,
    openFilesTabRef,
    searchWorkspaceFilesForFilesTab,
    setArtifactPreview,
    setComposerAttachments,
    sidePanel,
    state,
    threadScrollOffsetsRef,
    workspace,
    worktreeStatusCwd,
  } = args;
  const {
    copyFileReferenceContents,
    openFileReferenceExternal,
    openRailArtifactFileExternal,
    openRailUrl,
    previewPathContext,
    previewRailArtifact,
    resolveFileSelection,
    revealFileReference,
  } = useArtifactPreviewActions({
    activeThreadCwd: activeThread?.cwd,
    defaultCwd: state.hostStatus?.defaultCwd,
    setArtifactPreview,
    workspace,
  });
  const handlePatchFailureOpenPath = useCallback((path: string) => {
    const target = patchFailurePathForOpen(path, worktreeStatusCwd);
    if (!target) return;
    openFileReferenceExternal({ path: target, lineStart: 1, lineEnd: 1 });
  }, [openFileReferenceExternal, worktreeStatusCwd]);
  const openFileReferenceSidePanelTab = useCallback(function openFileReferenceTab(
    reference: { path: string; lineStart: number; lineEnd?: number; hostId?: string | null },
    options: {
      isPreview: boolean;
      hostId?: string | null;
      tabId?: string;
      title?: string;
      workspaceRoot?: string | null;
      cwd?: string | null;
      viewSource?: boolean;
    },
  ) {
    const resolvedReference = resolveFileSelection(reference);
    if (!resolvedReference) return;
    const hostId = resolvedReference.hostId ?? options.hostId ?? LOCAL_SIDE_PANEL_HOST_ID;
    /*
     * codex: open-workspace-file-*.js `Y` gate — browserSidebarEnabled && local
     * host && isHtmlPath(path) routes the open to the rendered web preview
     * (Codex shows it in the Browser sidebar; Forge renders it in a side-panel
     * tab via a sandboxed asset-protocol iframe) instead of the source tab.
     * View source opts out (Codex's modifiedClick equivalent); remote-host
     * files have no local asset URL.
     */
    if (
      options.viewSource !== true
      && hostId === LOCAL_SIDE_PANEL_HOST_ID
      && isHtmlPath(resolvedReference.path)
      && isTauriRuntime()
    ) {
      sidePanel.controller.openTab({
        id: `html-preview:${resolvedReference.path}`,
        Component: HtmlPreviewTabContent,
        title: options.title ?? basenameFromPath(resolvedReference.path),
        tooltip: resolvedReference.path,
        icon: <Globe size={14} aria-hidden="true" />,
        isPreview: options.isPreview,
        contextMenuItems: fileReferenceSidePanelContextMenuItems({
          onOpenFile: () => openFileReferenceExternal(resolvedReference),
          onCopyPath: () => {
            void globalThis.navigator?.clipboard?.writeText(resolvedReference.path);
          },
          onCopyContents: () => copyFileReferenceContents(resolvedReference),
          onRevealPath: () => revealFileReference(resolvedReference),
          revealLabel: osRevealLabel(),
        }, formatUiMessage),
        props: {
          path: resolvedReference.path,
          onViewSource: (sourceReference: { path: string; lineStart: number; lineEnd?: number }) => {
            openFileReferenceTab(sourceReference, { isPreview: false, viewSource: true });
          },
          onOpenExternal: openFileReferenceExternal,
        },
      });
      return;
    }
    const tabReference = { ...resolvedReference, hostId };
    const tabId = options.tabId ?? fileReferenceSidePanelTabId(resolvedReference.path, hostId);
    sidePanel.controller.openTab({
      id: tabId,
      Component: FileReferencePreviewTab,
      title: options.title ?? basenameFromPath(resolvedReference.path),
      tooltip: resolvedReference.path,
      icon: <FileText size={14} aria-hidden="true" />,
      isPreview: options.isPreview,
      kind: fileReferenceSidePanelTabKind(hostId),
      contextMenuItems: fileReferenceSidePanelContextMenuItems({
        onOpenFile: () => openFileReferenceExternal(tabReference),
        onCopyPath: () => {
          void globalThis.navigator?.clipboard?.writeText(resolvedReference.path);
        },
        onCopyContents: () => copyFileReferenceContents(tabReference),
        onRevealPath: () => revealFileReference(tabReference),
        revealLabel: osRevealLabel(),
      }, formatUiMessage),
      props: {
        path: resolvedReference.path,
        lineStart: resolvedReference.lineStart,
        lineEnd: resolvedReference.lineEnd,
        hostId,
        refreshKey: 0,
        workspaceRoot: options.workspaceRoot ?? previewPathContext.workspaceRoot,
        cwd: options.cwd ?? previewPathContext.cwd,
      },
    });
  }, [
    copyFileReferenceContents,
    formatUiMessage,
    openFileReferenceExternal,
    previewPathContext.cwd,
    previewPathContext.workspaceRoot,
    revealFileReference,
    resolveFileSelection,
    sidePanel.controller,
  ]);
  const memoryCitationRoot = useMemo(
    () => memoriesRootFromCodexHome(state.hostStatus?.codexHome),
    [state.hostStatus?.codexHome],
  );

  /*
   * Late binding of the Files-tab opener (referenced from the early-defined
   * `toggleWorkspaceFilesPanel` via `openFilesTabRef`). Closure captures the
   * current `worktreeStatusCwd` + `openFileReferenceExternal` each render, so
   * the next ⌘⇧E / Files-card click always sees fresh values.
   *
   * codex: card onSelect in thread-app-shell-chrome-*.js — Files card calls
   *   `Qe = () => U != null && (de(p, null, { hostId, target, workspaceRoot: U }), l?.());`
   * where `de(...)` ultimately resolves to a
   * `controller.openTab(workspaceDirectoryTree, { props: { root: U, onSelectFile: ... } })`.
   * Forge collapses this into a direct `openTab(FilesTabContent, { ... })`.
   */
  useEffect(() => {
    openFilesTabRef.current = () => {
      if (!worktreeStatusCwd) return;
      sidePanel.controller.openTab({
        id: FILES_TAB_ID,
        Component: FilesTabContent,
        title: "Files",
        tooltip: "Workspace files",
        icon: <FolderOpen size={14} aria-hidden="true" />,
        props: {
          workspaceRoot: worktreeStatusCwd,
          onSelectFile: (relPath: string, _options: { isPreview: boolean }) => {
            const root = worktreeStatusCwd.replace(/\/$/, "");
            const reference = { path: `${root}/${relPath}`, lineStart: 1, lineEnd: 1 };
            openFileReferenceSidePanelTab(reference, {
              // codex: review-file-source-tab-*.js `ia(...)` forces pinned
              // when selecting from the empty workspace-browser tab (`t == null`).
              isPreview: false,
              workspaceRoot: root,
              cwd: root,
            });
            sidePanel.controller.closeTab(FILES_TAB_ID);
          },
          onAddFileToChat: (relPath: string) => {
            const root = worktreeStatusCwd.replace(/\/$/, "");
            const path = `${root}/${relPath}`;
            setComposerAttachments((current) =>
              mergeComposerAttachments(current, [{
                type: "mention",
                name: basenameFromPath(relPath),
                path,
              }]),
            );
          },
          searchWorkspaceFiles: searchWorkspaceFilesForFilesTab,
        },
      });
    };
  }, [
    FILES_TAB_ID,
    openFilesTabRef,
    sidePanel,
    worktreeStatusCwd,
    openFileReferenceSidePanelTab,
    searchWorkspaceFilesForFilesTab,
    setComposerAttachments,
  ]);

  /*
   * codex: thread-app-shell-chrome-*.js landing-page action
   * list, gated by per-feature visibility. Forge only emits cards whose
   * underlying behaviour is implemented:
   *   • Files — wired to `openFilesTabRef.current()` above.
   *   • Browser — wired to the Tauri Browser runtime bridge.
   *   • Terminal / Timeline / Side chat / Review — omitted until backed by
   *     host/protocol flows. Adding them as no-op cards would be dead UI.
   */
  const sidePanelNewTabActions = useMemo<readonly SidePanelNewTabAction[]>(() => {
    const actions: SidePanelNewTabAction[] = [];
    if (worktreeStatusCwd) {
      actions.push({
        id: "open-file",
        title: formatUiMessage({ id: "thread.sidePanel.openFile", defaultMessage: "Files" }),
        description: formatUiMessage({ id: "thread.sidePanel.newTab.openFile.description", defaultMessage: "Browse project files" }),
        icon: <FolderOpen size={18} aria-hidden="true" />,
        onSelect: () => openFilesTabRef.current?.(),
      });
    }
    if (isTauriRuntime()) {
      actions.push({
        id: "open-browser",
        title: "Browser",
        description: "Open Browser",
        icon: <Globe size={18} aria-hidden="true" />,
        onSelect: () => openBrowserSurface(),
      });
    }
    return actions;
  }, [formatUiMessage, openBrowserSurface, openFilesTabRef, worktreeStatusCwd]);

  // CODEX-REF: local-conversation-thread-*.js + review-file-source-tab-*.js —
  // file/source opens route through the AppShell side panel tab controller,
  // using preview tabs for inline conversation citations and rail source rows.
  const previewConversationFileReferenceAndOpenRail = useCallback((reference: {
    path: string;
    lineStart: number;
    lineEnd?: number;
  }) => {
    openFileReferenceSidePanelTab(reference, { isPreview: true });
  }, [openFileReferenceSidePanelTab]);
  const previewRailFileReferenceAndOpenRail = useCallback((reference: RailEntryReference) => {
    openFileReferenceSidePanelTab(reference, { isPreview: true });
  }, [openFileReferenceSidePanelTab]);
  const openAssistantArtifactInSidePanel = useCallback((entry: RailEntry) => {
    /*
     * codex: local-conversation-thread-*.js `LD` card click — a website
     * end-resource opens in the Codex Browser: URL targets via the
     * open-in-browser host message, local .html paths via the bare open-file
     * request (the browser-sidebar file:// route). The local-path leg reuses
     * the file-reference opener so the html→Browser gate (and its non-Tauri
     * source-view fallback) stays in one place.
     */
    if (entry.status === "website" && entry.action?.kind === "url") {
      const target = entry.action.url;
      if (/^https?:\/\//i.test(target)) {
        if (isTauriRuntime()) {
          void openBrowserRuntime(target);
        } else {
          openRailUrl(target);
        }
        return;
      }
      previewRailFileReferenceAndOpenRail({ path: target, lineStart: 1 });
      return;
    }
    if (shouldOpenArtifactPreview(entry)) {
      previewRailArtifact(entry);
      return;
    }
    if (entry.reference) {
      previewRailFileReferenceAndOpenRail(entry.reference);
      return;
    }
    if (entry.action?.kind === "url") {
      openRailUrl(entry.action.url);
      return;
    }
    previewRailArtifact(entry);
  }, [
    openRailUrl,
    previewRailArtifact,
    previewRailFileReferenceAndOpenRail,
  ]);
  const revealAssistantEndResource = useCallback((entry: RailEntry) => {
    const reference = entry.action?.kind === "file" ? entry.action.reference : entry.reference;
    if (!reference) return;
    revealFileReference(reference);
  }, [revealFileReference]);

  useEffect(() => {
    openArtifactPreviewTabRef.current = (entry: RailEntry) => {
      const preview = projectArtifactPreview(entry);
      const hostId = preview.reference?.hostId ?? LOCAL_SIDE_PANEL_HOST_ID;
      const tabId = artifactPreviewTabId(entry, hostId);
      const openArtifactSourceInPlace = (reference: RailEntryReference) => {
        openFileReferenceSidePanelTab(reference, {
          // codex: artifact-tab-content.electron-*.js View source calls the
          // source-tab opener with the current artifact `tabId`; the tab
          // controller updates that id in place and defaults preview=false.
          isPreview: false,
          hostId,
          tabId,
          title: preview.title,
          workspaceRoot: previewPathContext.workspaceRoot,
          cwd: previewPathContext.cwd,
          // View source must show the source even for .html (bypass the
          // html→Browser gate, like Codex's modifiedClick path).
          viewSource: true,
        });
      };
      sidePanel.controller.openTab({
        id: tabId,
        Component: ArtifactPreviewPanel,
        title: preview.title,
        tooltip: preview.title,
        icon: <FileText size={14} aria-hidden="true" />,
        isPreview: true,
        kind: preview.reference ? fileReferenceSidePanelTabKind(hostId) : undefined,
        props: {
          entry,
          hostId,
          ...(preview.reference ? {
            path: preview.reference.path,
            lineStart: preview.reference.lineStart,
            lineEnd: preview.reference.lineEnd,
          } : {}),
          refreshKey: 0,
          workspaceRoot: previewPathContext.workspaceRoot,
          cwd: previewPathContext.cwd,
          onOpenFileReference: openArtifactSourceInPlace,
          onOpenFileExternal: openRailArtifactFileExternal,
          onOpenUrl: openRailUrl,
        },
      });
    };
    return () => {
      openArtifactPreviewTabRef.current = null;
    };
  }, [
    openArtifactPreviewTabRef,
    openRailArtifactFileExternal,
    openRailUrl,
    previewPathContext.cwd,
    previewPathContext.workspaceRoot,
    openFileReferenceSidePanelTab,
    sidePanel.controller,
  ]);

  const rememberThreadScrollOffset = useCallback((distanceFromBottomPx: number) => {
    threadScrollOffsetsRef.current.set(activeThreadScrollKey, Math.max(0, distanceFromBottomPx));
  }, [activeThreadScrollKey, threadScrollOffsetsRef.current]);

  /*
   * codex: `wa(o)` Review-changes deep-link; the optional `filePath` is the
   * `wa(o, { path })` overload — per-file Review row in TurnDiffBlock.
   */
  const openActiveDiffPanel = useCallback(
    (filePath?: string) => {
      const diff = activeDiff.trim();
      const focusedPath = typeof filePath === "string" && filePath.trim().length > 0 ? filePath.trim() : null;
      openCommandPanel("diff", {
        status: diff ? "ready" : "empty",
        message: diff
          ? focusedPath
            ? `Reviewing ${focusedPath}`
            : `${diff.split("\n").length} diff line(s)`
          : "No active thread diff is available.",
        entries: diff
          ? [
              {
                id: focusedPath ? `diff:active-thread:${focusedPath}` : "diff:active-thread",
                title: focusedPath ?? "Active thread diff",
                kind: "diff",
                meta: activeThread ? threadTitle(activeThread) : undefined,
                details: diff.split("\n").slice(0, 80),
              },
            ]
          : [],
      });
    },
    [activeDiff, activeThread, openCommandPanel],
  );
  return {
    copyFileReferenceContents,
    handlePatchFailureOpenPath,
    memoryCitationRoot,
    openActiveDiffPanel,
    openAssistantArtifactInSidePanel,
    openFileReferenceExternal,
    openRailArtifactFileExternal,
    openRailUrl,
    previewConversationFileReferenceAndOpenRail,
    previewPathContext,
    previewRailArtifact,
    previewRailFileReferenceAndOpenRail,
    rememberThreadScrollOffset,
    revealAssistantEndResource,
    revealFileReference,
    sidePanelNewTabActions,
  };
}
