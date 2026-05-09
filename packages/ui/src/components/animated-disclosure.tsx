import { useEffect, useState } from "react";
import type { ReactNode } from "react";

const DISCLOSURE_EXIT_MS = 180;

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
