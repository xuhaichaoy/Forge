// codex: accelerator-hint audit (2026-05) — surveyed every interactive
// element in this footer against `COMMAND_DESCRIPTORS` in `state/commands.ts`:
//   * `+` add-menu / project switcher (`title="Project and work mode"`):
//     Codex Desktop opens the same picker via the footer chip only; no
//     keybinding exists in `electron-menu-shortcuts-*.js` and HiCodex
//     does not expose `openProjectMenu` in COMMAND_IDS — skipped.
//   * Permissions chip (`title="Change permissions"`): Codex Desktop renders
//     this as `composer.permissions.changePermissions` with no accelerator,
//     and HiCodex has no `openPermissions` command — skipped.
//   * Branch chip: now interactive via `ComposerFooterBranchSwitcher` (host
//     `host_git_list_branches` + `host_git_checkout_branch`); Codex Desktop
//     does not assign a global accelerator to the branch picker either
//     (cf. `composer-footer-branch-switcher-*.js`), so no accelerator
//     hint applies — skipped.
//   * Model / intelligence chip (`title="Select model"`): Codex Desktop
//     wires this to the model picker without an accelerator (cf.
//     `composer-*.js` defaultMessage `Select model`); HiCodex has no
//     `openModelPicker` entry yet — skipped.
// Conclusion: there is no footer button with a 1:1 mapping to an existing
// keybinding. Re-run this audit when `openModelPicker`, `openPermissions`,
// or similar entries land in `state/commands.ts`, then thread tooltips
// through `descriptorAcceleratorLabel(commandId)` (already exported by
// `state/commands.ts`).
import { ChevronDown, Hand, Settings, ShieldAlert, ShieldCheck, ShieldUser, type LucideIcon } from "lucide-react";
import type { ComposerWorkMode, WorktreeModeOption } from "../state/worktrees";
// codex: composer-footer-branch-switcher-*.js — chip + dropdown.
import { ComposerFooterBranchSwitcher } from "./composer-footer-branch-switcher";
import { ComposerFooterProjectControls } from "./composer-external-footer-project";
import type { ComposerWorkspaceRootOption } from "./composer-external-footer-project";
// codex tooltip-CDzchJxN.js — the composer settings chips are wrapped in a styled Tooltip
// (Codex's intelligence trigger uses `Cn`/`tooltipContent`), replacing the native `title`.
import { Tooltip } from "./tooltip";
import { useHiCodexIntl } from "./i18n-provider";

export { formatWorkspaceProjectLabel } from "./composer-external-footer-project";
export type { ComposerWorkspaceRootOption } from "./composer-external-footer-project";

export interface ComposerExternalFooterProps {
  branch?: string | null;
  cwd?: string | null;
  workMode?: ComposerWorkMode;
  workModeOptions?: WorktreeModeOption[];
  workspaceRoots?: ComposerWorkspaceRootOption[];
  onWorkspaceRootSelected?: (root: string) => void | Promise<void>;
  onUseExistingFolder?: () => void | Promise<void>;
  /**
   * codex `composer.localCwdDropdown.clearProject` ("Don't work in a project"):
   * drop the active project → projectless. Only shown when a project is selected.
   */
  onSelectProjectless?: () => void | Promise<void>;
  onWorkModeChange?: (mode: ComposerWorkMode) => void;
  /**
   * codex: composer-footer-branch-switcher-*.js — fired after a
   * successful `git checkout` so the host can refresh `Thread.gitBranch` /
   * other branch-dependent caches.
   */
  onBranchSwitched?: (branchName: string) => void;
  /**
   * codex: composer-footer-branch-switcher-*.js — surface git checkout
   * failures through the dispatch log (caller decides toast vs. inline).
   */
  onBranchSwitchError?: (message: string) => void;
  /**
   * codex fp (ExternalFooterSlot): the HOME variant slides the footer in
   * (y:-100%→0) and tucks it under the composer (`relative z-0 -mt-2`); the
   * in-thread footer is static. Defaults to "default" (no drawer animation).
   */
  variant?: "home" | "default";
}

