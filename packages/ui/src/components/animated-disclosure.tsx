import { useEffect, useState } from "react";
import type { ReactNode } from "react";

/**
 * Codex Desktop's `yo` framer-motion transition (`animations-y0LC3gHS.js`,
 * imported into `local-conversation-thread.pretty.js:89` as `t as yo`) is
 * `{ duration: 0.5, ease: [0.19, 1, 0.22, 1] }` — i.e. 500ms, applied to both
 * `animate` and `exit`. Keep this value in lockstep with `--hc-codex-transition`
 * in `base.css` so the unmount delay matches the CSS transition duration.
 */
const DISCLOSURE_EXIT_MS = 500;

export function AnimatedDisclosure({
  children,
  className,
  dataViewState,
  innerClassName,
  open,
  testId,
}: {
  children: ReactNode;
  className?: string;
  dataViewState?: string;
  innerClassName?: string;
  open: boolean;
  testId?: string;
}) {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), DISCLOSURE_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!mounted) return null;

  return (
    <div
      aria-hidden={!open || undefined}
      className={`hc-disclosure-motion${className ? ` ${className}` : ""}`}
      data-open={open || undefined}
      data-view-state={dataViewState}
      data-testid={testId}
    >
      <div className={`hc-disclosure-motion-inner${innerClassName ? ` ${innerClassName}` : ""}`}>
        {children}
      </div>
    </div>
  );
}
