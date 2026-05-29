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
import { ChevronDown, Cpu, Folder, Plus, Search, ShieldCheck } from "lucide-react";
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
  projectWorktreeModeOptions,
  type ComposerWorkMode,
  type WorktreeModeOption,
} from "../state/worktrees";
import { WorktreeModeMenuItems } from "./worktree-mode-menu";
// codex: composer-footer-branch-switcher-*.js — chip + dropdown.
import { ComposerFooterBranchSwitcher } from "./composer-footer-branch-switcher";

export interface ComposerWorkspaceRootOption {
  root: string;
  label: string;
}

export interface ComposerExternalFooterProps {
  branch?: string | null;
  cwd?: string | null;
  model?: string | null;
  workMode?: ComposerWorkMode;
  workModeOptions?: WorktreeModeOption[];
  workspaceRoots?: ComposerWorkspaceRootOption[];
  onWorkspaceRootSelected?: (root: string) => void | Promise<void>;
  onUseExistingFolder?: () => void | Promise<void>;
  onWorkModeChange?: (mode: ComposerWorkMode) => void;
  approvalPolicy?: unknown;
  approvalsReviewer?: unknown;
  reasoningSummary?: unknown;
  reasoningEffort?: unknown;
  sandboxMode?: unknown;
  onOpenPermissions?: (anchor: HTMLElement) => void;
  /**
   * Opens or closes the model picker menu anchored at the model chip element.
   * When omitted the chip is rendered as display-only (existing behaviour).
   * The chevron next to the model name visually hints that this is
   * interactive when `onOpenModelPicker` is provided.
   */
  onOpenModelPicker?: (anchor: HTMLElement) => void;
  /**
   * CODEX-REF: composer-*.js — footer 上的 Reasoning trigger 是独立 chip
   * 显示当前 effort label ("Low" / "Medium" / "High" / "Extra High")，点击弹出
   * reasoning-effort popover。HiCodex 把这个 chip 挂在现有 intelligence chip 旁，
   * 回调由 HiCodexApp 用 setReasoningPickerAnchor 接住。omit 时不渲染（向后兼容）。
   */
  onOpenReasoningPicker?: (anchor: HTMLElement) => void;
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
}

