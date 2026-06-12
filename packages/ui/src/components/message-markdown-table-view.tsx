import { normalizeTableRow } from "../state/conversation-markdown-engine";
import type {
  MarkdownBlock,
  MarkdownReferenceDefinitions,
} from "../state/conversation-markdown-engine";
import type { FileReference } from "./file-reference-types";
import type { MarkdownFadeContext } from "./message-markdown-inline-renderer";
import { renderInline } from "./message-markdown-inline-renderer";

type MarkdownTableBlock = Extract<MarkdownBlock, { kind: "table" }>;

interface MarkdownTableViewProps {
  block: MarkdownTableBlock;
  fadeContext?: MarkdownFadeContext | null;
  mediaSources?: Map<string, string>;
  onOpenFileReference?: (reference: FileReference) => void;
  onOpenFileReferenceExternal?: (reference: FileReference) => void;
  references?: MarkdownReferenceDefinitions;
}

export function MarkdownTableView({
  block,
  fadeContext,
  mediaSources,
  onOpenFileReference,
  onOpenFileReferenceExternal,
  references,
}: MarkdownTableViewProps) {
  return (
    <div className="hc-markdown-table-wrap">
      <table>
        <thead>
          <tr>
            {block.headers.map((header, index) => (
              <th align={block.aligns?.[index] ?? undefined} key={index}>
                {renderInline(header, onOpenFileReference, mediaSources, fadeContext, { references }, onOpenFileReferenceExternal)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {normalizeTableRow(row, block.headers.length).map((cell, cellIndex) => (
                <td align={block.aligns?.[cellIndex] ?? undefined} key={cellIndex}>
                  {renderInline(cell, onOpenFileReference, mediaSources, fadeContext, { references }, onOpenFileReferenceExternal)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
