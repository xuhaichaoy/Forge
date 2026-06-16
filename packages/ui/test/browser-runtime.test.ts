import {
  fileUrlForPath,
  isHtmlPath,
  projectBrowserRailInput,
  projectBrowserRailInputs,
  projectBrowserRuntimeSettingsEntries,
  type BrowserRuntimeSnapshot,
} from "../src/state/browser-runtime";

export default function runBrowserRuntimeTests(): void {
  projectsActiveHttpBrowserTabIntoRightRail();
  projectsAllDisplayableBrowserTabsIntoRightRail();
  omitsUnavailableAndBlankBrowserTabs();
  detectsHtmlPathsForBrowserRoute();
  buildsFileUrlsForBrowserNavigation();
  projectsBrowserRuntimeSettingsReadiness();
  projectsRegisteredIabProbeReadiness();
  projectsRegisteredExtensionBackendReadiness();
  projectsValidatedExtensionBackendReadiness();
}

// codex: src-X9SEQR78.js `xc = /\.html?$/i` — the html-path predicate behind
// the openWorkspaceFile browser gate.
function detectsHtmlPathsForBrowserRoute(): void {
  assertEqual(isHtmlPath("outputs/index.html"), true, "html path routes to the Browser");
  assertEqual(isHtmlPath("/abs/Page.HTM"), true, "htm path matches case-insensitively");
  assertEqual(isHtmlPath("notes/readme.md"), false, "non-html path stays in the source tab");
  assertEqual(isHtmlPath("site/index.html.bak"), false, "html must be the final extension");
  assertEqual(isHtmlPath(""), false, "empty path is not html");
}

function buildsFileUrlsForBrowserNavigation(): void {
  assertEqual(
    fileUrlForPath("/tmp/site/index.html"),
    "file:///tmp/site/index.html",
    "absolute path becomes a file URL",
  );
  assertEqual(
    fileUrlForPath("/tmp/my page/index.html"),
    "file:///tmp/my%20page/index.html",
    "spaces are percent-encoded",
  );
  assertEqual(
    fileUrlForPath("C:\\site\\index.html"),
    "file:///C:/site/index.html",
    "Windows drive paths gain an empty authority",
  );
  assertEqual(
    fileUrlForPath("/tmp/a#b?c.html"),
    "file:///tmp/a%23b%3Fc.html",
    "reserved # and ? in filenames must not become fragment/query separators",
  );
}

function projectsActiveHttpBrowserTabIntoRightRail(): void {
  const projected = projectBrowserRailInput({
    bridgeAvailable: true,
    available: true,
    activeTabId: "tab-2",
    tabs: [
      {
        tabId: "tab-1",
        title: "Earlier tab",
        url: "https://example.com",
        displayUrl: "example.com",
        open: true,
        isAgentWorking: false,
      },
      {
        tabId: "tab-2",
        title: "OpenAI Docs",
        url: "https://platform.openai.com/docs",
        displayUrl: "platform.openai.com/docs",
        open: true,
        isAgentWorking: true,
      },
    ],
  });

  assertEqual(projected?.title, "OpenAI Docs", "active Browser tab title should project into the right rail");
  assertEqual(
    projected?.displayUrl,
    "platform.openai.com/docs",
    "active Browser tab display URL should project into the right rail",
  );
  assertEqual(projected?.isActive, true, "active Browser tab working state should project into the right rail");
  assertEqual(projected?.tabId, "tab-2", "single Browser tab projection should prefer the active tab");
}

