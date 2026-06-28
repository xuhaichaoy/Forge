import {
  resolveFileReferencePathCandidates,
} from "./file-references";

export interface OpenFileWatchTabInput {
  readonly tabId: string;
  readonly kind?: string;
  readonly props: Readonly<Record<string, unknown>>;
}

export interface OpenFileWatchTarget {
  readonly watchId: string;
  readonly hostId: string;
  readonly watchPath: string;
  readonly tabs: readonly OpenFileWatchTargetTab[];
}

export interface OpenFileWatchTargetTab {
  readonly tabId: string;
  readonly refreshMode: OpenFileWatchRefreshMode;
}

export type OpenFileWatchRefreshMode = "auto" | "manual";

export function openFileWatchTargetsFromSidePanelTabs(
  tabs: readonly OpenFileWatchTabInput[],
): OpenFileWatchTarget[] {
  const byWatchId = new Map<string, { hostId: string; watchPath: string; tabs: OpenFileWatchTargetTab[] }>();

  for (const tab of tabs) {
    const kindHostId = hostIdFromWorkspaceFileKind(tab.kind);
    if (!kindHostId) continue;

    const path = stringProp(tab.props.path);
    if (!path) continue;

    const workspaceRoot = stringProp(tab.props.workspaceRoot);
    const cwd = stringProp(tab.props.cwd);
    const watchPath = resolveFileReferencePathCandidates(path, { workspaceRoot, cwd })
      .find(isAbsoluteOpenFileWatchPath);
    if (!watchPath) continue;

    const hostId = stringProp(tab.props.hostId) || kindHostId;
    const watchId = openFileWatchId(hostId, watchPath);
    const watchTab = {
      tabId: tab.tabId,
      refreshMode: openFileWatchRefreshMode(tab.props.artifactType),
    };
    const current = byWatchId.get(watchId);
    if (current) {
      current.tabs.push(watchTab);
      continue;
    }
    byWatchId.set(watchId, { hostId, watchPath, tabs: [watchTab] });
  }

  return [...byWatchId.entries()].map(([watchId, target]) => ({
    watchId,
    hostId: target.hostId,
    watchPath: target.watchPath,
    tabs: target.tabs,
  }));
}

export function nextOpenFileWatchRefreshKey(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value + 1
    : 1;
}

export function openFileWatchId(hostId: string, watchPath: string): string {
  return `open-file-${hashOpenFileWatchKey(`${hostId}\0${watchPath}`)}`;
}

function hostIdFromWorkspaceFileKind(kind: string | undefined): string | null {
  const prefix = "workspaceFile:";
  if (!kind?.startsWith(prefix)) return null;
  const hostId = kind.slice(prefix.length).trim();
  return hostId || null;
}

function stringProp(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isAbsoluteOpenFileWatchPath(path: string): boolean {
  return path.startsWith("/");
}

function openFileWatchRefreshMode(artifactType: unknown): OpenFileWatchRefreshMode {
  return isManualRefreshArtifactType(artifactType) ? "manual" : "auto";
}

function isManualRefreshArtifactType(value: unknown): boolean {
  return value === "document"
    || value === "presentation"
    || value === "slides"
    || value === "spreadsheet"
    || value === "pdf";
}

function hashOpenFileWatchKey(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function watchIdFromFsChangedNotification(params: unknown): string | null {
  if (!params || typeof params !== "object") return null;
  const watchId = (params as { watchId?: unknown }).watchId;
  return typeof watchId === "string" && watchId.trim() ? watchId : null;
}
