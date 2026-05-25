import {
  applyActivateTab,
  applyCloseTab,
  applyEvictPreview,
  applyReorderTab,
  applyResetTabState,
  applySeedTabState,
  applySetTabState,
  applyTabInsertOrUpdate,
  applyUpdateTab,
  buildTabFromOpenOptions,
  createInitialSidePanelTabHostState,
  findPreviewTab,
  resolveTabId,
  selectActiveTab,
  selectActiveTabReactKey,
  selectTabs,
  type OpenTabOptions,
  type SidePanelId,
  type SidePanelTab,
  type SidePanelTabComponent,
  type SidePanelTabHostObserver,
  type SidePanelTabHostState,
  type TabId,
} from "./side-panel-tab-host";

/*
 * HiCodex port of Codex Desktop's tab controller, command-side wrapper.
 *
 * The pure state functions live in `side-panel-tab-host.ts`. This class wires
 * them up into the imperative API exposed by Codex's `x({...})` factory
 * (`/private/tmp/codex-asar/pretty/app-shell-tab-controller-B2eCi4Le.pretty.js:60-285`),
 * adds the side-effect orchestration (`onActivate` / `onClose` / `onBeforeClose`,
 * `setPanelOpen`, preview eviction), and exposes a `subscribe` + `getSnapshot`
 * surface that `useSyncExternalStore` can bind to.
 *
 * `panelOpen` is owned externally — Codex stores it in atoms `l`/`u` that the
 * controller mutates via the injected `setPanelOpen` callback (lines 141, 222,
 * 236). HiCodex matches that split via the `observer.setPanelOpen` hook so
 * the React shell can render the panel chrome.
 */
export interface SidePanelTabHostControllerOptions {
  readonly panelId: SidePanelId;
  readonly observer: SidePanelTabHostObserver;
  /**
   * Test seam for deterministic tab id generation. In production this is
   * `() => 'component:' + crypto.randomUUID()` — matching Codex `k()` at
   * `app-shell-tab-controller-B2eCi4Le.pretty.js:344`.
   */
  readonly generateAutoTabId?: () => string;
  /** Test seam for `dndId` (Codex line 118 `dndId: R?.dndId ?? C()`). */
  readonly generateDndId?: () => string;
}

export class SidePanelTabHostController {
  private state: SidePanelTabHostState;
  private readonly observer: SidePanelTabHostObserver;
  private readonly generateAutoTabId: () => string;
  private readonly generateDndId: () => string;
  /**
   * codex: `var O = new WeakMap()` (line 339) keyed by Component reference
   * for auto-generated `component:${UUID}` tab ids.
   */
  private readonly autoIdCache = new WeakMap<object, TabId>();
  private readonly subscribers = new Set<() => void>();

  constructor({ panelId, observer, generateAutoTabId, generateDndId }: SidePanelTabHostControllerOptions) {
    this.state = createInitialSidePanelTabHostState(panelId);
    this.observer = observer;
    this.generateAutoTabId = generateAutoTabId ?? defaultGenerateAutoTabId;
    this.generateDndId = generateDndId ?? defaultGenerateDndId;
  }

  // ---------------------------------------------------------------- snapshot

  getSnapshot(): SidePanelTabHostState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  // --------------------------------------------------------------- selectors

  /**
   * Convenience selectors that read the latest snapshot. Pass `panelOpen` to
   * get Codex's "fall back to first tab" behaviour (line 74: `panelOpen && tabIds[0]`).
   */
  getTabs(): readonly SidePanelTab[] {
    return selectTabs(this.state);
  }

  getActiveTab(panelOpen = false): SidePanelTab | null {
    return selectActiveTab(this.state, panelOpen);
  }

  getActiveTabReactKey(panelOpen = false): string | null {
    return selectActiveTabReactKey(this.state, panelOpen);
  }

  // ----------------------------------------------------------------- methods

