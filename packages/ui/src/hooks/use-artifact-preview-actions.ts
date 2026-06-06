import { useCallback, useMemo } from "react";
import { useServices } from "../components/services-context";
import { shouldOpenArtifactPreview } from "../state/artifact-preview";
import {
  fileReferenceResolutionContext,
  normalizeFileReference,
  resolveFileReferencePathCandidates,
  type FileReferenceSelection,
} from "../state/file-references";
import type { RailEntry, RailEntryReference } from "../state/render-groups";
import { formatError } from "../lib/format";
import { openFileReference, readTextFile, revealPath } from "../lib/tauri-host";

export interface ArtifactPreviewPathContext {
  cwd: string;
  workspaceRoot: string;
}

export function useArtifactPreviewActions({
  activeThreadCwd,
  defaultCwd,
  setArtifactPreview,
  setFileReference,
  workspace,
}: {
  activeThreadCwd?: string | null;
  defaultCwd?: string | null;
  setArtifactPreview: (entry: RailEntry | null) => void;
  setFileReference: (reference: FileReferenceSelection | null) => void;
  workspace: string;
}) {
  const { dispatch } = useServices();
  // codex resolves file references against the thread/workspace cwd, never $HOME.
  // fileReferenceResolutionContext drops any root equal to the host default ($HOME),
  // so a bare filename in a workspace-less thread no longer mis-anchors to $HOME/<name>.
  const previewPathContext = useMemo(
    () => fileReferenceResolutionContext({ workspace, threadCwd: activeThreadCwd, defaultCwd }),
    [activeThreadCwd, defaultCwd, workspace],
  );

  const resolveFileSelection = useCallback((reference: {
    path: string;
    lineStart: number;
    lineEnd?: number;
  }): FileReferenceSelection | null => {
    const nextReference = normalizeFileReference(reference);
    if (!nextReference) return null;
    const resolvedPath = resolveFileReferencePathCandidates(nextReference.path, previewPathContext)[0];
    return resolvedPath ? { ...nextReference, path: resolvedPath } : nextReference;
  }, [previewPathContext]);

  const previewConversationFileReference = useCallback((reference: { path: string; lineStart: number; lineEnd?: number }) => {
    const nextReference = resolveFileSelection(reference);
    if (nextReference) setFileReference(nextReference);
  }, [resolveFileSelection, setFileReference]);

  const previewRailArtifact = useCallback((entry: RailEntry) => {
    setArtifactPreview(entry);
  }, [setArtifactPreview]);

  const previewRailFileReference = useCallback((reference: RailEntryReference) => {
    setArtifactPreview(null);
    previewConversationFileReference(reference);
  }, [previewConversationFileReference, setArtifactPreview]);

  const openFileReferenceExternal = useCallback((reference: FileReferenceSelection) => {
    void openFileReference(reference.path, reference.lineStart).catch((error) => {
      dispatch({ type: "log", text: formatError(error), level: "warn" });
    });
  }, [dispatch]);

  // codex workspace-file-context-menu `workspace-file-reveal-path` (attached to
  // inline file references via inline-mentions-*.js) — resolve the citation to
  // an absolute path, then reveal it in the OS file manager.
  const revealFileReference = useCallback((reference: { path: string; lineStart: number; lineEnd?: number }) => {
    const normalized = resolveFileSelection(reference);
    if (!normalized) return;
    void revealPath(normalized.path).catch((error) => {
      dispatch({ type: "log", text: formatError(error), level: "warn" });
    });
  }, [dispatch, resolveFileSelection]);

  // codex `workspace-file-copy-contents` — resolve + read the file's text + copy.
  const copyFileReferenceContents = useCallback((reference: { path: string; lineStart: number; lineEnd?: number }) => {
    const normalized = resolveFileSelection(reference);
    if (!normalized) return;
    void (async () => {
      try {
        const contents = await readTextFile(normalized.path);
        await navigator.clipboard?.writeText(contents);
      } catch (error) {
        dispatch({ type: "log", text: formatError(error), level: "warn" });
      }
    })();
  }, [dispatch, resolveFileSelection]);

  const openRailArtifactFileExternal = useCallback((reference: RailEntryReference) => {
    const normalized = resolveFileSelection(reference);
    if (!normalized) return;
    openFileReferenceExternal(normalized);
  }, [openFileReferenceExternal, resolveFileSelection]);

  const openRailUrl = useCallback((url: string) => {
    const normalized = url.trim();
    if (!/^https?:\/\//.test(normalized)) {
      dispatch({ type: "log", text: `Cannot open URL: ${url}`, level: "warn" });
      return;
    }
    const opened = globalThis.open?.(normalized, "_blank", "noopener,noreferrer");
    if (!opened) {
      dispatch({ type: "log", text: `URL ready to open: ${normalized}`, level: "info" });
    }
  }, [dispatch]);

  const openAssistantArtifact = useCallback((entry: RailEntry) => {
    if (shouldOpenArtifactPreview(entry)) {
      previewRailArtifact(entry);
      return;
    }
    if (entry.reference) {
      previewRailFileReference(entry.reference);
      return;
    }
    if (entry.action?.kind === "url") {
      openRailUrl(entry.action.url);
      return;
    }
    previewRailArtifact(entry);
  }, [openRailUrl, previewRailArtifact, previewRailFileReference]);

  return {
    copyFileReferenceContents,
    openAssistantArtifact,
    openFileReferenceExternal,
    openRailArtifactFileExternal,
    openRailUrl,
    previewConversationFileReference,
    previewPathContext,
    previewRailArtifact,
    previewRailFileReference,
    resolveFileSelection,
    revealFileReference,
  };
}
