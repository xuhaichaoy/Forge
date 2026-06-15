// CODEX-REF: use-measured-text-collapse-*.js
// Codex 默认导出用 ResizeObserver 测真实文本是否超过 N 行，
// 返回三态 uncollapsible / collapsed / expanded。
// Forge 之前用启发式 (lines.length > 3 || text.length > 220) 判断，
// 对 bash -lc 单行长命令会误判成 "需要折叠"，且展开后把整张卡片撑高。
// 这里复刻 Codex 的真实测量策略：临时去掉 line-clamp，读 scrollHeight，
// 跟 lineHeight * maxLines 比较，再恢复样式。
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export type MeasuredCollapseState = "uncollapsible" | "collapsed" | "expanded";

export interface UseMeasuredTextCollapseResult<T extends HTMLElement> {
  ref: RefObject<T | null>;
  state: MeasuredCollapseState;
  toggle: () => void;
  expand: () => void;
  collapse: () => void;
}

export function useMeasuredTextCollapse<T extends HTMLElement = HTMLElement>(
  maxLines: number = 3,
): UseMeasuredTextCollapseResult<T> {
  // CODEX-REF: use-measured-text-collapse-*.js — 默认导出持有三态 + 用户手动展开标志
  const ref = useRef<T | null>(null);
  const [state, setState] = useState<MeasuredCollapseState>("uncollapsible");
  const userExpandedRef = useRef(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // CODEX-REF: use-measured-text-collapse-*.js — Codex 通过临时移除 line-clamp 样式
    // 再读 scrollHeight 来判断真实文本是否溢出 maxLines 行。
    const prev = {
      display: el.style.display,
      maxHeight: el.style.maxHeight,
      webkitLineClamp: el.style.webkitLineClamp,
      overflow: el.style.overflow,
    };
    el.style.display = "block";
    el.style.maxHeight = "none";
    el.style.webkitLineClamp = "unset";
    el.style.overflow = "visible";
    const fullHeight = el.scrollHeight;
    const computedLineHeight = parseFloat(getComputedStyle(el).lineHeight);
    const lineHeight = Number.isFinite(computedLineHeight) && computedLineHeight > 0 ? computedLineHeight : 20;
    const isOverflowing = fullHeight > lineHeight * maxLines + 1;
    el.style.display = prev.display;
    el.style.maxHeight = prev.maxHeight;
    el.style.webkitLineClamp = prev.webkitLineClamp;
    el.style.overflow = prev.overflow;
    setState((current) => {
      if (!isOverflowing) return "uncollapsible";
      if (userExpandedRef.current) return "expanded";
      if (current === "expanded") return "expanded";
      return "collapsed";
    });
  }, [maxLines]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(() => measure());
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  const toggle = useCallback(() => {
    setState((current) => {
      if (current === "uncollapsible") return current;
      if (current === "expanded") {
        userExpandedRef.current = false;
        return "collapsed";
      }
      userExpandedRef.current = true;
      return "expanded";
    });
  }, []);

  const expand = useCallback(() => {
    setState((current) => {
      if (current === "collapsed") {
        userExpandedRef.current = true;
        return "expanded";
      }
      return current;
    });
  }, []);

  const collapse = useCallback(() => {
    setState((current) => {
      if (current === "expanded") {
        userExpandedRef.current = false;
        return "collapsed";
      }
      return current;
    });
  }, []);

  return { ref, state, toggle, expand, collapse };
}
