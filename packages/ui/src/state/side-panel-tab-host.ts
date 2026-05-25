import type { ComponentType, ReactNode } from "react";

/*
 * HiCodex port of Codex Desktop's side-panel tab controller.
 *
 * Source of truth — `/private/tmp/codex-asar/pretty/app-shell-tab-controller-B2eCi4Le.pretty.js`
 * (a formatted dump of `app.asar`'s `app-shell-tab-controller-*.js` chunk).
 *
 * Codex's controller is built on Jotai atoms (`s = tabIds$`, `c = tabById$`,
 * `u = tabState$`, `d = activeTabId$`, `f = recentlyClosedTabIds$`, derived
 * `l = tabs$`, `p = activeTab$`, `h = activeTabReactKey$` — lines 61-82). It
 * exposes `openTab/closeTab/activateTab/updateTab/pinTab/reorderTab/
 * resetTabState/closeActiveTab/moveTabTo/receiveMovedTab` (lines 267-284).
 *
 * HiCodex does not run on Jotai. This module reimplements the controller as
 * a self-contained class with an immutable state snapshot + listener fan-out,
 * suitable for `useSyncExternalStore`. Each method that has Codex evidence is
 * annotated with the line range of its source counterpart so future ports can
 * be diffed against Codex without spelunking. Anything that ISN'T 1:1 with the
 * Codex source is called out in a comment.
 *
 * What we deliberately did NOT port (per "如果拿不到依据就不要做"):
 *   • DnD / dnd-kit integration (Codex line 339: `var O = new WeakMap()` and
 *     the `useDraggable` plumbing in `app-shell-Bh-lgoQk` are referenced but
 *     not fully traced; we keep `dndId` as a plain string slot so a future
 *     DnD layer can drop in)
 *   • Analytics event emission (lines 8-23 `f/p/m/h/g/_/v`) — events
 *     `codex_thread_side_panel_*` are Codex-specific and irrelevant here
 *   • `requestAnimationFrame` focus / scroll-into-view side effects (lines
 *     142-144, 258-260, 318-328) — DOM mutation belongs in the React layer,
 *     not the state controller
 *   • Cross-controller `moveTabTo` / `receiveMovedTab` (lines 173-226) —
 *     HiCodex starts with a single right-panel host; bottom-panel host can
 *     be added later, at which point we'll port the inter-controller bridge
 *   • `onMove` callback during cross-controller transfer (same reason)
 */

/**
 * codex: app-shell-tab-controller-B2eCi4Le.pretty.js:7
 *   `var d = { BROWSER: 'browser', DIFF: 'diff', MCP_APP: 'mcp-app', TIMELINE: 'timeline' }`
 * Files / Side chat / Terminal tabs intentionally have no kind in Codex —
 * they fall back to auto-generated `component:${UUID}` tabIds (see `k()` at
 * line 340-346). HiCodex mirrors that: the `kind` field is optional.
 */
export const TAB_KINDS = {
  browser: "browser",
  diff: "diff",
  mcpApp: "mcp-app",
  timeline: "timeline",
} as const;

export type TabKind = (typeof TAB_KINDS)[keyof typeof TAB_KINDS];

export type SidePanelId = "right" | "bottom";

export type TabId = string;

/**
 * Per-tab state slot. Mirrors Codex's `u` atom family payload shape
 * (`app-shell-tab-controller-B2eCi4Le.pretty.js:114, 265, 292`):
 *   `{ key: 0, value: <defaultState?.()> }`
 * `key` is incremented by `resetTabState` so React can use it to force-remount
 * the tab's `Component` (composed into `activeTabReactKey` at line 76-82).
 */
export interface SidePanelTabState<TValue = unknown> {
  readonly key: number;
  readonly value: TValue;
}

/**
 * Props the tab `Component` receives. Mirrors Codex's `B(...)` renderPanel
 * factory (`app-shell-tab-controller-B2eCi4Le.pretty.js:286-307`), where each
 * tab component is created with:
 *   `createElement(Component, {
 *     ...props,
 *     onClose,            // bound to closeTab
 *     tabId,
 *     isActive,
 *     tabState,           // current value
 *     setTabState,        // updater
 *   })`
 */
