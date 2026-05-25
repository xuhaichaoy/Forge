import type { ReactNode } from "react";

/*
 * Single action card on the side-panel new-tab landing page.
 *
 * Direct port of Codex Desktop's `lt(e)` at
 * `/private/tmp/codex-asar/pretty/thread-app-shell-chrome-BVkAxLhy.pretty.js:1043-1108`:
 *
 *   <button
 *     type="button"
 *     className="cursor-interaction min-h-32 w-full max-w-[330px] rounded-xl
 *                bg-token-bg-secondary px-4 py-6 text-center
 *                hover:bg-token-list-hover-background
 *                focus-visible:outline focus-visible:outline-2 focus-visible:outline-token-border-xstrong"
 *     onClick={onSelect}>
 *     <div className="flex min-w-0 flex-col items-center gap-3">
 *       <span className="flex size-7 shrink-0 items-center justify-center
 *                        text-token-text-secondary">{icon}</span>
 *       <span className="flex min-w-0 flex-col items-center gap-1">
 *         <span data-thread-side-panel-new-tab-action-label
 *               className="w-max max-w-full truncate text-base font-semibold
 *                          text-token-text-primary">{title}</span>
 *         <span data-thread-side-panel-new-tab-action-label
 *               className="w-max max-w-full truncate text-sm
 *                          text-token-text-secondary">{description}</span>
 *       </span>
 *     </div>
 *   </button>
 *
 * `data-thread-side-panel-new-tab-action-label` is harvested by the parent
 * `nt()` (Codex line 879-887) when measuring intrinsic label widths for the
 * responsive grid (`tt(...)`). HiCodex keeps the exact same attribute so the
 * measurement path can drop straight in.
 */
export interface SidePanelTabActionCardProps {
  /** Stable id used as React `key` by the grid. */
  readonly id: string;
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly icon: ReactNode;
  readonly onSelect: () => void;
}

export function SidePanelTabActionCard({
  title,
  description,
  icon,
  onSelect,
}: SidePanelTabActionCardProps) {
  return (
    <button
      type="button"
      className="hc-side-panel-action-card"
      onClick={onSelect}
    >
      <div className="hc-side-panel-action-card__layout">
        <span className="hc-side-panel-action-card__icon">{icon}</span>
        <span className="hc-side-panel-action-card__copy">
          <span
            data-thread-side-panel-new-tab-action-label
            className="hc-side-panel-action-card__title"
          >
            {title}
          </span>
          <span
            data-thread-side-panel-new-tab-action-label
            className="hc-side-panel-action-card__description"
          >
            {description}
          </span>
        </span>
      </div>
    </button>
  );
}
