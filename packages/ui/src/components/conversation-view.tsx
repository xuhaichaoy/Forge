import { convertFileSrc } from "@tauri-apps/api/core";
import {
  Activity,
  AtSign,
  Brain,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  FileImage,
  FilePenLine,
  ListChecks,
  Loader2,
  PlugZap,
  Search,
  Sparkles,
  SquareTerminal,
  Terminal,
  WrapText,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import {
  type ConversationRenderUnit,
  type EventFormat,
  type EventTone,
  type ToolActivityIcon,
  type UserMessageContentPart,
} from "../state/render-groups";
import { ToolActivityDetail } from "./tool-activity-detail";

export interface ConversationViewProps {
  units: ConversationRenderUnit[];
  emptyState?: ReactNode;
  onOpenFileReference?: (reference: FileReference) => void;
  onOpenThreadId?: (threadId: string) => void;
}

export interface FileReference {
  path: string;
  lineStart: number;
  lineEnd?: number;
}

export function ConversationView({
  units,
  emptyState = null,
  onOpenFileReference,
  onOpenThreadId,
}: ConversationViewProps) {
  if (units.length === 0) {
    return <>{emptyState}</>;
  }

  return (
    <>
      {units.map((unit) => (
        <ConversationUnitView
          key={unit.key}
          unit={unit}
          onOpenFileReference={onOpenFileReference}
          onOpenThreadId={onOpenThreadId}
        />
      ))}
    </>
  );
}

export function ConversationUnitView({
  unit,
  onOpenFileReference,
  onOpenThreadId,
}: {
  unit: ConversationRenderUnit;
  onOpenFileReference?: (reference: FileReference) => void;
  onOpenThreadId?: (threadId: string) => void;
}) {
  if (unit.kind === "message") {
    const assistantPhase = unit.role === "assistant" ? unit.assistantPhase ?? "unknown" : undefined;
    const streaming = unit.role === "assistant" && unit.isStreaming === true;
    const renderPlaceholder = unit.role === "assistant" && unit.renderPlaceholder === true;
    const citation = unit.role === "assistant"
      ? (
          <MemoryCitationView
            citation={(unit.item as { memoryCitation?: unknown }).memoryCitation}
            onOpenFileReference={onOpenFileReference}
          />
        )
      : null;
    return (
      <article
        className={`hc-message ${unit.role}${assistantPhase ? ` phase-${assistantPhase}` : ""}${streaming ? " is-streaming" : ""}`}
        data-phase={assistantPhase}
        data-role={unit.role}
      >
        {unit.role === "user"
          ? (
              <div className="hc-user-message-bubble">
                <UserMessageContentView unit={unit} onOpenFileReference={onOpenFileReference} />
              </div>
            )
          : (
              renderPlaceholder
                ? (
                    <div className="hc-assistant-placeholder" aria-label="Assistant response is loading">
                      <Loader2 className="hc-spin" size={16} />
                    </div>
                  )
                : (
                    <>
                      <Markdownish
                        text={unit.text}
                        onOpenFileReference={onOpenFileReference}
                        trailingInline={streaming ? <StreamingCursor /> : null}
                      />
                      {citation}
                    </>
                  )
            )}
      </article>
    );
  }
  if (unit.kind === "toolActivity") {
    return <ToolActivityView unit={unit} onOpenThreadId={onOpenThreadId} />;
  }
  return (
    <ToolBlock
      format={unit.format}
      label={unit.label}
      onOpenFileReference={onOpenFileReference}
      tone={unit.tone}
      value={unit.text}
    />
  );
}

function UserMessageContentView({
  unit,
  onOpenFileReference,
}: {
  unit: Extract<ConversationRenderUnit, { kind: "message" }>;
  onOpenFileReference?: (reference: FileReference) => void;
}) {
  const content = unit.userContent?.filter((part) => part.kind !== "text" || part.text.trim().length > 0) ?? [];
  if (content.length === 0) {
    return <Markdownish text={unit.text} onOpenFileReference={onOpenFileReference} />;
  }
  return (
    <div className="hc-user-message-content">
      {content.map((part, index) => (
        <UserMessageContentPartView
          key={userContentPartKey(part, index)}
          part={part}
          onOpenFileReference={onOpenFileReference}
        />
      ))}
    </div>
  );
}

function UserMessageContentPartView({
  part,
  onOpenFileReference,
}: {
  part: UserMessageContentPart;
  onOpenFileReference?: (reference: FileReference) => void;
}) {
  if (part.kind === "text") {
    return (
      <div className="hc-user-message-text" data-text-elements={part.textElements.length || undefined}>
        <Markdownish text={part.text} onOpenFileReference={onOpenFileReference} />
      </div>
    );
  }
  if (part.kind === "image") {
    return <UserMessageImagePartView part={part} />;
  }
  const icon = part.chipKind === "mention" ? <AtSign size={13} /> : <Sparkles size={13} />;
  const label = `${part.chipKind === "mention" ? "@" : "$"}${part.label}`;
  if (part.chipKind === "mention" && part.path && onOpenFileReference) {
    return (
      <button
        className="hc-user-chip hc-user-chip-button"
        title={part.path}
        type="button"
        onClick={() => onOpenFileReference({ path: part.path, lineStart: 1 })}
      >
        {icon}
        <span>{label}</span>
      </button>
    );
  }
  return (
    <span className="hc-user-chip" title={part.path || part.label}>
      {icon}
      <span>{label}</span>
    </span>
  );
}

function UserMessageImagePartView({
  part,
}: {
  part: Extract<UserMessageContentPart, { kind: "image" }>;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const src = userImageSrc(part);
  useEffect(() => {
    if (!previewOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [previewOpen]);

  return (
    <>
      <button
        aria-label={part.label}
        className="hc-user-image-card"
        title={part.label}
        type="button"
        onClick={() => setPreviewOpen(true)}
      >
        {imageFailed
          ? (
              <span className="hc-user-image-fallback">
                <FileImage size={18} />
                <span>{part.label}</span>
              </span>
            )
          : (
              <img
                alt={part.label}
                referrerPolicy="no-referrer"
                src={src}
                onError={() => setImageFailed(true)}
              />
            )}
      </button>
      {previewOpen && (
        <div
          className="hc-image-preview-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setPreviewOpen(false);
          }}
        >
          <div aria-label={part.label} aria-modal="true" className="hc-image-preview-dialog" role="dialog">
            <div className="hc-image-preview-header">
              <span>{part.label}</span>
              <button aria-label="Close image preview" type="button" onClick={() => setPreviewOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <img alt={part.label} referrerPolicy="no-referrer" src={src} />
          </div>
        </div>
      )}
    </>
  );
}

function userContentPartKey(part: UserMessageContentPart, index: number): string {
  if (part.kind === "text") return `text:${index}:${part.text.slice(0, 32)}`;
  if (part.kind === "image") return `image:${index}:${part.src}`;
  return `chip:${index}:${part.chipKind}:${part.path || part.label}`;
}

export function userImageSrc(part: Extract<UserMessageContentPart, { kind: "image" }>): string {
  if (part.source !== "local") return part.src;
  if (/^file:/i.test(part.src)) {
    const path = fileUrlToPath(part.src);
    if (path && isTauriRuntime()) return convertFileSrc(path);
    return part.src;
  }
  if (/^(?:data|blob|https?):/i.test(part.src)) return part.src;
  if (isTauriRuntime()) return convertFileSrc(part.src);
  const normalizedPath = part.src.startsWith("/") ? part.src : `/${part.src}`;
  return `file://${encodeURI(normalizedPath)}`;
}

function fileUrlToPath(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "file:") return null;
    return decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
}

function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const runtimeWindow = window as Window & {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  };
  return Boolean(runtimeWindow.__TAURI_INTERNALS__ || runtimeWindow.__TAURI__);
}

export function ToolActivityView({
  unit,
  onOpenThreadId,
}: {
  unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>;
  onOpenThreadId?: (threadId: string) => void;
}) {
  const defaultExpanded = initialToolActivityExpanded(unit);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isWorkedFor = unit.summary.groupType === "worked-for";
  const detailItems = toolActivityDetailItems(unit);
  const canExpand = isToolActivityExpandable(unit);
  const summaryLabel = useToolActivitySummaryLabel(unit);
  const detail = unit.summary.details.find((value) => value !== unit.summary.label);
  useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded, unit.key]);
  return (
    <article
      className={`hc-tool-block activity ${unit.summary.inProgress ? "is-running" : ""}`}
      data-group-type={unit.summary.groupType}
      data-item-ids={unit.items.map((item) => item.id).join(" ")}
    >
      <button
        aria-expanded={expanded}
        className="hc-tool-summary"
        disabled={!canExpand}
        type="button"
        onClick={() => setExpanded((value) => !value)}
      >
        {!isWorkedFor && activityIcon(unit.summary.icon)}
        <span>{summaryLabel}</span>
        {!isWorkedFor && unit.summary.inProgress && detail && <small>{detail}</small>}
        {canExpand && <ChevronRight className={expanded ? "is-open" : ""} size={14} />}
      </button>
      {isWorkedFor && <div className="hc-worked-for-divider" />}
      {expanded && (
        <div className="hc-tool-details">
          {detailItems.map((item) => (
            <ToolActivityDetail item={item} key={item.id} onOpenThreadId={onOpenThreadId} />
          ))}
        </div>
      )}
    </article>
  );
}

