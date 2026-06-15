// codex: local-conversation-thread-*.js — Codex renders each automation
// citation as a small interactive card driven by mode/status (the automation
// citation card). Forge collapses the card into a chip — same content
// shape, simpler styling — but keeps the icon + title + optional metadata
// layout so the visual scan reads the same as Codex's `mt-3 flex flex-wrap
// gap-1.5` row of citation cards (the bundle spreads `e.arguments` onto each
// card).

import { Clock } from "lucide-react";
import type { CitationDirective } from "../state/automation-citations";
import { useForgeIntl } from "./i18n-provider";

export interface AutomationCitationChipProps {
  citation: CitationDirective;
  onOpen?: () => void;
}

// codex automation.updateDirective.* — the chip verb is one of a fixed set the
// data layer emits in English (automationCitationActionLabel). Reverse-map the
// English literal to its i18n id so Chinese mode shows the localized verb while
// the locale-free data layer / tests stay stable. Covers both citation sources
// (computed-from-item and markdown-attr directives).
const AUTOMATION_ACTION_I18N: Record<string, { id: string; defaultMessage: string }> = {
  Created: { id: "automation.updateDirective.created", defaultMessage: "Created" },
  Updated: { id: "automation.updateDirective.updated", defaultMessage: "Updated" },
  Deleted: { id: "automation.updateDirective.deleted", defaultMessage: "Deleted" },
  Missing: { id: "automation.updateDirective.missing", defaultMessage: "Missing" },
  Proposed: { id: "automation.updateDirective.proposed", defaultMessage: "Proposed" },
  "Proposed update": { id: "automation.updateDirective.proposedUpdate", defaultMessage: "Proposed update" },
  Automation: { id: "automation.updateDirective.automation", defaultMessage: "Automation" },
};

// codex: local-conversation-thread-*.js — single chip render. The
// Codex card surfaces `name||"Untitled automation"` as the primary line and
// (optionally) the schedule/status as a subtitle. We mirror the primary line
// (title || id) and the optional url subtitle; the rest of the bag goes into
// the `title` attribute for hover discoverability.
export function AutomationCitationChip({ citation, onOpen }: AutomationCitationChipProps) {
  const { formatMessage } = useForgeIntl();
  const rawLabel = (citation.title?.trim() || citation.id).trim();
  const label = rawLabel === "Untitled automation"
    ? formatMessage({ id: "automation.updateDirective.untitled", defaultMessage: "Untitled automation" })
    : rawLabel;
  const rawAction = citation.actionLabel?.trim() || "";
  const actionDescriptor = rawAction ? AUTOMATION_ACTION_I18N[rawAction] : undefined;
  const actionLabel = actionDescriptor ? formatMessage(actionDescriptor) : rawAction;
  const tooltipPieces: string[] = [];
  if (actionLabel) tooltipPieces.push(actionLabel);
  if (citation.title) tooltipPieces.push(citation.title);
  if (citation.schedule) tooltipPieces.push(citation.schedule);
  if (citation.url) tooltipPieces.push(citation.url);
  if (citation.source) tooltipPieces.push(`source: ${citation.source}`);
  tooltipPieces.push(`id: ${citation.id}`);
  const tooltip = tooltipPieces.join("\n");
  const className = "hc-automation-citation-chip";
  const visibleLabel = actionLabel ? `${actionLabel} · ${label}` : label;
  const ariaLabel = `Automation: ${visibleLabel}`;
  const labelContent = (
    <>
      {actionLabel && <span className="hc-automation-citation-chip-action">{actionLabel}</span>}
      {actionLabel && <span className="hc-automation-citation-chip-separator">·</span>}
      <span className="hc-automation-citation-chip-label">{label}</span>
    </>
  );

  /*
   * Codex's citation card becomes a real button only when it has an action
   * handler; the static "view-only" form is rendered as a div with the same
   * chrome so focus rings/keyboard semantics don't lie about clickability.
   * Match that here — give the caller two affordances depending on whether
   * onOpen is provided.
   */
  if (onOpen) {
    return (
      <button
        aria-label={ariaLabel}
        className={className}
        data-citation-id={citation.id}
        onClick={onOpen}
        title={tooltip}
        type="button"
      >
        <Clock aria-hidden className="hc-automation-citation-chip-icon" size={12} />
        {labelContent}
        {citation.schedule || citation.url ? (
          <span className="hc-automation-citation-chip-meta" title={citation.schedule || citation.url}>
            {citation.schedule || compactUrlLabel(citation.url ?? "")}
          </span>
        ) : null}
      </button>
    );
  }
  return (
    <span
      aria-label={ariaLabel}
      className={className}
      data-citation-id={citation.id}
      title={tooltip}
    >
      <Clock aria-hidden className="hc-automation-citation-chip-icon" size={12} />
      {labelContent}
      {citation.schedule || citation.url ? (
        <span className="hc-automation-citation-chip-meta" title={citation.schedule || citation.url}>
          {citation.schedule || compactUrlLabel(citation.url ?? "")}
        </span>
      ) : null}
    </span>
  );
}

export interface AutomationCitationChipRowProps {
  citations: CitationDirective[];
  // codex: local-conversation-thread-*.js — Codex passes the same
  // `onAutomationCitationOpen` callback to every chip in the row (the spread
  // `{...e.arguments}` includes it on each citation card); Forge follows suit.
  onOpen?: (citation: CitationDirective) => void;
}

// codex: local-conversation-thread-*.js — the citation row is
// `citations.length > 0 ? <div className="mt-3 flex flex-wrap gap-1.5">{…}</div>
// : null`. The outer div is the fallback chip row Forge uses when citations
// don't fit the trailing-paragraph inline path.
export function AutomationCitationChipRow({ citations, onOpen }: AutomationCitationChipRowProps) {
  if (citations.length === 0) return null;
  return (
    <div className="hc-automation-citation-row" role="list">
      {citations.map((citation, index) => (
        <span className="hc-automation-citation-row-item" key={`${citation.id}-${index}`} role="listitem">
          <AutomationCitationChip
            citation={citation}
            onOpen={onOpen && automationCitationOpenId(citation) ? () => onOpen(citation) : undefined}
          />
        </span>
      ))}
    </div>
  );
}

function automationCitationOpenId(citation: CitationDirective): string | null {
  const id = citation.openAutomationId?.trim() ?? "";
  return id.length > 0 ? id : null;
}

/*
 * Codex displays the URL host only in the chip meta slot so long URLs don't
 * blow out the row. Mirror that here — try URL parsing first, fall back to a
 * truncated string so non-conforming hrefs (e.g. `app://...`) still render.
 */
function compactUrlLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname || parsed.protocol.replace(/:$/, "");
    return host.length > 32 ? `${host.slice(0, 29)}...` : host;
  } catch {
    return url.length > 32 ? `${url.slice(0, 29)}...` : url;
  }
}
