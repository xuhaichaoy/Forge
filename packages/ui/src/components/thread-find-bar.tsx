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
  const hasQuery = query.trim().length > 0;
  const { formatMessage } = useHiCodexIntl();
  // codex review-runtime-bridge ResultLabel `Re`: `{active} / {matches} results`,
  // active = matches > 0 ? currentIndex + 1 : 0; zero matches renders `0 results`.
  // The label row only appears once a query is present (Codex hides it otherwise),
  // so HiCodex no longer shows the bare "0/0" placeholder.
  const activeIndex = canNavigate ? currentIndex + 1 : 0;
  const countLabel = !hasQuery
    ? null
    : canNavigate
      ? formatMessage(
          { id: "codex.threadFindBar.results", defaultMessage: "{active} / {matches} results" },
          { active: activeIndex, matches: matchCount },
        )
      : formatMessage({ id: "codex.threadFindBar.noResults", defaultMessage: "0 results" });
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
          // codex review-runtime-bridge input: type `text` (no native WebKit
          // clear button — navigation/close are drawn as their own buttons).
          type="text"
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
      {/* codex review-runtime-bridge Frame: row 1 = Input | Navigation | Close
          (grid minmax(0,1fr) auto auto); the ResultLabel is NOT an inline cell —
          it spans row 2 (col 1/4, right-aligned, slide/fade). Inline fixed-width
          count used to overlap the chevrons. */}
      <div className="hc-thread-find-nav">
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
      </div>
      <button
        type="button"
        className="hc-thread-find-icon-button"
        aria-label={closeLabel}
        title={closeLabel}
        onClick={onClose}
      >
        <X size={14} aria-hidden="true" />
      </button>
      <span
        className="hc-thread-find-count"
        data-open={hasQuery || undefined}
        aria-live="polite"
      >
        {countLabel}
      </span>
    </div>
  );
}
