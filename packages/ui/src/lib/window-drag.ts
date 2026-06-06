import type { MouseEvent } from "react";
import { startWindowDrag } from "./tauri-host";

/**
 * Shared top-bar window-drag handler. With `titleBarStyle: "Overlay"` the window
 * has no native title bar, so each top bar must opt into dragging. A left-button
 * mousedown on a non-interactive part of the bar starts a native window drag;
 * clicks on buttons / links / inputs (or anything marked `data-no-window-drag`)
 * are left alone so they keep working.
 *
 * Bind on the top-bar `<header>` (the event bubbles up from its children) and pair
 * with `data-tauri-drag-region` for the native fallback. Used by every top bar
 * (conversation + KB / archive / todo) so the window drags from the top on any tab.
 */
export function startTopbarWindowDrag(event: MouseEvent<HTMLElement>): void {
  if (event.button !== 0 || event.defaultPrevented) return;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest("button,a,input,textarea,select,[role='button'],[data-no-window-drag='true']")) {
    return;
  }
  void startWindowDrag().catch(() => undefined);
}
