import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import { useServices } from "../components/services-context";
import { formatError } from "../lib/format";
import { isTauriRuntime } from "../lib/tauri-host";
import {
  loadBrowserRuntimeSnapshot,
  listenBrowserRuntimeSnapshots,
  projectBrowserRailInput,
  projectBrowserRailInputs,
  type BrowserRuntimeSnapshot,
} from "../state/browser-runtime";

/*
 * Tauri Browser-runtime snapshot ownership, lifted verbatim out of
 * ForgeAppBody. This cluster is self-contained: the snapshot state, its two
 * Tauri boot/listen effects, the on-demand `refreshBrowserRuntime` fetcher, and
 * the Browser rail projections only ever touch each other here — no other
 * ForgeApp logic reads or writes the snapshot. `dispatch` (used by the
 * listen-failure toast) comes from ServicesContext, matching every other body
 * hook; nothing else is injected.
 *
 * `setBrowserRuntimeSnapshot` is returned because the Browser side-panel tab
 * opener (`openBrowserSurface`, which lives next to the side-panel tab host in
 * the body) pushes live runtime snapshots back through the tab's
 * `onRuntimeChange` prop and the `openBrowserRuntime(...).then(...)` resolution.
 * That is the same surface the rail reads, so the snapshot stays the single
 * source of truth here while the body owns the side-panel wiring. The effect
 * dependency list (`[refreshBrowserRuntime]` for boot, `[dispatch]` for the
 * listener) is contract-exact with the original so effect timing is unchanged.
 */
export function useBrowserRuntime(): {
  browserRailInput: ReturnType<typeof projectBrowserRailInput>;
  browserRailInputs: ReturnType<typeof projectBrowserRailInputs>;
  refreshBrowserRuntime: () => Promise<BrowserRuntimeSnapshot>;
  setBrowserRuntimeSnapshot: Dispatch<SetStateAction<BrowserRuntimeSnapshot | null>>;
} {
  const { dispatch } = useServices();
  const [browserRuntimeSnapshot, setBrowserRuntimeSnapshot] = useState<BrowserRuntimeSnapshot | null>(null);
  const refreshBrowserRuntime = useCallback(async () => {
    const next = await loadBrowserRuntimeSnapshot();
    setBrowserRuntimeSnapshot(next);
    return next;
  }, []);
  useEffect(() => {
    if (!isTauriRuntime()) return;
    void refreshBrowserRuntime();
  }, [refreshBrowserRuntime]);
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    void listenBrowserRuntimeSnapshots((snapshot) => {
      setBrowserRuntimeSnapshot(snapshot);
    }).then((dispose) => {
      if (cancelled) {
        dispose?.();
        return;
      }
      unlisten = dispose;
    }).catch((error) => {
      dispatch({ type: "log", text: `Browser runtime listener failed: ${formatError(error)}`, level: "warn" });
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [dispatch]);
  const browserRailInput = useMemo(
    () => projectBrowserRailInput(browserRuntimeSnapshot),
    [browserRuntimeSnapshot],
  );
  const browserRailInputs = useMemo(
    () => projectBrowserRailInputs(browserRuntimeSnapshot),
    [browserRuntimeSnapshot],
  );
  return { browserRailInput, browserRailInputs, refreshBrowserRuntime, setBrowserRuntimeSnapshot };
}
