import { useCallback, useState } from "react";
import type { Thread } from "@forge/codex-protocol";

import { browserStorage } from "../state/app-shell-helpers";
import { loadPinnedThreadIds, savePinnedThreadIds, updatePinnedThreadIds } from "../state/thread-pins";

/*
 * Pinned-thread set + persistence, lifted verbatim out of ForgeApp. The set is
 * seeded from browserStorage on mount; setThreadPinnedById writes through to
 * storage on every change. Self-contained — only depends on the thread-pins
 * helpers, so it needs no params.
 */
export function useThreadPins(): {
  pinnedThreadIds: Set<string>;
  setThreadPinnedById: (threadId: string, pinned: boolean) => void;
  toggleThreadPinned: (thread: Thread, pinned: boolean) => void;
} {
  const [pinnedThreadIds, setPinnedThreadIds] = useState<Set<string>>(() => loadPinnedThreadIds(browserStorage()));
  const setThreadPinnedById = useCallback((threadId: string, pinned: boolean) => {
    setPinnedThreadIds((current) => {
      const next = updatePinnedThreadIds(current, threadId, pinned);
      savePinnedThreadIds(browserStorage(), next);
      return next;
    });
  }, []);
  const toggleThreadPinned = useCallback((thread: Thread, pinned: boolean) => {
    setThreadPinnedById(thread.id, pinned);
  }, [setThreadPinnedById]);
  return { pinnedThreadIds, setThreadPinnedById, toggleThreadPinned };
}
