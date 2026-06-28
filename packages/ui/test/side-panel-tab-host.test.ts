import { createElement } from "react";
import { sidePanelObscuresRightRail } from "../src/hooks/use-forge-app-side-panel-host";
import {
  SidePanelTabHostController,
  type OpenTabOptions,
  type SidePanelTabComponent,
} from "../src/state/side-panel-tab-host-controller";
import {
  applyActivateTab,
  applyCloseTab,
  applyReorderTab,
  applyResetTabState,
  applySeedTabState,
  applySetTabState,
  applyTabInsertOrUpdate,
  applyUpdateTab,
  buildTabFromOpenOptions,
  createInitialSidePanelTabHostState,
  findPreviewTab,
  pickNextActiveTabAfterClose,
  pruneRecentlyClosed,
  resolveTabId,
  selectActiveTab,
  selectActiveTabReactKey,
  selectTabs,
  type SidePanelTab,
  type TabId,
} from "../src/state/side-panel-tab-host";

/*
 * Test suite mirrors the behaviours observed in
 * `/private/tmp/codex-asar/pretty/app-shell-tab-controller-B2eCi4Le.pretty.js`.
 * Each test cites the Codex line range it is locking in. If a test fails after
 * a refactor, diff the implementation against the cited Codex source before
 * "fixing" the test.
 */
export default function runSidePanelTabHostTests(): void {
  // pure helpers
  pickNextActiveTabAfterCloseMatchesCodexFallbackChain();
  pruneRecentlyClosedKeepsOnlyRemainingIds();
  resolveTabIdHonoursExplicitIdAndCachesByComponent();
  buildTabFromOpenOptionsAppliesCodexDefaults();
  applySeedTabStateOnlySeedsWhenAbsentAndDefaultProvided();
  applyTabInsertOrUpdatePreservesPinAgainstPreviewDowngrade();
  applyActivateTabUpdatesRecentlyClosedLikeCodex();
  applyCloseTabReturnsPanelCloseFlagWhenLastTabRemoved();
  applyUpdateTabCoercesPreviewDowngradeToFalse();
  applyReorderTabMovesIntoBeforeIndex();
  applyResetTabStateIncrementsKeyAndResetsValue();
  applySetTabStateShortCircuitsOnObjectIsEqual();

  // selectors
  selectActiveTabReturnsNullWhenActiveIdAbsent();
  selectActiveTabFallsBackToFirstTabWhenPanelOpen();
  selectActiveTabReactKeyFormatsKindOrTabIdWithStateKey();
  selectTabsReturnsTabIdsOrderProjectedToTabsById();
  sidePanelObscuresRightRailForVisibleHostTabs();

  // controller (orchestrator + side effects)
  controllerOpenTabAutoGeneratesIdWhenAbsent();
  controllerOpenTabReusesAutoIdForSameComponent();
  controllerOpenTabSeedsAndPreservesDefaultState();
  controllerOpenTabEvictsCurrentPreviewWhenAddingNewPreview();
  controllerOpenTabDoesNotEvictPreviewWhenReOpeningSameTab();
  controllerOpenTabReusesExistingIdForArtifactSourceConversion();
  controllerOpenTabActivatesAndOpensPanelByDefault();
  controllerOpenTabHonoursActivateFalse();
  controllerOpenTabIsLabelForcesIsClosableFalse();
  controllerCloseTabCancelsWhenOnBeforeCloseReturnsFalse();
  controllerCloseTabFiresOnCloseAndUpdatesPanelOpen();
  controllerCloseTabPicksNextActiveFromRecentlyClosed();
  controllerCloseTabPicksPreviousIndexWhenRecentlyClosedEmpty();
  controllerCloseTabNoopWhenTabAbsent();
  controllerActivateTabClearsWhenNull();
  controllerActivateTabIgnoresUnknownTabId();
  controllerActivateTabFiresOnActivateOnChange();
  controllerCloseActiveTabGatedByPanelOpenAndIsClosable();
  controllerUpdateTabIsNoopWhenTabAbsent();
  controllerPinTabSetsPreviewFalse();
  controllerReorderTabMovesAhead();
  controllerResetTabStateBumpsKey();
  controllerSetTabStateUsesFallbackInitialAndShortCircuits();
  controllerSubscribeFanOutsOnEachCommit();
}

