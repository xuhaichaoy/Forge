import {
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type ReactElement,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

const BRANCH_MENU_WIDTH_PX = 320;
const BRANCH_MENU_VIEWPORT_MARGIN_PX = 12;

export function BranchMenuPortal({
  anchor,
  children,
}: {
  anchor: HTMLElement | null;
  children: ReactElement;
}) {
  const [style, setStyle] = useState<CSSProperties>(() => branchMenuStyle(anchor));

  useLayoutEffect(() => {
    const updatePosition = () => setStyle(branchMenuStyle(anchor));
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchor]);

  if (!anchor || typeof document === "undefined") return null;
  return createPortal(<div style={style}>{children}</div>, document.body);
}

function branchMenuStyle(anchor: HTMLElement | null): CSSProperties {
  if (!anchor || typeof window === "undefined") {
    return {
      position: "fixed",
      top: 0,
      left: BRANCH_MENU_VIEWPORT_MARGIN_PX,
      width: BRANCH_MENU_WIDTH_PX,
      transform: "translateY(-100%)",
    };
  }
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(BRANCH_MENU_WIDTH_PX, Math.max(0, window.innerWidth - BRANCH_MENU_VIEWPORT_MARGIN_PX * 2));
  const maxLeft = window.innerWidth - width - BRANCH_MENU_VIEWPORT_MARGIN_PX;
  const left = Math.max(BRANCH_MENU_VIEWPORT_MARGIN_PX, Math.min(rect.left, maxLeft));
  return {
    position: "fixed",
    top: rect.top - 8,
    left,
    width,
    transform: "translateY(-100%)",
    zIndex: "var(--hc-z-popover)",
  };
}

export function useAnchoredMenuDismiss(
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
