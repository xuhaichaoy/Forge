import { useEffect, useRef, useState } from "react";
import {
  CodeSnippet,
  desktopMarkdownCodeBlockWrapMode,
} from "./code-snippet";
import type { MarkdownBlock } from "../state/conversation-markdown-engine";

export const DESKTOP_MARKDOWN_CODE_BLOCK_ROOT_MARGIN = "600px 0px";

export function LazyMarkdownCodeBlock({ block }: { block: Extract<MarkdownBlock, { kind: "code" }> }) {
  const placeholderRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const element = placeholderRef.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      const timer = globalThis.setTimeout(() => setVisible(true), 0);
      return () => globalThis.clearTimeout(timer);
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setVisible(true);
      observer.disconnect();
    }, { rootMargin: DESKTOP_MARKDOWN_CODE_BLOCK_ROOT_MARGIN });
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  if (visible) {
    return (
      <CodeSnippet
        language={block.language}
        text={block.text}
        wrapMode={desktopMarkdownCodeBlockWrapMode(block.language)}
      />
    );
  }

  return (
    <div
      className="hc-markdown-code-lazy"
      data-wide-markdown-block="true"
      data-wide-markdown-block-kind={block.language.trim() || undefined}
      ref={placeholderRef}
    >
      <pre>
        <code>{block.text}</code>
      </pre>
    </div>
  );
}
