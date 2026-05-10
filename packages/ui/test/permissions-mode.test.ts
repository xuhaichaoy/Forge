import {
  permissionModeConfigEdits,
  permissionModeFromThreadContext,
  projectPermissionModeCommandEntries,
} from "../src/state/permissions-mode";

export default function runPermissionsModeTests(): void {
  derivesDesktopPermissionModesFromThreadContext();
  projectsModeRowsWithConfigWrites();
  writesGranularModeWithDesktopPolicyShape();
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
