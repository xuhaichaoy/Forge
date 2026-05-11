export interface FileReferenceInput {
  path?: string | null;
  lineStart?: number | null;
  lineEnd?: number | null;
}

export interface FileReferenceSelection {
  path: string;
  lineStart: number;
  lineEnd: number;
}

export interface FileReferenceResolutionContext {
  workspaceRoot?: string | null;
  cwd?: string | null;
}

export function normalizeFileReference(input: FileReferenceInput): FileReferenceSelection | null {
  const path = input.path?.trim() ?? "";
  if (!path) return null;

  const lineStart = positiveInteger(input.lineStart) ?? 1;
  const rawLineEnd = positiveInteger(input.lineEnd) ?? lineStart;
  const lineEnd = Math.max(lineStart, rawLineEnd);

  return { path, lineStart, lineEnd };
}

export function resolveFileReferencePathCandidates(
  path: string,
  context: FileReferenceResolutionContext = {},
): string[] {
  const normalizedPath = path.trim();
  if (!normalizedPath) return [];
  if (isAbsoluteFileReferencePath(normalizedPath)) {
    return [normalizedPath];
  }

  const roots = prefersCwdFirst(normalizedPath)
    ? expandedResolutionRoots([context.cwd, context.workspaceRoot])
    : expandedResolutionRoots([context.workspaceRoot, context.cwd]);

  return dedupeFileReferencePaths([
    ...roots
      .map((root) => joinFileReferencePath(root, normalizedPath))
      .filter((candidate): candidate is string => candidate.length > 0),
    normalizedPath,
  ]);
}

export function fileReferenceKey(reference: FileReferenceSelection): string {
  return `${reference.path}:${reference.lineStart}-${reference.lineEnd}`;
}

export function fileReferenceLineLabel(
  reference: Pick<FileReferenceSelection, "lineStart" | "lineEnd">,
): string {
  return reference.lineStart === reference.lineEnd
    ? `Line ${reference.lineStart}`
    : `Lines ${reference.lineStart}-${reference.lineEnd}`;
}

export function fileReferenceDisplayPath(path: string, maxLength = 96): string {
  const normalized = path.trim();
  if (normalized.length <= maxLength) return normalized;
  if (maxLength <= 4) return normalized.slice(0, maxLength);
  return `...${normalized.slice(-(maxLength - 3))}`;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function isAbsoluteFileReferencePath(value: string): boolean {
  return value.startsWith("/")
    || value.startsWith("\\\\")
    || value.startsWith("file://")
    || /^[a-zA-Z]:[\\/]/.test(value);
}

function prefersCwdFirst(value: string): boolean {
  return !/[\\/]/.test(value) || /^\.\.?(?:[\\/]|$)/.test(value);
}

function expandedResolutionRoots(roots: Array<string | null | undefined>): string[] {
  return dedupeFileReferencePaths(roots.flatMap((root) => ancestorPathCandidates(root)));
}

function ancestorPathCandidates(root: string | null | undefined): string[] {
  const normalizedRoot = normalizeRootPath(root);
  if (!normalizedRoot) return [];

  const candidates: string[] = [];
  let current = normalizedRoot;
  for (let index = 0; index < 8; index += 1) {
    candidates.push(current);
    const parent = parentPath(current);
    if (!parent || parent === current) break;
    current = parent;
  }
  return candidates;
}

function joinFileReferencePath(root: string | null | undefined, relativePath: string): string {
  const normalizedRoot = normalizeRootPath(root);
  if (!normalizedRoot) return "";
  const normalizedRelativePath = relativePath.replace(/^[\\/]+/, "");
  if (normalizedRoot === "/") return `/${normalizedRelativePath}`;
  return `${normalizedRoot}/${normalizedRelativePath}`;
}

function normalizeRootPath(root: string | null | undefined): string {
  const trimmed = root?.trim() ?? "";
  if (!trimmed) return "";
  if (trimmed === "/") return "/";
  return trimmed.replace(/[\\/]+$/, "");
}

function parentPath(path: string): string {
  if (!path || path === "/") return "";
  const normalized = path.replace(/[\\/]+$/, "");
  const separatorIndex = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  if (separatorIndex < 0) return "";
  if (separatorIndex === 0) return "/";
  return normalized.slice(0, separatorIndex);
}

function dedupeFileReferencePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const path of paths) {
    if (!path || seen.has(path)) continue;
    seen.add(path);
    deduped.push(path);
  }
  return deduped;
}
