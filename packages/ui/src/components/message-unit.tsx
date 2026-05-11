import {
  Check,
  ChevronRight,
  Copy,
  FileText,
  GitFork,
  Globe2,
  Loader2,
  Pencil,
  X,
} from "lucide-react";
import { renderToString as renderKatexToString } from "katex";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, MouseEvent, ReactNode } from "react";
import type { AssistantMessagePhase, ConversationRenderUnit, RailEntry } from "../state/render-groups";
import { convertLocalFileSrc, isTauriRuntime } from "../lib/tauri-host";
import { projectArtifactPreview } from "../state/artifact-preview";
import { AssistantResourceCards } from "./assistant-resource-cards";
import {
  CodeSnippet,
} from "./code-snippet";
import { focusPromptEditorElement, PromptEditor } from "./prompt-editor";
import {
  UserMessageAttachmentStrip,
  UserMessageTextContentView,
} from "./user-message-content-render";

type MessageRenderUnit = Extract<ConversationRenderUnit, { kind: "message" }>;

export interface FileReference {
  path: string;
  lineStart: number;
  lineEnd?: number;
}

export function MessageUnitView({
  unit,
  isMostRecentTurn = false,
  onEditLastUserMessage,
  onOpenAssistantArtifact,
  onForkTurn,
  onOpenFileReference,
}: {
  unit: MessageRenderUnit;
  isMostRecentTurn?: boolean;
  onEditLastUserMessage?: (turnId: string, message: string) => void | Promise<void>;
  onOpenAssistantArtifact?: (entry: RailEntry) => void;
  onForkTurn?: (turnId: string) => void;
  onOpenFileReference?: (reference: FileReference) => void;
}) {
  const assistantPhase = unit.role === "assistant" ? unit.assistantPhase ?? "unknown" : undefined;
  const streaming = unit.role === "assistant" && unit.isStreaming === true;
  const renderPlaceholder = unit.role === "assistant" && unit.renderPlaceholder === true;
  const showAssistantChrome = unit.role === "assistant" && shouldRenderAssistantMessageChrome(assistantPhase);
  const sentAtMs = messageSentAtMs(unit.item);
  const turnId = messageTurnId(unit.item);
  const turnStatus = messageTurnStatus(unit.item);
  const turnInProgress = turnStatus === "inProgress" || turnStatus === "running" || turnStatus === "active";
  const canFork = showAssistantChrome && !turnInProgress && !streaming && !renderPlaceholder;
  const onFork = unit.role === "assistant" && canFork && turnId && onForkTurn
    ? () => onForkTurn(turnId)
    : undefined;
  const assistantArtifacts = unit.role === "assistant" ? unit.artifacts ?? [] : [];
  const assistantMediaSources = unit.role === "assistant" ? assistantArtifactMediaSources(assistantArtifacts) : new Map<string, string>();
  const assistantResourceCards = unit.role === "assistant"
    ? assistantResourceCardEntriesForMessage({
        phase: assistantPhase,
        text: unit.text,
        artifacts: assistantArtifacts,
      })
    : [];
  const primaryAssistantArtifact = assistantArtifacts[0];
  const onEdit = unit.role === "user"
    && isMostRecentTurn
    && !turnInProgress
    && turnId
    && onEditLastUserMessage
    && !unit.text.startsWith("PLEASE IMPLEMENT THIS PLAN:")
      ? (message: string) => onEditLastUserMessage(turnId, message)
      : undefined;
  const citation = showAssistantChrome
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
      data-content-search-unit-key={unit.key}
      data-item-ids={unit.item.id}
      data-phase={assistantPhase}
      data-role={unit.role}
    >
      {unit.role === "user"
        ? (
            <UserMessageUnit
              onEdit={onEdit}
              onOpenFileReference={onOpenFileReference}
              sentAtMs={sentAtMs}
              unit={unit}
            />
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
                      mediaSources={assistantMediaSources}
                      onOpenFileReference={onOpenFileReference}
                      trailingInline={streaming ? <StreamingCursor /> : null}
                    />
                    <AssistantResourceCards entries={assistantResourceCards} onOpenArtifact={onOpenAssistantArtifact} />
                    {citation}
                    {showAssistantChrome && (
                      <AssistantMessageActions
                        copyText={streaming ? "" : unit.text}
                        artifacts={assistantArtifacts}
                        item={unit.item}
                        onOpenArtifact={primaryAssistantArtifact && onOpenAssistantArtifact
                          ? () => onOpenAssistantArtifact(primaryAssistantArtifact)
                          : undefined}
                        onFork={onFork}
                        sentAtMs={sentAtMs}
                      />
                    )}
                  </>
                )
          )}
    </article>
  );
}

function UserMessageUnit({
  unit,
  onEdit,
  onOpenFileReference,
  sentAtMs,
}: {
  unit: MessageRenderUnit;
  onEdit?: (message: string) => void | Promise<void>;
  onOpenFileReference?: (reference: FileReference) => void;
  sentAtMs: number | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(unit.text);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(unit.text);
  }, [editing, unit.text]);

  if (editing && onEdit) {
    return (
      <div className="hc-user-edit-shell">
        <UserEditForm
          draft={draft}
          disabled={submitting}
          onCancel={() => {
            setDraft(unit.text);
            setEditing(false);
          }}
          onDraftChange={setDraft}
          onSubmit={async (message) => {
            setSubmitting(true);
            try {
              await onEdit(message);
              setEditing(false);
            } finally {
              setSubmitting(false);
            }
          }}
        />
      </div>
    );
  }

  return (
    <>
      <UserMessageAttachmentStrip
        unit={unit}
        onOpenFileReference={onOpenFileReference}
        renderMarkdown={(text, openFileReference) => (
          <Markdownish text={text} onOpenFileReference={openFileReference} />
        )}
      />
      {shouldRenderUserMessageBubble(unit) && (
        <div className="hc-user-message-bubble">
          <CollapsedUserText unit={unit} onOpenFileReference={onOpenFileReference} />
        </div>
      )}
      <UserMessageActions
        copyText={unit.text}
        meta={userMessageMetaChips(unit.item)}
        onEdit={onEdit ? () => setEditing(true) : undefined}
        sentAtMs={sentAtMs}
      />
    </>
  );
}

