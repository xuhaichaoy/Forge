import { ArrowUp } from "lucide-react";
import {
  createContext,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useContext,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import { useForgeIntl } from "./i18n-provider";
import {
  DESKTOP_FOOTER_SCROLL_PADDING_PX,
  DESKTOP_SCROLLED_FROM_BOTTOM_THRESHOLD_PX,
  nextThreadStickToBottomState,
  threadScrollContentOverflows,
  threadScrollDistanceFromBottom,
  threadScrollKey,
  threadScrollTopForDistanceFromBottom,
} from "../state/thread-scroll";

const USER_SCROLL_INTENT_WINDOW_MS = 600;

const scrollDistanceByThreadKey = new Map<string, number>();

export interface ThreadScrollLayoutProps {
  children: ReactNode;
  footer: ReactNode;
  contentX?: number;
  inlineEndInset?: number;
  initialOffset?: number | null;
  onScroll?: (distanceFromBottomPx: number, isNearBottom: boolean) => void;
  resetKey?: string | null;
  contentVersion?: string | number;
}

export type ThreadScrollBehavior = ScrollBehavior | "instant";

export interface ThreadScrollHeightDelta {
  heightDeltaPx: number;
  turnBottomDistanceFromBottomPx: number;
  viewportDistanceFromBottomPx: number;
}

/**
 * Codex Desktop parity: API method names align verbatim to upstream scroll
 * controller surface found in `local-conversation-thread-*.js`:
 *   - scrollToBottom
 *   - scrollToDistanceFromBottomPx
 *   - scrollDistanceFromBottom  (here exposed as `threadScrollDistanceFromBottom`)
 * Upstream uses manual DOM + ResizeObserver (no Virtuoso / react-window).
 */
export interface ThreadScrollController {
  addScrollListener: (listener: (distanceFromBottomPx: number) => void) => () => void;
  adjustForMeasuredTurnHeightDelta: (delta: ThreadScrollHeightDelta) => void;
  getLastScrollDistanceFromBottomPx: () => number;
  getScrollElement: () => HTMLElement | null;
  isScrolledFromBottom: () => boolean;
  scrollToBottom: (behavior?: ThreadScrollBehavior) => void;
  scrollToDistanceFromBottomPx: (distanceFromBottomPx: number, behavior?: ThreadScrollBehavior) => void;
}

const ThreadScrollControllerContext = createContext<ThreadScrollController | null>(null);

export function ThreadScrollLayout({
  children,
  contentX = 0,
  footer,
  inlineEndInset = 0,
  initialOffset = null,
  onScroll,
  resetKey = null,
  contentVersion = 0,
}: ThreadScrollLayoutProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const activeScrollKey = threadScrollKey(resetKey);
  const activeScrollKeyRef = useRef(activeScrollKey);
  const lastDistanceFromBottomRef = useRef(0);
  const pendingRestoreDistanceRef = useRef<number | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const isScrolledFromBottomRef = useRef(false);
  const userScrollIntentUntilRef = useRef(0);
  const scrollListenersRef = useRef(new Set<(distanceFromBottomPx: number) => void>());
  const [footerHeight, setFooterHeight] = useState(0);
  /*
   * Tri-state on purpose: `null` = not measured yet. The overflow gate is
   * FAIL-OPEN — only a positive "content fits" measurement may suppress
   * scrolling; an unmeasured (or unmeasurable) layout stays scrollable.
   */
  const [contentOverflows, setContentOverflows] = useState<boolean | null>(null);
  const [isScrolledFromBottom, setIsScrolledFromBottom] = useState(false);
  const { formatMessage } = useForgeIntl();

  const setScrolledFromBottom = useCallback((next: boolean) => {
    isScrolledFromBottomRef.current = next;
    setIsScrolledFromBottom(next);
  }, []);

  const measureScroll = useCallback((options: { updateStickiness?: boolean } = {}) => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;
    const distance = threadScrollDistanceFromBottom(scrollElement);
    lastDistanceFromBottomRef.current = distance;
    scrollDistanceByThreadKey.set(activeScrollKeyRef.current, distance);
    const isNearBottom = distance <= DESKTOP_SCROLLED_FROM_BOTTOM_THRESHOLD_PX;
    shouldStickToBottomRef.current = nextThreadStickToBottomState(
      shouldStickToBottomRef.current,
      distance,
      options.updateStickiness ?? true,
    );
    setScrolledFromBottom(!isNearBottom);
    onScroll?.(distance, isNearBottom);
    for (const listener of scrollListenersRef.current) listener(distance);
  }, [onScroll, setScrolledFromBottom]);

  const settleFrameRef = useRef<number | null>(null);
  const cancelSettleToBottom = useCallback(() => {
    if (settleFrameRef.current != null) {
      window.cancelAnimationFrame(settleFrameRef.current);
      settleFrameRef.current = null;
    }
  }, []);

  /*
   * A smooth scroll-to-bottom over the virtualized turn list chases a moving
   * target: rows mount and measure during the glide, growing scrollHeight
   * past the animation's fixed target, and mid-glide re-renders can cancel
   * the animation outright (observed on WKWebView). Escort the glide: while
   * the stick-to-bottom intent holds, re-issue the scroll whenever progress
   * stalls short of the real bottom. A user scroll drops the intent and ends
   * the escort.
   */
  const settleScrollToBottom = useCallback(() => {
    cancelSettleToBottom();
    let lastTop: number | null = null;
    let stalledFrames = 0;
    let stuckFrames = 0;
    const step = () => {
      settleFrameRef.current = null;
      const scrollElement = scrollRef.current;
      if (!scrollElement || !shouldStickToBottomRef.current) return;
      const distance = threadScrollDistanceFromBottom(scrollElement);
      if (distance <= 1) {
        measureScroll({ updateStickiness: false });
        return;
      }
      const top = scrollElement.scrollTop;
      // scrollTop moving AWAY from the bottom means the user took over via a
      // path that never marks scroll intent (keyboard paging) — stand down.
      if (lastTop != null && top < lastTop - 4) return;
      if (lastTop != null && Math.abs(top - lastTop) < 0.5) {
        stalledFrames += 1;
        stuckFrames += 1;
        if (stuckFrames >= 30) {
          // Smooth re-issues keep dying (every glide canceled before moving):
          // land decisively instead of looping forever.
          stuckFrames = 0;
          stalledFrames = 0;
          scrollElement.scrollTop = threadScrollTopForDistanceFromBottom(scrollElement, 0);
        } else if (stalledFrames >= 3) {
          stalledFrames = 0;
          const target = threadScrollTopForDistanceFromBottom(scrollElement, 0);
          if (typeof scrollElement.scrollTo === "function") {
            scrollElement.scrollTo({ top: target, behavior: "smooth" });
          } else {
            scrollElement.scrollTop = target;
          }
        }
      } else {
        stalledFrames = 0;
        stuckFrames = 0;
      }
      lastTop = top;
      settleFrameRef.current = window.requestAnimationFrame(step);
    };
    settleFrameRef.current = window.requestAnimationFrame(step);
  }, [cancelSettleToBottom, measureScroll]);

  useEffect(() => () => {
    cancelSettleToBottom();
  }, [cancelSettleToBottom]);

  const scrollToDistanceFromBottom = useCallback((
    distance: number,
    behavior: ThreadScrollBehavior = "smooth",
    options?: {
      /*
       * false = positional maintenance (height-delta compensation), which must
       * not start or cancel a scroll-to-bottom escort; only calls expressing a
       * NEW scroll intent (button, ⌘F jump, restore) manage the escort.
       */
      manageSettle?: boolean;
    },
  ) => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;
    const normalizedDistance = Math.max(0, distance);
    const top = threadScrollTopForDistanceFromBottom(scrollElement, normalizedDistance);
    const domBehavior = behavior === "instant" ? "auto" : behavior;
    if (typeof scrollElement.scrollTo === "function") {
      scrollElement.scrollTo({ top, behavior: domBehavior });
    } else {
      scrollElement.scrollTop = top;
    }
    lastDistanceFromBottomRef.current = normalizedDistance;
    scrollDistanceByThreadKey.set(activeScrollKeyRef.current, normalizedDistance);
    const isNearBottom = normalizedDistance <= DESKTOP_SCROLLED_FROM_BOTTOM_THRESHOLD_PX;
    if (options?.manageSettle ?? true) {
      if (normalizedDistance === 0 && behavior === "smooth") {
        /*
         * This call expresses an explicit go-to-bottom intent. Drop any
         * pointer-intent window the trigger's own pointerdown just opened
         * (the ↓ button lives inside the scroll container), otherwise the
         * glide's first scroll events re-evaluate stickiness as a user
         * scroll, unstick at >24px, and kill the escort immediately.
         */
        userScrollIntentUntilRef.current = 0;
        settleScrollToBottom();
      } else {
        cancelSettleToBottom();
      }
      /*
       * Stickiness is intent state: positional maintenance (manageSettle:
       * false, the height-delta compensation) must not rewrite it — a
       * mid-glide compensation at a large distance would flip it false and
       * exit the escort.
       */
      shouldStickToBottomRef.current = isNearBottom;
    }
    setScrolledFromBottom(!isNearBottom);
    onScroll?.(normalizedDistance, isNearBottom);
    for (const listener of scrollListenersRef.current) listener(normalizedDistance);
  }, [cancelSettleToBottom, onScroll, setScrolledFromBottom, settleScrollToBottom]);

  const scrollToBottom = useCallback((behavior: ThreadScrollBehavior = "smooth") => {
    scrollToDistanceFromBottom(0, behavior);
  }, [scrollToDistanceFromBottom]);

  const requestScrollToBottom = useCallback((behavior: ThreadScrollBehavior) => {
    const frame = window.requestAnimationFrame(() => {
      scrollToBottom(behavior);
      measureScroll();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [measureScroll, scrollToBottom]);

  const requestScrollDistanceFromBottom = useCallback((distance: number, behavior: ThreadScrollBehavior) => {
    const frame = window.requestAnimationFrame(() => {
      scrollToDistanceFromBottom(distance, behavior);
      measureScroll();
      const scrollElement = scrollRef.current;
      if (!scrollElement || distance === 0 || scrollElement.scrollHeight > scrollElement.clientHeight) {
        pendingRestoreDistanceRef.current = null;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [measureScroll, scrollToDistanceFromBottom]);

  useLayoutEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;
    const markUserScrollIntent = () => {
      userScrollIntentUntilRef.current = Date.now() + USER_SCROLL_INTENT_WINDOW_MS;
    };
    const handleScrollIntent = () => {
      markUserScrollIntent();
    };
    const handleScroll = () => {
      measureScroll({ updateStickiness: Date.now() <= userScrollIntentUntilRef.current });
    };
    measureScroll();
    scrollElement.addEventListener("pointerdown", handleScrollIntent, { passive: true });
    scrollElement.addEventListener("wheel", handleScrollIntent, { passive: true });
    scrollElement.addEventListener("touchstart", handleScrollIntent, { passive: true });
    scrollElement.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      scrollElement.removeEventListener("pointerdown", handleScrollIntent);
      scrollElement.removeEventListener("wheel", handleScrollIntent);
      scrollElement.removeEventListener("touchstart", handleScrollIntent);
      scrollElement.removeEventListener("scroll", handleScroll);
    };
  }, [measureScroll]);

  useLayoutEffect(() => {
    const previousKey = activeScrollKeyRef.current;
    if (previousKey !== activeScrollKey) {
      scrollDistanceByThreadKey.set(previousKey, lastDistanceFromBottomRef.current);
      activeScrollKeyRef.current = activeScrollKey;
    }
    const restoredDistance = initialOffset ?? scrollDistanceByThreadKey.get(activeScrollKey) ?? 0;
    pendingRestoreDistanceRef.current = restoredDistance;
    return requestScrollDistanceFromBottom(restoredDistance, "instant");
  }, [activeScrollKey, initialOffset, requestScrollDistanceFromBottom]);

  const measureContentOverflow = useCallback(() => {
    const scrollElement = scrollRef.current;
    const contentElement = contentRef.current;
    if (!scrollElement || !contentElement) return;
    const overflows = threadScrollContentOverflows(
      contentElement.offsetHeight,
      scrollElement.clientHeight,
    );
    setContentOverflows((current) => (current === overflows ? current : overflows));
  }, []);

  useLayoutEffect(() => {
    const footerElement = footerRef.current;
    if (!footerElement || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const nextHeight = resizeEntryBlockSize(entry);
      setFooterHeight((current) => Math.abs(current - nextHeight) < 1 ? current : nextHeight);
    });
    observer.observe(footerElement);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const scrollElement = scrollRef.current;
    const contentElement = contentRef.current;
    if (!scrollElement || !contentElement || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      measureContentOverflow();
    });
    observer.observe(scrollElement);
    observer.observe(contentElement);
    measureContentOverflow();
    return () => observer.disconnect();
  }, [contentVersion, footerHeight, measureContentOverflow]);

  useLayoutEffect(() => {
    const pendingDistance = pendingRestoreDistanceRef.current;
    if (pendingDistance !== null) {
      return requestScrollDistanceFromBottom(pendingDistance, "auto");
    }
    if (!shouldStickToBottomRef.current) return;
    return requestScrollToBottom("instant");
  }, [contentVersion, footerHeight, requestScrollDistanceFromBottom, requestScrollToBottom]);

  const controller = useMemo<ThreadScrollController>(() => ({
    addScrollListener: (listener) => {
      scrollListenersRef.current.add(listener);
      return () => scrollListenersRef.current.delete(listener);
    },
    adjustForMeasuredTurnHeightDelta: ({
      heightDeltaPx,
      turnBottomDistanceFromBottomPx,
      viewportDistanceFromBottomPx,
    }) => {
      if (heightDeltaPx === 0) return;
      if (viewportDistanceFromBottomPx <= DESKTOP_SCROLLED_FROM_BOTTOM_THRESHOLD_PX) {
        scrollToDistanceFromBottom(0, "instant", { manageSettle: false });
        return;
      }
      if (turnBottomDistanceFromBottomPx <= viewportDistanceFromBottomPx) {
        scrollToDistanceFromBottom(viewportDistanceFromBottomPx + heightDeltaPx, "instant", { manageSettle: false });
      }
    },
    getLastScrollDistanceFromBottomPx: () => lastDistanceFromBottomRef.current,
    getScrollElement: () => scrollRef.current,
    isScrolledFromBottom: () => isScrolledFromBottomRef.current,
    scrollToBottom,
    scrollToDistanceFromBottomPx: scrollToDistanceFromBottom,
  }), [scrollToBottom, scrollToDistanceFromBottom]);

  const scrollStyle = {
    // Unmeasured (null) is treated as overflowing — only a positive
    // "content fits" verdict drops the sticky-footer scroll padding.
    "--thread-scroll-padding-bottom": contentOverflows !== false
      ? `${footerHeight + DESKTOP_FOOTER_SCROLL_PADDING_PX}px`
      : "0px",
  } as CSSProperties;
  const shellStyle = {
    "--thread-scroll-inline-end-inset": `${Math.max(0, inlineEndInset)}px`,
  } as CSSProperties;
  const contentStyle = {
    "--thread-scroll-content-x": `${contentX}px`,
  } as CSSProperties;

  return (
    <ThreadScrollControllerContext.Provider value={controller}>
      <div className="hc-thread-scroll-shell" style={shellStyle}>
        <div
          className="hc-thread-scroll-container"
          data-thread-scroll-container="true"
          // Fail-open: the CSS gate hides the scrollbar only on an explicit
          // "false"; unmeasured layouts stay scrollable.
          data-content-overflows={contentOverflows === null ? undefined : String(contentOverflows)}
          ref={scrollRef}
          style={scrollStyle}
        >
          <div className="hc-thread-scroll-content" ref={contentRef} style={contentStyle}>
            <div className="hc-thread-scroll-body" data-mcp-app-portal-target="true">
              {children}
            </div>
            <div
              className="hc-thread-scroll-footer"
              data-thread-scroll-footer="true"
              ref={footerRef}
            >
              <div className="hc-thread-scroll-footer-gradient" aria-hidden="true" />
              <div className="hc-thread-scroll-footer-content">
                <div className="hc-scroll-to-bottom-anchor">
                  <button
                    aria-hidden={!isScrolledFromBottom}
                    aria-label={formatMessage({ id: "localConversation.scrollToBottomButton", defaultMessage: "Scroll to bottom" })}
                    className={isScrolledFromBottom
                      ? "hc-scroll-to-bottom"
                      : "hc-scroll-to-bottom is-hidden"}
                    onClick={() => scrollToBottom("smooth")}
                    tabIndex={isScrolledFromBottom ? 0 : -1}
                    type="button"
                  >
                    <ArrowUp size={17} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                </div>
                {footer}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ThreadScrollControllerContext.Provider>
  );
}

export function useThreadScrollController(): ThreadScrollController | null {
  return useContext(ThreadScrollControllerContext);
}

function resizeEntryBlockSize(entry: ResizeObserverEntry | undefined): number {
  if (!entry) return 0;
  const borderBoxSize = entry.borderBoxSize;
  if (borderBoxSize) {
    const first = Array.isArray(borderBoxSize) ? borderBoxSize[0] : borderBoxSize;
    return first?.blockSize ?? entry.contentRect.height;
  }
  return entry.contentRect.height;
}