  /**
   * codex: `openTab(scope, Component, options)` — `g(...)` at
   * `app-shell-tab-controller-B2eCi4Le.pretty.js:83-146`.
   *
   * Behaviour:
   *   1. Resolve tabId (explicit `id` ?? cache.get(Component) ?? `component:${UUID}`)
   *      — Codex line 106, 340-346.
   *   2. Seed per-tab state slot if absent and `defaultState` provided —
   *      Codex line 110, 114.
   *   3. If opening a NEW preview tab and a different preview is currently
   *      mounted, evict it first (fires onClose) — Codex line 159 (`v` calls
   *      `b()` when `i.isPreview && r == null`).
   *   4. Insert-or-update the tab in `tabsById` (existing pinned tab cannot
   *      be downgraded to preview) — Codex line 158.
   *   5. If `activate` (default true): activate the new tab + signal
   *      `setPanelOpen(true)` — Codex line 139-144.
   *   6. Return the resolved tabId.
   *
   * NOT ported here: `requestAnimationFrame(() => E(panelId, tabId))` (focus
   * via DOM query) at line 142-144 — DOM mutation belongs to the React
   * `useSidePanelTabHost` hook, not the controller.
   */
  openTab(options: OpenTabOptions): TabId {
    const tabId = resolveTabId(this.autoIdCache, options.Component, options.id, this.generateAutoTabId);
    const previous = this.state.tabsById[tabId];

    let nextState = applySeedTabState(this.state, tabId, options.defaultState);

    /*
     * codex: `b(scope)` (line 161-168) — evict current preview before
     * inserting a new preview. `b()` calls `F(scope, t)` which fires
     * `n.onClose?.()` (line 244).
     *
     * Conditions: only when the new tab is preview AND no existing tab with
     * the same tabId. (If the existing tab IS this preview, this is a re-open
     * and we skip eviction.)
     */
    if ((options.isPreview ?? false) && previous == null) {
      const currentPreview = findPreviewTab(nextState);
      if (currentPreview != null) {
        nextState = applyEvictPreview(nextState, currentPreview.tabId);
        currentPreview.onClose?.();
      }
    }

    const tab = buildTabFromOpenOptions({
      tabId,
      previous,
      options,
      dndIdGenerator: this.generateDndId,
    });
    nextState = applyTabInsertOrUpdate(nextState, tab);

    if (options.activate ?? true) {
      nextState = applyActivateTab(nextState, tabId, true);
    }

    this.commit(nextState);

    if (options.activate ?? true) {
      tab.onActivate?.();
      this.observer.setPanelOpen(true);
    }

    return tabId;
  }

  /**
   * codex: `closeTab(scope, t)` — `N(...)` at
   * `app-shell-tab-controller-B2eCi4Le.pretty.js:227-238`.
   *
   * Sequence (matches Codex):
   *   1. If tab missing → noop (Codex line 230 `if (r === -1) return`)
   *   2. Call `onBeforeClose`; if it returns false, cancel (line 233)
   *   3. Fire `F(scope, removed)` — `onClose?.()` + state cleanup (line 234)
   *   4. Remove tabId from list, drop state slot, prune recentlyClosed (235-237)
   *   5. If list empty → `setPanelOpen(false)` (line 236)
   *   6. If the removed tab was active, activate next pick:
   *      `recentlyClosed[0] ?? remaining[origIdx-1] ?? remaining[origIdx] ?? null`
   *      (line 238)
   */
  closeTab(tabId: TabId): void {
    const tab = this.state.tabsById[tabId];
    if (tab == null) return;
    if (tab.onBeforeClose?.() === false) return;

    const result = applyCloseTab(this.state, tabId);
    if (result == null) return;

    this.commit(result.state);

    // Side effects fire AFTER state commit so subscribers see the new shape.
    result.removedTab.onClose?.();
    if (result.panelShouldClose) {
      this.observer.setPanelOpen(false);
    }
    if (result.wasActive && result.nextActiveTabId != null) {
      this.state.tabsById[result.nextActiveTabId]?.onActivate?.();
    }
  }

  /**
   * codex: `activateTab(scope, t)` — `x(...)` at
   * `app-shell-tab-controller-B2eCi4Le.pretty.js:169-172`:
   *   `let n = t == null ? null : scope.get(scope.get(c, t));
   *    (t != null && n == null) || L(scope, t, true);`
   *
   * Translation: if `t == null`, always call `L` (clears active). If `t` is
   * given but doesn't exist in tabsById, **skip** (`(true && true) || ...`
   * short-circuits). Otherwise call `L`.
   */
  activateTab(tabId: TabId | null): void {
    if (tabId != null && this.state.tabsById[tabId] == null) return;
    const prevActiveId = this.state.activeTabId;
    const nextState = applyActivateTab(this.state, tabId, true);
    if (nextState === this.state) return;
    this.commit(nextState);
    if (tabId != null && prevActiveId !== tabId) {
      this.state.tabsById[tabId]?.onActivate?.();
    }
  }

