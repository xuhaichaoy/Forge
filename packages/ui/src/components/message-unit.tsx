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
import { marked, type Tokens } from "marked";
import { memo, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FormEvent, MouseEvent, ReactNode } from "react";
import type { AssistantReviewComment, ConversationRenderUnit, RailEntry } from "../state/render-groups";
import { convertLocalFileSrc, isTauriRuntime } from "../lib/tauri-host";
import { useHiCodexIntl, type HiCodexIntlContextValue } from "./i18n-provider";
import {
  assistantArtifactMediaSources,
  assistantResourceCardEntriesForMessage,
  resolveAssistantMarkdownMediaSource,
  shouldRenderAssistantMessageChrome,
} from "./assistant-message-artifacts";
import { AssistantEndResourceCards } from "./assistant-end-resource-cards";
import { AssistantResourceCards } from "./assistant-resource-cards";
import { TurnRatingControls, type SubmitTurnRatingEvent } from "./turn-rating-controls";
// codex: local-conversation-thread-*.js — automation citation
// extraction + chip row. Codex's assistant body interleaves `:citation{...}`
// leaf directives into the markdown and hoists them into either the trailing
// paragraph or the fallback chip row. HiCodex mirrors that with the helpers in
// `state/automation-citations` plus the chip components below.
import { AutomationCitationChip, AutomationCitationChipRow } from "./automation-citation";
import {
  automationCitationsFromItems,
  extractAutomationCitations,
  type CitationDirective,
} from "../state/automation-citations";
import { extractAssistantReviewComments } from "../state/assistant-review-comments";
import {
  CodeSnippet,
  desktopMarkdownCodeBlockWrapMode,
} from "./code-snippet";
import type { FileReference } from "./file-reference-types";
// codex inline-mentions-*.js wraps inline file references with the workspace-file
// context menu; HiCodex shares the menu definition via ./file-citation-menu.
import { ContextMenu } from "./context-menu";
import { FileCitationMenuContext, fileReferenceContextMenuItems } from "./file-citation-menu";
import { GeneratedImageGallery } from "./generated-image-gallery";
import { TurnDiffBlock, type PatchAction, type PatchActionState } from "./event-unit";
import {
  IconActionButton,
  MessageActionRow,
  shouldRenderMessageActionRow,
} from "./message-action-row";
import { focusPromptEditorElement, PromptEditor } from "./prompt-editor";
import {
  UserMessageAttachmentStrip,
  UserMessageTextContentView,
  hasInlineUserMessageContent,
} from "./user-message-content-render";
import type { OpenThreadHandler } from "./open-thread";

type MessageRenderUnit = Extract<ConversationRenderUnit, { kind: "message" }>;
type FormatMessage = HiCodexIntlContextValue["formatMessage"];

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
const DESKTOP_FILE_LINE_CITATION_PATTERN = /【([^†】\n]+)†L(\d+)(?:-L(\d+))?】/g;

export interface MarkdownImagePreviewItem {
  alt: string;
  src: string;
  title: string | null;
}

export interface MarkdownImagePreviewState {
  index: number;
  items: MarkdownImagePreviewItem[];
}

export function desktopAssistantCopyText(content: string): string {
  return content.trim().replace(
    DESKTOP_FILE_LINE_CITATION_PATTERN,
    (fullText, rawPath: string, rawLineStart: string, rawLineEnd: string | undefined) => {
      const path = desktopCopyCitationPath(rawPath.trim());
      if (path === null) return fullText;
      const lineStart = Number.parseInt(rawLineStart, 10);
      const lineEnd = rawLineEnd === undefined ? undefined : Number.parseInt(rawLineEnd, 10);
      if (lineEnd !== undefined && lineEnd !== lineStart) return `${path}:${lineStart}-${lineEnd}`;
      return lineStart === 1 ? path : `${path}:${lineStart}`;
    },
  );
}

function desktopCopyCitationPath(rawPath: string): string | null {
  const forceFile = rawPath.startsWith("F:");
  const decodedPath = desktopDecodeCitationPath(forceFile ? rawPath.slice(2).trim() : rawPath);
  if (forceFile) return decodedPath.length > 0 ? decodedPath : null;
  return isDesktopAbsolutePath(decodedPath) ? decodedPath : null;
}

