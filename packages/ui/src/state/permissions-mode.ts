import type { ThreadContextDefaults } from "./codex-reducer";
import type { CommandPanelEntry, ConfigWriteActionEdit } from "./command-panel";

export type PermissionMode = "read-only" | "auto" | "granular" | "full-access";
export type PermissionModeStatus = PermissionMode | "custom";

const GRANULAR_APPROVAL_POLICY = {
  granular: {
    sandbox_approval: false,
    rules: false,
    skill_approval: false,
    request_permissions: true,
    mcp_elicitations: true,
  },
};

const DEFAULT_WORKSPACE_WRITE = {
  writable_roots: [],
  network_access: false,
  exclude_slash_tmp: false,
  exclude_tmpdir_env_var: false,
};

const PERMISSION_MODES: PermissionMode[] = ["read-only", "auto", "granular", "full-access"];

export function projectPermissionModeCommandEntries(context: ThreadContextDefaults | null): CommandPanelEntry[] {
  const currentMode = permissionModeFromThreadContext(context);
  return [
    ...PERMISSION_MODES.map((mode) => permissionModeEntry(mode, currentMode)),
    {
      id: "permissions:current",
      title: "Current resolved mode",
      kind: "status",
      status: currentMode,
      meta: "Derived from app-server config/read",
      details: permissionContextDetails(context),
    },
  ];
}

export function permissionModeFromThreadContext(context: ThreadContextDefaults | null): PermissionModeStatus {
  const sandboxMode = stringValue(context?.sandbox) ?? "workspace-write";
  const approvalPolicy = context?.approvalPolicy ?? "on-request";
  const approvalsReviewer = stringValue(context?.approvalsReviewer) ?? "user";

  if (sandboxMode === "read-only" && approvalPolicy === "on-request" && approvalsReviewer === "user") {
    return "read-only";
  }
  if (sandboxMode === "workspace-write" && isGranularApprovalPolicy(approvalPolicy) && approvalsReviewer === "user") {
    return "granular";
  }
  if (sandboxMode === "workspace-write" && approvalPolicy === "on-request" && approvalsReviewer === "user") {
    return "auto";
  }
  if (sandboxMode === "danger-full-access" && approvalPolicy === "never") {
    return "full-access";
  }
  return "custom";
}

export function permissionModeConfigEdits(mode: PermissionMode): ConfigWriteActionEdit[] {
  const config = permissionModeConfig(mode);
  return [
    { keyPath: "sandbox_mode", value: config.sandboxMode, mergeStrategy: "replace" },
    { keyPath: "approval_policy", value: config.approvalPolicy, mergeStrategy: "replace" },
    { keyPath: "approvals_reviewer", value: config.approvalsReviewer, mergeStrategy: "replace" },
    { keyPath: "sandbox_workspace_write", value: config.sandboxWorkspaceWrite, mergeStrategy: "replace" },
  ];
}

function permissionModeEntry(mode: PermissionMode, currentMode: PermissionModeStatus): CommandPanelEntry {
  const label = permissionModeLabel(mode);
  const selected = mode === currentMode;
  return {
    id: `permissions:mode:${mode}`,
    title: label,
    kind: "status",
    status: selected ? "current" : "select",
    meta: permissionModeMeta(mode),
    details: permissionModeDetails(mode),
    disabled: selected,
    action: selected ? undefined : {
      type: "writeConfig",
      title: "Permissions",
      message: `Set permissions mode to ${label}.`,
      edits: permissionModeConfigEdits(mode),
      reloadUserConfig: true,
    },
  };
}

function permissionModeConfig(mode: PermissionMode): {
  sandboxMode: string;
  approvalPolicy: unknown;
  approvalsReviewer: string;
  sandboxWorkspaceWrite: unknown;
} {
  switch (mode) {
    case "read-only":
      return {
        sandboxMode: "read-only",
        approvalPolicy: "on-request",
        approvalsReviewer: "user",
        sandboxWorkspaceWrite: null,
      };
    case "auto":
      return {
        sandboxMode: "workspace-write",
        approvalPolicy: "on-request",
        approvalsReviewer: "user",
        sandboxWorkspaceWrite: DEFAULT_WORKSPACE_WRITE,
      };
    case "granular":
      return {
        sandboxMode: "workspace-write",
        approvalPolicy: GRANULAR_APPROVAL_POLICY,
        approvalsReviewer: "user",
        sandboxWorkspaceWrite: DEFAULT_WORKSPACE_WRITE,
      };
    case "full-access":
      return {
        sandboxMode: "danger-full-access",
        approvalPolicy: "never",
        approvalsReviewer: "user",
        sandboxWorkspaceWrite: null,
      };
  }
}

function permissionModeLabel(mode: PermissionMode): string {
  switch (mode) {
    case "read-only":
      return "Read only";
    case "auto":
      return "Auto";
    case "granular":
      return "Granular";
    case "full-access":
      return "Full access";
  }
}

function permissionModeMeta(mode: PermissionMode): string {
  switch (mode) {
    case "read-only":
      return "Read files, ask before changes or commands.";
    case "auto":
      return "Workspace write with on-request approvals.";
    case "granular":
      return "Workspace write with request-permission approvals.";
    case "full-access":
      return "No sandbox and no approval prompts.";
  }
}

function permissionModeDetails(mode: PermissionMode): string[] {
  const config = permissionModeConfig(mode);
  return [
    `sandbox_mode: ${config.sandboxMode}`,
    `approval_policy: ${formatApprovalPolicy(config.approvalPolicy)}`,
    `approvals_reviewer: ${config.approvalsReviewer}`,
  ];
}

function permissionContextDetails(context: ThreadContextDefaults | null): string[] {
  return [
    `sandbox_mode: ${stringValue(context?.sandbox) ?? "workspace-write"}`,
    `approval_policy: ${formatApprovalPolicy(context?.approvalPolicy ?? "on-request")}`,
    `approvals_reviewer: ${stringValue(context?.approvalsReviewer) ?? "user"}`,
  ];
}

function isGranularApprovalPolicy(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const granular = (value as Record<string, unknown>).granular;
  if (!granular || typeof granular !== "object" || Array.isArray(granular)) return false;
  const record = granular as Record<string, unknown>;
  return record.sandbox_approval === false
    && record.rules === false
    && record.skill_approval === false
    && record.request_permissions === true
    && record.mcp_elicitations === true;
}

function formatApprovalPolicy(value: unknown): string {
  if (typeof value === "string") return value;
  if (isGranularApprovalPolicy(value)) return "granular";
  return "custom";
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