function projectsAllDisplayableBrowserTabsIntoRightRail(): void {
  const projected = projectBrowserRailInputs({
    bridgeAvailable: true,
    available: true,
    activeTabId: "tab-2",
    tabs: [
      {
        tabId: "tab-1",
        title: "Closed",
        url: "https://closed.example",
        displayUrl: "closed.example",
        open: false,
        isAgentWorking: false,
      },
      {
        tabId: "tab-2",
        title: "Docs",
        url: "https://platform.openai.com/docs",
        displayUrl: "platform.openai.com/docs",
        open: true,
        isAgentWorking: true,
      },
      {
        tabId: "tab-3",
        title: "Blank",
        url: "about:blank",
        displayUrl: "about:blank",
        open: true,
        isAgentWorking: false,
      },
      {
        tabId: "tab-4",
        title: "Local preview",
        url: "file:///tmp/index.html",
        displayUrl: "file:///tmp/index.html",
        open: true,
        isAgentWorking: false,
      },
      {
        tabId: "tab-5",
        title: "Extension",
        url: "chrome-extension://abc/page.html",
        displayUrl: "chrome-extension://abc/page.html",
        open: true,
        isAgentWorking: false,
      },
    ],
  });

  assertDeepEqual(
    projected.map((tab) => [tab.tabId, tab.title, tab.isActive]),
    [
      ["tab-2", "Docs", true],
      ["tab-4", "Local preview", false],
    ],
    "right rail Browser projection should include every open displayable Browser tab",
  );
}

function omitsUnavailableAndBlankBrowserTabs(): void {
  assertEqual(
    projectBrowserRailInput({
      bridgeAvailable: false,
      available: false,
      tabs: [],
      error: "unavailable",
    }),
    undefined,
    "unavailable Browser bridge should not render the right rail Browser row",
  );
  assertEqual(
    projectBrowserRailInput(browserSnapshotForUrl("about:blank")),
    undefined,
    "blank Browser tab should not render the right rail Browser row",
  );
  // file:// tabs are first-class targets (local web previews of generated
  // .html); they must surface in the rail like http(s) tabs do.
  assertEqual(
    projectBrowserRailInput(browserSnapshotForUrl("file:///tmp/index.html"))?.tabId,
    "tab-1",
    "file:// Browser tab should render the right rail Browser row",
  );
  assertEqual(
    projectBrowserRailInput(browserSnapshotForUrl("chrome-extension://abc/page.html")),
    undefined,
    "non-web Browser tab should not render the right rail Browser row",
  );
}

function browserSnapshotForUrl(url: string): BrowserRuntimeSnapshot {
  return {
    bridgeAvailable: true,
    available: true,
    activeTabId: "tab-1",
    tabs: [{
      tabId: "tab-1",
      title: "Browser",
      url,
      displayUrl: url,
      open: true,
      isAgentWorking: false,
    }],
  };
}

function projectsBrowserRuntimeSettingsReadiness(): void {
  const entries = projectBrowserRuntimeSettingsEntries({
    bridgeAvailable: true,
    available: true,
    activeTabId: "tab-1",
    tabs: [{
      tabId: "tab-1",
      title: "OpenAI Docs",
      url: "https://platform.openai.com/docs",
      displayUrl: "platform.openai.com/docs",
      open: true,
      isAgentWorking: false,
    }],
  });

  const entry = entries[0];
  assertEqual(entry?.id, "browser-use:runtime-readiness", "Browser settings should expose a runtime readiness row");
  assertEqual(entry?.status, "agent backend missing", "active Browser runtime should not claim agent control without an iab backend");
  assertEqual(
    entry?.details?.some((detail) => detail.includes("not connected to the bundled Browser iab provider yet")),
    true,
    "Browser runtime readiness should not claim bundled iab agent control",
  );
  assertEqual(
    entry?.details?.some((detail) => detail.includes("Local surface: window active")),
    true,
    "Browser runtime readiness should still expose the local Browser window state",
  );
  assertEqual(
    entry?.details?.some((detail) => detail.includes("IAB is a local Browser side path and is not the extension parity path")),
    true,
    "Browser runtime readiness should expose the missing iab backend",
  );
  assertEqual(
    entry?.details?.some((detail) => detail.includes("page JS evaluation, lightweight DOM lookup/geometry reads, coordinate hit testing, limited frame owner lookup, point scrolling")),
    true,
    "Browser runtime readiness should expose the missing browser control bridge",
  );
  assertEqual(
    entry?.secondaryActions?.[0]?.action.type,
    "openBrowserRuntime",
    "Browser runtime readiness should expose a Browser runtime action",
  );
  assertEqual(
    entry?.secondaryActions?.[0]?.label,
    "Focus Browser",
    "active Browser runtime should expose a focus action",
  );
}

