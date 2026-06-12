import type { CommandPanelEntry, FileSearchResult } from "./command-panel";

export function projectFileSearchEntries(result: { files?: FileSearchResult[] }): CommandPanelEntry[] {
  return (result.files ?? []).slice(0, 25).map((file, index) => {
    const attachmentPath = fuzzyFileSearchFsPath(file);
    const displayPath = fuzzyFileSearchDisplayPath(file, attachmentPath);
    return {
      id: `file:${attachmentPath ?? displayPath ?? file.file_name ?? index}`,
      title: file.file_name || displayPath || attachmentPath || "file",
      kind: "file",
      status: file.match_type,
      meta: displayPath ?? attachmentPath,
      details: [`score: ${file.score ?? "unknown"}`],
      action: attachmentPath
        ? {
            type: "attachMention",
            name: file.file_name || displayPath || attachmentPath,
            path: attachmentPath,
          }
        : undefined,
    };
  });
}

function fuzzyFileSearchFsPath(file: FileSearchResult): string | undefined {
  if (file.fsPath) return file.fsPath;
  if (!file.path) return undefined;
  return joinRootRelativePath(file.root, file.path);
}

function fuzzyFileSearchDisplayPath(
  file: FileSearchResult,
  attachmentPath: string | undefined,
): string | undefined {
  if (!file.path) return attachmentPath;
  if (file.root && !isAbsolutePath(file.path)) return normalizeSeparators(file.path);
  return file.path;
}

export function joinRootRelativePath(root: string | undefined, path: string): string {
  if (!root || isAbsolutePath(path)) return path;
  const separator = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  return `${root.replace(/[\\/]+$/, "")}${separator}${path.replace(/^[\\/]+/, "")}`;
}

function normalizeSeparators(path: string): string {
  return path.replace(/\\/g, "/");
}

export function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || path.startsWith("\\\\") || /^[a-zA-Z]:[\\/]/.test(path);
}