// ---------------------------------------------------------------------------
// pure helpers
// ---------------------------------------------------------------------------

function pickNextActiveTabAfterCloseMatchesCodexFallbackChain(): void {
  /*
   * codex: `S(arr, idx)` at app-shell-tab-controller-B2eCi4Le.pretty.js:309-311
   *   `return arr[idx-1] ?? arr[idx] ?? null;`
   */
  assertEqual(pickNextActiveTabAfterClose(["a", "b", "c"], 1), "a", "fallback to idx-1");
  assertEqual(pickNextActiveTabAfterClose(["a", "b"], 0), "a", "idx-1 absent → idx fallback");
  assertEqual(pickNextActiveTabAfterClose([], 0), null, "empty list → null");
}

function pruneRecentlyClosedKeepsOnlyRemainingIds(): void {
  // codex: `w(scope, atom, remaining)` line 315-317.
  const out = pruneRecentlyClosed(["b", "a", "x"], ["a", "b"]);
  assertDeepEqual(out, ["b", "a"], "prune keeps order of recentlyClosed, drops missing");
}

function resolveTabIdHonoursExplicitIdAndCachesByComponent(): void {
  // codex: `k(component, id)` line 340-346.
  const cache = new WeakMap<object, TabId>();
  const Component = (() => null) as unknown as SidePanelTabComponent;
  let counter = 0;
  const gen = () => `auto-${++counter}`;
  assertEqual(resolveTabId(cache, Component, "explicit", gen), "explicit", "explicit id passes through");
  assertEqual(counter, 0, "no generator call when explicit id given");
  const auto1 = resolveTabId(cache, Component, undefined, gen);
  const auto2 = resolveTabId(cache, Component, undefined, gen);
  assertEqual(auto1, auto2, "same Component yields cached auto id");
  assertEqual(counter, 1, "generator only fires once per Component");
}

function buildTabFromOpenOptionsAppliesCodexDefaults(): void {
  // codex: `v(t, {...})` object literal line 115-138.
  const Component = (() => null) as unknown as SidePanelTabComponent;
  const tab = buildTabFromOpenOptions({
    tabId: "tabA",
    options: { Component },
    dndIdGenerator: () => "dnd-1",
  });
  assertEqual(tab.tabId, "tabA", "tabId carried through");
  assertEqual(tab.isClosable, true, "default isClosable true");
  assertEqual(tab.isLabel, false, "default isLabel false");
  assertEqual(tab.isPreview, false, "default isPreview false");
  assertEqual(tab.isHighlighted, false, "default isHighlighted false");
  assertEqual(tab.isShimmering, false, "default isShimmering false");
  assertEqual(tab.dndId, "dnd-1", "dndId from generator when no previous");
  assertDeepEqual(tab.props, {}, "default props empty");

  const labelTab = buildTabFromOpenOptions({
    tabId: "label",
    options: { Component, isLabel: true },
    dndIdGenerator: () => "dnd-2",
  });
  // codex line 121: `isClosable: !m && (f ?? true)`. m === isLabel.
  assertEqual(labelTab.isClosable, false, "isLabel true forces isClosable false");

  const previous = buildTabFromOpenOptions({
    tabId: "x",
    options: { Component },
    dndIdGenerator: () => "dnd-old",
  });
  const reopen = buildTabFromOpenOptions({
    tabId: "x",
    previous,
    options: { Component },
    dndIdGenerator: () => "dnd-new",
  });
  // codex line 118: `dndId: R?.dndId ?? C()` — re-open keeps previous dndId.
  assertEqual(reopen.dndId, "dnd-old", "dndId preserved across re-open");
}

function applySeedTabStateOnlySeedsWhenAbsentAndDefaultProvided(): void {
  // codex line 110, 114.
  const base = createInitialSidePanelTabHostState("right");
  const noDefault = applySeedTabState(base, "t1", undefined);
  assertEqual(noDefault, base, "no defaultState → no change");
  const seeded = applySeedTabState(base, "t1", () => "init");
  assertEqual(seeded.tabStates["t1"]?.value, "init", "seeds defaultState value");
  assertEqual(seeded.tabStates["t1"]?.key, 0, "seeds key=0");
  const reseed = applySeedTabState(seeded, "t1", () => "again");
  assertEqual(reseed, seeded, "existing state not overwritten on re-seed");
}

