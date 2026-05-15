import { ChevronDown, Cpu, Folder, GitBranch, Monitor, Search } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useDismissibleLayer } from "../hooks/use-dismissible-layer";

export interface ComposerWorkspaceRootOption {
  root: string;
  label: string;
}

export interface ComposerExternalFooterProps {
  branch?: string | null;
  cwd?: string | null;
  model?: string | null;
  workspaceRoots?: ComposerWorkspaceRootOption[];
  onWorkspaceRootSelected?: (root: string) => void | Promise<void>;
  onUseExistingFolder?: () => void | Promise<void>;
  reasoningEffort?: unknown;
  /**
   * Opens the model picker menu anchored at the model chip element.
   * When omitted the chip is rendered as display-only (existing behaviour).
   * The chevron next to the model name visually hints that this is
   * interactive when `onOpenModelPicker` is provided.
   */
  onOpenModelPicker?: (anchor: HTMLElement) => void;
}

export function ComposerExternalFooter({
  branch,
  cwd,
  model,
  workspaceRoots = [],
  onWorkspaceRootSelected,
  onUseExistingFolder,
  reasoningEffort,
  onOpenModelPicker,
}: ComposerExternalFooterProps) {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const projectMenuRootRef = useRef<HTMLDivElement | null>(null);
  const closeProjectMenu = useCallback(() => setProjectMenuOpen(false), []);
  const modelLabel = model ? formatModelFooterLabel(model, reasoningEffort) : "";
  const rootOptions = useMemo(() => dedupeWorkspaceRoots(workspaceRoots), [workspaceRoots]);
  const visibleRootOptions = useMemo(
    () => filterWorkspaceRoots(rootOptions, projectSearch),
    [projectSearch, rootOptions],
  );
  const projectLabel = formatWorkspaceProjectLabel(cwd, rootOptions);
  useDismissibleLayer(projectMenuOpen, projectMenuRootRef, closeProjectMenu);

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
    <div className="hc-composer-external-footer" aria-label="Composer context">
      <div className="hc-composer-external-footer-left">
        <div className="hc-composer-footer-project" ref={projectMenuRootRef}>
          <button
            type="button"
            className="hc-composer-footer-chip"
            title={cwd?.trim() || "Select your project"}
            aria-haspopup="menu"
            aria-expanded={projectMenuOpen}
            onClick={() => setProjectMenuOpen((value) => !value)}
          >
            <Folder size={14} />
            <span>{projectLabel}</span>
            <ChevronDown size={13} />
          </button>
          {projectMenuOpen && (
            <div className="hc-thread-menu hc-composer-project-menu hc-app-popover-menu" role="menu">
              <label className="hc-composer-project-search">
                <Search size={13} />
                <input
                  value={projectSearch}
                  onChange={(event) => setProjectSearch(event.target.value)}
                  placeholder="Search projects"
                />
              </label>
              <div className="hc-composer-project-list">
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
            </div>
          )}
        </div>
        <button
          type="button"
          className="hc-composer-footer-chip"
          title={cwd?.trim() || "Work locally"}
        >
          <Monitor size={14} />
          <span>Work locally</span>
          <ChevronDown size={13} />
        </button>
        {branch && (
          <button
            type="button"
            className="hc-composer-footer-chip"
            title={`Branch: ${branch}`}
          >
            <GitBranch size={14} />
            <span>{branch}</span>
            <ChevronDown size={13} />
          </button>
        )}
      </div>
      {modelLabel && (
        <button
          type="button"
          className="hc-composer-footer-chip hc-composer-footer-model"
          title={onOpenModelPicker ? "Switch model for new chats" : modelLabel}
          data-interactive={onOpenModelPicker ? "true" : undefined}
          onClick={onOpenModelPicker ? (event) => onOpenModelPicker(event.currentTarget) : undefined}
        >
          <Cpu size={14} />
          <span>{modelLabel}</span>
          <ChevronDown size={13} />
        </button>
      )}
    </div>
  );
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

function formatModelFooterLabel(model: string, reasoningEffort?: unknown): string {
  const trimmedModel = model.trim();
  const effort = formatReasoningEffort(reasoningEffort);
  return effort ? `${trimmedModel} ${effort}` : trimmedModel;
}

function formatReasoningEffort(value?: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "xhigh" || normalized === "extra_high") return "Extra High";
  if (normalized === "high") return "High";
  if (normalized === "medium") return "Medium";
  if (normalized === "low") return "Low";
  return value.trim();
}