export function ComposerExternalFooter({
  branch,
  cwd,
  workMode = "local",
  workModeOptions,
  workspaceRoots = [],
  onWorkspaceRootSelected,
  onUseExistingFolder,
  onSelectProjectless,
  onWorkModeChange,
  onBranchSwitched,
  onBranchSwitchError,
  variant = "default",
}: ComposerExternalFooterProps) {
  const branchLabel = formatBranchFooterLabel(branch);

  return (
    // CODEX-REF: composer-*.js — the composer footer is a
    // strict 3-column grid:
    //   <div className="composer-footer grid grid-cols-[minmax(0,auto)_auto_minmax(0,1fr)] items-center gap-[5px]">
    //     <vz .../>                              {/* left: + add menu + permissions */}
    //     <div className="flex items-center">    {/* middle: cloud-only slot */}
    //       {d==="cloud" ? <jR/> : null}
    //     </div>
    //     <div className="flex w-full min-w-0 items-center justify-end gap-2">
    //       <div className="flex min-w-0 flex-1 justify-end"> ... model/context ... </div>
    //       <div className="flex shrink-0 items-center gap-2"> mic + send </div>
    //     </div>
    //   </div>
    // The send button + mic live in composer.tsx for HiCodex, so the actions
    // cluster slot in this strip is intentionally empty here.
    <div className="hc-composer-external-footer" data-variant={variant} aria-label="Composer context">
      {/*
       * CODEX-REF: composer-*.js — left column hosts the
       * `+` add-menu trigger followed by the permissions chip (Codex packs
       * both into a single component rendered into the first grid cell).
       */}
      <ComposerFooterProjectControls
        cwd={cwd}
        workMode={workMode}
        workModeOptions={workModeOptions}
        workspaceRoots={workspaceRoots}
        onWorkspaceRootSelected={onWorkspaceRootSelected}
        onUseExistingFolder={onUseExistingFolder}
        onSelectProjectless={onSelectProjectless}
        onWorkModeChange={onWorkModeChange}
      />
      {/*
       * codex: composer-footer-branch-switcher-*.js — chip + dropdown.
       * Replaces the previous readonly span. The switcher renders the same
       * `hc-composer-footer-branch` chip (so existing CSS / SSR snapshots keep
       * matching) but turns it into a button that opens a portal-positioned
       * branch picker driven by `host_git_list_branches` /
       * `host_git_checkout_branch`. When the workspace is not a git repo /
       * the host bridge is unavailable, the switcher falls back to the
       * read-only label or hides itself entirely (mirrors Codex's "chip only
       * shows when we know what to show" behavior).
       */}
      <div className="hc-composer-external-footer-center" aria-hidden={branchLabel ? undefined : true}>
        {branchLabel && (
          <ComposerFooterBranchSwitcher
            cwd={cwd}
            currentBranch={branchLabel}
            onBranchSwitched={onBranchSwitched}
            onError={onBranchSwitchError}
          />
        )}
      </div>
    </div>
  );
}

/*
 * CODEX-REF: composer-*.js — the model-intelligence trigger
 * (`data-codex-intelligence-trigger`), reasoning-effort chip and permissions
 * chip render INSIDE the composer bubble footer (`composer-footer` grid), not
 * in the below-bubble strip. HiCodex groups them here so the Composer can mount
 * the cluster in its in-bubble footer-middle slot; branch + work-mode stay in
 * the external below-bubble footer.
 */
const REASONING_LABELS = {
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
} as const;
type ReasoningKey = keyof typeof REASONING_LABELS;
const REASONING_KEYS: readonly ReasoningKey[] = ["none", "minimal", "low", "medium", "high", "xhigh"];

// codex composer-zFOdryLS.js `Xp` — the permissions CHIP trigger renders a PER-MODE icon
// alongside the label (icon `he` + label `ge` together in each branch). The four Codex
// glyphs: full-access = shield-exclamation (`Qc`), guardian-approvals = shield-user (`Gp`),
// custom = settings-cog, default = raised-hand (`Wp`) → closest lucide equivalents. Keyed
// by the label `formatPermissionsFooterLabel` returns — note the guardian CHIP label is
// `guardianApproval.triggerLabel` = "Approve for me" (the "Auto-review" string is the
// settings/`agentMode` label, used in permissions-mode.ts, not on the chip).
const PERMISSIONS_FOOTER_ICON: Record<string, LucideIcon> = {
  "Full access": ShieldAlert,
  "Approve for me": ShieldUser,
  "Custom": Settings,
  "Ask for approval": Hand,
};

// Maps the (English) chip label — which is also the icon-map key above — to its Codex
// permissions-dropdown shortLabel id, so the DISPLAYED text localizes while the icon
// lookup (and the title) still key off the stable English label.
const PERMISSIONS_FOOTER_LABEL_ID: Record<string, string> = {
  "Full access": "composer.permissionsDropdown.fullAccess.shortLabel",
  "Approve for me": "composer.permissionsDropdown.guardianApproval.triggerLabel",
  "Custom": "composer.permissionsDropdown.custom.shortLabel",
  "Ask for approval": "composer.permissionsDropdown.default.shortLabel",
};