  /**
   * codex: `closeActiveTab(scope)` — `I(...)` at
   * `app-shell-tab-controller-B2eCi4Le.pretty.js:246-248`:
   *   `let n = scope.get(p);
   *    return !scope.get(t) || n == null || !n.isClosable ? false : (N(scope, n.tabId), true)`
   *
   * Requires panel open, active tab present, and `isClosable: true`. Returns
   * whether the close went through.
   *
   * HiCodex caller passes `panelOpen` because the controller doesn't own that
   * atom (matches Codex's `t` = `panelOpen$` parameter from `x(...)`).
   */
  closeActiveTab(panelOpen: boolean): boolean {
    if (!panelOpen) return false;
    const active = this.getActiveTab(panelOpen);
    if (active == null || !active.isClosable) return false;
    this.closeTab(active.tabId);
    return true;
  }

  /**
   * codex: `updateTab(scope, t, n)` — `_(...)` at
   * `app-shell-tab-controller-B2eCi4Le.pretty.js:148-153`.
   */
  updateTab(tabId: TabId, updates: Partial<Omit<SidePanelTab, "tabId" | "dndId">>): void {
    const nextState = applyUpdateTab(this.state, tabId, updates);
    if (nextState === this.state) return;
    this.commit(nextState);
  }

  /**
   * codex: `pinTab(scope, t)` — `P(...)` at
   * `app-shell-tab-controller-B2eCi4Le.pretty.js:240-241`:
   *   `function P(e, t) { _(e, t, { isPreview: false }); }`
   */
  pinTab(tabId: TabId): void {
    this.updateTab(tabId, { isPreview: false });
  }

  /**
   * codex: `reorderTab(scope, sourceId, beforeId)` — `O(...)` at
   * `app-shell-tab-controller-B2eCi4Le.pretty.js:173-181`.
   */
  reorderTab(fromTabId: TabId, beforeTabId: TabId): void {
    const nextState = applyReorderTab(this.state, fromTabId, beforeTabId);
    if (nextState === this.state) return;
    this.commit(nextState);
  }

  /**
   * codex: `resetTabState(scope, t)` — `R(...)` at
   * `app-shell-tab-controller-B2eCi4Le.pretty.js:262-265`. Increments the
   * per-tab `key` (so React remounts via `activeTabReactKey`) and resets
   * `value` to `defaultState?.()` (or `null`).
   */
  resetTabState(tabId: TabId): void {
    const nextState = applyResetTabState(this.state, tabId);
    if (nextState === this.state) return;
    this.commit(nextState);
  }

  /**
   * codex: `setTabState` closure built per-tab by `B()` (line 286-307). The
   * Component receives a `setTabState` prop that calls this method.
   *
   * `fallbackInitial` is the seed value captured at `openTab` time
   * (Codex line 110 `let I = P?.value ?? T?.()`).
   */
  setTabState<TValue>(
    tabId: TabId,
    next: TValue | ((prev: TValue) => TValue),
    fallbackInitial: TValue,
  ): void {
    const nextState = applySetTabState(this.state, tabId, next, fallbackInitial);
    if (nextState === this.state) return;
    this.commit(nextState);
  }

  // ----------------------------------------------------------------- private

  private commit(next: SidePanelTabHostState): void {
    this.state = next;
    for (const listener of this.subscribers) listener();
  }
}

function defaultGenerateAutoTabId(): string {
  return `component:${randomUuid()}`;
}

function defaultGenerateDndId(): string {
  return `app-shell-tab:${++dndIdCounter}`;
}

let dndIdCounter = 0;

function randomUuid(): string {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  // Deterministic fallback for environments without crypto.randomUUID.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type { OpenTabOptions, SidePanelTab, SidePanelTabComponent, SidePanelTabHostState, TabId };
