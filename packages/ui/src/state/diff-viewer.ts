export type DiffViewerLineKind = "context" | "add" | "remove" | "meta";

export interface DiffViewerLine {
  kind: DiffViewerLineKind;
  raw: string;
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffViewerHunk {
  id: string;
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  section: string;
  lines: DiffViewerLine[];
  linesAdded: number;
  linesRemoved: number;
}

export interface DiffViewerFile {
  id: string;
  oldPath: string;
  newPath: string;
  path: string;
  hunks: DiffViewerHunk[];
  linesAdded: number;
  linesRemoved: number;
}

export interface DiffViewerHunkNavItem {
  id: string;
  filePath: string;
  label: string;
  linesAdded: number;
  linesRemoved: number;
}

export interface DiffViewerModel {
  files: DiffViewerFile[];
  hunkNav: DiffViewerHunkNavItem[];
  hasChanges: boolean;
  linesAdded: number;
  linesRemoved: number;
}

export type DiffViewerSideBySideKind = "context" | "change" | "add" | "remove" | "meta";

export interface DiffViewerSideBySideRow {
  kind: DiffViewerSideBySideKind;
  oldLineNumber?: number;
  newLineNumber?: number;
  oldText: string;
  newText: string;
}

export function projectDiffViewer(diff: string): DiffViewerModel {
  const files: DiffViewerFile[] = [];
  let currentFile: DiffViewerFile | null = null;
  let currentHunk: DiffViewerHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  const ensureFile = (oldPath = "", newPath = ""): DiffViewerFile => {
    if (currentFile) {
      if (oldPath && !currentFile.oldPath) currentFile.oldPath = oldPath;
      if (newPath && !currentFile.newPath) currentFile.newPath = newPath;
      currentFile.path = preferredDiffPath(currentFile.oldPath, currentFile.newPath);
      return currentFile;
    }
    const index = files.length;
    currentFile = {
      id: `file-${index}`,
      oldPath,
      newPath,
      path: preferredDiffPath(oldPath, newPath) || `Diff ${index + 1}`,
      hunks: [],
      linesAdded: 0,
      linesRemoved: 0,
    };
    files.push(currentFile);
    return currentFile;
  };

  for (const rawLine of diff.replace(/\r\n/g, "\n").split("\n")) {
    if (rawLine.startsWith("diff --git ")) {
      const paths = parseDiffGitPaths(rawLine);
      currentFile = null;
      currentHunk = null;
      currentFile = ensureFile(paths.oldPath, paths.newPath);
      continue;
    }

    if (rawLine.startsWith("--- ")) {
      const file = ensureFile();
      currentFile = file;
      const oldPath = parseDiffHeaderPath(rawLine.slice(4));
      if (oldPath) file.oldPath = oldPath;
      file.path = preferredDiffPath(file.oldPath, file.newPath);
      currentHunk = null;
      continue;
    }

    if (rawLine.startsWith("+++ ")) {
      const file = ensureFile();
      currentFile = file;
      const newPathValue = parseDiffHeaderPath(rawLine.slice(4));
      if (newPathValue) file.newPath = newPathValue;
      file.path = preferredDiffPath(file.oldPath, file.newPath);
      currentHunk = null;
      continue;
    }

    if (rawLine.startsWith("@@ ")) {
      const file = ensureFile();
      currentFile = file;
      const parsed = parseHunkHeader(rawLine);
      const hunk: DiffViewerHunk = {
        id: `${file.id}-hunk-${file.hunks.length}`,
        header: rawLine,
        oldStart: parsed.oldStart,
        oldCount: parsed.oldCount,
        newStart: parsed.newStart,
        newCount: parsed.newCount,
        section: parsed.section,
        lines: [],
        linesAdded: 0,
        linesRemoved: 0,
      };
      file.hunks.push(hunk);
      currentHunk = hunk;
      oldLine = parsed.oldStart;
      newLine = parsed.newStart;
      continue;
    }

    const file = currentFile;
    const hunk = currentHunk;
    if (!hunk || !file) continue;
    if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
      hunk.lines.push({
        kind: "add",
        raw: rawLine,
        text: rawLine.slice(1),
        newLineNumber: newLine,
      });
      hunk.linesAdded += 1;
      file.linesAdded += 1;
      newLine += 1;
      continue;
    }
    if (rawLine.startsWith("-") && !rawLine.startsWith("---")) {
      hunk.lines.push({
        kind: "remove",
        raw: rawLine,
        text: rawLine.slice(1),
        oldLineNumber: oldLine,
      });
      hunk.linesRemoved += 1;
      file.linesRemoved += 1;
      oldLine += 1;
      continue;
    }
    if (rawLine.startsWith("\\")) {
      hunk.lines.push({ kind: "meta", raw: rawLine, text: rawLine });
      continue;
    }
    const text = rawLine.startsWith(" ") ? rawLine.slice(1) : rawLine;
    hunk.lines.push({
      kind: "context",
      raw: rawLine,
      text,
      oldLineNumber: oldLine,
      newLineNumber: newLine,
    });
    oldLine += 1;
    newLine += 1;
  }

