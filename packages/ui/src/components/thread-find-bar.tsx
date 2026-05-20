import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { useEffect, useRef } from "react";

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

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusToken]);

  return (
    <div className="hc-thread-find-bar" role="search" aria-label="Find in thread">
      <label className="hc-thread-find-input">
        <Search size={14} aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder="Find"
          aria-label="Find in thread"
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
        aria-label="Previous match"
        title="Previous match"
        disabled={!canNavigate}
        onClick={onPrevious}
      >
        <ChevronUp size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="hc-thread-find-icon-button"
        aria-label="Next match"
        title="Next match"
        disabled={!canNavigate}
        onClick={onNext}
      >
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="hc-thread-find-icon-button"
        aria-label="Close find"
        title="Close find"
        onClick={onClose}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
