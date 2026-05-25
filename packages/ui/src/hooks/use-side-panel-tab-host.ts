import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import {
  SidePanelTabHostController,
  type SidePanelTabHostState,
  type TabId,
} from "../state/side-panel-tab-host-controller";
import {
  selectActiveTab,
  selectActiveTabReactKey,
  selectTabs,
  type SidePanelId,
  type SidePanelTab,
  type SidePanelTabHostObserver,
} from "../state/side-panel-tab-host";

/*
 * React-side glue for the side-panel tab host.
 *
 * Mirrors the way Codex Desktop reads its right-panel state in JSX consumers:
 * Codex pulls `tabs$`, `activeTab$`, `activeTabReactKey$` and the
 * `panelOpen$` atom (Jotai) inside `Vt(...)` at
 * `/private/tmp/codex-asar/pretty/app-shell-Bh-lgoQk.pretty.js:652-701`.
 * HiCodex doesn't run Jotai — we lift the same surface into a single hook so
 * call sites get an identical API shape (a `controller`, plus pre-derived
 * `tabs / activeTab / activeTabReactKey` + a `panelOpen` flag).
 *
 * Panel-open ownership matches Codex (`x({ ..., panelOpen$, setPanelOpen })`
 * at line 60): the controller exposes side-effect calls to `setPanelOpen`, the
 * host owns the actual boolean. Here that boolean is local React state.
 */
export interface UseSidePanelTabHostOptions {
  readonly panelId: SidePanelId;
  /** Codex line 60 default — `panelOpen$` initial value comes from the host. */
  readonly initialPanelOpen?: boolean;
  /**
   * Optional external panel-open observer. Fired in addition to the local
   * state update, so a parent can mirror open/close into its own preferences.
   */
  readonly onPanelOpenChange?: (open: boolean) => void;
  /** Test seam — see SidePanelTabHostControllerOptions. */
  readonly generateAutoTabId?: () => string;
  readonly generateDndId?: () => string;
}

export interface UseSidePanelTabHostResult {
  readonly controller: SidePanelTabHostController;
  readonly state: SidePanelTabHostState;
  readonly tabs: readonly SidePanelTab[];
  readonly activeTab: SidePanelTab | null;
  readonly activeTabReactKey: string | null;
  readonly panelOpen: boolean;
  /** Imperatively set the panel-open flag (e.g. from a header toggle button). */
  readonly setPanelOpen: (open: boolean) => void;
  /** Convenience: flip the panel-open flag. */
  readonly togglePanelOpen: () => void;
}

export function useSidePanelTabHost(options: UseSidePanelTabHostOptions): UseSidePanelTabHostResult {
  const [panelOpen, setPanelOpenState] = useState<boolean>(options.initialPanelOpen ?? false);
  const panelOpenRef = useRef(panelOpen);
  panelOpenRef.current = panelOpen;
  const onPanelOpenChangeRef = useRef(options.onPanelOpenChange);
  onPanelOpenChangeRef.current = options.onPanelOpenChange;

  const setPanelOpen = useCallback((open: boolean) => {
    setPanelOpenState((prev) => {
      if (prev === open) return prev;
      onPanelOpenChangeRef.current?.(open);
      return open;
    });
  }, []);

  /*
   * Controller is created once per hook instance. The observer closes over
   * `setPanelOpen` so `openTab`/`closeTab`/etc. drive the host's open flag —
   * matching Codex `a(t, true)` and `a(t, false)` calls inside `g()` (line
   * 141), `N()` (line 236) and `M()` (line 222).
   */
  const controllerRef = useRef<SidePanelTabHostController | null>(null);
  if (controllerRef.current == null) {
    const observer: SidePanelTabHostObserver = {
      setPanelOpen: (open: boolean) => setPanelOpen(open),
    };
    controllerRef.current = new SidePanelTabHostController({
      panelId: options.panelId,
      observer,
      ...(options.generateAutoTabId ? { generateAutoTabId: options.generateAutoTabId } : {}),
      ...(options.generateDndId ? { generateDndId: options.generateDndId } : {}),
    });
  }
  const controller = controllerRef.current;

  /*
   * Use the controller as an external store so React doesn't re-render on
   * every internal mutation that didn't change the snapshot reference.
   */
  const subscribe = useCallback((listener: () => void) => controller.subscribe(listener), [controller]);
  const getSnapshot = useCallback(() => controller.getSnapshot(), [controller]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  /*
   * Codex line 74: `activeTab$` falls back to `tabIds[0]` when the panel is
   * open and the explicit activeTabId is missing. Pass `panelOpen` through.
   */
  const activeTab = selectActiveTab(state, panelOpen);
  const activeTabReactKey = selectActiveTabReactKey(state, panelOpen);
  const tabs = selectTabs(state);

  const togglePanelOpen = useCallback(() => {
    setPanelOpen(!panelOpenRef.current);
  }, [setPanelOpen]);

  return {
    controller,
    state,
    tabs,
    activeTab,
    activeTabReactKey,
    panelOpen,
    setPanelOpen,
    togglePanelOpen,
  };
}

export type { SidePanelTab, SidePanelTabHostController, SidePanelTabHostState, TabId };