function applyTabInsertOrUpdatePreservesPinAgainstPreviewDowngrade(): void {
  // codex line 158: `i = t.isPreview && r != null ? { ...t, isPreview: r.isPreview } : t`.
  const base = createInitialSidePanelTabHostState("right");
  const Component = (() => null) as unknown as SidePanelTabComponent;
  const pinned = buildTabFromOpenOptions({
    tabId: "t1",
    options: { Component, isPreview: false },
    dndIdGenerator: () => "dnd-1",
  });
  let state = applyTabInsertOrUpdate(base, pinned);
  const tryPreview = buildTabFromOpenOptions({
    tabId: "t1",
    previous: pinned,
    options: { Component, isPreview: true },
    dndIdGenerator: () => "dnd-2",
  });
  state = applyTabInsertOrUpdate(state, tryPreview);
  assertEqual(state.tabsById["t1"]?.isPreview, false, "existing pinned tab not downgraded to preview");
}

function controllerOpenTabReusesExistingIdForArtifactSourceConversion(): void {
  /*
   * codex: artifact-tab-content.electron-*.js calls review-file-source-tab's
   * source opener with the current artifact `tabId`; app-shell-tab-controller
   * then updates that existing tab instead of appending a file:* tab.
   */
  const ArtifactComponent = (() => createElement("div")) as unknown as SidePanelTabComponent;
  const SourceComponent = (() => createElement("div")) as unknown as SidePanelTabComponent;
  const controller = makeController();

  controller.openTab({
    id: "artifact:local:%2Fworkspace%2Freport.pdf",
    Component: ArtifactComponent,
    title: "report.pdf",
    isPreview: true,
  });
  controller.openTab({
    id: "artifact:local:%2Fworkspace%2Freport.pdf",
    Component: SourceComponent,
    title: "report.pdf",
    isPreview: false,
    kind: "workspaceFile:local",
    props: { path: "/workspace/report.pdf", lineStart: 1 },
  });

  const tabs = controller.getTabs();
  assertEqual(tabs.length, 1, "source conversion should update the artifact tab in place");
  assertEqual(tabs[0]?.tabId, "artifact:local:%2Fworkspace%2Freport.pdf", "tab id should stay the artifact tab id");
  assertEqual(tabs[0]?.Component, SourceComponent, "tab component should become the file source preview");
  assertEqual(tabs[0]?.kind, "workspaceFile:local", "source conversion should use Desktop's workspace-file kind");
  assertEqual(tabs[0]?.isPreview, false, "source conversion should pin the reused tab");
  assertEqual(tabs[0]?.props.path, "/workspace/report.pdf", "source conversion should replace tab props");
}

function applyActivateTabUpdatesRecentlyClosedLikeCodex(): void {
  // codex `L(scope, n, r)` line 250-260.
  let state = createInitialSidePanelTabHostState("right");
  state = applyActivateTab(state, "a", true);
  assertEqual(state.activeTabId, "a", "active set to a");
  state = applyActivateTab(state, "b", true);
  // After activating b: old active "a" should appear at head of recentlyClosed.
  assertDeepEqual(state.recentlyClosedTabIds, ["a"], "previous active prepended to recentlyClosed");
  state = applyActivateTab(state, "c", true);
  assertDeepEqual(
    state.recentlyClosedTabIds,
    ["b", "a"],
    "subsequent active prepended; new active stripped from prior recentlyClosed",
  );
  // Activating same active is a noop (Codex line 252 `i !== n`).
  const sameAgain = applyActivateTab(state, "c", true);
  assertEqual(sameAgain, state, "activate same tab is referentially equal");
}

function applyCloseTabReturnsPanelCloseFlagWhenLastTabRemoved(): void {
  // codex line 227-238.
  const Component = (() => null) as unknown as SidePanelTabComponent;
  const tab = buildTabFromOpenOptions({
    tabId: "only",
    options: { Component },
    dndIdGenerator: () => "dnd-1",
  });
  let state = applyTabInsertOrUpdate(createInitialSidePanelTabHostState("right"), tab);
  state = applyActivateTab(state, "only", true);
  const result = applyCloseTab(state, "only");
  assertNotNull(result, "close returns result");
  assertEqual(result!.panelShouldClose, true, "last tab closed → panel should close");
  assertEqual(result!.state.tabIds.length, 0, "tabIds empty after close");
  assertEqual(result!.state.activeTabId, null, "activeTabId cleared");
}

