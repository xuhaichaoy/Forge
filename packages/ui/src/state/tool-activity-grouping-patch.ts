/*
 * Patch / file-change summary layer of the tool-activity grouping projection,
 * extracted verbatim from tool-activity-grouping.ts (mechanical split): patch
 * item summaries, diff-stat extraction and the file-change count segments
 * (Codex 26.602-aligned wording, incl. the stopped/running create states).
 */
import { stringField } from "../lib/format";

import { formatMessage } from "./i18n";
import type { ItemRecord, ThreadItem, ToolActivitySummary } from "./render-group-types";
import { isCompletedRecord, isItemInProgress } from "./thread-item-fields";
import { displayPath, patchChanges, patchKind, patchPath } from "./tool-activity-fields";
import { lowerInitial } from "./tool-activity-grouping-labels";

interface PatchSummary {
  created: number;
  runningCreated: number;
  stoppedCreated: number;
  runningCreatedLineCount: number;
  edited: number;
  runningEdited: number;
  deleted: number;
  runningDeleted: number;
  label: string;
  activeLabel: string;
  activeDiffStats: ToolActivitySummary["activeDiffStats"];
}

export function patchSummary(item: ThreadItem): PatchSummary {
  const changes = patchChanges(item);
  let created = 0;
  let runningCreated = 0;
  let stoppedCreated = 0;
  let runningCreatedLineCount = 0;
  let edited = 0;
  let runningEdited = 0;
  let deleted = 0;
  let runningDeleted = 0;
  const stopped = patchStoppedLikeCodexDesktop(item);
  for (const change of changes) {
    const kind = patchKind(change);
    const success = patchSuccess(item);
    const running = success === null;
    if (kind === "add") {
      created += 1;
      if (running && stopped) stoppedCreated += 1;
      else if (running) {
        runningCreated += 1;
        runningCreatedLineCount += patchCreatedLineCount(change);
      }
    } else if (kind === "delete") {
      deleted += 1;
      if (running) runningDeleted += 1;
    } else {
      edited += 1;
      if (running) runningEdited += 1;
    }
  }

  const lastChange = changes[changes.length - 1] ?? null;
  const lastKind = lastChange ? patchKind(lastChange) : "update";
  const lastPath = lastChange ? patchPath(lastChange) : "";
  const activeDiffStats = lastChange ? patchDiffStats(lastChange) : null;
  return {
    created,
    runningCreated,
    stoppedCreated,
    runningCreatedLineCount,
    edited,
    runningEdited,
    deleted,
    runningDeleted,
    label: fileChangeSummaryLabel({
      createdFiles: created,
      runningCreatedFiles: runningCreated,
      stoppedCreatedFiles: stoppedCreated,
      runningCreatedLineCount,
      editedFiles: edited,
      runningEditedFiles: runningEdited,
      deletedFiles: deleted,
      runningDeletedFiles: runningDeleted,
    }, false) ?? formatMessage({ id: "hc.toolActivity.patch.editedFilesFallback", defaultMessage: "Edited files" }),
    activeLabel: patchActionLabel(lastKind, lastPath, true),
    activeDiffStats,
  };
}

export function patchDetail(item: ThreadItem): string {
  const inProgress = isItemInProgress(item);
  return patchChanges(item).map((change) => {
    const label = patchActionLabel(patchKind(change), patchPath(change), inProgress);
    const diff = stringField(change, "diff") || stringField(change, "unifiedDiff") || stringField(change, "patch");
    return diff ? `${label}\n${diff}` : label;
  }).join("\n\n");
}

function patchSuccess(item: ThreadItem): boolean | null {
  const record = item as ItemRecord;
  const success = record.success;
  if (typeof success === "boolean") return success;
  const status = stringField(record, "status") || stringField(record, "executionStatus");
  if (status === "success" || status === "succeeded") return true;
  if (status === "failed" || status === "error" || status === "errored") return false;
  // Desktop patch grouping branches on `success`; replayed Forge patch
  // payloads can carry only a terminal status, so normalize that after
  // preserving explicit failure states.
  if (success !== null && isCompletedRecord(item)) return true;
  return null;
}

function patchStoppedLikeCodexDesktop(item: ThreadItem): boolean {
  const record = item as ItemRecord;
  const status = stringField(record, "_turnStatus") || stringField(record, "status") || stringField(record, "executionStatus");
  return status === "cancelled" || status === "canceled" || status === "interrupted";
}

function patchCreatedLineCount(change: Record<string, unknown>): number {
  const content = stringField(change, "content");
  if (content) return lineCount(content);
  const diff = stringField(change, "diff") || stringField(change, "unifiedDiff") || stringField(change, "patch");
  if (!diff) return 0;
  return diff.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
}

function patchDiffStats(change: Record<string, unknown>): ToolActivitySummary["activeDiffStats"] {
  const diff = stringField(change, "diff") || stringField(change, "unifiedDiff") || stringField(change, "patch");
  if (!diff) {
    const content = stringField(change, "content");
    const added = content ? lineCount(content) : 0;
    return added > 0 ? { linesAdded: added, linesRemoved: 0 } : null;
  }
  let linesAdded = 0;
  let linesRemoved = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) linesAdded += 1;
    else if (line.startsWith("-") && !line.startsWith("---")) linesRemoved += 1;
  }
  return linesAdded > 0 || linesRemoved > 0 ? { linesAdded, linesRemoved } : null;
}

