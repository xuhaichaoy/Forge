/*
 * Build a turn-level unified diff by merging the per-file patches a turn
 * produced — the client-side rebuild Codex Desktop uses whenever the turn
 * object carries no aggregated diff. (`turn.diff` is only ever filled by a
 * live `turn/diff/updated` notification; thread snapshots rebuild the turn
 * with `diff: null`, so the reopen path always lands here.)
 *
 * codex: app-server-manager-signals-SKi6YePu.js (Codex 26.602.40724,
 * js-beautified line refs):
 *   - `k_` (:9883)  — fileChange `changes` array → `{ [path]: change }` map.
 *     add/delete carry the file *content* in the protocol `diff` field;
 *     update carries the hunk (`unified_diff`) plus `move_path`. Unknown
 *     kinds are dropped (the switch has no default case).
 *   - `jM` (:19615) — turn items → patch batches: walks the items in order,
 *     tracks the working dir from `commandExecution` items, skips
 *     failed/declined or empty fileChange items, pushes
 *     `{ changes: k_(item.changes), cwd }`.
 *   - `sS` (:14678) — one (path, change) → git-diff text. `update` reuses the
 *     hunk and synthesizes the `diff --git` / `--- ` / `+++ ` headers only
 *     when missing; `add`/`delete` build the hunk from the content lines.
 *     Only add/delete normalize CRLF.
 *   - `lS` (:14727) — batches → merged unified diff. Segments are keyed by
 *     `${cwd}\0${currentPath}`; an in-place update (no move_path) folds its
 *     follow-up hunks into the file's prior segment; segments join with
 *     "\n\n" and a non-empty result ends with "\n". Both Codex call sites
 *     invoke `lS(m)` without a base cwd, so its `dS` path resolution is
 *     inert — not replicated here.
 *
 * The diff produced here feeds the "Edited N files +X -Y" card
 * (turnDiffViewModel parses the `diff --git` / `+++ ` headers) and stays
 * valid for the host `git apply` that powers Undo / Reapply.
 */
import type { AccumulatedThreadItem } from "./render-groups";

const TRAILING_NEWLINES = /[\r\n]+$/u;

/** k_-normalized change: add/delete carry content, update carries the hunk. */
export type TurnPatchChange =
  | { type: "add"; content: string }
  | { type: "delete"; content: string }
  | { type: "update"; unified_diff: string; move_path: string | null };

/** One batch of same-cwd file changes (codex `jM` element: `{ changes, cwd }`). */
export type TurnPatchBatch = {
  changes: Record<string, TurnPatchChange>;
  cwd: string | null;
};

/**
 * Collect a turn's patch batches from its (ordered) thread items — codex `jM`.
 * `commandExecution` items advance the tracked working dir; failed/declined or
 * empty fileChange items are skipped.
 */
export function turnPatchBatchesFromItems(
  turnItems: ReadonlyArray<AccumulatedThreadItem>,
): TurnPatchBatch[] {
  const batches: TurnPatchBatch[] = [];
  // codex jM seeds the dir from `turn.params.cwd`; the reducer's accumulated
  // view has no turn params, so the dir stays null until the first
  // commandExecution reports one.
  let cwd: string | null = null;
  for (const item of turnItems) {
    const record = item as Record<string, unknown>;
    if (record.type === "commandExecution") {
      cwd = typeof record.cwd === "string" && record.cwd.length > 0 ? record.cwd : cwd;
      continue;
    }
    if (record.type !== "fileChange") continue;
    if (record.status === "failed" || record.status === "declined") continue;
    const changes = changeMapFromProtocolChanges(record.changes);
    if (Object.keys(changes).length === 0) continue;
    batches.push({ changes, cwd });
  }
  return batches;
}

/**
 * Merge patch batches into one unified diff — codex `lS` (with the inert
 * base-cwd parameter omitted, matching both Codex call sites).
 * Returns "" when there is nothing to show.
 */
