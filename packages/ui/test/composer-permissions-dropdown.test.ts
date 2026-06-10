/*
 * Locks the composer permissions-dropdown mode mapping to its Codex source
 * (composer-B7sGHJVq.js). The dropdown shows four rows; read-only/auto/granular
 * all fold into the default "Ask for approval" row (codex `G`/`Jd`), and each
 * clickable row applies a named mode that must round-trip back to its own row.
 */
import {
  PERMISSION_DROPDOWN_APPLY_MODE,
  permissionDropdownApplyMode,
  permissionDropdownBlockedReason,
  permissionModeFromThreadContext,
  permissionsDropdownSelectedKey,
  type PermissionDropdownKey,
} from "../src/state/permissions-mode";
import type { ThreadContextDefaults } from "../src/state/codex-reducer";

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

const GRANULAR_APPROVAL_POLICY = {
  granular: {
    sandbox_approval: false,
    rules: false,
    skill_approval: false,
    request_permissions: true,
    mcp_elicitations: true,
  },
};

const ctx = (partial: Partial<ThreadContextDefaults>): ThreadContextDefaults =>
  partial as ThreadContextDefaults;

export function selectedKeyFoldsReadOnlyAutoGranularIntoDefault(): void {
  // codex G = !guardian && !full && !custom — the default row covers all three.
  assert(permissionsDropdownSelectedKey("read-only") === "default", "read-only → default row");
  assert(permissionsDropdownSelectedKey("auto") === "default", "auto → default row");
  assert(permissionsDropdownSelectedKey("granular") === "default", "granular → default row");
  assert(
    permissionsDropdownSelectedKey("guardian-approvals") === "guardian-approvals",
    "guardian-approvals → guardian row",
  );
  assert(permissionsDropdownSelectedKey("full-access") === "full-access", "full-access → full row");
  assert(permissionsDropdownSelectedKey("custom") === "custom", "custom → custom row");
}

export function applyModeTableMatchesCodexOptions(): void {
  // codex Ee/Oe/ke: default → workspace-write default ("auto"), the rest map 1:1.
  assert(PERMISSION_DROPDOWN_APPLY_MODE["default"] === "auto", "default row applies auto");
  assert(
    PERMISSION_DROPDOWN_APPLY_MODE["guardian-approvals"] === "guardian-approvals",
    "guardian row applies guardian-approvals",
  );
  assert(PERMISSION_DROPDOWN_APPLY_MODE["full-access"] === "full-access", "full row applies full-access");
}

export function selectedDefaultRowClickIsANoopForFoldedModes(): void {
  assert(permissionDropdownApplyMode("default", "read-only") === null, "read-only selected default row is a no-op");
  assert(permissionDropdownApplyMode("default", "auto") === null, "auto selected default row is a no-op");
  assert(permissionDropdownApplyMode("default", "granular") === null, "granular selected default row is a no-op");
  assert(
    permissionDropdownApplyMode("guardian-approvals", "auto") === "guardian-approvals",
    "unselected guardian row still applies guardian-approvals",
  );
}

export function runtimeRequirementsDisableBlockedDropdownRows(): void {
  const requirements = {
    requirements: {
      allowedSandboxModes: ["read-only", "workspace-write"],
      allowedApprovalPolicies: ["on-request"],
      allowedApprovalsReviewers: ["user"],
    },
  };
  assert(
    permissionDropdownBlockedReason("full-access", requirements).includes("danger-full-access"),
    "full-access row should be blocked when danger-full-access sandbox is disallowed",
  );
  assert(
    permissionDropdownBlockedReason("default", requirements) === "",
    "default row should stay enabled when workspace-write/on-request/user is allowed",
  );
}

export function applyModesRoundTripToTheirOwnRow(): void {
  // Applying a clickable row's mode then re-deriving the mode from the resulting
  // thread context must land back on that same row — the core Codex-parity loop.
  const cases: Array<{
    key: Exclude<PermissionDropdownKey, "custom">;
    context: ThreadContextDefaults;
  }> = [
    {
      key: "default",
      context: ctx({ sandbox: "workspace-write", approvalPolicy: "on-request", approvalsReviewer: "user" }),
    },
    {
      key: "guardian-approvals",
      context: ctx({
        sandbox: "workspace-write",
        approvalPolicy: "on-request",
        approvalsReviewer: "guardian_subagent",
      }),
    },
    {
      key: "full-access",
      context: ctx({ sandbox: "danger-full-access", approvalPolicy: "never", approvalsReviewer: "user" }),
    },
  ];
  for (const testCase of cases) {
    const resolvedMode = permissionModeFromThreadContext(testCase.context);
    assert(
      resolvedMode === PERMISSION_DROPDOWN_APPLY_MODE[testCase.key],
      `${testCase.key}: context resolves to ${resolvedMode}, expected ${PERMISSION_DROPDOWN_APPLY_MODE[testCase.key]}`,
    );
    assert(
      permissionsDropdownSelectedKey(resolvedMode) === testCase.key,
      `${testCase.key}: round-trips to ${permissionsDropdownSelectedKey(resolvedMode)}`,
    );
  }
}

export function granularContextStillChecksTheDefaultRow(): void {
  // codex Jd: workspace-write + granular approval + user reviewer → "granular",
  // which (unlike the settings panel) shares the default dropdown row.
  const mode = permissionModeFromThreadContext(
    ctx({
      sandbox: "workspace-write",
      approvalPolicy: GRANULAR_APPROVAL_POLICY,
      approvalsReviewer: "user",
    }),
  );
  assert(mode === "granular", `granular policy resolves to granular, got ${mode}`);
  assert(permissionsDropdownSelectedKey(mode) === "default", "granular checks the default row");
}

export function nonDefaultSandboxChecksTheCustomRow(): void {
  // codex Jd: a sandbox policy that deviates from named defaults → "custom".
  const mode = permissionModeFromThreadContext(
    ctx({
      sandbox: "workspace-write",
      approvalPolicy: "on-request",
      approvalsReviewer: "user",
      sandboxIsNonDefault: true,
    } as Partial<ThreadContextDefaults>),
  );
  assert(mode === "custom", `non-default sandbox → custom, got ${mode}`);
  assert(permissionsDropdownSelectedKey(mode) === "custom", "custom mode checks the Custom row");
}
