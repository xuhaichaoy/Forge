import type { ReactNode } from "react";

// CODEX-REF: check-lg-*.js — summary-row component.
// Codex Desktop renders every Git summary row (Changes / Local / Branch / Commit / GitHub status)
// and the Sources empty state inside a single 28px-high container. The container is `flex
// items-center gap-2 h-7 w-full min-w-0` with an inner `flex min-w-0 flex-1 items-center gap-2`
// wrapper that holds `[icon][label][trailing(ms-auto shrink-0)]`. Label is `truncate text-base`.
export interface SummaryPanelRowProps {
  icon?: ReactNode;
  label: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
}

export function SummaryPanelRow({
  icon,
  label,
  trailing,
  onClick,
  disabled,
  title,
  className,
}: SummaryPanelRowProps) {
  const isInteractive = Boolean(onClick) && !disabled;
  const classes = [
    "hc-summary-panel-row",
    isInteractive ? "hc-summary-panel-row-interactive" : null,
    disabled ? "hc-summary-panel-row-disabled" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (isInteractive) {
    return (
      <button
        type="button"
        className={classes}
        onClick={onClick}
        title={title}
      >
        <SummaryPanelRowInner icon={icon} label={label} trailing={trailing} />
      </button>
    );
  }

  return (
    <div className={classes} title={title}>
      <SummaryPanelRowInner icon={icon} label={label} trailing={trailing} />
    </div>
  );
}

function SummaryPanelRowInner({
  icon,
  label,
  trailing,
}: {
  icon?: ReactNode;
  label: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <span className="hc-summary-panel-row-inner">
      {icon ? (
        <span className="hc-summary-panel-row-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="hc-summary-panel-row-label">{label}</span>
      {trailing ? (
        <span className="hc-summary-panel-row-trailing">{trailing}</span>
      ) : null}
    </span>
  );
}
