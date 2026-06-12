import { ChevronDown, Folder, FolderX, Search } from "lucide-react";
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
import { isProjectlessWorkspace } from "../state/thread-workflow";
import {
  composerWorkModeLabel,
  projectWorktreeModeOptions,
  type ComposerWorkMode,
  type WorktreeModeOption,
} from "../state/worktrees";
import { useHiCodexIntl } from "./i18n-provider";
import { WorktreeModeMenuItems } from "./worktree-mode-menu";

export interface ComposerWorkspaceRootOption {
  root: string;
  label: string;
}

export interface ComposerFooterProjectControlsProps {
  cwd?: string | null;
  workMode: ComposerWorkMode;
  workModeOptions?: WorktreeModeOption[];
  workspaceRoots: ComposerWorkspaceRootOption[];
  onWorkspaceRootSelected?: (root: string) => void | Promise<void>;
  onUseExistingFolder?: () => void | Promise<void>;
  onSelectProjectless?: () => void | Promise<void>;
  onWorkModeChange?: (mode: ComposerWorkMode) => void;
}

export function ComposerFooterProjectControls({
  cwd,
  workMode,
  workModeOptions,
  workspaceRoots,
  onWorkspaceRootSelected,
  onUseExistingFolder,
  onSelectProjectless,
  onWorkModeChange,
}: ComposerFooterProjectControlsProps) {
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
  const rootOptions = useMemo(() => dedupeWorkspaceRoots(workspaceRoots), [workspaceRoots]);
  // codex: the home/below-composer footer-left is a LABELED project-selector chip
  // (`de` workspace-root dropdown), not a bare "+". Label it with the active root's
  // name (matched option label, else the cwd basename, else "Project").
  const projectLabel = useMemo(() => {
    // codex `composer.localCwdDropdown.homeWorkInProject`: a projectless workspace —
    // empty, the `~` sentinel, OR a generated `~/Documents/Codex` cwd that got synced
    // in from an active projectless thread — shows the "Work in a project" chip (a
    // call-to-action to pick a project), NOT a folder name and NOT "Chats" (the
    // composer uses project-language; only the SIDEBAR groups projectless threads
    // under "Chats"). A real path (even $HOME) keeps its folder name.
    if (isProjectlessWorkspace(cwd)) {
      return formatMessage({ id: "composer.localCwdDropdown.homeWorkInProject", defaultMessage: "Work in a project" });
    }
    const normalizedCwd = (cwd ?? "").trim();
    const matched = rootOptions.find((option) => option.root === cwd);
    if (matched) return matched.label;
    const trimmed = normalizedCwd.replace(/[\\/]+$/u, "");
    const base = trimmed.slice(Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\")) + 1);
    if (base.length > 0) return base;
    return "Project";
  }, [cwd, rootOptions, formatMessage]);
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

  function selectProjectless() {
    setProjectMenuOpen(false);
    setProjectSearch("");
    void onSelectProjectless?.();
  }

  // codex: the "Don't work in a project" row only appears when a real project IS
  // selected (you can't "clear" an already-projectless workspace — empty, `~`, or a
  // generated ~/Documents/Codex cwd all count as projectless).
  const projectSelected = !isProjectlessWorkspace(cwd);

  return (
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
              {onSelectProjectless && projectSelected && (
                <>
                  <div className="hc-thread-menu-separator" />
                  <button
                    type="button"
                    className="hc-thread-menu-item"
                    role="menuitem"
                    onClick={selectProjectless}
                  >
                    <FolderX size={13} />
                    <span>{formatMessage({ id: "composer.localCwdDropdown.clearProject", defaultMessage: "Don't work in a project" })}</span>
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