export function ComposerExternalFooter({
  branch,
  cwd,
  model,
  workMode = "local",
  workModeOptions,
  workspaceRoots = [],
  onWorkspaceRootSelected,
  onUseExistingFolder,
  onWorkModeChange,
  approvalPolicy,
  approvalsReviewer,
  reasoningEffort,
  sandboxMode,
  onOpenPermissions,
  onOpenModelPicker,
  onOpenReasoningPicker,
  onBranchSwitched,
  onBranchSwitchError,
}: ComposerExternalFooterProps) {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const projectTriggerRef = useRef<HTMLButtonElement | null>(null);
  const projectMenuRef = useRef<HTMLDivElement | null>(null);
  const closeProjectMenu = useCallback(() => setProjectMenuOpen(false), []);
  const branchLabel = formatBranchFooterLabel(branch);
  const intelligenceLabel = formatIntelligenceFooterLabel({ model, reasoningEffort });
  /*
   * CODEX-REF: composer-*.js — Reasoning trigger chip 永远渲染（Codex
   * 即使 modelSettings.reasoningEffort 缺省也显示 default label 触发按钮，
   * disabled 仅当 models data fetch error / 没拿到 models）。HiCodex 这里
   * 没有 effort 时回退到 default "medium" (与 Codex/Codex CLI 默认一致)，
   * 让 chip 始终可见可点击。
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
  const reasoningEffortNormalized: ReasoningKey = typeof reasoningEffort === "string"
    && REASONING_KEYS.includes(reasoningEffort.trim().toLowerCase() as ReasoningKey)
    ? reasoningEffort.trim().toLowerCase() as ReasoningKey
    : "medium";
  const reasoningChipLabel = REASONING_LABELS[reasoningEffortNormalized];
  const permissionsLabel = formatPermissionsFooterLabel({ approvalPolicy, approvalsReviewer, sandboxMode });
  const permissionsTitle = formatPermissionsFooterTitle({ approvalPolicy, approvalsReviewer, sandboxMode }, permissionsLabel);
  const rootOptions = useMemo(() => dedupeWorkspaceRoots(workspaceRoots), [workspaceRoots]);
  const resolvedWorkModeOptions = useMemo(
    () => workModeOptions ?? projectWorktreeModeOptions({ mode: workMode }),
    [workMode, workModeOptions],
  );
  const visibleRootOptions = useMemo(
    () => filterWorkspaceRoots(rootOptions, projectSearch),
    [projectSearch, rootOptions],
  );
  useAnchoredMenuDismiss(projectMenuOpen, projectTriggerRef, projectMenuRef, closeProjectMenu);

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
    <div className="hc-composer-external-footer" aria-label="Composer context">
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
            className="hc-composer-footer-chip hc-composer-footer-add-menu"
            title="Project and work mode"
            aria-label="Project and work mode"
            aria-haspopup="menu"
            aria-expanded={projectMenuOpen}
            aria-controls={projectMenuOpen ? "hc-composer-project-menu" : undefined}
            onClick={() => setProjectMenuOpen((value) => !value)}
          >
            <Plus size={15} />
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
                    placeholder="Search projects"
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
                    <div className="hc-composer-project-empty">No folders found</div>
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
                      <span>Use an existing folder</span>
                    </button>
                  </>
                )}
                <div className="hc-thread-menu-separator" />
                <div className="hc-composer-project-menu-title" role="presentation">Work mode</div>
                <WorktreeModeMenuItems
                  mode={workMode}
                  options={resolvedWorkModeOptions}
                  onModeChange={onWorkModeChange}
                  onClose={closeProjectMenu}
                />
              </div>
            </ProjectMenuPortal>
          )}
        </div>
        {/*
         * CODEX-REF: composer-*.js — Codex renders the
         * permissions dropdown immediately after the `+` button inside the
         * left grid cell, so the trigger sits on the same baseline as the add
         * menu.
         */}
        <button
          type="button"
          className="hc-composer-footer-chip hc-composer-footer-permissions"
          title={onOpenPermissions ? "Change permissions" : permissionsTitle}
          data-chip="permissions"
          data-interactive={onOpenPermissions ? "true" : undefined}
          onClick={onOpenPermissions ? (event) => onOpenPermissions(event.currentTarget) : undefined}
        >
          <ShieldCheck size={14} />
          <span className="hc-composer-footer-chip-label">{permissionsLabel}</span>
          <ChevronDown size={13} />
        </button>
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
      {/*
       * CODEX-REF: composer-*.js — right grid cell:
       *   <div className="flex w-full min-w-0 items-center justify-end gap-2">
       *     <div className="flex min-w-0 flex-1 justify-end"> model/context </div>
       *     <div className="flex shrink-0 items-center gap-2"> mic + send </div>
       *   </div>
       * The mic + send cluster is rendered by composer.tsx in HiCodex, so the
       * `actions` slot here is intentionally empty.
       */}
      <div className="hc-composer-external-footer-context" aria-label="Composer runtime context">
        <div className="hc-composer-external-footer-context-flex">
          {intelligenceLabel && (
            <button
              type="button"
              className="hc-composer-footer-chip hc-composer-footer-model hc-composer-footer-intelligence"
              title={onOpenModelPicker ? "Select model" : intelligenceLabel}
              data-chip="intelligence"
              data-interactive={onOpenModelPicker ? "true" : undefined}
              onClick={onOpenModelPicker ? (event) => onOpenModelPicker(event.currentTarget) : undefined}
            >
              <Cpu size={14} />
              <span className="hc-composer-footer-chip-label">{intelligenceLabel}</span>
              <ChevronDown size={13} />
            </button>
          )}
          {/*
           * CODEX-REF: composer-*.js — Reasoning effort trigger chip
           * （reasoning-effort popover anchor）。Codex 截图 dropdown 选项
           * Low/Medium/High/Extra High，trigger button 显示当前 effort label。
           * HiCodex 用独立 chip 与 model chip 并列；点击 onOpenReasoningPicker(anchor)
           * 由 HiCodexApp 持有 setReasoningPickerAnchor 接住。
           */}
          {reasoningChipLabel && (
            <button
              type="button"
              className="hc-composer-footer-chip hc-composer-footer-reasoning"
              title={onOpenReasoningPicker ? "Set reasoning effort" : `Reasoning: ${reasoningChipLabel}`}
              data-chip="reasoning"
              data-codex-intelligence-trigger
              data-selected-reasoning-effort={reasoningEffortNormalized ?? undefined}
              data-interactive={onOpenReasoningPicker ? "true" : undefined}
              onClick={onOpenReasoningPicker ? (event) => onOpenReasoningPicker(event.currentTarget) : undefined}
            >
              <span className="hc-composer-footer-chip-label">{reasoningChipLabel}</span>
              {onOpenReasoningPicker && <ChevronDown size={13} />}
            </button>
          )}
        </div>
        <div className="hc-composer-external-footer-actions" aria-hidden="true" />
      </div>
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
  reasoningEffort,
}: {
  model?: string | null;
  reasoningEffort?: unknown;
  reasoningSummary?: unknown;
}): string {
  const trimmedModel = model?.trim() ?? "";
  if (!trimmedModel) return "";
  const effort = formatReasoningEffort(reasoningEffort);
  return [trimmedModel, effort].filter(Boolean).join(" ");
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
  if (isAutoReviewPolicy(approvalsReviewer)) return "Auto-review";
  if (
    sandboxMode === "workspace-write"
    && isGranularApprovalPolicy(approvalPolicy)
    && approvalsReviewer === "user"
  ) {
    return "Granular";
  }
  if (
    (sandboxMode === "workspace-write" || sandboxMode === "read-only")
    && approvalPolicy === "on-request"
    && approvalsReviewer === "user"
  ) {
    return "Default permissions";
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

function formatReasoningEffort(value?: unknown): string {
  /*
   * codex: reasoning-minimal-*.js — reasoning-effort label formatter, 6 labels:
   *   composer.mode.local.reasoning.none.label    = "None"
   *   composer.mode.local.reasoning.minimal.label = "Minimal"
   *   composer.mode.local.reasoning.low.label     = "Low"
   *   composer.mode.local.reasoning.medium.label  = "Medium"
   *   composer.mode.local.reasoning.high.label    = "High"
   *   composer.mode.local.reasoning.xhigh.label   = "Extra High"
   * HiCodex previously rendered `none` as "No reasoning"; aligned to "None".
   */
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "none") return "None";
  if (normalized === "minimal") return "Minimal";
  if (normalized === "xhigh" || normalized === "extra_high") return "Extra High";
  if (normalized === "high") return "High";
  if (normalized === "medium") return "Medium";
  if (normalized === "low") return "Low";
  return value.trim();
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
  return value === "guardian-approvals" || value === "auto-review" || value === "auto_review";
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