function shouldRenderUserMessageBubble(unit: MessageRenderUnit): boolean {
  const hasAttachments = unit.userContent?.some((part) => part.kind !== "text") ?? false;
  const hasText = (unit.userContent?.some((part) => part.kind === "text" && part.text.trim().length > 0) ?? false)
    || unit.text.trim().length > 0;
  return hasText || !hasAttachments;
}

function UserEditForm({
  disabled,
  draft,
  onCancel,
  onDraftChange,
  onSubmit,
}: {
  disabled: boolean;
  draft: string;
  onCancel: () => void;
  onDraftChange: (draft: string) => void;
  onSubmit: (message: string) => void | Promise<void>;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    window.requestAnimationFrame(() => {
      focusPromptEditorElement(editorRef.current);
    });
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (disabled) return;
    await onSubmit(draft.trim());
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
    return false;
  };

  return (
    <form className="hc-user-edit-form" data-disabled={disabled || undefined} onSubmit={submit}>
      <div className="hc-user-edit-editor">
        <PromptEditor
          ref={editorRef}
          value={draft}
          placeholder="Edit message"
          ariaLabel="Edit message"
          minHeight="72px"
          onChange={(value) => {
            if (!disabled) onDraftChange(value);
          }}
          onKeyDown={onKeyDown}
          onSubmit={() => {
            if (!disabled) void onSubmit(draft.trim());
          }}
        />
      </div>
      <div className="hc-user-edit-actions">
        <button disabled={disabled} type="button" onClick={onCancel}>Cancel</button>
        <button className="primary" disabled={disabled} type="submit">Send</button>
      </div>
    </form>
  );
}

