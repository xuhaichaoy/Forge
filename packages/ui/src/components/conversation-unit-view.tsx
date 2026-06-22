import { GitFork } from "lucide-react";
import type { ConversationRenderUnit, RailEntry } from "../state/render-groups";
import { isItemInProgress } from "../state/thread-item-fields";
import {
  ToolActivityView,
  ToolBlock,
} from "./event-unit";
import type { PatchAction, PatchActionState } from "./event-unit";
import type { FileReference } from "./file-reference-types";
import { GeneratedImageGallery } from "./generated-image-gallery";
import { AssistantEndResourceCards } from "./assistant-end-resource-cards";
import { IconActionButton, MessageActionRow } from "./message-action-row";
import { useForgeIntl } from "./i18n-provider";
import { MessageUnitView } from "./message-unit";
import type { OpenRemoteTaskHandler, OpenThreadHandler } from "./open-thread";
import type { McpAppHostCallHandler, ReadMcpResourceHandler } from "./tool-activity-detail";
import { DynamicToolCallGroupView, ThreadItemView } from "./thread-item-view";

export function ConversationUnitView({
  unit,
  isMostRecentTurn = false,
  onOpenFileReference,
  onOpenAutomation,
  memoryCitationRoot,
  onOpenThreadId,
  onOpenConversationThreadId,
  onOpenRemoteTask,
  onMcpAppHostCall,
  onReadMcpResource,
  threadId = null,
  onEditLastUserMessage,
  onOpenAssistantArtifact,
  onRevealAssistantEndResource,
  onOpenDiff,
  onForkTurn,
  onPatchAction,
  patchActionState,
  patchActionInFlight,
}: {
  unit: ConversationRenderUnit;
  isMostRecentTurn?: boolean;
  onOpenFileReference?: (reference: FileReference) => void;
  onOpenAutomation?: (automationId: string) => void;
  memoryCitationRoot?: string | null;
  onOpenThreadId?: OpenThreadHandler;
  onOpenConversationThreadId?: OpenThreadHandler;
  onOpenRemoteTask?: OpenRemoteTaskHandler;
  onMcpAppHostCall?: McpAppHostCallHandler;
  onReadMcpResource?: ReadMcpResourceHandler;
  threadId?: string | null;
  onEditLastUserMessage?: (turnId: string, message: string) => void | Promise<void>;
  onOpenAssistantArtifact?: (entry: RailEntry) => void;
  onRevealAssistantEndResource?: (entry: RailEntry) => void;
  // codex: `wa(o, { path })` deep-link — when supplied, scope diff view to a single file.
  onOpenDiff?: (filePath?: string) => void;
  onForkTurn?: (turnId: string) => void;
  onPatchAction?: (action: PatchAction, diff: string) => void;
  patchActionState?: PatchActionState;
  patchActionInFlight?: boolean;
}) {
  if (unit.kind === "message") {
    return (
      <MessageUnitView
        unit={unit}
        isMostRecentTurn={isMostRecentTurn}
        onEditLastUserMessage={onEditLastUserMessage}
        onOpenAssistantArtifact={onOpenAssistantArtifact}
        onRevealAssistantEndResource={onRevealAssistantEndResource}
        onForkTurn={onForkTurn}
        onOpenThreadId={onOpenThreadId}
        onOpenFileReference={onOpenFileReference}
        onOpenAutomation={onOpenAutomation}
        onOpenDiff={onOpenDiff}
        onPatchAction={onPatchAction}
        patchActionState={patchActionState}
        patchActionInFlight={patchActionInFlight}
        memoryCitationRoot={memoryCitationRoot}
      />
    );
  }
  if (unit.kind === "threadItem") {
    return (
      <ThreadItemView
        unit={unit}
        onMcpAppHostCall={onMcpAppHostCall}
        onReadMcpResource={onReadMcpResource}
        threadId={threadId}
      />
    );
  }
  if (unit.kind === "dynamicToolCallGroup") {
    return <DynamicToolCallGroupView unit={unit} />;
  }
  if (unit.kind === "toolActivity") {
    return (
      <ToolActivityView
        unit={unit}
        onOpenFileReference={onOpenFileReference}
        onOpenThreadId={onOpenThreadId}
        onMcpAppHostCall={onMcpAppHostCall}
        onReadMcpResource={onReadMcpResource}
        threadId={threadId}
      />
    );
  }
  if (unit.kind === "generatedImageGallery") {
    return (
      <GeneratedImageGalleryOutput
        unit={unit}
        onForkTurn={onForkTurn}
      />
    );
  }
  if (unit.kind === "assistantEndResources") {
    return (
      <AssistantEndResourceCards
        resources={unit.resources}
        onOpenArtifact={onOpenAssistantArtifact}
        onRevealResource={onRevealAssistantEndResource}
      />
    );
  }
  return (
    <ToolBlock
      contentSearchUnitKey={unit.key}
      details={unit.details}
      format={unit.format}
      inProgress={isItemInProgress(unit.item)}
      item={unit.item}
      itemIds={unit.item.id}
      label={unit.label}
      onOpenDiff={onOpenDiff}
      onOpenConversationThreadId={onOpenConversationThreadId}
      onOpenFileReference={onOpenFileReference}
      onOpenRemoteTask={onOpenRemoteTask}
      onPatchAction={onPatchAction}
      patchActionState={patchActionState}
      patchActionInFlight={patchActionInFlight}
      tone={unit.tone}
      value={unit.text}
    />
  );
}

function GeneratedImageGalleryOutput({
  unit,
  onForkTurn,
}: {
  unit: Extract<ConversationRenderUnit, { kind: "generatedImageGallery" }>;
  onForkTurn?: (turnId: string) => void;
}) {
  const { formatMessage } = useForgeIntl();
  const canFork = Boolean(onForkTurn && unit.turnId && !unit.hasPending);
  return (
    <div className="hc-message assistant hc-generated-image-output" data-role="assistant">
      <GeneratedImageGallery images={unit.images} hasPending={unit.hasPending} />
      <MessageActionRow copyText="" hasActionChildren={canFork}>
        {canFork && unit.turnId && (
          <IconActionButton
            ariaLabel={formatMessage({ id: "assistantMessageContent.forkAriaLabel", defaultMessage: "Fork from this point" })}
            title={formatMessage({ id: "assistantMessageContent.forkTooltip", defaultMessage: "Fork" })}
            onClick={() => onForkTurn?.(unit.turnId ?? "")}
          >
            <GitFork size={13} />
          </IconActionButton>
        )}
      </MessageActionRow>
    </div>
  );
}
