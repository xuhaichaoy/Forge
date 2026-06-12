import type { ReactNode } from "react";

export interface SidebarNavItemProps {
  active?: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  accelerator?: string | null;
  onClick: () => void;
}

export function SidebarNavItem({
  active = false,
  disabled = false,
  icon,
  label,
  // codex: electron-menu-shortcuts-*.js — Codex Desktop sidebar nav entries
  // render the platform-formatted accelerator alongside the label (matching the
  // tooltip surfaced in its command menu).
  accelerator,
  onClick,
}: SidebarNavItemProps) {
  const acceleratorHint = typeof accelerator === "string" && accelerator.length > 0 ? accelerator : null;
  return (
    <button
      className={`hc-sidebar-nav-item ${active ? "is-active" : ""}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
      title={acceleratorHint ? `${label} (${acceleratorHint})` : label}
    >
      <span className="hc-sidebar-nav-icon" aria-hidden="true">{icon}</span>
      <span className="hc-sidebar-nav-label">{label}</span>
      {acceleratorHint && (
        <kbd className="hc-sidebar-nav-accelerator" aria-hidden="true">
          {acceleratorHint}
        </kbd>
      )}
    </button>
  );
}
