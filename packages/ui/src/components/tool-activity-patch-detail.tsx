import { useForgeIntl, type ForgeIntlContextValue } from "./i18n-provider";
import type { FileReference } from "./file-reference-types";

type PatchFormatMessage = ForgeIntlContextValue["formatMessage"];

export interface PatchChangeViewModel {
  action: string;
  kind: "add" | "delete" | "update";
  path: string;
  diff: string;
}

export type PatchChangeForm = "inProgress" | "rejected" | "stopped" | "done";

export function PatchChangePath({
  change,
  onOpenFileReference,
}: {
  change: PatchChangeViewModel;
  onOpenFileReference?: (reference: FileReference) => void;
}) {
  const { formatMessage } = useForgeIntl();
  if (!onOpenFileReference) {
    return <code title={formatMessage({ id: "hc.toolDetail.patch.openInEditorTooltip", defaultMessage: "{path} — Open in editor" }, { path: change.path })}>{change.path}</code>;
  }
  const lineStart = patchChangeFirstChangeLine(change.diff);
  return (
    <button
      aria-label={formatMessage({ id: "hc.toolDetail.patch.openFileAriaLabel", defaultMessage: "Open {path}" }, { path: change.path })}
      className="hc-tool-detail-change-path-button"
      title={change.path}
      type="button"
      onClick={() => onOpenFileReference({ path: change.path, lineStart })}
    >
      {change.path}
    </button>
  );
}

const PATCH_HUNK_HEADER_RE = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/u;

export function patchChangeFirstChangeLine(diff: string): number {
  let firstAdditionLine: number | null = null;
  let firstDeletionLine: number | null = null;
  let hunkOldStart = 0;
  let hunkNewStart = 0;
  let hunkHasAddition = false;
  let hunkHasDeletion = false;
  for (const rawLine of diff.split(/\r?\n/u)) {
    const header = PATCH_HUNK_HEADER_RE.exec(rawLine);
    if (header) {
      hunkOldStart = Number(header[1]);
      hunkNewStart = Number(header[2]);
      hunkHasAddition = false;
      hunkHasDeletion = false;
      continue;
    }
    if (rawLine.startsWith("+++") || rawLine.startsWith("---")) continue;
    if (rawLine.startsWith("+")) {
      if (!hunkHasAddition && firstAdditionLine === null) firstAdditionLine = hunkNewStart;
      hunkHasAddition = true;
    } else if (rawLine.startsWith("-")) {
      if (!hunkHasDeletion && firstDeletionLine === null) firstDeletionLine = hunkOldStart;
      hunkHasDeletion = true;
    }
  }
  return firstAdditionLine ?? firstDeletionLine ?? 1;
}

export function patchChangeForm(status: string, running: boolean): PatchChangeForm {
  if (running || status === "inProgress") return "inProgress";
  if (status === "declined" || status === "rejected") return "rejected";
  if (status === "interrupted" || status === "aborted" || status === "failed") return "stopped";
  return "done";
}

export function patchAction(kind: "add" | "delete" | "update", form: PatchChangeForm): string {
  if (form === "rejected") return "Rejected";
  if (kind === "add") {
    if (form === "inProgress") return "Creating";
    if (form === "stopped") return "Stopped creating";
    return "Created";
  }
  if (kind === "delete") {
    if (form === "inProgress") return "Deleting";
    if (form === "stopped") return "Stopped deleting";
    return "Deleted";
  }
  if (form === "inProgress") return "Editing";
  if (form === "stopped") return "Stopped editing";
  return "Edited";
}

const PATCH_CHANGE_ACTION_KEY: Record<string, string> = {
  Creating: "creating",
  Created: "created",
  "Stopped creating": "stoppedCreating",
  Deleting: "deleting",
  Deleted: "deleted",
  "Stopped deleting": "stoppedDeleting",
  Editing: "editing",
  Edited: "edited",
  "Stopped editing": "stoppedEditing",
};

export function localizePatchChangeAction(
  action: string,
  kind: "add" | "delete" | "update",
  formatMessage: PatchFormatMessage,
): string {
  const suffix = action === "Rejected"
    ? `rejected-${kind === "delete" ? "delete" : kind === "update" ? "edit" : "add"}`
    : PATCH_CHANGE_ACTION_KEY[action];
  if (suffix == null) return action;
  return formatMessage({ id: `codex.patch.change.${suffix}`, defaultMessage: action });
}