function useToolActivitySummaryLabel(unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>): string {
  const [now, setNow] = useState(() => Date.now());
  const workedForItem = unit.summary.groupType === "worked-for" ? workedForActivityItem(unit.items) : undefined;
  const status = typeof workedForItem?.status === "string" ? workedForItem.status : "";
  const startedAtMs = numberField(workedForItem, "startedAtMs");
  const completedAtMs = numberField(workedForItem, "completedAtMs");

  useEffect(() => {
    if (status !== "working" || startedAtMs === null || completedAtMs !== null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [completedAtMs, startedAtMs, status]);

  if (!workedForItem || startedAtMs === null || status !== "working") return unit.summary.label;
  const elapsedMs = Math.max((completedAtMs ?? now) - startedAtMs, 0);
  return elapsedMs >= 1_000 ? `Working for ${formatWorkedDuration(elapsedMs)}` : "Working";
}

export function initialToolActivityExpanded(unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>): boolean {
  if (typeof unit.summary.defaultExpanded === "boolean") return unit.summary.defaultExpanded;
  if (unit.summary.groupType === "web-search-group") return !unit.summary.inProgress;
  return (
    unit.summary.inProgress
    && (unit.summary.groupType === "reasoning" || unit.summary.groupType === "multi-agent-group")
  );
}

export function isToolActivityExpandable(unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>): boolean {
  if (unit.summary.groupType === "web-search-group" && unit.summary.inProgress) return false;
  return toolActivityDetailItems(unit).length > 0;
}

function numberField(record: Record<string, unknown> | undefined, field: string): number | null {
  const value = record?.[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toolActivityDetailItems(unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>) {
  if (unit.summary.groupType !== "worked-for") return unit.items;
  return unit.items.filter((item) => item.type !== "worked-for" && item.type !== "workedFor");
}

function workedForActivityItem(items: Extract<ConversationRenderUnit, { kind: "toolActivity" }>["items"]) {
  return items.find((item) => item.type === "worked-for" || item.type === "workedFor") as Record<string, unknown> | undefined;
}

function formatWorkedDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1_000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function activityIcon(icon: ToolActivityIcon) {
  switch (icon) {
    case "reasoning":
      return <Brain size={14} />;
    case "mcp":
      return <PlugZap size={14} />;
    case "clock":
      return <Clock3 size={14} />;
    case "plan":
      return <ListChecks size={14} />;
    case "edit":
      return <FilePenLine size={14} />;
    case "search":
    case "web-search":
      return <Search size={14} />;
    case "terminal":
      return <SquareTerminal size={14} />;
    case "activity":
      return <Activity size={14} />;
  }
}

export function ToolBlock({
  format = "text",
  label,
  onOpenFileReference,
  tone,
  value,
}: {
  format?: EventFormat;
  label: string;
  onOpenFileReference?: (reference: FileReference) => void;
  tone?: "terminal" | EventTone;
  value: string;
}) {
  return (
    <article className={`hc-tool-block ${tone ?? ""}`}>
      <div className="hc-tool-label">
        <Terminal size={14} /> {label}
      </div>
      {format === "markdown"
        ? (
            <div className="hc-tool-markdown">
              <Markdownish text={value} onOpenFileReference={onOpenFileReference} />
            </div>
          )
        : format === "diff"
          ? <CodeSnippet language="diff" text={value || ""} />
          : <pre>{value || "..."}</pre>}
    </article>
  );
}

export function Markdownish({
  text,
  onOpenFileReference,
  trailingInline = null,
}: {
  text: string;
  onOpenFileReference?: (reference: FileReference) => void;
  trailingInline?: ReactNode;
}) {
  const blocks = parseMarkdownBlocks(text);
  const trailingBlockIndex = trailingInline ? trailingInlineTargetBlockIndex(blocks) : -1;
  return (
    <div className="hc-markdown">
      {blocks.length === 0
        ? <p>{"\u00a0"}{trailingInline}</p>
        : blocks.map((block, index) => (
            <MarkdownBlockView
              block={block}
              key={index}
              onOpenFileReference={onOpenFileReference}
              trailingInline={index === trailingBlockIndex ? trailingInline : null}
            />
          ))}
    </div>
  );
}

export type MarkdownBlock =
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "blockquote"; text: string }
  | { kind: "code"; language: string; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "taskList"; items: MarkdownTaskListItem[] }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "hr" }
  | { kind: "image"; alt: string; src: string; title: string | null };

export interface MarkdownTaskListItem {
  checked: boolean;
  text: string;
}

export type MarkdownInlineSegment =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string }
  | { kind: "fileCitation"; path: string; lineStart: number; lineEnd: number }
  | { kind: "strong"; text: string }
  | { kind: "em"; text: string }
  | { kind: "del"; text: string };

export interface MemoryCitationEntryView {
  path: string;
  lineStart: number;
  lineEnd: number;
  note: string;
}

export function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    const fence = line.match(/^```([^`]*)\s*$/);
    if (fence) {
      const language = fence[1]?.trim() ?? "";
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index] ?? "")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ kind: "code", language, text: codeLines.join("\n") });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        text: heading[2] ?? "",
      });
      index += 1;
      continue;
    }

    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ kind: "hr" });
      index += 1;
      continue;
    }

    const image = parseMarkdownImageLine(line);
    if (image) {
      blocks.push(image);
      index += 1;
      continue;
    }

    const table = parseMarkdownTable(lines, index);
    if (table) {
      blocks.push(table.block);
      index = table.nextIndex;
      continue;
    }

    const taskListMatch = parseMarkdownTaskListItem(line);
    if (taskListMatch) {
      const items: MarkdownTaskListItem[] = [];
      while (index < lines.length) {
        const item = parseMarkdownTaskListItem(lines[index] ?? "");
        if (!item) break;
        items.push(item);
        index += 1;
      }
      blocks.push({ kind: "taskList", items });
      continue;
    }

    const listMatch = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
    if (listMatch) {
      const ordered = /^\d+[.)]$/.test(listMatch[2] ?? "");
      const items: string[] = [];
      while (index < lines.length) {
        const item = (lines[index] ?? "").match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
        if (!item || /^\d+[.)]$/.test(item[2] ?? "") !== ordered) break;
        items.push(item[3] ?? "");
        index += 1;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index] ?? "")) {
        quoteLines.push((lines[index] ?? "").replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ kind: "blockquote", text: quoteLines.join("\n") });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && !isMarkdownBlockBoundary(lines[index] ?? "", lines[index + 1] ?? "")) {
      paragraph.push(lines[index] ?? "");
      index += 1;
    }
    blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
  }

  return blocks;
}

