import { Braces, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { formatUnknown, stringField } from "../lib/format";
import {
  itemType,
  mcpServerName,
  mcpToolName,
  type AccumulatedThreadItem,
} from "../state/render-groups";
import { useHiCodexIntl, type HiCodexIntlContextValue } from "./i18n-provider";

type ThreadItem = AccumulatedThreadItem;
type ItemRecord = ThreadItem & Record<string, unknown>;
type ToolDetailFormatMessage = HiCodexIntlContextValue["formatMessage"];

export function rawMcpToolOutputForItem(item: ThreadItem, running: boolean, formatMessage: ToolDetailFormatMessage): { heading: string; text: string } | null {
  if (itemType(item) !== "mcp-tool-call") return null;
  const record = item as ItemRecord;
  if (running && record.result == null) return null;
  const server = mcpServerName(item) || "mcp";
  const tool = mcpToolName(item) || "tool";
  const invocation = recordObject(record.invocation);
  const fallbackInvocation = {
    server: stringField(record, "server") || server,
    tool: stringField(record, "tool") || tool,
    arguments: record.arguments ?? null,
  };
  return {
    // codex: codex.mcpTool.rawOutputHeading - "Raw {server}.{tool} tool call output".
    heading: formatMessage({ id: "codex.mcpTool.rawOutputHeading", defaultMessage: "Raw {server}.{tool} tool call output" }, { server, tool }),
    text: formatJsonForRawMcpOutput({
      callId: stringField(record, "callId") || record.id,
      invocation: Object.keys(invocation).length > 0 ? invocation : fallbackInvocation,
      durationMs: typeof record.durationMs === "number" && Number.isFinite(record.durationMs) ? record.durationMs : null,
      result: record.result ?? null,
    }),
  };
}

export function formatJsonForRawMcpOutput(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, rawValue) => typeof rawValue === "bigint" ? rawValue.toString() : rawValue, 2) ?? "null";
  } catch {
    return formatUnknown(value);
  }
}

export function RawToolOutputButton({ heading, inlineApp = false, text }: { heading: string; inlineApp?: boolean; text: string }) {
  const { formatMessage } = useHiCodexIntl();
  const [open, setOpen] = useState(false);
  if (!text.trim()) return null;
  const dialog = open ? (
    <div
      className="hc-tool-raw-output-overlay"
      onClick={() => setOpen(false)}
    >
      <section
        aria-label={heading}
        aria-modal="true"
        className="hc-tool-raw-output-dialog"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          // codex: Radix dialog closes on Escape; match it (the other HiCodex dialogs do).
          if (event.key === "Escape") {
            event.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <header>
          <h2>{heading}</h2>
          <button
            aria-label={formatMessage({ id: "hc.toolDetail.rawOutput.closeAriaLabel", defaultMessage: "Close raw tool call output" })}
            type="button"
            autoFocus
            onClick={() => setOpen(false)}
          >
            <X size={15} />
          </button>
        </header>
        <div className="hc-tool-raw-output-body">
          <CodeBlock text={text} />
        </div>
      </section>
    </div>
  ) : null;

  return (
    <div className={`hc-tool-raw-output ${inlineApp ? "is-inline-app" : ""}`}>
      <button
        aria-label={formatMessage({ id: "codex.mcpTool.rawOutputTriggerTooltip", defaultMessage: "Show raw tool call output" })}
        className="hc-tool-raw-output-trigger"
        title={formatMessage({ id: "codex.mcpTool.rawOutputTriggerTooltip", defaultMessage: "Show raw tool call output" })}
        type="button"
        onClick={() => setOpen(true)}
      >
        <Braces size={13} />
      </button>
      {dialog && (typeof document === "undefined" ? dialog : createPortal(dialog, document.body))}
    </div>
  );
}

export function LabeledCode({ label, text }: { label: string; text: string }) {
  return (
    <div className="hc-tool-detail-section">
      <div className="hc-tool-detail-section-label">{label}</div>
      <CodeBlock text={text} />
    </div>
  );
}

export function CodeBlock({ text, diff = false }: { text: string; diff?: boolean }) {
  return (
    <pre className={diff ? "is-diff" : undefined}>
      <code>{diff ? renderDiffText(text) : text}</code>
    </pre>
  );
}

export function renderDiffText(text: string): ReactNode[] {
  return text.split("\n").map((line, index) => {
    const className = line.startsWith("+")
      ? "hc-diff-add"
      : line.startsWith("-")
        ? "hc-diff-remove"
        : line.startsWith("@@")
          ? "hc-diff-hunk"
          : "hc-diff-context";
    return <span className={className} key={index}>{line || " "}</span>;
  });
}

function recordObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