function applyUpdateTabCoercesPreviewDowngradeToFalse(): void {
  // codex line 152: `n.isPreview && !i.isPreview ? { ...n, isPreview: false } : n`.
  const Component = (() => null) as unknown as SidePanelTabComponent;
  const tab = buildTabFromOpenOptions({
    tabId: "t1",
    options: { Component, isPreview: false },
    dndIdGenerator: () => "dnd-1",
  });
  const state = applyTabInsertOrUpdate(createInitialSidePanelTabHostState("right"), tab);
  const updated = applyUpdateTab(state, "t1", { isPreview: true, title: "new" });
  assertEqual(updated.tabsById["t1"]?.isPreview, false, "preview update on pinned tab coerced to false");
  assertEqual(updated.tabsById["t1"]?.title, "new", "other fields merge through");
  const noop = applyUpdateTab(state, "missing", { title: "x" });
  assertEqual(noop, state, "update on missing tab is noop");
}

function applyReorderTabMovesIntoBeforeIndex(): void {
  // codex line 173-181.
  const Component = (() => null) as unknown as SidePanelTabComponent;
  let state = createInitialSidePanelTabHostState("right");
  for (const id of ["a", "b", "c", "d"]) {
    state = applyTabInsertOrUpdate(
      state,
      buildTabFromOpenOptions({ tabId: id, options: { Component }, dndIdGenerator: () => `dnd-${id}` }),
    );
  }
  const reordered = applyReorderTab(state, "d", "b");
  // After splicing "d" out (now [a, b, c]) and inserting at index of "b" (= 1):
  assertDeepEqual(reordered.tabIds, ["a", "d", "b", "c"], "d moves into b's index");
  const noop = applyReorderTab(state, "x", "a");
  assertEqual(noop, state, "missing source → noop");
}

function applyResetTabStateIncrementsKeyAndResetsValue(): void {
  // codex line 262-265.
  const Component = (() => null) as unknown as SidePanelTabComponent;
  let state = createInitialSidePanelTabHostState("right");
  state = applyTabInsertOrUpdate(
    state,
    buildTabFromOpenOptions({
      tabId: "t1",
      options: { Component, defaultState: () => "fresh" },
      dndIdGenerator: () => "dnd-1",
    }),
  );
  state = applySeedTabState(state, "t1", () => "fresh");
  state = applySetTabState(state, "t1", "dirty", "fresh");
  const reset = applyResetTabState(state, "t1");
  assertEqual(reset.tabStates["t1"]?.key, 1, "key bumped");
  assertEqual(reset.tabStates["t1"]?.value, "fresh", "value reset to defaultState()");
}

function applySetTabStateShortCircuitsOnObjectIsEqual(): void {
  // codex line 288-294.
  let state = createInitialSidePanelTabHostState("right");
  state = applySeedTabState(state, "t1", () => "v1");
  const same = applySetTabState(state, "t1", "v1", "v1");
  assertEqual(same, state, "same value → referentially identical state");
  const changed = applySetTabState(state, "t1", "v2", "v1");
  assertEqual(changed.tabStates["t1"]?.value, "v2", "different value commits");
  const fn = applySetTabState(changed, "t1", (prev: string) => `${prev}+`, "v1");
  assertEqual(fn.tabStates["t1"]?.value, "v2+", "function updater receives prev value");
}

// ---------------------------------------------------------------------------
// selectors
// ---------------------------------------------------------------------------

function selectActiveTabReturnsNullWhenActiveIdAbsent(): void {
  const state = createInitialSidePanelTabHostState("right");
  assertEqual(selectActiveTab(state), null, "no activeTabId → null");
}