export interface SidePanelTabRenderProps<TValue = unknown> {
  readonly tabId: TabId;
  readonly isActive: boolean;
  readonly tabState: TValue;
  readonly setTabState: (next: TValue | ((prev: TValue) => TValue)) => void;
  readonly onClose: () => void;
}

/*
 * Loose typing on purpose. Codex's `B(...)` factory at
 * `app-shell-tab-controller-B2eCi4Le.pretty.js:286-307` builds each Component
 * invocation with `createElement(Component, { ...props, onClose, tabId, isActive,
 * tabState, setTabState })` — i.e. the consumer-supplied `props` slot is
 * merged with the controller-injected render slots. Each tab kind has its own
 * `props` shape, so a single typed contract across all tabs is impractical.
 * Consumers declare the Component with whichever subset of props they actually
 * read; ignored props are dropped at runtime.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SidePanelTabComponent = ComponentType<any>;

/**
 * Tab descriptor — the shape stored in `tabsById`. Field-by-field mirror of
 * the object built inside `v(t, {...})` at
 * `app-shell-tab-controller-B2eCi4Le.pretty.js:115-138`.
 */
export interface SidePanelTab {
  readonly tabId: TabId;
  readonly kind?: TabKind;
  readonly Component: SidePanelTabComponent;
  readonly title?: ReactNode;
  readonly tooltip?: string;
  readonly icon?: ReactNode;
  readonly highlightedIcon?: ReactNode;
  /** codex: line 121 `isClosable: !m && (f ?? true)` */
  readonly isClosable: boolean;
  readonly isLabel: boolean;
  readonly isPreview: boolean;
  readonly isHighlighted: boolean;
  readonly isShimmering: boolean;
  readonly contextMenuItems?: readonly SidePanelTabContextMenuItem[];
  readonly trailingContent?: ReactNode;
  readonly onActivate?: () => void;
  /** codex: line 233 `o?.onBeforeClose?.(e) === false` cancels close */
  readonly onBeforeClose?: () => boolean;
  readonly onClose?: () => void;
  readonly props: Readonly<Record<string, unknown>>;
  readonly defaultState?: () => unknown;
  /** codex: line 118 `dndId: R?.dndId ?? C()`. Stable per tab instance. */
  readonly dndId: string;
}

export interface SidePanelTabContextMenuItem {
  readonly id: string;
  readonly label: ReactNode;
  readonly onSelect: () => void;
  readonly destructive?: boolean;
  readonly disabled?: boolean;
}

/**
 * Options accepted by `openTab`. Aligns with the destructuring at
 * `app-shell-tab-controller-B2eCi4Le.pretty.js:84-105`.
 */
export interface OpenTabOptions<TValue = unknown> {
  /** Explicit tabId. If omitted, auto-generated as `component:${UUID}`. */
  readonly id?: TabId;
  readonly Component: SidePanelTabComponent;
  /** codex: line 85 `activate: i = true` */
  readonly activate?: boolean;
  readonly kind?: TabKind;
  readonly title?: ReactNode;
  readonly tooltip?: string;
  readonly icon?: ReactNode;
  readonly highlightedIcon?: ReactNode;
  readonly isClosable?: boolean;
  readonly isLabel?: boolean;
  readonly isPreview?: boolean;
  readonly isHighlighted?: boolean;
  readonly isShimmering?: boolean;
  readonly contextMenuItems?: readonly SidePanelTabContextMenuItem[];
  readonly trailingContent?: ReactNode;
  readonly onActivate?: () => void;
  readonly onBeforeClose?: () => boolean;
  readonly onClose?: () => void;
  readonly props?: Readonly<Record<string, unknown>>;
  readonly defaultState?: () => TValue;
}

export interface SidePanelTabHostState {
  readonly panelId: SidePanelId;
  /** codex: `s = tabIds$` (line 61). Ordered list, drives tab strip order. */
  readonly tabIds: readonly TabId[];
  /** codex: `c = tabById$` (line 62). Per-tab atom family in Codex. */
  readonly tabsById: Readonly<Record<TabId, SidePanelTab>>;
  /** codex: `u` (line 68). Per-tab `{ key, value }` slot. */
  readonly tabStates: Readonly<Record<TabId, SidePanelTabState>>;
  /** codex: `d = activeTabId$` (line 69) */
  readonly activeTabId: TabId | null;
  /** codex: `f = recentlyClosedTabIds$` (line 70). LRU of dismissed/passed-over ids. */
  readonly recentlyClosedTabIds: readonly TabId[];
}

