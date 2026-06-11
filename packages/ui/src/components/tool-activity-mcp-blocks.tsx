import { useHiCodexIntl } from "./i18n-provider";
import {
  CodeBlock,
  LabeledCode,
} from "./tool-activity-code";
import type { McpResultBlock } from "./tool-activity-mcp-result";

export function McpResultBlocksView({ blocks }: { blocks: McpResultBlock[] }) {
  return (
    <div className="hc-mcp-result-blocks">
      {blocks.map((block, index) => (
        <McpResultBlockView block={block} index={index} key={`${block.kind}:${index}`} />
      ))}
    </div>
  );
}

function McpResultBlockView({ block, index }: { block: McpResultBlock; index: number }) {
  const { formatMessage } = useHiCodexIntl();
  switch (block.kind) {
    case "text":
      return <McpPlaintextCard text={mcpTextBlockDisplayText(block)} />;
    case "image":
      return (
        <div className="hc-mcp-result-block hc-mcp-result-image">
          <img alt={formatMessage({ id: "hc.toolDetail.mcp.imageResultAlt", defaultMessage: "MCP image result" })} className="hc-mcp-result-image-thumb" src={block.dataUrl} />
          {block.annotations && <small className="hc-mcp-result-annotations">{formatMessage({ id: "codex.mcpTool.contentBlock.annotationsLine", defaultMessage: "Annotations: {annotations}" }, { annotations: block.annotations })}</small>}
        </div>
      );
    case "audio":
      return (
        <div className="hc-mcp-result-block hc-mcp-result-audio">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls src={block.dataUrl} />
          {block.annotations && <small className="hc-mcp-result-annotations">{formatMessage({ id: "codex.mcpTool.contentBlock.annotationsLine", defaultMessage: "Annotations: {annotations}" }, { annotations: block.annotations })}</small>}
        </div>
      );
    case "resourceLink": {
      const label = block.title || block.name || block.uri;
      return (
        <div className="hc-mcp-result-block hc-mcp-result-resource-link">
          <div className="hc-mcp-result-resource-link-text">{formatMessage({ id: "codex.mcpTool.resourceLink.reading", defaultMessage: "Read {resourceLinkName}" }, { resourceLinkName: label })}</div>
          {block.annotations && <small className="hc-mcp-result-annotations">{formatMessage({ id: "codex.mcpTool.contentBlock.annotationsLine", defaultMessage: "Annotations: {annotations}" }, { annotations: block.annotations })}</small>}
        </div>
      );
    }
    case "embeddedResource":
      return (
        <div className="hc-mcp-result-block hc-mcp-result-embedded-resource">
          {block.uri && (
            <div className="hc-mcp-result-resource-meta">
              <span>{formatMessage({ id: "codex.mcpTool.embeddedResource.uriLabel", defaultMessage: "URI" })}</span><code>{block.uri}</code>
            </div>
          )}
          {block.mimeType && (
            <div className="hc-mcp-result-resource-meta">
              <span>{formatMessage({ id: "codex.mcpTool.embeddedResource.mimeTypeLabel", defaultMessage: "MIME type" })}</span><code>{block.mimeType}</code>
            </div>
          )}
          {block.annotations && (
            <div className="hc-mcp-result-resource-meta">
              <span>{formatMessage({ id: "codex.mcpTool.embeddedResource.annotationsLabel", defaultMessage: "Annotations" })}</span><span>{block.annotations}</span>
            </div>
          )}
          {block.text && <LabeledCode label={formatMessage({ id: "codex.mcpTool.embeddedResource.contentLabel", defaultMessage: "Content" })} text={block.text} />}
        </div>
      );
    case "unknown":
    default:
      return (
        <div className="hc-mcp-result-block hc-mcp-result-unknown">
          <CodeBlock text={block.raw} />
        </div>
      );
  }
}

function mcpTextBlockDisplayText(block: Extract<McpResultBlock, { kind: "text" }>): string {
  return block.annotations ? `${block.text}\nAnnotations: ${block.annotations}` : block.text;
}

function McpPlaintextCard({ text }: { text: string }) {
  const { formatMessage } = useHiCodexIntl();
  return (
    <div className="hc-mcp-result-text">
      <div className="hc-mcp-result-text-header">
        <span className="hc-mcp-result-text-title">
          {formatMessage({ id: "codex.mcpTool.textBlock.plaintextTitle", defaultMessage: "plaintext" })}
        </span>
        <span className="hc-mcp-result-text-header-actions" aria-hidden="true" />
      </div>
      <div className="hc-mcp-plaintext-body">{text}</div>
    </div>
  );
}