function selectActiveTabFallsBackToFirstTabWhenPanelOpen(): void {
  // codex line 74: `tabById[active] ?? (panelOpen && tabIds[0] ? tabById[tabIds[0]] : null)`.
  const Component = (() => null) as unknown as SidePanelTabComponent;
  let state = createInitialSidePanelTabHostState("right");
  state = applyTabInsertOrUpdate(
    state,
    buildTabFromOpenOptions({ tabId: "first", options: { Component }, dndIdGenerator: () => "dnd-1" }),
  );
  // activeTabId points at something missing
  state = { ...state, activeTabId: "ghost" };
  assertEqual(selectActiveTab(state, false), null, "panelOpen=false → no fallback");
  assertEqual(selectActiveTab(state, true)?.tabId, "first", "panelOpen=true → fall back to tabIds[0]");
}

function selectActiveTabReactKeyFormatsKindOrTabIdWithStateKey(): void {
  // codex line 76-82: `${kind ?? tabId}-${state?.key ?? null}`.
  const Component = (() => null) as unknown as SidePanelTabComponent;
  let state = createInitialSidePanelTabHostState("right");
  state = applyTabInsertOrUpdate(
    state,
    buildTabFromOpenOptions({
      tabId: "tab-1",
      options: { Component, kind: "diff" },
      dndIdGenerator: () => "dnd-1",
    }),
  );
  state = applyActivateTab(state, "tab-1", true);
  assertEqual(selectActiveTabReactKey(state), "diff-null", "no state slot → suffix 'null'");
  state = applySeedTabState(state, "tab-1", () => 0);
  assertEqual(selectActiveTabReactKey(state), "diff-0", "with state slot uses key");
  // tab without kind falls back to tabId
  state = applyTabInsertOrUpdate(
    state,
    buildTabFromOpenOptions({
      tabId: "tab-2",
      options: { Component },
      dndIdGenerator: () => "dnd-2",
    }),
  );
  state = applyActivateTab(state, "tab-2", true);
  assertEqual(selectActiveTabReactKey(state), "tab-2-null", "no kind → uses tabId");
}

function selectTabsReturnsTabIdsOrderProjectedToTabsById(): void {
  // codex line 63-67.
  const Component = (() => null) as unknown as SidePanelTabComponent;
  let state = createInitialSidePanelTabHostState("right");
  for (const id of ["a", "b"]) {
    state = applyTabInsertOrUpdate(
      state,
      buildTabFromOpenOptions({ tabId: id, options: { Component }, dndIdGenerator: () => `dnd-${id}` }),
    );
  }
  const ids = selectTabs(state).map((t) => t.tabId);
  assertDeepEqual(ids, ["a", "b"], "tabs projection matches tabIds order");
}

function sidePanelObscuresRightRailForVisibleHostTabs(): void {
  assertEqual(sidePanelObscuresRightRail(false, null), false, "closed side panel should not hide rail");
  assertEqual(sidePanelObscuresRightRail(true, null), true, "open empty side panel should hide rail");
  assertEqual(
    sidePanelObscuresRightRail(true, { tabId: "file:local:/tmp/a.ts", kind: "workspaceFile:local" }),
    true,
    "workspace file tab should hide rail",
  );
  assertEqual(
    sidePanelObscuresRightRail(true, { tabId: "sidechat:thread-1" }),
    false,
    "side chat tab should not hide rail",
  );
  assertEqual(
    sidePanelObscuresRightRail(true, { tabId: "background-agent:thread-1" }),
    false,
    "background agent tab should not hide rail",
  );
}

// ---------------------------------------------------------------------------
// controller (orchestrator + side effects)
// ---------------------------------------------------------------------------

function controllerOpenTabAutoGeneratesIdWhenAbsent(): void {
  // codex line 106, 340-346.
  const observer = makeObserver();
  let n = 0;
  const ctl = new SidePanelTabHostController({
    panelId: "right",
    observer,
    generateAutoTabId: () => `auto-${++n}`,
    generateDndId: () => "dnd-x",
  });
  const id = ctl.openTab({ Component: makeComponent("A") });
  assertEqual(id, "auto-1", "auto-generated id");
}

function controllerOpenTabReusesAutoIdForSameComponent(): void {
  const observer = makeObserver();
  let n = 0;
  const ctl = new SidePanelTabHostController({
    panelId: "right",
    observer,
    generateAutoTabId: () => `auto-${++n}`,
    generateDndId: () => "dnd-x",
  });
  const Component = makeComponent("A");
  const id1 = ctl.openTab({ Component });
  const id2 = ctl.openTab({ Component });
  assertEqual(id1, id2, "same Component → same auto id (replace semantics)");
  assertEqual(ctl.getTabs().length, 1, "still a single tab");
}