export interface SidePanelTabHostObserver {
  /**
   * codex: `setPanelOpen` callback passed into `x({ ..., setPanelOpen: a })`
   * (line 60). Invoked by `openTab` (line 141) and `closeTab` (line 236) and
   * `receiveMovedTab` (line 222). The controller does NOT own the panel-open
   * atom; that's a sibling concern wired into the React shell.
   */
  setPanelOpen(open: boolean): void;
}

export function createInitialSidePanelTabHostState(panelId: SidePanelId): SidePanelTabHostState {
  return {
    panelId,
    tabIds: [],
    tabsById: {},
    tabStates: {},
    activeTabId: null,
    recentlyClosedTabIds: [],
  };
}

/**
 * codex: `p = activeTab$` derived atom (line 71-75):
 *   `n == null ? null : (tabById[n] ?? (panelOpen && tabIds[0] ? tabById[tabIds[0]] : null))`
 *
 * HiCodex split this: the controller does NOT know if the panel is open
 * (that's an external signal). Callers pass `panelOpen` when they want the
 * Codex-equivalent fallback to the first tab; otherwise this returns the
 * literal active tab or null.
 */
export function selectActiveTab(
  state: SidePanelTabHostState,
  panelOpen = false,
): SidePanelTab | null {
  if (state.activeTabId == null) return null;
  const explicit = state.tabsById[state.activeTabId];
  if (explicit != null) return explicit;
  if (panelOpen) {
    const firstId = state.tabIds[0];
    return firstId != null ? (state.tabsById[firstId] ?? null) : null;
  }
  return null;
}

/**
 * codex: `h = activeTabReactKey$` (line 76-82):
 *   `${kind ?? tabId}-${stateKey ?? null}`
 * Used as React `key` on the active tab's panel so `resetTabState` forces
 * a remount.
 */
export function selectActiveTabReactKey(
  state: SidePanelTabHostState,
  panelOpen = false,
): string | null {
  const tab = selectActiveTab(state, panelOpen);
  if (tab == null) return null;
  const tabState = state.tabStates[tab.tabId];
  return `${tab.kind ?? tab.tabId}-${tabState?.key ?? null}`;
}

/**
 * codex: `l = tabs$` derived atom (line 63-67):
 *   `tabIds.map(id => tabById[id]).filter(t => t != null)`
 */
export function selectTabs(state: SidePanelTabHostState): readonly SidePanelTab[] {
  const out: SidePanelTab[] = [];
  for (const id of state.tabIds) {
    const tab = state.tabsById[id];
    if (tab != null) out.push(tab);
  }
  return out;
}

/**
 * codex: `k(component, id)` (line 340-346):
 *   `return id ?? (cache.get(component) ?? cache.set(component, 'component:${uuid}'))`
 * The WeakMap keyed by Component reference means the same Component opened
 * twice without an explicit `id` collapses into the same tab (re-open replaces).
 * HiCodex keeps that exact semantics.
 */
export function resolveTabId(
  cache: WeakMap<object, TabId>,
  Component: SidePanelTabComponent,
  explicitId: TabId | undefined,
  generateId: () => TabId,
): TabId {
  if (explicitId != null) return explicitId;
  const cached = cache.get(Component as unknown as object);
  if (cached != null) return cached;
  const fresh = generateId();
  cache.set(Component as unknown as object, fresh);
  return fresh;
}

/**
 * codex: `S(arr, idx)` (line 309-311):
 *   `return arr[idx-1] ?? arr[idx] ?? null`
 * Selects the next active tab after a close: prefer the tab before the
 * closed position, then the tab now at that position (since the array has
 * already been spliced), then null.
 */
export function pickNextActiveTabAfterClose(
  remainingTabIds: readonly TabId[],
  closedOriginalIndex: number,
): TabId | null {
  return remainingTabIds[closedOriginalIndex - 1] ?? remainingTabIds[closedOriginalIndex] ?? null;
}

