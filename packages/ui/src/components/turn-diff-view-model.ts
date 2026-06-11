import type { HiCodexIntlContextValue } from "./i18n-provider";

type FormatMessage = HiCodexIntlContextValue["formatMessage"];

export interface TurnDiffFileViewModel {
  path: string;
  linesAdded: number;
  linesRemoved: number;
  renderedLineEstimate: number;
}

export interface TurnDiffViewModel {
  hasChanges: boolean;
  fileCount: number;
  linesAdded: number;
  linesRemoved: number;
  files: TurnDiffFileViewModel[];
}

/**
 * codex: local-conversation-thread `Pv` header - i18n keys
 *   codex.unifiedDiff.editedFiles plural { one: "Edited 1 file", other: "Edited {count} files" }
 *   codex.unifiedDiff.editedFile = "Edited {filename}"
 *
 * Accepts an optional `singleFileName`; when fileCount === 1 and a filename is
 * supplied, returns the file-specific label. Otherwise falls back to the
 * plural-aware count label.
 */
export function formatTurnDiffFileCount(
  fileCount: number,
  singleFileName?: string | null,
  formatMessage?: FormatMessage,
): string {
  if (fileCount === 1 && typeof singleFileName === "string" && singleFileName.trim().length > 0) {
    // codex: codex.unifiedDiff.editedFile defaultMessage="Edited {filename}"
    const filename = turnDiffBasename(singleFileName);
    return formatMessage
      ? formatMessage({ id: "codex.unifiedDiff.editedFile", defaultMessage: "Edited {filename}" }, { filename })
      : `Edited ${filename}`;
  }
  // codex: codex.unifiedDiff.editedFiles plural defaultMessage="{fileCount, plural, one {Edited # file} other {Edited # files}}"
  return formatMessage
    ? formatMessage(
        {
          id: "codex.unifiedDiff.editedFiles",
          defaultMessage: "{fileCount, plural, one {Edited # file} other {Edited # files}}",
        },
        { fileCount },
      )
    : fileCount === 1
      ? "Edited 1 file"
      : `Edited ${fileCount} files`;
}

export function formatTurnDiffFilesChanged(fileCount: number, formatMessage?: FormatMessage): string {
  // codex: codex.unifiedDiff.filesChanged plural defaultMessage="{fileCount, plural, one {# file changed} other {# files changed}}"
  return formatMessage
    ? formatMessage(
        {
          id: "codex.unifiedDiff.filesChanged",
          defaultMessage: "{fileCount, plural, one {# file changed} other {# files changed}}",
        },
        { fileCount },
      )
    : fileCount === 1
      ? "1 file changed"
      : `${fileCount} files changed`;
}

export function turnDiffHeaderStatsVisible(fileCount: number, inProgress: boolean): boolean {
  return inProgress || fileCount > 0;
}

export function turnDiffViewModel(diff: string): TurnDiffViewModel {
  const files = turnDiffFiles(diff);
  const totals = files.length > 0
    ? files.reduce((acc, file) => ({
        linesAdded: acc.linesAdded + file.linesAdded,
        linesRemoved: acc.linesRemoved + file.linesRemoved,
      }), { linesAdded: 0, linesRemoved: 0 })
    : countDiffLines(diff);
  const fallbackFileCount = diff.trim().length > 0 && (totals.linesAdded > 0 || totals.linesRemoved > 0) ? 1 : 0;
  const fileCount = files.length > 0 ? files.length : fallbackFileCount;
  return {
    hasChanges: fileCount > 0 || totals.linesAdded > 0 || totals.linesRemoved > 0,
    fileCount,
    linesAdded: totals.linesAdded,
    linesRemoved: totals.linesRemoved,
    files,
  };
}

/**
 * codex: `es` per-file inline diff body - recover the diff fragment for each
 * file out of the merged unified diff. We rely on the same `diff --git a/.. b/..`
 * marker `turnDiffGitPath` recognizes; each fragment runs from one marker line
 * up to (but not including) the next marker.
 */
export function splitDiffByFile(diff: string): Map<string, string> {
  const result = new Map<string, string>();
  const lines = diff.split("\n");
  let currentPath: string | null = null;
  let buffer: string[] = [];
  const flush = () => {
    if (currentPath != null && buffer.length > 0) {
      result.set(currentPath, buffer.join("\n"));
    }
  };
  for (const line of lines) {
    const headerPath = turnDiffGitPath(line);
    if (headerPath != null) {
      flush();
      currentPath = headerPath;
      buffer = [line];
      continue;
    }
    if (currentPath != null) buffer.push(line);
  }
  flush();
  return result;
}

function turnDiffBasename(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx >= 0 ? path.slice(idx + 1) : path;
}

