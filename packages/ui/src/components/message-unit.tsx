import { memo } from "react";
import type { ConversationRenderUnit, RailEntry } from "../state/render-groups";
import { AssistantMessageUnit } from "./assistant-message-unit";
import type { FileReference } from "./file-reference-types";
import type { PatchAction, PatchActionState } from "./event-unit";
import type { OpenGeneratedImageGalleryPreview } from "./generated-image-gallery";
import { Markdownish } from "./message-markdown-renderer";
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
  assistantCompletedThreadGoal,
  assistantHookStatsSummary,
} from "./assistant-message-actions";
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
  onOpenGeneratedImagePreview,
  onPatchAction,
  patchActionState,
  patchActionInFlight,
  memoryCitationRoot,
}: {
  unit: MessageRenderUnit;
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
  onOpenGeneratedImagePreview?: OpenGeneratedImageGalleryPreview;
  onPatchAction?: (action: PatchAction, diff: string) => void;
  patchActionState?: PatchActionState;
  patchActionInFlight?: boolean;
  memoryCitationRoot?: string | null;
}) {
  const assistantPhase = unit.role === "assistant" ? unit.assistantPhase ?? "unknown" : undefined;
  const streaming = unit.role === "assistant" && unit.isStreaming === true;
  const turnId = messageTurnId(unit.item);
  const turnStatus = messageTurnStatus(unit.item);
  const turnInProgress = turnStatus === "inProgress" || turnStatus === "running" || turnStatus === "active";
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
            <AssistantMessageUnit
              unit={unit}
              onOpenAssistantArtifact={onOpenAssistantArtifact}
              onRevealAssistantEndResource={onRevealAssistantEndResource}
              onForkTurn={onForkTurn}
              onOpenFileReference={onOpenFileReference}
              onOpenFileReferenceExternal={onOpenFileReferenceExternal}
              onOpenAutomation={onOpenAutomation}
              onOpenDiff={onOpenDiff}
              onOpenGeneratedImagePreview={onOpenGeneratedImagePreview}
              onPatchAction={onPatchAction}
              patchActionState={patchActionState}
              patchActionInFlight={patchActionInFlight}
              memoryCitationRoot={memoryCitationRoot}
            />
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
      && prev.onRevealAssistantEndResource === next.onRevealAssistantEndResource
      && prev.onForkTurn === next.onForkTurn
      && prev.onOpenThreadId === next.onOpenThreadId
      && prev.onOpenFileReference === next.onOpenFileReference
      && prev.onOpenAutomation === next.onOpenAutomation
      && prev.onOpenDiff === next.onOpenDiff
      && prev.onOpenGeneratedImagePreview === next.onOpenGeneratedImagePreview
      && prev.onPatchAction === next.onPatchAction
      && prev.patchActionState === next.patchActionState
      && prev.patchActionInFlight === next.patchActionInFlight
      && prev.memoryCitationRoot === next.memoryCitationRoot
    );
  }
  if (prev.isMostRecentTurn !== next.isMostRecentTurn) return false;
  if (prev.onEditLastUserMessage !== next.onEditLastUserMessage) return false;
  if (prev.onOpenAssistantArtifact !== next.onOpenAssistantArtifact) return false;
  if (prev.onRevealAssistantEndResource !== next.onRevealAssistantEndResource) return false;
  if (prev.onForkTurn !== next.onForkTurn) return false;
  if (prev.onOpenThreadId !== next.onOpenThreadId) return false;
  if (prev.onOpenFileReference !== next.onOpenFileReference) return false;
  if (prev.onOpenAutomation !== next.onOpenAutomation) return false;
  if (prev.onOpenDiff !== next.onOpenDiff) return false;
  if (prev.onOpenGeneratedImagePreview !== next.onOpenGeneratedImagePreview) return false;
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
