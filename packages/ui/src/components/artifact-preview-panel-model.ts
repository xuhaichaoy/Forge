import type { LocalFileMetadata } from "../lib/tauri-host";
import { resolveFileReferencePathCandidates } from "../state/file-references";
import type { I18nMessageDescriptor, I18nValues } from "../state/i18n";
import type { ArtifactPreviewStatusState } from "./artifact-preview-views";

type FormatMessage = (descriptor: I18nMessageDescriptor, values?: I18nValues) => string;

export type MetadataPreviewState =
  | { status: "idle"; metadata: null; message?: undefined }
  | { status: "loading"; metadata: null; message?: undefined }
  | { status: "ready"; metadata: LocalFileMetadata; message?: undefined }
  | { status: "error"; metadata: null; message: string };

export function artifactPreviewState(
  formatMessage: FormatMessage,
  metadataPreview: MetadataPreviewState,
  tooLarge: boolean,
  hasReference: boolean,
): ArtifactPreviewStatusState | null {
  if (!hasReference) return null;
  if (metadataPreview.status === "idle" || metadataPreview.status === "loading") {
    return { status: "loading", message: formatMessage({ id: "artifactTab.previewLoading", defaultMessage: "Preparing preview…" }) };
  }
  if (metadataPreview.status === "error") {
    return { status: "error", message: formatMessage({ id: "artifactTab.previewError", defaultMessage: "Couldn’t load this preview" }) };
  }
  if (metadataPreview.status === "ready" && !metadataPreview.metadata.isFile) {
    return { status: "error", message: formatMessage({ id: "artifactTab.previewError", defaultMessage: "Couldn’t load this preview" }) };
  }
  if (tooLarge) {
    return {
      status: "too-large",
      message: formatMessage({ id: "artifactTab.previewTooLarge", defaultMessage: "This file is too large to preview in the side panel" }),
    };
  }
  return null;
}

export function resolveArtifactLocalPath(
  path: string | undefined,
  input: {
    referencePath: string;
    resolvedReferencePath: string;
    workspaceRoot?: string | null;
    cwd?: string | null;
  },
): string {
  if (!path) return "";
  if (input.resolvedReferencePath && path === input.referencePath) {
    return input.resolvedReferencePath;
  }
  return resolveFileReferencePathCandidates(path, {
    workspaceRoot: input.workspaceRoot,
    cwd: input.cwd,
  })[0] ?? path;
}

export function isWordDocumentPath(path: string): boolean {
  return /\.(?:doc|docx)$/i.test(path.split(/[?#]/, 1)[0] ?? "");
}
