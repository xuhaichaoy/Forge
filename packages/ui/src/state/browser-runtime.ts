import {
  isTauriRuntime,
  listenBrowserRuntimeEvents,
  openBrowserRuntimeTab,
  readBrowserRuntimeStatus,
  type BrowserRuntimeStatus,
  type BrowserRuntimeTab,
} from "../lib/tauri-host";
import type {
  CommandPanelEntry,
  CommandPanelSecondaryAction,
} from "./command-panel";
import type { RightRailBrowserInput } from "./right-rail";

export const DEFAULT_BROWSER_RUNTIME_URL = "https://example.com";

export interface BrowserRuntimeSnapshot extends BrowserRuntimeStatus {
  bridgeAvailable: boolean;
}

export function unavailableBrowserRuntime(error?: string | null): BrowserRuntimeSnapshot {
  return {
    available: false,
    bridgeAvailable: false,
    activeTabId: null,
    tabs: [],
    error: error ?? null,
    iabBackendRegistered: false,
    iabBackendPath: null,
    iabBackendMode: null,
    extensionBackendRegistered: false,
    extensionBackendValidated: false,
    extensionBackendPath: null,
    extensionBackendMode: null,
  };
}

export function browserRuntimeSnapshotFromStatus(status: BrowserRuntimeStatus): BrowserRuntimeSnapshot {
  return {
    ...status,
    bridgeAvailable: true,
  };
}

export function listenBrowserRuntimeSnapshots(
  handler: (snapshot: BrowserRuntimeSnapshot) => void,
): Promise<(() => void) | null> {
  if (!isTauriRuntime()) return Promise.resolve(null);
  return listenBrowserRuntimeEvents((status) => {
    handler(browserRuntimeSnapshotFromStatus(status));
  });
}

export async function loadBrowserRuntimeSnapshot(): Promise<BrowserRuntimeSnapshot> {
  if (!isTauriRuntime()) {
    return unavailableBrowserRuntime("Tauri host bridge is unavailable in this environment.");
  }
  try {
    return browserRuntimeSnapshotFromStatus(await readBrowserRuntimeStatus());
  } catch (error) {
    return unavailableBrowserRuntime(error instanceof Error ? error.message : String(error));
  }
}

export async function openBrowserRuntime(
  url?: string | null,
  tabId?: string | null,
): Promise<BrowserRuntimeSnapshot> {
  if (!isTauriRuntime()) {
    return unavailableBrowserRuntime("Tauri host bridge is unavailable in this environment.");
  }
  try {
    return browserRuntimeSnapshotFromStatus(await openBrowserRuntimeTab(url, tabId));
  } catch (error) {
    return unavailableBrowserRuntime(error instanceof Error ? error.message : String(error));
  }
}

export async function loadBrowserRuntimeSettingsEntries(): Promise<CommandPanelEntry[]> {
  return projectBrowserRuntimeSettingsEntries(await loadBrowserRuntimeSnapshot());
}

