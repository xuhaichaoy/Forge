import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { normalizeTableRow } from "../state/conversation-markdown-engine";
import type {
  MarkdownBlock,
  MarkdownReferenceDefinitions,
  MarkdownTableAlign,
} from "../state/conversation-markdown-engine";
import type { FileReference } from "./file-reference-types";
import { useForgeIntl } from "./i18n-provider";
import { writeMarkdownClipboard } from "./message-markdown-copy";
import type { MarkdownFadeContext } from "./message-markdown-inline-renderer";
import { renderInline } from "./message-markdown-inline-renderer";
import { Tooltip } from "./tooltip";

const TABLE_COPIED_RESET_TIMEOUT_MS = 2_000;

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
  const [copied, setCopied] = useState(false);
  const mountedRef = useRef(true);
  const copiedResetTimeoutRef = useRef<number | null>(null);
  const { formatMessage } = useForgeIntl();
  const copyLabel = formatMessage({
    id: "markdown.copyTable",
    defaultMessage: "Copy table",
    description: "Tooltip and accessible label for copying a Markdown table",
  });
  const copiedLabel = formatMessage({
    id: "copyButton.copiedAriaLabel",
    defaultMessage: "Copied",
  });
  const activeCopyLabel = copied ? copiedLabel : copyLabel;
  const markdownSource = markdownTableSource(block);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (copiedResetTimeoutRef.current !== null) {
        window.clearTimeout(copiedResetTimeoutRef.current);
        copiedResetTimeoutRef.current = null;
      }
    };
  }, []);
  return (
    <div className="hc-markdown-table-wrap">
      <div className="hc-markdown-table-inner" data-markdown-table tabIndex={-1}>
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
        <div className="hc-markdown-table-copy" data-markdown-copy="exclude">
          <Tooltip content={activeCopyLabel}>
            <button
              aria-label={activeCopyLabel}
              type="button"
              onClick={async (event) => {
                event.stopPropagation();
                const table = event.currentTarget.closest("[data-markdown-table]")?.querySelector("table");
                const htmlText = table?.outerHTML ?? "";
                if (!htmlText) return;
                const copiedToClipboard = await writeMarkdownClipboard({ plainText: markdownSource, htmlText }, event.currentTarget);
                if (!copiedToClipboard || !mountedRef.current) return;
                setCopied(true);
                if (copiedResetTimeoutRef.current !== null) {
                  window.clearTimeout(copiedResetTimeoutRef.current);
                }
                copiedResetTimeoutRef.current = window.setTimeout(() => {
                  copiedResetTimeoutRef.current = null;
                  if (mountedRef.current) setCopied(false);
                }, TABLE_COPIED_RESET_TIMEOUT_MS);
              }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

function markdownTableSource(block: MarkdownTableBlock): string {
  const widths = block.headers.map((header, index) =>
    Math.max(
      tableCellText(header).length,
      3,
      ...block.rows.map((row) => tableCellText(row[index] ?? "").length),
    )
  );
  const header = markdownTableRow(block.headers, widths);
  const separator = markdownTableRow(widths.map((width, index) => tableSeparator(width, block.aligns?.[index])), widths);
  const rows = block.rows.map((row) => markdownTableRow(normalizeTableRow(row, block.headers.length), widths));
  return [header, separator, ...rows].join("\n");
}

function markdownTableRow(cells: string[], widths: number[]): string {
  return `| ${cells.map((cell, index) => tableCellText(cell).padEnd(widths[index] ?? 3, " ")).join(" | ")} |`;
}

function tableSeparator(width: number, align: MarkdownTableAlign | undefined): string {
  const dashCount = Math.max(width, 3);
  if (align === "center") return `:${"-".repeat(Math.max(dashCount - 2, 1))}:`;
  if (align === "right") return `${"-".repeat(Math.max(dashCount - 1, 2))}:`;
  if (align === "left") return `:${"-".repeat(Math.max(dashCount - 1, 2))}`;
  return "-".repeat(dashCount);
}

function tableCellText(value: string): string {
  return value.replace(/\s+/g, " ").trim().replace(/\|/g, "\\|");
}