export function parseMarkdownInline(text: string): MarkdownInlineSegment[] {
  const segments: MarkdownInlineSegment[] = [];
  let index = 0;

  while (index < text.length) {
    const token = nextInlineToken(text, index);
    if (!token) {
      pushTextSegment(segments, text.slice(index));
      break;
    }
    pushTextSegment(segments, text.slice(index, token.index));
    if (token.kind === "code") {
      const end = text.indexOf("`", token.index + 1);
      if (end < 0) {
        pushTextSegment(segments, text.slice(token.index));
        break;
      }
      segments.push({ kind: "code", text: text.slice(token.index + 1, end) });
      index = end + 1;
      continue;
    }

    if (token.kind === "fileCitation") {
      const marker = parseFileCitationMarker(text, token.index);
      if (!marker) {
        pushTextSegment(segments, text.slice(token.index, token.index + 1));
        index = token.index + 1;
        continue;
      }
      segments.push({
        kind: "fileCitation",
        path: marker.path,
        lineStart: marker.lineStart,
        lineEnd: marker.lineEnd,
      });
      index = marker.endIndex;
      continue;
    }

    if (token.kind === "link") {
      const closeLabel = text.indexOf("]", token.index + 1);
      const openHref = closeLabel >= 0 ? text.indexOf("(", closeLabel + 1) : -1;
      const closeHref = openHref >= 0 ? text.indexOf(")", openHref + 1) : -1;
      if (closeLabel < 0 || openHref !== closeLabel + 1 || closeHref < 0) {
        pushTextSegment(segments, text.slice(token.index, token.index + 1));
        index = token.index + 1;
        continue;
      }
      const label = text.slice(token.index + 1, closeLabel);
      const href = normalizeMarkdownHref(text.slice(openHref + 1, closeHref));
      if (!label || !href) {
        pushTextSegment(segments, text.slice(token.index, closeHref + 1));
      } else {
        segments.push({ kind: "link", text: label, href });
      }
      index = closeHref + 1;
      continue;
    }

    const marker = token.marker;
    const end = findInlineMarkerEnd(text, token.index + marker.length, marker, token.kind);
    if (end < 0) {
      pushTextSegment(segments, text.slice(token.index, token.index + marker.length));
      index = token.index + marker.length;
      continue;
    }
    const value = text.slice(token.index + marker.length, end);
    if (!value) {
      pushTextSegment(segments, text.slice(token.index, end + marker.length));
    } else if (token.kind === "strong") {
      segments.push({ kind: "strong", text: value });
    } else if (token.kind === "del") {
      segments.push({ kind: "del", text: value });
    } else {
      segments.push({ kind: "em", text: value });
    }
    index = end + marker.length;
  }

  return segments;
}