export function unifiedDiffFromPatchBatches(
  batches: ReadonlyArray<TurnPatchBatch>,
): string {
  const segments: string[] = [];
  const segmentIndexByKey = new Map<string, number>();

  for (const { changes, cwd } of batches) {
    for (const [path, change] of Object.entries(changes)) {
      const rendered = renderFileDiff(path, change);
      if (rendered == null) continue;

      // Codex keys segments by cwd + the file's *current* path (rename target
      // wins): `u = `${a ?? ``}\0${l}``.
      const keyPath = change.type === "update" && change.move_path != null ? change.move_path : path;
      const key = `${cwd ?? ""}\u0000${keyPath}`;
      // Only an in-place update (no rename) folds follow-up hunks into a prior segment.
      const mergeable = change.type === "update" && change.move_path == null;
      const body = rendered.replace(TRAILING_NEWLINES, "");
      const prevIndex = segmentIndexByKey.get(key);

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
      if (mergeable) segmentIndexByKey.set(key, segments.length - 1);
      else segmentIndexByKey.delete(key);
    }
  }

  const joined = segments.join("\n\n");
  return joined.length > 0 ? `${joined}\n` : "";
}

/** One (path, change) → git unified-diff text — codex `sS`. */
function renderFileDiff(path: string, change: TurnPatchChange): string | null {
  if (change.type === "update") {
    // codex sS leaves the update hunk untouched (no CRLF normalization) and
    // only synthesizes the headers it can't find.
    const newPath = change.move_path ?? path;
    const body = change.unified_diff.trimStart();
    const hasFileHeader = /\n?---\s/u.test(body);
    const hasGitHeader = /^diff --git /mu.test(body);
    const withHeaders = hasFileHeader ? body : `--- a/${path}\n+++ b/${newPath}\n${body}`;
    return `${hasGitHeader ? "" : `diff --git a/${path} b/${newPath}\n`}${withHeaders}`;
  }

  if (change.type === "add") {
    const lines = dropTrailingEmpty(change.content.replace(/\r\n/gu, "\n").split("\n"));
    const hunk = lines.length > 0
      ? `@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => `+${line}`).join("\n")}\n`
      : "";
    return [`diff --git a/${path} b/${path}`, "new file mode 100644", "--- /dev/null", `+++ b/${path}`, hunk]
      .filter(Boolean)
      .join("\n");
  }

  if (change.type === "delete") {
    const lines = dropTrailingEmpty(change.content.replace(/\r\n/gu, "\n").split("\n"));
    const hunk = lines.length > 0
      ? `@@ -1,${lines.length} +0,0 @@\n${lines.map((line) => `-${line}`).join("\n")}\n`
      : "";
    return [`diff --git a/${path} b/${path}`, "deleted file mode 100644", `--- a/${path}`, "+++ /dev/null", hunk]
      .filter(Boolean)
      .join("\n");
  }

  return null;
}

/** fileChange `changes` array → `{ [path]: change }` map — codex `k_`. */
function changeMapFromProtocolChanges(changes: unknown): Record<string, TurnPatchChange> {
  const map: Record<string, TurnPatchChange> = {};
  if (!Array.isArray(changes)) return map;
  for (const entry of changes) {
    if (!entry || typeof entry !== "object") continue;
    const { path, kind, diff } = entry as { path?: unknown; kind?: unknown; diff?: unknown };
    if (typeof path !== "string" || path.length === 0) continue;
    const kindRecord = kind && typeof kind === "object" ? (kind as Record<string, unknown>) : null;
    const text = typeof diff === "string" ? diff : "";
    switch (kindRecord?.type) {
      case "add":
        map[path] = { type: "add", content: text };
        break;
      case "delete":
        map[path] = { type: "delete", content: text };
        break;
      case "update":
        map[path] = {
          type: "update",
          unified_diff: text,
          // codex k_: `move_path: r.move_path ?? null`
          move_path: typeof kindRecord.move_path === "string" ? kindRecord.move_path : null,
        };
        break;
      default:
        // codex k_ has no default case — unknown kinds are dropped.
        break;
    }
  }
  return map;
}

/** Drop the single empty element a trailing "\n" leaves after split. */
function dropTrailingEmpty(lines: string[]): string[] {
  return lines.length > 0 && lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
}
