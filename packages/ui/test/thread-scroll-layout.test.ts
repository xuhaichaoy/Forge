import {
  setThreadScrollDistanceFromBottom,
  threadScrollDistanceFromBottom,
  threadScrollKey,
  threadScrollTopForDistanceFromBottom,
} from "../src/components/thread-scroll-layout";

export default function runThreadScrollLayoutTests(): void {
  computesBottomDistanceLikeDesktopScrollController();
  computesNormalScrollTopForDistanceFromBottom();
  computesReverseBottomDistanceLikeDesktopThreadScroll();
  normalizesThreadScrollPersistenceKeys();
}

function computesBottomDistanceLikeDesktopScrollController(): void {
  const element = {
    scrollHeight: 1_600,
    scrollTop: 980,
    clientHeight: 500,
  } as HTMLElement;

  assertEqual(
    threadScrollDistanceFromBottom(element),
    120,
    "thread scroll distance should measure viewport distance from bottom",
  );

  Object.assign(element, { scrollTop: 1_240 });
  assertEqual(
    threadScrollDistanceFromBottom(element),
    0,
    "thread scroll distance should clamp overscroll to zero",
  );
}

function computesReverseBottomDistanceLikeDesktopThreadScroll(): void {
  const previousGetComputedStyle = globalThis.getComputedStyle;
  globalThis.getComputedStyle = (() => ({ flexDirection: "column-reverse" })) as unknown as typeof getComputedStyle;
  try {
    const element = {
      scrollHeight: 1_600,
      scrollTop: -128,
      clientHeight: 500,
    } as HTMLElement;

    assertEqual(
      threadScrollDistanceFromBottom(element),
      128,
      "reverse thread scroll should read negative scrollTop as distance from bottom",
    );
    assertEqual(
      threadScrollTopForDistanceFromBottom(element, 64),
      -64,
      "reverse thread scroll should write negative scrollTop for a nonzero bottom distance",
    );
    setThreadScrollDistanceFromBottom(element, 0);
    assertEqual(element.scrollTop, 0, "reverse thread scroll bottom should be scrollTop zero");
  } finally {
    globalThis.getComputedStyle = previousGetComputedStyle;
  }
}

function computesNormalScrollTopForDistanceFromBottom(): void {
  const element = {
    scrollHeight: 1_600,
    scrollTop: 0,
    clientHeight: 500,
  } as HTMLElement;

  assertEqual(
    threadScrollTopForDistanceFromBottom(element, 120),
    980,
    "normal thread scroll should convert bottom distance back to scrollTop",
  );
}

function normalizesThreadScrollPersistenceKeys(): void {
  assertEqual(threadScrollKey("thread-1"), "thread-1", "thread id should be the scroll persistence key");
  assertEqual(
    threadScrollKey("   "),
    "__hicodex_default_thread_scroll__",
    "blank reset keys should use the default scroll persistence key",
  );
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
