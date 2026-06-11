import {
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  normalizeSidebarWidthPx,
  SIDEBAR_WIDTH_MAX_PX,
  SIDEBAR_WIDTH_MIN_PX,
} from "../state/sidebar-preferences";

interface UseSidebarResizeControllerInput {
  sidebarVisible: boolean;
  widthPx: number;
  setSidebarWidthPx: (widthPx: number) => void;
}

export function useSidebarResizeController({
  sidebarVisible,
  widthPx,
  setSidebarWidthPx,
}: UseSidebarResizeControllerInput) {
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const sidebarWidthPx = normalizeSidebarWidthPx(widthPx);
  const appShellStyle = useMemo(() => ({
    "--hc-sidebar-preferred-width": `${sidebarWidthPx}px`,
  }) as CSSProperties, [sidebarWidthPx]);

  const startSidebarResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!sidebarVisible || event.button !== 0) return;
    event.preventDefault();
    const appShell = event.currentTarget.closest(".hc-app") as HTMLElement | null;
    const startX = event.clientX;
    const startWidth = sidebarWidthPx;
    let latestWidth = normalizeSidebarWidthPx(startWidth);
    let pendingFrame = 0;
    const applyWidth = () => {
      pendingFrame = 0;
      appShell?.style.setProperty("--hc-sidebar-preferred-width", `${latestWidth}px`);
    };
    const scheduleWidth = () => {
      if (pendingFrame !== 0) return;
      pendingFrame = window.requestAnimationFrame(applyWidth);
    };
    if (appShell) appShell.dataset.sidebarResizing = "true";
    setSidebarResizing(true);
    appShell?.style.setProperty("--hc-sidebar-preferred-width", `${latestWidth}px`);

    const move = (moveEvent: PointerEvent) => {
      latestWidth = normalizeSidebarWidthPx(startWidth + moveEvent.clientX - startX);
      scheduleWidth();
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      if (pendingFrame !== 0) {
        window.cancelAnimationFrame(pendingFrame);
        pendingFrame = 0;
      }
      appShell?.style.setProperty("--hc-sidebar-preferred-width", `${latestWidth}px`);
      if (appShell) delete appShell.dataset.sidebarResizing;
      setSidebarResizing(false);
      setSidebarWidthPx(latestWidth);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
    window.addEventListener("pointercancel", stop, { once: true });
  }, [setSidebarWidthPx, sidebarVisible, sidebarWidthPx]);

  const resizeSidebarByKeyboard = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!sidebarVisible) return;
    const step = event.shiftKey ? 24 : 12;
    let nextWidth: number | null = null;
    if (event.key === "ArrowLeft") nextWidth = sidebarWidthPx - step;
    else if (event.key === "ArrowRight") nextWidth = sidebarWidthPx + step;
    else if (event.key === "Home") nextWidth = SIDEBAR_WIDTH_MIN_PX;
    else if (event.key === "End") nextWidth = SIDEBAR_WIDTH_MAX_PX;
    if (nextWidth == null) return;
    event.preventDefault();
    setSidebarWidthPx(nextWidth);
  }, [setSidebarWidthPx, sidebarVisible, sidebarWidthPx]);

  return {
    appShellStyle,
    resizeSidebarByKeyboard,
    sidebarResizing,
    sidebarWidthPx,
    startSidebarResize,
  };
}