function controllerOpenTabSeedsAndPreservesDefaultState(): void {
  const ctl = makeController();
  ctl.openTab({ id: "t1", Component: makeComponent("A"), defaultState: () => "seed" });
  assertEqual(ctl.getSnapshot().tabStates["t1"]?.value, "seed", "defaultState seeded");
  // Mutate then re-open with another defaultState: state should NOT reset.
  ctl.setTabState<string>("t1", "dirty", "seed");
  ctl.openTab({ id: "t1", Component: makeComponent("A"), defaultState: () => "different" });
  assertEqual(ctl.getSnapshot().tabStates["t1"]?.value, "dirty", "re-open preserves existing state");
}

function controllerOpenTabEvictsCurrentPreviewWhenAddingNewPreview(): void {
  // codex `b()` line 161-168, fired from `v()` line 159.
  const observer = makeObserver();
  const ctl = new SidePanelTabHostController({ panelId: "right", observer });
  const onClose1 = makeSpy();
  ctl.openTab({ id: "preview-1", Component: makeComponent("A"), isPreview: true, onClose: onClose1.fn });
  ctl.openTab({ id: "preview-2", Component: makeComponent("B"), isPreview: true });
  assertEqual(onClose1.calls, 1, "first preview onClose fires when evicted");
  const ids = ctl.getTabs().map((t) => t.tabId);
  assertDeepEqual(ids, ["preview-2"], "only one preview tab present after eviction");
}

function controllerOpenTabDoesNotEvictPreviewWhenReOpeningSameTab(): void {
  const ctl = makeController();
  const onClose = makeSpy();
  ctl.openTab({ id: "preview-1", Component: makeComponent("A"), isPreview: true, onClose: onClose.fn });
  ctl.openTab({ id: "preview-1", Component: makeComponent("A"), isPreview: true, onClose: onClose.fn });
  assertEqual(onClose.calls, 0, "re-opening same preview is an update, not eviction");
}

function controllerOpenTabActivatesAndOpensPanelByDefault(): void {
  // codex line 139-144.
  const observer = makeObserver();
  const ctl = new SidePanelTabHostController({ panelId: "right", observer });
  const onActivate = makeSpy();
  ctl.openTab({ id: "t1", Component: makeComponent("A"), onActivate: onActivate.fn });
  assertEqual(ctl.getSnapshot().activeTabId, "t1", "tab activated");
  assertEqual(observer.lastOpen, true, "setPanelOpen(true) fired");
  assertEqual(onActivate.calls, 1, "onActivate invoked once");
}

function controllerOpenTabHonoursActivateFalse(): void {
  // codex line 85: `activate: i = true`.
  const observer = makeObserver();
  const ctl = new SidePanelTabHostController({ panelId: "right", observer });
  ctl.openTab({ id: "t1", Component: makeComponent("A"), activate: false });
  assertEqual(ctl.getSnapshot().activeTabId, null, "activate false → no active tab change");
  assertEqual(observer.openCalls, 0, "no setPanelOpen call");
}

function controllerOpenTabIsLabelForcesIsClosableFalse(): void {
  const ctl = makeController();
  ctl.openTab({ id: "label", Component: makeComponent("L"), isLabel: true });
  assertEqual(ctl.getSnapshot().tabsById["label"]?.isClosable, false, "label tab not closable");
}

function controllerCloseTabCancelsWhenOnBeforeCloseReturnsFalse(): void {
  // codex line 233.
  const ctl = makeController();
  const onBeforeClose = () => false;
  const onClose = makeSpy();
  ctl.openTab({
    id: "t1",
    Component: makeComponent("A"),
    onBeforeClose,
    onClose: onClose.fn,
  });
  ctl.closeTab("t1");
  assertEqual(ctl.getSnapshot().tabsById["t1"] != null, true, "tab still present");
  assertEqual(onClose.calls, 0, "onClose NOT fired");
}

