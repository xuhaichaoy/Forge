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
  type ThreadScrollBehavior,
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

export type ScrollToUnitKeyAlignment = "center" | "start";

export interface ScrollToUnitKeyOptions {
  align?: ScrollToUnitKeyAlignment;
  behavior?: ThreadScrollBehavior;
  locateTarget?: (scrollElement: HTMLElement, turnElement: HTMLElement) => HTMLElement | null;
  onTargetMounted?: (target: HTMLElement) => void;
}

export type ScrollToUnitKey = (unitKey: string, options?: ScrollToUnitKeyOptions) => boolean;
export type ScrollToUnitKeyRef = MutableRefObject<ScrollToUnitKey | null>;

const VIRTUAL_TURN_PROGRAMMATIC_JUMP_DIRECT_WRITE_AFTER_STALLED_FRAMES = 3;
const VIRTUAL_TURN_PROGRAMMATIC_JUMP_PROGRESS_EPSILON_PX = 1;

interface ProgrammaticJumpTarget {
  align: ScrollToUnitKeyAlignment;
  aligned: boolean;
  behavior: ThreadScrollBehavior;
  locateTarget: (scrollElement: HTMLElement, turnElement: HTMLElement) => HTMLElement | null;
  onTargetMounted?: (target: HTMLElement) => void;
  turnKey: string;
}

