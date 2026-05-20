import { Check, ChevronDown, Cloud, GitBranch, Monitor } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  composerWorkModeLabel,
  composerWorkModeTitle,
  type ComposerWorkMode,
  type WorktreeModeOption,
} from "../state/worktrees";

export interface WorktreeModeMenuProps {
  mode: ComposerWorkMode;
  options: WorktreeModeOption[];
  onModeChange?: (mode: ComposerWorkMode) => void | Promise<void>;
}

export function WorktreeModeMenu({
  mode,
  options,
  onModeChange,
}: WorktreeModeMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const currentOption = options.find((option) => option.id === mode) ?? options[0];
  const label = currentOption?.label ?? composerWorkModeLabel(mode);

  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close, open]);

  return (
    <div className="hc-composer-footer-project hc-worktree-mode-menu" ref={rootRef}>
      <button
        aria-controls={open ? "hc-worktree-mode-menu" : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        className="hc-composer-footer-chip"
        data-chip="work-mode"
        data-interactive="true"
        title={composerWorkModeTitle(mode)}
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        {workModeIcon(mode)}
        <span>{label}</span>
        <ChevronDown size={13} />
      </button>

      {open && (
        <div
          className="hc-thread-menu hc-app-popover-menu"
          id="hc-worktree-mode-menu"
          role="menu"
        >
          {options.map((option) => (
            <WorktreeModeMenuItem
              key={option.id}
              option={option}
              mode={mode}
              onModeChange={onModeChange}
              onClose={close}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function WorktreeModeMenuItems({
  mode,
  options,
  onModeChange,
  onClose,
}: WorktreeModeMenuProps & {
  onClose?: () => void;
}) {
  return (
    <>
      {options.map((option) => (
        <WorktreeModeMenuItem
          key={option.id}
          option={option}
          mode={mode}
          onModeChange={onModeChange}
          onClose={onClose}
        />
      ))}
    </>
  );
}

function WorktreeModeMenuItem({
  mode,
  option,
  onModeChange,
  onClose,
}: {
  mode: ComposerWorkMode;
  option: WorktreeModeOption;
  onModeChange?: (mode: ComposerWorkMode) => void | Promise<void>;
  onClose?: () => void;
}) {
  return (
    <button
      className="hc-thread-menu-item"
      disabled={option.status === "disabled"}
      role="menuitemradio"
      aria-checked={option.status === "selected"}
      title={option.disabledReason ?? option.description}
      type="button"
      onClick={() => {
        if (option.status !== "disabled" && option.id !== mode) {
          void onModeChange?.(option.id);
        }
        onClose?.();
      }}
    >
      {workModeIcon(option.id)}
      <span>{option.label}</span>
      {option.status === "selected" && <Check className="hc-thread-menu-check" size={13} />}
    </button>
  );
}

function workModeIcon(mode: ComposerWorkMode) {
  if (mode === "worktree") return <GitBranch size={14} />;
  if (mode === "cloud") return <Cloud size={14} />;
  return <Monitor size={14} />;
}
