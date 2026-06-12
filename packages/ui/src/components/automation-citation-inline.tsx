import type { CitationDirective } from "../state/automation-citations";
import { AutomationCitationChip } from "./automation-citation";

export function InlineAutomationCitations({
  citations,
  onOpen,
}: {
  citations?: CitationDirective[];
  onOpen?: (citation: CitationDirective) => void;
}) {
  if (!citations || citations.length === 0) return null;
  return (
    <span className="hc-automation-citation-inline-list">
      {citations.map((citation, index) => (
        <span className="hc-automation-citation-inline-item" key={`${citation.id}-${index}`}>
          <AutomationCitationChip
            citation={citation}
            onOpen={onOpen && citation.openAutomationId?.trim() ? () => onOpen(citation) : undefined}
          />
        </span>
      ))}
    </span>
  );
}