function controllerCloseTabFiresOnCloseAndUpdatesPanelOpen(): void {
  // codex line 234, 236.
  const observer = makeObserver();
  const ctl = new SidePanelTabHostController({ panelId: "right", observer });
  const onClose = makeSpy();
  ctl.openTab({ id: "t1", Component: makeComponent("A"), onClose: onClose.fn });
  ctl.closeTab("t1");
  assertEqual(onClose.calls, 1, "onClose fired");
  assertEqual(observer.lastOpen, false, "setPanelOpen(false) fired when last tab closes");
}

function controllerCloseTabPicksNextActiveFromRecentlyClosed(): void {
  // codex line 238: `recentlyClosed[0] ?? S(remaining, origIdx)`.
  const ctl = makeController();
  ctl.openTab({ id: "a", Component: makeComponent("A") });
  ctl.openTab({ id: "b", Component: makeComponent("B") });
  ctl.openTab({ id: "c", Component: makeComponent("C") });
  // active is "c". recentlyClosed = [b, a] (activate of b pushed a, then c pushed b)
  assertDeepEqual(ctl.getSnapshot().recentlyClosedTabIds, ["b", "a"], "recentlyClosed seeded");
  ctl.closeTab("c");
  assertEqual(ctl.getSnapshot().activeTabId, "b", "next active = recentlyClosed[0] = b");
}

function controllerCloseTabPicksPreviousIndexWhenRecentlyClosedEmpty(): void {
  // codex line 238: `recentlyClosed[0] ?? S(remaining, origIdx)`.
  // `S` prefers remaining[origIdx-1] then remaining[origIdx] (line 309-311).
  const ctl = makeController();
  ctl.openTab({ id: "a", Component: makeComponent("A"), activate: false });
  ctl.openTab({ id: "b", Component: makeComponent("B"), activate: false });
  ctl.openTab({ id: "c", Component: makeComponent("C"), activate: false });
  // Manually activate "b" then close it without any other activates → recentlyClosed remains [].
  ctl.activateTab("b");
  ctl.closeTab("b");
  // origIdx of "b" was 1; remaining = ["a", "c"]; remaining[0] = "a".
  assertEqual(ctl.getSnapshot().activeTabId, "a", "next active = remaining[origIdx-1] = a");
}

function controllerCloseTabNoopWhenTabAbsent(): void {
  const ctl = makeController();
  ctl.closeTab("ghost"); // should not throw
  assertEqual(ctl.getSnapshot().tabIds.length, 0, "no tabs created");
}

function controllerActivateTabClearsWhenNull(): void {
  // codex line 170-172.
  const ctl = makeController();
  ctl.openTab({ id: "t1", Component: makeComponent("A") });
  ctl.activateTab(null);
  assertEqual(ctl.getSnapshot().activeTabId, null, "null clears active");
}

function controllerActivateTabIgnoresUnknownTabId(): void {
  // codex line 170-172: `n == null && t != null` short-circuits `L`.
  const ctl = makeController();
  ctl.activateTab("ghost");
  assertEqual(ctl.getSnapshot().activeTabId, null, "unknown id → no change");
}

function controllerActivateTabFiresOnActivateOnChange(): void {
  // codex line 256: `tab.onActivate?.(scope)`.
  const ctl = makeController();
  const onActivate = makeSpy();
  ctl.openTab({ id: "a", Component: makeComponent("A"), onActivate: onActivate.fn, activate: false });
  ctl.activateTab("a");
  assertEqual(onActivate.calls, 1, "onActivate fired once");
  // Activating same tab again is a noop and should NOT fire onActivate again.
  ctl.activateTab("a");
  assertEqual(onActivate.calls, 1, "no double-fire on same active");
}

function controllerCloseActiveTabGatedByPanelOpenAndIsClosable(): void {
  // codex line 246-248.
  const ctl = makeController();
  ctl.openTab({ id: "label", Component: makeComponent("L"), isLabel: true });
  assertEqual(ctl.closeActiveTab(true), false, "label tab not closable");
  assertEqual(ctl.closeActiveTab(false), false, "panel closed → false");
  ctl.openTab({ id: "t1", Component: makeComponent("A") });
  assertEqual(ctl.closeActiveTab(true), true, "closes when panel open and active is closable");
  assertEqual(ctl.getSnapshot().tabsById["t1"], undefined, "tab removed");
}

