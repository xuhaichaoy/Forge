/*
 * codex: file-tree-search-input-Cg1SVtq4.pretty.js :qc (lines 10238–10328)
 *   - controlled input bound to `searchQuery` atom
 *   - placeholder defaultMessage `Filter files…` (Unicode U+2026 horizontal
 *     ellipsis, verified via `rg "Filter files" /private/tmp/codex-asar/webview/assets/`)
 *   - clear `×` button rendered when `searchQuery.length > 0` (:10293–10307)
 *   - `aria-label` mirrors the placeholder for screen readers
 *
 * Codex also wraps the input in a `<search>` element and uses a leading magnifier
 * icon. HiCodex MVP keeps the minimal layout; we can add the icon once the rest
 * of the panel chrome is in place.
 */
import { Search, X } from "lucide-react";

export interface FileTreeSearchInputProps {
  searchQuery: string;
  onQueryChange: (next: string) => void;
  autoFocus?: boolean;
  inputId?: string;
}

export function FileTreeSearchInput({
  searchQuery,
  onQueryChange,
  autoFocus,
  inputId,
}: FileTreeSearchInputProps) {
  return (
    <div className="hc-file-tree-search">
      <Search className="hc-file-tree-search-leading" size={13} aria-hidden="true" />
      <input
        id={inputId}
        type="search"
        className="hc-file-tree-search-input"
        placeholder="Filter files…"
        aria-label="Filter files"
        value={searchQuery}
        autoFocus={autoFocus}
        // codex: qc onChange (controlled, no debounce — fuzzy session streams on each keystroke)
        onChange={(event) => onQueryChange(event.target.value)}
      />
      {/* codex: qc clear button — visible only when query non-empty */}
      {searchQuery.length > 0 ? (
        <button
          type="button"
          className="hc-file-tree-search-clear"
          aria-label="Clear file filter"
          onClick={() => onQueryChange("")}
        >
          <X size={12} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
