import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";

import type { ScrollToUnitKey } from "../components/conversation-virtual-turn-list";
import type { CommandPanelState } from "../state/command-panel";
import type { SettingsPanelId } from "../state/composer-workflow";
import type { ConversationRenderUnit } from "../state/render-groups";
import {
  applyThreadFindMarksForQuery,
  clampThreadFindIndex,
  clearThreadFindMarks,
  collectThreadFindUnitsFromConversation,
  findThreadFindMatches,
  nextThreadFindIndex,
  scrollThreadFindMatchIntoView,
  type ThreadFindMatch,
} from "../state/thread-find";

/*
 * ⌘F in-conversation find. Matches are computed from STATE (conversation
 * render units), not the DOM — the turn list is virtualized, so the DOM only
 * ever contains the mounted window and a DOM-driven match set would silently
 * miss most of a long conversation (Desktop's local-conversation-thread-*.js
 * equally computes matches in state and lets the virtual list navigate).
 * The DOM is used for two things only: marking the mounted subset (offsets
 * re-derived per mounted unit) and fine-scrolling to a mounted match.
 * Navigation to unmounted matches goes through `scrollToUnitKeyRef`, the
 * virtual list's imperative jump.
 */
export function useThreadFind({
  setCommandPanel,
  setActiveSettingsPanel,
  activeThreadScrollKey,
  conversationUnits,
  scrollToUnitKeyRef,
}: {
  setCommandPanel: Dispatch<SetStateAction<CommandPanelState | null>>;
  setActiveSettingsPanel: Dispatch<SetStateAction<SettingsPanelId | null>>;
  activeThreadScrollKey: string;
  conversationUnits: ConversationRenderUnit[];
  scrollToUnitKeyRef?: RefObject<ScrollToUnitKey | null>;
}): {
  threadFindOpen: boolean;
  threadFindQuery: string;
  setThreadFindQuery: Dispatch<SetStateAction<string>>;
  threadFindFocusToken: number;
  visibleThreadFindIndex: number;
  activeThreadFindMatches: ThreadFindMatch[];
  openThreadFindBar: () => void;
  closeThreadFindBar: () => void;
  goToThreadFindMatch: (direction: 1 | -1) => void;
} {
  const [threadFindOpen, setThreadFindOpen] = useState(false);
  const [threadFindQuery, setThreadFindQuery] = useState("");
  const [threadFindIndex, setThreadFindIndex] = useState(0);
  const [threadFindFocusToken, setThreadFindFocusToken] = useState(0);
  const [threadFindResult, setThreadFindResult] = useState<{ query: string; matches: ThreadFindMatch[] }>({
    query: "",
    matches: [],
  });
  const previousThreadFindQueryRef = useRef("");

  const activeThreadFindMatches = useMemo(
    () => (threadFindResult.query === threadFindQuery ? threadFindResult.matches : []),
    [threadFindQuery, threadFindResult],
  );
  const visibleThreadFindIndex = clampThreadFindIndex(threadFindIndex, activeThreadFindMatches.length);
  const activeThreadFindMatch = activeThreadFindMatches[visibleThreadFindIndex] ?? null;
  const openThreadFindBar = useCallback(() => {
    setCommandPanel(null);
    setActiveSettingsPanel(null);
    setThreadFindOpen(true);
    setThreadFindFocusToken((current) => current + 1);
  }, [setActiveSettingsPanel, setCommandPanel]);
  const closeThreadFindBar = useCallback(() => {
    setThreadFindOpen(false);
  }, []);
  const goToThreadFindMatch = useCallback((direction: 1 | -1) => {
    setThreadFindIndex((current) => nextThreadFindIndex(current, activeThreadFindMatches.length, direction));
  }, [activeThreadFindMatches.length]);
  useEffect(() => {
    if (!threadFindOpen) return;
    const matches = findThreadFindMatches(
      collectThreadFindUnitsFromConversation(conversationUnits),
      threadFindQuery,
    );
    const queryChanged = previousThreadFindQueryRef.current !== threadFindQuery;
    previousThreadFindQueryRef.current = threadFindQuery;
    setThreadFindResult({ query: threadFindQuery, matches });
    setThreadFindIndex((current) => queryChanged ? 0 : clampThreadFindIndex(current, matches.length));
  }, [activeThreadScrollKey, conversationUnits, threadFindOpen, threadFindQuery]);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.querySelector<HTMLElement>("[data-thread-find-target='conversation']");
    if (!root) return;
    if (!threadFindOpen) {
      clearThreadFindMarks(root);
      return;
    }
    const current = activeThreadFindMatch
      ? { unitKey: activeThreadFindMatch.unitKey, matchIndex: activeThreadFindMatch.matchIndex }
      : null;
    const applyMarks = () => applyThreadFindMarksForQuery(root, threadFindQuery, current);
    let cancelled = false;
    let retryHandle = 0;
    applyMarks();
    if (activeThreadFindMatch && !scrollThreadFindMatchIntoView(activeThreadFindMatch, root)) {
      // Match is outside the virtualized window: jump via the turn list, then
      // retry the precise scroll for a few frames while the row mounts.
      if (scrollToUnitKeyRef?.current?.(activeThreadFindMatch.unitKey)) {
        let attempts = 0;
        const retry = () => {
          if (cancelled) return;
          applyMarks();
          if (scrollThreadFindMatchIntoView(activeThreadFindMatch, root)) return;
          attempts += 1;
          if (attempts < 20) retryHandle = requestAnimationFrame(retry);
        };
        retryHandle = requestAnimationFrame(retry);
      }
    }
    // Keep marks in sync while scrolling mounts/unmounts virtual rows under
    // the open find bar.
    const scrollHost = root.closest<HTMLElement>(".hc-thread-scroll-container") ?? root;
    let scrollHandle = 0;
    const onScroll = () => {
      cancelAnimationFrame(scrollHandle);
      scrollHandle = requestAnimationFrame(() => {
        if (!cancelled) applyMarks();
      });
    };
    scrollHost.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelled = true;
      cancelAnimationFrame(retryHandle);
      cancelAnimationFrame(scrollHandle);
      scrollHost.removeEventListener("scroll", onScroll);
      clearThreadFindMarks(root);
    };
  }, [activeThreadFindMatch, activeThreadFindMatches, scrollToUnitKeyRef, threadFindOpen, threadFindQuery]);
  useEffect(() => {
    if (!threadFindOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeThreadFindBar();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeThreadFindBar, threadFindOpen]);

  return {
    threadFindOpen,
    threadFindQuery,
    setThreadFindQuery,
    threadFindFocusToken,
    visibleThreadFindIndex,
    activeThreadFindMatches,
    openThreadFindBar,
    closeThreadFindBar,
    goToThreadFindMatch,
  };
}