export function memoryCitationEntries(citation: unknown): MemoryCitationEntryView[] {
  if (!citation || typeof citation !== "object") return [];
  const entries = (citation as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const path = typeof record.path === "string" ? record.path.trim() : "";
    if (!path) return [];
    const lineStart = positiveInteger(record.lineStart) ?? 1;
    const lineEnd = positiveInteger(record.lineEnd) ?? lineStart;
    const note = typeof record.note === "string" ? record.note.trim() : "";
    return [{ path, lineStart, lineEnd: Math.max(lineStart, lineEnd), note }];
  });
}

function parseMarkdownTable(lines: string[], index: number): { block: MarkdownBlock; nextIndex: number } | null {
  const headerLine = lines[index] ?? "";
  const separatorLine = lines[index + 1] ?? "";
  if (!headerLine.includes("|") || !isTableSeparatorRow(separatorLine)) return null;
  const headers = splitTableRow(headerLine);
  if (headers.length === 0) return null;

  const rows: string[][] = [];
  let nextIndex = index + 2;
  while (nextIndex < lines.length) {
    const rowLine = lines[nextIndex] ?? "";
    if (rowLine.trim().length === 0 || !rowLine.includes("|") || isMarkdownBlockBoundary(rowLine, lines[nextIndex + 1] ?? "")) {
      break;
    }
    rows.push(normalizeTableRow(splitTableRow(rowLine), headers.length));
    nextIndex += 1;
  }

  return { block: { kind: "table", headers, rows }, nextIndex };
}

