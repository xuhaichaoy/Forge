/*
 * codex: iconResolver-BZbgWuPi.pretty.js :se/:ce/:X — extension → icon family
 * map used by the workspace file tree. Codex Desktop ships dozens of mappings;
 * for the HiCodex MVP we only special-case Markdown (the orange-M glyph users
 * see most often in the screenshot) and leave everything else on the generic
 * file icon. The rest of the table is left as a TODO so the icon set can be
 * grown incrementally without revisiting the resolver shape.
 */
export type FileIconFamily = "folder" | "folder-open" | "markdown" | "file";

export function resolveFileIcon(
  name: string,
  isDirectory: boolean,
  isExpanded = false,
): FileIconFamily {
  if (isDirectory) {
    return isExpanded ? "folder-open" : "folder";
  }
  // codex: iconResolver :X — extension lookup is case-insensitive on the last segment.
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === name.length - 1) return "file";
  const ext = name.slice(dotIndex + 1).toLowerCase();
  switch (ext) {
    case "md":
    case "mdx":
    case "markdown":
      return "markdown";
    // TODO: port the remaining extension → family map from iconResolver :se/:ce.
    default:
      return "file";
  }
}
