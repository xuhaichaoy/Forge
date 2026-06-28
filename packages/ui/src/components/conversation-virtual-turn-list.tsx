import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MutableRefObject, ReactNode } from "react";
import {
  useThreadScrollController,
} from "./thread-scroll-layout";
import {
  setThreadScrollDistanceFromBottom,
  threadScrollDistanceFromBottom,
} from "../state/thread-scroll";
import { groupUnitsByTurn } from "../state/turn-collapse-projection";
import {
  DESKTOP_STICKY_BOTTOM_THRESHOLD_PX,
  DESKTOP_TURN_ESTIMATED_HEIGHT_PX,
  DESKTOP_TURN_GAP_PX,
  turnBottomDistanceFromBottom,
  turnHeightByKey,
  turnKeyForGroup,
  turnKeysForGroups,
  turnOffsetsByKey,
  virtualTurnRange,
  virtualTurnRangeFromBottom,
  type VirtualTurnRange,
} from "../state/conversation-virtual-turns";

export type ScrollToUnitKeyRef = MutableRefObject<((unitKey: string) => boolean) | null>;

export function VirtualizedTurnList({
  additionalScrollToUnitKeyRef,
  groups,
  renderGroup,
  scrollToUnitKeyRef,
}: {
  additionalScrollToUnitKeyRef?: ScrollToUnitKeyRef;
  groups: ReturnType<typeof groupUnitsByTurn>;
  renderGroup: (group: ReturnType<typeof groupUnitsByTurn>[number], index: number) => ReactNode;
  scrollToUnitKeyRef?: ScrollToUnitKeyRef;
}) {
  const scrollController = useThreadScrollController();
  const listRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const rowObserversRef = useRef(new Map<string, ResizeObserver>());
  const rowHeightsRef = useRef(new Map<string, number>());
  const [scrollState, setScrollState] = useState({ distanceFromBottom: 0, viewportHeight: 900 });
  const [heightVersion, setHeightVersion] = useState(0);
  const count = groups.length;
  const turnKeys = useMemo(() => turnKeysForGroups(groups), [groups]);

  useLayoutEffect(() => {
    const scrollElement = scrollController?.getScrollElement() ?? conversationScrollElement(listRef.current);
    if (!scrollElement) return;
    /*
     * Always measure the real DOM. Controller broadcasts announce the TARGET
     * distance before the viewport moves (scrollToDistanceFromBottom fires
     * listeners right after starting a smooth scroll). Windowing on that
     * announced 0 unmounts the rows under the still-unmoved viewport into a
     * blank spacer, and that same-frame layout jolt can cancel the smooth
     * scroll before it moves — no scroll event ever arrives to correct the
     * window, leaving the conversation permanently blank.
     */
    const measure = () => {
      const bottomDistance = threadScrollDistanceFromBottom(scrollElement);
      stickToBottomRef.current = bottomDistance <= DESKTOP_STICKY_BOTTOM_THRESHOLD_PX;
      const viewportHeight = scrollElement.clientHeight || 900;
      setScrollState((current) => (
        current.distanceFromBottom === bottomDistance && current.viewportHeight === viewportHeight
          ? current
          : { distanceFromBottom: bottomDistance, viewportHeight }
      ));
    };
    const handleScroll = () => measure();
    const handleResize = () => measure();
    measure();
    const removeControllerListener = scrollController?.addScrollListener(measure);
    if (!scrollController) scrollElement.addEventListener("scroll", handleScroll, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(handleResize);
    observer?.observe(scrollElement);
    return () => {
      removeControllerListener?.();
      if (!scrollController) scrollElement.removeEventListener("scroll", handleScroll);
      observer?.disconnect();
    };
  }, [count, scrollController]);

  useLayoutEffect(() => {
    if (!stickToBottomRef.current) return;
    if (scrollController) {
      scrollController.scrollToDistanceFromBottomPx(0, "instant");
      return;
    }
    const scrollElement = conversationScrollElement(listRef.current);
    if (scrollElement) setThreadScrollDistanceFromBottom(scrollElement, 0);
  }, [count, heightVersion, scrollController]);

  useEffect(() => {
    const liveKeys = new Set(turnKeys);
    for (const [key, observer] of rowObserversRef.current) {
      if (!liveKeys.has(key)) {
        observer.disconnect();
        rowObserversRef.current.delete(key);
        rowHeightsRef.current.delete(key);
      }
    }
    setHeightVersion((version) => version + 1);
  }, [turnKeys]);

  useEffect(() => () => {
    for (const observer of rowObserversRef.current.values()) observer.disconnect();
    rowObserversRef.current.clear();
  }, []);

  const observeRow = useCallback((turnKey: string, index: number, element: HTMLDivElement | null) => {
    rowObserversRef.current.get(turnKey)?.disconnect();
    rowObserversRef.current.delete(turnKey);
    if (!element) return;

    const updateHeight = () => {
      const height = element.getBoundingClientRect().height;
      if (!Number.isFinite(height) || height <= 0) return;
      const previous = rowHeightsRef.current.get(turnKey);
      if (previous != null && Math.abs(previous - height) < 1) return;
      const turnBottomDistance = turnBottomDistanceFromBottom(turnKeys, rowHeightsRef.current, index);
      rowHeightsRef.current.set(turnKey, height);
      if (previous != null) {
        scrollController?.adjustForMeasuredTurnHeightDelta({
          heightDeltaPx: height - previous,
          turnBottomDistanceFromBottomPx: turnBottomDistance,
          viewportDistanceFromBottomPx: scrollController.getLastScrollDistanceFromBottomPx(),
        });
      }
      setHeightVersion((version) => version + 1);
    };
    updateHeight();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    rowObserversRef.current.set(turnKey, observer);
  }, [scrollController, turnKeys]);

  /*
   * Verify-after-commit: spacer/row height corrections change scrollHeight
   * without firing a scroll event (the browser may even clamp scrollTop
   * silently), so the window can be computed for a distance the painted DOM
   * no longer has — visible as blank space until the next manual scroll.
   * Re-measure whenever the committed DOM disagrees with the windowing input;
   * converges as soon as they agree.
   */
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- 故意不带依赖数组：每次 commit 后校验真实 DOM 滚动距离与窗口输入是否一致，±1px 早退守卫保证收敛（见上方 Verify-after-commit 注释）
  useLayoutEffect(() => {
    const scrollElement = scrollController?.getScrollElement() ?? conversationScrollElement(listRef.current);
    if (!scrollElement) return;
    const real = threadScrollDistanceFromBottom(scrollElement);
    if (Math.abs(real - scrollState.distanceFromBottom) <= 1) return;
    stickToBottomRef.current = real <= DESKTOP_STICKY_BOTTOM_THRESHOLD_PX;
    setScrollState({ distanceFromBottom: real, viewportHeight: scrollElement.clientHeight || 900 });
  });

  const range = useMemo(() => virtualTurnRangeFromBottom({
    turnKeys,
    heights: rowHeightsRef.current,
    distanceFromBottom: scrollState.distanceFromBottom,
    viewportHeight: scrollState.viewportHeight,
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- heightVersion 是 rowHeightsRef 高度表的代理失效键（ref 变更不触发渲染，由该计数器驱动窗口重算），并非多余
  }), [heightVersion, scrollState.distanceFromBottom, scrollState.viewportHeight, turnKeys]);

  // Cmd/Ctrl+F jump support: map every render-unit key (including assistantAfter
  // sub-units, which mount inside their parent message) to its turn index.
  const groupIndexByUnitKey = useMemo(() => {
    const map = new Map<string, number>();
    groups.forEach((group, index) => {
      for (const unit of group.units) {
        map.set(unit.key, index);
        if (unit.kind === "message") {
          for (const after of unit.assistantAfter ?? []) map.set(after.key, index);
        }
      }
    });
    return map;
  }, [groups]);

  const scrollToTurnIndex = useCallback((index: number): boolean => {
    if (index < 0 || index >= turnKeys.length) return false;
    const scrollElement = scrollController?.getScrollElement() ?? conversationScrollElement(listRef.current);
    const viewportHeight = Math.max(1, scrollElement?.clientHeight || 900);
    const heights = rowHeightsRef.current;
    const offsets = turnOffsetsByKey(turnKeys, heights, DESKTOP_TURN_ESTIMATED_HEIGHT_PX, DESKTOP_TURN_GAP_PX);
    const totalHeight = (offsets[turnKeys.length - 1] ?? 0)
      + turnHeightByKey(heights, turnKeys[turnKeys.length - 1], DESKTOP_TURN_ESTIMATED_HEIGHT_PX);
    const top = offsets[index] ?? 0;
    const height = turnHeightByKey(heights, turnKeys[index], DESKTOP_TURN_ESTIMATED_HEIGHT_PX);
    // Aim the turn's center at the viewport center; unmeasured rows use the
    // estimate, so the caller fine-tunes with scrollIntoView once mounted.
    const maxDistance = Math.max(0, totalHeight - viewportHeight);
    const centered = totalHeight - (top + height / 2) - viewportHeight / 2;
    const distance = Math.min(maxDistance, Math.max(0, centered));
    stickToBottomRef.current = distance <= DESKTOP_STICKY_BOTTOM_THRESHOLD_PX;
    if (scrollController) {
      scrollController.scrollToDistanceFromBottomPx(distance, "instant");
      return true;
    }
    if (!scrollElement) return false;
    setThreadScrollDistanceFromBottom(scrollElement, distance);
    return true;
  }, [scrollController, turnKeys]);

  useEffect(() => {
    const refs = [scrollToUnitKeyRef, additionalScrollToUnitKeyRef].filter(
      (ref): ref is ScrollToUnitKeyRef => ref != null,
    );
    if (refs.length === 0) return;
    const scrollToUnitKey = (unitKey: string) => {
      const index = groupIndexByUnitKey.get(unitKey);
      return index == null ? false : scrollToTurnIndex(index);
    };
    for (const ref of refs) ref.current = scrollToUnitKey;
    return () => {
      for (const ref of refs) {
        if (ref.current === scrollToUnitKey) ref.current = null;
      }
    };
  }, [additionalScrollToUnitKeyRef, groupIndexByUnitKey, scrollToTurnIndex, scrollToUnitKeyRef]);

  return (
    <div className="hc-turn-list" ref={listRef}>
      {range.paddingTop > 0 && (
        <div className="hc-turn-virtual-spacer" style={{ height: range.paddingTop }} aria-hidden="true" />
      )}
      {groups.slice(range.startIndex, range.endIndex).map((group, offset) => {
        const index = range.startIndex + offset;
        const turnKey = turnKeys[index] ?? turnKeyForGroup(group, index);
        return (
          <div
            className="hc-turn-row"
            data-turn-key={turnKey}
            data-content-search-turn-key={turnKey}
            data-last-turn={index === groups.length - 1 || undefined}
            key={turnKey}
            ref={(element) => observeRow(turnKey, index, element)}
          >
            {renderGroup(group, index)}
          </div>
        );
      })}
      {range.paddingBottom > 0 && (
        <div className="hc-turn-virtual-spacer" style={{ height: range.paddingBottom }} aria-hidden="true" />
      )}
    </div>
  );
}

function conversationScrollElement(element: HTMLElement | null): HTMLElement | null {
  if (!element) return null;
  return element.closest<HTMLElement>(".hc-thread-scroll-container")
    ?? element.closest<HTMLElement>(".hc-conversation")
    ?? element.parentElement;
}

export {
  turnKeysForGroups,
  virtualTurnRange,
  virtualTurnRangeFromBottom,
};
export type { VirtualTurnRange };