export interface ComposerSettingsChipsProps {
  model?: string | null;
  /**
   * Provider context shown in the model chip tooltip ("团队模型 ·
   * 127.0.0.1:5050") — personal/team gateways can serve identically named
   * models, so the model name alone cannot tell which service a send hits.
   */
  modelProviderHint?: string | null;
  approvalPolicy?: unknown;
  approvalsReviewer?: unknown;
  reasoningEffort?: unknown;
  sandboxMode?: unknown;
  onOpenPermissions?: (anchor: HTMLElement) => void;
  onOpenModelPicker?: (anchor: HTMLElement) => void;
  onOpenReasoningPicker?: (anchor: HTMLElement) => void;
}

export function ComposerSettingsChips({
  model,
  modelProviderHint,
  approvalPolicy,
  approvalsReviewer,
  reasoningEffort,
  sandboxMode,
  onOpenPermissions,
  onOpenModelPicker,
  onOpenReasoningPicker,
}: ComposerSettingsChipsProps) {
  const { formatMessage } = useHiCodexIntl();
  const intelligenceLabel = formatIntelligenceFooterLabel({ model });
  const reasoningEffortNormalized: ReasoningKey = typeof reasoningEffort === "string"
    && REASONING_KEYS.includes(reasoningEffort.trim().toLowerCase() as ReasoningKey)
    ? (reasoningEffort.trim().toLowerCase() as ReasoningKey)
    : "medium";
  const reasoningChipLabel = formatMessage({
    id: `composer.mode.local.reasoning.${reasoningEffortNormalized}.label`,
    defaultMessage: REASONING_LABELS[reasoningEffortNormalized],
  });
  const permissionsLabel = formatPermissionsFooterLabel({ approvalPolicy, approvalsReviewer, sandboxMode });
  const permissionsTitle = formatPermissionsFooterTitle({ approvalPolicy, approvalsReviewer, sandboxMode }, permissionsLabel);
  const PermissionsIcon = PERMISSIONS_FOOTER_ICON[permissionsLabel] ?? ShieldCheck;
  return (
    <div className="hc-composer-settings-chips">
      <Tooltip content={onOpenPermissions ? formatMessage({ id: "composer.permissionsDropdown.trigger.tooltip", defaultMessage: "Change permissions" }) : permissionsTitle}>
        <button
          type="button"
          className="hc-composer-footer-chip hc-composer-footer-permissions"
          data-chip="permissions"
          data-interactive={onOpenPermissions ? "true" : undefined}
          onClick={onOpenPermissions ? (event) => onOpenPermissions(event.currentTarget) : undefined}
        >
          <PermissionsIcon size={14} />
          <span className="hc-composer-footer-chip-label">{formatMessage({ id: PERMISSIONS_FOOTER_LABEL_ID[permissionsLabel] ?? "", defaultMessage: permissionsLabel })}</span>
          <ChevronDown size={14} />
        </button>
      </Tooltip>
      {/*
       * The model chip is the ONLY entry point to the model picker, so it must
       * stay visible even when the current model name is unknown (an active
       * thread without an explicit re-pick keeps its birth model, which the
       * client does not track) — fall back to a generic label instead of
       * hiding the trigger.
       */}
      {(intelligenceLabel || onOpenModelPicker) && (
        <Tooltip content={
          modelProviderHint
            ?? (onOpenModelPicker
              ? formatMessage({ id: "composer.intelligenceDropdown.tooltip", defaultMessage: "Select model" })
              : intelligenceLabel)
        }>
          <button
            type="button"
            className="hc-composer-footer-chip hc-composer-footer-model hc-composer-footer-intelligence"
            data-chip="intelligence"
            data-interactive={onOpenModelPicker ? "true" : undefined}
            onClick={onOpenModelPicker ? (event) => onOpenModelPicker(event.currentTarget) : undefined}
          >
            {/* Desktop uses one intelligence trigger. HiCodex has a separate reasoning chip, so this label stays model-only. */}
            <span className="hc-composer-footer-chip-label">
              {intelligenceLabel || formatMessage({ id: "composer.intelligenceDropdown.fallbackLabel", defaultMessage: "模型" })}
            </span>
            <ChevronDown size={14} />
          </button>
        </Tooltip>
      )}
      {reasoningChipLabel && (
        <Tooltip content={onOpenReasoningPicker ? "Set reasoning effort" : `Reasoning: ${reasoningChipLabel}`}>
          <button
            type="button"
            className="hc-composer-footer-chip hc-composer-footer-reasoning"
            data-chip="reasoning"
            data-codex-intelligence-trigger
            data-selected-reasoning-effort={reasoningEffortNormalized ?? undefined}
            data-interactive={onOpenReasoningPicker ? "true" : undefined}
            onClick={onOpenReasoningPicker ? (event) => onOpenReasoningPicker(event.currentTarget) : undefined}
          >
            <span className="hc-composer-footer-chip-label">{reasoningChipLabel}</span>
            {onOpenReasoningPicker && <ChevronDown size={14} />}
          </button>
        </Tooltip>
      )}
    </div>
  );
}

