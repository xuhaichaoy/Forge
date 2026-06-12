import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FileReference } from "./file-reference-types";
import { useHiCodexIntl } from "./i18n-provider";
import { UserMessageTextContentView } from "./user-message-content-render";
import type {
  MessageRenderUnit,
  UserMarkdownRenderer,
} from "./user-message-types";

export function CollapsedUserText({
  unit,
  onOpenFileReference,
  renderMarkdown,
}: {
  unit: MessageRenderUnit;
  onOpenFileReference?: (reference: FileReference) => void;
  renderMarkdown: UserMarkdownRenderer;
}) {
  const { formatMessage } = useHiCodexIntl();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [collapsible, setCollapsible] = useState(false);
  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    const measure = () => {
      setCollapsible(element.scrollHeight - element.clientHeight > 2 || likelyLongUserMessage(unit.text));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [unit.text]);

  return (
    <div className="hc-user-message-collapse">
      <div
        ref={contentRef}
        className="hc-user-message-collapse-content"
        data-expanded={expanded || undefined}
      >
        <UserMessageTextContentView
          unit={unit}
          onOpenFileReference={onOpenFileReference}
          renderMarkdown={renderMarkdown}
        />
      </div>
      {collapsible && (
        <button
          type="button"
          aria-expanded={expanded}
          className="hc-user-message-collapse-toggle"
          onClick={() => setExpanded((value) => !value)}
        >
          <span>{expanded
            ? formatMessage({ id: "codex.userMessage.showLess", defaultMessage: "Show less" })
            : formatMessage({ id: "codex.userMessage.showMore", defaultMessage: "Show more" })}</span>
          {/* codex collapse chevron = icon-2xs (14px); collapsed points down, expanded rotate-180 (up) */}
          <ChevronDown size={14} className={expanded ? "is-open" : ""} />
        </button>
      )}
    </div>
  );
}

function likelyLongUserMessage(text: string): boolean {
  return text.split(/\r\n|\r|\n/).length > 20 || text.length > 1800;
}
