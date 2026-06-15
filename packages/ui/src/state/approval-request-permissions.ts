/*
 * Permissions approval domain (item/permissions/requestApproval): grantable
 * checks, auto-deny detection, scope question, and permission descriptions.
 * Extracted verbatim from ./approval-requests.
 */
import { formatUnknown, stringField } from "../lib/format";
import { formatMessage } from "./i18n";
import type { PendingRequestQuestion } from "./approval-requests-shared";
import type { PendingServerRequest } from "./codex-reducer";

/*
 * codex pending-request-item-panel: a permission request that resolves to
 * nothing grantable (neither `network` nor `fileSystem` present) is auto-declined
 * with `{ permissions: {}, scope: "turn" }` and never rendered — there is nothing
 * for the user to approve. This mirrors Codex's shallow presence check
 * (`T = !(network != null || fileSystem != null)`); Forge previously left a
 * stuck, non-acceptable panel requiring a manual Cancel.
 */
export function isAutoDeniablePermissionRequest(request: PendingServerRequest): boolean {
  if (request.method !== "item/permissions/requestApproval") return false;
  const permissions = (request.params as { permissions?: { network?: unknown; fileSystem?: unknown } } | undefined)
    ?.permissions;
  return permissions?.network == null && permissions?.fileSystem == null;
}

export function permissionScopeQuestion(): PendingRequestQuestion {
  return {
    id: "scope",
    header: formatMessage({ id: "hc.pendingRequest.scope.header", defaultMessage: "Scope" }),
    question: formatMessage({ id: "hc.pendingRequest.scope.question", defaultMessage: "How long should this permission apply?" }),
    kind: "singleSelect",
    isSecret: false,
    required: true,
    defaultAnswers: ["turn"],
    options: [
      {
        value: "turn",
        label: formatMessage({ id: "permissionRequest.menu.allowOnce", defaultMessage: "Yes, allow for this turn" }),
        description: formatMessage({
          id: "hc.pendingRequest.scope.turnDescription",
          defaultMessage: "Allow the requested access for the current turn only.",
        }),
      },
      {
        value: "session",
        label: formatMessage({ id: "permissionRequest.menu.allowForSession", defaultMessage: "Yes, allow for this session" }),
        description: formatMessage({
          id: "hc.pendingRequest.scope.sessionDescription",
          defaultMessage: "Allow until this app-server session ends.",
        }),
      },
    ],
  };
}

export function permissionRequestTitle(value: unknown): string {
  const additional = formatMessage({ id: "permissionRequest.title.additional", defaultMessage: "Allow additional access?" });
  if (!value || typeof value !== "object") return additional;
  const record = value as Record<string, unknown>;
  const hasNetwork = hasNetworkPermission(record.network);
  const fileAccess = fileSystemAccessSummary(record.fileSystem);
  if (hasNetwork && !fileAccess) {
    return formatMessage({ id: "permissionRequest.title.network", defaultMessage: "Allow network access?" });
  }
  if (!hasNetwork && fileAccess) {
    if (fileAccess.access === "read") {
      return formatMessage({ id: "permissionRequest.title.read", defaultMessage: "Allow read access to {path}?" }, { path: fileAccess.target });
    }
    if (fileAccess.access === "write") {
      return formatMessage({ id: "permissionRequest.title.write", defaultMessage: "Allow write access to {path}?" }, { path: fileAccess.target });
    }
    if (fileAccess.access === "read and write") {
      return formatMessage({ id: "permissionRequest.title.readWrite", defaultMessage: "Allow read and write access to {path}?" }, { path: fileAccess.target });
    }
  }
  return additional;
}

export function hasGrantablePermissions(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return hasNetworkPermission(record.network) || hasFileSystemPermission(record.fileSystem);
}

function hasNetworkPermission(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return (value as Record<string, unknown>).enabled !== false;
}

function hasFileSystemPermission(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return arrayOfStrings(record.read).length > 0
    || arrayOfStrings(record.write).length > 0
    || (Array.isArray(record.entries) && record.entries.length > 0);
}

