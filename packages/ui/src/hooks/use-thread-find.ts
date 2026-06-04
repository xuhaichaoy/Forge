import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { CommandPanelState } from "../state/command-panel";
import type { SettingsPanelId } from "../state/composer-workflow";
import type { ConversationRenderUnit } from "../state/render-groups";
import {
  applyThreadFindMarks,
  clampThreadFindIndex,
  clearThreadFindMarks,
  collectThreadFindUnitsFromDom,
  findThreadFindMatches,
  nextThreadFindIndex,
  scrollThreadFindMatchIntoView,
  type ThreadFindMatch,
} from "../state/thread-find";

/*
 * ⌘F in-conversation find, lifted verbatim out of HiCodexApp. Three effects
 * (recompute matches from the live DOM, apply/scroll marks, Escape-to-close)
 * plus the open/close/next-prev callbacks. The `[data-thread-find-target=
 * 'conversation']` selector, every dep array, and openThreadFindBar's
 * setCommandPanel(null)+setActiveSettingsPanel(null) mutual-exclusion order are
 * contract-exact. `conversationUnits` (= conversation.units) and
 * `activeThreadScrollKey` are passed in only as recompute triggers.
 */
export function useThreadFind({
  setCommandPanel,
  setActiveSettingsPanel,
  activeThreadScrollKey,
  conversationUnits,
}: {
  setCommandPanel: Dispatch<SetStateAction<CommandPanelState | null>>;
  setActiveSettingsPanel: Dispatch<SetStateAction<SettingsPanelId | null>>;
  activeThreadScrollKey: string;
  conversationUnits: ConversationRenderUnit[];
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
  }, []);
  const closeThreadFindBar = useCallback(() => {
    setThreadFindOpen(false);
  }, []);
  const goToThreadFindMatch = useCallback((direction: 1 | -1) => {
    setThreadFindIndex((current) => nextThreadFindIndex(current, activeThreadFindMatches.length, direction));
  }, [activeThreadFindMatches.length]);
  useEffect(() => {
    if (!threadFindOpen || typeof document === "undefined") return;
    const root = document.querySelector<HTMLElement>("[data-thread-find-target='conversation']");
    if (!root) {
      setThreadFindResult({ query: threadFindQuery, matches: [] });
      return;
    }
    clearThreadFindMarks(root);
    const matches = findThreadFindMatches(collectThreadFindUnitsFromDom(root), threadFindQuery);
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
    applyThreadFindMarks(root, activeThreadFindMatches, activeThreadFindMatch?.id ?? null);
    if (activeThreadFindMatch) scrollThreadFindMatchIntoView(activeThreadFindMatch, root);
    return () => clearThreadFindMarks(root);
  }, [activeThreadFindMatch, activeThreadFindMatches, threadFindOpen]);
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
