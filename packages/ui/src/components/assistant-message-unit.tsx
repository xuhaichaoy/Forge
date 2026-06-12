import { Loader2 } from "lucide-react";
import { useMemo } from "react";
import type { ConversationRenderUnit, RailEntry } from "../state/render-groups";
import {
  automationCitationsFromItems,
  extractAutomationCitations,
  type CitationDirective,
} from "../state/automation-citations";
import { extractAssistantReviewComments } from "../state/assistant-review-comments";
import { AssistantAfterEndResources, AssistantAfterEvents, AssistantAfterGalleries } from "./assistant-after-blocks";
import { AssistantMessageActions } from "./assistant-message-actions";
import { AssistantResourceCards } from "./assistant-resource-cards";
import {
  assistantArtifactMediaSources,
  assistantResourceCardEntriesForMessage,
  shouldRenderAssistantMessageChrome,
} from "./assistant-message-artifacts";
import { AssistantAfterReviewComments } from "./assistant-review-comments-view";
import { AutomationCitationChipRow } from "./automation-citation";
import type { PatchAction, PatchActionState } from "./event-unit";
import type { FileReference } from "./file-reference-types";
import { useHiCodexIntl } from "./i18n-provider";
import { MemoryCitationView } from "./message-file-citations";
import { desktopAssistantCopyText } from "./message-markdown-copy";
import {
  Markdownish,
  markdownAllowsTrailingAutomationInline,
} from "./message-markdown-renderer";
import { messageTurnId, messageTurnStatus } from "./user-message-meta";

type MessageRenderUnit = Extract<ConversationRenderUnit, { kind: "message" }>;

export function AssistantMessageUnit({
  unit,
  threadId,
  onOpenAssistantArtifact,
  onRevealAssistantEndResource,
  onForkTurn,
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
  onOpenAssistantArtifact?: (entry: RailEntry) => void;
  onRevealAssistantEndResource?: (entry: RailEntry) => void;
  onForkTurn?: (turnId: string) => void;
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
  const assistantPhase = unit.assistantPhase ?? "unknown";
  const streaming = unit.isStreaming === true;
  const renderPlaceholder = unit.renderPlaceholder === true;
  const showAssistantChrome = shouldRenderAssistantMessageChrome(assistantPhase);
  const turnId = messageTurnId(unit.item);
  const turnStatus = messageTurnStatus(unit.item);
  const turnInProgress = turnStatus === "inProgress" || turnStatus === "running" || turnStatus === "active";
  const canFork = showAssistantChrome && !turnInProgress && !streaming && !renderPlaceholder;
  const onFork = canFork && turnId && onForkTurn
    ? () => onForkTurn(turnId)
    : undefined;
  const assistantArtifacts = unit.artifacts ?? [];

  const assistantMediaSources = useMemo(
    () => assistantArtifactMediaSources(assistantArtifacts),
    [assistantArtifacts],
  );
  const assistantResourceCards = useMemo(
    () => assistantResourceCardEntriesForMessage({
      phase: assistantPhase,
      text: unit.text,
      artifacts: assistantArtifacts,
    }),
    [assistantArtifacts, assistantPhase, unit.text],
  );
  const hasAssistantEndResources = (unit.assistantAfter ?? []).some((after) => after.kind === "assistantEndResources");
  const citation = (
    <MemoryCitationView
      citation={(unit.item as { memoryCitation?: unknown }).memoryCitation}
      memoryCitationRoot={memoryCitationRoot}
      onOpenFileReference={onOpenFileReference}
    />
  );
  const assistantCitations = useMemo(
    () => {
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
    [unit.item, unit.text],
  );
  const onAutomationCitationOpen = onOpenAutomation
    ? (citationDirective: CitationDirective) => {
        const automationId = citationDirective.openAutomationId?.trim();
        if (automationId) onOpenAutomation(automationId);
      }
    : undefined;
  const assistantReviewExtraction = useMemo(
    () => extractAssistantReviewComments(assistantCitations.cleanedContent),
    [assistantCitations],
  );
  const assistantMarkdownText = assistantReviewExtraction?.cleanedContent ?? assistantCitations.cleanedContent;
  const assistantCopyText = useMemo(
    () => (!streaming ? desktopAssistantCopyText(unit.text) : ""),
    [streaming, unit.text],
  );
  const canInlineAutomationCitations = assistantCitations.trailingCitations.length > 0
    && markdownAllowsTrailingAutomationInline(assistantMarkdownText);
  const automationCitationChips = [
    ...assistantCitations.loose,
    ...(canInlineAutomationCitations ? [] : assistantCitations.trailingCitations),
  ];

  if (renderPlaceholder) {
    return (
      <div className="hc-assistant-placeholder" aria-label={formatMessage({ id: "hc.assistantMessage.responseLoading", defaultMessage: "Assistant response is loading" })}>
        {/* codex pre-stream placeholder spinner = `.icon-sm` (18px), not 16px. */}
        <Loader2 className="hc-spin" size={18} />
      </div>
    );
  }

  return (
    <>
      <Markdownish
        text={assistantMarkdownText}
        fadeType={streaming ? "indexed" : "none"}
        mediaSources={assistantMediaSources}
        onOpenAutomationCitation={onAutomationCitationOpen}
        onOpenFileReference={onOpenFileReference}
        onOpenFileReferenceExternal={onOpenFileReferenceExternal}
        trailingAutomationCitations={canInlineAutomationCitations
          ? assistantCitations.trailingCitations
          : undefined}
      />
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
  );
}
