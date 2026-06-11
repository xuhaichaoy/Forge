import { Loader2 } from "lucide-react";
import { memo, useMemo } from "react";
import type { ConversationRenderUnit, RailEntry } from "../state/render-groups";
import { useHiCodexIntl } from "./i18n-provider";
import { AssistantMessageActions } from "./assistant-message-actions";
import {
  assistantArtifactMediaSources,
  assistantResourceCardEntriesForMessage,
  shouldRenderAssistantMessageChrome,
} from "./assistant-message-artifacts";
import {
  AssistantAfterEndResources,
  AssistantAfterEvents,
  AssistantAfterGalleries,
} from "./assistant-after-blocks";
import { AssistantAfterReviewComments } from "./assistant-review-comments-view";
import { AssistantResourceCards } from "./assistant-resource-cards";
// codex: local-conversation-thread-*.js — automation citation
// extraction + chip row. Codex's assistant body interleaves `:citation{...}`
// leaf directives into the markdown and hoists them into either the trailing
// paragraph or the fallback chip row. HiCodex mirrors that with the helpers in
// `state/automation-citations` plus the chip components below.
import { AutomationCitationChipRow } from "./automation-citation";
import {
  automationCitationsFromItems,
  extractAutomationCitations,
  type CitationDirective,
} from "../state/automation-citations";
import { extractAssistantReviewComments } from "../state/assistant-review-comments";
import type { FileReference } from "./file-reference-types";
import { MemoryCitationView } from "./message-file-citations";
import type { PatchAction, PatchActionState } from "./event-unit";
import {
  Markdownish,
  markdownAllowsTrailingAutomationInline,
} from "./message-markdown-renderer";
import { desktopAssistantCopyText } from "./message-markdown-copy";
import { UserMessageUnit } from "./message-user-message";
import {
  messageTurnId,
  messageTurnStatus,
} from "./user-message-meta";
import type { OpenThreadHandler } from "./open-thread";

// codex: markdown-*.js — the pure CommonMark/GFM-plus parsing engine now
// lives in `state/conversation-markdown-engine` (single source of truth shared
// by event-unit / plan-summary-card via Markdownish). This file owns only the
// React rendering of that AST. Parser symbols are re-exported below so the
// established `./message-unit` import surface (tests, conversation-view) is
// unchanged.
type MessageRenderUnit = Extract<ConversationRenderUnit, { kind: "message" }>;

export type { FileReference } from "./file-reference-types";
export {
  assistantAutoReviewSummary,
  assistantCompletedThreadGoal,
  assistantHookStatsSummary,
} from "./assistant-message-actions";
export type { AssistantAutoReviewSummary } from "./assistant-message-actions";
export {
  assistantArtifactMediaSources,
  assistantResourceCardEntriesForMessage,
  resolveAssistantMarkdownMediaSource,
  shouldRenderAssistantMessageChrome,
} from "./assistant-message-artifacts";
export { desktopMarkdownCodeBlockWrapMode } from "./code-snippet";
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
export { shouldRenderMessageActionRow } from "./message-action-row";
export {
  MARKDOWN_IMAGE_PREVIEW_DIALOG_CLASS,
  MARKDOWN_IMAGE_PREVIEW_TRIGGER_ATTRIBUTE,
  markdownImagePreviewAdjacentIndexes,
  markdownImagePreviewStateFromTrigger,
} from "./markdown-image-preview";
export type { MarkdownImagePreviewItem, MarkdownImagePreviewState } from "./markdown-image-preview";

export {
  parseMarkdownDocument,
  parseMarkdownBlocks,
  parseMarkdownInline,
  parseMarkdownPromptLink,
  markdownPromptLinkFromHref,
  safeMarkdownHref,
  markdownFadeTextSegments,
  markdownIndexedFadeSegmentCount,
  memoryCitationEntries,
  memoryCitationFileReference,
} from "../state/conversation-markdown-engine";
export type {
  MarkdownBlock,
  MarkdownDocument,
  MarkdownImageBlock,
  MarkdownInlineSegment,
  MarkdownListItemValue,
  MarkdownNestedListItem,
  MarkdownPromptLinkKind,
  MarkdownPromptLinkSegment,
  MarkdownReferenceDefinition,
  MarkdownReferenceDefinitions,
  MarkdownTableAlign,
  MarkdownTaskListItem,
  MemoryCitationEntryView,
} from "../state/conversation-markdown-engine";
export {
  desktopAssistantCopyText,
  selectedMarkdownRichCopyPayload,
} from "./message-markdown-copy";
export type { MarkdownRichCopyPayload } from "./message-markdown-copy";
export { DESKTOP_MARKDOWN_CODE_BLOCK_ROOT_MARGIN } from "./message-markdown-code-block";
export { Markdownish } from "./message-markdown-renderer";
export { resolveMarkdownMediaSrc } from "./message-markdown-media";
export { shouldRenderUserMessageActionStrip } from "./message-user-message";

function MessageUnitViewInner({
  unit,
  threadId = null,
  isMostRecentTurn = false,
  onEditLastUserMessage,
  onOpenAssistantArtifact,
  onRevealAssistantEndResource,
  onForkTurn,
  onOpenThreadId,
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
  const { formatMessage } = useHiCodexIntl();
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
              renderMarkdown={(text, openFileReference) => (
                <Markdownish text={text} onOpenFileReference={openFileReference} />
              )}
              unit={unit}
            />
          )
        : (
            renderPlaceholder
              ? (
                  <div className="hc-assistant-placeholder" aria-label={formatMessage({ id: "hc.assistantMessage.responseLoading", defaultMessage: "Assistant response is loading" })}>
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
      && prev.onOpenThreadId === next.onOpenThreadId
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
  if (prev.onOpenThreadId !== next.onOpenThreadId) return false;
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