function desktopDecodeCitationPath(path: string): string {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

function isDesktopAbsolutePath(path: string): boolean {
  return (path.startsWith("/") && !path.startsWith("//"))
    || /^[A-Za-z]:[\\/]/.test(path)
    || /^\\\\[^\\]+\\[^\\]+/.test(path)
    || /^\/\/[^/]+\/[^/]+/.test(path);
}

function MessageUnitViewInner({
  unit,
  threadId = null,
  isMostRecentTurn = false,
  onEditLastUserMessage,
  onOpenAssistantArtifact,
  onRevealAssistantEndResource,
  onForkTurn,
  onOpenThreadId,
  onSubmitTurnFeedback,
  onOpenFileReference,
  onOpenFileReferenceExternal,
  onOpenAutomation,
  onOpenDiff,
  onPatchAction,
  patchActionState,
  patchActionInFlight,
  memoryCitationRoot,
}: {
  unit: MessageRenderUnit;
  threadId?: string | null;
  isMostRecentTurn?: boolean;
  onEditLastUserMessage?: (turnId: string, message: string) => void | Promise<void>;
  onOpenAssistantArtifact?: (entry: RailEntry) => void;
  onRevealAssistantEndResource?: (entry: RailEntry) => void;
  onForkTurn?: (turnId: string) => void;
  onSubmitTurnFeedback?: SubmitTurnRatingEvent;
  onOpenThreadId?: OpenThreadHandler;
  onOpenFileReference?: (reference: FileReference) => void;
  onOpenFileReferenceExternal?: (reference: FileReference) => void;
  onOpenAutomation?: (automationId: string) => void;
  onOpenDiff?: (filePath?: string) => void;
  onPatchAction?: (action: PatchAction, diff: string) => void;
  patchActionState?: PatchActionState;
  patchActionInFlight?: boolean;
  memoryCitationRoot?: string | null;
}) {
  const assistantPhase = unit.role === "assistant" ? unit.assistantPhase ?? "unknown" : undefined;
  const streaming = unit.role === "assistant" && unit.isStreaming === true;
  const renderPlaceholder = unit.role === "assistant" && unit.renderPlaceholder === true;
  const showAssistantChrome = unit.role === "assistant" && shouldRenderAssistantMessageChrome(assistantPhase);
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
  const hasAssistantEndResources = unit.role === "assistant"
    && (unit.assistantAfter ?? []).some((after) => after.kind === "assistantEndResources");
  // codex: local-conversation-thread-*.js — the edit affordance is gated to the
  // MOST RECENT user turn only (`isMostRecentTurn: S === v.length-1`; onEditMessage
  // is passed solely when true). Older turns expose Fork, not Edit — the
  // ForkFromOlderTurn dialog is a fork-only affordance, never reached by edit.
  const onEdit = unit.role === "user"
    && isMostRecentTurn
    && !turnInProgress
    && turnId
    && onEditLastUserMessage
    && !unit.text.startsWith("PLEASE IMPLEMENT THIS PLAN:")
      ? (message: string) => onEditLastUserMessage(turnId, message)
      : undefined;
  const citation = unit.role === "assistant"
    ? (
        <MemoryCitationView
          citation={(unit.item as { memoryCitation?: unknown }).memoryCitation}
          memoryCitationRoot={memoryCitationRoot}
          onOpenFileReference={onOpenFileReference}
        />
      )
    : null;
  // codex: local-conversation-thread-*.js — merge the two Desktop
  // citation sources before handing text to Markdownish: raw `:citation{}`
  // leaf directives already embedded in markdown, plus the `automationCitations`
  // array that split-items attaches to completed assistant messages. Item-level
  // citations behave like Desktop's generated trailing directives.
  const assistantCitations = useMemo(
    () => {
      if (unit.role !== "assistant") return null;
      const extracted = extractAutomationCitations(unit.text);
      const itemCitations = automationCitationsFromItems(
        (unit.item as { automationCitations?: unknown }).automationCitations,
      );
      if (itemCitations.length === 0) return extracted;
      return {
        ...extracted,
        trailingCitations: [...extracted.trailingCitations, ...itemCitations],
      };
    },
    [unit.item, unit.role, unit.text],
  );
  const onAutomationCitationOpen = onOpenAutomation
    ? (citationDirective: CitationDirective) => {
        const automationId = citationDirective.openAutomationId?.trim();
        if (automationId) onOpenAutomation(automationId);
      }
    : undefined;
  // codex: local-conversation-thread-*.js — assistant body uses the
  // sanitized markdown (`cleanedContent`) so the raw directive token never
  // shows up in the rendered prose; falls back to the original text when no
  // citation extraction ran (non-assistant message or no `:citation` token).
  const assistantReviewExtraction = useMemo(
    () => unit.role === "assistant"
      ? extractAssistantReviewComments(assistantCitations?.cleanedContent ?? unit.text)
      : null,
    [assistantCitations, unit.role, unit.text],
  );
  const assistantMarkdownText = assistantReviewExtraction?.cleanedContent ?? assistantCitations?.cleanedContent ?? unit.text;
  const assistantCopyText = useMemo(
    () => unit.role === "assistant" && !streaming ? desktopAssistantCopyText(unit.text) : "",
    [streaming, unit.role, unit.text],
  );
  const canInlineAutomationCitations = assistantCitations
    ? assistantCitations.trailingCitations.length > 0
      && markdownAllowsTrailingAutomationInline(assistantMarkdownText)
    : false;
  // codex: local-conversation-thread-*.js — Codex picks the citation list and
  // combines the "trailing-paragraph fits" flag into the chip-row decision.
  // HiCodex mirrors that by withholding trailing citations from the row only
  // when Markdownish can append them to the final paragraph. Loose citations
  // always stay in the fallback row.
  const automationCitationChips = assistantCitations
    ? [
        ...assistantCitations.loose,
        ...(canInlineAutomationCitations ? [] : assistantCitations.trailingCitations),
      ]
    : [];
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
              onOpenThreadId={onOpenThreadId}
              unit={unit}
            />
          )
        : (
            renderPlaceholder
              ? (
                  <div className="hc-assistant-placeholder" aria-label="Assistant response is loading">
                    {/* codex pre-stream placeholder spinner = `.icon-sm` (18px), not 16px. */}
                    <Loader2 className="hc-spin" size={18} />
                  </div>
                )
              : (
                  <>
                    <Markdownish
                      text={assistantMarkdownText}
                      fadeType={streaming ? "indexed" : "none"}
                      mediaSources={assistantMediaSources}
                      onOpenAutomationCitation={onAutomationCitationOpen}
                      onOpenFileReference={onOpenFileReference}
                      onOpenFileReferenceExternal={onOpenFileReferenceExternal}
                      trailingAutomationCitations={canInlineAutomationCitations
                        ? assistantCitations?.trailingCitations
                        : undefined}
                    />
                    {/* codex: local-conversation-thread-*.js — citation chip row in
                      * the Codex render sequence (markdown body, citation chip row,
                      * memory citations, artifacts/extras, action row). HiCodex emits
                      * the row immediately after the markdown so reading order matches
                      * Codex's `mt-3` block. */}
                    <AutomationCitationChipRow
                      citations={automationCitationChips}
                      onOpen={onAutomationCitationOpen}
                    />
                    {citation}
                    <AssistantAfterGalleries units={unit.assistantAfter ?? []} />
                    <AssistantAfterEndResources
                      units={unit.assistantAfter ?? []}
                      onOpenArtifact={onOpenAssistantArtifact}
                      onRevealResource={onRevealAssistantEndResource}
                    />
                    {!hasAssistantEndResources && (
                      <AssistantResourceCards entries={assistantResourceCards} onOpenArtifact={onOpenAssistantArtifact} />
                    )}
                    <AssistantAfterReviewComments
                      units={unit.assistantAfter ?? []}
                      onOpenFileReference={onOpenFileReference}
                    />
                    <AssistantAfterEvents
                      units={unit.assistantAfter ?? []}
                      onOpenDiff={onOpenDiff}
                      onPatchAction={onPatchAction}
                      patchActionState={patchActionState}
                      patchActionInFlight={patchActionInFlight}
                    />
                    {showAssistantChrome && (
                      <AssistantMessageActions
                        copyText={assistantCopyText}
                        hasArtifacts={unit.hasArtifacts === true}
                        item={unit.item}
                        onFork={onFork}
                        onSubmitTurnFeedback={onSubmitTurnFeedback}
                                  threadId={threadId}
                        turnId={turnId}
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
      && prev.threadId === next.threadId
      && prev.onEditLastUserMessage === next.onEditLastUserMessage
      && prev.onOpenAssistantArtifact === next.onOpenAssistantArtifact
      && prev.onRevealAssistantEndResource === next.onRevealAssistantEndResource
      && prev.onForkTurn === next.onForkTurn
      && prev.onSubmitTurnFeedback === next.onSubmitTurnFeedback
      && prev.onOpenFileReference === next.onOpenFileReference
      && prev.onOpenAutomation === next.onOpenAutomation
      && prev.onOpenDiff === next.onOpenDiff
      && prev.onPatchAction === next.onPatchAction
      && prev.patchActionState === next.patchActionState
      && prev.patchActionInFlight === next.patchActionInFlight
      && prev.memoryCitationRoot === next.memoryCitationRoot
    );
  }
  if (prev.isMostRecentTurn !== next.isMostRecentTurn) return false;
  if (prev.threadId !== next.threadId) return false;
  if (prev.onEditLastUserMessage !== next.onEditLastUserMessage) return false;
  if (prev.onOpenAssistantArtifact !== next.onOpenAssistantArtifact) return false;
  if (prev.onRevealAssistantEndResource !== next.onRevealAssistantEndResource) return false;
  if (prev.onForkTurn !== next.onForkTurn) return false;
  if (prev.onSubmitTurnFeedback !== next.onSubmitTurnFeedback) return false;
  if (prev.onOpenFileReference !== next.onOpenFileReference) return false;
  if (prev.onOpenAutomation !== next.onOpenAutomation) return false;
  if (prev.onOpenDiff !== next.onOpenDiff) return false;
  if (prev.onPatchAction !== next.onPatchAction) return false;
  if (prev.patchActionState !== next.patchActionState) return false;
  if (prev.patchActionInFlight !== next.patchActionInFlight) return false;
  if (prev.memoryCitationRoot !== next.memoryCitationRoot) return false;
  const a = prev.unit;
  const b = next.unit;
  if (a.kind !== b.kind || a.role !== b.role || a.key !== b.key) return false;
  if (a.text !== b.text) return false;
  if (a.item !== b.item) return false;
  if (a.role === "assistant" && b.role === "assistant") {
    if (a.assistantPhase !== b.assistantPhase) return false;
    if (a.hasArtifacts !== b.hasArtifacts) return false;
    if (a.isStreaming !== b.isStreaming) return false;
    if (a.renderPlaceholder !== b.renderPlaceholder) return false;
    const aAfter = a.assistantAfter ?? null;
    const bAfter = b.assistantAfter ?? null;
    if (aAfter !== bAfter) {
      const aLen = aAfter?.length ?? 0;
      const bLen = bAfter?.length ?? 0;
      if (aLen !== bLen) return false;
      for (let i = 0; i < aLen; i += 1) {
        if (aAfter?.[i] !== bAfter?.[i]) return false;
      }
    }
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

function AssistantAfterGalleries({ units }: { units: NonNullable<MessageRenderUnit["assistantAfter"]> }) {
  const galleries = units.filter((unit) => unit.kind === "generatedImageGallery");
  if (galleries.length === 0) return null;
  return (
    <>
      {galleries.map((unit) => (
        <GeneratedImageGallery
          hasPending={unit.hasPending}
          images={unit.images}
          key={unit.key}
        />
      ))}
    </>
  );
}

function AssistantAfterEndResources({
  units,
  onOpenArtifact,
  onRevealResource,
}: {
  units: NonNullable<MessageRenderUnit["assistantAfter"]>;
  onOpenArtifact?: (entry: RailEntry) => void;
  onRevealResource?: (entry: RailEntry) => void;
}) {
  const resourceUnits = units.filter((unit) => unit.kind === "assistantEndResources");
  if (resourceUnits.length === 0) return null;
  return (
    <>
      {resourceUnits.map((unit) => (
        <AssistantEndResourceCards
          key={unit.key}
          resources={unit.resources}
          onOpenArtifact={onOpenArtifact}
          onRevealResource={onRevealResource}
        />
      ))}
    </>
  );
}

function AssistantAfterReviewComments({
  units,
  onOpenFileReference,
}: {
  units: NonNullable<MessageRenderUnit["assistantAfter"]>;
  onOpenFileReference?: (reference: FileReference) => void;
}) {
  const { formatMessage } = useHiCodexIntl();
  const reviewUnits = units.filter((unit) => unit.kind === "assistantReviewComments");
  const comments = reviewUnits.flatMap((unit) => unit.comments).sort(compareReviewCommentsByPriority);
  const [expanded, setExpanded] = useState(false);
  if (comments.length === 0) return null;

  const visibleComments = expanded ? comments : comments.slice(0, 3);
  const hiddenCount = comments.length - visibleComments.length;
  const countLabel = formatMessage({
    id: "localConversation.reviewComments.count",
    defaultMessage: "{count, plural, one {# comment} other {# comments}}",
    description: "Title for the turn-end card summarizing model-authored code review comments",
  }, { count: comments.length });

  return (
    <div className="hc-assistant-review-comments">
      <div className="hc-assistant-review-comments-header">
        <span className="hc-assistant-review-comments-icon">
          <FileText size={16} />
        </span>
        <span>{countLabel}</span>
      </div>
      <div className="hc-assistant-review-comments-list">
        {visibleComments.map((comment, index) => (
          <AssistantReviewCommentRow
            comment={comment}
            index={index}
            key={`${comment.path}:${comment.startLine ?? comment.line}:${comment.line}:${comment.title}:${index}`}
            onOpenFileReference={onOpenFileReference}
            formatMessage={formatMessage}
          />
        ))}
        {hiddenCount > 0 && (
          <button
            type="button"
            aria-expanded={false}
            className="hc-assistant-review-comments-toggle"
            onClick={() => setExpanded(true)}
          >
            <span>{formatMessage({
              id: "localConversation.reviewComments.showMore",
              defaultMessage: "{count, plural, one {Show # more comment} other {Show # more comments}}",
              description: "Button label that expands hidden model-authored code review comments",
            }, { count: hiddenCount })}</span>
            <ChevronRight size={13} />
          </button>
        )}
        {expanded && comments.length > 3 && (
          <button
            type="button"
            aria-expanded
            className="hc-assistant-review-comments-toggle"
            onClick={() => setExpanded(false)}
          >
            <span>{formatMessage({
              id: "localConversation.reviewComments.collapse",
              defaultMessage: "Collapse comments",
              description: "Button label that collapses expanded model-authored code review comments",
            })}</span>
            <ChevronRight className="is-open" size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

function AssistantReviewCommentRow({
  comment,
  formatMessage,
  index,
  onOpenFileReference,
}: {
  comment: AssistantReviewComment;
  formatMessage: FormatMessage;
  index: number;
  onOpenFileReference?: (reference: FileReference) => void;
}) {
  const location = reviewCommentLocation(comment);
  const tooltipBody = comment.body.trim();
  const content = (
    <span className="hc-assistant-review-comment-row-content">
      <span className="hc-assistant-review-comment-priority-slot">
        {comment.priority && (
          <span className="hc-assistant-review-comment-priority">{comment.priority}</span>
        )}
      </span>
      <span className="hc-assistant-review-comment-title">{comment.title}</span>
      <span className="hc-assistant-review-comment-location" title={location}>
        <span dir="ltr">{location}</span>
      </span>
    </span>
  );
  const row = !onOpenFileReference ? (
    <div className="hc-assistant-review-comment-row" data-index={index}>
      {content}
    </div>
  ) : (
    <button
      type="button"
      aria-label={formatMessage({
        id: "localConversation.reviewComments.openComment",
        defaultMessage: "View {title} in {location}",
        description: "Accessible label for opening one model-authored code review comment from a conversation turn",
      }, { title: comment.title, location })}
      className="hc-assistant-review-comment-row"
      data-index={index}
      onClick={() => onOpenFileReference(reviewCommentFileReference(comment))}
    >
      {content}
    </button>
  );
  if (!tooltipBody) return row;
  return (
    <div className="hc-assistant-review-comment-tooltip-wrap">
      {row}
      <div className="hc-assistant-review-comment-tooltip" role="tooltip">
        <div className="hc-assistant-review-comment-tooltip-open-row">
          {comment.priority ? (
            <span className="hc-assistant-review-comment-priority">{comment.priority}</span>
          ) : null}
          <span className="hc-assistant-review-comment-tooltip-location" dir="ltr">{location}</span>
        </div>
        <div className="hc-assistant-review-comment-tooltip-body">
          <div className="hc-assistant-review-comment-tooltip-title">{comment.title}</div>
          <div className="hc-assistant-review-comment-tooltip-copy">{tooltipBody}</div>
        </div>
      </div>
    </div>
  );
}

function compareReviewCommentsByPriority(a: AssistantReviewComment, b: AssistantReviewComment): number {
  return reviewCommentPrioritySortValue(a) - reviewCommentPrioritySortValue(b);
}

function reviewCommentPrioritySortValue(comment: AssistantReviewComment): number {
  const value = comment.priority?.match(/^P(\d)$/i)?.[1];
  return value ? Number(value) : Number.MAX_SAFE_INTEGER;
}

function reviewCommentLocation(comment: AssistantReviewComment): string {
  return `${comment.path}:${comment.line}`;
}

function reviewCommentFileReference(comment: AssistantReviewComment): FileReference {
  const lineStart = comment.startLine ?? comment.line;
  return {
    path: comment.path,
    lineStart,
    ...(comment.startLine && comment.line !== comment.startLine ? { lineEnd: comment.line } : {}),
  };
}

function AssistantAfterEvents({
  units,
  onOpenDiff,
  onPatchAction,
  patchActionState,
  patchActionInFlight,
}: {
  units: NonNullable<MessageRenderUnit["assistantAfter"]>;
  onOpenDiff?: (filePath?: string) => void;
  onPatchAction?: (action: PatchAction, diff: string) => void;
  patchActionState?: PatchActionState;
  patchActionInFlight?: boolean;
}) {
  const events = units.filter((unit) => unit.kind === "assistantAfterEvent");
  if (events.length === 0) return null;
  return (
    <>
      {events.map((unit) => {
        if (unit.format !== "diff") return null;
        return (
          <TurnDiffBlock
            contentSearchUnitKey={unit.key}
            inProgress={false}
            itemIds={unit.item.id}
            key={unit.key}
            onOpenDiff={onOpenDiff}
            onPatchAction={onPatchAction}
            patchActionState={patchActionState}
            patchActionInFlight={patchActionInFlight}
            value={unit.text}
          />
        );
      })}
    </>
  );
}

function UserMessageUnit({
  unit,
  onEdit,
  onOpenFileReference,
  onOpenThreadId,
}: {
  unit: MessageRenderUnit;
  onEdit?: (message: string) => void | Promise<void>;
  onOpenFileReference?: (reference: FileReference) => void;
  onOpenThreadId?: OpenThreadHandler;
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
      {unit.parentThreadAttachment && (
        <ParentThreadAttachmentChip
          sourceConversationId={unit.parentThreadAttachment.sourceConversationId}
          onOpenThreadId={onOpenThreadId}
        />
      )}
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
        copyText={unit.copyText ?? unit.text}
        meta={userMessageMetaChips(unit.item)}
        onEdit={onEdit ? () => setEditing(true) : undefined}
      />
    </>
  );
}

function ParentThreadAttachmentChip({
  sourceConversationId,
  onOpenThreadId,
}: {
  sourceConversationId: string;
  onOpenThreadId?: OpenThreadHandler;
}) {
  const content = (
    <>
      <GitFork aria-hidden size={14} />
      <span>Parent chat</span>
    </>
  );
  if (!onOpenThreadId) {
    return <div className="hc-parent-thread-attachment">{content}</div>;
  }
  return (
    <button
      className="hc-parent-thread-attachment"
      type="button"
      onClick={() => onOpenThreadId(sourceConversationId)}
    >
      {content}
    </button>
  );
}

function shouldRenderUserMessageBubble(unit: MessageRenderUnit): boolean {
  /*
   * Codex puts prose plus inline prompt chips (`$skill` / `@path`) inside
   * the bubble. File attachments and images live in the sibling strip
   * above it, so pure attachment messages do not create an empty bubble.
   */
  return hasInlineUserMessageContent(unit);
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
          {/* codex collapse chevron = icon-2xs (14px) */}
          <ChevronRight size={14} className={expanded ? "is-open" : ""} />
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
  if (stringValue(item.deliveryStatus) === "not-sent" || booleanField(item, "hookBlocked")) {
    chips.push("Hook blocked this message");
  } else if (item.type === "hookPrompt" || booleanField(item, "hookFeedback")) {
    chips.push("Hook feedback");
  }
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
  // codex local-conversation-thread userMessage.pullRequestMergeConflict — gated on the
  // item's `hasPullRequestMergeConflict` boolean (same protocol field Codex reads, a
  // sibling of pullRequestFixMode/autoResolveSync), rendered near the end of the strip.
  if (booleanField(item, "hasPullRequestMergeConflict")) chips.push("Merge conflicts");
  return chips;
}

function threadGoalMetaChip(item: Record<string, unknown>): string | null {
  const goal = recordField(item, "_threadGoal");
  const objective = stringValue(goal.objective).trim();
  const status = stringValue(goal.status).trim();
  if (objective || status || item.goal === true) return "Sent as goal";
  return null;
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

function UserMessageActions({
  copyText,
  meta,
  onEdit,
}: {
  copyText: string;
  meta: string[];
  onEdit?: () => void;
}) {
  const hasActionChildren = Boolean(onEdit);
  const shouldRenderActionRow = shouldRenderMessageActionRow({ copyText, hasActionChildren });
  const actionRow = shouldRenderActionRow
    ? (
        <MessageActionRow copyText={copyText} hasActionChildren={hasActionChildren}>
          {onEdit && (
            <IconActionButton ariaLabel="Edit message" title="Edit" onClick={onEdit}>
              {/* HiCodex divergence: 12px (Codex action icon-xs = 16px), per product preference */}
              <Pencil size={12} />
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
  copyText,
  hasArtifacts,
  item,
  onFork,
  onSubmitTurnFeedback,
  threadId,
  turnId,
}: {
  copyText: string;
  hasArtifacts?: boolean;
  item: Record<string, unknown>;
  onFork?: () => void;
  onSubmitTurnFeedback?: SubmitTurnRatingEvent;
  threadId?: string | null;
  turnId?: string | null;
}) {
  const autoReviewSummary = assistantAutoReviewSummary(item);
  /*
   * codex: local-conversation-thread-*.pretty.js + imported
   * `plan-summary-item-content-*.pretty.js` — the current Desktop
   * assistant action row is `[copy, turnRating(hasArtifacts), fork, autoReview,
   * hookStats, completedGoal, sentAt]`. `hasArtifacts` is only passed into
   * the turn-rating feedback control to select artifact-specific
   * feedback options; Desktop does not render a standalone FileText "open
   * artifacts" button here. HiCodex has no Codex analytics feedback surface
   * yet, so artifact presence must not invent an action-row child.
   */
  const hookStatsSummary = assistantHookStatsSummary(item);
  const goalSummary = assistantCompletedThreadGoal(item);
  const canRateTurn = Boolean(threadId && turnId && onSubmitTurnFeedback);
  const hasActionChildren = Boolean(onFork)
    || Boolean(autoReviewSummary)
    || Boolean(hookStatsSummary)
    || Boolean(goalSummary)
    || canRateTurn;
  return (
    <MessageActionRow copyText={copyText} hasActionChildren={hasActionChildren} sentAtMs={messageSentAtMs(item)}>
      <TurnRatingControls
        hasArtifacts={hasArtifacts === true}
        onSubmit={onSubmitTurnFeedback}
        threadId={threadId}
        turnId={turnId}
      />
      {onFork && (
        <IconActionButton ariaLabel="Fork from this point" title="Fork" onClick={onFork}>
          {/* HiCodex divergence: 12px (Codex action icon-xs = 16px), per product preference */}
          <GitFork size={12} />
        </IconActionButton>
      )}
      {autoReviewSummary && <AssistantAutoReviewAction summary={autoReviewSummary} />}
      {/* codex: local-conversation-thread-*.js — hookStats chip */}
      {hookStatsSummary && <AssistantHookStatsAction summary={hookStatsSummary} />}
      {/* codex: local-conversation-thread-*.js — completedThreadGoal chip */}
      {goalSummary && <AssistantCompletedGoalAction summary={goalSummary} />}
    </MessageActionRow>
  );
}

interface AssistantHookStatsSummary {
  label: string;
  title: string;
  rows: Array<{ label: string; value: string }>;
  entries: Array<{ kind: string; text: string }>;
}

interface AssistantCompletedGoalSummary {
  label: string;
  objective: string;
  durationLabel: string;
}

// codex: user-message-attachments-*.js — hookStats chip with a
// summary tooltip listing ran/blocked/error counts plus optional entries.
function AssistantHookStatsAction({ summary }: { summary: AssistantHookStatsSummary }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="hc-auto-review-action">
      <button
        aria-expanded={open}
        className="hc-message-action-status text hc-auto-review-trigger"
        onClick={() => setOpen((value) => !value)}
        title={summary.title}
        type="button"
      >
        {summary.label}
      </button>
      {open && (
        <span className="hc-auto-review-popover" role="dialog" data-state="open" aria-label={summary.title}>
          <span className="hc-auto-review-popover-title">{summary.title}</span>
          {summary.rows.length > 0 && (
            <span className="hc-auto-review-popover-rows">
              {summary.rows.map((row) => (
                <span className="hc-auto-review-popover-row" key={`${row.label}:${row.value}`}>
                  <span>{row.label}</span>
                  <span>{row.value}</span>
                </span>
              ))}
            </span>
          )}
          {summary.entries.length > 0 && (
            <span className="hc-auto-review-command-list">
              {summary.entries.map((entry, index) => (
                <code key={`${index}:${entry.kind}:${entry.text}`}>{`${entry.kind}: ${entry.text}`}</code>
              ))}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

// codex: local-conversation-thread-*.js — render the completed thread
// goal as a non-interactive chip. Codex shows "Goal achieved in {totalTime}"
// (formatting `timeUsedSeconds*1000`) plus a small icon and divider; we mirror
// the label + tooltip carrying the objective text.
function AssistantCompletedGoalAction({ summary }: { summary: AssistantCompletedGoalSummary }) {
  return (
    <span
      aria-label={summary.objective ? `Goal complete: ${summary.objective}` : "Goal complete"}
      className="hc-message-action-status text hc-message-goal-chip"
      title={summary.objective || summary.label}
    >
      {summary.label}
    </span>
  );
}

// codex: local-conversation-thread-*.js — destructures `hookStats`
// off the assistant render unit; here we recover the same shape from the raw
// assistant item so HiCodexApp does not need to thread an extra prop.
//
// AUDIT (2026-05): the HiCodex protocol (`packages/codex-protocol/src/generated`)
// does not yet expose hook aggregation on `ThreadItem`. The `hook/started` /
// `hook/completed` notifications are received by the reducer
// (state/codex-reducer.ts:1259-1264) but they are funneled into the log channel
// only — no `hookStats` field is materialised onto the assistant item that
// closes the turn. Until the reducer learns to aggregate per-turn hook runs
// and project them onto the trailing assistant message (the way `_threadGoal`
// is projected onto the matching user message via
// `projectThreadGoalOntoUserMessages`), this helper reads from a field that
// will never be present and returns `null`. The chip is implemented and ready
// to light up once the reducer slice exists; do not delete the helper. See
// docs/DEVELOPMENT.md for the longer note tying this to Codex's user-message
// `hookStats`/`hookRuns` rule.
export function assistantHookStatsSummary(item: Record<string, unknown>): AssistantHookStatsSummary | null {
  const raw = (item as { hookStats?: unknown }).hookStats;
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const count = numericField(record, "count");
  const blocked = numericField(record, "blockedCount") || numericField(record, "blocked");
  const errorCount = numericField(record, "errorCount") || numericField(record, "errors");
  const entriesRaw = Array.isArray(record.entries) ? record.entries : [];
  const entries: Array<{ kind: string; text: string }> = [];
  for (const entry of entriesRaw) {
    if (!entry || typeof entry !== "object") continue;
    const er = entry as Record<string, unknown>;
    const kind = typeof er.kind === "string" ? er.kind.trim() : "";
    const text = typeof er.text === "string" ? er.text.trim() : "";
    if (!kind && !text) continue;
    entries.push({ kind: kind || "hook", text: text.length > 240 ? `${text.slice(0, 237)}...` : text });
    if (entries.length >= 6) break;
  }
  if (count === 0 && blocked === 0 && errorCount === 0 && entries.length === 0) return null;
  // Codex's chip is icon-only with a tooltip — mirror with a short label plus a
  // structured popover so users can still tell hooks ran on hover/focus.
  const total = count > 0 ? count : entries.length;
  const label = total === 1 ? "1 hook" : `${total} hooks`;
  const rows: Array<{ label: string; value: string }> = [];
  if (count > 0) rows.push({ label: "Ran", value: String(count) });
  if (blocked > 0) rows.push({ label: "Blocked", value: String(blocked) });
  if (errorCount > 0) rows.push({ label: "Errors", value: String(errorCount) });
  return { label, title: "Hooks summary", rows, entries };
}

// codex: local-conversation-thread-*.js — `timeUsedSeconds*1e3` formatted to
// "Goal achieved in {totalTime}". HiCodex only renders the chip
// when the goal status is `complete`/`completed` (Codex passes `null` for
// in-progress goals).
//
// AUDIT (2026-05): the HiCodex reducer maintains a per-thread `threadGoal`
// slice (state/codex-reducer.ts:99-100, sourced from `thread/goal/updated` —
// `ThreadGoal` is fully typed by the protocol in
// `packages/codex-protocol/src/generated/v2/ThreadGoal.ts`) and projects it
// onto the matching user message as `_threadGoal`. When the status reaches
// `complete`, the reducer also projects `_completedThreadGoal` onto the last
// assistant item in the goal turn. Codex's assistant action row reads
// `n.completedThreadGoal` directly off the assistant render unit; HiCodex
// accepts both names so protocol-native or projected items light up the chip.
export function assistantCompletedThreadGoal(item: Record<string, unknown>): AssistantCompletedGoalSummary | null {
  const raw = (item as { completedThreadGoal?: unknown; _completedThreadGoal?: unknown }).completedThreadGoal
    ?? (item as { _completedThreadGoal?: unknown })._completedThreadGoal;
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const status = typeof record.status === "string" ? record.status.trim().toLowerCase() : "";
  if (status && status !== "complete" && status !== "completed") return null;
  const objective = typeof record.objective === "string" ? record.objective.trim() : "";
  const seconds = numericField(record, "timeUsedSeconds");
  const durationLabel = seconds > 0 ? formatGoalDuration(seconds * 1000) : "";
  const label = durationLabel ? `Goal achieved in ${durationLabel}` : "Goal complete";
  return { label, objective, durationLabel };
}

function formatGoalDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return "";
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`;
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)} s`;
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1000);
  return seconds > 0 ? `${minutes} min ${seconds} s` : `${minutes} min`;
}

function AssistantAutoReviewAction({ summary }: { summary: AssistantAutoReviewSummary }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="hc-auto-review-action">
      <button
        aria-expanded={open}
        className="hc-message-action-status text hc-auto-review-trigger"
        onClick={() => setOpen((value) => !value)}
        title={summary.title}
        type="button"
      >
        {summary.label}
      </button>
      {open && (
        <span className="hc-auto-review-popover" role="dialog" data-state="open" aria-label={summary.title}>
          <span className="hc-auto-review-popover-title">{summary.title}</span>
          {summary.rows.length > 0 && (
            <span className="hc-auto-review-popover-rows">
              {summary.rows.map((row) => (
                <span className="hc-auto-review-popover-row" key={`${row.label}:${row.value}`}>
                  <span>{row.label}</span>
                  <span>{row.value}</span>
                </span>
              ))}
            </span>
          )}
          {summary.commands.length > 0 && (
            <span className="hc-auto-review-command-list">
              {summary.commands.map((command, index) => (
                <code key={`${index}:${command}`}>{command}</code>
              ))}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

export function assistantAutoReviewSummary(item: Record<string, unknown>): AssistantAutoReviewSummary | null {
  const stats = item.autoReviewStats;
  if (!stats || typeof stats !== "object") return null;
  const record = stats as Record<string, unknown>;
  const rows: Array<{ label: string; value: string }> = [];
  const status = autoReviewStringField(record, "status");
  if (status) rows.push({ label: "Status", value: status });
  const risk = autoReviewStringField(record, "riskLevel") || autoReviewStringField(record, "risk");
  if (risk) rows.push({ label: "Risk", value: risk });
  const issueCount = numericField(record, "issueCount") || numericField(record, "findings") || numericField(record, "findingCount");
  if (issueCount > 0) rows.push({ label: "Findings", value: String(issueCount) });
  const accepted = numericField(record, "accepted") || numericField(record, "acceptedCount");
  if (accepted > 0) rows.push({ label: "Accepted", value: String(accepted) });
  const rejected = numericField(record, "rejected") || numericField(record, "rejectedCount");
  if (rejected > 0) rows.push({ label: "Rejected", value: String(rejected) });
  const duration = autoReviewDuration(record);
  if (duration) rows.push({ label: "Duration", value: duration });
  const rationale = autoReviewStringField(record, "rationale") || autoReviewStringField(record, "summary");
  if (rationale) rows.push({ label: "Rationale", value: truncateAutoReviewDetail(rationale) });
  const commands = autoReviewCommands(record);
  const label = autoReviewLabel(record, issueCount, status);
  return {
    label,
    title: issueCount > 0 ? "Auto-review notes" : "Auto-review",
    rows,
    commands,
  };
}

function autoReviewLabel(record: Record<string, unknown>, issueCount: number, status: string): string {
  if (issueCount > 0) return issueCount === 1 ? "1 review note" : `${issueCount} review notes`;
  const accepted = numericField(record, "accepted") || numericField(record, "acceptedCount");
  const rejected = numericField(record, "rejected") || numericField(record, "rejectedCount");
  if (accepted > 0 || rejected > 0) return `${accepted} accepted / ${rejected} rejected`;
  return status || "Review";
}

function autoReviewDuration(record: Record<string, unknown>): string {
  const durationMs = numericField(record, "durationMs") || numericField(record, "elapsedMs");
  if (durationMs <= 0) return "";
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`;
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)} s`;
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1000);
  return seconds > 0 ? `${minutes} min ${seconds} s` : `${minutes} min`;
}

function autoReviewCommands(record: Record<string, unknown>): string[] {
  const fields = [
    record.perCommandHistory,
    record.commands,
    record.commandHistory,
  ];
  return fields.flatMap((field) => {
    if (!Array.isArray(field)) return [];
    return field.flatMap((entry) => autoReviewCommandText(entry));
  }).slice(0, 6);
}

function autoReviewCommandText(entry: unknown): string[] {
  if (typeof entry === "string" && entry.trim()) return [entry.trim()];
  if (!entry || typeof entry !== "object") return [];
  const record = entry as Record<string, unknown>;
  const command = autoReviewStringField(record, "command") || autoReviewStringField(record, "cmd") || autoReviewStringField(record, "text");
  const decision = autoReviewStringField(record, "decision") || autoReviewStringField(record, "status");
  if (!command) return [];
  return [decision ? `${decision}: ${command}` : command];
}

function autoReviewStringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function truncateAutoReviewDetail(value: string): string {
  return value.length > 180 ? `${value.slice(0, 177).trimEnd()}...` : value;
}

/*
 * Codex Desktop renders a per-message timestamp as the trailing hover/focus
 * affordance in the action row (re-verified vs v26.519.81530). Derive the
 * best available send time from the protocol item's timing fields.
 */
function messageSentAtMs(item: Record<string, unknown>): number | null {
  const candidates: unknown[] = [
    item.sentAtMs,
    item.completedAtMs,
    item.startedAtMs,
    item.createdAtMs,
    item.createdAt,
  ];
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  }
  return null;
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
  onOpenAutomationCitation,
  onOpenFileReference,
  onOpenFileReferenceExternal,
  trailingAutomationCitations,
}: {
  fadeType?: MarkdownFadeType;
  text: string;
  mediaSources?: Map<string, string>;
  onOpenAutomationCitation?: (citation: CitationDirective) => void;
  onOpenFileReference?: (reference: FileReference) => void;
  onOpenFileReferenceExternal?: (reference: FileReference) => void;
  trailingAutomationCitations?: CitationDirective[];
}) {
  /*
   * Parsing is pure; cache the result by `text` so the streaming loop only
   * pays the parse cost when the text actually changes. Without this, every
   * unrelated `MessageUnitView` parent re-render that bypasses memo (e.g.
   * because a callback prop changed identity) would re-tokenise the full
   * assistant message — a significant CPU spike that on mid-tier machines
   * dropped frames and surfaced as visible flicker.
   */
  const markdownDocument = useMemo(() => parseMarkdownDocument(text), [text]);
  const { blocks, references } = markdownDocument;
  const segmenter = useRef<MarkdownWordSegmenter | null>(createMarkdownWordSegmenter());
  const previousFadeSegmentCount = useRef(0);
  const markdownRootRef = useRef<HTMLDivElement | null>(null);
  const fadeEnabled = fadeType === "indexed";
  const fadeSegmentCount = fadeEnabled ? markdownIndexedFadeSegmentCount(blocks, segmenter.current, references) : 0;
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
        : blocks.map((block, index) => {
            const inlineAutomationCitations = index === blocks.length - 1 && block.kind === "paragraph"
              ? trailingAutomationCitations
              : undefined;
            return (
              <MarkdownBlockView
                block={block}
                fadeContext={fadeContext}
                inlineAutomationCitations={inlineAutomationCitations}
                key={index}
                mediaSources={mediaSources}
                onOpenAutomationCitation={onOpenAutomationCitation}
                onOpenFileReference={onOpenFileReference}
                onOpenFileReferenceExternal={onOpenFileReferenceExternal}
                references={references}
              />
            );
          })}
    </div>
  );
}

function markdownAllowsTrailingAutomationInline(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || /^\s*:{2,3}[a-zA-Z0-9-]+(?:\s|\{|\[|$)/m.test(text)) {
    return false;
  }
  try {
    return parseMarkdownBlocks(text).at(-1)?.kind === "paragraph";
  } catch {
    return true;
  }
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
  references?: MarkdownReferenceDefinitions,
): number {
  return blocks.reduce((count, block) => count + markdownBlockFadeSegmentCount(block, segmenter, references), 0);
}

function markdownBlockFadeSegmentCount(
  block: MarkdownBlock,
  segmenter: MarkdownWordSegmenter | null,
  references?: MarkdownReferenceDefinitions,
): number {
  switch (block.kind) {
    case "heading":
    case "paragraph":
      return markdownInlineFadeSegmentCount(block.text, segmenter, { references });
    case "blockquote":
      return block.children
        ? block.children.reduce((count, child) => count + markdownBlockFadeSegmentCount(child, segmenter, references), 0)
        : markdownInlineFadeSegmentCount(block.text, segmenter, { references });
    case "details":
      return markdownInlineFadeSegmentCount(block.summary, segmenter, { references });
    case "list":
      return block.items.reduce((count, item) => count + markdownListItemFadeSegmentCount(item, segmenter, references), 0);
    case "taskList":
      return block.items.reduce((count, item) => count + markdownInlineFadeSegmentCount(item.text, segmenter, { references }), 0);
    case "table":
      return [...block.headers, ...block.rows.flat()].reduce(
        (count, cell) => count + markdownInlineFadeSegmentCount(cell, segmenter, { references }),
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

function markdownListItemFadeSegmentCount(
  item: MarkdownListItemValue,
  segmenter: MarkdownWordSegmenter | null,
  references?: MarkdownReferenceDefinitions,
): number {
  if (typeof item === "string") return markdownInlineFadeSegmentCount(item, segmenter, { references });
  return markdownInlineFadeSegmentCount(item.text, segmenter, { references })
    + (item.children ?? []).reduce((count, child) => count + markdownBlockFadeSegmentCount(child, segmenter, references), 0);
}

function markdownInlineFadeSegmentCount(
  text: string,
  segmenter: MarkdownWordSegmenter | null,
  options: MarkdownInlineParseOptions = {},
): number {
  return parseMarkdownInline(text, options).reduce((count, segment) => {
    if (segment.kind === "text") return count + markdownFadeTextSegments(segment.text, segmenter).length;
    if (
      segment.kind === "del"
      || segment.kind === "em"
      || segment.kind === "htmlSpan"
      || segment.kind === "link"
      || segment.kind === "strong"
    ) {
      return count + markdownInlineFadeSegmentCount(
        segment.text,
        segmenter,
        segment.kind === "link" ? { ...options, inLink: true } : options,
      );
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
  | { children?: MarkdownBlock[]; kind: "blockquote"; text: string }
  | { kind: "code"; language: string; text: string }
  | { kind: "details"; open: boolean; summary: string; text: string }
  | { kind: "math"; text: string }
  | { kind: "list"; loose?: boolean; ordered: boolean; items: MarkdownListItemValue[]; start?: number }
  | { kind: "taskList"; items: MarkdownTaskListItem[] }
  | { aligns?: MarkdownTableAlign[]; kind: "table"; headers: string[]; rows: string[][] }
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

export interface MarkdownNestedListItem {
  checked?: boolean;
  children?: MarkdownBlock[];
  task?: boolean;
  text: string;
}

export type MarkdownListItemValue = string | MarkdownNestedListItem;

export type MarkdownTableAlign = "center" | "left" | "right" | null;

export type MarkdownInlineSegment =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "htmlBreak" }
  | { kind: "htmlSpan"; tag: MarkdownBasicHtmlTag; text: string }
  | { kind: "image"; alt: string; src: string; title: string | null }
  | { kind: "link"; text: string; href: string; title?: string | null }
  | MarkdownPromptLinkSegment
  | { kind: "fileCitation"; path: string; lineStart: number; lineEnd: number }
  | { kind: "math"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "em"; text: string }
  | { kind: "del"; text: string };

interface MarkdownInlineParseOptions {
  inLink?: boolean;
  references?: MarkdownReferenceDefinitions;
}

export interface MarkdownReferenceDefinition {
  href: string;
  title: string | null;
}

export type MarkdownReferenceDefinitions = Map<string, MarkdownReferenceDefinition>;

export interface MarkdownDocument {
  blocks: MarkdownBlock[];
  references: MarkdownReferenceDefinitions;
}

export interface MarkdownPromptLinkSegment {
  href: string;
  kind: "promptLink";
  label: string;
  promptKind: MarkdownPromptLinkKind;
}

export type MarkdownPromptLinkKind = "app" | "plugin" | "skill";

type MarkdownBasicHtmlTag = "b" | "del" | "em" | "i" | "s" | "strong" | "sub" | "sup" | "u";

export interface AssistantAutoReviewSummary {
  label: string;
  title: string;
  rows: Array<{ label: string; value: string }>;
  commands: string[];
}

export interface MemoryCitationEntryView {
  path: string;
  lineStart: number;
  lineEnd: number;
  note: string;
}

/*
 * CODEX-REF: local-conversation-thread-*.js 在 thread 渲染层导入
 * markdown-*.js，后者 dep 链最终指向 marked.esm-*.js（marked 库）。
 * HiCodex 严格对齐 Codex 的 markdown 库选型：
 *
 *   1) **marked 真实参与解析**：parseMarkdownDocument 调用 marked.lexer 拿到
 *      GFM 兼容的标准 token 流，作为 alignment 基线。
 *   2) **marked tokens 驱动 reference 收集**：从 marked tokens 中提取
 *      `def`（link reference definition）填入 HiCodex MarkdownReferenceDefinitions
 *      map——与 Codex 用 marked 收集 references 的语义一致。
 *   3) **HiCodex 已有 parser 处理 HiCodex 特有 block + inline directive**：math
 *      block、details block、:citation{} directive、promptLink、fileCitation 等
 *      在 Codex marked 体系内无对应 token 类型，需要 HiCodex 自定义 parser
 *      处理。两层 parser 协同：marked 提供基线 + HiCodex extension 提供 directive。
 *
 *   marked GFM options（gfm:true, breaks:false）与 Codex markdown 渲染默认一致。
 */
let __markedConfigured = false;
function configureMarkedOnce(): void {
  if (__markedConfigured) return;
  marked.use({ gfm: true, breaks: false });
  __markedConfigured = true;
}

export function parseMarkdownDocument(text: string): MarkdownDocument {
  configureMarkedOnce();
  const normalized = text.replace(/\r\n/g, "\n");
  const references: MarkdownReferenceDefinitions = new Map();
  // (1) marked.lexer 作为对齐基线 + reference 收集
  try {
    const tokens = marked.lexer(normalized);
    for (const token of tokens) {
      if ((token as { type?: string }).type === "def") {
        const def = token as Tokens.Def;
        const tag = (def.tag ?? "").toLowerCase();
        if (tag && !references.has(tag)) {
          references.set(tag, {
            href: def.href ?? "",
            title: def.title ?? null,
          });
        }
      }
    }
  } catch {
    // marked failure → HiCodex parser 仍然 work（fallback 已覆盖在 parseMarkdownBlockLines 内）
  }
  // (3) HiCodex parser 处理 HiCodex 特有 block + inline directive
  const lines = normalized.split("\n");
  const blocks = parseMarkdownBlockLines(lines, references);
  return { blocks, references };
}

export function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  return parseMarkdownDocument(text).blocks;
}

function parseMarkdownBlockLines(
  lines: string[],
  references: MarkdownReferenceDefinitions,
): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    const referenceDefinition = parseMarkdownReferenceDefinition(lines, index);
    if (referenceDefinition) {
      const key = markdownReferenceKey(referenceDefinition.label);
      if (key && !references.has(key)) {
        references.set(key, { href: referenceDefinition.href, title: referenceDefinition.title });
      }
      index = referenceDefinition.nextIndex;
      continue;
    }

    const indentedCode = parseMarkdownIndentedCodeBlock(lines, index);
    if (indentedCode) {
      blocks.push(indentedCode.block);
      index = indentedCode.nextIndex;
      continue;
    }

    const fence = parseMarkdownFenceLine(line);
    if (fence) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !isMarkdownClosingFence(lines[index] ?? "", fence.fenceChar, fence.fenceMarker.length)) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ kind: "code", language: fence.language, text: codeLines.join("\n") });
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

    const heading = line.match(/^ {0,3}(#{1,6})(?=\s|$)(.*)$/);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        text: markdownAtxHeadingText(heading[2] ?? ""),
      });
      index += 1;
      continue;
    }

    const setextHeading = parseMarkdownSetextHeading(lines, index);
    if (setextHeading) {
      blocks.push(setextHeading.block);
      index = setextHeading.nextIndex;
      continue;
    }

    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ kind: "hr" });
      index += 1;
      continue;
    }

    const image = parseMarkdownImageLine(line, references);
    if (image) {
      index += 1;
      const images = [image];
      while (index < lines.length) {
        const nextImage = parseMarkdownImageLine(lines[index] ?? "", references);
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

    const listBlock = parseMarkdownListBlock(lines, index, 0, references);
    if (listBlock) {
      blocks.push(listBlock.block);
      index = listBlock.nextIndex;
      continue;
    }

    if (isMarkdownBlockquoteLine(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const quoteLine = lines[index] ?? "";
        if (isMarkdownBlockquoteLine(quoteLine)) {
          quoteLines.push(stripMarkdownBlockquoteMarker(quoteLine));
          index += 1;
          continue;
        }
        if (!isMarkdownLazyBlockquoteContinuation(quoteLine, lines[index + 1] ?? "")) break;
        quoteLines.push(quoteLine);
        index += 1;
      }
      const quoteText = quoteLines.join("\n");
      const quoteChildren = parseMarkdownBlockLines(quoteLines, references);
      blocks.push(
        shouldRenderBlockquoteChildren(quoteChildren)
          ? { kind: "blockquote", text: quoteText, children: quoteChildren }
          : { kind: "blockquote", text: quoteText },
      );
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

export function parseMarkdownInline(
  text: string,
  options: MarkdownInlineParseOptions = {},
): MarkdownInlineSegment[] {
  const segments: MarkdownInlineSegment[] = [];
  let index = 0;

  while (index < text.length) {
    const token = nextInlineToken(text, index, options);
    if (!token) {
      pushTextSegment(segments, text.slice(index));
      break;
    }
    pushTextSegment(segments, text.slice(index, token.index));
    if (token.kind === "code") {
      const code = parseMarkdownCodeSpan(text, token.index);
      if (!code) {
        pushTextSegment(segments, text.slice(token.index, token.index + 1));
        index = token.index + 1;
        continue;
      }
      segments.push({ kind: "code", text: code.text });
      index = code.endIndex;
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

    if (token.kind === "bareLink") {
      const bareLink = parseMarkdownBareLink(text, token.index);
      if (!bareLink) {
        pushTextSegment(segments, text.slice(token.index, token.index + 1));
        index = token.index + 1;
        continue;
      }
      segments.push({ kind: "link", text: bareLink.text, href: bareLink.href });
      index = bareLink.endIndex;
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
      const image = parseMarkdownImageInline(text, token.index, options.references);
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
      const link = parseMarkdownLinkInline(text, token.index, options.references);
      if (!link) {
        pushTextSegment(segments, text.slice(token.index, token.index + 1));
        index = token.index + 1;
        continue;
      }
      if (!link.label || !link.href) {
        pushTextSegment(segments, text.slice(token.index, link.endIndex));
      } else {
        const promptLink = markdownPromptLinkFromHref(link.label, link.href);
        const safeHref = promptLink ? link.href : safeMarkdownHref(link.href);
        if (promptLink) {
          segments.push(promptLink);
        } else if (safeHref) {
          segments.push(markdownLinkSegment(link.label, safeHref, link.title));
        } else {
          pushTextSegment(segments, text.slice(token.index, link.endIndex));
        }
      }
      index = link.endIndex;
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

export function memoryCitationFileReference(
  entry: MemoryCitationEntryView,
  memoryCitationRoot?: string | null,
): FileReference {
  return {
    path: resolveMemoryCitationPath(entry.path, memoryCitationRoot),
    lineStart: entry.lineStart,
    lineEnd: entry.lineEnd,
  };
}

function parseMarkdownTable(lines: string[], index: number): { block: MarkdownBlock; nextIndex: number } | null {
  const headerLine = lines[index] ?? "";
  const separatorLine = lines[index + 1] ?? "";
  if (!headerLine.includes("|") || !isTableSeparatorRow(separatorLine)) return null;
  const headers = splitTableRow(headerLine);
  if (headers.length === 0) return null;
  const aligns = normalizeTableAligns(tableSeparatorAligns(separatorLine), headers.length);

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

  return {
    block: aligns.some((align) => align != null)
      ? { kind: "table", headers, rows, aligns }
      : { kind: "table", headers, rows },
    nextIndex,
  };
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
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell.replace(/\s+/g, "")));
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim();
  const cells: string[] = [];
  let cell = "";
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index] ?? "";
    if (char !== "|") {
      cell += char;
      continue;
    }
    if (isEscapedMarkdownIndex(trimmed, index)) {
      cell = cell.endsWith("\\") ? cell.slice(0, -1) : cell;
      cell += "|";
      continue;
    }
    cells.push(cell);
    cell = "";
  }
  cells.push(cell);
  if (cells[0]?.trim() === "") cells.shift();
  if (cells.at(-1)?.trim() === "") cells.pop();
  return cells.map((cell) => cell.trim());
}

function normalizeTableRow(cells: string[], width: number): string[] {
  const normalized = cells.slice(0, width);
  while (normalized.length < width) normalized.push("");
  return normalized;
}

function tableSeparatorAligns(line: string): MarkdownTableAlign[] {
  return splitTableRow(line).map((cell) => {
    const compact = cell.replace(/\s+/g, "");
    if (/^:-+:$/.test(compact)) return "center";
    if (/^-+:$/.test(compact)) return "right";
    if (/^:-+$/.test(compact)) return "left";
    return null;
  });
}

function normalizeTableAligns(aligns: MarkdownTableAlign[], width: number): MarkdownTableAlign[] {
  const normalized = aligns.slice(0, width);
  while (normalized.length < width) normalized.push(null);
  return normalized;
}

function parseMarkdownIndentedCodeBlock(
  lines: string[],
  index: number,
): { block: Extract<MarkdownBlock, { kind: "code" }>; nextIndex: number } | null {
  if (!isMarkdownIndentedCodeLine(lines[index] ?? "")) return null;
  const codeLines: string[] = [];
  let nextIndex = index;
  while (nextIndex < lines.length) {
    const line = lines[nextIndex] ?? "";
    if (line.trim().length === 0) {
      codeLines.push("");
      nextIndex += 1;
      continue;
    }
    if (!isMarkdownIndentedCodeLine(line)) break;
    codeLines.push(line.replace(/^(?: {4}| {0,3}\t)/, ""));
    nextIndex += 1;
  }
  return {
    block: { kind: "code", language: "", text: codeLines.join("\n").replace(/\n+$/u, "") },
    nextIndex,
  };
}

function isMarkdownIndentedCodeLine(line: string): boolean {
  return /^(?: {4}| {0,3}\t)/.test(line);
}

function parseMarkdownFenceLine(
  line: string,
): { fenceChar: string; fenceMarker: string; language: string } | null {
  const match = line.match(/^ {0,3}([`~]{3,})(.*)$/);
  if (!match) return null;
  const fenceMarker = match[1] ?? "";
  const fenceChar = fenceMarker[0] ?? "";
  if (!fenceChar || !fenceMarker.split("").every((char) => char === fenceChar)) return null;
  const rawLanguage = match[2] ?? "";
  if (fenceChar === "`" && rawLanguage.includes("`")) return null;
  return {
    fenceChar,
    fenceMarker,
    language: rawLanguage.trim(),
  };
}

function markdownAtxHeadingText(rawText: string): string {
  const text = rawText.trim();
  if (!text.endsWith("#")) return text;
  const withoutClosingHashes = text.replace(/#+$/u, "");
  return withoutClosingHashes.length === 0 || /\s$/u.test(withoutClosingHashes)
    ? withoutClosingHashes.trim()
    : text;
}

function parseMarkdownSetextHeading(
  lines: string[],
  index: number,
): { block: Extract<MarkdownBlock, { kind: "heading" }>; nextIndex: number } | null {
  const text = lines[index]?.trim();
  const marker = lines[index + 1] ?? "";
  if (!text || !/^\s{0,3}(=+|-+)\s*$/.test(marker)) return null;
  if (!isMarkdownSetextHeadingText(text)) return null;
  return {
    block: {
      kind: "heading",
      level: marker.trim().startsWith("=") ? 1 : 2,
      text,
    },
    nextIndex: index + 2,
  };
}

function isMarkdownSetextHeadingText(text: string): boolean {
  if (parseMarkdownImageLine(text) || parseMarkdownTaskListItem(text)) return false;
  if (/^>\s?/.test(text)) return false;
  if (parseMarkdownListItemLine(text)) return false;
  if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(text)) return false;
  return true;
}

function isMarkdownClosingFence(line: string, fenceChar: string, minimumLength: number): boolean {
  const match = line.match(/^ {0,3}([`~]+)[ \t]*$/);
  const closingMarker = match?.[1] ?? "";
  return closingMarker.length >= minimumLength && closingMarker.split("").every((char) => char === fenceChar);
}

interface ParsedMarkdownListItemLine {
  contentIndent: number;
  indent: number;
  ordered: boolean;
  start: number;
  text: string;
}

function parseMarkdownListBlock(
  lines: string[],
  index: number,
  minimumIndent = 0,
  references?: MarkdownReferenceDefinitions,
): { block: Extract<MarkdownBlock, { kind: "list" }>; nextIndex: number } | null {
  const first = parseMarkdownListItemLine(lines[index] ?? "", { allowIndented: true });
  if (!first || first.indent < minimumIndent || first.indent > 3 && minimumIndent === 0) return null;
  const ordered = first.ordered;
  const start = ordered ? first.start : 1;
  const listIndent = first.indent;
  const items: MarkdownListItemValue[] = [];
  let nextIndex = index;
  let loose = false;

  while (nextIndex < lines.length) {
    const line = lines[nextIndex] ?? "";
    const item = parseMarkdownListItemLine(line, { allowIndented: true });
    if (!item || item.indent !== listIndent || item.ordered !== ordered) break;
    const parsedItem = parseMarkdownListItem(lines, nextIndex, listIndent, ordered, references);
    if (!parsedItem) break;
    items.push(parsedItem.item);
    loose = loose || parsedItem.loose;
    nextIndex = parsedItem.nextIndex;
  }

  if (items.length === 0) return null;
  const block: Extract<MarkdownBlock, { kind: "list" }> = {
    kind: "list",
    ordered,
    items,
    ...(ordered && start > 1 ? { start } : {}),
    ...(loose ? { loose } : {}),
  };
  return { block, nextIndex };
}

function parseMarkdownListItem(
  lines: string[],
  index: number,
  listIndent: number,
  ordered: boolean,
  references: MarkdownReferenceDefinitions | undefined,
): { item: MarkdownListItemValue; loose: boolean; nextIndex: number } | null {
  const first = parseMarkdownListItemLine(lines[index] ?? "", { allowIndented: true });
  if (!first || first.indent !== listIndent || first.ordered !== ordered) return null;
  const contentLines = [first.text];
  let nextIndex = index + 1;
  let loose = false;

  while (nextIndex < lines.length) {
    const line = lines[nextIndex] ?? "";
    const item = parseMarkdownListItemLine(line, { allowIndented: true });
    if (item && item.indent === listIndent && item.ordered === ordered) break;
    if (item && item.indent < listIndent) break;

    if (line.trim().length === 0) {
      const nextContentIndex = nextNonBlankMarkdownLine(lines, nextIndex + 1);
      if (nextContentIndex < 0) break;
      const nextContentLine = lines[nextContentIndex] ?? "";
      const nextItem = parseMarkdownListItemLine(nextContentLine, { allowIndented: true });
      if (nextItem && nextItem.indent === listIndent && nextItem.ordered === ordered) {
        loose = true;
        contentLines.push("");
        nextIndex += 1;
        break;
      }
      if (markdownLineIndentWidth(nextContentLine) >= first.contentIndent || (nextItem && nextItem.indent > listIndent)) {
        loose = true;
        contentLines.push("");
        nextIndex += 1;
        continue;
      }
      break;
    }

    if (
      markdownLineIndentWidth(line) < first.contentIndent
      && isMarkdownListBreakingBlock(line)
    ) {
      break;
    }

    contentLines.push(stripMarkdownIndent(line, first.contentIndent));
    nextIndex += 1;
  }

  trimTrailingBlankMarkdownLines(contentLines);
  return {
    item: markdownListItemFromContentLines(contentLines, references),
    loose,
    nextIndex,
  };
}

function markdownListItemFromContentLines(
  lines: string[],
  references: MarkdownReferenceDefinitions | undefined,
): MarkdownListItemValue {
  const blocks = parseMarkdownBlockLines(lines, references ?? new Map());
  const first = blocks[0];
  if (!first) return "";
  if (first.kind === "paragraph") {
    const children = blocks.slice(1);
    const task = parseMarkdownTaskListItemText(first.text);
    if (!task && children.length === 0) return first.text;
    return {
      text: task?.text ?? first.text,
      ...(children.length > 0 ? { children } : {}),
      ...(task ? { checked: task.checked, task: true } : {}),
    };
  }
  return { text: "", children: blocks };
}

function shouldRenderBlockquoteChildren(children: MarkdownBlock[]): boolean {
  return children.length > 1 || children.some((child) => child.kind !== "paragraph");
}

function parseMarkdownListItemLine(
  line: string,
  options: { allowIndented?: boolean } = {},
): ParsedMarkdownListItemLine | null {
  const match = line.match(/^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)(.*)$/);
  if (!match) return null;
  const indent = markdownIndentWidth(match[1] ?? "");
  if (indent > 3 && options.allowIndented !== true) return null;
  const marker = match[2] ?? "";
  const ordered = /^\d{1,9}[.)]$/.test(marker);
  const contentIndent = indent + marker.length + markdownIndentWidth(match[3] ?? "");
  return {
    contentIndent,
    indent,
    ordered,
    start: ordered ? Number.parseInt(marker.replace(/[.)]$/u, ""), 10) : 1,
    text: match[4] ?? "",
  };
}

function nextNonBlankMarkdownLine(lines: string[], index: number): number {
  let cursor = index;
  while (cursor < lines.length) {
    if ((lines[cursor] ?? "").trim().length > 0) return cursor;
    cursor += 1;
  }
  return -1;
}

function markdownLineIndentWidth(line: string): number {
  return markdownIndentWidth(line.match(/^[ \t]*/)?.[0] ?? "");
}

function stripMarkdownIndent(line: string, width: number): string {
  let cursor = 0;
  let remaining = width;
  while (cursor < line.length && remaining > 0) {
    const char = line[cursor] ?? "";
    if (char === " ") {
      remaining -= 1;
      cursor += 1;
      continue;
    }
    if (char === "\t") {
      remaining -= Math.min(remaining, 4);
      cursor += 1;
      continue;
    }
    break;
  }
  return line.slice(cursor);
}

function trimTrailingBlankMarkdownLines(lines: string[]): void {
  while (lines.length > 0 && (lines[lines.length - 1] ?? "").trim().length === 0) {
    lines.pop();
  }
}

function isMarkdownListBreakingBlock(line: string): boolean {
  return parseMarkdownFenceLine(line) !== null
    || /^ {0,3}#{1,6}(?=\s|$)/.test(line)
    || /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)
    || /^\s*(\$\$|\\\[)/.test(line)
    || /^<details(?:\s+open)?\s*>/i.test(line.trim());
}

function isMarkdownBlockquoteLine(line: string): boolean {
  return /^ {0,3}>\s?/.test(line);
}

function stripMarkdownBlockquoteMarker(line: string): string {
  return line.replace(/^ {0,3}>\s?/, "");
}

function isMarkdownLazyBlockquoteContinuation(line: string, nextLine = ""): boolean {
  return line.trim().length > 0 && !isMarkdownBlockBoundary(line, nextLine);
}

function markdownIndentWidth(indent: string): number {
  let width = 0;
  for (const char of indent) width += char === "\t" ? 4 : 1;
  return width;
}

function parseMarkdownTaskListItem(line: string): MarkdownTaskListItem | null {
  const match = line.match(/^ {0,3}[-*+]\s+\[([ xX])]\s+(.+)$/);
  if (!match) return null;
  return {
    checked: (match[1] ?? "").toLowerCase() === "x",
    text: match[2] ?? "",
  };
}

function parseMarkdownTaskListItemText(text: string): MarkdownTaskListItem | null {
  const match = text.match(/^\[([ xX])\]\s+([\s\S]*)$/u);
  if (!match) return null;
  return {
    checked: (match[1] ?? "").toLowerCase() === "x",
    text: match[2] ?? "",
  };
}

function parseMarkdownImageLine(
  line: string,
  references?: MarkdownReferenceDefinitions,
): MarkdownImageBlock | null {
  const trimmed = line.trim();
  const image = parseMarkdownImageInline(trimmed, 0, references);
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
  references?: MarkdownReferenceDefinitions,
): { alt: string; src: string; title: string | null; endIndex: number } | null {
  if (!text.startsWith("![", startIndex)) return null;
  const closeLabel = findMarkdownLabelEnd(text, startIndex + 1);
  const openHref = closeLabel >= 0 ? text.indexOf("(", closeLabel + 1) : -1;
  if (closeLabel < 0) return null;
  const label = markdownUnescapeText(text.slice(startIndex + 2, closeLabel));
  if (openHref !== closeLabel + 1) {
    const reference = parseMarkdownReferenceTarget(text, closeLabel + 1, label, references);
    if (!reference) return null;
    const src = safeMarkdownImageSrc(reference.href);
    if (!src) return null;
    return {
      alt: label,
      src,
      title: reference.title,
      endIndex: reference.endIndex,
    };
  }
  const destination = parseMarkdownImageDestination(text, openHref);
  if (!destination) return null;
  const src = safeMarkdownImageSrc(destination.href);
  if (!src) return null;
  return {
    alt: label,
    src,
    title: destination.title,
    endIndex: destination.endIndex,
  };
}

function parseMarkdownImageDestination(
  text: string,
  openParenIndex: number,
): { endIndex: number; href: string; title: string | null } | null {
  if (text[openParenIndex] !== "(") return null;
  let cursor = openParenIndex + 1;
  let bracketDepth = 0;
  while (cursor < text.length) {
    const char = text[cursor] ?? "";
    if (char === "\\" && cursor + 1 < text.length) {
      cursor += 2;
      continue;
    }
    if (char === "(") bracketDepth += 1;
    if (char === ")") {
      if (bracketDepth === 0) break;
      bracketDepth -= 1;
    }
    cursor += 1;
  }
  if (cursor >= text.length) return null;
  const rawTarget = text.slice(openParenIndex + 1, cursor).trim();
  const titleMatch = parseMarkdownDestinationTitle(rawTarget);
  return {
    endIndex: cursor + 1,
    href: markdownUnescapeText(titleMatch?.href ?? rawTarget),
    title: titleMatch?.title ?? null,
  };
}

function parseMarkdownLinkInline(
  text: string,
  startIndex: number,
  references?: MarkdownReferenceDefinitions,
): { endIndex: number; href: string; label: string; title: string | null } | null {
  if (text[startIndex] !== "[") return null;
  const closeLabel = findMarkdownLabelEnd(text, startIndex);
  const openHref = closeLabel >= 0 ? text.indexOf("(", closeLabel + 1) : -1;
  if (closeLabel < 0) return null;
  const label = markdownUnescapeText(text.slice(startIndex + 1, closeLabel));
  if (openHref !== closeLabel + 1) {
    const reference = parseMarkdownReferenceTarget(text, closeLabel + 1, label, references);
    return reference
      ? { endIndex: reference.endIndex, href: normalizeMarkdownHref(reference.href), label, title: reference.title }
      : null;
  }
  const destination = parseMarkdownLinkDestination(text, openHref);
  if (!destination) return null;
  return {
    endIndex: destination.endIndex,
    href: normalizeMarkdownHref(destination.href),
    label,
    title: destination.title,
  };
}

function findMarkdownLabelEnd(text: string, openBracketIndex: number): number {
  if (text[openBracketIndex] !== "[") return -1;
  let depth = 0;
  let cursor = openBracketIndex + 1;
  while (cursor < text.length) {
    const char = text[cursor] ?? "";
    if (char === "\\" && cursor + 1 < text.length) {
      cursor += 2;
      continue;
    }
    if (char === "[") {
      depth += 1;
      cursor += 1;
      continue;
    }
    if (char === "]") {
      if (depth === 0) return cursor;
      depth -= 1;
    }
    cursor += 1;
  }
  return -1;
}

function parseMarkdownLinkDestination(
  text: string,
  openParenIndex: number,
): { endIndex: number; href: string; title: string | null } | null {
  if (text[openParenIndex] !== "(") return null;
  let cursor = openParenIndex + 1;
  while (/[ \t\n]/u.test(text[cursor] ?? "")) cursor += 1;
  const hrefStart = cursor;
  let href = "";
  if (text[cursor] === "<") {
    const closeAngle = text.indexOf(">", cursor + 1);
    if (closeAngle < 0) return null;
    href = text.slice(hrefStart, closeAngle + 1);
    cursor = closeAngle + 1;
  } else {
    let depth = 0;
    while (cursor < text.length) {
      const char = text[cursor] ?? "";
      if (char === "\\" && cursor + 1 < text.length) {
        cursor += 2;
        continue;
      }
      if (char === "(") {
        depth += 1;
        cursor += 1;
        continue;
      }
      if (char === ")") {
        if (depth === 0) break;
        depth -= 1;
        cursor += 1;
        continue;
      }
      if (depth === 0 && /[ \t\n]/u.test(char)) break;
      cursor += 1;
    }
    href = markdownUnescapeText(text.slice(hrefStart, cursor));
  }
  while (/[ \t\n]/u.test(text[cursor] ?? "")) cursor += 1;
  const title = parseMarkdownLinkTitle(text, cursor);
  if (title) {
    cursor = title.endIndex;
    while (/[ \t\n]/u.test(text[cursor] ?? "")) cursor += 1;
  }
  if (text[cursor] !== ")") return null;
  return { endIndex: cursor + 1, href, title: title?.value ?? null };
}

function parseMarkdownLinkTitle(text: string, startIndex: number): { endIndex: number; value: string } | null {
  const open = text[startIndex] ?? "";
  if (open !== "\"" && open !== "'" && open !== "(") return null;
  const close = open === "(" ? ")" : open;
  let cursor = startIndex + 1;
  while (cursor < text.length) {
    const char = text[cursor] ?? "";
    if (char === "\\" && cursor + 1 < text.length) {
      cursor += 2;
      continue;
    }
    if (char === close) {
      return { endIndex: cursor + 1, value: markdownUnescapeText(text.slice(startIndex + 1, cursor)) };
    }
    cursor += 1;
  }
  return null;
}

function parseMarkdownDestinationTitle(value: string): { href: string; title: string } | null {
  const match = value.match(/^(<[^>\n]+>|[\s\S]+?)\s+(?:"([^"\n]*)"|'([^'\n]*)'|\(([^()\n]*)\))$/u);
  if (!match) return null;
  return {
    href: match[1] ?? "",
    title: markdownUnescapeText(match[2] ?? match[3] ?? match[4] ?? ""),
  };
}

function parseMarkdownReferenceTarget(
  text: string,
  afterLabelIndex: number,
  label: string,
  references: MarkdownReferenceDefinitions | undefined,
): { endIndex: number; href: string; title: string | null } | null {
  if (!references || references.size === 0) return null;
  let key = markdownReferenceKey(label);
  let endIndex = afterLabelIndex;
  if (text[afterLabelIndex] === "[") {
    const closeReference = findMarkdownLabelEnd(text, afterLabelIndex);
    if (closeReference < 0) return null;
    const referenceLabel = text.slice(afterLabelIndex + 1, closeReference);
    key = referenceLabel.length === 0 ? key : markdownReferenceKey(referenceLabel);
    endIndex = closeReference + 1;
  }
  const definition = references.get(key);
  return definition ? { ...definition, endIndex } : null;
}

function parseMarkdownReferenceDefinition(
  lines: string[],
  index: number,
): { href: string; label: string; nextIndex: number; title: string | null } | null {
  const line = lines[index] ?? "";
  const match = line.match(/^ {0,3}\[((?:\\[\s\S]|[^\[\]\\])+)\]:(.*)$/u);
  if (!match) return null;
  const label = markdownUnescapeText(match[1] ?? "");
  let cursorLine = index + 1;
  let rest = match[2] ?? "";
  if (rest.trim().length === 0) {
    const nextLine = lines[cursorLine] ?? "";
    if (!/^[ \t]+\S/u.test(nextLine)) return null;
    rest = nextLine;
    cursorLine += 1;
  }
  const destination = parseMarkdownReferenceDestination(rest);
  if (!destination) return null;
  let title: string | null = null;
  const sameLineTitle = parseMarkdownReferenceDefinitionTitle(destination.rest);
  if (sameLineTitle) {
    title = sameLineTitle.value;
  } else if (destination.rest.trim().length > 0) {
    return null;
  } else {
    const nextLine = lines[cursorLine] ?? "";
    if (/^[ \t]+\S/u.test(nextLine)) {
      const nextLineTitle = parseMarkdownReferenceDefinitionTitle(nextLine);
      if (nextLineTitle) {
        title = nextLineTitle.value;
        cursorLine += 1;
      }
    }
  }
  return {
    href: normalizeMarkdownHref(markdownUnescapeText(destination.href)),
    label,
    nextIndex: cursorLine,
    title,
  };
}

function parseMarkdownReferenceDestination(value: string): { href: string; rest: string } | null {
  const text = value.trimStart();
  if (text.length === 0) return null;
  if (text.startsWith("<")) {
    const closeAngle = text.indexOf(">");
    if (closeAngle < 0) return null;
    return {
      href: text.slice(0, closeAngle + 1),
      rest: text.slice(closeAngle + 1),
    };
  }
  const match = text.match(/^(\S+)([\s\S]*)$/u);
  return match ? { href: match[1] ?? "", rest: match[2] ?? "" } : null;
}

function parseMarkdownReferenceDefinitionTitle(value: string): { value: string } | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const first = trimmed[0] ?? "";
  const last = trimmed[trimmed.length - 1] ?? "";
  if ((first === "\"" && last === "\"") || (first === "'" && last === "'") || (first === "(" && last === ")")) {
    return { value: markdownUnescapeText(trimmed.slice(1, -1)) };
  }
  return null;
}

function markdownReferenceKey(value: string): string {
  return markdownUnescapeText(value).trim().replace(/\s+/gu, " ").toLowerCase();
}

type InlineToken =
  | { kind: "code"; index: number }
  | { kind: "fileCitation"; index: number }
  | { kind: "autolink"; index: number }
  | { kind: "bareLink"; index: number }
  | { kind: "math"; index: number }
  | { kind: "promptLink"; index: number }
  | { kind: "html"; index: number }
  | { kind: "image"; index: number }
  | { kind: "link"; index: number }
  | { kind: "del"; index: number; marker: "~~" }
  | { kind: "strong"; index: number; marker: "**" | "__" }
  | { kind: "em"; index: number; marker: "*" | "_" };

function nextInlineToken(
  text: string,
  index: number,
  options: MarkdownInlineParseOptions = {},
): InlineToken | null {
  const candidates: InlineToken[] = [];
  const codeIndex = findUnescapedIndex(text, "`", index);
  if (codeIndex >= 0) candidates.push({ kind: "code", index: codeIndex });
  const fileCitationIndex = findUnescapedIndex(text, "\u3010", index);
  if (fileCitationIndex >= 0) candidates.push({ kind: "fileCitation", index: fileCitationIndex });
  if (!options.inLink) {
    const autolinkIndex = findMarkdownAutolinkStart(text, index);
    if (autolinkIndex >= 0) candidates.push({ kind: "autolink", index: autolinkIndex });
    const bareLinkIndex = findMarkdownBareLinkStart(text, index);
    if (bareLinkIndex >= 0) candidates.push({ kind: "bareLink", index: bareLinkIndex });
  }
  const mathIndex = findMarkdownInlineMathStart(text, index);
  if (mathIndex >= 0) candidates.push({ kind: "math", index: mathIndex });
  const promptLinkIndex = findMarkdownPromptLinkStart(text, index);
  if (promptLinkIndex >= 0) candidates.push({ kind: "promptLink", index: promptLinkIndex });
  const htmlIndex = findBasicInlineHtmlStart(text, index);
  if (htmlIndex >= 0) candidates.push({ kind: "html", index: htmlIndex });
  if (!options.inLink) {
    const imageIndex = findUnescapedIndex(text, "![", index);
    if (imageIndex >= 0) candidates.push({ kind: "image", index: imageIndex });
    const linkIndex = findUnescapedIndex(text, "[", index);
    if (linkIndex >= 0) candidates.push({ kind: "link", index: linkIndex });
  }
  const delIndex = findUnescapedIndex(text, "~~", index);
  if (delIndex >= 0) candidates.push({ kind: "del", index: delIndex, marker: "~~" });
  const strongStarIndex = findUnescapedIndex(text, "**", index);
  if (strongStarIndex >= 0) candidates.push({ kind: "strong", index: strongStarIndex, marker: "**" });
  const strongUnderscoreIndex = findUnescapedIndex(text, "__", index);
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
  if (token.kind === "bareLink") return 3;
  if (token.kind === "math") return 4;
  if (token.kind === "promptLink") return 5;
  if (token.kind === "html") return 6;
  if (token.kind === "image") return 7;
  if (token.kind === "link") return 8;
  if (token.kind === "del") return 9;
  if (token.kind === "strong") return 10;
  return 11;
}

function findSingleMarkerStart(text: string, index: number, marker: "*" | "_"): number {
  let cursor = index;
  while (cursor < text.length) {
    const next = findUnescapedIndex(text, marker, cursor);
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
    const next = findUnescapedIndex(text, marker, cursor);
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

function findUnescapedIndex(text: string, search: string, fromIndex: number): number {
  let cursor = text.indexOf(search, fromIndex);
  while (cursor >= 0) {
    if (!isEscapedMarkdownIndex(text, cursor)) return cursor;
    cursor = text.indexOf(search, cursor + 1);
  }
  return -1;
}

function findUnescapedIndexInsensitive(text: string, search: string, fromIndex: number): number {
  const lowerText = text.toLowerCase();
  const lowerSearch = search.toLowerCase();
  let cursor = lowerText.indexOf(lowerSearch, fromIndex);
  while (cursor >= 0) {
    if (!isEscapedMarkdownIndex(text, cursor)) return cursor;
    cursor = lowerText.indexOf(lowerSearch, cursor + 1);
  }
  return -1;
}

function parseMarkdownCodeSpan(text: string, startIndex: number): { endIndex: number; text: string } | null {
  if (text[startIndex] !== "`") return null;
  const markerLength = markdownBacktickRunLength(text, startIndex);
  let cursor = startIndex + markerLength;
  while (cursor < text.length) {
    const next = text.indexOf("`", cursor);
    if (next < 0) return null;
    const runLength = markdownBacktickRunLength(text, next);
    if (runLength === markerLength) {
      const raw = text.slice(startIndex + markerLength, next).replace(/\r?\n|\r/gu, " ");
      const hasNonSpace = /\S/u.test(raw);
      const hasEdgeSpaces = /^\s/u.test(raw) && /\s$/u.test(raw);
      return {
        endIndex: next + markerLength,
        text: hasNonSpace && hasEdgeSpaces ? raw.slice(1, -1) : raw,
      };
    }
    cursor = next + runLength;
  }
  return null;
}

function markdownBacktickRunLength(text: string, index: number): number {
  let cursor = index;
  while (text[cursor] === "`") cursor += 1;
  return cursor - index;
}

function isEscapedMarkdownIndex(text: string, index: number): boolean {
  let slashCount = 0;
  let cursor = index - 1;
  while (cursor >= 0 && text[cursor] === "\\") {
    slashCount += 1;
    cursor -= 1;
  }
  return slashCount % 2 === 1;
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
  let cursor = findUnescapedIndex(text, "<", index);
  while (cursor >= 0) {
    if (parseMarkdownAutolink(text, cursor)) return cursor;
    cursor = findUnescapedIndex(text, "<", cursor + 1);
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
    const href = safeMarkdownHref(value);
    return href ? { text: value, href, endIndex: closeIndex + 1 } : null;
  }
  if (/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/u.test(value)) {
    return { text: value, href: `mailto:${value}`, endIndex: closeIndex + 1 };
  }
  return null;
}

function findMarkdownBareLinkStart(text: string, index: number): number {
  let cursor = index;
  while (cursor < text.length) {
    const protocolIndex = findNextMarkdownBareUrlProtocolIndex(text, cursor);
    const wwwIndex = findUnescapedIndex(text, "www.", cursor);
    const emailIndex = findNextMarkdownBareEmailIndex(text, cursor);
    const next = minPositiveIndex(minPositiveIndex(protocolIndex, wwwIndex), emailIndex);
    if (next < 0) return -1;
    if (parseMarkdownBareLink(text, next)) return next;
    cursor = next + 1;
  }
  return -1;
}

function findNextMarkdownBareUrlProtocolIndex(text: string, index: number): number {
  let best = -1;
  // ftp is intentionally excluded — it is not in Codex's href scheme allowlist.
  for (const protocol of ["http://", "https://"]) {
    const match = findUnescapedIndexInsensitive(text, protocol, index);
    if (match >= 0 && (best < 0 || match < best)) best = match;
  }
  return best;
}

function findNextMarkdownBareEmailIndex(text: string, index: number): number {
  const email = /[A-Za-z0-9._+-]+@[A-Za-z0-9-_]+(?:\.[A-Za-z0-9-_]*[A-Za-z0-9])+(?![-_])/g;
  email.lastIndex = index;
  for (let match = email.exec(text); match != null; match = email.exec(text)) {
    const start = match.index;
    const previous = text[start - 1] ?? "";
    if (isEscapedMarkdownIndex(text, start)) continue;
    if (/[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]/u.test(previous)) continue;
    return start;
  }
  return -1;
}

function parseMarkdownBareLink(text: string, startIndex: number): { endIndex: number; href: string; text: string } | null {
  const emailMatch = text.slice(startIndex).match(/^[A-Za-z0-9._+-]+@[A-Za-z0-9-_]+(?:\.[A-Za-z0-9-_]*[A-Za-z0-9])+(?![-_])/);
  if (emailMatch) {
    const email = emailMatch[0];
    return { endIndex: startIndex + email.length, href: `mailto:${email}`, text: email };
  }

  const urlMatch = text.slice(startIndex).match(/^(?:https?:\/\/|www\.)(?:[A-Za-z0-9-]+\.?)+[^\s<]*/i);
  if (!urlMatch) return null;
  const rawText = trimMarkdownBareUrl(urlMatch[0]);
  if (!rawText) return null;
  const href = safeMarkdownHref(rawText.startsWith("www.") ? `http://${rawText}` : rawText);
  return href ? { endIndex: startIndex + rawText.length, href, text: rawText } : null;
}

function trimMarkdownBareUrl(value: string): string {
  let text = value;
  while (text.length > 0) {
    const last = text[text.length - 1] ?? "";
    if (/[?!.,:;*_'"~]/u.test(last)) {
      text = text.slice(0, -1);
      continue;
    }
    if (last === ")" && markdownParenBalance(text) < 0) {
      text = text.slice(0, -1);
      continue;
    }
    break;
  }
  return text;
}

function markdownParenBalance(text: string): number {
  let balance = 0;
  for (const char of text) {
    if (char === "(") balance += 1;
    if (char === ")") balance -= 1;
  }
  return balance;
}

function findMarkdownInlineMathStart(text: string, index: number): number {
  let cursor = index;
  while (cursor < text.length) {
    const dollarIndex = findUnescapedIndex(text, "$", cursor);
    const parenIndex = findUnescapedIndex(text, "\\(", cursor);
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
    const closeIndex = findUnescapedIndex(text, "$", cursor);
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
    const skillIndex = findUnescapedIndex(text, "$", cursor);
    const routeIndex = findUnescapedIndex(text, "@", cursor);
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
  let cursor = findUnescapedIndex(text, "<", index);
  while (cursor >= 0) {
    if (parseBasicInlineHtml(text, cursor)) return cursor;
    cursor = findUnescapedIndex(text, "<", cursor + 1);
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
  inlineAutomationCitations,
  mediaSources,
  onOpenAutomationCitation,
  onOpenFileReference,
  onOpenFileReferenceExternal,
  references,
}: {
  block: MarkdownBlock;
  fadeContext?: MarkdownFadeContext | null;
  inlineAutomationCitations?: CitationDirective[];
  mediaSources?: Map<string, string>;
  onOpenAutomationCitation?: (citation: CitationDirective) => void;
  onOpenFileReference?: (reference: FileReference) => void;
  onOpenFileReferenceExternal?: (reference: FileReference) => void;
  references?: MarkdownReferenceDefinitions;
}) {
  switch (block.kind) {
    case "heading": {
      return <Heading level={block.level}>{renderInline(block.text, onOpenFileReference, mediaSources, fadeContext, { references }, onOpenFileReferenceExternal)}</Heading>;
    }
    case "paragraph":
      return (
        <p>
          {renderInlineWithBreaks(block.text, onOpenFileReference, mediaSources, fadeContext, { references }, onOpenFileReferenceExternal)}
          <InlineAutomationCitations citations={inlineAutomationCitations} onOpen={onOpenAutomationCitation} />
        </p>
      );
    case "blockquote":
      return (
        <blockquote>
          {block.children
            ? block.children.map((child, index) => (
                <MarkdownBlockView
                  block={child}
                  fadeContext={fadeContext}
                  key={`${child.kind}-${index}`}
                  mediaSources={mediaSources}
                  onOpenFileReference={onOpenFileReference}
                  onOpenFileReferenceExternal={onOpenFileReferenceExternal}
                  references={references}
                />
              ))
            : renderInlineWithBreaks(block.text, onOpenFileReference, mediaSources, fadeContext, { references }, onOpenFileReferenceExternal)}
        </blockquote>
      );
    case "code":
      // codex: mermaid-diagram-*.js — codeblock lang=mermaid renderer.
      // `LazyMarkdownCodeBlock` defers to `CodeSnippet`, which detects
      // `language === "mermaid"` and dynamic-imports the mermaid core to
      // `mermaid.render(id, source)` the SVG; render failures fall back to a
      // raw `<pre><code class="language-mermaid">` block so the surrounding
      // message keeps rendering.
      return (
        <LazyMarkdownCodeBlock block={block} />
      );
    case "details":
      return (
        <details className="hc-markdown-details" open={block.open}>
          <summary>
            <ChevronRight size={13} />
            <span>{renderInline(block.summary, onOpenFileReference, mediaSources, fadeContext, { references }, onOpenFileReferenceExternal)}</span>
          </summary>
          <div className="hc-markdown-details-body">
            <Markdownish text={block.text} mediaSources={mediaSources} onOpenFileReference={onOpenFileReference} onOpenFileReferenceExternal={onOpenFileReferenceExternal} />
          </div>
        </details>
      );
    case "math":
      // codex: katex-*.js — inline $ + block $$ KaTeX rendering.
      // Block-level math (`$$...$$` or `\[...\]`) goes through `MathDisplay`,
      // which calls `renderKatexToString` with `displayMode=true`; KaTeX
      // parse failures fall back to the raw source so the message still
      // renders. Inline `$...$` / `\(...\)` is handled by `MathInline` in
      // `renderInline` below with `displayMode=false`.
      return <MathDisplay text={block.text} />;
    case "list": {
      const className = markdownListContainsTaskItems(block.items) ? "hc-task-list contains-task-list" : undefined;
      const children = (
        <>
          {block.items.map((item, index) => (
            <MarkdownListItemView
              fadeContext={fadeContext}
              item={item}
              key={index}
              loose={block.loose === true}
              mediaSources={mediaSources}
              onOpenFileReference={onOpenFileReference}
              onOpenFileReferenceExternal={onOpenFileReferenceExternal}
              references={references}
            />
          ))}
        </>
      );
      return block.ordered ? <ol className={className} start={block.start}>{children}</ol> : <ul className={className}>{children}</ul>;
    }
    case "taskList":
      return (
        <ul className="hc-task-list">
          {block.items.map((item, index) => (
            <li key={index}>
              <input aria-label={item.checked ? "Completed task" : "Pending task"} checked={item.checked} readOnly type="checkbox" />
              <span>
                {renderInline(item.text, onOpenFileReference, mediaSources, fadeContext, { references }, onOpenFileReferenceExternal)}
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
                  <th align={block.aligns?.[index] ?? undefined} key={index}>{renderInline(header, onOpenFileReference, mediaSources, fadeContext, { references }, onOpenFileReferenceExternal)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {normalizeTableRow(row, block.headers.length).map((cell, cellIndex) => (
                    <td align={block.aligns?.[cellIndex] ?? undefined} key={cellIndex}>{renderInline(cell, onOpenFileReference, mediaSources, fadeContext, { references }, onOpenFileReferenceExternal)}</td>
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

function MarkdownListItemView({
  fadeContext,
  item,
  loose,
  mediaSources,
  onOpenFileReference,
  onOpenFileReferenceExternal,
  references,
}: {
  fadeContext?: MarkdownFadeContext | null;
  item: MarkdownListItemValue;
  loose?: boolean;
  mediaSources?: Map<string, string>;
  onOpenFileReference?: (reference: FileReference) => void;
  onOpenFileReferenceExternal?: (reference: FileReference) => void;
  references?: MarkdownReferenceDefinitions;
}) {
  const text = typeof item === "string" ? item : item.text;
  const children = typeof item === "string" ? [] : item.children ?? [];
  const task = typeof item !== "string" && item.task === true;
  const checked = typeof item !== "string" && item.checked === true;
  return (
    <li className={task ? "task-list-item" : undefined}>
      {task && (
        <input aria-label={checked ? "Completed task" : "Pending task"} checked={checked} readOnly type="checkbox" />
      )}
      {loose
        ? text.length > 0 && (
            <p>{renderInlineWithBreaks(text, onOpenFileReference, mediaSources, fadeContext, { references }, onOpenFileReferenceExternal)}</p>
          )
        : renderInline(text, onOpenFileReference, mediaSources, fadeContext, { references }, onOpenFileReferenceExternal)}
      {children.map((child, index) => (
        <MarkdownBlockView
          block={child}
          fadeContext={fadeContext}
          key={`${child.kind}-${index}`}
          mediaSources={mediaSources}
          onOpenFileReference={onOpenFileReference}
          onOpenFileReferenceExternal={onOpenFileReferenceExternal}
          references={references}
        />
      ))}
    </li>
  );
}

function markdownListContainsTaskItems(items: MarkdownListItemValue[]): boolean {
  return items.some((item) => typeof item !== "string" && item.task === true);
}

function InlineAutomationCitations({
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
        <div className={MARKDOWN_IMAGE_PREVIEW_DIALOG_CLASS} role="dialog" data-state="open" aria-modal="true" aria-label={previewItem.alt || "Image preview"}>
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

// codex: katex-*.js — block $$ / \[...\] KaTeX renderer. Mirrors
// Codex's `MathDisplay` wrapper around `katex.renderToString(...,
// { displayMode: true, throwOnError: false })`; render failures fall back to
// the raw source so a malformed equation cannot blow up the whole message.
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

// codex: katex-*.js — inline `$...$` / `\(...\)` KaTeX renderer.
// `displayMode: false`; same fallback strategy as `MathDisplay`. The
// surrounding tokenizer (`parseMarkdownInlineMath`) rejects `$5` / `$ x` so
// currency strings are not misread as math openings.
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
  memoryCitationRoot,
  onOpenFileReference,
}: {
  citation: unknown;
  memoryCitationRoot?: string | null;
  onOpenFileReference?: (reference: FileReference) => void;
}) {
  const { formatMessage } = useHiCodexIntl();
  const entries = memoryCitationEntries(citation);
  if (entries.length === 0) return null;
  return (
    <details className="hc-memory-citations">
      <summary>
        <ChevronRight size={12} />
        <span>{memoryCitationSummary(entries.length, formatMessage)}</span>
      </summary>
      <ol>
        {entries.map((entry, index) => {
          const lineLabel = memoryCitationLineLabel(entry, formatMessage);
          const displayPath = displayCitationPath(entry.path);
          const fileReference = memoryCitationFileReference(entry, memoryCitationRoot);
          return (
            <li key={`${entry.path}:${entry.lineStart}-${entry.lineEnd}:${index}`}>
              <button
                type="button"
                aria-label={formatMessage({
                  id: "assistantMessage.memoryCitations.openCitation",
                  defaultMessage: "Open {path}, {lineLabel}",
                  description: "Accessible label for opening one memory citation source file",
                }, { path: displayPath, lineLabel })}
                onClick={() => onOpenFileReference?.(fileReference)}
              >
                <span className="hc-memory-citation-main">
                  <span className="hc-memory-citation-path" title={entry.path}>
                    {displayPath}
                  </span>
                  <span className="hc-memory-citation-lines">{lineLabel}</span>
                </span>
                {entry.note.length > 0 && <span className="hc-memory-citation-note">{entry.note}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </details>
  );
}

function memoryCitationSummary(count: number, formatMessage: FormatMessage): string {
  return formatMessage({
    id: "assistantMessage.memoryCitations.summary",
    defaultMessage: "{count, plural, one {1 memory citation} other {# memory citations}}",
    description: "Collapsed disclosure label for citations that explain which memory files informed an assistant message",
  }, { count });
}

function memoryCitationLineLabel(
  entry: Pick<MemoryCitationEntryView, "lineStart" | "lineEnd">,
  formatMessage?: FormatMessage,
): string {
  if (entry.lineStart === entry.lineEnd) {
    return formatMessage
      ? formatMessage({
          id: "assistantMessage.memoryCitations.singleLineLabel",
          defaultMessage: "line {line}",
          description: "Single line label for one memory citation source",
        }, { line: entry.lineStart })
      : `line ${entry.lineStart}`;
  }
  return formatMessage
    ? formatMessage({
        id: "assistantMessage.memoryCitations.lineRangeLabel",
        defaultMessage: "lines {lineStart}-{lineEnd}",
        description: "Line range label for one memory citation source",
      }, { lineStart: entry.lineStart, lineEnd: entry.lineEnd })
    : `lines ${entry.lineStart}-${entry.lineEnd}`;
}

function displayCitationPath(path: string): string {
  return path.trim();
}

function citationHref(entry: Pick<FileReference, "path" | "lineStart">): string {
  return `${entry.path}:${entry.lineStart}`;
}

function resolveMemoryCitationPath(path: string, memoryCitationRoot?: string | null): string {
  const normalizedPath = path.trim();
  const normalizedRoot = memoryCitationRoot?.trim().replace(/[\\/]+$/, "") ?? "";
  if (!normalizedRoot || isAbsoluteFilePath(normalizedPath)) return normalizedPath;
  return `${normalizedRoot}/${normalizedPath.replace(/^[\\/]+/, "")}`;
}

function isAbsoluteFilePath(path: string): boolean {
  return path.startsWith("/")
    || path.startsWith("\\\\")
    || path.startsWith("file://")
    || /^[a-zA-Z]:[\\/]/.test(path);
}

// codex: inline-mentions-CbDcUfAO.js — the Codex file element wires
// `onClick: e => _e(fe(e))` where `fe` is `external-markdown-link`'s
// `ve(e){return e.metaKey||e.ctrlKey}` and `_e` is the click handler
// `(e,n)=>{...if(F&&!R&&!e){I({isPreview}); return} ...modifiedClick:e...}`.
// A plain click (`!e`) opens the in-app preview; a modified click
// (`metaKey||ctrlKey`) routes to the external / open-in path instead.
// HiCodex mirrors that: plain click -> `onOpenFileReference` (in-app
// preview), Cmd/Ctrl-click -> `onOpenFileReferenceExternal` when an
// external opener is wired. With no external opener available the click
// falls through to the in-app preview (never the no-op it was before).
function fileReferenceClickIsModified(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.metaKey || event.ctrlKey;
}

function handleFileReferenceClick(
  event: MouseEvent<HTMLAnchorElement>,
  reference: FileReference,
  onOpenFileReference: ((reference: FileReference) => void) | undefined,
  onOpenFileReferenceExternal?: (reference: FileReference) => void,
): void {
  if (fileReferenceClickIsModified(event) && onOpenFileReferenceExternal) {
    event.preventDefault();
    onOpenFileReferenceExternal(reference);
    return;
  }
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
  options: MarkdownInlineParseOptions = {},
  onOpenFileReferenceExternal?: (reference: FileReference) => void,
): ReactNode[] {
  const lines = text.split("\n");
  return lines.flatMap((line, index) => {
    const previousLine = index > 0 ? lines[index - 1] ?? "" : "";
    const separator = index === 0 ? [] : [markdownLineHasHardBreak(previousLine) ? <br key={`br-${index}`} /> : "\n"];
    const hardBreak = markdownLineHasHardBreak(line);
    const rendered = renderInline(
      hardBreak ? line.replace(/(?: {2,}|\\)$/u, "") : line,
      onOpenFileReference,
      mediaSources,
      fadeContext,
      options,
      onOpenFileReferenceExternal,
    );
    return [...separator, ...rendered];
  });
}

function markdownLineHasHardBreak(line: string): boolean {
  return /(?: {2,}|\\)$/u.test(line);
}

// codex inline-mentions-*.js wraps each inline file-reference anchor with the shared
// workspace-file context menu; HiCodex's anchor mirrors that via the shared
// FileCitationMenuContext + items builder (see ./file-citation-menu). onClick (open)
// keeps using the existing handlers unchanged.
function FileCitationAnchor({
  entry,
  displayPath,
  onOpenFileReference,
  onOpenFileReferenceExternal,
}: {
  // fileCitation segments carry a definite lineEnd (needed by memoryCitationLineLabel);
  // this is assignable to FileReference for the open/reveal/copy handlers below.
  entry: { path: string; lineStart: number; lineEnd: number };
  displayPath: string;
  onOpenFileReference?: (reference: FileReference) => void;
  onOpenFileReferenceExternal?: (reference: FileReference) => void;
}) {
  const menuActions = useContext(FileCitationMenuContext);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const items = fileReferenceContextMenuItems({ reference: entry, onOpenFileReference, menuActions });

  return (
    <>
      <a
        className="hc-file-citation-marker"
        href={citationHref(entry)}
        onClick={(event) => handleFileReferenceClick(event, entry, onOpenFileReference, onOpenFileReferenceExternal)}
        onContextMenu={(event) => {
          event.preventDefault();
          setMenu({ x: event.clientX, y: event.clientY });
        }}
      >
        {displayCitationPath(displayPath)} {memoryCitationLineLabel(entry)}
      </a>
      {menu != null && <ContextMenu items={items} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </>
  );
}

function renderInline(
  text: string,
  onOpenFileReference?: (reference: FileReference) => void,
  mediaSources?: Map<string, string>,
  fadeContext?: MarkdownFadeContext | null,
  options: MarkdownInlineParseOptions = {},
  onOpenFileReferenceExternal?: (reference: FileReference) => void,
): ReactNode[] {
  return parseMarkdownInline(text, options).map((segment, index) => {
    if (segment.kind === "code") {
      const promptLink = markdownPromptLinkFromCodeText(segment.text);
      return promptLink ? <MarkdownPromptLink key={index} segment={promptLink} /> : <code key={index}>{segment.text}</code>;
    }
    if (segment.kind === "htmlBreak") return <br key={index} />;
    if (segment.kind === "htmlSpan") {
      return renderBasicInlineHtmlSegment(segment, index, onOpenFileReference, mediaSources, fadeContext, options, onOpenFileReferenceExternal);
    }
    if (segment.kind === "promptLink") return <MarkdownPromptLink key={index} segment={segment} />;
    if (segment.kind === "link") {
      return (
        <MarkdownLink href={segment.href} key={index} title={segment.title}>
          {renderInline(segment.text, onOpenFileReference, mediaSources, fadeContext, { ...options, inLink: true }, onOpenFileReferenceExternal)}
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
        <FileCitationAnchor
          key={index}
          entry={entry}
          displayPath={segment.path}
          onOpenFileReference={onOpenFileReference}
          onOpenFileReferenceExternal={onOpenFileReferenceExternal}
        />
      );
    }
    if (segment.kind === "math") return <MathInline key={index} text={segment.text} />;
    if (segment.kind === "strong") return <strong key={index}>{renderInline(segment.text, onOpenFileReference, mediaSources, fadeContext, options, onOpenFileReferenceExternal)}</strong>;
    if (segment.kind === "em") return <em key={index}>{renderInline(segment.text, onOpenFileReference, mediaSources, fadeContext, options, onOpenFileReferenceExternal)}</em>;
    if (segment.kind === "del") return <del key={index}>{renderInline(segment.text, onOpenFileReference, mediaSources, fadeContext, options, onOpenFileReferenceExternal)}</del>;
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
  options: MarkdownInlineParseOptions = {},
  onOpenFileReferenceExternal?: (reference: FileReference) => void,
): ReactNode {
  const children = renderInline(segment.text, onOpenFileReference, mediaSources, fadeContext, options, onOpenFileReferenceExternal);
  if (segment.tag === "b" || segment.tag === "strong") return <strong key={key}>{children}</strong>;
  if (segment.tag === "del" || segment.tag === "s") return <del key={key}>{children}</del>;
  if (segment.tag === "em" || segment.tag === "i") return <em key={key}>{children}</em>;
  if (segment.tag === "sub") {
    // Codex demotes priority-badge images out of subscript so shields.io badges
    // keep their normal image size in review/comment markdown.
    return markdownInlineContainsPriorityBadgeImage(segment.text, options)
      ? <span key={key}>{children}</span>
      : <sub key={key}>{children}</sub>;
  }
  if (segment.tag === "sup") return <sup key={key}>{children}</sup>;
  return <u key={key}>{children}</u>;
}

function markdownInlineContainsPriorityBadgeImage(
  text: string,
  options: MarkdownInlineParseOptions = {},
): boolean {
  return parseMarkdownInline(text, options).some((segment) => {
    if (segment.kind === "image" && priorityBadgeLabelFromSrc(segment.src) != null) return true;
    if (segment.kind === "strong" || segment.kind === "em" || segment.kind === "del" || segment.kind === "htmlSpan") {
      return markdownInlineContainsPriorityBadgeImage(segment.text, options);
    }
    if (segment.kind === "link") {
      return markdownInlineContainsPriorityBadgeImage(segment.text, { ...options, inLink: true });
    }
    return false;
  });
}

function isMarkdownBlockBoundary(line: string, nextLine = ""): boolean {
  return line.trim().length === 0
    || parseMarkdownIndentedCodeBlock([line], 0) !== null
    || parseMarkdownFenceLine(line) !== null
    || /^\s*(\$\$|\\\[)/.test(line)
    || /^<details(?:\s+open)?\s*>/i.test(line.trim())
    || /^ {0,3}#{1,6}(?=\s|$)/.test(line)
    || /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)
    || parseMarkdownImageLine(line) !== null
    || parseMarkdownTaskListItem(line) !== null
    || parseMarkdownListItemLine(line) !== null
    || isMarkdownBlockquoteLine(line)
    || (line.includes("|") && isTableSeparatorRow(nextLine));
}

function pushTextSegment(segments: MarkdownInlineSegment[], text: string): void {
  if (text.length === 0) return;
  const value = markdownUnescapeText(text);
  if (value.length === 0) return;
  const previous = segments[segments.length - 1];
  if (previous?.kind === "text") {
    previous.text += value;
    return;
  }
  segments.push({ kind: "text", text: value });
}

function markdownLinkSegment(text: string, href: string, title: string | null = null): Extract<MarkdownInlineSegment, { kind: "link" }> {
  return title === null ? { kind: "link", text, href } : { kind: "link", text, href, title };
}

function normalizeMarkdownHref(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) return trimmed.slice(1, -1).trim();
  return trimmed;
}

function markdownUnescapeText(text: string): string {
  return text.replace(/\\([\\`*{}\[\]()#+\-.!_>~|])/g, "$1");
}

export function safeMarkdownHref(value: string): string | null {
  const href = normalizeMarkdownHref(value);
  if (!href || /[\u0000-\u001F\u007F]/u.test(href)) return null;
  if (href.startsWith("//")) return null;
  const scheme = href.match(/^([A-Za-z][A-Za-z0-9+.-]*):/u)?.[1]?.toLowerCase();
  if (!scheme) return href;
  // Codex sanitizes link hrefs against /^(https?|ircs?|mailto|xmpp|codex)$/i
  // (codex: markdown-*.js). ftp is NOT in the allowlist; the codex:// deep-link
  // scheme IS kept clickable. Re-verified vs Codex Desktop v26.519.81530.
  if (scheme === "http" || scheme === "https") {
    try {
      new URL(href);
      return href;
    } catch {
      return null;
    }
  }
  if (
    scheme === "irc"
    || scheme === "ircs"
    || scheme === "mailto"
    || scheme === "xmpp"
    || scheme === "codex"
  ) {
    return href;
  }
  return null;
}

// Codex sanitizes image `src` through its `ut()` helper (codex: markdown-*.js):
// allow data:image/* and data:video/*, file/relative/absolute local paths
// (Codex's file-path transform; HiCodex resolves these via the local asset
// bridge), and otherwise require the same scheme allowlist as links. Schemes
// such as javascript: / vbscript: are dropped. Re-verified vs Codex Desktop
// v26.519.81530.
function safeMarkdownImageSrc(value: string): string | null {
  const src = normalizeMarkdownHref(value);
  if (!src) return null;
  if (/^data:(?:image|video)\//iu.test(src)) return src;
  if (/^file:/iu.test(src)) return src;
  if (src.startsWith("//")) return null;
  const scheme = src.match(/^([A-Za-z][A-Za-z0-9+.-]*):/u)?.[1]?.toLowerCase();
  if (!scheme) return src; // relative or absolute local path (mediaSources key)
  return safeMarkdownHref(src);
}

function priorityBadgeLabelFromSrc(src: string): string | null {
  try {
    const url = new URL(src);
    if (url.protocol !== "https:" || url.hostname !== "img.shields.io") return null;
    if (!url.pathname.startsWith("/badge/")) return null;
    return url.pathname.match(/^\/badge\/(P[0-9]+)(?:-|$)/)?.[1] ?? null;
  } catch {
    return null;
  }
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

function MarkdownLink({ children, href, title }: { children: ReactNode; href: string; title?: string | null }) {
  const external = isExternalHref(href);
  return (
    <a
      className={external ? "hc-markdown-link is-external" : "hc-markdown-link"}
      href={href}
      rel={external ? "noreferrer" : undefined}
      target={external ? "_blank" : undefined}
      title={title ?? undefined}
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