function projectsRegisteredIabProbeReadiness(): void {
  const entries = projectBrowserRuntimeSettingsEntries({
    bridgeAvailable: true,
    available: true,
    activeTabId: "tab-1",
    iabBackendRegistered: true,
    iabBackendPath: "/tmp/codex-browser-use/hicodex-1-iab.sock",
    iabBackendMode: "probe",
    tabs: [{
      tabId: "tab-1",
      title: "OpenAI Docs",
      url: "https://platform.openai.com/docs",
      displayUrl: "platform.openai.com/docs",
      open: true,
      isAgentWorking: false,
    }],
  });

  const details = entries[0]?.details ?? [];
  assertEqual(
    entries[0]?.status,
    "probe backend active",
    "registered iab probe should be reflected in the primary status",
  );
  assertEqual(
    details.some((detail) => detail.includes("nativePipe iab probe backend is registered for discovery, tab inventory, basic navigation, lightweight DOM targeting, coordinate hit testing, limited frame owner lookup")),
    true,
    "Browser readiness should show the registered iab probe backend",
  );
  assertEqual(
    details.some((detail) => detail.includes("/tmp/codex-browser-use/hicodex-1-iab.sock")),
    true,
    "Browser readiness should show the nativePipe socket path",
  );
  assertEqual(
    details.some((detail) => detail.includes("same-document navigation events, visible-window screenshots, JS dialog no-op handling")),
    true,
    "registered iab probe should still not claim full Browser control",
  );
}

function projectsRegisteredExtensionBackendReadiness(): void {
  const entries = projectBrowserRuntimeSettingsEntries({
    bridgeAvailable: true,
    available: true,
    activeTabId: null,
    extensionBackendRegistered: true,
    extensionBackendValidated: false,
    extensionBackendPath: "/tmp/codex-browser-use/hicodex-1-extension.sock",
    extensionBackendMode: "host-compatible-spike",
    tabs: [],
  });

  const details = entries[0]?.details ?? [];
  assertEqual(
    entries[0]?.status,
    "host-compatible-spike extension registered",
    "registered extension spike should be reflected without claiming validation",
  );
  assertEqual(
    details.some((detail) => detail.includes("has not received Browser client getInfo validation yet")),
    true,
    "registered extension spike should show pending validation",
  );
  assertEqual(
    details.some((detail) => detail.includes("/tmp/codex-browser-use/hicodex-1-extension.sock")),
    true,
    "registered extension spike should show the extension socket path",
  );
  assertEqual(
    details.some((detail) => detail.includes("full DOM snapshots, native input, full-page capture, resource export, and file-transfer control remain unavailable")),
    true,
    "registered extension spike should still show Browser control limitations",
  );
}

function projectsValidatedExtensionBackendReadiness(): void {
  const entries = projectBrowserRuntimeSettingsEntries({
    bridgeAvailable: true,
    available: true,
    activeTabId: null,
    extensionBackendRegistered: true,
    extensionBackendValidated: true,
    extensionBackendPath: "/tmp/codex-browser-use/hicodex-1-extension.sock",
    extensionBackendMode: "host-compatible-spike",
    iabBackendRegistered: true,
    iabBackendPath: "/tmp/codex-browser-use/hicodex-1-iab.sock",
    iabBackendMode: "probe",
    tabs: [],
  });

  const details = entries[0]?.details ?? [];
  assertEqual(
    entries[0]?.status,
    "host-compatible-spike extension validated",
    "validated extension spike should take priority over the iab side path",
  );
  assertEqual(
    details.some((detail) => detail.includes("validated through Browser client getInfo")),
    true,
    "validated extension spike should show the getInfo validation source",
  );
  assertEqual(
    details.some((detail) => detail.includes("not full Chrome extension parity")),
    true,
    "validated extension spike should avoid claiming full parity",
  );
  assertEqual(
    details.some((detail) => detail.includes("IAB provider: /tmp/codex-browser-use/hicodex-1-iab.sock")),
    true,
    "validated extension spike should still report the separate iab provider",
  );
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
