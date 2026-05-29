import { useCallback, useEffect, useState } from "react";

/* codex: local-conversation-thread-*.js — atomFamily collapse state.
 * Desktop backs each RailSection's collapse boolean with a Jotai atomFamily
 * keyed by sectionId, so collapsing/expanding a
 * section persists across unmount/remount within the running session (and is
 * not written to localStorage). HiCodex reproduces the same semantics with a
 * module-level Map plus a tiny pub/sub so multiple instances of the same
 * section key stay in sync without pulling in a state library. */
const COLLAPSE_STATE = new Map<string, boolean>();
const LISTENERS = new Map<string, Set<() => void>>();

function notify(key: string): void {
  const set = LISTENERS.get(key);
  if (!set) return;
  for (const fn of set) fn();
}

export function useSectionCollapse(
  key: string,
  defaultCollapsed: boolean,
): [boolean, (next: boolean) => void] {
  // 初次读 module map，没有则用 defaultCollapsed 初始化（不写回 map，
  // 保持调用方 defaultCollapsed 仍能在用户未交互前响应变化，例如 plan 状态翻转）。
  const initial = COLLAPSE_STATE.get(key) ?? defaultCollapsed;
  const [, force] = useState({});
  useEffect(() => {
    let listeners = LISTENERS.get(key);
    if (!listeners) {
      listeners = new Set();
      LISTENERS.set(key, listeners);
    }
    const onChange = () => force({});
    listeners.add(onChange);
    return () => {
      listeners?.delete(onChange);
    };
  }, [key]);
  const setCollapsed = useCallback((next: boolean) => {
    COLLAPSE_STATE.set(key, next);
    notify(key);
  }, [key]);
  return [initial, setCollapsed];
}

/**
 * Test-only helper to reset the module-level collapse map. Production code
 * never needs this — the map intentionally outlives RailSection instances —
 * but unit tests that exercise default-collapsed assertions need a clean slate
 * between cases so prior tests do not bleed state into later ones.
 */
export function __resetSectionCollapseStateForTesting(): void {
  COLLAPSE_STATE.clear();
}
