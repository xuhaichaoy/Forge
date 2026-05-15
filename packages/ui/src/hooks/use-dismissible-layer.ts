import { useEffect, type RefObject } from "react";

export function useDismissibleLayer<T extends HTMLElement>(
  open: boolean,
  layerRef: RefObject<T | null>,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!open) return;

    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && layerRef.current?.contains(target)) return;
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
  }, [layerRef, onDismiss, open]);
}
