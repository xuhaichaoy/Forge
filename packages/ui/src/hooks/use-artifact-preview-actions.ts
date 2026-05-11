import { useCallback, useMemo } from "react";
import { shouldOpenArtifactPreview } from "../state/artifact-preview";
import type { CodexUiAction } from "../state/codex-reducer";
import {
  normalizeFileReference,
  resolveFileReferencePathCandidates,
  type FileReferenceSelection,
} from "../state/file-references";
import type { RailEntry, RailEntryReference } from "../state/render-groups";
import { formatError } from "../lib/format";
import { openFileReference } from "../lib/tauri-host";

export interface ArtifactPreviewPathContext {
  cwd: string;
  workspaceRoot: string;
}

export function useArtifactPreviewActions({
  activeThreadCwd,
  defaultCwd,
  dispatch,
  setArtifactPreview,
  setFileReference,
  workspace,
}: {
  activeThreadCwd?: string | null;
  defaultCwd?: string | null;
  dispatch: (action: CodexUiAction) => void;
  setArtifactPreview: (entry: RailEntry | null) => void;
  setFileReference: (reference: FileReferenceSelection | null) => void;
  workspace: string;
}) {
  const previewPathContext = useMemo(
    () => ({
      workspaceRoot: defaultCwd || workspace,
      cwd: activeThreadCwd || workspace,
    }),
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
    openAssistantArtifact,
    openFileReferenceExternal,
    openRailArtifactFileExternal,
    openRailUrl,
    previewConversationFileReference,
    previewPathContext,
    previewRailArtifact,
    previewRailFileReference,
    resolveFileSelection,
  };
}
