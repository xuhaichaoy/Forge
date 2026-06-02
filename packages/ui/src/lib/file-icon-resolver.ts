import { fileIconKeyFor, type FileIconKey } from "./file-icon";

/*
 * codex: get-file-icon-DeSxUi4G.pretty.js — Desktop's extension/MIME map is
 * shared by right-rail files, composer file mentions, and workspace tree rows.
 */
export type FileIconFamily = FileIconKey | "folder-open";

export function resolveFileIcon(
  name: string,
  isDirectory: boolean,
  isExpanded = false,
): FileIconFamily {
  if (isDirectory) {
    return isExpanded ? "folder-open" : "folder";
  }
  return fileIconKeyFor({ path: name });
}