/**
 * codex: `w(scope, atom, remainingIds)` (line 315-317):
 *   `return scope.get(atom).filter(id => remainingIds.includes(id))`
 * Used by close paths to keep `recentlyClosedTabIds` in sync.
 */
export function pruneRecentlyClosed(
  recentlyClosed: readonly TabId[],
  remainingTabIds: readonly TabId[],
): readonly TabId[] {
  const remainingSet = new Set(remainingTabIds);
  return recentlyClosed.filter((id) => remainingSet.has(id));
}

interface BuildTabInput {
  readonly tabId: TabId;
  readonly previous?: SidePanelTab;
  readonly options: OpenTabOptions;
  readonly dndIdGenerator: () => string;
}

/**
 * codex: object assembled in `v(t, {...})` call inside `openTab` (line 115-138).
 * Field-for-field mirror; defaults match Codex's `r === void 0 ? ...` patterns.
 */
export function buildTabFromOpenOptions({
  tabId,
  previous,
  options,
  dndIdGenerator,
}: BuildTabInput): SidePanelTab {
  const isLabel = options.isLabel ?? false;
  const isClosable = !isLabel && (options.isClosable ?? true);
  return {
    tabId,
    ...(options.kind !== undefined ? { kind: options.kind } : {}),
    Component: options.Component,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(options.tooltip !== undefined ? { tooltip: options.tooltip } : {}),
    ...(options.icon !== undefined ? { icon: options.icon } : {}),
    ...(options.highlightedIcon !== undefined ? { highlightedIcon: options.highlightedIcon } : {}),
    isClosable,
    isLabel,
    isPreview: options.isPreview ?? false,
    isHighlighted: options.isHighlighted ?? false,
    isShimmering: options.isShimmering ?? false,
    ...(options.contextMenuItems !== undefined ? { contextMenuItems: options.contextMenuItems } : {}),
    ...(options.trailingContent !== undefined ? { trailingContent: options.trailingContent } : {}),
    ...(options.onActivate !== undefined ? { onActivate: options.onActivate } : {}),
    ...(options.onBeforeClose !== undefined ? { onBeforeClose: options.onBeforeClose } : {}),
    ...(options.onClose !== undefined ? { onClose: options.onClose } : {}),
    props: options.props ?? {},
    ...(options.defaultState !== undefined ? { defaultState: options.defaultState } : {}),
    dndId: previous?.dndId ?? dndIdGenerator(),
  };
}

/**
 * codex: `v(scope, tab)` (line 155-159):
 *   - merges new tab into atom (replace if exists, append id if new)
 *   - if `tab.isPreview && existing != null`, coerce preview flag to existing
 *   - if `tab.isPreview && existing == null`, call `b()` to evict current preview first
 * `v()` itself doesn't evict — eviction is in `openTab` (which calls `b()`).
 * Here we split: `applyTabInsertOrUpdate` is the merge step (no eviction).
 */
export function applyTabInsertOrUpdate(
  state: SidePanelTabHostState,
  tab: SidePanelTab,
): SidePanelTabHostState {
  const existing = state.tabsById[tab.tabId];
  /*
   * codex: `i = t.isPreview && r != null ? { ...t, isPreview: r.isPreview } : t`
   * (line 158) — opening an existing tab "as preview" doesn't downgrade a
   * pinned tab back to preview.
   */
  const merged: SidePanelTab = existing != null && tab.isPreview && !existing.isPreview
    ? { ...tab, isPreview: false }
    : tab;
  const nextTabsById = { ...state.tabsById, [tab.tabId]: merged };
  const nextTabIds = existing == null ? [...state.tabIds, tab.tabId] : state.tabIds;
  return { ...state, tabsById: nextTabsById, tabIds: nextTabIds };
}

/**
 * codex: `b(scope)` (line 161-168) — silently evicts the current preview tab
 * before opening a new one. Triggers `F(scope, t)` which fires onClose
 * (`n.onClose?.()`, line 244). Returns the evicted tab so the caller can
 * complete the side-effect chain in the controller.
 */
export function findPreviewTab(state: SidePanelTabHostState): SidePanelTab | null {
  for (const id of state.tabIds) {
    const tab = state.tabsById[id];
    if (tab?.isPreview) return tab;
  }
  return null;
}

