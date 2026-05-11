import { useEffect, useState } from "react";
import type { RefObject } from "react";

export function useElementInlineSize<T extends HTMLElement>(ref: RefObject<T | null>): number {
  const [inlineSize, setInlineSize] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const setMeasuredInlineSize = (next: number) => {
      if (!Number.isFinite(next) || next < 0) return;
      setInlineSize((current) => Math.abs(current - next) < 1 ? current : next);
    };
    const measure = () => setMeasuredInlineSize(element.getBoundingClientRect().width);
    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(([entry]) => {
      const borderBoxSize = entry?.borderBoxSize;
      const firstBox = Array.isArray(borderBoxSize) ? borderBoxSize[0] : borderBoxSize;
      setMeasuredInlineSize(firstBox?.inlineSize ?? entry?.contentRect.width ?? element.getBoundingClientRect().width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return inlineSize;
}
