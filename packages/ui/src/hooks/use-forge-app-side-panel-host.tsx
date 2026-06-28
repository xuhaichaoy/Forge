import { useCallback, useEffect, useRef } from "react";
import { Globe } from "lucide-react";
import { BrowserTabContent } from "../components/browser-tab-content";
import type { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import { openBrowserRuntime } from "../state/browser-runtime";
import type { CodexUiState } from "../state/codex-reducer";
import {
  nextOpenFileWatchRefreshKey,
  openFileWatchTargetsFromSidePanelTabs,
  type OpenFileWatchTarget,
} from "../state/open-file-watches";
import { TAB_KINDS } from "../state/side-panel-tab-host";
import type { SidePanelTab } from "../state/side-panel-tab-host";
import type { ThreadWorkflowDispatch } from "../state/thread-workflow";
import type { useBrowserRuntime } from "./use-browser-runtime";
import { useSidePanelTabHost } from "./use-side-panel-tab-host";

/*
 * Mechanical extraction of a CONTIGUOUS hook cluster from ForgeAppBody
 * (right side-panel tab host + Browser surface opener + the Files-tab opener
 * ref + fs watch/unwatch wiring for open file tabs). Hook call order inside
 * the cluster is unchanged, and the cluster is invoked from the exact source
 * position the first extracted hook previously occupied, so React's linear
 * hook sequence is preserved.
 */
export interface ForgeAppSidePanelHostArgs {
  client: CodexJsonRpcClient;
  dispatch: ThreadWorkflowDispatch;
  refreshBrowserRuntime: ReturnType<typeof useBrowserRuntime>["refreshBrowserRuntime"];
  refreshOpenFileWatchTabsRef: { current: ((watchId: string) => void) | null };
  setBrowserRuntimeSnapshot: ReturnType<typeof useBrowserRuntime>["setBrowserRuntimeSnapshot"];
  onRightPanelVisibilityChange?: (visible: boolean) => void;
  state: CodexUiState;
}

export function sidePanelObscuresRightRail(
  panelOpen: boolean,
  activeTab: Pick<SidePanelTab, "kind" | "tabId"> | null,
): boolean {
  if (!panelOpen) return false;
  if (!activeTab) return true;
  const key = activeTab.kind ?? activeTab.tabId;
  return !(
    key.startsWith("sidechat:")
    || key.startsWith("side-chat:")
    || key.startsWith("background-agent:")
  );
}

export function useForgeAppSidePanelHost(args: ForgeAppSidePanelHostArgs) {
  const {
    client,
    dispatch,
    onRightPanelVisibilityChange,
    refreshBrowserRuntime,
    refreshOpenFileWatchTabsRef,
    setBrowserRuntimeSnapshot,
    state,
  } = args;
  /*
   * codex: app-shell-tab-controller-*.js `x({ panelId: 'right', panelOpen$, setPanelOpen })`
   * factory + `RightPanelOutlet`/`RightPanelTabs`/`RightPanelTabsEmptyState`
   * slot wiring in app-shell-*.js + 4-card landing page in
   * thread-app-shell-chrome-*.js.
   *
   * `sidePanel` mirrors Codex's right-panel tab controller singleton. The Files
   * card opens a `file-tree` tab whose Component is Forge's existing
   * `WorkspaceFilesPanel` wrapped as `FilesTabContent`; the Browser card opens
   * the runtime-backed Browser control tab once the Tauri bridge is available.
   * Terminal/Timeline/Side chat/Review stay omitted until Forge has matching
   * host/protocol-backed implementations.
   */
  const sidePanel = useSidePanelTabHost({ panelId: "right" });
  const rightPanelVisible = sidePanelObscuresRightRail(sidePanel.panelOpen, sidePanel.activeTab);
  useEffect(() => {
    onRightPanelVisibilityChange?.(rightPanelVisible);
  }, [onRightPanelVisibilityChange, rightPanelVisible]);
  useEffect(() => {
    return () => {
      onRightPanelVisibilityChange?.(false);
    };
  }, [onRightPanelVisibilityChange]);
  /*
   * Stable tabId for the Files tab. Codex auto-generates `component:${UUID}`
   * for tabs without explicit id (app-shell-tab-controller-*.js),
   * which dedupes per Component reference. Forge pins the id so the ⌘⇧E
   * shortcut can deterministically check tab presence by id.
   */
  const FILES_TAB_ID = "file-tree";
  const openBrowserSurface = useCallback((tabId?: string | null) => {
    const normalizedTabId = tabId?.trim() || undefined;
    const sidePanelTabId = normalizedTabId ? `browser:${normalizedTabId}` : "browser";
    sidePanel.controller.openTab({
      id: sidePanelTabId,
      kind: TAB_KINDS.browser,
      Component: BrowserTabContent,
      title: "Browser",
      tooltip: "Browser",
      icon: <Globe size={14} aria-hidden="true" />,
      props: {
        ...(normalizedTabId ? { initialTabId: normalizedTabId } : {}),
        onRuntimeChange: setBrowserRuntimeSnapshot,
      },
    });
    if (normalizedTabId) {
      void openBrowserRuntime(null, normalizedTabId).then(setBrowserRuntimeSnapshot);
      return;
    }
    void refreshBrowserRuntime();
  }, [refreshBrowserRuntime, setBrowserRuntimeSnapshot, sidePanel]);

  // codex: electron-menu-shortcuts-*.js (`toggleFileTreePanel` default = ⌘⇧E)
  // The legacy `workspaceFilesPanelOpen` flag is gone; the shortcut now routes
  // through the side-panel tab host. Behaviour matches Codex's
  // `toggleFileTreePanel` (an open-or-focus action that lands on the Files
  // tab) — opening if the tab isn't present, activating it if it is, closing
  // the panel only when the user explicitly hits the close button.
  //
  // The actual "create new Files tab" closure lives in a ref so it can be
  // re-assigned later in the component body once `openFileReferenceExternal`
  // (from `useArtifactPreviewActions`, declared further down) is in scope.
  // Defining the toggle here keeps the command-registration effect happy
  // (which expects `toggleWorkspaceFilesPanel` as a dep above its use) while
  // avoiding a TDZ on the later-declared destructured value.
  const openFilesTabRef = useRef<(() => void) | null>(null);
  const openFileWatchTargetsRef = useRef(new Map<string, OpenFileWatchTarget>());
  useEffect(() => {
    const refreshTabsForWatch = (watchId: string) => {
      const target = openFileWatchTargetsRef.current.get(watchId);
      if (!target) return;
      const snapshot = sidePanel.controller.getSnapshot();
      for (const watchTab of target.tabs) {
        const tabId = watchTab.tabId;
        const tab = snapshot.tabsById[tabId];
        if (!tab) continue;
        if (watchTab.refreshMode === "manual") {
          sidePanel.controller.updateTab(tabId, {
            props: {
              ...tab.props,
              sourceChanged: true,
            },
          });
          continue;
        }
        sidePanel.controller.updateTab(tabId, {
          props: {
            ...tab.props,
            refreshKey: nextOpenFileWatchRefreshKey(tab.props.refreshKey),
          },
        });
      }
    };
    refreshOpenFileWatchTabsRef.current = refreshTabsForWatch;
    return () => {
      if (refreshOpenFileWatchTabsRef.current === refreshTabsForWatch) {
        refreshOpenFileWatchTabsRef.current = null;
      }
    };
  }, [refreshOpenFileWatchTabsRef, sidePanel.controller]);

  useEffect(() => {
    if (!state.connected) {
      openFileWatchTargetsRef.current = new Map();
      return;
    }

    const nextTargets = new Map(
      openFileWatchTargetsFromSidePanelTabs(sidePanel.tabs)
        .map((target) => [target.watchId, target] as const),
    );
    const previousTargets = openFileWatchTargetsRef.current;

    for (const watchId of previousTargets.keys()) {
      if (nextTargets.has(watchId)) continue;
      void Promise.resolve()
        .then(() => client.request("fs/unwatch", { watchId }, 10_000))
        .catch((error: unknown) => {
          dispatch({ type: "log", text: `fs/unwatch ${watchId} failed: ${formatError(error)}`, level: "warn" });
        });
    }

    for (const target of nextTargets.values()) {
      if (previousTargets.has(target.watchId)) continue;
      void Promise.resolve()
        .then(() => client.request("fs/watch", { watchId: target.watchId, path: target.watchPath }, 10_000))
        .catch((error: unknown) => {
          dispatch({ type: "log", text: `fs/watch ${target.watchPath} failed: ${formatError(error)}`, level: "warn" });
        });
    }

    openFileWatchTargetsRef.current = nextTargets;
  }, [client, dispatch, sidePanel.tabs, state.connected]);

  useEffect(() => {
    return () => {
      const watchIds = [...openFileWatchTargetsRef.current.keys()];
      openFileWatchTargetsRef.current = new Map();
      for (const watchId of watchIds) {
        void Promise.resolve()
          .then(() => client.request("fs/unwatch", { watchId }, 10_000))
          .catch(() => undefined);
      }
    };
  }, [client]);
  return {
    FILES_TAB_ID,
    openBrowserSurface,
    openFilesTabRef,
    sidePanel,
  };
}