function isTableSeparatorRow(line: string): boolean {
  if (!line.includes("|")) return false;
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim();
  const withoutOuterPipes = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return withoutOuterPipes.split("|").map((cell) => cell.trim());
}

function normalizeTableRow(cells: string[], width: number): string[] {
  const normalized = cells.slice(0, width);
  while (normalized.length < width) normalized.push("");
  return normalized;
}

function parseMarkdownTaskListItem(line: string): MarkdownTaskListItem | null {
  const match = line.match(/^\s{0,3}[-*+]\s+\[([ xX])]\s+(.+)$/);
  if (!match) return null;
  return {
    checked: (match[1] ?? "").toLowerCase() === "x",
    text: match[2] ?? "",
  };
}

function parseMarkdownImageLine(line: string): Extract<MarkdownBlock, { kind: "image" }> | null {
  const match = line.trim().match(/^!\[([^\]]*)]\((<[^>\n]+>|[^)\s\n]+)(?:\s+["']([^"'\n]*)["'])?\)$/);
  if (!match) return null;
  const src = normalizeMarkdownHref(match[2] ?? "");
  if (!src) return null;
  return {
    kind: "image",
    alt: match[1] ?? "",
    src,
    title: match[3] ?? null,
  };
}

type InlineToken =
  | { kind: "code"; index: number }
  | { kind: "fileCitation"; index: number }
  | { kind: "link"; index: number }
  | { kind: "del"; index: number; marker: "~~" }
  | { kind: "strong"; index: number; marker: "**" | "__" }
  | { kind: "em"; index: number; marker: "*" | "_" };

