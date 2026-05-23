import type { ThreadContextDefaults } from "./codex-reducer";
import type { CommandPanelEntry, ConfigWriteActionEdit } from "./command-panel";

export type PermissionMode = "read-only" | "auto" | "granular" | "full-access";
export type PermissionModeStatus = PermissionMode | "custom";
export type PermissionRequirementsInput = unknown;

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

export function projectPermissionModeCommandEntries(
  context: ThreadContextDefaults | null,
  requirementsInput?: PermissionRequirementsInput,
): CommandPanelEntry[] {
  const currentMode = permissionModeFromThreadContext(context);
  const requirements = permissionRequirementsFromInput(requirementsInput);
  return [
    ...PERMISSION_MODES.map((mode) => permissionModeEntry(mode, currentMode, requirements)),
    {
      id: "permissions:current",
      title: "Current resolved mode",
      kind: "status",
      status: currentMode,
      meta: "Derived from app-server config/read",
      details: permissionContextDetails(context),
    },
    ...(requirementsInput === undefined ? [] : [requirementsEntry(requirements)]),
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

function permissionModeEntry(
  mode: PermissionMode,
  currentMode: PermissionModeStatus,
  requirements: PermissionRequirements | null,
): CommandPanelEntry {
  const label = permissionModeLabel(mode);
  const selected = mode === currentMode;
  const blockedReason = permissionModeBlockedReason(mode, requirements);
  const disabled = selected || blockedReason !== "";
  return {
    id: `permissions:mode:${mode}`,
    title: label,
    kind: "status",
    status: selected ? "current" : blockedReason ? "blocked" : "select",
    meta: blockedReason || permissionModeMeta(mode),
    details: blockedReason
      ? [...permissionModeDetails(mode), blockedReason]
      : permissionModeDetails(mode),
    disabled,
    action: disabled ? undefined : {
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

interface PermissionRequirements {
  allowedApprovalPolicies: unknown[] | null;
  allowedApprovalsReviewers: string[] | null;
  allowedSandboxModes: string[] | null;
  allowedPermissions: string[] | null;
  allowedWebSearchModes: string[] | null;
  allowManagedHooksOnly: boolean | null;
  allowAppshots: boolean | null;
  allowLockedComputerUse: boolean | null;
  featureRequirements: Record<string, boolean> | null;
}

function permissionRequirementsFromInput(input: unknown): PermissionRequirements | null {
  const root = recordValue(input);
  const hasRequirementsEnvelope = root && Object.prototype.hasOwnProperty.call(root, "requirements");
  const requirements = hasRequirementsEnvelope ? recordValue(root.requirements) : root;
  if (!requirements) return null;
  return {
    allowedApprovalPolicies: arrayValue(requirements.allowedApprovalPolicies),
    allowedApprovalsReviewers: stringArray(requirements.allowedApprovalsReviewers),
    allowedSandboxModes: stringArray(requirements.allowedSandboxModes),
    allowedPermissions: stringArray(requirements.allowedPermissions),
    allowedWebSearchModes: stringArray(requirements.allowedWebSearchModes),
    allowManagedHooksOnly: booleanOrNull(requirements.allowManagedHooksOnly),
    allowAppshots: booleanOrNull(requirements.allowAppshots),
    allowLockedComputerUse: booleanOrNull(recordValue(requirements.computerUse)?.allowLockedComputerUse),
    featureRequirements: booleanRecord(requirements.featureRequirements),
  };
}

function requirementsEntry(requirements: PermissionRequirements | null): CommandPanelEntry {
  if (!requirements) {
    return {
      id: "permissions:requirements",
      title: "Runtime requirements",
      kind: "status",
      status: "none",
      meta: "configRequirements/read returned no managed constraints",
    };
  }
  return {
    id: "permissions:requirements",
    title: "Runtime requirements",
    kind: "status",
    status: "active",
    meta: "Loaded from configRequirements/read",
    details: permissionRequirementsDetails(requirements),
  };
}

function permissionRequirementsDetails(requirements: PermissionRequirements): string[] {
  const details = [
    requirements.allowedSandboxModes
      ? `allowed sandbox modes: ${requirements.allowedSandboxModes.join(", ")}`
      : "",
    requirements.allowedApprovalPolicies
      ? `allowed approval policies: ${requirements.allowedApprovalPolicies.map(formatApprovalPolicy).join(", ")}`
      : "",
    requirements.allowedApprovalsReviewers
      ? `allowed approval reviewers: ${requirements.allowedApprovalsReviewers.join(", ")}`
      : "",
    requirements.allowedPermissions
      ? `allowed permission profiles: ${requirements.allowedPermissions.join(", ")}`
      : "",
    requirements.allowedWebSearchModes
      ? `allowed web search modes: ${requirements.allowedWebSearchModes.join(", ")}`
      : "",
    requirements.allowManagedHooksOnly !== null
      ? `managed hooks only: ${requirements.allowManagedHooksOnly ? "yes" : "no"}`
      : "",
    requirements.allowAppshots !== null
      ? `appshots allowed: ${requirements.allowAppshots ? "yes" : "no"}`
      : "",
    requirements.allowLockedComputerUse !== null
      ? `locked computer use: ${requirements.allowLockedComputerUse ? "allowed" : "blocked"}`
      : "",
    requirements.featureRequirements
      ? `pinned features: ${Object.entries(requirements.featureRequirements)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(", ")}`
      : "",
  ].filter(Boolean);
  return details.length > 0 ? details : ["No scoped requirement values were returned."];
}

function permissionModeBlockedReason(mode: PermissionMode, requirements: PermissionRequirements | null): string {
  if (!requirements) return "";
  const config = permissionModeConfig(mode);
  if (
    requirements.allowedSandboxModes
    && !requirements.allowedSandboxModes.includes(config.sandboxMode)
  ) {
    return `Blocked by configRequirements/read: sandbox_mode ${config.sandboxMode} is not allowed.`;
  }
  if (
    requirements.allowedApprovalPolicies
    && !requirements.allowedApprovalPolicies.some((policy) => approvalPoliciesEqual(policy, config.approvalPolicy))
  ) {
    return `Blocked by configRequirements/read: approval_policy ${formatApprovalPolicy(config.approvalPolicy)} is not allowed.`;
  }
  if (
    requirements.allowedApprovalsReviewers
    && !requirements.allowedApprovalsReviewers.includes(config.approvalsReviewer)
  ) {
    return `Blocked by configRequirements/read: approvals_reviewer ${config.approvalsReviewer} is not allowed.`;
  }
  return "";
}

function approvalPoliciesEqual(a: unknown, b: unknown): boolean {
  if (typeof a === "string" || typeof b === "string") return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function arrayValue(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return strings.length > 0 ? strings : [];
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function booleanRecord(value: unknown): Record<string, boolean> | null {
  const record = recordValue(value);
  if (!record) return null;
  const entries = Object.entries(record).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean");
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
