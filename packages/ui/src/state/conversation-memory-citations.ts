import type { FileReference } from "../components/file-reference-types";

export interface MemoryCitationEntryView {
  path: string;
  lineStart: number;
  lineEnd: number;
  note: string;
}

export function memoryCitationEntries(citation: unknown): MemoryCitationEntryView[] {
  if (!citation || typeof citation !== "object") return [];
  const entries = (citation as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const path = typeof record.path === "string" ? record.path.trim() : "";
    if (!path) return [];
    const lineStart = positiveInteger(record.lineStart) ?? 1;
    const lineEnd = positiveInteger(record.lineEnd) ?? lineStart;
    const note = typeof record.note === "string" ? record.note.trim() : "";
    return [{ path, lineStart, lineEnd: Math.max(lineStart, lineEnd), note }];
  });
}

export function memoryCitationFileReference(
  entry: MemoryCitationEntryView,
  memoryCitationRoot?: string | null,
): FileReference {
  return {
    path: resolveMemoryCitationPath(entry.path, memoryCitationRoot),
    lineStart: entry.lineStart,
    lineEnd: entry.lineEnd,
  };
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function resolveMemoryCitationPath(path: string, memoryCitationRoot?: string | null): string {
  const normalizedPath = normalizeMemoryCitationPath(path);
  const normalizedRoot = normalizeMemoryCitationPath(memoryCitationRoot ?? "").replace(/[\\/]+$/, "");
  if (!normalizedRoot || isAbsoluteFilePath(normalizedPath)) return normalizedPath;
  return `${normalizedRoot}/${normalizedPath.replace(/^[\\/]+/, "")}`;
}

function normalizeMemoryCitationPath(path: string): string {
  const trimmed = path.trim();
  const withoutLongUncPrefix = trimmed.replace(/^\\\\\?\\UNC\\/i, "\\\\");
  const withoutLongDrivePrefix = withoutLongUncPrefix.replace(/^\\\\\?\\([a-zA-Z]:[\\/].*)$/, "$1");
  return withoutLongDrivePrefix.replace(/\\/g, "/");
}

function isAbsoluteFilePath(path: string): boolean {
  return path.startsWith("/")
    || path.startsWith("\\\\")
    || path.startsWith("file://")
    || /^[a-zA-Z]:[\\/]/.test(path);
}
