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
  // CODEX-REF: summary-panel-row-DMF5uaBF.js (wc) — `labelClassName` overrides the
  // default `truncate` label wrapper class (`m ?? "truncate"`). Codex passes a baseline
  // `flex items-baseline gap-2` here for the browser/automation rows whose label is a
  // `[name, secondary]` Fragment. When omitted, HiCodex keeps the truncating single-line
  // label wrapper.
  labelClassName?: string;
  // CODEX-REF: summary-panel-row-DMF5uaBF.js (wc) — `label` may suppress its own wrapper
  // padding/icon when the row carries `icon:null` (Codex subagent `agent` case). The icon
  // slot is simply omitted when `icon` is nullish (no empty box reserved).
}

export function SummaryPanelRow({
  icon,
  label,
  trailing,
  onClick,
  disabled,
  title,
  className,
  labelClassName,
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
        <SummaryPanelRowInner icon={icon} label={label} trailing={trailing} labelClassName={labelClassName} />
      </button>
    );
  }

  return (
    <div className={classes} title={title}>
      <SummaryPanelRowInner icon={icon} label={label} trailing={trailing} labelClassName={labelClassName} />
    </div>
  );
}

function SummaryPanelRowInner({
  icon,
  label,
  trailing,
  labelClassName,
}: {
  icon?: ReactNode;
  label: ReactNode;
  trailing?: ReactNode;
  labelClassName?: string;
}) {
  return (
    <span className="hc-summary-panel-row-inner">
      {icon ? (
        <span className="hc-summary-panel-row-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {/* CODEX-REF: summary-panel-row-DMF5uaBF.js — label wrapper class is `m ?? "truncate"`,
          i.e. `labelClassName` REPLACES the default truncating wrapper (it does not stack on
          top of it). HiCodex's default `hc-summary-panel-row-label` carries the flex/min-w-0
          /truncate geometry; a baseline label variant supplies its own class instead. */}
      <span className={labelClassName ?? "hc-summary-panel-row-label"}>{label}</span>
      {trailing ? (
        <span className="hc-summary-panel-row-trailing">{trailing}</span>
      ) : null}
    </span>
  );
}
