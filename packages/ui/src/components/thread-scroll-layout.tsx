import { ArrowUp } from "lucide-react";
import {
  createContext,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useContext,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import { useHiCodexIntl } from "./i18n-provider";

const DESKTOP_SCROLLED_FROM_BOTTOM_THRESHOLD_PX = 24;
const DESKTOP_FOOTER_SCROLL_PADDING_PX = 16;
const DEFAULT_SCROLL_KEY = "__hicodex_default_thread_scroll__";
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
  const { formatMessage } = useHiCodexIntl();

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

  const scrollToDistanceFromBottom = useCallback((distance: number, behavior: ThreadScrollBehavior = "smooth") => {
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
    shouldStickToBottomRef.current = isNearBottom;
    setScrolledFromBottom(!isNearBottom);
    onScroll?.(normalizedDistance, isNearBottom);
    for (const listener of scrollListenersRef.current) listener(normalizedDistance);
  }, [onScroll, setScrolledFromBottom]);

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
        scrollToDistanceFromBottom(0, "instant");
        return;
      }
      if (turnBottomDistanceFromBottomPx <= viewportDistanceFromBottomPx) {
        scrollToDistanceFromBottom(viewportDistanceFromBottomPx + heightDeltaPx, "instant");
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

export function threadScrollDistanceFromBottom(element: HTMLElement): number {
  if (isReverseThreadScroll(element)) {
    return Math.max(0, -element.scrollTop);
  }
  return Math.max(0, element.scrollHeight - element.scrollTop - element.clientHeight);
}

export function setThreadScrollDistanceFromBottom(element: HTMLElement, distance: number): void {
  element.scrollTop = threadScrollTopForDistanceFromBottom(element, distance);
}

export function threadScrollTopForDistanceFromBottom(element: HTMLElement, distance: number): number {
  const normalizedDistance = Math.max(0, distance);
  if (isReverseThreadScroll(element)) {
    return normalizedDistance === 0 ? 0 : -normalizedDistance;
  }
  return Math.max(0, element.scrollHeight - element.clientHeight - normalizedDistance);
}

export function nextThreadStickToBottomState(
  current: boolean,
  distanceFromBottomPx: number,
  updateStickiness: boolean,
): boolean {
  return updateStickiness
    ? distanceFromBottomPx <= DESKTOP_SCROLLED_FROM_BOTTOM_THRESHOLD_PX
    : current;
}

export function threadScrollKey(resetKey: string | null | undefined): string {
  const normalized = resetKey?.trim() ?? "";
  return normalized || DEFAULT_SCROLL_KEY;
}

export function threadScrollContentOverflows(contentHeightPx: number, viewportHeightPx: number): boolean {
  return contentHeightPx > viewportHeightPx + 2;
}

function isReverseThreadScroll(element: HTMLElement): boolean {
  return globalThis.getComputedStyle?.(element).flexDirection === "column-reverse";
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