function lineCount(value: string): number {
  const normalized = value.replace(/\r\n/gu, "\n");
  const lines = normalized.split("\n");
  return lines.length > 0 && lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
}

function patchActionLabel(kind: "add" | "delete" | "update", path: string, inProgress: boolean): string {
  const target = displayPath(path || "file");
  if (kind === "add") {
    return inProgress
      ? formatMessage({ id: "hc.toolActivity.patch.creating", defaultMessage: "Creating {path}" }, { path: target })
      : formatMessage({ id: "hc.toolActivity.patch.created", defaultMessage: "Created {path}" }, { path: target });
  }
  if (kind === "delete") {
    return inProgress
      ? formatMessage({ id: "hc.toolActivity.patch.deleting", defaultMessage: "Deleting {path}" }, { path: target })
      : formatMessage({ id: "hc.toolActivity.patch.deleted", defaultMessage: "Deleted {path}" }, { path: target });
  }
  return inProgress
    ? formatMessage({ id: "hc.toolActivity.patch.editing", defaultMessage: "Editing {path}" }, { path: target })
    : formatMessage({ id: "hc.toolActivity.patch.edited", defaultMessage: "Edited {path}" }, { path: target });
}

export function fileChangeSummaryLabel(
  counts: Pick<ToolActivitySummary["counts"], "createdFiles" | "editedFiles" | "deletedFiles">
    & Partial<Pick<ToolActivitySummary["counts"], "runningCreatedFiles" | "stoppedCreatedFiles" | "runningCreatedLineCount" | "runningEditedFiles" | "runningDeletedFiles">>,
  inProgress: boolean,
): string | null {
  const runningCreated = counts.runningCreatedFiles ?? 0;
  const stoppedCreated = counts.stoppedCreatedFiles ?? 0;
  const runningCreatedLineCount = counts.runningCreatedLineCount ?? 0;
  const runningEdited = counts.runningEditedFiles ?? 0;
  const runningDeleted = counts.runningDeletedFiles ?? 0;
  const completedCreated = Math.max(0, counts.createdFiles - runningCreated - stoppedCreated);
  const completedEdited = Math.max(0, counts.editedFiles - runningEdited);
  const completedDeleted = Math.max(0, counts.deletedFiles - runningDeleted);
  const segments = [
    completedCreated > 0 ? fileChangeCountSegment(inProgress ? "creating" : "created", completedCreated) : "",
    stoppedCreated > 0
      ? formatMessage(
          { id: "localConversation.toolActivitySummary.stoppedCreating.leading", defaultMessage: "{count, plural, one {Stopped creating # file} other {Stopped creating # files}}" },
          { count: stoppedCreated },
        )
      : "",
    runningCreated > 0 ? runningCreatedSegment(runningCreated, runningCreatedLineCount) : "",
    completedEdited > 0 ? fileChangeCountSegment(inProgress ? "editing" : "edited", completedEdited) : "",
    runningEdited > 0 ? fileChangeCountSegment("editing", runningEdited) : "",
    completedDeleted > 0 ? fileChangeCountSegment(inProgress ? "deleting" : "deleted", completedDeleted) : "",
    runningDeleted > 0 ? fileChangeCountSegment("deleting", runningDeleted) : "",
  ].filter(Boolean);
  if (segments.length === 0) return null;
  return segments.map((segment, index) => index === 0 ? segment : lowerInitial(segment)).join(", ");
}

const FILE_CHANGE_SEGMENT_MESSAGES: Record<"created" | "creating" | "edited" | "editing" | "deleted" | "deleting", { id: string; defaultMessage: string }> = {
  created: { id: "localConversation.toolActivitySummary.created.leading", defaultMessage: "{count, plural, one {Created # file} other {Created # files}}" },
  creating: { id: "localConversation.toolActivitySummary.creating.leading", defaultMessage: "{count, plural, one {Creating # file} other {Creating # files}}" },
  edited: { id: "localConversation.toolActivitySummary.edited.leading", defaultMessage: "{count, plural, one {Edited # file} other {Edited # files}}" },
  editing: { id: "localConversation.toolActivitySummary.editing.leading", defaultMessage: "{count, plural, one {Editing # file} other {Editing # files}}" },
  deleted: { id: "localConversation.toolActivitySummary.deleted.leading", defaultMessage: "{count, plural, one {Deleted # file} other {Deleted # files}}" },
  deleting: { id: "localConversation.toolActivitySummary.deleting.leading", defaultMessage: "{count, plural, one {Deleting # file} other {Deleting # files}}" },
};

function fileChangeCountSegment(kind: keyof typeof FILE_CHANGE_SEGMENT_MESSAGES, count: number): string {
  return formatMessage(FILE_CHANGE_SEGMENT_MESSAGES[kind], { count });
}

function runningCreatedSegment(count: number, lineCount: number): string {
  if (lineCount <= 0) return fileChangeCountSegment("creating", count);
  const addedLineText = formatMessage(
    { id: "localConversation.toolActivitySummary.addedLines", defaultMessage: "writing {lineCount, plural, one {# line} other {# lines}}" },
    { lineCount },
  );
  return formatMessage(
    { id: "localConversation.toolActivitySummary.creatingWithLines.leading", defaultMessage: "{count, plural, one {Creating # file} other {Creating # files}} • {addedLineText}" },
    { count, addedLineText },
  );
}