function controllerUpdateTabIsNoopWhenTabAbsent(): void {
  const ctl = makeController();
  ctl.updateTab("ghost", { title: "x" });
  assertEqual(ctl.getSnapshot().tabIds.length, 0, "missing tab → noop");
}

function controllerPinTabSetsPreviewFalse(): void {
  // codex line 240-241.
  const ctl = makeController();
  ctl.openTab({ id: "p", Component: makeComponent("A"), isPreview: true });
  ctl.pinTab("p");
  assertEqual(ctl.getSnapshot().tabsById["p"]?.isPreview, false, "pinned tab has isPreview false");
}

function controllerReorderTabMovesAhead(): void {
  // codex line 173-181.
  const ctl = makeController();
  ctl.openTab({ id: "a", Component: makeComponent("A") });
  ctl.openTab({ id: "b", Component: makeComponent("B") });
  ctl.openTab({ id: "c", Component: makeComponent("C") });
  ctl.reorderTab("c", "a");
  assertDeepEqual(ctl.getSnapshot().tabIds, ["c", "a", "b"], "c moved before a");
}

function controllerResetTabStateBumpsKey(): void {
  // codex line 262-265.
  const ctl = makeController();
  ctl.openTab({
    id: "t1",
    Component: makeComponent("A"),
    defaultState: () => 0,
  });
  ctl.setTabState<number>("t1", 7, 0);
  ctl.resetTabState("t1");
  assertEqual(ctl.getSnapshot().tabStates["t1"]?.key, 1, "key bumped");
  assertEqual(ctl.getSnapshot().tabStates["t1"]?.value, 0, "value reset to defaultState()");
}

function controllerSetTabStateUsesFallbackInitialAndShortCircuits(): void {
  // codex line 288-294.
  const ctl = makeController();
  ctl.openTab({ id: "t1", Component: makeComponent("A") });
  ctl.setTabState<string>("t1", "v1", "fallback");
  assertEqual(ctl.getSnapshot().tabStates["t1"]?.value, "v1", "set commits");
  // Set with identical value: state object reference should not change.
  const prevSnapshot = ctl.getSnapshot();
  ctl.setTabState<string>("t1", "v1", "fallback");
  assertEqual(ctl.getSnapshot(), prevSnapshot, "Object.is equal → snapshot unchanged");
}

function controllerSubscribeFanOutsOnEachCommit(): void {
  const ctl = makeController();
  let notifications = 0;
  const unsubscribe = ctl.subscribe(() => {
    notifications += 1;
  });
  ctl.openTab({ id: "t1", Component: makeComponent("A") });
  assertEqual(notifications, 1, "subscriber notified after openTab commit");
  ctl.activateTab("t1"); // already active, no commit
  assertEqual(notifications, 1, "no notification when state unchanged");
  ctl.openTab({ id: "t2", Component: makeComponent("B") });
  assertEqual(notifications, 2, "notification for second openTab");
  unsubscribe();
  ctl.openTab({ id: "t3", Component: makeComponent("C") });
  assertEqual(notifications, 2, "no notification after unsubscribe");
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeComponent(label: string): SidePanelTabComponent {
  const Component: SidePanelTabComponent = ({ tabId }) => createElement("div", { "data-tab-label": label }, tabId);
  Component.displayName = `TabComponent(${label})`;
  return Component;
}

interface ObserverSpy {
  openCalls: number;
  lastOpen: boolean | null;
  setPanelOpen(open: boolean): void;
}

function makeObserver(): ObserverSpy {
  const spy: ObserverSpy = {
    openCalls: 0,
    lastOpen: null,
    setPanelOpen(open: boolean) {
      spy.openCalls += 1;
      spy.lastOpen = open;
    },
  };
  return spy;
}

function makeController(): SidePanelTabHostController {
  let n = 0;
  let d = 0;
  return new SidePanelTabHostController({
    panelId: "right",
    observer: makeObserver(),
    generateAutoTabId: () => `auto-${++n}`,
    generateDndId: () => `dnd-${++d}`,
  });
}

interface Spy {
  calls: number;
  fn: () => void;
}

function makeSpy(): Spy {
  const spy: Spy = {
    calls: 0,
    fn: () => {
      spy.calls += 1;
    },
  };
  return spy;
}

function assertNotNull<T>(value: T | null | undefined, message: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
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