function CollapsedUserText({
  unit,
  onOpenFileReference,
}: {
  unit: MessageRenderUnit;
  onOpenFileReference?: (reference: FileReference) => void;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [collapsible, setCollapsible] = useState(false);
  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    const measure = () => {
      setCollapsible(element.scrollHeight - element.clientHeight > 2 || likelyLongUserMessage(unit.text));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [unit.text]);

  return (
    <div className="hc-user-message-collapse">
      <div
        ref={contentRef}
        className="hc-user-message-collapse-content"
        data-expanded={expanded || undefined}
      >
        <UserMessageTextContentView
          unit={unit}
          onOpenFileReference={onOpenFileReference}
          renderMarkdown={(text, openFileReference) => (
            <Markdownish text={text} onOpenFileReference={openFileReference} />
          )}
        />
      </div>
      {collapsible && (
        <button
          type="button"
          aria-expanded={expanded}
          className="hc-user-message-collapse-toggle"
          onClick={() => setExpanded((value) => !value)}
        >
          <span>{expanded ? "Show less" : "Show more"}</span>
          <ChevronRight size={12} className={expanded ? "is-open" : ""} />
        </button>
      )}
    </div>
  );
}

function likelyLongUserMessage(text: string): boolean {
  return text.split(/\r\n|\r|\n/).length > 20 || text.length > 1800;
}

function userMessageMetaChips(item: Record<string, unknown>): string[] {
  const chips: string[] = [];
  if (booleanField(item, "referencesPriorConversation")) chips.push("References prior conversation");
  if (booleanField(item, "reviewMode")) chips.push("Review mode");
  if (booleanField(item, "pullRequestFixMode")) chips.push("PR fix");
  if (booleanField(item, "autoResolveSync")) chips.push("Auto resolve conflicts");
  const commentCount = numericField(item, "commentCount");
  if (commentCount > 0) chips.push(commentCount === 1 ? "1 comment" : `${commentCount} comments`);
  const pullRequestCheckCount = numericField(item, "pullRequestCheckCount");
  if (pullRequestCheckCount > 0) {
    chips.push(pullRequestCheckCount === 1 ? "1 CI test" : `${pullRequestCheckCount} CI tests`);
  }
  return chips;
}

function booleanField(item: Record<string, unknown>, key: string): boolean {
  return item[key] === true;
}

function numericField(item: Record<string, unknown>, key: string): number {
  const value = item[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function UserMessageActions({
  copyText,
  meta,
  onEdit,
  sentAtMs,
}: {
  copyText: string;
  meta: string[];
  onEdit?: () => void;
  sentAtMs: number | null;
}) {
  const hasActionChildren = Boolean(onEdit);
  const shouldRenderActionRow = shouldRenderMessageActionRow({ copyText, hasActionChildren });
  const actionRow = shouldRenderActionRow
    ? (
        <MessageActionRow copyText={copyText} hasActionChildren={hasActionChildren} sentAtMs={sentAtMs}>
          {onEdit && (
            <IconActionButton ariaLabel="Edit message" title="Edit" onClick={onEdit}>
              <Pencil size={13} />
            </IconActionButton>
          )}
        </MessageActionRow>
      )
    : null;
  if (!shouldRenderUserMessageActionStrip({ copyText, hasEditAction: hasActionChildren, metaCount: meta.length })) return null;
  if (meta.length === 0) return actionRow;
  return (
    <div className="hc-user-message-action-strip">
      {meta.map((label) => (
        <span className="hc-message-action-status meta" key={label}>{label}</span>
      ))}
      {actionRow}
    </div>
  );
}

export function shouldRenderUserMessageActionStrip({
  copyText,
  hasEditAction = false,
  metaCount = 0,
}: {
  copyText: string;
  hasEditAction?: boolean;
  metaCount?: number;
}): boolean {
  return metaCount > 0 || shouldRenderMessageActionRow({ copyText, hasActionChildren: hasEditAction });
}

function AssistantMessageActions({
  artifacts,
  copyText,
  item,
  onOpenArtifact,
  onFork,
  sentAtMs,
}: {
  artifacts: RailEntry[];
  copyText: string;
  item: Record<string, unknown>;
  onOpenArtifact?: () => void;
  onFork?: () => void;
  sentAtMs: number | null;
}) {
  const hasArtifacts = assistantHasArtifacts(item, artifacts);
  const autoReviewLabel = assistantAutoReviewLabel(item);
  const hasActionChildren = hasArtifacts || Boolean(onFork) || Boolean(autoReviewLabel);
  return (
    <MessageActionRow copyText={copyText} hasActionChildren={hasActionChildren} sentAtMs={sentAtMs}>
      {hasArtifacts && (
        onOpenArtifact
          ? (
              <IconActionButton ariaLabel="Open artifacts" title="Artifacts" onClick={onOpenArtifact}>
                <FileText size={13} />
              </IconActionButton>
            )
          : (
              <span className="hc-message-action-status" title="Artifacts available" aria-label="Artifacts available">
                <FileText size={13} />
              </span>
            )
      )}
      {onFork && (
        <IconActionButton ariaLabel="Fork from this point" title="Fork" onClick={onFork}>
          <GitFork size={13} />
        </IconActionButton>
      )}
      {autoReviewLabel && (
        <span className="hc-message-action-status text" title={autoReviewLabel}>
          {autoReviewLabel}
        </span>
      )}
    </MessageActionRow>
  );
}

function assistantHasArtifacts(item: Record<string, unknown>, artifacts: RailEntry[] = []): boolean {
  if (artifacts.length > 0) return true;
  if (item.hasArtifacts === true) return true;
  const artifactCount = numericField(item, "artifactCount");
  if (artifactCount > 0) return true;
  const itemArtifacts = item.artifacts;
  return Array.isArray(itemArtifacts) && itemArtifacts.length > 0;
}

function assistantAutoReviewLabel(item: Record<string, unknown>): string | null {
  const stats = item.autoReviewStats;
  if (!stats || typeof stats !== "object") return null;
  const record = stats as Record<string, unknown>;
  const issueCount = numericField(record, "issueCount") || numericField(record, "findings") || numericField(record, "findingCount");
  if (issueCount > 0) return issueCount === 1 ? "1 review note" : `${issueCount} review notes`;
  const status = typeof record.status === "string" ? record.status.trim() : "";
  return status || "Review";
}

function MessageActionRow({
  children,
  copyText,
  hasActionChildren = false,
  persistent = false,
  sentAtMs,
}: {
  children?: ReactNode;
  copyText: string;
  hasActionChildren?: boolean;
  persistent?: boolean;
  sentAtMs: number | null;
}) {
  const trimmedCopyText = copyText.trim();
  const [copied, setCopied] = useState(false);
  if (!shouldRenderMessageActionRow({ copyText, hasActionChildren })) return null;
  const handleCopy = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (trimmedCopyText.length === 0) return;
    await navigator.clipboard.writeText(trimmedCopyText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <>
      <div className="hc-message-actions" data-persistent={persistent || undefined}>
        {trimmedCopyText.length > 0 && (
          <button aria-label={copied ? "Copied" : "Copy message"} title={copied ? "Copied" : "Copy"} type="button" onClick={handleCopy}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        )}
        {children}
        {sentAtMs !== null && <span className="hc-message-time">{formatMessageSentAt(sentAtMs)}</span>}
      </div>
      {copied && <CopyFeedbackToast />}
    </>
  );
}

export function shouldRenderMessageActionRow({
  copyText,
  hasActionChildren = false,
}: {
  copyText: string;
  hasActionChildren?: boolean;
}): boolean {
  return copyText.trim().length > 0 || hasActionChildren;
}

export function shouldRenderAssistantMessageChrome(assistantPhase: MessageRenderUnit["assistantPhase"]): boolean {
  return assistantPhase !== "commentary";
}

function CopyFeedbackToast() {
  return (
    <div className="hc-copy-toast" role="status" aria-live="polite">
      <span className="hc-copy-toast-icon" aria-hidden="true"><Check size={15} /></span>
      <span>Copied to clipboard</span>
    </div>
  );
}

function IconActionButton({
  ariaLabel,
  children,
  onClick,
  title,
}: {
  ariaLabel: string;
  children: ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      aria-label={ariaLabel}
      title={title}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

function messageSentAtMs(item: Record<string, unknown>): number | null {
  const value = item.sentAtMs ?? item.createdAtMs;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function messageTurnId(item: Record<string, unknown>): string | null {
  const value = item._turnId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function messageTurnStatus(item: Record<string, unknown>): string {
  const value = item._turnStatus;
  return typeof value === "string" ? value : "";
}

function formatMessageSentAt(sentAtMs: number): string {
  const date = new Date(sentAtMs);
  if (!Number.isFinite(date.getTime())) return "";
  const now = new Date();
  const dayDelta = calendarDayDelta(date, now);
  if (dayDelta < 0 && dayDelta > -7) {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }
  if (dayDelta !== 0) {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function calendarDayDelta(left: Date, right: Date): number {
  const leftDay = new Date(left.getFullYear(), left.getMonth(), left.getDate()).getTime();
  const rightDay = new Date(right.getFullYear(), right.getMonth(), right.getDate()).getTime();
  return Math.round((leftDay - rightDay) / 86_400_000);
}

export function Markdownish({
  text,
  mediaSources,
  onOpenFileReference,
  trailingInline = null,
}: {
  text: string;
  mediaSources?: Map<string, string>;
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
              mediaSources={mediaSources}
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
  | { kind: "details"; open: boolean; summary: string; text: string }
  | { kind: "math"; text: string }
  | { kind: "list"; ordered: boolean; items: string[]; start?: number }
  | { kind: "taskList"; items: MarkdownTaskListItem[] }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "hr" }
  | MarkdownImageBlock
  | { kind: "imageGrid"; images: MarkdownImageBlock[] };

export interface MarkdownImageBlock {
  alt: string;
  kind: "image";
  src: string;
  title: string | null;
}

export interface MarkdownTaskListItem {
  checked: boolean;
  text: string;
}

export type MarkdownInlineSegment =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "htmlBreak" }
  | { kind: "htmlSpan"; tag: MarkdownBasicHtmlTag; text: string }
  | { kind: "image"; alt: string; src: string; title: string | null }
  | { kind: "link"; text: string; href: string }
  | { kind: "fileCitation"; path: string; lineStart: number; lineEnd: number }
  | { kind: "math"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "em"; text: string }
  | { kind: "del"; text: string };

type MarkdownBasicHtmlTag = "b" | "del" | "em" | "i" | "s" | "strong" | "sub" | "sup" | "u";

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

    const mathBlock = parseMarkdownMathBlock(lines, index);
    if (mathBlock) {
      blocks.push(mathBlock.block);
      index = mathBlock.nextIndex;
      continue;
    }

    const detailsBlock = parseMarkdownDetailsBlock(lines, index);
    if (detailsBlock) {
      blocks.push(detailsBlock.block);
      index = detailsBlock.nextIndex;
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
      index += 1;
      const images = [image];
      while (index < lines.length) {
        const nextImage = parseMarkdownImageLine(lines[index] ?? "");
        if (!nextImage) break;
        images.push(nextImage);
        index += 1;
      }
      blocks.push(images.length > 1 ? { kind: "imageGrid", images } : image);
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
      const start = ordered ? Number.parseInt((listMatch[2] ?? "1").replace(/[.)]$/, ""), 10) : 1;
      const items: string[] = [];
      while (index < lines.length) {
        const item = (lines[index] ?? "").match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
        if (!item || /^\d+[.)]$/.test(item[2] ?? "") !== ordered) break;
        items.push(item[3] ?? "");
        index += 1;
      }
      blocks.push(ordered && start > 1 ? { kind: "list", ordered, items, start } : { kind: "list", ordered, items });
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

    if (token.kind === "autolink") {
      const autolink = parseMarkdownAutolink(text, token.index);
      if (!autolink) {
        pushTextSegment(segments, text.slice(token.index, token.index + 1));
        index = token.index + 1;
        continue;
      }
      segments.push({ kind: "link", text: autolink.text, href: autolink.href });
      index = autolink.endIndex;
      continue;
    }

    if (token.kind === "math") {
      const math = parseMarkdownInlineMath(text, token.index);
      if (!math) {
        pushTextSegment(segments, text.slice(token.index, token.index + 1));
        index = token.index + 1;
        continue;
      }
      segments.push({ kind: "math", text: math.text });
      index = math.endIndex;
      continue;
    }

    if (token.kind === "html") {
      const html = parseBasicInlineHtml(text, token.index);
      if (!html) {
        pushTextSegment(segments, text.slice(token.index, token.index + 1));
        index = token.index + 1;
        continue;
      }
      if (html.kind === "break") segments.push({ kind: "htmlBreak" });
      else segments.push({ kind: "htmlSpan", tag: html.tag, text: html.text });
      index = html.endIndex;
      continue;
    }

    if (token.kind === "image") {
      const image = parseMarkdownImageInline(text, token.index);
      if (!image) {
        pushTextSegment(segments, text.slice(token.index, token.index + 1));
        index = token.index + 1;
        continue;
      }
      segments.push({ kind: "image", alt: image.alt, src: image.src, title: image.title });
      index = image.endIndex;
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

function parseMarkdownMathBlock(lines: string[], index: number): { block: MarkdownBlock; nextIndex: number } | null {
  const line = lines[index]?.trim() ?? "";
  const singleDollar = line.match(/^\$\$\s*(.+?)\s*\$\$$/);
  if (singleDollar) {
    return { block: { kind: "math", text: singleDollar[1]?.trim() ?? "" }, nextIndex: index + 1 };
  }
  const singleBracket = line.match(/^\\\[\s*(.+?)\s*\\]$/);
  if (singleBracket) {
    return { block: { kind: "math", text: singleBracket[1]?.trim() ?? "" }, nextIndex: index + 1 };
  }
  if (line !== "$$" && line !== "\\[") return null;
  const close = line === "$$" ? "$$" : "\\]";
  const mathLines: string[] = [];
  let nextIndex = index + 1;
  while (nextIndex < lines.length && (lines[nextIndex]?.trim() ?? "") !== close) {
    mathLines.push(lines[nextIndex] ?? "");
    nextIndex += 1;
  }
  if (nextIndex >= lines.length) return null;
  return {
    block: { kind: "math", text: mathLines.join("\n").trim() },
    nextIndex: nextIndex + 1,
  };
}

function parseMarkdownDetailsBlock(lines: string[], index: number): { block: MarkdownBlock; nextIndex: number } | null {
  const firstLine = lines[index] ?? "";
  if (!/^<details(?:\s+open)?\s*>/i.test(firstLine.trim())) return null;
  const detailsLines: string[] = [];
  let nextIndex = index;
  while (nextIndex < lines.length) {
    const line = lines[nextIndex] ?? "";
    detailsLines.push(line);
    nextIndex += 1;
    if (/<\/details\s*>/i.test(line)) break;
  }
  const raw = detailsLines.join("\n");
  if (!/<\/details\s*>/i.test(raw)) return null;
  const open = /^<details\s+open\s*>/i.test(firstLine.trim());
  const summaryMatch = raw.match(/<summary\s*>([\s\S]*?)<\/summary\s*>/i);
  const summary = summaryMatch?.[1]?.replace(/<[^>]+>/g, "").trim() || "Details";
  const text = raw
    .replace(/^<details(?:\s+open)?\s*>\s*/i, "")
    .replace(/<summary\s*>[\s\S]*?<\/summary\s*>\s*/i, "")
    .replace(/\s*<\/details\s*>\s*$/i, "")
    .trim();
  return {
    block: { kind: "details", open, summary, text },
    nextIndex,
  };
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

function parseMarkdownImageLine(line: string): MarkdownImageBlock | null {
  const trimmed = line.trim();
  const image = parseMarkdownImageInline(trimmed, 0);
  if (!image || image.endIndex !== trimmed.length) return null;
  return {
    kind: "image",
    alt: image.alt,
    src: image.src,
    title: image.title,
  };
}

function parseMarkdownImageInline(
  text: string,
  startIndex: number,
): { alt: string; src: string; title: string | null; endIndex: number } | null {
  if (!text.startsWith("![", startIndex)) return null;
  const closeLabel = text.indexOf("]", startIndex + 2);
  const openHref = closeLabel >= 0 ? text.indexOf("(", closeLabel + 1) : -1;
  if (closeLabel < 0 || openHref !== closeLabel + 1) return null;

  let cursor = openHref + 1;
  let bracketDepth = 0;
  while (cursor < text.length) {
    const char = text[cursor] ?? "";
    if (char === "(") bracketDepth += 1;
    if (char === ")") {
      if (bracketDepth === 0) break;
      bracketDepth -= 1;
    }
    cursor += 1;
  }
  if (cursor >= text.length) return null;

  const rawTarget = text.slice(openHref + 1, cursor).trim();
  const titleMatch = rawTarget.match(/^(<[^>\n]+>|[^\s\n]+)\s+["']([^"'\n]*)["']$/);
  const rawSrc = titleMatch?.[1] ?? rawTarget;
  const src = normalizeMarkdownHref(rawSrc);
  if (!src) return null;
  return {
    alt: text.slice(startIndex + 2, closeLabel),
    src,
    title: titleMatch?.[2] ?? null,
    endIndex: cursor + 1,
  };
}

type InlineToken =
  | { kind: "code"; index: number }
  | { kind: "fileCitation"; index: number }
  | { kind: "autolink"; index: number }
  | { kind: "math"; index: number }
  | { kind: "html"; index: number }
  | { kind: "image"; index: number }
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
  const autolinkIndex = findMarkdownAutolinkStart(text, index);
  if (autolinkIndex >= 0) candidates.push({ kind: "autolink", index: autolinkIndex });
  const mathIndex = findMarkdownInlineMathStart(text, index);
  if (mathIndex >= 0) candidates.push({ kind: "math", index: mathIndex });
  const htmlIndex = findBasicInlineHtmlStart(text, index);
  if (htmlIndex >= 0) candidates.push({ kind: "html", index: htmlIndex });
  const imageIndex = text.indexOf("![", index);
  if (imageIndex >= 0) candidates.push({ kind: "image", index: imageIndex });
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
  if (token.kind === "autolink") return 2;
  if (token.kind === "math") return 3;
  if (token.kind === "html") return 4;
  if (token.kind === "image") return 5;
  if (token.kind === "link") return 6;
  if (token.kind === "del") return 7;
  if (token.kind === "strong") return 8;
  return 9;
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

function findMarkdownAutolinkStart(text: string, index: number): number {
  let cursor = text.indexOf("<", index);
  while (cursor >= 0) {
    if (parseMarkdownAutolink(text, cursor)) return cursor;
    cursor = text.indexOf("<", cursor + 1);
  }
  return -1;
}

function parseMarkdownAutolink(
  text: string,
  startIndex: number,
): { text: string; href: string; endIndex: number } | null {
  if (text[startIndex] !== "<") return null;
  const closeIndex = text.indexOf(">", startIndex + 1);
  if (closeIndex < 0) return null;
  const value = text.slice(startIndex + 1, closeIndex);
  if (/^[A-Za-z][A-Za-z0-9+.-]{0,31}:[^\s<>]*$/u.test(value)) {
    return { text: value, href: value, endIndex: closeIndex + 1 };
  }
  if (/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/u.test(value)) {
    return { text: value, href: `mailto:${value}`, endIndex: closeIndex + 1 };
  }
  return null;
}

function findMarkdownInlineMathStart(text: string, index: number): number {
  let cursor = index;
  while (cursor < text.length) {
    const dollarIndex = text.indexOf("$", cursor);
    const parenIndex = text.indexOf("\\(", cursor);
    const next = minPositiveIndex(dollarIndex, parenIndex);
    if (next < 0) return -1;
    if (parseMarkdownInlineMath(text, next)) return next;
    cursor = next + 1;
  }
  return -1;
}

function minPositiveIndex(left: number, right: number): number {
  if (left < 0) return right;
  if (right < 0) return left;
  return Math.min(left, right);
}

function parseMarkdownInlineMath(text: string, startIndex: number): { text: string; endIndex: number } | null {
  if (text.startsWith("\\(", startIndex)) {
    const closeIndex = text.indexOf("\\)", startIndex + 2);
    if (closeIndex < 0) return null;
    const value = text.slice(startIndex + 2, closeIndex).trim();
    return value ? { text: value, endIndex: closeIndex + 2 } : null;
  }
  if (text[startIndex] !== "$" || text[startIndex + 1] === "$") return null;
  if (/\s/.test(text[startIndex + 1] ?? "")) return null;
  let cursor = startIndex + 1;
  while (cursor < text.length) {
    const closeIndex = text.indexOf("$", cursor);
    if (closeIndex < 0) return null;
    if (text[closeIndex - 1] !== "\\" && text[closeIndex - 1] !== " " && text[closeIndex + 1] !== "$") {
      const value = text.slice(startIndex + 1, closeIndex).trim();
      return value ? { text: value, endIndex: closeIndex + 1 } : null;
    }
    cursor = closeIndex + 1;
  }
  return null;
}

function findBasicInlineHtmlStart(text: string, index: number): number {
  let cursor = text.indexOf("<", index);
  while (cursor >= 0) {
    if (parseBasicInlineHtml(text, cursor)) return cursor;
    cursor = text.indexOf("<", cursor + 1);
  }
  return -1;
}

function parseBasicInlineHtml(
  text: string,
  startIndex: number,
): { endIndex: number; kind: "break" } | { endIndex: number; kind: "span"; tag: MarkdownBasicHtmlTag; text: string } | null {
  const breakMatch = text.slice(startIndex).match(/^<br\s*\/?>/i);
  if (breakMatch) return { kind: "break", endIndex: startIndex + breakMatch[0].length };
  const openMatch = text.slice(startIndex).match(/^<(b|del|em|i|s|strong|sub|sup|u)>/i);
  if (!openMatch) return null;
  const tag = openMatch[1]?.toLowerCase() as MarkdownBasicHtmlTag | undefined;
  if (!tag) return null;
  const contentStart = startIndex + openMatch[0].length;
  const closeRe = new RegExp(`</${tag}\\s*>`, "i");
  const closeMatch = closeRe.exec(text.slice(contentStart));
  if (!closeMatch) return null;
  const contentEnd = contentStart + closeMatch.index;
  return {
    endIndex: contentEnd + closeMatch[0].length,
    kind: "span",
    tag,
    text: text.slice(contentStart, contentEnd),
  };
}

function MarkdownBlockView({
  block,
  mediaSources,
  onOpenFileReference,
  trailingInline = null,
}: {
  block: MarkdownBlock;
  mediaSources?: Map<string, string>;
  onOpenFileReference?: (reference: FileReference) => void;
  trailingInline?: ReactNode;
}) {
  switch (block.kind) {
    case "heading": {
      return <Heading level={block.level}>{renderInline(block.text, onOpenFileReference, mediaSources)}{trailingInline}</Heading>;
    }
    case "paragraph":
      return <p>{renderInlineWithBreaks(block.text, onOpenFileReference, mediaSources)}{trailingInline}</p>;
    case "blockquote":
      return <blockquote>{renderInlineWithBreaks(block.text, onOpenFileReference, mediaSources)}{trailingInline}</blockquote>;
    case "code":
      return <CodeSnippet language={block.language} text={block.text} />;
    case "details":
      return (
        <details className="hc-markdown-details" open={block.open}>
          <summary>
            <ChevronRight size={13} />
            <span>{renderInline(block.summary, onOpenFileReference, mediaSources)}</span>
          </summary>
          <div className="hc-markdown-details-body">
            <Markdownish text={block.text} mediaSources={mediaSources} onOpenFileReference={onOpenFileReference} />
          </div>
        </details>
      );
    case "math":
      return <MathDisplay text={block.text} />;
    case "list": {
      const children = (
        <>
          {block.items.map((item, index) => (
            <li key={index}>
              {renderInline(item, onOpenFileReference, mediaSources)}
              {index === block.items.length - 1 ? trailingInline : null}
            </li>
          ))}
        </>
      );
      return block.ordered ? <ol start={block.start}>{children}</ol> : <ul>{children}</ul>;
    }
    case "taskList":
      return (
        <ul className="hc-task-list">
          {block.items.map((item, index) => (
            <li key={index}>
              <input aria-label={item.checked ? "Completed task" : "Pending task"} checked={item.checked} readOnly type="checkbox" />
              <span>
                {renderInline(item.text, onOpenFileReference, mediaSources)}
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
                  <th key={index}>{renderInline(header, onOpenFileReference, mediaSources)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {normalizeTableRow(row, block.headers.length).map((cell, cellIndex) => (
                    <td key={cellIndex}>{renderInline(cell, onOpenFileReference, mediaSources)}</td>
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
      return <MarkdownImageView image={resolvedMarkdownImage(block, mediaSources)} />;
    case "imageGrid":
      return (
        <div className="hc-markdown-image-grid" data-markdown-image-grid="true">
          {block.images.map((image, index) => (
            <MarkdownImageView allowWide image={resolvedMarkdownImage(image, mediaSources)} key={`${image.src}-${index}`} />
          ))}
        </div>
      );
  }
}

function MarkdownImageView({ allowWide = false, image }: { allowWide?: boolean; image: MarkdownImageBlock }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const src = resolveMarkdownMediaSrc(image.src);
  const mediaKind = markdownMediaKind(src);
  useEffect(() => {
    if (!previewOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [previewOpen]);

  if (mediaKind === "video") {
    return (
      <figure className={`hc-markdown-image ${allowWide ? "is-grid-item" : ""}`}>
        <video aria-label={image.alt || "Video"} controls preload="metadata" src={src} title={image.title ?? undefined} />
        {image.alt.trim().length > 0 && <figcaption>{image.alt}</figcaption>}
      </figure>
    );
  }
  return (
    <>
      <figure className={`hc-markdown-image ${allowWide ? "is-grid-item" : ""}`}>
        <button
          aria-label={image.alt || "Open image preview"}
          className="hc-markdown-image-trigger"
          type="button"
          onClick={() => setPreviewOpen(true)}
        >
          <img alt={image.alt} loading="lazy" src={src} title={image.title ?? undefined} />
        </button>
        {image.alt.trim().length > 0 && <figcaption>{image.alt}</figcaption>}
      </figure>
      {previewOpen && (
        <div className="hc-image-preview-dialog" role="dialog" aria-modal="true" aria-label={image.alt || "Image preview"}>
          <button className="hc-image-preview-backdrop" type="button" aria-label="Close image preview" onClick={() => setPreviewOpen(false)} />
          <div className="hc-image-preview-content">
            <button className="hc-image-preview-close" type="button" aria-label="Close image preview" onClick={() => setPreviewOpen(false)}>
              <X size={16} />
            </button>
            <img alt={image.alt} src={src} title={image.title ?? undefined} />
            {image.alt.trim().length > 0 && <div className="hc-image-preview-caption">{image.alt}</div>}
          </div>
        </div>
      )}
    </>
  );
}

export function assistantArtifactMediaSources(entries: RailEntry[]): Map<string, string> {
  const sources = new Map<string, string>();
  for (const entry of entries) {
    const preview = projectArtifactPreview(entry);
    if (preview.kind !== "image") continue;
    const path = preview.imageSource?.src ?? preview.reference?.path ?? "";
    if (!path) continue;
    for (const key of artifactMediaLookupKeys([
      entry.title,
      preview.title,
      preview.reference?.path,
      preview.meta,
      path,
      pathBasename(path),
    ])) {
      if (!sources.has(key)) sources.set(key, path);
    }
  }
  return sources;
}

export function assistantResourceCardEntriesForMessage(input: {
  phase?: AssistantMessagePhase;
  text: string;
  artifacts: RailEntry[];
}): RailEntry[] {
  if (!shouldRenderAssistantMessageChrome(input.phase)) return [];
  if (!containsMarkdownImage(input.text)) return input.artifacts;
  return input.artifacts.filter((entry) => projectArtifactPreview(entry).kind !== "image");
}

function containsMarkdownImage(text: string): boolean {
  return /!\[[^\]]*]\(/.test(text);
}

function resolvedMarkdownImage(
  image: MarkdownImageBlock,
  mediaSources?: Map<string, string>,
): MarkdownImageBlock {
  const resolvedSrc = resolveAssistantMarkdownMediaSource(image.src, mediaSources);
  return resolvedSrc ? { ...image, src: resolvedSrc } : image;
}

export function resolveAssistantMarkdownMediaSource(
  src: string,
  mediaSources?: Map<string, string>,
): string | null {
  if (!mediaSources) return null;
  for (const key of artifactMediaLookupKeys([src, pathBasename(src)])) {
    const resolved = mediaSources.get(key);
    if (resolved) return resolved;
  }
  return null;
}

function pathBasename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function artifactMediaLookupKeys(values: Array<string | null | undefined>): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value?.trim() ?? "";
    if (!trimmed) continue;
    const decoded = decodeUriComponentSafe(trimmed);
    for (const key of [
      trimmed,
      decoded,
      pathBasename(trimmed),
      pathBasename(decoded),
      normalizedArtifactMediaKey(trimmed),
      normalizedArtifactMediaKey(decoded),
      normalizedArtifactMediaKey(pathBasename(trimmed)),
      normalizedArtifactMediaKey(pathBasename(decoded)),
    ]) {
      if (!key || seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

function normalizedArtifactMediaKey(value: string): string {
  return pathBasename(value)
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeUriComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function resolveMarkdownMediaSrc(src: string): string {
  const path = markdownFilePath(src);
  if (path && isTauriRuntime()) return convertLocalFileSrc(path);
  return src;
}

function markdownFilePath(src: string): string {
  if (/^file:/i.test(src)) {
    try {
      return decodeURIComponent(new URL(src).pathname);
    } catch {
      return "";
    }
  }
  return src.startsWith("/") ? src : "";
}

function markdownMediaKind(src: string): "image" | "video" {
  if (/^data:video\//i.test(src)) return "video";
  if (/\.(?:mp4|mov|m4v|webm|ogv)(?:[?#].*)?$/i.test(src)) return "video";
  return "image";
}

function MathDisplay({ text }: { text: string }) {
  const html = renderKatexHtml(text, true);
  return (
    <div className="hc-math-display" role="img" aria-label={`Math: ${text}`}>
      {html
        ? <span dangerouslySetInnerHTML={{ __html: html }} />
        : <span className="hc-math-source">{text}</span>}
    </div>
  );
}

function MathInline({ text }: { text: string }) {
  const html = renderKatexHtml(text, false);
  return html
    ? <span className="hc-math-inline" aria-label={`Math: ${text}`} dangerouslySetInnerHTML={{ __html: html }} />
    : <span className="hc-math-inline" aria-label={`Math: ${text}`}>{text}</span>;
}

function renderKatexHtml(text: string, displayMode: boolean): string | null {
  try {
    return renderKatexToString(text, {
      displayMode,
      output: "htmlAndMathml",
      strict: "ignore",
      throwOnError: false,
      trust: false,
    });
  } catch {
    return null;
  }
}
export {
  CodeSnippet,
  codeBlockTitle,
  highlightCodeSegments,
  mermaidDiagramKind,
  mermaidFlowchartPreviewModel,
  sanitizeMermaidCode,
  shouldRenderMermaidPreview,
  shouldRenderSvgCodePreview,
  svgCodePreviewDataUrl,
} from "./code-snippet";

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
  mediaSources?: Map<string, string>,
): ReactNode[] {
  const lines = text.split("\n");
  return lines.flatMap((line, index) => {
    const rendered = renderInline(line, onOpenFileReference, mediaSources);
    return index === 0 ? rendered : [<br key={`br-${index}`} />, ...rendered];
  });
}

function renderInline(
  text: string,
  onOpenFileReference?: (reference: FileReference) => void,
  mediaSources?: Map<string, string>,
): ReactNode[] {
  return parseMarkdownInline(text).map((segment, index) => {
    if (segment.kind === "code") return <code key={index}>{segment.text}</code>;
    if (segment.kind === "htmlBreak") return <br key={index} />;
    if (segment.kind === "htmlSpan") return renderBasicInlineHtmlSegment(segment, index, onOpenFileReference, mediaSources);
    if (segment.kind === "link") {
      return (
        <MarkdownLink href={segment.href} key={index}>
          {renderInline(segment.text, onOpenFileReference, mediaSources)}
        </MarkdownLink>
      );
    }
    if (segment.kind === "image") {
      return (
        <MarkdownImageView
          allowWide
          image={resolvedMarkdownImage({
            kind: "image",
            alt: segment.alt,
            src: segment.src,
            title: segment.title,
          }, mediaSources)}
          key={index}
        />
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
    if (segment.kind === "math") return <MathInline key={index} text={segment.text} />;
    if (segment.kind === "strong") return <strong key={index}>{renderInline(segment.text, onOpenFileReference, mediaSources)}</strong>;
    if (segment.kind === "em") return <em key={index}>{renderInline(segment.text, onOpenFileReference, mediaSources)}</em>;
    if (segment.kind === "del") return <del key={index}>{renderInline(segment.text, onOpenFileReference, mediaSources)}</del>;
    return segment.text;
  });
}

function renderBasicInlineHtmlSegment(
  segment: Extract<MarkdownInlineSegment, { kind: "htmlSpan" }>,
  key: number,
  onOpenFileReference?: (reference: FileReference) => void,
  mediaSources?: Map<string, string>,
): ReactNode {
  const children = renderInline(segment.text, onOpenFileReference, mediaSources);
  if (segment.tag === "b" || segment.tag === "strong") return <strong key={key}>{children}</strong>;
  if (segment.tag === "del" || segment.tag === "s") return <del key={key}>{children}</del>;
  if (segment.tag === "em" || segment.tag === "i") return <em key={key}>{children}</em>;
  if (segment.tag === "sub") return <sub key={key}>{children}</sub>;
  if (segment.tag === "sup") return <sup key={key}>{children}</sup>;
  return <u key={key}>{children}</u>;
}

function isMarkdownBlockBoundary(line: string, nextLine = ""): boolean {
  return line.trim().length === 0
    || /^```/.test(line)
    || /^\s*(\$\$|\\\[)/.test(line)
    || /^<details(?:\s+open)?\s*>/i.test(line.trim())
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

function MarkdownLink({ children, href }: { children: ReactNode; href: string }) {
  const [failedFaviconUrl, setFailedFaviconUrl] = useState<string | null>(null);
  const external = isExternalHref(href);
  const faviconUrl = external ? markdownLinkFaviconUrl(href) : null;
  const showFavicon = faviconUrl !== null && failedFaviconUrl !== faviconUrl;
  return (
    <a
      className={external ? "hc-markdown-link is-external" : "hc-markdown-link"}
      href={href}
      rel={external ? "noreferrer" : undefined}
      target={external ? "_blank" : undefined}
      title={href}
    >
      {external && (
        <span className="hc-markdown-link-icon" aria-hidden="true">
          <Globe2 size={12} />
          {showFavicon && (
            <img
              alt=""
              decoding="async"
              draggable={false}
              referrerPolicy="no-referrer"
              src={faviconUrl}
              onError={() => setFailedFaviconUrl(faviconUrl)}
            />
          )}
        </span>
      )}
      <span className="hc-markdown-link-label">{children}</span>
    </a>
  );
}

export function markdownLinkFaviconUrl(href: string): string | null {
  try {
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.origin}/favicon.ico`;
  } catch {
    return null;
  }
}

function isExternalHref(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