  const hunkNav = files.flatMap((file) => file.hunks.map((hunk, index) => ({
    id: hunk.id,
    filePath: file.path,
    label: `${basename(file.path)}:${hunk.newStart}${index > 0 ? ` #${index + 1}` : ""}`,
    linesAdded: hunk.linesAdded,
    linesRemoved: hunk.linesRemoved,
  })));
  const linesAdded = files.reduce((total, file) => total + file.linesAdded, 0);
  const linesRemoved = files.reduce((total, file) => total + file.linesRemoved, 0);

  return {
    files: files.filter((file) => file.hunks.length > 0),
    hunkNav,
    hasChanges: linesAdded > 0 || linesRemoved > 0,
    linesAdded,
    linesRemoved,
  };
}

export function sideBySideDiffRows(hunk: DiffViewerHunk): DiffViewerSideBySideRow[] {
  const rows: DiffViewerSideBySideRow[] = [];
  let index = 0;
  while (index < hunk.lines.length) {
    const line = hunk.lines[index];
    if (!line) break;
    if (line.kind === "remove" || line.kind === "add") {
      const removed: DiffViewerLine[] = [];
      const added: DiffViewerLine[] = [];
      while (index < hunk.lines.length) {
        const next = hunk.lines[index];
        if (!next || (next.kind !== "remove" && next.kind !== "add")) break;
        if (next.kind === "remove") removed.push(next);
        if (next.kind === "add") added.push(next);
        index += 1;
      }
      const count = Math.max(removed.length, added.length);
      for (let rowIndex = 0; rowIndex < count; rowIndex += 1) {
        const oldLineValue = removed[rowIndex];
        const newLineValue = added[rowIndex];
        rows.push({
          kind: oldLineValue && newLineValue ? "change" : oldLineValue ? "remove" : "add",
          oldLineNumber: oldLineValue?.oldLineNumber,
          newLineNumber: newLineValue?.newLineNumber,
          oldText: oldLineValue?.text ?? "",
          newText: newLineValue?.text ?? "",
        });
      }
      continue;
    }
    rows.push({
      kind: line.kind === "meta" ? "meta" : "context",
      oldLineNumber: line.oldLineNumber,
      newLineNumber: line.newLineNumber,
      oldText: line.text,
      newText: line.kind === "meta" ? "" : line.text,
    });
    index += 1;
  }
  return rows;
}

function parseHunkHeader(value: string): {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  section: string;
} {
  const match = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@\s?(.*)$/.exec(value);
  if (!match) {
    return { oldStart: 0, oldCount: 0, newStart: 0, newCount: 0, section: "" };
  }
  return {
    oldStart: Number(match[1]),
    oldCount: Number(match[2] ?? "1"),
    newStart: Number(match[3]),
    newCount: Number(match[4] ?? "1"),
    section: match[5] ?? "",
  };
}

function parseDiffGitPaths(value: string): { oldPath: string; newPath: string } {
  const args = splitDiffArguments(value.slice("diff --git ".length));
  return {
    oldPath: cleanDiffPath(args[0] ?? ""),
    newPath: cleanDiffPath(args[1] ?? ""),
  };
}

function parseDiffHeaderPath(value: string): string {
  const args = splitDiffArguments(value.trim());
  return cleanDiffPath(args[0] ?? "");
}

function splitDiffArguments(value: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const ch = value[index];
    if (quote) {
      if (ch === "\\" && index + 1 < value.length) {
        current += value[index + 1];
        index += 1;
        continue;
      }
      if (ch === quote) {
        quote = null;
        continue;
      }
      current += ch;
      continue;
    }
    if (ch === "\"" || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current) args.push(current);
  return args;
}

function cleanDiffPath(value: string): string {
  if (!value || value === "/dev/null") return "";
  if (/^[ab]\//.test(value)) return value.slice(2);
  return value;
}

function preferredDiffPath(oldPath: string, newPath: string): string {
  return newPath || oldPath;
}

function basename(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  return normalized.split(/[\\/]/).filter(Boolean).pop() || path || "diff";
}