export function applyEvictPreview(
  state: SidePanelTabHostState,
  previewTabId: TabId,
): SidePanelTabHostState {
  const { [previewTabId]: _evictedTab, ...restTabsById } = state.tabsById;
  const { [previewTabId]: _evictedState, ...restTabStates } = state.tabStates;
  return {
    ...state,
    tabsById: restTabsById,
    tabStates: restTabStates,
    tabIds: state.tabIds.filter((id) => id !== previewTabId),
    recentlyClosedTabIds: state.recentlyClosedTabIds.filter((id) => id !== previewTabId),
  };
}

/**
 * codex: per-tab state seed at `openTab` (line 110, 114):
 *   `let I = P?.value ?? T?.();`
 *   `P == null && T != null && t.set(N, { key: 0, value: I });`
 * Only seeds when there's no existing state slot AND a defaultState fn was
 * provided. Existing state is preserved across re-opens.
 */
export function applySeedTabState(
  state: SidePanelTabHostState,
  tabId: TabId,
  defaultState: (() => unknown) | undefined,
): SidePanelTabHostState {
  if (defaultState == null) return state;
  if (state.tabStates[tabId] != null) return state;
  return {
    ...state,
    tabStates: { ...state.tabStates, [tabId]: { key: 0, value: defaultState() } },
  };
}

/**
 * codex: `L(scope, n, r)` (line 250-260):
 *   - `r && i !== n` → push old active id (if any) onto recentlyClosed and
 *     prune duplicates of i and n
 *   - set activeTabId = n
 * Side-effects (`onActivate`, analytics `m()`, RAF scroll `T()`) are NOT in
 * this reducer slice — they belong to the controller.
 */
export function applyActivateTab(
  state: SidePanelTabHostState,
  tabId: TabId | null,
  updateRecentlyClosed: boolean,
): SidePanelTabHostState {
  const prevActiveId = state.activeTabId;
  if (prevActiveId === tabId) return state;
  let recentlyClosedTabIds = state.recentlyClosedTabIds;
  if (updateRecentlyClosed) {
    const prefix = prevActiveId == null ? [] : [prevActiveId];
    recentlyClosedTabIds = [
      ...prefix,
      ...state.recentlyClosedTabIds.filter((id) => id !== prevActiveId && id !== tabId),
    ];
  }
  return { ...state, activeTabId: tabId, recentlyClosedTabIds };
}

/**
 * codex: `N(scope, t)` (line 227-238) — the state-mutation half of closeTab.
 * The side-effect half (`onBeforeClose` cancel check, `F` → onClose firing,
 * `setPanelOpen(false)` when last tab closes, follow-on `L` activation) is
 * orchestrated by the controller.
 *
 * Inputs:
 *   - `tabId` to remove
 * Returns the new state if removable, `null` if `tabId` doesn't exist.
 */
export interface CloseTabReducerResult {
  readonly state: SidePanelTabHostState;
  /** codex line 236: `l.length === 0 && a(e, false)` */
  readonly panelShouldClose: boolean;
  /** codex line 238: next active id picked via `recentlyClosed[0] ?? S(remaining, originalIndex)` */
  readonly nextActiveTabId: TabId | null;
  readonly removedTab: SidePanelTab;
  readonly wasActive: boolean;
}

export function applyCloseTab(
  state: SidePanelTabHostState,
  tabId: TabId,
): CloseTabReducerResult | null {
  const originalIndex = state.tabIds.indexOf(tabId);
  if (originalIndex === -1) return null;
  const removed = state.tabsById[tabId];
  if (removed == null) return null;
  const remainingTabIds = state.tabIds.filter((id) => id !== tabId);
  const { [tabId]: _t, ...nextTabsById } = state.tabsById;
  const { [tabId]: _s, ...nextTabStates } = state.tabStates;
  const nextRecentlyClosed = pruneRecentlyClosed(state.recentlyClosedTabIds, remainingTabIds);
  const wasActive = state.activeTabId === tabId;
  const nextActiveTabId = wasActive
    ? (nextRecentlyClosed[0] ?? pickNextActiveTabAfterClose(remainingTabIds, originalIndex))
    : state.activeTabId;
  let nextState: SidePanelTabHostState = {
    ...state,
    tabsById: nextTabsById,
    tabStates: nextTabStates,
    tabIds: remainingTabIds,
    recentlyClosedTabIds: nextRecentlyClosed,
  };
  if (wasActive) {
    nextState = applyActivateTab(nextState, nextActiveTabId, false);
  }
  return {
    state: nextState,
    panelShouldClose: remainingTabIds.length === 0,
    nextActiveTabId,
    removedTab: removed,
    wasActive,
  };
}

