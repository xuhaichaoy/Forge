import {
  permissionModeConfigEdits,
  permissionModeFromThreadContext,
  projectPermissionModeCommandEntries,
} from "../src/state/permissions-mode";

export default function runPermissionsModeTests(): void {
  derivesDesktopPermissionModesFromThreadContext();
  projectsModeRowsWithConfigWrites();
  writesGranularModeWithDesktopPolicyShape();
  disablesModesBlockedByRuntimeRequirements();
}

function derivesDesktopPermissionModesFromThreadContext(): void {
  assertEqual(permissionModeFromThreadContext(null), "auto", "missing config should follow Desktop's auto default");
  assertEqual(
    permissionModeFromThreadContext({
      sandbox: "read-only",
      approvalPolicy: "on-request",
      approvalsReviewer: "user",
    }),
    "read-only",
    "read-only mode should map from read-only sandbox plus on-request approvals",
  );
  assertEqual(
    permissionModeFromThreadContext({
      sandbox: "danger-full-access",
      approvalPolicy: "never",
      approvalsReviewer: "user",
    }),
    "full-access",
    "full-access mode should map from danger-full-access plus never approvals",
  );
  assertEqual(
    permissionModeFromThreadContext({
      sandbox: "workspace-write",
      approvalPolicy: { granular: {
        sandbox_approval: false,
        rules: false,
        skill_approval: false,
        request_permissions: true,
        mcp_elicitations: true,
      } },
      approvalsReviewer: "user",
    }),
    "granular",
    "granular mode should map from Desktop's granular approval object",
  );

  // codex Jd/Qd/$d: a sandbox policy whose details deviate from the named-mode
  // defaults (network on read-only, or network/exclude_slash_tmp/
  // exclude_tmpdir_env_var on workspace-write) resolves to `custom`, even though
  // the collapsed mode string would otherwise match a named mode.
  assertEqual(
    permissionModeFromThreadContext({
      sandbox: "read-only",
      sandboxIsNonDefault: true,
      approvalPolicy: "on-request",
      approvalsReviewer: "user",
    }),
    "custom",
    "read-only with network access (non-default policy) should resolve to custom",
  );
  assertEqual(
    permissionModeFromThreadContext({
      sandbox: "workspace-write",
      sandboxIsNonDefault: true,
      approvalPolicy: "on-request",
      approvalsReviewer: "user",
    }),
    "custom",
    "workspace-write with non-default details should resolve to custom, not auto",
  );
  assertEqual(
    permissionModeFromThreadContext({
      sandbox: "workspace-write",
      approvalPolicy: "on-request",
      approvalsReviewer: "user",
    }),
    "auto",
    "default workspace-write (no non-default flag) still resolves to the named mode",
  );
}

function projectsModeRowsWithConfigWrites(): void {
  const entries = projectPermissionModeCommandEntries({
    sandbox: "workspace-write",
    approvalPolicy: "on-request",
    approvalsReviewer: "user",
  });

  assertDeepEqual(
    entries.map((entry) => ({ id: entry.id, status: entry.status, disabled: entry.disabled === true })),
    [
      { id: "permissions:mode:read-only", status: "select", disabled: false },
      { id: "permissions:mode:auto", status: "current", disabled: true },
      { id: "permissions:mode:granular", status: "select", disabled: false },
      { id: "permissions:mode:guardian-approvals", status: "select", disabled: false },
      { id: "permissions:mode:full-access", status: "select", disabled: false },
      { id: "permissions:current", status: "auto", disabled: false },
    ],
    "permission mode panel should show Desktop mode order and current selection",
  );
  assertDeepEqual(
    entries.find((entry) => entry.id === "permissions:mode:read-only")?.action,
    {
      type: "writeConfig",
      title: "Permissions",
      message: "Set permissions mode to Read only.",
      edits: permissionModeConfigEdits("read-only"),
      reloadUserConfig: true,
    },
    "selectable permission rows should write Codex config through app-server",
  );
}

function writesGranularModeWithDesktopPolicyShape(): void {
  assertDeepEqual(
    permissionModeConfigEdits("granular"),
    [
      { keyPath: "sandbox_mode", value: "workspace-write", mergeStrategy: "replace" },
      {
        keyPath: "approval_policy",
        value: {
          granular: {
            sandbox_approval: false,
            rules: false,
            skill_approval: false,
            request_permissions: true,
            mcp_elicitations: true,
          },
        },
        mergeStrategy: "replace",
      },
      { keyPath: "approvals_reviewer", value: "user", mergeStrategy: "replace" },
      {
        keyPath: "sandbox_workspace_write",
        value: {
          writable_roots: [],
          network_access: false,
          exclude_slash_tmp: false,
          exclude_tmpdir_env_var: false,
        },
        mergeStrategy: "replace",
      },
    ],
    "granular mode should write Desktop's workspace-write granular policy shape",
  );
}

function disablesModesBlockedByRuntimeRequirements(): void {
  const entries = projectPermissionModeCommandEntries(
    {
      sandbox: "workspace-write",
      approvalPolicy: "on-request",
      approvalsReviewer: "user",
    },
    {
      requirements: {
        allowedSandboxModes: ["read-only", "workspace-write"],
        allowedApprovalPolicies: ["on-request"],
        allowedApprovalsReviewers: ["user"],
        allowedPermissions: [":read-only", ":workspace"],
        allowManagedHooksOnly: true,
        computerUse: { allowLockedComputerUse: false },
        featureRequirements: { personality: true },
      },
    },
  );

  assertDeepEqual(
    entries.map((entry) => ({ id: entry.id, status: entry.status, disabled: entry.disabled === true })),
    [
      { id: "permissions:mode:read-only", status: "select", disabled: false },
      { id: "permissions:mode:auto", status: "current", disabled: true },
      { id: "permissions:mode:granular", status: "blocked", disabled: true },
      { id: "permissions:mode:guardian-approvals", status: "blocked", disabled: true },
      { id: "permissions:mode:full-access", status: "blocked", disabled: true },
      { id: "permissions:current", status: "auto", disabled: false },
      { id: "permissions:requirements", status: "active", disabled: false },
    ],
    "managed config requirements should disable permission presets that app-server will reject",
  );
  assertDeepEqual(
    entries.find((entry) => entry.id === "permissions:mode:granular")?.action,
    undefined,
    "blocked permission presets should not expose config writes",
  );
  assertDeepEqual(
    entries.find((entry) => entry.id === "permissions:requirements")?.details,
    [
      "allowed sandbox modes: read-only, workspace-write",
      "allowed approval policies: on-request",
      "allowed approval reviewers: user",
      "allowed permission profiles: :read-only, :workspace",
      "managed hooks only: yes",
      "locked computer use: blocked",
      "pinned features: personality=true",
    ],
    "requirements row should surface the durable app-server requirement gates",
  );
  assertDeepEqual(
    projectPermissionModeCommandEntries(null, { requirements: null }).find((entry) => entry.id === "permissions:requirements")?.status,
    "none",
    "a null configRequirements/read payload should display as no managed constraints",
  );
  assertDeepEqual(
    projectPermissionModeCommandEntries(
      {
        sandbox: "workspace-write",
        approvalPolicy: "on-request",
        approvalsReviewer: "user",
      },
      { requirements: { allowedApprovalsReviewers: ["auto_review"] } },
    ).find((entry) => entry.id === "permissions:mode:read-only")?.status,
    "blocked",
    "managed approval-reviewer requirements should disable presets that write a forbidden reviewer",
  );
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
