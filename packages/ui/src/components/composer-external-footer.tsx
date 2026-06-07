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
import { ChevronDown, Folder, Hand, Search, Settings, ShieldAlert, ShieldCheck, ShieldUser, type LucideIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  composerWorkModeLabel,
  projectWorktreeModeOptions,
  type ComposerWorkMode,
  type WorktreeModeOption,
} from "../state/worktrees";
import { WorktreeModeMenuItems } from "./worktree-mode-menu";
// codex: composer-footer-branch-switcher-*.js — chip + dropdown.
import { ComposerFooterBranchSwitcher } from "./composer-footer-branch-switcher";
// codex tooltip-CDzchJxN.js — the composer settings chips are wrapped in a styled Tooltip
// (Codex's intelligence trigger uses `Cn`/`tooltipContent`), replacing the native `title`.
import { Tooltip } from "./tooltip";
import { useHiCodexIntl } from "./i18n-provider";

export interface ComposerWorkspaceRootOption {
  root: string;
  label: string;
}

export interface ComposerExternalFooterProps {
  branch?: string | null;
  cwd?: string | null;
  workMode?: ComposerWorkMode;
  workModeOptions?: WorktreeModeOption[];
  workspaceRoots?: ComposerWorkspaceRootOption[];
  onWorkspaceRootSelected?: (root: string) => void | Promise<void>;
  onUseExistingFolder?: () => void | Promise<void>;
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
  onWorkModeChange,
  onBranchSwitched,
  onBranchSwitchError,
  variant = "default",
}: ComposerExternalFooterProps) {
  const { formatMessage } = useHiCodexIntl();
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const projectTriggerRef = useRef<HTMLButtonElement | null>(null);
  const projectMenuRef = useRef<HTMLDivElement | null>(null);
  const closeProjectMenu = useCallback(() => setProjectMenuOpen(false), []);
  // codex: work mode (run location) is a SEPARATE visible footer chip, not buried in
  // the project menu. Its own trigger + anchored dropdown mirror the project chip.
  const [workModeMenuOpen, setWorkModeMenuOpen] = useState(false);
  const workModeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const workModeMenuRef = useRef<HTMLDivElement | null>(null);
  const closeWorkModeMenu = useCallback(() => setWorkModeMenuOpen(false), []);
  const branchLabel = formatBranchFooterLabel(branch);
  const rootOptions = useMemo(() => dedupeWorkspaceRoots(workspaceRoots), [workspaceRoots]);
  // codex: the home/below-composer footer-left is a LABELED project-selector chip
  // (`de` workspace-root dropdown), not a bare "+". Label it with the active root's
  // name (matched option label, else the cwd basename, else "Project").
  const projectLabel = useMemo(() => {
    const matched = rootOptions.find((option) => option.root === cwd);
    if (matched) return matched.label;
    if (cwd) {
      const trimmed = cwd.replace(/[\\/]+$/u, "");
      const base = trimmed.slice(Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\")) + 1);
      if (base.length > 0) return base;
    }
    return "Project";
  }, [cwd, rootOptions]);
  const resolvedWorkModeOptions = useMemo(
    () => workModeOptions ?? projectWorktreeModeOptions({ mode: workMode, formatMessage }),
    [workMode, workModeOptions, formatMessage],
  );
  const visibleRootOptions = useMemo(
    () => filterWorkspaceRoots(rootOptions, projectSearch),
    [projectSearch, rootOptions],
  );
  useAnchoredMenuDismiss(projectMenuOpen, projectTriggerRef, projectMenuRef, closeProjectMenu);
  useAnchoredMenuDismiss(workModeMenuOpen, workModeTriggerRef, workModeMenuRef, closeWorkModeMenu);

  function selectWorkspaceRoot(root: string) {
    setProjectMenuOpen(false);
    setProjectSearch("");
    void onWorkspaceRootSelected?.(root);
  }

  function useExistingFolder() {
    setProjectMenuOpen(false);
    setProjectSearch("");
    void onUseExistingFolder?.();
  }

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
      <div className="hc-composer-external-footer-left">
        <div className="hc-composer-footer-project">
          <button
            ref={projectTriggerRef}
            type="button"
            className="hc-composer-footer-chip hc-composer-footer-project-chip"
            title="Project and work mode"
            aria-label="Project and work mode"
            aria-haspopup="menu"
            aria-expanded={projectMenuOpen}
            aria-controls={projectMenuOpen ? "hc-composer-project-menu" : undefined}
            onClick={() => setProjectMenuOpen((value) => !value)}
          >
            {/* codex: labeled project-selector chip (folder + project name + chevron), not a bare "+". */}
            <Folder size={14} />
            <span className="hc-composer-footer-chip-label">{projectLabel}</span>
            <ChevronDown size={14} />
          </button>
          {projectMenuOpen && (
            <ProjectMenuPortal anchor={projectTriggerRef.current}>
              <div
                ref={projectMenuRef}
                id="hc-composer-project-menu"
                className="hc-thread-menu hc-composer-project-menu hc-app-popover-menu"
                role="menu"
                data-state="open"
              >
                <label className="hc-composer-project-search">
                  <Search size={13} />
                  <input
                    value={projectSearch}
                    onChange={(event) => setProjectSearch(event.target.value)}
                    placeholder={formatMessage({ id: "composer.localCwdDropdown.searchPlaceholder", defaultMessage: "Search projects" })}
                  />
                </label>
                <div className="hc-composer-project-list">
                  <div className="hc-composer-project-menu-title" role="presentation">Project</div>
                  {visibleRootOptions.map((option) => (
                    <button
                      key={option.root}
                      type="button"
                      className="hc-thread-menu-item"
                      role="menuitem"
                      disabled={!onWorkspaceRootSelected}
                      title={option.root}
                      onClick={() => selectWorkspaceRoot(option.root)}
                    >
                      <Folder size={13} />
                      <span>{option.label}</span>
                    </button>
                  ))}
                  {visibleRootOptions.length === 0 && (
                    <div className="hc-composer-project-empty">{formatMessage({ id: "composer.localCwdDropdown.noResults", defaultMessage: "No folders found" })}</div>
                  )}
                </div>
                {onUseExistingFolder && (
                  <>
                    <div className="hc-thread-menu-separator" />
                    <button
                      type="button"
                      className="hc-thread-menu-item"
                      role="menuitem"
                      onClick={useExistingFolder}
                    >
                      <Folder size={13} />
                      <span>{formatMessage({ id: "projectSetup.addProjectMenu.useExistingFolder", defaultMessage: "Use an existing folder" })}</span>
                    </button>
                  </>
                )}
              </div>
            </ProjectMenuPortal>
          )}
        </div>
        {/* codex: work mode (run location) is its own visible chip beside the project chip. */}
        <div className="hc-composer-footer-workmode">
          <button
            ref={workModeTriggerRef}
            type="button"
            className="hc-composer-footer-chip hc-composer-footer-workmode-chip"
            title="Work mode"
            aria-label="Work mode"
            aria-haspopup="menu"
            aria-expanded={workModeMenuOpen}
            onClick={() => setWorkModeMenuOpen((value) => !value)}
          >
            <span className="hc-composer-footer-chip-label">{composerWorkModeLabel(workMode, formatMessage)}</span>
            <ChevronDown size={14} />
          </button>
          {workModeMenuOpen && (
            <ProjectMenuPortal anchor={workModeTriggerRef.current}>
              <div
                ref={workModeMenuRef}
                className="hc-thread-menu hc-composer-project-menu hc-app-popover-menu"
                role="menu"
                data-state="open"
              >
                <div className="hc-composer-project-menu-title" role="presentation">Work mode</div>
                <WorktreeModeMenuItems
                  mode={workMode}
                  options={resolvedWorkModeOptions}
                  onModeChange={onWorkModeChange}
                  onClose={closeWorkModeMenu}
                />
              </div>
            </ProjectMenuPortal>
          )}
        </div>
      </div>
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
      {intelligenceLabel && (
        <Tooltip content={onOpenModelPicker ? formatMessage({ id: "composer.intelligenceDropdown.tooltip", defaultMessage: "Select model" }) : intelligenceLabel}>
          <button
            type="button"
            className="hc-composer-footer-chip hc-composer-footer-model hc-composer-footer-intelligence"
            data-chip="intelligence"
            data-interactive={onOpenModelPicker ? "true" : undefined}
            onClick={onOpenModelPicker ? (event) => onOpenModelPicker(event.currentTarget) : undefined}
          >
            {/* Desktop uses one intelligence trigger. HiCodex has a separate reasoning chip, so this label stays model-only. */}
            <span className="hc-composer-footer-chip-label">{intelligenceLabel}</span>
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

const PROJECT_MENU_WIDTH_PX = 320;
const PROJECT_MENU_VIEWPORT_MARGIN_PX = 12;

function ProjectMenuPortal({
  anchor,
  children,
}: {
  anchor: HTMLElement | null;
  children: ReactElement;
}) {
  const [style, setStyle] = useState<CSSProperties>(() => projectMenuStyle(anchor));

  useLayoutEffect(() => {
    const updatePosition = () => setStyle(projectMenuStyle(anchor));
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchor]);

  if (!anchor || typeof document === "undefined") return null;
  return createPortal(
    <div style={style}>{children}</div>,
    document.body,
  );
}

function projectMenuStyle(anchor: HTMLElement | null): CSSProperties {
  if (!anchor || typeof window === "undefined") {
    return {
      position: "fixed",
      top: 0,
      left: PROJECT_MENU_VIEWPORT_MARGIN_PX,
      width: PROJECT_MENU_WIDTH_PX,
      transform: "translateY(-100%)",
    };
  }
  const rect = anchor.getBoundingClientRect();
  return {
    position: "fixed",
    top: rect.top - 8,
    left: clampProjectMenuLeft(rect.left),
    width: Math.min(PROJECT_MENU_WIDTH_PX, Math.max(0, window.innerWidth - PROJECT_MENU_VIEWPORT_MARGIN_PX * 2)),
    transform: "translateY(-100%)",
    zIndex: "var(--hc-z-popover)",
  };
}

function clampProjectMenuLeft(rawLeft: number): number {
  if (typeof window === "undefined") return PROJECT_MENU_VIEWPORT_MARGIN_PX;
  const menuWidth = Math.min(PROJECT_MENU_WIDTH_PX, Math.max(0, window.innerWidth - PROJECT_MENU_VIEWPORT_MARGIN_PX * 2));
  const maxLeft = window.innerWidth - menuWidth - PROJECT_MENU_VIEWPORT_MARGIN_PX;
  return Math.max(PROJECT_MENU_VIEWPORT_MARGIN_PX, Math.min(rawLeft, maxLeft));
}

function useAnchoredMenuDismiss(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLElement | null>,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!open) return;

    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (anchorRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onDismiss();
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };

    document.addEventListener("pointerdown", closeOnPointerDown, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [anchorRef, menuRef, onDismiss, open]);
}

export function formatWorkspaceProjectLabel(
  cwd?: string | null,
  workspaceRoots: ComposerWorkspaceRootOption[] = [],
): string {
  const root = normalizedWorkspaceRoot(cwd ?? "");
  if (!root) return "Select your project";
  return workspaceRoots.find((option) => normalizedWorkspaceRoot(option.root) === root)?.label
    || workspaceBasename(root)
    || "Select your project";
}

function dedupeWorkspaceRoots(workspaceRoots: ComposerWorkspaceRootOption[]): ComposerWorkspaceRootOption[] {
  const seen = new Set<string>();
  const options: ComposerWorkspaceRootOption[] = [];
  for (const option of workspaceRoots) {
    const root = normalizedWorkspaceRoot(option.root);
    if (!root || seen.has(root)) continue;
    seen.add(root);
    options.push({ root, label: option.label.trim() || workspaceBasename(root) || root });
  }
  return options;
}

function filterWorkspaceRoots(
  workspaceRoots: ComposerWorkspaceRootOption[],
  query: string,
): ComposerWorkspaceRootOption[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return workspaceRoots;
  return workspaceRoots.filter((option) => (
    option.label.toLowerCase().includes(needle)
    || option.root.toLowerCase().includes(needle)
  ));
}

function formatBranchFooterLabel(value?: string | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedWorkspaceRoot(value: string): string {
  const trimmed = value.trim();
  return trimmed.replace(/[\\/]+$/, "") || trimmed;
}

function workspaceBasename(value: string): string {
  return value.split(/[\\/]+/).filter(Boolean).pop() || value;
}

export function formatIntelligenceFooterLabel({
  model,
}: {
  model?: string | null;
}): string {
  const trimmedModel = model?.trim() ?? "";
  if (!trimmedModel) return "";
  return trimmedModel.replace(/^gpt[-_]/iu, "");
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