function fileSystemAccessSummary(value: unknown): { access: "read" | "write" | "read and write"; target: string } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const read = arrayOfStrings(record.read);
  const write = arrayOfStrings(record.write);
  const entryTargets = Array.isArray(record.entries)
    ? record.entries.flatMap((entry) => {
      const summary = fileSystemEntrySummary(entry);
      return summary ? [summary] : [];
    })
    : [];
  const targets = [...read, ...write, ...entryTargets.map((entry) => entry.target)].filter(Boolean);
  const uniqueTargets = Array.from(new Set(targets));
  if (uniqueTargets.length !== 1) return null;
  const hasRead = read.length > 0 || entryTargets.some((entry) => entry.access === "read");
  const hasWrite = write.length > 0 || entryTargets.some((entry) => entry.access === "write");
  return {
    access: hasRead && hasWrite ? "read and write" : hasWrite ? "write" : "read",
    target: uniqueTargets[0],
  };
}

function fileSystemEntrySummary(value: unknown): { access: "read" | "write"; target: string } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const access = stringField(record, "access");
  if (access !== "read" && access !== "write") return null;
  const path = record.path && typeof record.path === "object" ? record.path as Record<string, unknown> : null;
  if (!path) return null;
  if (path.type === "path") return { access, target: stringField(path, "path") };
  if (path.type === "glob_pattern") return { access, target: stringField(path, "pattern") };
  if (path.type === "special") return { access, target: stringField(path, "value") };
  return null;
}

export function describePermissions(value: unknown): string {
  const empty = formatMessage({
    id: "hc.pendingRequest.permission.none",
    defaultMessage: "No additional permissions requested.",
  });
  if (!value || typeof value !== "object") return empty;
  const record = value as Record<string, unknown>;
  const lines = [
    ...describeNetworkPermissions(record.network),
    ...describeFileSystemPermissions(record.fileSystem),
  ];
  return lines.length > 0 ? lines.join("\n") : empty;
}

function describeNetworkPermissions(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  // The "Network: " prefix is a structural row-label parsed downstream
  // (pending-request-stack splits each body line on ": "); only the value is
  // localized. codex `permissionRequest.networkValue` = "Internet access".
  if (record.enabled === true) {
    return [`Network: ${formatMessage({ id: "permissionRequest.networkValue", defaultMessage: "Internet access" })}`];
  }
  if (record.enabled === false) {
    return [`Network: ${formatMessage({ id: "hc.pendingRequest.permission.networkDisabled", defaultMessage: "disabled" })}`];
  }
  return [`Network: ${formatUnknown(value)}`];
}

function describeFileSystemPermissions(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const lines: string[] = [];
  const read = arrayOfStrings(record.read);
  const write = arrayOfStrings(record.write);
  // codex `readWrite` case: a path requested for BOTH read and write collapses
  // into one "Read and write" row. (The English label stays a structural parsing
  // key split downstream; pending-request-stack localizes it for display.)
  const writeSet = new Set(write);
  const both = read.filter((path) => writeSet.has(path));
  if (both.length > 0) {
    const bothSet = new Set(both);
    lines.push(`Read and write: ${both.join(", ")}`);
    const readOnly = read.filter((path) => !bothSet.has(path));
    const writeOnly = write.filter((path) => !bothSet.has(path));
    if (readOnly.length > 0) lines.push(`Read: ${readOnly.join(", ")}`);
    if (writeOnly.length > 0) lines.push(`Write: ${writeOnly.join(", ")}`);
  } else {
    if (read.length > 0) lines.push(`Read: ${read.join(", ")}`);
    if (write.length > 0) lines.push(`Write: ${write.join(", ")}`);
  }
  if (Array.isArray(record.entries)) {
    for (const entry of record.entries) {
      const line = describeFileSystemEntry(entry);
      if (line) lines.push(line);
    }
  }
  if (typeof record.globScanMaxDepth === "number") lines.push(`Glob scan max depth: ${record.globScanMaxDepth}`);
  return lines.length > 0 ? lines : [`File system: ${formatUnknown(value)}`];
}

function describeFileSystemEntry(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const access = stringField(record, "access") || "access";
  const path = record.path && typeof record.path === "object" ? record.path as Record<string, unknown> : null;
  if (!path) return null;
  if (path.type === "path") return `${access}: ${stringField(path, "path")}`;
  if (path.type === "glob_pattern") return `${access}: ${stringField(path, "pattern")}`;
  if (path.type === "special") return `${access}: ${stringField(path, "value")}`;
  return null;
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