export function projectBrowserRuntimeSettingsEntries(
  snapshot: BrowserRuntimeSnapshot | BrowserRuntimeStatus | null | undefined,
): CommandPanelEntry[] {
  const bridgeAvailable = snapshot && "bridgeAvailable" in snapshot
    ? snapshot.bridgeAvailable === true
    : Boolean(snapshot?.available);
  const available = snapshot?.available === true;
  const openTabs = Array.isArray(snapshot?.tabs)
    ? snapshot.tabs.filter((tab) => tab.open)
    : [];
  const activeTab = snapshot ? activeBrowserRuntimeTab(snapshot) : null;
  const activeDisplayUrl = activeTab && browserTabHasDisplayableUrl(activeTab)
    ? browserDisplayUrl(activeTab.url)
    : "";
  const iabRegistered = snapshot?.iabBackendRegistered === true;
  const iabMode = snapshot?.iabBackendMode?.trim() || "unknown";
  const extensionRegistered = snapshot?.extensionBackendRegistered === true;
  const extensionValidated = extensionRegistered && snapshot?.extensionBackendValidated === true;
  const extensionMode = snapshot?.extensionBackendMode?.trim() || "host-compatible-spike";
  const localWindowStatus = activeDisplayUrl
    ? "window active"
    : openTabs.length > 0
      ? "window open"
      : "local ready";
  let status = "agent backend missing";
  if (!bridgeAvailable) {
    status = "unavailable";
  } else if (snapshot?.error) {
    status = "error";
  } else if (extensionValidated) {
    status = `${extensionMode} extension validated`;
  } else if (extensionRegistered) {
    status = `${extensionMode} extension registered`;
  } else if (iabRegistered) {
    status = `${iabMode} backend ${activeDisplayUrl ? "active" : openTabs.length > 0 ? "open" : "ready"}`;
  }
  const agentControlDetail = extensionValidated
    ? `Agent control: host-compatible extension backend was validated through Browser client getInfo at ${snapshot?.extensionBackendPath || "registered path unavailable"}; this proves discovery and handshake only, not full Chrome extension parity.`
    : extensionRegistered
      ? `Agent control: host-compatible extension backend is registered at ${snapshot?.extensionBackendPath || "registered path unavailable"} but has not received Browser client getInfo validation yet.`
      : iabRegistered
        ? `Agent control: nativePipe iab ${iabMode} backend is registered for discovery, tab inventory, basic navigation, lightweight DOM targeting, coordinate hit testing, limited frame owner lookup, point scrolling, same-document navigation events, JS dialog no-op handling, and visible-window screenshots.`
        : "Agent control: not connected to the bundled Browser iab provider yet.";
  const details = [
    "Runtime bridge: Tauri host command host_open_browser_tab.",
    `Local surface: ${localWindowStatus}; opens and focuses an http/https Browser window.`,
    agentControlDetail,
    extensionRegistered
      ? `Extension backend: ${extensionMode}; ${extensionValidated ? "validated by Browser client discovery" : "registered for the extension-host feasibility spike only"}.`
      : "Extension backend: not registered; full Browser parity still depends on the host-compatible extension backend spike.",
    iabRegistered
      ? `IAB provider: ${snapshot?.iabBackendPath || "registered path unavailable"}`
      : "IAB provider: not connected; IAB is a local Browser side path and is not the extension parity path.",
    "Browser sidebar bridge: limited; page JS evaluation, lightweight DOM lookup/geometry reads, coordinate hit testing, limited frame owner lookup, point scrolling, same-document navigation events, visible-window screenshots, JS dialog no-op handling, and basic event input are available, while full DOM snapshots, native input, full-page capture, resource export, and file-transfer control remain unavailable.",
    activeTab
      ? `Active tab: ${browserTabTitle(activeTab)}${activeDisplayUrl ? ` (${activeDisplayUrl})` : ""}`
      : "Active tab: none",
    ...(snapshot?.error ? [`Runtime error: ${snapshot.error}`] : []),
  ];
  return [{
    id: "browser-use:runtime-readiness",
    title: "Browser runtime",
    kind: "status",
    status,
    meta: bridgeAvailable
      ? `${openTabs.length} open tab${openTabs.length === 1 ? "" : "s"} · local Browser surface`
      : "Tauri host bridge unavailable",
    details,
    secondaryActions: browserRuntimeSecondaryActions({
      activeTabId: activeTab?.tabId ?? null,
      available: bridgeAvailable && available && !snapshot?.error,
      hasDisplayableActiveTab: Boolean(activeDisplayUrl),
    }),
  }];
}

function browserRuntimeSecondaryActions({
  activeTabId,
  available,
  hasDisplayableActiveTab,
}: {
  activeTabId: string | null;
  available: boolean;
  hasDisplayableActiveTab: boolean;
}): CommandPanelSecondaryAction[] {
  if (!available) return [];
  if (activeTabId && hasDisplayableActiveTab) {
    return [{
      id: "browser-use:focus-runtime",
      label: "Focus Browser",
      title: "Focus Browser runtime window",
      action: {
        type: "openBrowserRuntime",
        title: "Focus Browser",
        tabId: activeTabId,
      },
    }];
  }
  return [{
    id: "browser-use:open-runtime",
    label: "Open Browser",
    title: "Open Browser runtime window",
    action: {
      type: "openBrowserRuntime",
      title: "Open Browser",
      url: DEFAULT_BROWSER_RUNTIME_URL,
    },
  }];
}

export function projectBrowserRailInput(
  snapshot: BrowserRuntimeSnapshot | BrowserRuntimeStatus | null | undefined,
): RightRailBrowserInput | undefined {
  if (!snapshot?.available) return undefined;
  const tab = activeBrowserRuntimeTab(snapshot);
  if (!tab || !tab.open) return undefined;
  if (!browserTabHasDisplayableUrl(tab)) return undefined;
  return {
    tabId: tab.tabId,
    title: browserTabTitle(tab),
    displayUrl: tab.displayUrl?.trim() || browserDisplayUrl(tab.url),
    isActive: tab.isAgentWorking === true,
  };
}

export function activeBrowserRuntimeTab(
  snapshot: BrowserRuntimeStatus,
): BrowserRuntimeTab | null {
  const tabs = Array.isArray(snapshot.tabs) ? snapshot.tabs : [];
  const activeId = snapshot.activeTabId?.trim();
  return tabs.find((tab) => tab.open && tab.tabId === activeId)
    ?? tabs.find((tab) => tab.open)
    ?? null;
}

export function browserTabHasDisplayableUrl(tab: BrowserRuntimeTab): boolean {
  const raw = tab.url?.trim() ?? "";
  if (!raw || raw.toLowerCase() === "about:blank") return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function browserTabTitle(tab: BrowserRuntimeTab): string {
  return tab.title?.trim() || tab.displayUrl?.trim() || browserDisplayUrl(tab.url) || "Browser";
}

export function browserDisplayUrl(value: string): string {
  try {
    const parsed = new URL(value);
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`.replace(/\/$/, "");
    return `${parsed.host}${path === "/" ? "" : path}`;
  } catch {
    return value.trim();
  }
}
