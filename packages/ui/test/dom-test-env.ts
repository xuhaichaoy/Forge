/*
 * jsdom interaction-test layer for the bespoke runner (scripts/run-tests.mjs).
 *
 * The runner has no global DOM: every *.dom.test.ts file calls
 * `setupDomTestEnv()` inside each exported test function and MUST call
 * `env.teardown()` in a `finally` block so the shared process the runner uses
 * for all test files returns to its DOM-free baseline.
 *
 * Design notes:
 * - requestAnimationFrame is NOT jsdom's: a manual driver is installed so
 *   tests can advance component frame loops deterministically with
 *   `flushFrames(n)` (the thread-scroll settle escort is a rAF loop).
 * - jsdom performs no layout, so scrollHeight/clientHeight/scrollTop etc. are
 *   all zero. `stubElementGeometry` replaces them with writable, test-owned
 *   values per element.
 */
import { JSDOM } from "jsdom";

type FrameCallback = (timestamp: number) => void;

export interface DomTestEnv {
  /** The jsdom window, also installed as `globalThis.window`. */
  window: Window & typeof globalThis;
  document: Document;
  /**
   * Run pending requestAnimationFrame callbacks for `count` frames.
   * Callbacks scheduled DURING a frame run in the NEXT frame (browser
   * semantics), so a self-rescheduling loop advances exactly one step per
   * frame. Returns how many callbacks ran in total.
   */
  flushFrames: (count?: number) => number;
  /** Number of callbacks currently waiting for the next frame. */
  pendingFrameCount: () => number;
  /** Restore every global this setup touched and close the jsdom window. */
  teardown: () => void;
}

/**
 * Geometry properties jsdom cannot compute (no layout engine). Every provided
 * key becomes a writable accessor on the element; mutate the RETURNED record
 * (e.g. `geometry.scrollHeight = 5000`) and the element reports the new value
 * immediately — no DOM event is dispatched on your behalf.
 */
export interface ElementGeometryStub {
  scrollHeight?: number;
  scrollWidth?: number;
  clientHeight?: number;
  clientWidth?: number;
  scrollTop?: number;
  scrollLeft?: number;
  offsetHeight?: number;
  offsetWidth?: number;
}

const GLOBAL_KEYS_FROM_WINDOW = [
  "document",
  "navigator",
  "location",
  "history",
  "CustomEvent",
  "Event",
  "EventTarget",
  "FocusEvent",
  "InputEvent",
  "KeyboardEvent",
  "MouseEvent",
  "UIEvent",
  "CompositionEvent",
  "Node",
  "Text",
  "Element",
  "DocumentFragment",
  "HTMLElement",
  "SVGElement",
  "HTMLAnchorElement",
  "HTMLButtonElement",
  "HTMLDivElement",
  "HTMLIFrameElement",
  "HTMLInputElement",
  "HTMLSelectElement",
  "HTMLSpanElement",
  "HTMLTextAreaElement",
  "MutationObserver",
  "DOMRect",
] as const;

export function setupDomTestEnv(): DomTestEnv {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: false,
  });
  const jsdomWindow = dom.window as unknown as Window & typeof globalThis;

  // --- controllable requestAnimationFrame driver -------------------------
  let nextFrameHandle = 1;
  let frameClock = 0;
  const frameCallbacks = new Map<number, FrameCallback>();
  const requestFrame = (callback: FrameCallback): number => {
    const handle = nextFrameHandle;
    nextFrameHandle += 1;
    frameCallbacks.set(handle, callback);
    return handle;
  };
  const cancelFrame = (handle: number): void => {
    frameCallbacks.delete(handle);
  };
  const flushFrames = (count = 1): number => {
    let ran = 0;
    for (let frame = 0; frame < count; frame += 1) {
      // Snapshot-and-clear: callbacks scheduled by this batch belong to the
      // next frame, matching browser rAF semantics.
      const batch = Array.from(frameCallbacks.values());
      frameCallbacks.clear();
      frameClock += 16;
      for (const callback of batch) {
        callback(frameClock);
        ran += 1;
      }
    }
    return ran;
  };

  // --- install globals (save previous descriptors for teardown) ----------
  const savedDescriptors = new Map<string, PropertyDescriptor | undefined>();
  const installGlobal = (key: string, value: unknown): void => {
    if (!savedDescriptors.has(key)) {
      savedDescriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    }
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  };

  installGlobal("window", jsdomWindow);
  for (const key of GLOBAL_KEYS_FROM_WINDOW) {
    const value = (jsdomWindow as unknown as Record<string, unknown>)[key];
    if (value !== undefined) installGlobal(key, value);
  }
  installGlobal("getComputedStyle", jsdomWindow.getComputedStyle.bind(jsdomWindow));
  installGlobal("requestAnimationFrame", requestFrame);
  installGlobal("cancelAnimationFrame", cancelFrame);
  // The component code calls window.requestAnimationFrame — route the window
  // through the same controllable driver.
  Object.defineProperty(jsdomWindow, "requestAnimationFrame", {
    configurable: true,
    writable: true,
    value: requestFrame,
  });
  Object.defineProperty(jsdomWindow, "cancelAnimationFrame", {
    configurable: true,
    writable: true,
    value: cancelFrame,
  });
  // React act() refuses to flush without this opt-in flag.
  installGlobal("IS_REACT_ACT_ENVIRONMENT", true);

  const teardown = (): void => {
    frameCallbacks.clear();
    for (const [key, descriptor] of savedDescriptors) {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        delete (globalThis as Record<string, unknown>)[key];
      }
    }
    savedDescriptors.clear();
    dom.window.close();
  };

  return {
    window: jsdomWindow,
    document: jsdomWindow.document,
    flushFrames,
    pendingFrameCount: () => frameCallbacks.size,
    teardown,
  };
}

export function stubElementGeometry(
  element: HTMLElement,
  geometry: ElementGeometryStub,
): ElementGeometryStub {
  const state: ElementGeometryStub = { ...geometry };
  for (const key of Object.keys(geometry) as Array<keyof ElementGeometryStub>) {
    Object.defineProperty(element, key, {
      configurable: true,
      get: () => state[key] ?? 0,
      set: (value: number) => {
        state[key] = value;
      },
    });
  }
  return state;
}