function turnDiffFiles(diff: string): TurnDiffFileViewModel[] {
  const files: TurnDiffFileViewModel[] = [];
  let current: TurnDiffFileViewModel | null = null;
  let inHunk = false;
  for (const line of diff.split("\n")) {
    const gitPath = turnDiffGitPath(line);
    if (gitPath) {
      current = {
        path: gitPath,
        linesAdded: 0,
        linesRemoved: 0,
        renderedLineEstimate: 0,
      };
      files.push(current);
      inHunk = false;
      continue;
    }
    if (!current) continue;
    if (line.startsWith("@@")) {
      current.renderedLineEstimate += 1;
      inHunk = true;
      continue;
    }
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) {
      current.linesAdded += 1;
      if (inHunk) current.renderedLineEstimate += 1;
    } else if (line.startsWith("-")) {
      current.linesRemoved += 1;
      if (inHunk) current.renderedLineEstimate += 1;
    } else if (inHunk && (line.startsWith(" ") || line.startsWith("\\"))) {
      current.renderedLineEstimate += 1;
    }
  }
  return files.length > 0 ? mergeTurnDiffFiles(files) : fallbackUnifiedDiffFiles(diff);
}

function mergeTurnDiffFiles(files: TurnDiffFileViewModel[]): TurnDiffFileViewModel[] {
  const byPath = new Map<string, TurnDiffFileViewModel>();
  for (const file of files) {
    const existing = byPath.get(file.path);
    if (!existing) {
      byPath.set(file.path, { ...file });
      continue;
    }
    existing.linesAdded += file.linesAdded;
    existing.linesRemoved += file.linesRemoved;
    existing.renderedLineEstimate += file.renderedLineEstimate;
  }
  return Array.from(byPath.values());
}

function turnDiffGitPath(line: string): string | null {
  const prefix = "diff --git ";
  if (!line.startsWith(prefix)) return null;
  const value = line.slice(prefix.length);
  if (value.startsWith("\"")) {
    const oldPath = parseQuotedDiffPath(value, 0);
    if (!oldPath || value[oldPath.nextIndex] !== " ") return null;
    const newPath = parseQuotedDiffPath(value, oldPath.nextIndex + 1);
    return newPath?.path.startsWith("b/") ? newPath.path.slice(2) : null;
  }
  const index = value.lastIndexOf(" b/");
  if (index < 0) return null;
  const path = value.slice(index + 1);
  return path.startsWith("b/") ? path.slice(2) : null;
}

function parseQuotedDiffPath(value: string, startIndex: number): { path: string; nextIndex: number } | null {
  if (value[startIndex] !== "\"") return null;
  let path = "";
  for (let index = startIndex + 1; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\"") return { path, nextIndex: index + 1 };
    if (char !== "\\") {
      path += char ?? "";
      continue;
    }
    const next = value[index + 1];
    if (next === undefined) return null;
    if (/[0-7]/u.test(next)) {
      let octal = next;
      let offset = 2;
      while (offset <= 3 && /[0-7]/u.test(value[index + offset] ?? "")) {
        octal += value[index + offset];
        offset += 1;
      }
      path += String.fromCharCode(Number.parseInt(octal, 8));
      index += octal.length;
      continue;
    }
    const escapes: Record<string, string> = {
      "\"": "\"",
      "\\": "\\",
      n: "\n",
      r: "\r",
      t: "\t",
    };
    path += escapes[next] ?? next;
    index += 1;
  }
  return null;
}

function fallbackUnifiedDiffFiles(diff: string): TurnDiffFileViewModel[] {
  const files: TurnDiffFileViewModel[] = [];
  let current: TurnDiffFileViewModel | null = null;
  let inHunk = false;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const path = normalizeDiffHeaderPath(line.slice(4));
      if (path && path !== "/dev/null") {
        current = { path, linesAdded: 0, linesRemoved: 0, renderedLineEstimate: 0 };
        files.push(current);
        inHunk = false;
      }
      continue;
    }
    if (!current) continue;
    if (line.startsWith("@@")) {
      current.renderedLineEstimate += 1;
      inHunk = true;
      continue;
    }
    if (line.startsWith("---")) continue;
    if (line.startsWith("+")) {
      current.linesAdded += 1;
      if (inHunk) current.renderedLineEstimate += 1;
    } else if (line.startsWith("-")) {
      current.linesRemoved += 1;
      if (inHunk) current.renderedLineEstimate += 1;
    } else if (inHunk && (line.startsWith(" ") || line.startsWith("\\"))) {
      current.renderedLineEstimate += 1;
    }
  }
  return mergeTurnDiffFiles(files);
}

function normalizeDiffHeaderPath(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("\"")) {
    const parsed = parseQuotedDiffPath(trimmed, 0);
    return parsed ? stripDiffPathPrefix(parsed.path) : "";
  }
  const [path] = trimmed.split("\t");
  return stripDiffPathPrefix(path ?? "");
}

function stripDiffPathPrefix(path: string): string {
  if (path.startsWith("a/") || path.startsWith("b/")) return path.slice(2);
  return path;
}

function countDiffLines(diff: string): { linesAdded: number; linesRemoved: number } {
  let linesAdded = 0;
  let linesRemoved = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) linesAdded += 1;
    else if (line.startsWith("-") && !line.startsWith("---")) linesRemoved += 1;
  }
  return { linesAdded, linesRemoved };
}
