import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useHiCodexIntl } from "./i18n-provider";

export interface ThreadFindBarProps {
  currentIndex: number;
  focusToken: number;
  matchCount: number;
  query: string;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onQueryChange: (query: string) => void;
}

export function ThreadFindBar({
  currentIndex,
  focusToken,
  matchCount,
  query,
  onClose,
  onNext,
  onPrevious,
  onQueryChange,
}: ThreadFindBarProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const canNavigate = matchCount > 0;
  const countLabel = query.trim()
    ? `${canNavigate ? currentIndex + 1 : 0}/${matchCount}`
    : "0/0";
  const { formatMessage } = useHiCodexIntl();
  const findLabel = formatMessage({ id: "codex.threadFindBar.label", defaultMessage: "Find in chat" });
  const placeholderText = formatMessage({ id: "codex.threadFindBar.placeholder", defaultMessage: "Search chat…" });
  const previousLabel = formatMessage({ id: "codex.threadFindBar.previousResult", defaultMessage: "Previous result" });
  const nextLabel = formatMessage({ id: "codex.threadFindBar.nextResult", defaultMessage: "Next result" });
  const closeLabel = formatMessage({ id: "codex.threadFindBar.close", defaultMessage: "Close find" });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusToken]);

  return (
    <div className="hc-thread-find-bar" role="search" aria-label={findLabel}>
      <label className="hc-thread-find-input">
        <Search size={14} aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder={placeholderText}
          aria-label={findLabel}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (event.shiftKey) onPrevious();
              else onNext();
            }
          }}
        />
      </label>
      <span className="hc-thread-find-count" aria-live="polite">{countLabel}</span>
      <button
        type="button"
        className="hc-thread-find-icon-button"
        aria-label={previousLabel}
        title={previousLabel}
        disabled={!canNavigate}
        onClick={onPrevious}
      >
        <ChevronUp size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="hc-thread-find-icon-button"
        aria-label={nextLabel}
        title={nextLabel}
        disabled={!canNavigate}
        onClick={onNext}
      >
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="hc-thread-find-icon-button"
        aria-label={closeLabel}
        title={closeLabel}
        onClick={onClose}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