interface ProgrammaticJumpState {
  distanceFromBottom: number;
  lastDistanceGap: number | null;
  lastObservedDistanceFromBottom: number | null;
  lastRequestedDistanceFromBottom: number | null;
  stalledFrames: number;
  target: ProgrammaticJumpTarget | null;
  viewportHeight: number;
}

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
  const programmaticJumpFrameRef = useRef<number | null>(null);
  const programmaticJumpRef = useRef<ProgrammaticJumpState | null>(null);
  const rowObserversRef = useRef(new Map<string, ResizeObserver>());
  const rowHeightsRef = useRef(new Map<string, number>());
  const [scrollState, setScrollState] = useState({ distanceFromBottom: 0, viewportHeight: 900 });
  const [heightVersion, setHeightVersion] = useState(0);
  const count = groups.length;
  const turnKeys = useMemo(() => turnKeysForGroups(groups), [groups]);

  const cancelProgrammaticJump = useCallback(() => {
    if (programmaticJumpFrameRef.current !== null) {
      window.cancelAnimationFrame(programmaticJumpFrameRef.current);
      programmaticJumpFrameRef.current = null;
    }
    programmaticJumpRef.current = null;
  }, []);

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
    cancelProgrammaticJump();
    for (const observer of rowObserversRef.current.values()) observer.disconnect();
    rowObserversRef.current.clear();
  }, [cancelProgrammaticJump]);

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
    const pendingJump = programmaticJumpRef.current;
    if (pendingJump) {
      const real = threadScrollDistanceFromBottom(scrollElement);
      if (pendingJump.target && !pendingJump.target.aligned) {
        if (Math.abs(real - pendingJump.distanceFromBottom) > 1) {
          setScrollState((current) => (
            Math.abs(current.distanceFromBottom - pendingJump.distanceFromBottom) <= 1
              && current.viewportHeight === pendingJump.viewportHeight
              ? current
              : { distanceFromBottom: pendingJump.distanceFromBottom, viewportHeight: pendingJump.viewportHeight }
          ));
        }
        /*
         * Locator-based jumps are two-stage: first mount the estimated turn
         * window, then let the locator effect compute the concrete in-turn
         * alignment. Do not clear the jump merely because the first stage has
         * reached its estimated distance.
         */
        return;
      }
      if (Math.abs(real - pendingJump.distanceFromBottom) <= 1) {
        programmaticJumpRef.current = null;
      } else {
        setScrollState((current) => (
          Math.abs(current.distanceFromBottom - pendingJump.distanceFromBottom) <= 1
            && current.viewportHeight === pendingJump.viewportHeight
            ? current
            : { distanceFromBottom: pendingJump.distanceFromBottom, viewportHeight: pendingJump.viewportHeight }
        ));
        return;
      }
    }
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

  const scrollToDistance = useCallback((
    scrollElement: HTMLElement,
    distance: number,
    behavior: ThreadScrollBehavior = "instant",
  ) => {
    if (scrollController) {
      scrollController.scrollToDistanceFromBottomPx(distance, behavior);
    } else {
      setThreadScrollDistanceFromBottom(scrollElement, distance);
    }
  }, [scrollController]);

  const alignPendingTargetIfReady = useCallback((
    scrollElement: HTMLElement,
    pendingJump: NonNullable<typeof programmaticJumpRef.current>,
  ): boolean => {
    const pendingTarget = pendingJump.target;
    if (!pendingTarget || pendingTarget.aligned) return false;
    const turnElement = scrollElement.querySelector<HTMLElement>(
      `[data-turn-key="${cssEscape(pendingTarget.turnKey)}"]`,
    );
    if (!turnElement) return false;
    if (Math.abs(threadScrollDistanceFromBottom(scrollElement) - pendingJump.distanceFromBottom) > 1) {
      requestProgrammaticJumpDistanceIfNeeded(scrollElement, pendingJump, scrollToDistance);
      setScrollState((current) => (
        Math.abs(current.distanceFromBottom - pendingJump.distanceFromBottom) <= 1
          && current.viewportHeight === pendingJump.viewportHeight
          ? current
          : { distanceFromBottom: pendingJump.distanceFromBottom, viewportHeight: pendingJump.viewportHeight }
      ));
      return false;
    }
    const targetElement = pendingTarget.locateTarget(scrollElement, turnElement) ?? turnElement;
    const distance = scrollDistanceForTargetAlignment(scrollElement, targetElement, pendingTarget.align);
    pendingTarget.aligned = true;
    pendingJump.distanceFromBottom = distance;
    pendingJump.lastDistanceGap = null;
    pendingJump.lastObservedDistanceFromBottom = null;
    pendingJump.lastRequestedDistanceFromBottom = distance;
    pendingJump.stalledFrames = 0;
    pendingJump.viewportHeight = scrollElement.clientHeight || pendingJump.viewportHeight;
    stickToBottomRef.current = distance <= DESKTOP_STICKY_BOTTOM_THRESHOLD_PX;
    scrollToDistance(scrollElement, distance, pendingTarget.behavior);
    setScrollState({ distanceFromBottom: distance, viewportHeight: pendingJump.viewportHeight });
    pendingTarget.onTargetMounted?.(targetElement);
    return true;
  }, [scrollToDistance]);

  // oxlint-disable-next-line react-hooks/exhaustive-deps -- runs after every commit while a locator-based jump is pending; the target may appear after virtualization remounts the row.
  useLayoutEffect(() => {
    const pendingJump = programmaticJumpRef.current;
    const pendingTarget = pendingJump?.target;
    if (!pendingJump || !pendingTarget || pendingTarget.aligned) return;
    const scrollElement = scrollController?.getScrollElement() ?? conversationScrollElement(listRef.current);
    if (!scrollElement) return;
    alignPendingTargetIfReady(scrollElement, pendingJump);
  });

  const scrollToTurnIndex = useCallback((index: number, options?: ScrollToUnitKeyOptions): boolean => {
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
    // estimate, so locator-based callers can fine-tune after the row mounts.
    const maxDistance = Math.max(0, totalHeight - viewportHeight);
    const centered = totalHeight - (top + height / 2) - viewportHeight / 2;
    const distance = Math.min(maxDistance, Math.max(0, centered));
    stickToBottomRef.current = distance <= DESKTOP_STICKY_BOTTOM_THRESHOLD_PX;
    cancelProgrammaticJump();
    programmaticJumpRef.current = {
      distanceFromBottom: distance,
      lastDistanceGap: null,
      lastObservedDistanceFromBottom: null,
      lastRequestedDistanceFromBottom: null,
      stalledFrames: 0,
      target: options?.locateTarget
        ? {
            align: options.align ?? "center",
            aligned: false,
            behavior: options.behavior ?? "instant",
            locateTarget: options.locateTarget,
            onTargetMounted: options.onTargetMounted,
            turnKey: turnKeys[index] ?? turnKeyForGroup(groups[index]!, index),
          }
        : null,
      viewportHeight,
    };
    const settleProgrammaticJump = () => {
      programmaticJumpFrameRef.current = null;
      const pendingJump = programmaticJumpRef.current;
      const liveScrollElement = scrollController?.getScrollElement() ?? conversationScrollElement(listRef.current);
      if (!pendingJump || !liveScrollElement) {
        programmaticJumpRef.current = null;
        return;
      }
      requestProgrammaticJumpDistanceIfNeeded(liveScrollElement, pendingJump, scrollToDistance);
      const real = threadScrollDistanceFromBottom(liveScrollElement);
      if (pendingJump.target && !pendingJump.target.aligned) {
        alignPendingTargetIfReady(liveScrollElement, pendingJump);
        const nextReal = threadScrollDistanceFromBottom(liveScrollElement);
        noteProgrammaticJumpProgress(pendingJump, nextReal);
        forceProgrammaticJumpIfStalled(liveScrollElement, pendingJump);
        setScrollState((current) => (
          Math.abs(current.distanceFromBottom - pendingJump.distanceFromBottom) <= 1
            && current.viewportHeight === pendingJump.viewportHeight
            ? current
            : { distanceFromBottom: pendingJump.distanceFromBottom, viewportHeight: pendingJump.viewportHeight }
        ));
        programmaticJumpFrameRef.current = window.requestAnimationFrame(settleProgrammaticJump);
        return;
      }
      if (Math.abs(real - pendingJump.distanceFromBottom) <= 1) {
        programmaticJumpRef.current = null;
        return;
      }
      noteProgrammaticJumpProgress(pendingJump, real);
      if (forceProgrammaticJumpIfStalled(liveScrollElement, pendingJump)) {
        const forcedReal = threadScrollDistanceFromBottom(liveScrollElement);
        if (Math.abs(forcedReal - pendingJump.distanceFromBottom) <= 1) {
          programmaticJumpRef.current = null;
          return;
        }
      }
      setScrollState((current) => (
        Math.abs(current.distanceFromBottom - pendingJump.distanceFromBottom) <= 1
          && current.viewportHeight === pendingJump.viewportHeight
          ? current
          : { distanceFromBottom: pendingJump.distanceFromBottom, viewportHeight: pendingJump.viewportHeight }
      ));
      programmaticJumpFrameRef.current = window.requestAnimationFrame(settleProgrammaticJump);
    };
    if (scrollElement) scrollToDistance(scrollElement, distance, "instant");
    setScrollState({ distanceFromBottom: distance, viewportHeight });
    programmaticJumpFrameRef.current = window.requestAnimationFrame(settleProgrammaticJump);
    return true;
  }, [alignPendingTargetIfReady, cancelProgrammaticJump, groups, scrollController, scrollToDistance, turnKeys]);

  useEffect(() => {
    const refs = [scrollToUnitKeyRef, additionalScrollToUnitKeyRef].filter(
      (ref): ref is ScrollToUnitKeyRef => ref != null,
    );
    if (refs.length === 0) return;
    const scrollToUnitKey: ScrollToUnitKey = (unitKey, options) => {
      const index = groupIndexByUnitKey.get(unitKey);
      return index == null ? false : scrollToTurnIndex(index, options);
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

function noteProgrammaticJumpProgress(
  pendingJump: ProgrammaticJumpState,
  realDistanceFromBottom: number,
): void {
  const gap = Math.abs(realDistanceFromBottom - pendingJump.distanceFromBottom);
  const requestedDistanceChanged = pendingJump.lastRequestedDistanceFromBottom == null
    || Math.abs(pendingJump.distanceFromBottom - pendingJump.lastRequestedDistanceFromBottom)
      > VIRTUAL_TURN_PROGRAMMATIC_JUMP_PROGRESS_EPSILON_PX;
  const progressed = requestedDistanceChanged
    || pendingJump.lastObservedDistanceFromBottom == null
    || pendingJump.lastDistanceGap == null
    || Math.abs(realDistanceFromBottom - pendingJump.lastObservedDistanceFromBottom)
      > VIRTUAL_TURN_PROGRAMMATIC_JUMP_PROGRESS_EPSILON_PX
    || gap < pendingJump.lastDistanceGap - VIRTUAL_TURN_PROGRAMMATIC_JUMP_PROGRESS_EPSILON_PX;
  pendingJump.stalledFrames = progressed ? 0 : pendingJump.stalledFrames + 1;
  pendingJump.lastObservedDistanceFromBottom = realDistanceFromBottom;
  pendingJump.lastDistanceGap = gap;
  pendingJump.lastRequestedDistanceFromBottom = pendingJump.distanceFromBottom;
}

function forceProgrammaticJumpIfStalled(
  scrollElement: HTMLElement,
  pendingJump: ProgrammaticJumpState,
): boolean {
  if (pendingJump.stalledFrames < VIRTUAL_TURN_PROGRAMMATIC_JUMP_DIRECT_WRITE_AFTER_STALLED_FRAMES) return false;
  pendingJump.stalledFrames = 0;
  /*
   * This is not a total settle cap. The jump stays pending; after a few
   * completely static frames we bypass the scroll controller's listener loop
   * once and keep observing until the real distance/target alignment lands.
   */
  setThreadScrollDistanceFromBottom(scrollElement, pendingJump.distanceFromBottom);
  return true;
}

function requestProgrammaticJumpDistanceIfNeeded(
  scrollElement: HTMLElement,
  pendingJump: ProgrammaticJumpState,
  scrollToDistance: (
    scrollElement: HTMLElement,
    distance: number,
    behavior?: ThreadScrollBehavior,
  ) => void,
): void {
  if (
    pendingJump.lastRequestedDistanceFromBottom != null
    && Math.abs(pendingJump.distanceFromBottom - pendingJump.lastRequestedDistanceFromBottom)
      <= VIRTUAL_TURN_PROGRAMMATIC_JUMP_PROGRESS_EPSILON_PX
  ) {
    return;
  }
  scrollToDistance(scrollElement, pendingJump.distanceFromBottom, "instant");
}

function scrollDistanceForTargetAlignment(
  scrollElement: HTMLElement,
  targetElement: HTMLElement,
  align: ScrollToUnitKeyAlignment,
): number {
  const scrollRect = scrollElement.getBoundingClientRect();
  const targetRect = targetElement.getBoundingClientRect();
  const currentDistance = threadScrollDistanceFromBottom(scrollElement);
  const targetTopInViewport = targetRect.top - scrollRect.top;
  if (align === "start") {
    return Math.max(0, currentDistance - targetTopInViewport);
  }
  const targetCenterInViewport = targetTopInViewport + targetRect.height / 2;
  return Math.max(0, currentDistance - targetCenterInViewport + scrollElement.clientHeight / 2);
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
  return value.replace(/"/g, "\\\"");
}

export {
  turnKeysForGroups,
  virtualTurnRange,
  virtualTurnRangeFromBottom,
};
export type { VirtualTurnRange };
