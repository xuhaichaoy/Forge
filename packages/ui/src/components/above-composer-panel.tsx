/*
 * codex: above-composer-panel-row-u8ZTJgs2.pretty.js
 *   - `p` (line ~11)  → AboveComposerPanelContainer (provides HasPortalContentContext)
 *   - `m` (line ~29)  → AboveComposerPanel (first:rounded-t-2xl when context is false)
 *   - `C` (line ~131) → PanelRow (icon + title + meta + trailing + actions)
 *
 * Codex Tailwind classes (no longer used here because Forge has no Tailwind):
 *   container: `order-2 flex min-w-0 flex-col`
 *   panel:     `bg-token-input-background/70 text-token-foreground border-token-border/80
 *              relative min-w-0 overflow-clip border-x border-t backdrop-blur-sm`
 *              + first:rounded-t-2xl (when !hasPortalContentAbove)
 *   row:       `group flex min-w-0 items-center justify-between gap-2 py-0.5 text-sm`
 *
 * Visual equivalents are encoded as `hc-above-composer-panel*` / `hc-panel-row*` in
 * packages/ui/src/styles/composer.css.
 */
import { type HTMLAttributes, type ReactNode } from "react";

interface AboveComposerPanelContainerProps {
  hasAboveComposerPortalContent?: boolean;
  className?: string;
  children?: ReactNode;
}

export function AboveComposerPanelContainer({
  hasAboveComposerPortalContent = false,
  className,
  children,
}: AboveComposerPanelContainerProps) {
  // codex: above-composer-panel-row p/m — context gates `first:rounded-t-2xl`.
  const cls = [
    "hc-above-composer-panel-container",
    hasAboveComposerPortalContent ? "hc-above-composer-panel-container--has-content-above" : null,
    className,
  ].filter(Boolean).join(" ");
  return (
    <div className={cls}>{children}</div>
  );
}

interface AboveComposerPanelProps {
  className?: string;
  children?: ReactNode;
}

export function AboveComposerPanel({ className, children }: AboveComposerPanelProps) {
  const cls = [
    "hc-above-composer-panel",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <div className={cls}>{children}</div>;
}

interface PanelRowProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  actions?: ReactNode;
  titleClassName?: string;
}

export function PanelRow({
  icon,
  title,
  meta,
  trailing,
  actions,
  className,
  titleClassName,
  ...rest
}: PanelRowProps) {
  // codex: above-composer-panel-row C (group flex min-w-0 items-center justify-between gap-2 py-0.5 text-sm)
  const rootCls = ["hc-panel-row", className].filter(Boolean).join(" ");
  const titleCls = ["hc-panel-row-title", titleClassName].filter(Boolean).join(" ");
  return (
    <div {...rest} className={rootCls}>
      <div className="hc-panel-row-main">
        {icon ? <span className="hc-panel-row-icon">{icon}</span> : null}
        <div className={titleCls}>
          {title}
          {meta != null ? <span className="hc-panel-row-meta">{meta}</span> : null}
        </div>
      </div>
      {trailing != null || actions != null ? (
        <div className="hc-panel-row-trailing">
          {trailing}
          {actions}
        </div>
      ) : null}
    </div>
  );
}
