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
}

export function ComposerExternalFooter({
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
}: ComposerExternalFooterProps) {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const projectTriggerRef = useRef<HTMLButtonElement | null>(null);
  const projectMenuRef = useRef<HTMLDivElement | null>(null);
  const closeProjectMenu = useCallback(() => setProjectMenuOpen(false), []);
  const intelligenceLabel = formatIntelligenceFooterLabel({ model, reasoningEffort });
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
    // CODEX-REF: composer-DXaiOlFj.js line ~975700 — the composer footer is a
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
       * CODEX-REF: composer-DXaiOlFj.js line ~975700 — left column hosts the
       * `+` add-menu trigger followed by the permissions chip (Codex packs
       * both into the `vz` component rendered into the first grid cell).
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
         * CODEX-REF: composer-DXaiOlFj.js line ~975700 — Codex renders the
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
       * CODEX-REF: composer-DXaiOlFj.js line ~975700 — middle grid cell:
       *   <div className="flex items-center">{d==="cloud" ? <jR/> : null}</div>
       * Empty for local-only HiCodex but kept so the 3-column grid alignment
       * stays consistent with Codex.
       */}
      <div className="hc-composer-external-footer-center" aria-hidden="true" />
      {/*
       * CODEX-REF: composer-DXaiOlFj.js line ~975700 — right grid cell:
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
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "none") return "No reasoning";
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
