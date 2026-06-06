/*
 * Build a turn-level unified diff by merging the per-file patches a turn
 * produced — the client-side fallback Codex Desktop uses when the backend's
 * `turn/diff/updated` notification (runtime.turnDiff) never arrives.
 *
 * codex: app-server-manager-signals-*.js
 *   - `Nx(path, change)`  → one file → git-diff text. For `update` it synthesizes
 *     the `diff --git` / `--- ` / `+++ ` headers only when the per-file `diff`
 *     is a bare `@@` hunk; for `add`/`delete` the change's `diff` field carries
 *     the file *content* (see Codex `o_`), so the diff is built by prefixing
 *     each line with `+` / `-` under a synthetic `@@` header.
 *   - `Fx(patchBatches)` → merge across files: dedup by (new) path; when the
 *     same file is updated again in-place, append just the follow-up hunks to
 *     the existing segment; join segments with "\n\n" and end with "\n".
 *   - turn builder: `_ = e.diff ?? Fx(m)` then `push({ type: "turn-diff", unifiedDiff: _ })`.
 *
 * HiCodex's FileUpdateChange is `{ path, kind, diff }` (v2 protocol). The diff
 * produced here feeds the "Edited N files +X -Y" card (turnDiffViewModel parses
 * the `diff --git` / `+++ ` headers) and stays valid for the host `git apply`
 * that powers Undo / Reapply.
 */
import type { AccumulatedThreadItem } from "./render-groups";

const TRAILING_NEWLINES = /[\r\n]+$/u;

/**
 * Merge the file-change (patch) items of a single turn into one unified diff.
 * `patchItems` must already be scoped to the turn; failed/declined patches and
 * empty changes are skipped (mirrors Codex `Fx` dropping `success === false`).
 * Returns "" when there is nothing to show.
 */
export function unifiedDiffFromTurnPatchItems(
  patchItems: ReadonlyArray<AccumulatedThreadItem>,
): string {
  const segments: string[] = [];
  const segmentIndexByPath = new Map<string, number>();

  for (const item of patchItems) {
    const status = (item as { status?: unknown }).status;
    if (status === "failed" || status === "declined") continue;
    for (const change of normalizeChanges((item as { changes?: unknown }).changes)) {
      const rendered = renderFileDiff(change);
      if (rendered == null) continue;

      const isUpdate = changeKindType(change) === "update";
      const movePath = changeMovePath(change);
      const path = changePath(change) ?? "";
      // Codex keys segments by the file's *current* path (rename target wins).
      const keyPath = isUpdate && movePath != null ? movePath : path;
      // Only an in-place update (no rename) folds follow-up hunks into a prior segment.
      const mergeable = isUpdate && movePath == null;
      const body = rendered.replace(TRAILING_NEWLINES, "");
      const prevIndex = segmentIndexByPath.get(keyPath);

      if (mergeable && prevIndex != null) {
        const startsAtHunk = body.startsWith("@@");
        const hunkStart = startsAtHunk ? 0 : body.indexOf("\n@@");
        if (hunkStart !== -1) {
          const followUp = startsAtHunk ? body : body.slice(hunkStart + 1);
          segments[prevIndex] = `${segments[prevIndex]}\n${followUp}`;
          continue;
        }
      }

      segments.push(body);
      if (mergeable) segmentIndexByPath.set(keyPath, segments.length - 1);
      else segmentIndexByPath.delete(keyPath);
    }
  }

  const joined = segments.join("\n\n");
  return joined.length > 0 ? `${joined}\n` : "";
}

/** One `FileUpdateChange` → git unified-diff text (codex `Nx`). */
function renderFileDiff(change: Record<string, unknown>): string | null {
  const path = changePath(change);
  if (!path) return null;
  const kindType = changeKindType(change);
  const rawDiff = changeDiff(change).replace(/\r\n/gu, "\n");

  if (kindType === "add") {
    const lines = dropTrailingEmpty(rawDiff.split("\n"));
    const hunk = lines.length > 0
      ? `@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => `+${line}`).join("\n")}\n`
      : "";
    return [`diff --git a/${path} b/${path}`, "new file mode 100644", "--- /dev/null", `+++ b/${path}`, hunk]
      .filter(Boolean)
      .join("\n");
  }

  if (kindType === "delete") {
    const lines = dropTrailingEmpty(rawDiff.split("\n"));
    const hunk = lines.length > 0
      ? `@@ -1,${lines.length} +0,0 @@\n${lines.map((line) => `-${line}`).join("\n")}\n`
      : "";
    return [`diff --git a/${path} b/${path}`, "deleted file mode 100644", `--- a/${path}`, "+++ /dev/null", hunk]
      .filter(Boolean)
      .join("\n");
  }

  // "update" — and any unrecognized kind that still carries a diff hunk: render it
  // as an in-place edit, synthesizing the git / `--- ` / `+++ ` headers when the
  // per-file diff is a bare hunk. Falling through here (rather than gating on
  // kindType === "update") keeps the card working even if the runtime kind shape
  // differs from the generated protocol type.
  const body = rawDiff.trimStart();
  if (body.length === 0) return null;
  const newPath = changeMovePath(change) ?? path;
  const hasFileHeader = /\n?---\s/u.test(body);
  const hasGitHeader = /^diff --git /mu.test(body);
  const withHeaders = hasFileHeader ? body : `--- a/${path}\n+++ b/${newPath}\n${body}`;
  return `${hasGitHeader ? "" : `diff --git a/${path} b/${newPath}\n`}${withHeaders}`;
}

/** Accept both the v2 array form and the legacy `{ path: change }` map form. */
function normalizeChanges(changes: unknown): Record<string, unknown>[] {
  if (Array.isArray(changes)) {
    return changes.filter((change): change is Record<string, unknown> => Boolean(change) && typeof change === "object");
  }
  if (changes && typeof changes === "object") {
    return Object.entries(changes as Record<string, unknown>).map(([path, value]) => {
      const change = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
      return { ...change, path: (typeof change.path === "string" && change.path) || path };
    });
  }
  return [];
}

function changePath(change: Record<string, unknown>): string | null {
  return typeof change.path === "string" && change.path.length > 0 ? change.path : null;
}

function changeKind(change: Record<string, unknown>): Record<string, unknown> {
  const kind = change.kind;
  return kind && typeof kind === "object" ? (kind as Record<string, unknown>) : {};
}

function changeKindType(change: Record<string, unknown>): string {
  // The protocol kind is `{ type: "add" | "delete" | "update" }`, but tolerate a
  // bare string kind too so an unexpected runtime shape still classifies.
  const kind = change.kind;
  if (typeof kind === "string") return kind;
  if (kind && typeof kind === "object") return String((kind as Record<string, unknown>).type ?? "");
  return "";
}

function changeMovePath(change: Record<string, unknown>): string | null {
  const movePath = changeKind(change).move_path;
  return typeof movePath === "string" && movePath.length > 0 ? movePath : null;
}

function changeDiff(change: Record<string, unknown>): string {
  // v2 names it `diff`; tolerate the older `unified_diff` / `unifiedDiff` too.
  for (const key of ["diff", "unified_diff", "unifiedDiff"]) {
    const value = change[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}

/** Drop the single empty element a trailing "\n" leaves after split. */
function dropTrailingEmpty(lines: string[]): string[] {
  return lines.length > 0 && lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
}
