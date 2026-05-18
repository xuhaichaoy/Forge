import {
  ChevronRight,
  FileText,
  GitFork,
  Globe2,
  Loader2,
  Pencil,
  X,
} from "lucide-react";
import { renderToString as renderKatexToString } from "katex";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FormEvent, MouseEvent, ReactNode } from "react";
import type { ConversationRenderUnit, RailEntry } from "../state/render-groups";
import { convertLocalFileSrc, isTauriRuntime } from "../lib/tauri-host";
import {
  assistantArtifactMediaSources,
  assistantResourceCardEntriesForMessage,
  resolveAssistantMarkdownMediaSource,
  shouldRenderAssistantMessageChrome,
} from "./assistant-message-artifacts";
import { AssistantResourceCards } from "./assistant-resource-cards";
import {
  CodeSnippet,
  desktopMarkdownCodeBlockWrapMode,
} from "./code-snippet";
import type { FileReference } from "./file-reference-types";
import {
  IconActionButton,
  MessageActionRow,
  shouldRenderMessageActionRow,
} from "./message-action-row";
import { focusPromptEditorElement, PromptEditor } from "./prompt-editor";
import {
  UserMessageAttachmentStrip,
  UserMessageTextContentView,
} from "./user-message-content-render";

type MessageRenderUnit = Extract<ConversationRenderUnit, { kind: "message" }>;

export type { FileReference } from "./file-reference-types";
export {
  assistantArtifactMediaSources,
  assistantResourceCardEntriesForMessage,
  resolveAssistantMarkdownMediaSource,
  shouldRenderAssistantMessageChrome,
} from "./assistant-message-artifacts";
export { desktopMarkdownCodeBlockWrapMode } from "./code-snippet";
export { shouldRenderMessageActionRow } from "./message-action-row";

export const DESKTOP_MARKDOWN_CODE_BLOCK_ROOT_MARGIN = "600px 0px";
export const MARKDOWN_IMAGE_PREVIEW_TRIGGER_ATTRIBUTE = "data-markdown-image-preview-trigger";
export const MARKDOWN_IMAGE_PREVIEW_DIALOG_CLASS = "hc-markdown-image-preview-dialog";

export interface MarkdownImagePreviewItem {
  alt: string;
  src: string;
  title: string | null;
}

export interface MarkdownImagePreviewState {
  index: number;
  items: MarkdownImagePreviewItem[];
}