function nextInlineToken(text: string, index: number): InlineToken | null {
  const candidates: InlineToken[] = [];
  const codeIndex = text.indexOf("`", index);
  if (codeIndex >= 0) candidates.push({ kind: "code", index: codeIndex });
  const fileCitationIndex = text.indexOf("\u3010", index);
  if (fileCitationIndex >= 0) candidates.push({ kind: "fileCitation", index: fileCitationIndex });
  const linkIndex = text.indexOf("[", index);
  if (linkIndex >= 0) candidates.push({ kind: "link", index: linkIndex });
  const delIndex = text.indexOf("~~", index);
  if (delIndex >= 0) candidates.push({ kind: "del", index: delIndex, marker: "~~" });
  const strongStarIndex = text.indexOf("**", index);
  if (strongStarIndex >= 0) candidates.push({ kind: "strong", index: strongStarIndex, marker: "**" });
  const strongUnderscoreIndex = text.indexOf("__", index);
  if (strongUnderscoreIndex >= 0) candidates.push({ kind: "strong", index: strongUnderscoreIndex, marker: "__" });
  const emStarIndex = findSingleMarkerStart(text, index, "*");
  if (emStarIndex >= 0) candidates.push({ kind: "em", index: emStarIndex, marker: "*" });
  const emUnderscoreIndex = findSingleMarkerStart(text, index, "_");
  if (emUnderscoreIndex >= 0) candidates.push({ kind: "em", index: emUnderscoreIndex, marker: "_" });
  if (candidates.length === 0) return null;
  return candidates.sort((left, right) => left.index - right.index || tokenPriority(left) - tokenPriority(right))[0] ?? null;
}

function tokenPriority(token: InlineToken): number {
  if (token.kind === "code") return 0;
  if (token.kind === "fileCitation") return 1;
  if (token.kind === "link") return 2;
  if (token.kind === "del") return 3;
  if (token.kind === "strong") return 4;
  return 5;
}

function findSingleMarkerStart(text: string, index: number, marker: "*" | "_"): number {
  let cursor = index;
  while (cursor < text.length) {
    const next = text.indexOf(marker, cursor);
    if (next < 0) return -1;
    if (text[next - 1] !== marker && text[next + 1] !== marker && !isWordInternalUnderscore(text, next, marker)) {
      return next;
    }
    cursor = next + 1;
  }
  return -1;
}

function findInlineMarkerEnd(text: string, index: number, marker: string, kind: InlineToken["kind"]): number {
  let cursor = index;
  while (cursor < text.length) {
    const next = text.indexOf(marker, cursor);
    if (next < 0) return -1;
    if ((kind !== "em" || marker !== "_" || !isWordInternalUnderscore(text, next, "_")) && next > index) {
      return next;
    }
    cursor = next + marker.length;
  }
  return -1;
}

