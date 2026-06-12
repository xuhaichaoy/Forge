import { useLayoutEffect, useState } from "react";
import type { RefObject } from "react";

export function useComposerSingleLineLayout({
  fieldRef,
  input,
  leftControlsRef,
  measureRef,
  rightControlsRef,
}: {
  fieldRef: RefObject<HTMLDivElement | null>;
  input: string;
  leftControlsRef: RefObject<HTMLElement | null>;
  measureRef: RefObject<HTMLSpanElement | null>;
  rightControlsRef: RefObject<HTMLElement | null>;
}): boolean {
  const [metrics, setMetrics] = useState({
    fieldWidth: 0,
    leftControlsWidth: 0,
    rightControlsWidth: 0,
    textWidth: 0,
  });
  useLayoutEffect(() => {
    const field = fieldRef.current;
    const measure = measureRef.current;
    if (!field || !measure) return;
    const update = () => {
      const next = {
        fieldWidth: field.clientWidth,
        leftControlsWidth: leftControlsRef.current?.getBoundingClientRect().width ?? 0,
        rightControlsWidth: rightControlsRef.current?.getBoundingClientRect().width ?? 0,
        textWidth: measure.getBoundingClientRect().width,
      };
      setMetrics((current) => (
        current.fieldWidth === next.fieldWidth
        && current.leftControlsWidth === next.leftControlsWidth
        && current.rightControlsWidth === next.rightControlsWidth
        && current.textWidth === next.textWidth
          ? current
          : next
      ));
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(field);
    observer.observe(measure);
    if (leftControlsRef.current) observer.observe(leftControlsRef.current);
    if (rightControlsRef.current) observer.observe(rightControlsRef.current);
    return () => observer.disconnect();
  });

  if (metrics.fieldWidth <= 0 || metrics.textWidth <= 0) return true;
  const prospectiveInputWidth = Math.max(
    0,
    metrics.fieldWidth - metrics.leftControlsWidth - metrics.rightControlsWidth - 32,
  );
  return metrics.textWidth + 32 <= prospectiveInputWidth;
}
