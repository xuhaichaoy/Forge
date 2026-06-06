import type { SidePanelTabContextMenuItem } from "./side-panel-tab-host";

export interface FileReferenceInput {
  path?: string | null;
  lineStart?: number | null;
  lineEnd?: number | null;
  hostId?: string | null;
}

export interface FileReferenceSelection {
  path: string;
  lineStart: number;
  lineEnd: number;
  hostId?: string;
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

  const hostId = input.hostId?.trim() ?? "";
  return {
    path,
    lineStart,
    lineEnd,
    ...(hostId ? { hostId } : {}),
  };
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

/**
 * Build the resolution context for opening a conversation file reference, mirroring
 * Codex: references resolve against the thread / workspace cwd, **never** against the
 * host's default directory (which is $HOME). A thread with no real workspace seeds its
 * cwd from that default; using it as a resolution root would mis-anchor a bare filename
 * to `$HOME/<name>` (the reported "点开去 /Users/<me>/<name>" bug). So any root equal to
 * `defaultCwd` is dropped — with no real workspace the roots are empty, a bare relative
 * reference stays relative and fails honestly (the same as Codex's `cwd: null`) instead
 * of silently opening the wrong $HOME path. Absolute references resolve as-is regardless.
 */
export function fileReferenceResolutionContext(input: {
  workspace?: string | null;
  threadCwd?: string | null;
  defaultCwd?: string | null;
}): { workspaceRoot: string; cwd: string } {
  const hostDefault = input.defaultCwd?.trim() ?? "";
  const anchoredRoot = (value: string | null | undefined): string => {
    const trimmed = value?.trim() ?? "";
    return trimmed && trimmed !== hostDefault ? trimmed : "";
  };
  const workspaceRoot = anchoredRoot(input.workspace);
  return {
    workspaceRoot,
    cwd: anchoredRoot(input.threadCwd) || workspaceRoot,
  };
}

export function fileReferenceKey(reference: FileReferenceSelection): string {
  return `${reference.hostId ? `${reference.hostId}:` : ""}${reference.path}:${reference.lineStart}-${reference.lineEnd}`;
}

export function fileReferenceSidePanelTabId(path: string, hostId?: string | null): string {
  // codex: review-file-source-tab-*.js `ia(...)` uses `file:${path}` when
  // hostId is absent, and `file:${hostId}:${path}` for host-backed tabs.
  return hostId ? `file:${hostId}:${path}` : `file:${path}`;
}

export function fileReferenceSidePanelTabKind(hostId: string): `workspaceFile:${string}` {
  // codex: review-file-source-tab-*.js / open-artifact-side-panel-tab-*.js set
  // source tab kind to `workspaceFile:${hostId}`.
  return `workspaceFile:${hostId}`;
}

export interface FileReferenceSidePanelContextMenuHandlers {
  readonly onOpenFile: () => void;
  readonly onCopyPath: () => void;
  readonly onCopyContents: () => void;
  readonly onRevealPath: () => void;
  readonly revealLabel: string;
}

export function fileReferenceSidePanelContextMenuItems(
  handlers: FileReferenceSidePanelContextMenuHandlers,
): readonly SidePanelTabContextMenuItem[] {
  /*
   * codex workspace-file-context-menu-*.js emits open target(s), a separator,
   * copy path, copy contents, and reveal. HiCodex does not yet have Desktop's
   * OS app-target query, so the first row is Codex's own `viewFile` label.
   */
  return [
    { id: "workspace-file-open-file", label: "Open file", onSelect: handlers.onOpenFile },
    { id: "workspace-file-open-separator", separator: true },
    { id: "workspace-file-copy-path", label: "Copy path", onSelect: handlers.onCopyPath },
    { id: "workspace-file-copy-contents", label: "Copy file contents", onSelect: handlers.onCopyContents },
    { id: "workspace-file-reveal-path", label: handlers.revealLabel, onSelect: handlers.onRevealPath },
  ];
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