function isWordInternalUnderscore(text: string, index: number, marker: "*" | "_"): boolean {
  if (marker !== "_") return false;
  return /[A-Za-z0-9]/.test(text[index - 1] ?? "") && /[A-Za-z0-9]/.test(text[index + 1] ?? "");
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function parseFileCitationMarker(
  text: string,
  startIndex: number,
): { path: string; lineStart: number; lineEnd: number; endIndex: number } | null {
  const closeIndex = text.indexOf("\u3011", startIndex + 1);
  if (closeIndex < 0) return null;
  const content = text.slice(startIndex + 1, closeIndex);
  const match = content.match(/^(.+?)\u2020L(\d+)(?:-L?(\d+))?$/);
  if (!match) return null;
  const path = normalizeFileCitationPath(match[1] ?? "");
  const lineStart = Number(match[2]);
  const lineEnd = match[3] ? Number(match[3]) : lineStart;
  if (!path || !Number.isInteger(lineStart) || lineStart <= 0 || !Number.isInteger(lineEnd) || lineEnd <= 0) {
    return null;
  }
  return { path, lineStart, lineEnd: Math.max(lineStart, lineEnd), endIndex: closeIndex + 1 };
}

function normalizeFileCitationPath(value: string): string {
  return value.trim().replace(/^F:/, "").trim();
}

function MarkdownBlockView({
  block,
  onOpenFileReference,
  trailingInline = null,
}: {
  block: MarkdownBlock;
  onOpenFileReference?: (reference: FileReference) => void;
  trailingInline?: ReactNode;
}) {
  switch (block.kind) {
    case "heading": {
      return <Heading level={block.level}>{renderInline(block.text, onOpenFileReference)}{trailingInline}</Heading>;
    }
    case "paragraph":
      return <p>{renderInlineWithBreaks(block.text, onOpenFileReference)}{trailingInline}</p>;
    case "blockquote":
      return <blockquote>{renderInlineWithBreaks(block.text, onOpenFileReference)}{trailingInline}</blockquote>;
    case "code":
      return <CodeSnippet language={block.language} text={block.text} />;
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag>
          {block.items.map((item, index) => (
            <li key={index}>
              {renderInline(item, onOpenFileReference)}
              {index === block.items.length - 1 ? trailingInline : null}
            </li>
          ))}
        </Tag>
      );
    }
    case "taskList":
      return (
        <ul className="hc-task-list">
          {block.items.map((item, index) => (
            <li key={index}>
              <input aria-label={item.checked ? "Completed task" : "Pending task"} checked={item.checked} readOnly type="checkbox" />
              <span>
                {renderInline(item.text, onOpenFileReference)}
                {index === block.items.length - 1 ? trailingInline : null}
              </span>
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className="hc-markdown-table-wrap">
          <table>
            <thead>
              <tr>
                {block.headers.map((header, index) => (
                  <th key={index}>{renderInline(header, onOpenFileReference)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {normalizeTableRow(row, block.headers.length).map((cell, cellIndex) => (
                    <td key={cellIndex}>{renderInline(cell, onOpenFileReference)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "hr":
      return <hr />;
    case "image":
      return (
        <figure className="hc-markdown-image">
          <img alt={block.alt} src={block.src} title={block.title ?? undefined} />
          {block.alt.trim().length > 0 && <figcaption>{block.alt}</figcaption>}
        </figure>
      );
  }
}

export function CodeSnippet({ language, text }: { language: string; text: string }) {
  const [wrapped, setWrapped] = useState(false);
  const [copied, setCopied] = useState(false);
  const normalizedLanguage = language.trim().toLowerCase();
  const title = codeBlockTitle(normalizedLanguage);
  const isDiff = normalizedLanguage === "diff";

  const handleCopy = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      const selectedText = selectedTextWithin(event.currentTarget.closest(".hc-code-snippet"), window.getSelection());
      await navigator.clipboard.writeText(selectedText || text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <figure className={`hc-code-snippet ${wrapped ? "is-wrapped" : ""} ${isDiff ? "is-diff" : ""}`}>
      <figcaption>
        <span>{title}</span>
        <div className="hc-code-actions">
          <button
            aria-label={wrapped ? "Disable word wrap" : "Enable word wrap"}
            aria-pressed={wrapped}
            title={wrapped ? "Disable word wrap" : "Enable word wrap"}
            type="button"
            onClick={() => setWrapped((value) => !value)}
          >
            <WrapText size={13} />
          </button>
          <button aria-label="Copy code" title="Copy code" type="button" onClick={handleCopy}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </div>
      </figcaption>
      <pre>
        <code data-language={normalizedLanguage || undefined}>{renderCodeText(text, isDiff)}</code>
      </pre>
    </figure>
  );
}

export function codeBlockTitle(language: string): string {
  return language.trim() || "text";
}

function renderCodeText(text: string, isDiff: boolean): ReactNode {
  if (!isDiff) return text;
  const lines = text.split("\n");
  return lines.map((line, index) => (
    <span className={diffLineClassName(line)} key={index}>
      {line}
      {index < lines.length - 1 ? "\n" : null}
    </span>
  ));
}

function diffLineClassName(line: string): string {
  if (line.startsWith("+") && !line.startsWith("+++")) return "hc-diff-add";
  if (line.startsWith("-") && !line.startsWith("---")) return "hc-diff-remove";
  if (line.startsWith("@@")) return "hc-diff-hunk";
  return "hc-diff-context";
}

function Heading({ children, level }: { children: ReactNode; level: 1 | 2 | 3 | 4 | 5 | 6 }) {
  if (level === 1) return <h1>{children}</h1>;
  if (level === 2) return <h2>{children}</h2>;
  if (level === 3) return <h3>{children}</h3>;
  if (level === 4) return <h4>{children}</h4>;
  if (level === 5) return <h5>{children}</h5>;
  return <h6>{children}</h6>;
}

function MemoryCitationView({
  citation,
  onOpenFileReference,
}: {
  citation: unknown;
  onOpenFileReference?: (reference: FileReference) => void;
}) {
  const entries = memoryCitationEntries(citation);
  if (entries.length === 0) return null;
  return (
    <details className="hc-memory-citations">
      <summary>
        <ChevronRight size={12} />
        <span>{memoryCitationSummary(entries.length)}</span>
      </summary>
      <ol>
        {entries.map((entry, index) => (
          <li key={`${entry.path}:${entry.lineStart}-${entry.lineEnd}:${index}`}>
            <a
              aria-label={`Open ${displayCitationPath(entry.path)}, ${memoryCitationLineLabel(entry)}`}
              href={citationHref(entry)}
              onClick={(event) => handleFileReferenceClick(event, entry, onOpenFileReference)}
            >
              <span className="hc-memory-citation-main">
                <span className="hc-memory-citation-path" title={entry.path}>
                  {displayCitationPath(entry.path)}
                </span>
                <span className="hc-memory-citation-lines">{memoryCitationLineLabel(entry)}</span>
              </span>
              {entry.note.length > 0 && <span className="hc-memory-citation-note">{entry.note}</span>}
            </a>
          </li>
        ))}
      </ol>
    </details>
  );
}

function memoryCitationSummary(count: number): string {
  return count === 1 ? "1 memory citation" : `${count} memory citations`;
}

function memoryCitationLineLabel(entry: Pick<MemoryCitationEntryView, "lineStart" | "lineEnd">): string {
  return entry.lineStart === entry.lineEnd ? `line ${entry.lineStart}` : `lines ${entry.lineStart}-${entry.lineEnd}`;
}

function displayCitationPath(path: string): string {
  const normalized = path.trim();
  if (normalized.length <= 80) return normalized;
  return `...${normalized.slice(-77)}`;
}

function citationHref(entry: MemoryCitationEntryView): string {
  return `${entry.path}:${entry.lineStart}`;
}

function handleFileReferenceClick(
  event: MouseEvent<HTMLAnchorElement>,
  reference: FileReference,
  onOpenFileReference: ((reference: FileReference) => void) | undefined,
): void {
  if (!onOpenFileReference) return;
  event.preventDefault();
  onOpenFileReference(reference);
}

function StreamingCursor() {
  return <span className="hc-assistant-streaming-cursor" aria-hidden="true" />;
}

function trailingInlineTargetBlockIndex(blocks: MarkdownBlock[]): number {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (!block) continue;
    if (block.kind === "paragraph" || block.kind === "heading" || block.kind === "blockquote") return index;
    if ((block.kind === "list" || block.kind === "taskList") && block.items.length > 0) return index;
  }
  return blocks.length - 1;
}

function selectedTextWithin(container: Element | null, selection: Selection | null): string {
  if (!container || !selection || selection.isCollapsed) return "";
  const anchorInside = selection.anchorNode ? container.contains(selection.anchorNode) : false;
  const focusInside = selection.focusNode ? container.contains(selection.focusNode) : false;
  return anchorInside || focusInside ? selection.toString() : "";
}

function renderInlineWithBreaks(
  text: string,
  onOpenFileReference?: (reference: FileReference) => void,
): ReactNode[] {
  const lines = text.split("\n");
  return lines.flatMap((line, index) => {
    const rendered = renderInline(line, onOpenFileReference);
    return index === 0 ? rendered : [<br key={`br-${index}`} />, ...rendered];
  });
}

function renderInline(text: string, onOpenFileReference?: (reference: FileReference) => void): ReactNode[] {
  return parseMarkdownInline(text).map((segment, index) => {
    if (segment.kind === "code") return <code key={index}>{segment.text}</code>;
    if (segment.kind === "link") {
      return (
        <a href={segment.href} key={index} rel="noreferrer" target={isExternalHref(segment.href) ? "_blank" : undefined}>
          {renderInline(segment.text, onOpenFileReference)}
        </a>
      );
    }
    if (segment.kind === "fileCitation") {
      const entry = { path: segment.path, lineStart: segment.lineStart, lineEnd: segment.lineEnd };
      return (
        <a
          className="hc-file-citation-marker"
          href={citationHref({ ...entry, note: "" })}
          key={index}
          onClick={(event) => handleFileReferenceClick(event, entry, onOpenFileReference)}
        >
          {displayCitationPath(segment.path)} {memoryCitationLineLabel(entry)}
        </a>
      );
    }
    if (segment.kind === "strong") return <strong key={index}>{renderInline(segment.text, onOpenFileReference)}</strong>;
    if (segment.kind === "em") return <em key={index}>{renderInline(segment.text, onOpenFileReference)}</em>;
    if (segment.kind === "del") return <del key={index}>{renderInline(segment.text, onOpenFileReference)}</del>;
    return segment.text;
  });
}

function isMarkdownBlockBoundary(line: string, nextLine = ""): boolean {
  return line.trim().length === 0
    || /^```/.test(line)
    || /^#{1,6}\s+/.test(line)
    || /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)
    || parseMarkdownImageLine(line) !== null
    || parseMarkdownTaskListItem(line) !== null
    || /^(\s*)([-*+]|\d+[.)])\s+/.test(line)
    || /^>\s?/.test(line)
    || (line.includes("|") && isTableSeparatorRow(nextLine));
}

function pushTextSegment(segments: MarkdownInlineSegment[], text: string): void {
  if (text.length === 0) return;
  const previous = segments[segments.length - 1];
  if (previous?.kind === "text") {
    previous.text += text;
    return;
  }
  segments.push({ kind: "text", text });
}

function normalizeMarkdownHref(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) return trimmed.slice(1, -1).trim();
  return trimmed;
}

function isExternalHref(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