/**
 * codex: `_(scope, t, n)` (line 148-153):
 *   - if tab doesn't exist → noop
 *   - if updating to preview but current isn't preview → coerce `isPreview` to false
 *   - merge fields onto existing tab
 */
export function applyUpdateTab(
  state: SidePanelTabHostState,
  tabId: TabId,
  updates: Partial<Omit<SidePanelTab, "tabId" | "dndId">>,
): SidePanelTabHostState {
  const existing = state.tabsById[tabId];
  if (existing == null) return state;
  const coerced = updates.isPreview === true && !existing.isPreview
    ? { ...updates, isPreview: false }
    : updates;
  return {
    ...state,
    tabsById: { ...state.tabsById, [tabId]: { ...existing, ...coerced } },
  };
}

/**
 * codex: `O(scope, sourceId, beforeId)` (line 173-181):
 *   moves the tab with id `sourceId` so that it ends up at the index where
 *   `beforeId` currently sits.
 */
export function applyReorderTab(
  state: SidePanelTabHostState,
  fromTabId: TabId,
  beforeTabId: TabId,
): SidePanelTabHostState {
  const fromIdx = state.tabIds.indexOf(fromTabId);
  const beforeIdx = state.tabIds.indexOf(beforeTabId);
  if (fromIdx === -1 || beforeIdx === -1 || fromIdx === beforeIdx) return state;
  const next = [...state.tabIds];
  const [moved] = next.splice(fromIdx, 1);
  if (moved == null) return state;
  next.splice(beforeIdx, 0, moved);
  return { ...state, tabIds: next };
}

/**
 * codex: `R(scope, t)` (line 262-265):
 *   `let n = scope.get(scope.get(c, t)),`        // tab
 *   `    r = scope.get(u, t);`                   // state slot
 *   `scope.set(r, e => ({ key: (e?.key ?? 0) + 1, value: n?.defaultState?.() ?? null }))`
 * Increments the React-remount key and resets value to whatever `defaultState`
 * returns now (or null).
 */
export function applyResetTabState(
  state: SidePanelTabHostState,
  tabId: TabId,
): SidePanelTabHostState {
  const tab = state.tabsById[tabId];
  if (tab == null) return state;
  const prev = state.tabStates[tabId];
  return {
    ...state,
    tabStates: {
      ...state.tabStates,
      [tabId]: { key: (prev?.key ?? 0) + 1, value: tab.defaultState?.() ?? null },
    },
  };
}

/**
 * codex: `setTabState` closure built in `B(...)` (line 288-294):
 *   `let o = (t) => scope.set(slot, e => {
 *      let n = e == null ? i : e.value,
 *          r = typeof t == 'function' ? t(n) : t;
 *      return Object.is(r, n) ? e : { key: e?.key ?? 0, value: r };
 *    });`
 * If the next value is `Object.is`-equal to the current value, no-op (no
 * state change, no remount key bump). This is a critical perf invariant.
 */
export function applySetTabState<TValue>(
  state: SidePanelTabHostState,
  tabId: TabId,
  next: TValue | ((prev: TValue) => TValue),
  fallbackInitial: TValue,
): SidePanelTabHostState {
  const prev = state.tabStates[tabId];
  const prevValue = (prev?.value ?? fallbackInitial) as TValue;
  const resolved = typeof next === "function"
    ? (next as (p: TValue) => TValue)(prevValue)
    : next;
  if (Object.is(resolved, prevValue)) return state;
  return {
    ...state,
    tabStates: {
      ...state.tabStates,
      [tabId]: { key: prev?.key ?? 0, value: resolved },
    },
  };
}