function MessageUnitViewInner({
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
  /*
   * Memoize the `Map` and the resource-card array. Each Markdownish/AssistantResourceCards
   * render received fresh references every parent render, which (a) cascaded through
   * Markdownish's downstream `MarkdownBlockView` reconciliation as a prop-changed
   * signal even when nothing visible changed, and (b) defeated any future
   * `React.memo` we might add. By keying these on the actual artifact list and
   * relevant text/phase, the references stay stable across streaming token frames
   * for the same artifact set.
   */
  const assistantMediaSources = useMemo(
    () => (unit.role === "assistant" ? assistantArtifactMediaSources(assistantArtifacts) : new Map<string, string>()),
    [unit.role, assistantArtifacts],
  );
  const assistantResourceCards = useMemo(
    () => (unit.role === "assistant"
      ? assistantResourceCardEntriesForMessage({
          phase: assistantPhase,
          text: unit.text,
          artifacts: assistantArtifacts,
        })
      : []),
    [assistantArtifacts, assistantPhase, unit.role, unit.text],
  );
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
                      fadeType={streaming ? "indexed" : "none"}
                      mediaSources={assistantMediaSources}
                      onOpenFileReference={onOpenFileReference}
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

/*
 * `MessageUnitView` is rendered once per message unit in the conversation. Each
 * streaming token re-projects the conversation, producing a NEW `unit` object
 * even when nothing visible changed for messages above the streaming one. The
 * default React equality check would treat that new reference as "props
 * changed" and re-render the entire markdown subtree (including
 * `parseMarkdownBlocks` + `parseMarkdownInline`), which (a) wasted CPU and (b)
 * triggered transient layout work and animation re-application that the user
 * perceived as flicker below the streaming output.
 *
 * The comparator below skips the re-render when none of the props that
 * actually drive the rendered DOM have changed by VALUE. Most non-streaming
 * messages compare equal frame-to-frame and stay quiet while only the
 * streaming-tail unit re-renders.
 */
export const MessageUnitView = memo(MessageUnitViewInner, (prev, next) => {
  if (prev.unit === next.unit) {
    return (
      prev.isMostRecentTurn === next.isMostRecentTurn
      && prev.onEditLastUserMessage === next.onEditLastUserMessage
      && prev.onOpenAssistantArtifact === next.onOpenAssistantArtifact
      && prev.onForkTurn === next.onForkTurn
      && prev.onOpenFileReference === next.onOpenFileReference
    );
  }
  if (prev.isMostRecentTurn !== next.isMostRecentTurn) return false;
  if (prev.onEditLastUserMessage !== next.onEditLastUserMessage) return false;
  if (prev.onOpenAssistantArtifact !== next.onOpenAssistantArtifact) return false;
  if (prev.onForkTurn !== next.onForkTurn) return false;
  if (prev.onOpenFileReference !== next.onOpenFileReference) return false;
  const a = prev.unit;
  const b = next.unit;
  if (a.kind !== b.kind || a.role !== b.role || a.key !== b.key) return false;
  if (a.text !== b.text) return false;
  if (a.item !== b.item) return false;
  if (a.role === "assistant" && b.role === "assistant") {
    if (a.assistantPhase !== b.assistantPhase) return false;
    if (a.isStreaming !== b.isStreaming) return false;
    if (a.renderPlaceholder !== b.renderPlaceholder) return false;
    const aArtifacts = a.artifacts ?? null;
    const bArtifacts = b.artifacts ?? null;
    if (aArtifacts !== bArtifacts) {
      const aLen = aArtifacts?.length ?? 0;
      const bLen = bArtifacts?.length ?? 0;
      if (aLen !== bLen) return false;
      for (let i = 0; i < aLen; i += 1) {
        if (aArtifacts?.[i] !== bArtifacts?.[i]) return false;
      }
    }
  }
  if (a.role === "user" && b.role === "user") {
    if ((a.userContent ?? null) !== (b.userContent ?? null)) return false;
  }
  return true;
});

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
  /*
   * Previously, `editLastUserTurn` (state/thread-workflow.ts:448) could throw
   * with a clear message — "Only the most recent message can be edited." /
   * "Cannot edit a message while a turn is in progress." / rollback errors —
   * but the error propagated up into `use-thread-actions.ts`, was dispatched
   * into the silent log channel, and `setEditing(false)` never ran. The user
   * saw the edit form sit there after pressing Send with no feedback. Capture
   * the error here so we can surface it inside the form.
   */
  const [submitError, setSubmitError] = useState<string | null>(null);
  useEffect(() => {
    if (!editing) setDraft(unit.text);
  }, [editing, unit.text]);
  useEffect(() => {
    if (!editing) setSubmitError(null);
  }, [editing]);

  if (editing && onEdit) {
    return (
      <div className="hc-user-edit-shell">
        <UserEditForm
          draft={draft}
          disabled={submitting}
          errorMessage={submitError}
          onCancel={() => {
            setDraft(unit.text);
            setEditing(false);
          }}
          onDraftChange={(next) => {
            if (submitError) setSubmitError(null);
            setDraft(next);
          }}
          onSubmit={async (message) => {
            setSubmitting(true);
            setSubmitError(null);
            try {
              await onEdit(message);
              setEditing(false);
            } catch (error) {
              setSubmitError(error instanceof Error ? error.message : String(error));
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
  errorMessage,
  onCancel,
  onDraftChange,
  onSubmit,
}: {
  disabled: boolean;
  draft: string;
  errorMessage?: string | null;
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
      {errorMessage && (
        <div className="hc-user-edit-error" role="alert">{errorMessage}</div>
      )}
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
  const goalChip = threadGoalMetaChip(item);
  if (goalChip) chips.push(goalChip);
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

function threadGoalMetaChip(item: Record<string, unknown>): string | null {
  const goal = recordField(item, "_threadGoal");
  const objective = stringValue(goal.objective).trim();
  if (objective) return `Goal: ${truncateMetaChip(objective)}`;
  const status = stringValue(goal.status).trim();
  return status ? `Goal: ${truncateMetaChip(status)}` : null;
}

function booleanField(item: Record<string, unknown>, key: string): boolean {
  return item[key] === true;
}

function numericField(item: Record<string, unknown>, key: string): number {
  const value = item[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function recordField(item: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = item[key];
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function truncateMetaChip(value: string): string {
  return value.length > 72 ? `${value.slice(0, 69)}...` : value;
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

export function Markdownish({
  fadeType = "none",
  text,
  mediaSources,
  onOpenFileReference,
}: {
  fadeType?: MarkdownFadeType;
  text: string;
  mediaSources?: Map<string, string>;
  onOpenFileReference?: (reference: FileReference) => void;
}) {
  /*
   * Parsing is pure; cache the result by `text` so the streaming loop only
   * pays the parse cost when the text actually changes. Without this, every
   * unrelated `MessageUnitView` parent re-render that bypasses memo (e.g.
   * because a callback prop changed identity) would re-tokenise the full
   * assistant message — a significant CPU spike that on mid-tier machines
   * dropped frames and surfaced as visible flicker.
   */
  const blocks = useMemo(() => parseMarkdownBlocks(text), [text]);
  const segmenter = useRef<MarkdownWordSegmenter | null>(createMarkdownWordSegmenter());
  const previousFadeSegmentCount = useRef(0);
  const markdownRootRef = useRef<HTMLDivElement | null>(null);
  const fadeEnabled = fadeType === "indexed";
  const fadeSegmentCount = fadeEnabled ? markdownIndexedFadeSegmentCount(blocks, segmenter.current) : 0;
  const fadeContext = fadeEnabled
    ? {
        nextIndex: 0,
        previousSegmentCount: previousFadeSegmentCount.current,
        segmenter: segmenter.current,
      }
    : null;
  useEffect(() => {
    previousFadeSegmentCount.current = fadeEnabled ? fadeSegmentCount : 0;
  }, [fadeEnabled, fadeSegmentCount]);
  useEffect(() => {
    const root = markdownRootRef.current;
    if (!root) return;
    const ownerDocument = root.ownerDocument;
    const handleCopy = (event: ClipboardEvent) => {
      if (!event.clipboardData || event.defaultPrevented) return;
      const payload = selectedMarkdownRichCopyPayload(root);
      if (!payload) return;
      event.clipboardData.setData("text/html", payload.htmlText);
      event.clipboardData.setData("text/plain", payload.plainText);
      event.preventDefault();
    };
    ownerDocument.addEventListener("copy", handleCopy, { capture: true });
    return () => ownerDocument.removeEventListener("copy", handleCopy, { capture: true });
  }, []);
  return (
    <div
      className={`hc-markdown${fadeEnabled ? " is-indexed-fade" : ""}`}
      data-markdown-fade={fadeEnabled ? "indexed" : undefined}
      ref={markdownRootRef}
    >
      {blocks.length === 0
        ? <p>{"\u00a0"}</p>
        : blocks.map((block, index) => (
            <MarkdownBlockView
              block={block}
              fadeContext={fadeContext}
              key={index}
              mediaSources={mediaSources}
              onOpenFileReference={onOpenFileReference}
            />
          ))}
    </div>
  );
}

export interface MarkdownRichCopyPayload {
  htmlText: string;
  plainText: string;
}

const KATEX_SELECTOR = ".katex";
const KATEX_MATHML_SELECTOR = ".katex-mathml";
const KATEX_HTML_SELECTOR = ".katex-mathml + .katex-html";
const KATEX_DISPLAY_ANNOTATION_SELECTOR = ".katex-display annotation";
const KATEX_TEX_ANNOTATION_SELECTOR = "annotation[encoding=\"application/x-tex\"]";

export function selectedMarkdownRichCopyPayload(
  root: HTMLElement,
  selection: Selection | null = root.ownerDocument.getSelection(),
): MarkdownRichCopyPayload | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0).cloneRange();
  if (!rangeInsideElement(range, root)) return null;
  expandRangeToKatex(range);
  const fragment = range.cloneContents();
  const hasMath = fragment.querySelector(KATEX_MATHML_SELECTOR) !== null;
  const hasButtons = replaceCopyButtonsWithText(fragment);
  if (!hasMath && !hasButtons) return null;
  normalizeKatexCopyFragment(fragment);
  const htmlText = Array.from(fragment.childNodes).map(markdownCopyHtml).join("");
  const plainText = Array.from(fragment.childNodes).map(markdownCopyPlainText).join("").trim();
  return plainText.length > 0 ? { htmlText, plainText } : null;
}

function rangeInsideElement(range: Range, element: HTMLElement): boolean {
  return element.contains(range.startContainer) && element.contains(range.endContainer);
}

function expandRangeToKatex(range: Range): void {
  const startKatex = closestElement(range.startContainer, KATEX_SELECTOR);
  if (startKatex) range.setStartBefore(startKatex);
  const endKatex = closestElement(range.endContainer, KATEX_SELECTOR);
  if (endKatex) range.setEndAfter(endKatex);
}

function closestElement(node: Node, selector: string): Element | null {
  const element = node.nodeType === 1 ? node as Element : node.parentElement;
  return element?.closest(selector) ?? null;
}

function replaceCopyButtonsWithText(fragment: DocumentFragment): boolean {
  let replaced = false;
  for (const button of Array.from(fragment.querySelectorAll("button"))) {
    const text = button.textContent ?? "";
    if (!text.trim()) continue;
    button.replaceWith(fragment.ownerDocument.createTextNode(text));
    replaced = true;
  }
  return replaced;
}

function normalizeKatexCopyFragment(fragment: DocumentFragment): void {
  for (const element of Array.from(fragment.querySelectorAll(KATEX_HTML_SELECTOR))) {
    element.remove();
  }
  for (const mathMl of Array.from(fragment.querySelectorAll(KATEX_MATHML_SELECTOR))) {
    const tex = mathMl.querySelector(KATEX_TEX_ANNOTATION_SELECTOR)?.textContent ?? "";
    if (tex) mathMl.replaceWith(fragment.ownerDocument.createTextNode(`\\(${stripInlineMathDelimiters(tex)}\\)`));
  }
  for (const annotation of Array.from(fragment.querySelectorAll(KATEX_DISPLAY_ANNOTATION_SELECTOR))) {
    const tex = stripDisplayMathDelimiters(annotation.textContent ?? "");
    annotation.textContent = `\\[\n${tex}\n\\]`;
  }
  for (const selector of [".katex-display", KATEX_SELECTOR]) {
    for (const element of Array.from(fragment.querySelectorAll(selector))) {
      if (element.querySelector(KATEX_HTML_SELECTOR)) continue;
      element.replaceWith(fragment.ownerDocument.createTextNode(element.textContent ?? ""));
    }
  }
}

function stripInlineMathDelimiters(text: string): string {
  return text.startsWith("\\(") && text.endsWith("\\)") ? text.slice(2, -2) : text;
}

function stripDisplayMathDelimiters(text: string): string {
  return text.startsWith("\\[\n") && text.endsWith("\n\\]") ? text.slice(3, -3) : text;
}

function markdownCopyHtml(node: ChildNode): string {
  if (node.nodeType === 3) return node.textContent ?? "";
  return node instanceof Element ? node.outerHTML : "";
}

function markdownCopyPlainText(node: ChildNode): string {
  if (node.nodeType === 3) return node.textContent ?? "";
  if (!(node instanceof Element)) return "";
  switch (node.tagName) {
    case "TABLE":
      return Array.from(node.querySelectorAll("tr")).map(markdownCopyTableRowText).join("\n");
    case "TR":
      return `${markdownCopyTableRowText(node)}\n`;
    case "THEAD":
    case "TBODY":
    case "TFOOT":
      return Array.from(node.children).map(markdownCopyPlainText).join("");
    case "BR":
      return "\n";
    case "P":
    case "DIV":
    case "LI":
      return `${markdownCopyChildPlainText(node)}\n`;
    default:
      return markdownCopyChildPlainText(node);
  }
}

function markdownCopyChildPlainText(element: Element): string {
  return Array.from(element.childNodes).map(markdownCopyPlainText).join("");
}

function markdownCopyTableRowText(row: Element): string {
  return Array.from(row.children).map((cell) => markdownCopyChildPlainText(cell).trim()).join("\t");
}

type MarkdownFadeType = "none" | "indexed";

interface MarkdownWordSegment {
  isWordLike?: boolean;
  segment: string;
}

interface MarkdownWordSegmenter {
  segment(text: string): Iterable<MarkdownWordSegment>;
}

interface MarkdownFadeContext {
  nextIndex: number;
  previousSegmentCount: number;
  segmenter: MarkdownWordSegmenter | null;
}

function createMarkdownWordSegmenter(): MarkdownWordSegmenter | null {
  const segmenterCtor = (Intl as unknown as {
    Segmenter?: new (locale?: string | string[], options?: { granularity: "word" }) => MarkdownWordSegmenter;
  }).Segmenter;
  if (!segmenterCtor) return null;
  try {
    return new segmenterCtor(undefined, { granularity: "word" });
  } catch {
    return null;
  }
}

export function markdownIndexedFadeSegmentCount(
  blocks: MarkdownBlock[],
  segmenter: MarkdownWordSegmenter | null = createMarkdownWordSegmenter(),
): number {
  return blocks.reduce((count, block) => count + markdownBlockFadeSegmentCount(block, segmenter), 0);
}

function markdownBlockFadeSegmentCount(block: MarkdownBlock, segmenter: MarkdownWordSegmenter | null): number {
  switch (block.kind) {
    case "heading":
    case "paragraph":
    case "blockquote":
      return markdownInlineFadeSegmentCount(block.text, segmenter);
    case "details":
      return markdownInlineFadeSegmentCount(block.summary, segmenter);
    case "list":
      return block.items.reduce((count, item) => count + markdownInlineFadeSegmentCount(item, segmenter), 0);
    case "taskList":
      return block.items.reduce((count, item) => count + markdownInlineFadeSegmentCount(item.text, segmenter), 0);
    case "table":
      return [...block.headers, ...block.rows.flat()].reduce(
        (count, cell) => count + markdownInlineFadeSegmentCount(cell, segmenter),
        0,
      );
    case "code":
    case "hr":
    case "image":
    case "imageGrid":
    case "math":
      return 0;
  }
}

function markdownInlineFadeSegmentCount(text: string, segmenter: MarkdownWordSegmenter | null): number {
  return parseMarkdownInline(text).reduce((count, segment) => {
    if (segment.kind === "text") return count + markdownFadeTextSegments(segment.text, segmenter).length;
    if (
      segment.kind === "del"
      || segment.kind === "em"
      || segment.kind === "htmlSpan"
      || segment.kind === "link"
      || segment.kind === "strong"
    ) {
      return count + markdownInlineFadeSegmentCount(segment.text, segmenter);
    }
    return count;
  }, 0);
}

export function markdownFadeTextSegments(
  text: string,
  segmenter: MarkdownWordSegmenter | null = createMarkdownWordSegmenter(),
): string[] {
  if (!segmenter) {
    const fallbackSegments = Array.from(text.match(/\s*\S+(?:\s+|$)/g) ?? []);
    return fallbackSegments.length > 0 || text.length === 0 ? fallbackSegments : [text];
  }
  const segments: string[] = [];
  for (const part of segmenter.segment(text)) {
    if (/^\s*$/u.test(part.segment) || part.isWordLike !== true) {
      const previousIndex = Math.max(segments.length - 1, 0);
      segments[previousIndex] = `${segments[previousIndex] ?? ""}${part.segment}`;
      continue;
    }
    segments.push(part.segment);
  }
  return segments;
}

function renderMarkdownFadeText(text: string, context: MarkdownFadeContext, keyBase: number): ReactNode[] {
  return markdownFadeTextSegments(text, context.segmenter).map((segment) => {
    const index = context.nextIndex;
    context.nextIndex += 1;
    return (
      <span
        className={index >= context.previousSegmentCount ? "hc-markdown-fade-in" : undefined}
        data-markdown-fade-index={index}
        key={`fade-${keyBase}-${index}`}
      >
        {segment}
      </span>
    );
  });
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
  | MarkdownPromptLinkSegment
  | { kind: "fileCitation"; path: string; lineStart: number; lineEnd: number }
  | { kind: "math"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "em"; text: string }
  | { kind: "del"; text: string };

export interface MarkdownPromptLinkSegment {
  href: string;
  kind: "promptLink";
  label: string;
  promptKind: MarkdownPromptLinkKind;
}

export type MarkdownPromptLinkKind = "app" | "plugin" | "skill";

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

    if (token.kind === "promptLink") {
      const promptLink = parseMarkdownPromptLink(text, token.index);
      if (!promptLink) {
        pushTextSegment(segments, text.slice(token.index, token.index + 1));
        index = token.index + 1;
        continue;
      }
      segments.push({
        kind: "promptLink",
        href: promptLink.href,
        label: promptLink.label,
        promptKind: promptLink.promptKind,
      });
      index = promptLink.endIndex;
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
        const promptLink = markdownPromptLinkFromHref(label, href);
        segments.push(promptLink ?? { kind: "link", text: label, href });
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
  | { kind: "promptLink"; index: number }
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
  const promptLinkIndex = findMarkdownPromptLinkStart(text, index);
  if (promptLinkIndex >= 0) candidates.push({ kind: "promptLink", index: promptLinkIndex });
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
  if (token.kind === "promptLink") return 4;
  if (token.kind === "html") return 5;
  if (token.kind === "image") return 6;
  if (token.kind === "link") return 7;
  if (token.kind === "del") return 8;
  if (token.kind === "strong") return 9;
  return 10;
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

function findMarkdownPromptLinkStart(text: string, index: number): number {
  let cursor = index;
  while (cursor < text.length) {
    const skillIndex = text.indexOf("$", cursor);
    const routeIndex = text.indexOf("@", cursor);
    const next = minPositiveIndex(skillIndex, routeIndex);
    if (next < 0) return -1;
    if (parseMarkdownPromptLink(text, next)) return next;
    cursor = next + 1;
  }
  return -1;
}

export function parseMarkdownPromptLink(text: string, startIndex = 0): (MarkdownPromptLinkSegment & { endIndex: number }) | null {
  if (text[startIndex] === "$") {
    const match = text.slice(startIndex).match(/^\$(?:\[([^\]\n]+)\]|([A-Za-z][\w-]*))/u);
    const name = (match?.[1] ?? match?.[2] ?? "").trim();
    if (!match || !name) return null;
    const label = `$${name}`;
    return {
      kind: "promptLink",
      endIndex: startIndex + match[0].length,
      href: `skill://${encodeURIComponent(name)}`,
      label,
      promptKind: "skill",
    };
  }

  if (text[startIndex] === "@") {
    const match = text.slice(startIndex).match(/^@[A-Za-z0-9][\w.-]*[\\/][\w./-]*/u);
    const label = match?.[0] ?? "";
    if (!label) return null;
    return {
      kind: "promptLink",
      endIndex: startIndex + label.length,
      href: `plugin://${label.slice(1).replace("\\", "/")}`,
      label,
      promptKind: "plugin",
    };
  }
  return null;
}

export function markdownPromptLinkFromHref(label: string, href: string): MarkdownPromptLinkSegment | null {
  const promptKind = markdownPromptLinkKindFromHref(href);
  if (!promptKind) return null;
  return {
    kind: "promptLink",
    href,
    label: normalizedMarkdownPromptLinkLabel(label, href, promptKind),
    promptKind,
  };
}

function markdownPromptLinkKindFromHref(href: string): MarkdownPromptLinkKind | null {
  try {
    const protocol = new URL(href).protocol;
    if (protocol === "app:") return "app";
    if (protocol === "plugin:") return "plugin";
    if (protocol === "skill:") return "skill";
  } catch {
    return null;
  }
  return null;
}

function normalizedMarkdownPromptLinkLabel(label: string, href: string, promptKind: MarkdownPromptLinkKind): string {
  const trimmed = label.trim();
  if (trimmed) return trimmed;
  try {
    const url = new URL(href);
    const name = decodeURIComponent(url.hostname || url.pathname.replace(/^\/+/u, ""));
    if (promptKind === "skill") return name ? `$${name}` : "$skill";
    if (promptKind === "plugin") return name ? `@${name}` : "@plugin";
    return name || "app";
  } catch {
    return promptKind;
  }
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
  fadeContext,
  mediaSources,
  onOpenFileReference,
}: {
  block: MarkdownBlock;
  fadeContext?: MarkdownFadeContext | null;
  mediaSources?: Map<string, string>;
  onOpenFileReference?: (reference: FileReference) => void;
}) {
  switch (block.kind) {
    case "heading": {
      return <Heading level={block.level}>{renderInline(block.text, onOpenFileReference, mediaSources, fadeContext)}</Heading>;
    }
    case "paragraph":
      return <p>{renderInlineWithBreaks(block.text, onOpenFileReference, mediaSources, fadeContext)}</p>;
    case "blockquote":
      return <blockquote>{renderInlineWithBreaks(block.text, onOpenFileReference, mediaSources, fadeContext)}</blockquote>;
    case "code":
      return (
        <LazyMarkdownCodeBlock block={block} />
      );
    case "details":
      return (
        <details className="hc-markdown-details" open={block.open}>
          <summary>
            <ChevronRight size={13} />
            <span>{renderInline(block.summary, onOpenFileReference, mediaSources, fadeContext)}</span>
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
              {renderInline(item, onOpenFileReference, mediaSources, fadeContext)}
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
                {renderInline(item.text, onOpenFileReference, mediaSources, fadeContext)}
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
                  <th key={index}>{renderInline(header, onOpenFileReference, mediaSources, fadeContext)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {normalizeTableRow(row, block.headers.length).map((cell, cellIndex) => (
                    <td key={cellIndex}>{renderInline(cell, onOpenFileReference, mediaSources, fadeContext)}</td>
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

function LazyMarkdownCodeBlock({ block }: { block: Extract<MarkdownBlock, { kind: "code" }> }) {
  const placeholderRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const element = placeholderRef.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      const timer = globalThis.setTimeout(() => setVisible(true), 0);
      return () => globalThis.clearTimeout(timer);
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setVisible(true);
      observer.disconnect();
    }, { rootMargin: DESKTOP_MARKDOWN_CODE_BLOCK_ROOT_MARGIN });
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  if (visible) {
    return (
      <CodeSnippet
        language={block.language}
        text={block.text}
        wrapMode={desktopMarkdownCodeBlockWrapMode(block.language)}
      />
    );
  }

  return (
    <div
      className="hc-markdown-code-lazy"
      data-wide-markdown-block="true"
      data-wide-markdown-block-kind={block.language.trim() || undefined}
      ref={placeholderRef}
    >
      <pre>
        <code>{block.text}</code>
      </pre>
    </div>
  );
}

function MarkdownImageView({ allowWide = false, image }: { allowWide?: boolean; image: MarkdownImageBlock }) {
  const [previewState, setPreviewState] = useState<MarkdownImagePreviewState | null>(null);
  const src = resolveMarkdownMediaSrc(image.src);
  const mediaKind = markdownMediaKind(src);
  const previewItem = previewState?.items[previewState.index] ?? null;
  const previewIndexes = markdownImagePreviewAdjacentIndexes(previewState);
  useEffect(() => {
    if (!previewState) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreviewState(null);
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      setPreviewState((current) => {
        const indexes = markdownImagePreviewAdjacentIndexes(current);
        const nextIndex = event.key === "ArrowLeft" ? indexes.previous : indexes.next;
        if (nextIndex === null) return current;
        event.preventDefault();
        event.stopPropagation();
        return current ? { ...current, index: nextIndex } : current;
      });
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [previewState]);

  const openPreview = (event: MouseEvent<HTMLButtonElement>) => {
    setPreviewState(markdownImagePreviewStateFromTrigger({
      fallbackItem: { alt: image.alt, src, title: image.title },
      root: event.currentTarget.closest(".hc-markdown"),
      trigger: event.currentTarget,
    }));
  };

  const navigatePreview = (index: number) => {
    setPreviewState((current) => current ? { ...current, index } : current);
  };

  if (mediaKind === "video") {
    return (
      <figure className={`hc-markdown-image ${allowWide ? "is-grid-item" : ""}`}>
        <video aria-label={image.alt || "Video"} controls preload="metadata" src={src} title={image.title ?? undefined} />
        {image.alt.trim().length > 0 && <figcaption>{image.alt}</figcaption>}
      </figure>
    );
  }
  const previewDialog = previewItem && typeof document !== "undefined"
    ? createPortal(
        <div className={MARKDOWN_IMAGE_PREVIEW_DIALOG_CLASS} role="dialog" aria-modal="true" aria-label={previewItem.alt || "Image preview"}>
          <button className="hc-markdown-image-preview-backdrop" type="button" aria-label="Close image preview" onClick={() => setPreviewState(null)} />
          {previewIndexes.previous !== null && (
            <button
              aria-label="Previous image"
              className="hc-markdown-image-preview-nav previous"
              type="button"
              onClick={() => navigatePreview(previewIndexes.previous ?? 0)}
            >
              <ChevronRight aria-hidden className="is-previous" size={22} />
            </button>
          )}
          {previewIndexes.next !== null && (
            <button
              aria-label="Next image"
              className="hc-markdown-image-preview-nav next"
              type="button"
              onClick={() => navigatePreview(previewIndexes.next ?? 0)}
            >
              <ChevronRight aria-hidden size={22} />
            </button>
          )}
          <div className="hc-markdown-image-preview-content">
            <button className="hc-markdown-image-preview-close" type="button" aria-label="Close image preview" onClick={() => setPreviewState(null)}>
              <X size={16} />
            </button>
            <img alt={previewItem.alt} src={previewItem.src} title={previewItem.title ?? undefined} />
            {previewItem.alt.trim().length > 0 && <div className="hc-markdown-image-preview-caption">{previewItem.alt}</div>}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <figure className={`hc-markdown-image ${allowWide ? "is-grid-item" : ""}`}>
        <button
          aria-label={image.alt || "Open image preview"}
          className="hc-markdown-image-trigger"
          data-markdown-image-preview-trigger="true"
          type="button"
          onClick={openPreview}
        >
          <img alt={image.alt} loading="lazy" src={src} title={image.title ?? undefined} />
        </button>
        {image.alt.trim().length > 0 && <figcaption>{image.alt}</figcaption>}
      </figure>
      {previewDialog}
    </>
  );
}

export function markdownImagePreviewAdjacentIndexes(
  state: MarkdownImagePreviewState | null,
): { next: number | null; previous: number | null } {
  if (!state) return { next: null, previous: null };
  return {
    previous: state.index > 0 ? state.index - 1 : null,
    next: state.index + 1 < state.items.length ? state.index + 1 : null,
  };
}

export function markdownImagePreviewStateFromTrigger({
  fallbackItem,
  root,
  trigger,
}: {
  fallbackItem: MarkdownImagePreviewItem;
  root: ParentNode | null;
  trigger: Element;
}): MarkdownImagePreviewState {
  const triggers = root
    ? Array.from(root.querySelectorAll(`[${MARKDOWN_IMAGE_PREVIEW_TRIGGER_ATTRIBUTE}="true"]`))
    : [];
  const items: MarkdownImagePreviewItem[] = [];
  let index: number | null = null;
  for (const candidate of triggers) {
    const image = candidate.querySelector("img");
    const candidateSrc = image?.currentSrc || image?.getAttribute("src") || "";
    if (!candidateSrc) continue;
    if (candidate === trigger) index = items.length;
    items.push({
      alt: image?.getAttribute("alt") ?? "",
      src: candidateSrc,
      title: image?.getAttribute("title") || null,
    });
  }
  return index === null ? { items: [fallbackItem], index: 0 } : { items, index };
}

function resolvedMarkdownImage(
  image: MarkdownImageBlock,
  mediaSources?: Map<string, string>,
): MarkdownImageBlock {
  const resolvedSrc = resolveAssistantMarkdownMediaSource(image.src, mediaSources);
  return resolvedSrc ? { ...image, src: resolvedSrc } : image;
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
  fadeContext?: MarkdownFadeContext | null,
): ReactNode[] {
  const lines = text.split("\n");
  return lines.flatMap((line, index) => {
    const rendered = renderInline(line, onOpenFileReference, mediaSources, fadeContext);
    return index === 0 ? rendered : [<br key={`br-${index}`} />, ...rendered];
  });
}

function renderInline(
  text: string,
  onOpenFileReference?: (reference: FileReference) => void,
  mediaSources?: Map<string, string>,
  fadeContext?: MarkdownFadeContext | null,
): ReactNode[] {
  return parseMarkdownInline(text).map((segment, index) => {
    if (segment.kind === "code") {
      const promptLink = markdownPromptLinkFromCodeText(segment.text);
      return promptLink ? <MarkdownPromptLink key={index} segment={promptLink} /> : <code key={index}>{segment.text}</code>;
    }
    if (segment.kind === "htmlBreak") return <br key={index} />;
    if (segment.kind === "htmlSpan") return renderBasicInlineHtmlSegment(segment, index, onOpenFileReference, mediaSources, fadeContext);
    if (segment.kind === "promptLink") return <MarkdownPromptLink key={index} segment={segment} />;
    if (segment.kind === "link") {
      return (
        <MarkdownLink href={segment.href} key={index}>
          {renderInline(segment.text, onOpenFileReference, mediaSources, fadeContext)}
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
    if (segment.kind === "strong") return <strong key={index}>{renderInline(segment.text, onOpenFileReference, mediaSources, fadeContext)}</strong>;
    if (segment.kind === "em") return <em key={index}>{renderInline(segment.text, onOpenFileReference, mediaSources, fadeContext)}</em>;
    if (segment.kind === "del") return <del key={index}>{renderInline(segment.text, onOpenFileReference, mediaSources, fadeContext)}</del>;
    if (fadeContext) return renderMarkdownFadeText(segment.text, fadeContext, index);
    return segment.text;
  });
}

function markdownPromptLinkFromCodeText(text: string): MarkdownPromptLinkSegment | null {
  const parsed = parseMarkdownPromptLink(text.trim(), 0);
  if (!parsed || parsed.endIndex !== text.trim().length) return null;
  return {
    kind: "promptLink",
    href: parsed.href,
    label: parsed.label,
    promptKind: parsed.promptKind,
  };
}

function renderBasicInlineHtmlSegment(
  segment: Extract<MarkdownInlineSegment, { kind: "htmlSpan" }>,
  key: number,
  onOpenFileReference?: (reference: FileReference) => void,
  mediaSources?: Map<string, string>,
  fadeContext?: MarkdownFadeContext | null,
): ReactNode {
  const children = renderInline(segment.text, onOpenFileReference, mediaSources, fadeContext);
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

function MarkdownPromptLink({ segment }: { segment: MarkdownPromptLinkSegment }) {
  return (
    <span
      className={`hc-markdown-prompt-link is-${segment.promptKind}`}
      data-prompt-link-kind={segment.promptKind}
      title={segment.href}
    >
      <span className="hc-markdown-prompt-link-mark" aria-hidden="true">
        {segment.promptKind === "skill" ? "$" : segment.promptKind === "plugin" ? "@" : "#"}
      </span>
      <span className="hc-markdown-prompt-link-label">{markdownPromptLinkDisplayLabel(segment)}</span>
    </span>
  );
}

function markdownPromptLinkDisplayLabel(segment: MarkdownPromptLinkSegment): string {
  if (segment.promptKind === "skill") return segment.label.replace(/^\$/u, "");
  if (segment.promptKind === "plugin") return segment.label.replace(/^@/u, "");
  return segment.label;
}

function MarkdownLink({ children, href }: { children: ReactNode; href: string }) {
  const external = isExternalHref(href);
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
        </span>
      )}
      <span className="hc-markdown-link-label">{children}</span>
    </a>
  );
}

function isExternalHref(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