function formatBranchFooterLabel(value?: string | null): string {
  return typeof value === "string" ? value.trim() : "";
}

export function formatIntelligenceFooterLabel({
  model,
}: {
  model?: string | null;
}): string {
  const trimmedModel = model?.trim() ?? "";
  if (!trimmedModel) return "";
  // Team gateway model ids are `provider_id:model_id`; the chip shows the
  // model part (the provider context lives in the picker's section header).
  const colonIndex = trimmedModel.indexOf(":");
  const displayModel = colonIndex > 0 && colonIndex < trimmedModel.length - 1
    ? trimmedModel.slice(colonIndex + 1)
    : trimmedModel;
  return displayModel.replace(/^gpt[-_]/iu, "");
}

export function formatPermissionsFooterLabel(input: {
  approvalPolicy?: unknown;
  approvalsReviewer?: unknown;
  sandboxMode?: unknown;
}): string {
  const sandboxMode = stringValue(input.sandboxMode) ?? "workspace-write";
  const approvalPolicy = input.approvalPolicy ?? "on-request";
  const approvalsReviewer = stringValue(input.approvalsReviewer) ?? "user";
  if (sandboxMode === "danger-full-access" && approvalPolicy === "never") return "Full access";
  // codex composer-zFOdryLS.js Xp — the guardian CHIP trigger uses `guardianApproval.triggerLabel`
  // ("Approve for me"), not the `shortLabel`/`agentMode` "Auto-review" (that's the settings label).
  if (isAutoReviewPolicy(approvalsReviewer)) return "Approve for me";
  // codex composer.permissionsDropdown.default.shortLabel — the footer CHIP renders the
  // mode's *shortLabel* (verified in composer-zFOdryLS.js: the chip trigger uses
  // `<mode>.shortLabel`, not `.label`). Codex's default approvals mode is the catch-all
  // for any policy that is not full-access / guardian / config.toml-custom, and its
  // chip shortLabel is "Ask for approval". Both the granular-object policy form and the
  // legacy on-request string are this default mode — Codex has NO "Granular" mode and
  // never shows "Default permissions" on the chip (that string is the dropdown `.label`).
  if (
    approvalsReviewer === "user"
    && (
      (sandboxMode === "workspace-write" && isGranularApprovalPolicy(approvalPolicy))
      || ((sandboxMode === "workspace-write" || sandboxMode === "read-only") && approvalPolicy === "on-request")
    )
  ) {
    return "Ask for approval";
  }
  return "Custom";
}

function formatPermissionsFooterTitle(
  input: { approvalPolicy?: unknown; approvalsReviewer?: unknown; sandboxMode?: unknown },
  label: string,
): string {
  return [
    `Permissions: ${label}`,
    `sandbox_mode: ${stringValue(input.sandboxMode) ?? "workspace-write"}`,
    `approval_policy: ${formatApprovalPolicy(input.approvalPolicy ?? "on-request")}`,
    `approvals_reviewer: ${stringValue(input.approvalsReviewer) ?? "user"}`,
  ].join("\n");
}

function formatApprovalPolicy(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (isGranularApprovalPolicy(value)) return "granular";
  return "custom";
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

function isAutoReviewPolicy(value: string): boolean {
  // codex src-*.js `Md()`: the guardian / auto-review reviewer values are
  // "auto_review" | "guardian_subagent" (the latter was missing here, so a real
  // guardian config never showed the "Auto-review" chip). Legacy spellings kept for safety.
  return value === "auto_review" || value === "guardian_subagent"
    || value === "guardian-approvals" || value === "auto-review";
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
