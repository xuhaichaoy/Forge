import type {
  ConversationProjection,
  ConversationProjectionOptions,
  ConversationRenderUnit,
  AssistantEndResourcesRenderUnit,
  AssistantAfterRenderUnit,
  GeneratedImageGalleryRenderUnit,
  ItemRecord,
  RailEntry,
  ThreadItem,
  ToolActivityGroupType,
} from "./render-group-types";
import {
  assistantEndResourcesForTurn,
  endResourcesCoverEditedFiles,
} from "./assistant-end-resources";
import { assistantArtifactsForTurn } from "./assistant-artifacts";
import { extractAssistantReviewComments } from "./assistant-review-comments";
import { projectBackgroundAgentRailEntries } from "./background-agents";
import { projectBackgroundTerminalRailEntries } from "./background-terminals";
import { eventDetails, eventFormat, eventLabel, eventText, eventTone } from "./event-projection";
import {
  generatedImageGalleryTurnId,
  projectGeneratedImageToolOutputs,
  visibleGeneratedImagesForEndResources,
} from "./generated-image-gallery-projection";
import {
  collectRailEntries,
  type ArtifactFileCandidateIndex,
} from "./rail-projection";
import {
  assistantMessagePhase,
  assistantMessageText,
  isCompletedRecord,
  isItemInProgress,
  itemType,
  mcpAppResourceUri,
  mcpAppResourceUriFromServerStatuses,
  mcpElicitationServer,
  mcpServerName,
  mcpToolName,
} from "./thread-item-fields";
import {
  baseToolActivityGroupType,
  blockedMcpServersFromItems,
  isBlockingOutOfBandItem,
  isToolActivityItem,
  summarizeToolActivity,
  toolActivityGroupKey,
  toolActivityRenderKey,
} from "./tool-activity-grouping";
import { forgeImageToolOutputUrl } from "./image-generation-tool";
import { projectUserMessageContent, userMessageCopyText, userMessageText } from "./user-message-content";
import {
  groupConsecutiveDynamicToolCalls,
  withStreamingAssistantState,
} from "./conversation-render-postprocessing";

export function projectConversation(rawItems: ThreadItem[], options: ConversationProjectionOptions = {}): ConversationProjection {
  const items = withMcpAppResourceUris(rawItems, options.mcpServerStatuses);
  const units: ConversationRenderUnit[] = [];
  const artifacts = new Map<string, RailEntry>();
  const sources = new Map<string, RailEntry>();
  const fileCandidates: ArtifactFileCandidateIndex = new Map();
  const blockedMcpServers = blockedMcpServersFromItems(items);
  const workedForCollapsedByDefaultIds = workedForIdsWithTrailingAssistant(items);
  let activity: ThreadItem[] = [];
  let activityGroupType: ToolActivityGroupType | null = null;
  let activityGroupKey: string | null = null;
  /*
   * codex split-items-into-render-groups-*.js `oe`: collapse slices cover only
   * the regions AFTER each assistant message; the LEADING region (before the
   * first rendered assistant message of a segment) is excluded, so `R` never
   * cross-folds it into a `collapsed-tool-activity` rollup — leading exec/read
   * stay `exploration` and web-searches stay `web-search-group`, SEPARATE. These
   * two flags let `pushActivityItem` suppress the cross-type PROMOTION while in
   * that leading region (single-type accumulation is unaffected).
   */
  let segmentHasAssistantToRender = false;
  let assistantRenderedInSegment = false;
  const conversationDetailLevel = options.conversationDetailLevel ?? "STEPS_COMMANDS";
  const parentThreadAttachmentSourceConversationId = options.parentThreadAttachmentSourceConversationId?.trim() || null;
  let parentThreadAttachmentUsed = false;

  /*
   * codex: split-items-into-render-groups-*.js — Codex Desktop's segment
   * aggregator folds exploration / patch / exec / mcp-tool-call / web-search
   * into one segment bucket per its mergeable predicate, then wraps that bucket
   * as a single `collapsed-tool-activity` with cross-type counts
   * (webSearchCount, commandCount, exploredFileCount, …). It additionally folds
   * reasoning items into the current exploration buffer.
   *
   * We approximate the same behavior here: groupTypes that Codex's predicate
   * accepts are mapped onto the same merged bucket so consecutive items don't
   * split into separate render rows. Reasoning still joins the current merged
   * bucket (or a standalone exploration if already in one). Standalone
   * groupTypes (`worked-for` / `multi-agent-group` / `pending-mcp-tool-calls` /
   * `todo-list`) keep their independent bucket.
   */
  /*
   * codex split-items-into-render-groups-*.js: the collapse predicate `z()`
   * INCLUDES web-search, so the `R` pass DOES fold web-search + exec/exploration/
   * patch/mcp into one cross-type `collapsed-tool-activity` (within a slice / the
   * no-assistant-message case). Forge mirrors that by keeping web-search-group
   * mergeable. (The ONLY place Codex separates them is the LEADING region that
   * `oe` excludes from collapse slices — see §M-19 #5; that needs the slice-based
   * pass split, NOT a blanket de-merge here, which would wrongly separate the
   * common merged case.)
   */
  const MERGEABLE_ACTIVITY_GROUP_TYPES: ReadonlySet<ToolActivityGroupType> = new Set([
    "collapsed-tool-activity",
    "exploration",
    "web-search-group",
  ]);

  const pushActivityItem = (item: ThreadItem, forcedGroupType?: ToolActivityGroupType) => {
    const baseGroupType = forcedGroupType ?? baseToolActivityGroupType(item);
    const currentIsMergeable = activityGroupType !== null
      && MERGEABLE_ACTIVITY_GROUP_TYPES.has(activityGroupType);
    const incomingIsMergeable = MERGEABLE_ACTIVITY_GROUP_TYPES.has(baseGroupType);

    // codex: split-items-into-render-groups-*.js — real reasoning items are
    // silently absorbed into the active exploration buffer (so the buffer keeps
    // building) and the reasoning render path then renders each reasoning entry
    // as `null`. Synthetic `thinking-placeholder` items, however, ARE the live
    // "Thinking" UX and must end up in their own `reasoning`-typed bucket so
    // `ToolActivityView` routes them to `ReasoningActivityView`.
    if (baseGroupType === "reasoning") {
      const isThinkingPlaceholder = (item as Record<string, unknown>)._syntheticKind === "thinking-placeholder";
      if (isThinkingPlaceholder) {
        if (activity.length > 0) flushActivity();
        activityGroupType = "reasoning";
        activityGroupKey = toolActivityGroupKey(item, "reasoning");
        activity.push(item);
        return;
      }
      // Real reasoning item: append to the current mergeable bucket so the
      // exploration / collapsed-tool-activity summary keeps building, but the item
      // itself is hidden in `toolActivityDetailItems` so it never renders as a row.
      if (currentIsMergeable) {
        activity.push(item);
      }
      // Otherwise drop — no row, no JSON fallback.
      return;
    }

    // Mergeable item joining a mergeable bucket (Codex segment aggregation).
    // codex `oe`: the LEADING region (before the first rendered assistant message
    // of the segment) is excluded from collapse slices, so heterogeneous mergeable
    // types there are NOT cross-folded — leading exec/read stay `exploration` and
    // web-searches stay `web-search-group`, separate. So while leading, suppress
    // the cross-type PROMOTION (single-type accumulation, where
    // activityGroupType === baseGroupType, still merges as before).
    const inLeadingRegion = segmentHasAssistantToRender && !assistantRenderedInSegment;
    if (currentIsMergeable && incomingIsMergeable && !(inLeadingRegion && activityGroupType !== baseGroupType)) {
      if (activityGroupType !== baseGroupType) {
        // Heterogeneous mix — promote the bucket to `collapsed-tool-activity` so the
        // summary builder produces a cross-type count label
        // ("Explored 1 file, ran 2 commands, searched web 4 times").
        activityGroupType = "collapsed-tool-activity";
        activityGroupKey = `merged-activity:${activityGroupKey ?? toolActivityGroupKey(item, "collapsed-tool-activity")}`;
      }
      activity.push(item);
      return;
    }

    // Otherwise the new item starts (or continues) a bucket of its own type.
    const nextGroupKey = toolActivityGroupKey(item, baseGroupType);
    if (baseGroupType === "worked-for" && activity.length > 0) {
      flushActivity();
    }
    if (activity.length > 0 && (activityGroupType !== baseGroupType || activityGroupKey !== nextGroupKey)) {
      flushActivity();
    }
    activityGroupType = baseGroupType;
    activityGroupKey = nextGroupKey;
    activity.push(item);
  };

  const flushActivity = (context: { isCurrentToolActivity?: boolean } = {}) => {
    if (activity.length === 0) return;
    if (shouldKeepSingleActivityAsThreadItem(activity, {
      conversationDetailLevel,
      isCurrentToolActivity: context.isCurrentToolActivity === true,
    })) {
      const [item] = activity;
      if (item) units.push(threadItemRenderUnit(item));
      activity = [];
      activityGroupType = null;
      activityGroupKey = null;
      return;
    }
    const groupTypeOverride = activityGroupType === "pending-mcp-tool-calls" && activity.length === 1
      ? "collapsed-tool-activity"
      : activityGroupType ?? undefined;
    const summary = summarizeToolActivity(activity, {
      conversationDetailLevel: options.conversationDetailLevel ?? "STEPS_COMMANDS",
      workedForCollapsedByDefault: activity.some((item) => workedForCollapsedByDefaultIds.has(item.id)),
      /*
       * If `pushActivityItem` promoted the bucket to a cross-type
       * `collapsed-tool-activity` (Codex segment aggregation), preserve that
       * group type so the summary builder produces the cross-type count label.
       * Desktop only emits `pending-mcp-tool-calls` when consecutive pending MCP
       * calls roll up to more than one item; a single pending call stays in its
       * item-level activity row.
       */
      groupTypeOverride,
    });
    const renderIndex = units.length;
    units.push({
      kind: "toolActivity",
      key: toolActivityRenderKey(summary.groupType, activity, renderIndex),
      items: activity,
      summary,
    });
    activity = [];
    activityGroupType = null;
    activityGroupKey = null;
  };

  // 把外层 projectConversation 的 options 在 pushConversationItem 闭包外别名，
  // 避免 inner 同名 options 参数 shadow 它。appRegistry 用于 Sources logo 查询。
  const projectionOptions = options;
  const collectItemRailEntries = (item: ThreadItem, cwd?: string | null) => {
    collectRailEntries(
      item,
      artifacts,
      sources,
      fileCandidates,
      projectionOptions.appRegistry,
      {
        cwd: cwd ?? projectionOptions.cwd ?? null,
        projectlessOutputDirectory: projectionOptions.projectlessOutputDirectory ?? null,
        includeGeneratedImageArtifacts: projectionOptions.includeGeneratedImageArtifacts === true,
      },
    );
  };
  const pushConversationItem = (
    item: ThreadItem,
    options: {
      assistantArtifacts?: RailEntry[];
      assistantAfter?: AssistantAfterRenderUnit[];
      hasArtifacts?: boolean;
      parentThreadAttachmentSourceConversationId?: string | null;
    } = {},
  ) => {
    if (shouldSkipConversationItem(item)) {
      return;
    }
    if (itemType(item) === "todo-list") {
      flushActivity();
      units.push(threadItemRenderUnit(item));
      return;
    }
    if (itemType(item) === "proposed-plan") {
      flushActivity();
      units.push(threadItemRenderUnit(item));
      return;
    }
    /*
     * Plan ThreadItem 独立渲染。
     *
     * DEVELOPMENT.md:114 规则：hook activity 不应作为 standalone item，桌面端用
     * user-message 上的 hookStats/hookRuns 字段表达；reasoning 也是同样规则。
     * 因此这里只把 `plan` 走 threadItemRenderUnit（plan 是有独立卡的 ThreadItem
     * variant），其余 hookPrompt/contextCompaction/enteredReviewMode/exitedReviewMode/
     * imageView/imageGeneration 保留 Forge 既有路径（event-projection 处理）。
     */
    if (itemType(item) === "plan") {
      collectItemRailEntries(item);
      flushActivity();
      units.push(threadItemRenderUnit(item));
      return;
    }
    if (itemType(item) === "mcp-server-elicitation") {
      if (isCompletedRecord(item)) return;
      flushActivity();
      units.push(threadItemRenderUnit(item));
      return;
    }
    if (isBlockingOutOfBandItem(item, blockedMcpServers)) {
      return;
    }
    collectItemRailEntries(item);
    if (isUserMessage(item)) {
      flushActivity();
      units.push({
        kind: "message",
        key: item.id,
        role: "user",
        item,
        text: userMessageText(item),
        copyText: userMessageCopyText(item),
        userContent: projectUserMessageContent(item),
        ...(options.parentThreadAttachmentSourceConversationId
          ? { parentThreadAttachment: { sourceConversationId: options.parentThreadAttachmentSourceConversationId } }
          : {}),
      });
      return;
    }
    if (isAssistantMessage(item)) {
      const renderPlaceholder = shouldRenderAssistantPlaceholder(item);
      const text = assistantMessageText(item);
      if (!text.trim() && !renderPlaceholder) {
        return;
      }
      flushActivity();
      units.push({
        kind: "message",
        key: item.id,
        role: "assistant",
        item,
        text: renderPlaceholder ? "" : text,
        ...(options.assistantArtifacts && options.assistantArtifacts.length > 0
          ? { artifacts: options.assistantArtifacts }
          : {}),
        ...(options.assistantAfter && options.assistantAfter.length > 0
          ? { assistantAfter: options.assistantAfter }
          : {}),
        ...(options.hasArtifacts ? { hasArtifacts: true } : {}),
        assistantPhase: assistantMessagePhase(item),
        renderPlaceholder,
      });
      // codex `oe`: once a rendered assistant message exists, subsequent activity
      // falls in a collapse SLICE (cross-folds normally) rather than the leading
      // region.
      assistantRenderedInSegment = true;
      return;
    }
    if (forgeImageToolOutputUrl(item)) {
      flushActivity();
      units.push({
        kind: "event",
        key: item.id,
        item,
        label: eventLabel(item),
        text: eventText(item),
        details: eventDetails(item),
        tone: eventTone(item),
        format: eventFormat(item),
      });
      return;
    }
    if (isToolActivityItem(item)) {
      pushActivityItem(item);
      return;
    }
    if (shouldRenderStandaloneThreadItem(item)) {
      flushActivity();
      units.push(threadItemRenderUnit(item));
      return;
    }
    flushActivity();
    units.push({
      kind: "event",
      key: item.id,
      item,
      label: eventLabel(item),
      text: eventText(item),
      details: eventDetails(item),
      tone: eventTone(item),
      format: eventFormat(item),
    });
  };

  const segments = conversationSegments(items);
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index] ?? [];
    // codex `oe`: the leading region is "before the first RENDERED assistant
    // message" — mirror the render gate (text or placeholder). A segment with NO
    // rendered assistant message has no leading region (its activity collapses as
    // one slice, like Codex's `n.length===0` branch).
    segmentHasAssistantToRender = segment.some((item) =>
      isAssistantMessage(item)
      && (assistantMessageText(item).trim().length > 0 || shouldRenderAssistantPlaceholder(item))
    );
    assistantRenderedInSegment = false;
    const turnStatus = turnStatusForSegment(segment, {
      isLastSegment: index === segments.length - 1,
      isThreadRunning: options.isThreadRunning === true,
    });
    const assistantArtifactsForItem = (item: ThreadItem) => {
      const itemIndex = segment.indexOf(item);
      const itemsThroughAssistant = itemIndex >= 0 ? segment.slice(0, itemIndex + 1) : segment;
      return assistantArtifactsForTurn(
        itemsThroughAssistant,
        assistantMessageText(item),
        artifacts.values(),
        fileCandidates,
      );
    };

    if (!segment.some(isUserMessage)) {
      for (const item of segment) {
        pushConversationItem(
          item,
          isAssistantMessage(item) ? { assistantArtifacts: assistantArtifactsForItem(item) } : {},
        );
      }
      continue;
    }
    const split = splitTurnItems(segment, turnStatus);

    for (const item of split.modelChangedItems) pushConversationItem(item);
    for (const item of split.userItems) {
      const parentSourceConversationId = !parentThreadAttachmentUsed && parentThreadAttachmentSourceConversationId
        ? parentThreadAttachmentSourceConversationId
        : null;
      pushConversationItem(item, { parentThreadAttachmentSourceConversationId: parentSourceConversationId });
      if (parentSourceConversationId) parentThreadAttachmentUsed = true;
    }
    for (const item of split.modelReroutedItems) pushConversationItem(item);
    for (const item of split.agentItems) {
      pushConversationItem(
        item,
        isAssistantMessage(item) ? { assistantArtifacts: assistantArtifactsForItem(item) } : {},
      );
    }
    for (const item of split.automationUpdateItems) pushConversationItem(item);
    if (split.systemEventItem) pushConversationItem(split.systemEventItem);
    const assistantText = split.assistantItem ? assistantMessageText(split.assistantItem) : null;
    const assistantArtifacts = split.assistantItem
      ? assistantArtifactsForItem(split.assistantItem)
      : [];
    const endResources = isCompletedTurnStatus(turnStatus)
      ? assistantEndResourcesForTurn({
          items: split.assistantItem
            ? segment.slice(0, segment.indexOf(split.assistantItem) + 1)
            : segment,
        assistantText,
        cwd: segmentCwd(segment),
      })
      : [];
    /*
     * codex: local-conversation-thread-*.js — gallery aggregation: all
     * `generated-image` items in `toolOutputItems` collapse into one
     * `<images conversationId={…}/>` carousel — never one-card-per-image.
     * Forge previously routed each through the generic `pushConversationItem`
     * path, which produced a stack of full-width markdown image cards
     * (screenshot 2026-05-21 image #6).
     *
     * Mirror the gallery image filter: items with `src != null` after
     * filtering out completed images when any assistant artifact is a `.pptx`
     * (Codex `endResourcePaths.some(p => extension(p) === "pptx")`).
     * `hasPending` triggers a placeholder spinner box and matches Codex's
     * `src == null && status === "in_progress"` predicate.
     */
    const {
      generatedImages,
      pendingGeneratedImage,
      nonImageOutputs,
    } = projectGeneratedImageToolOutputs(split.toolOutputItems);
    for (const item of generatedImages) {
      collectItemRailEntries(item, segmentCwd(segment));
    }
    const visibleGeneratedImages = visibleGeneratedImagesForEndResources(generatedImages, endResources);
    const turnHasArtifacts = endResources.length > 0 || visibleGeneratedImages.length > 0 || pendingGeneratedImage;
    const galleryTurnId = generatedImageGalleryTurnId(segment, visibleGeneratedImages, split.assistantItem);
    const turnIdForActions = galleryTurnId;
    const shouldRenderStaticTurnDiff = Boolean(
      split.unifiedDiffItem
        && turnStatus !== "in_progress"
        && !hasBlockingRequest(split)
        && conversationDetailLevel !== "STEPS_PROSE",
    ) && !endResourcesCoverEditedFiles({
      resources: endResources,
      items: segment,
      cwd: segmentCwd(segment),
    });
    const endResourcesUnit = endResources.length > 0
      ? assistantEndResourcesRenderUnit({
          key: `end-resources:${split.assistantItem?.id ?? galleryTurnId}`,
          resources: endResources,
          cwd: segmentCwd(segment),
          turnId: galleryTurnId,
        })
      : null;
    const assistantAfter: AssistantAfterRenderUnit[] = [];
    if (visibleGeneratedImages.length > 0 || pendingGeneratedImage) {
      const galleryUnit: GeneratedImageGalleryRenderUnit = {
        kind: "generatedImageGallery",
        key: `gallery:${galleryTurnId}`,
        images: visibleGeneratedImages,
        hasPending: pendingGeneratedImage,
        turnId: galleryTurnId,
      };
      if (split.assistantItem) {
        assistantAfter.push(galleryUnit);
      } else {
        flushActivity();
        units.push(galleryUnit);
      }
    }
    if (split.assistantItem && endResourcesUnit) {
      assistantAfter.push(endResourcesUnit);
    }
    if (split.assistantItem && turnStatus !== "in_progress") {
      const reviewComments = extractAssistantReviewComments(
        assistantText ?? "",
        segmentCwd(segment),
      ).comments;
      if (reviewComments.length > 0) {
        assistantAfter.push({
          kind: "assistantReviewComments",
          key: `review-comments:${split.assistantItem.id}`,
          comments: reviewComments,
        });
      }
    }
    if (split.assistantItem && shouldRenderStaticTurnDiff && split.unifiedDiffItem) {
      assistantAfter.push(assistantAfterEventRenderUnit(split.unifiedDiffItem));
    }
    if (split.assistantItem) {
      pushConversationItem(split.assistantItem, {
        assistantArtifacts,
        assistantAfter,
        hasArtifacts: turnHasArtifacts,
      });
    }
    for (const item of nonImageOutputs) pushConversationItem(item);
    for (const item of split.postAssistantItems) pushConversationItem(item);
    for (const item of split.mcpServerElicitationItems) pushConversationItem(item);
    if (split.proposedPlanItem) {
      flushActivity();
      units.push(threadItemRenderUnit(split.proposedPlanItem, {
        hasArtifacts: turnHasArtifacts,
        turnId: turnIdForActions,
      }));
    }
    if (shouldRenderDesktopThinkingPlaceholder(split, turnStatus)) {
      pushConversationItem(desktopThinkingPlaceholderItem(segment, split));
    }
    if (
      split.unifiedDiffItem
      && !split.assistantItem
      && shouldRenderStaticTurnDiff
    ) {
      pushConversationItem(split.unifiedDiffItem);
    }
    for (const item of split.remoteTaskCreatedItems) pushConversationItem(item);
    for (const item of split.personalityChangedItems) pushConversationItem(item);
    for (const item of split.forkedFromConversationItems) pushConversationItem(item);
    if (!split.assistantItem && endResourcesUnit) {
      flushActivity();
      units.push(endResourcesUnit);
    }
  }

  flushActivity({ isCurrentToolActivity: options.isThreadRunning === true });

  const projectedUnits = withStreamingAssistantState(
    groupConsecutiveDynamicToolCalls(units, { keepLatestLiveActivityInGroup: options.isThreadRunning === true }),
    options.isThreadRunning === true,
  );
  demoteNonFinalUnknownAssistantPhases(projectedUnits);
  return {
    units: projectedUnits,
    artifacts: Array.from(artifacts.values()),
    backgroundAgents: projectBackgroundAgentRailEntries(items),
    backgroundTerminals: projectBackgroundTerminalRailEntries(items),
    sources: orderedSourcesLikeDesktop(sources),
  };
}

/*
 * Fail-safe for assistant `phase` labels.
 *
 * Codex's backend marks every mid-turn progress message `commentary` and only
 * the final answer `final_answer`, so the copy/fork/timestamp chrome
 * (`shouldRenderAssistantMessageChrome`) AND the turn-collapse final-answer
 * detector (`isFinalAssistantUnit`) both gate on `phase !== "commentary"`.
 * Local / third-party models behind the OpenAI-compatible gateway frequently
 * OMIT the label (phase = "unknown"), which made mid-turn progress messages
 * (a) wrongly show the copy button and (b) get treated as a turn boundary,
 * visually splitting one turn into several.
 *
 * Resolution: per turn, keep only the LAST assistant message as the final
 * answer; demote every earlier `unknown` (or unlabeled) assistant message to
 * `commentary`. Models that label correctly (GPT-5) are unaffected — their
 * mid-turn messages are already `commentary` and their final is `final_answer`.
 */
function demoteNonFinalUnknownAssistantPhases(units: ConversationRenderUnit[]): void {
  const seenFinalForTurn = new Set<string>();
  for (let i = units.length - 1; i >= 0; i -= 1) {
    const unit = units[i];
    if (unit.kind !== "message" || unit.role !== "assistant") continue;
    const turnKey = assistantUnitTurnKey(unit);
    if (!seenFinalForTurn.has(turnKey)) {
      // First assistant message seen scanning backwards within this turn =
      // the turn's final answer; leave its phase untouched.
      seenFinalForTurn.add(turnKey);
      continue;
    }
    if (unit.assistantPhase === undefined || unit.assistantPhase === "unknown") {
      unit.assistantPhase = "commentary";
    }
  }
}

function assistantUnitTurnKey(unit: ConversationRenderUnit): string {
  if (unit.kind === "message") {
    const raw = (unit.item as Record<string, unknown>)._turnId;
    if (typeof raw === "string" && raw.length > 0) return raw;
  }
  return "(no-turn)";
}

function withMcpAppResourceUris(items: ThreadItem[], mcpServerStatuses: unknown): ThreadItem[] {
  if (!mcpServerStatuses) return items;
  let changed = false;
  const next = items.map((item) => {
    if (itemType(item) !== "mcp-tool-call" || mcpAppResourceUri(item)) return item;
    const resourceUri = mcpAppResourceUriFromServerStatuses(
      mcpServerStatuses,
      mcpServerName(item),
      mcpToolName(item),
    );
    if (!resourceUri) return item;
    changed = true;
    return { ...item, mcpAppResourceUri: resourceUri };
  });
  return changed ? next : items;
}

export interface DesktopTurnSplit {
  userItems: ThreadItem[];
  agentItems: ThreadItem[];
  automationUpdateItems: ThreadItem[];
  assistantItem: ThreadItem | null;
  toolOutputItems: ThreadItem[];
  postAssistantItems: ThreadItem[];
  systemEventItem: ThreadItem | null;
  unifiedDiffItem: ThreadItem | null;
  remoteTaskCreatedItems: ThreadItem[];
  personalityChangedItems: ThreadItem[];
  forkedFromConversationItems: ThreadItem[];
  modelChangedItems: ThreadItem[];
  modelReroutedItems: ThreadItem[];
  todoListItem: ThreadItem | null;
  proposedPlanItem: ThreadItem | null;
  planImplementationItem: ThreadItem | null;
  mcpServerElicitationItems: ThreadItem[];
  permissionRequestItems: ThreadItem[];
  approvalItem: ThreadItem | null;
  userInputItem: ThreadItem | null;
}

export function splitTurnItems(items: ThreadItem[], turnStatus: string = "completed"): DesktopTurnSplit {
  let approvalItem: ThreadItem | null = null;
  let userInputItem: ThreadItem | null = null;
  const userItems: ThreadItem[] = [];
  let assistantItem: ThreadItem | null = null;
  let todoListItem: ThreadItem | null = null;
  let proposedPlanItem: ThreadItem | null = null;
  let planImplementationItem: ThreadItem | null = null;
  const mcpServerElicitationItems: ThreadItem[] = [];
  const permissionRequestItems: ThreadItem[] = [];
  const blockedMcpServers = new Set<string>();
  const agentItems: ThreadItem[] = [];
  const automationUpdateItems: ThreadItem[] = [];
  const toolOutputItems: ThreadItem[] = [];
  const postAssistantItems: ThreadItem[] = [];
  const remoteTaskCreatedItems: ThreadItem[] = [];
  const personalityChangedItems: ThreadItem[] = [];
  const forkedFromConversationItems: ThreadItem[] = [];
  const modelChangedItems: ThreadItem[] = [];
  const modelReroutedItems: ThreadItem[] = [];
  let hasTurnStarted = false;
  let unifiedDiffItem: ThreadItem | null = null;

  for (const item of items) {
    const type = itemType(item);
    if (type === "hook") continue;
    if (type === "user-message" && hasHeartbeatTrigger(item)) {
      userItems.push(item);
      continue;
    }
    if (!hasTurnStarted && type === "user-message") {
      userItems.push(item);
      continue;
    }

    hasTurnStarted = true;

    if (type === "turn-diff") {
      unifiedDiffItem = item;
      continue;
    }
    if (type === "todo-list") {
      todoListItem = item;
      continue;
    }
    // The protocol's standalone plan item is wire type `plan` (v2 ThreadItem
    // `{ type: "plan", id, text }`); `proposed-plan` is the legacy/local fixture
    // alias. Both render through PlanSummaryCard (thread-item-view.tsx:57/70,
    // buildUnits:252) — route both into the dedicated plan slot here too, or a
    // real `plan` item falls through to the generic agent bucket and never
    // shows as a plan card in the desktop layout.
    if (type === "proposed-plan" || type === "plan") {
      proposedPlanItem = item;
      continue;
    }
    if (type === "remote-task-created") {
      remoteTaskCreatedItems.push(item);
      continue;
    }
    if (type === "personality-changed") {
      personalityChangedItems.push(item);
      continue;
    }
    if (type === "forked-from-conversation") {
      forkedFromConversationItems.push(item);
      continue;
    }
    if (type === "model-changed") {
      modelChangedItems.push(item);
      continue;
    }
    if (type === "model-rerouted") {
      modelReroutedItems.push(item);
      continue;
    }
    if (type === "plan-implementation") {
      planImplementationItem = item;
      continue;
    }
    if (type === "mcp-server-elicitation") {
      if (isCompletedRecord(item)) continue;
      const server = mcpElicitationServer(item);
      if (server) blockedMcpServers.add(server);
      mcpServerElicitationItems.push(item);
      continue;
    }
    if (type === "permission-request") {
      permissionRequestItems.push(item);
      continue;
    }
    if (isApprovalRequestBackedTool(item)) {
      approvalItem = item;
      continue;
    }
    if ((type === "userInput" || type === "user-input") && !isCompletedRecord(item)) {
      userInputItem = item;
      continue;
    }
    if (type === "user-message") {
      agentItems.push(item);
      continue;
    }
    if (type === "generated-image" || type === "imageGeneration") {
      toolOutputItems.push(item);
      continue;
    }
    if (forgeImageToolOutputUrl(item)) {
      toolOutputItems.push(item);
      continue;
    }
    if (type === "automation-update") {
      automationUpdateItems.push(item);
      continue;
    }
    if (type === "auto-review-interruption-warning") {
      postAssistantItems.push(item);
      continue;
    }
    if (isDesktopAgentRenderableItem(item)) {
      agentItems.push(item);
    }
  }

  const trailingApprovalReviewItems = takeTrailingAutomaticApprovalReviewItems(agentItems);
  const filteredAgentItems = agentItems.filter((item) =>
    itemType(item) !== "mcp-tool-call"
    || isCompletedRecord(item)
    || !blockedMcpServers.has(mcpServerName(item))
  );
  const finalAgentItem = filteredAgentItems[filteredAgentItems.length - 1];
  const finalAssistantCandidate = finalAgentItem && isAssistantMessage(finalAgentItem) ? finalAgentItem : null;
  const finalAssistantItem = finalAssistantCandidate;
  const finalAssistantHasContent = finalAssistantItem ? hasAssistantOutput(finalAssistantItem) : false;

  if (finalAssistantItem) {
    filteredAgentItems.pop();
    postAssistantItems.push(...trailingApprovalReviewItems);
  } else {
    filteredAgentItems.push(...trailingApprovalReviewItems);
  }

  let renderAgentItems = turnStatus === "in_progress"
    ? moveWorkedForItemsAfterRunningAgentOutput(filteredAgentItems)
    : filteredAgentItems;
  const lastAgentItem = renderAgentItems[renderAgentItems.length - 1];
  const systemEventItem = turnStatus !== "in_progress" && !finalAssistantHasContent && isSystemErrorItem(lastAgentItem)
    ? lastAgentItem ?? null
    : null;
  if (systemEventItem) {
    renderAgentItems = renderAgentItems.slice(0, -1);
  }

  // codex: split-items-into-render-groups-*.js — when a completed
  // assistant message closes the turn, trailing `automation-update` items do
  // not render as standalone transcript rows. Desktop clones the assistant
  // item with the trailing `automationCitations`, and the assistant-message
  // renderer later decides whether those citations fit inline or need the
  // fallback row.
  assistantItem = finalAssistantItem && isCompletedRecord(finalAssistantItem) && automationUpdateItems.length > 0
    ? { ...finalAssistantItem, automationCitations: automationUpdateItems }
    : finalAssistantItem;

  return {
    userItems,
    agentItems: renderAgentItems,
    automationUpdateItems: finalAssistantItem == null ? automationUpdateItems : [],
    assistantItem,
    toolOutputItems,
    postAssistantItems,
    systemEventItem,
    unifiedDiffItem,
    remoteTaskCreatedItems,
    personalityChangedItems,
    forkedFromConversationItems,
    modelChangedItems,
    modelReroutedItems,
    todoListItem,
    proposedPlanItem,
    planImplementationItem,
    mcpServerElicitationItems,
    permissionRequestItems,
    approvalItem,
    userInputItem,
  };
}

function moveWorkedForItemsAfterRunningAgentOutput(items: ThreadItem[]): ThreadItem[] {
  const workedForItems: ThreadItem[] = [];
  const otherItems: ThreadItem[] = [];
  let needsMove = false;

  for (const item of items) {
    if (itemType(item) === "worked-for") {
      workedForItems.push(item);
      continue;
    }
    if (workedForItems.length > 0) {
      needsMove = true;
    }
    otherItems.push(item);
  }

  return needsMove ? [...otherItems, ...workedForItems] : items;
}

function shouldSkipConversationItem(item: ThreadItem): boolean {
  const type = itemType(item);
  if (type === "hook") return true;
  if (type === "plan-implementation") return true;
  if (type === "sleep") return true;
  if (type === "permission-request") return true;
  if (type === "userInput" || type === "user-input") return true;
  if (type === "model-rerouted") return !isHighRiskCyberActivityModelReroute(item);
  if (type !== "multi-agent-action") return false;
  const record = item as ItemRecord;
  return record.tool === "wait" || record.action === "wait";
}

function isHighRiskCyberActivityModelReroute(item: ThreadItem): boolean {
  const record = item as ItemRecord;
  return record.reason === "highRiskCyberActivity";
}

function shouldRenderDesktopThinkingPlaceholder(
  split: DesktopTurnSplit,
  turnStatus: string,
): boolean {
  /*
   * codex: local-conversation-thread-*.js + split-items-into-render-groups-*.js
   * — the live "Thinking" placeholder is shown when the turn is in progress AND
   * nothing else (exploring/planning/blocking request/active web search/
   * assistant with output / running non-reasoning agent step) is already
   * telling the user the model is busy.
   *
   * In particular, Codex's render-group splitter treats
   * "any non-exploring agent item in progress" as false when the last agent
   * item is an in-progress reasoning event. Reasoning items are folded into the
   * exploration buffer or dropped — they never count as "an agent item in
   * progress" that should suppress the thinking row. Without this carve-out,
   * Forge's
   * `event-unit.tsx` (real reasoning units return `null`) would
   * leave the entire process area visually empty while the model is reasoning.
   */
  if (turnStatus !== "in_progress") return false;
  if (hasBlockingRequest(split)) return false;
  if (split.proposedPlanItem && isItemInProgress(split.proposedPlanItem)) return false;
  if (split.assistantItem && hasAssistantOutput(split.assistantItem)) return false;
  return !split.agentItems.some((item) =>
    itemType(item) !== "reasoning" && isItemInProgress(item),
  );
}

function hasBlockingRequest(split: DesktopTurnSplit): boolean {
  return Boolean(
    split.approvalItem
    || split.userInputItem
    || split.mcpServerElicitationItems.some((item) => !isCompletedRecord(item))
    || split.permissionRequestItems.some((item) => !isCompletedRecord(item)),
  );
}

function orderedSourcesLikeDesktop(sources: Map<string, RailEntry>): RailEntry[] {
  const entries = Array.from(sources.values());
  // CODEX-REF: local-conversation-thread-Bf38rCmF.pretty.js Z_/ky —
  // Sources render tool entries first, followed by URL-level web page sources.
  // The generic "Web search" fallback is used only when no URL source exists.
  const toolSources = entries.filter((entry) => !isWebSearchSource(entry)).reverse();
  const webPages = entries.filter((entry) => entry.id.startsWith("web-page:")).reverse();
  const webSearch = entries.find((entry) => entry.id === "webSearch");
  return [...toolSources, ...(webPages.length > 0 ? webPages : webSearch ? [webSearch] : [])];
}

function isWebSearchSource(entry: RailEntry): boolean {
  return entry.id === "webSearch" || entry.id.startsWith("web-page:");
}

function desktopThinkingPlaceholderItem(segment: ThreadItem[], split: DesktopTurnSplit): ThreadItem {
  const anchor = split.userItems[split.userItems.length - 1] ?? segment[0];
  const turnId = segment.map((item) => (item as ItemRecord)._turnId).find((id): id is string =>
    typeof id === "string" && id.length > 0
  ) ?? null;
  const anchorId = anchor?.id || turnId || "active-turn";
  return {
    id: `thinking-placeholder:${anchorId}`,
    type: "reasoning",
    status: "inProgress",
    completed: false,
    ...(turnId ? { _turnId: turnId } : {}),
    _syntheticKind: "thinking-placeholder",
  };
}

function shouldKeepSingleActivityAsThreadItem(
  items: ThreadItem[],
  context: { conversationDetailLevel: "STEPS_COMMANDS" | "STEPS_PROSE"; isCurrentToolActivity: boolean },
): boolean {
  if (items.length !== 1) return false;
  const item = items[0];
  if (!item) return false;
  const type = itemType(item);
  if (type === "automatic-approval-review") return true;
  if (type === "mcp-tool-call") return true;
  return (
    type === "exec"
    && context.conversationDetailLevel !== "STEPS_PROSE"
    && context.isCurrentToolActivity !== true
  );
}

function shouldRenderStandaloneThreadItem(item: ThreadItem): boolean {
  const type = itemType(item);
  return type === "dynamic-tool-call" || type === "automatic-approval-review";
}

function threadItemRenderUnit(
  item: ThreadItem,
  options: { hasArtifacts?: boolean; turnId?: string | null } = {},
): Extract<ConversationRenderUnit, { kind: "threadItem" }> {
  return {
    kind: "threadItem",
    key: threadItemRenderKey(item),
    item,
    ...(options.hasArtifacts ? { hasArtifacts: true } : {}),
    ...(options.turnId ? { turnId: options.turnId } : {}),
  };
}

function assistantAfterEventRenderUnit(item: ThreadItem): Extract<AssistantAfterRenderUnit, { kind: "assistantAfterEvent" }> {
  return {
    kind: "assistantAfterEvent",
    key: item.id,
    item,
    label: eventLabel(item),
    text: eventText(item),
    details: eventDetails(item),
    tone: eventTone(item),
    format: eventFormat(item),
  };
}

function assistantEndResourcesRenderUnit({
  key,
  resources,
  cwd,
  turnId,
}: {
  key: string;
  resources: AssistantEndResourcesRenderUnit["resources"];
  cwd: string | null;
  turnId: string | null;
}): AssistantEndResourcesRenderUnit {
  return {
    kind: "assistantEndResources",
    key,
    resources,
    cwd,
    turnId,
  };
}

function segmentCwd(segment: ThreadItem[]): string | null {
  for (const item of segment) {
    const cwd = trimmedStringField(item, "cwd");
    if (cwd) return cwd;
    const params = recordField(item, "params");
    const paramsCwd = trimmedStringField(params, "cwd");
    if (paramsCwd) return paramsCwd;
  }
  return null;
}

// NOT lib/format.stringField: this variant trims — renamed so the two
// behaviors can't be conflated under one grep-able name.
function trimmedStringField(value: unknown, key: string): string {
  if (!value || typeof value !== "object") return "";
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "string" ? raw.trim() : "";
}

function recordField(value: unknown, key: string): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const raw = (value as Record<string, unknown>)[key];
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : null;
}

function threadItemRenderKey(item: ThreadItem): string {
  const type = itemType(item);
  const id = typeof item.id === "string" && item.id.length > 0
    ? item.id
    : typeof (item as Record<string, unknown>).requestId === "string" && String((item as Record<string, unknown>).requestId).length > 0
      ? String((item as Record<string, unknown>).requestId)
    : typeof (item as Record<string, unknown>).callId === "string" && String((item as Record<string, unknown>).callId).length > 0
      ? String((item as Record<string, unknown>).callId)
      : "unknown";
  return `item:${type}:${id}`;
}

function workedForIdsWithTrailingAssistant(items: ThreadItem[]): Set<string> {
  const ids = new Set<string>();
  for (const segment of conversationSegments(items)) {
    const finalAssistantIndex = findLastIndex(segment, isAssistantMessage);
    if (finalAssistantIndex < 0) continue;
    for (let index = 0; index < finalAssistantIndex; index += 1) {
      const item = segment[index];
      if (item && itemType(item) === "worked-for") ids.add(item.id);
    }
  }
  return ids;
}

function conversationSegments(items: ThreadItem[]): ThreadItem[][] {
  const segments: ThreadItem[][] = [];
  let current: ThreadItem[] = [];
  for (const item of items) {
    if (isUserMessage(item) && !hasHeartbeatTrigger(item) && current.length > 0) {
      segments.push(current);
      current = [];
    }
    current.push(item);
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

function turnStatusForSegment(
  segment: ThreadItem[],
  options: { isLastSegment: boolean; isThreadRunning: boolean },
): string {
  if (options.isLastSegment && options.isThreadRunning) return "in_progress";
  for (const item of segment) {
    const status = (item as ItemRecord)._turnStatus;
    if (typeof status === "string" && status.length > 0) return status;
  }
  return "completed";
}

function isCompletedTurnStatus(status: string): boolean {
  return status === "complete" || status === "completed";
}

function isDesktopAgentRenderableItem(item: ThreadItem): boolean {
  const type = itemType(item);
  if (type === "web-search") {
    const record = item as ItemRecord;
    return stringValue(record.query).trim().length > 0 || Boolean(record.action);
  }
  return [
    "assistant-message",
    "exec",
    "patch",
    "dynamic-tool-call",
    "mcp-tool-call",
    "automatic-approval-review",
    "multi-agent-action",
    "stream-error",
    "system-error",
    "context-compaction",
    "reasoning",
    "steered",
    "user-input-response",
    "worked-for",
  ].includes(type);
}

function hasHeartbeatTrigger(item: ThreadItem): boolean {
  return (item as ItemRecord).heartbeatTrigger != null;
}

function isApprovalRequestBackedTool(item: ThreadItem): boolean {
  const record = item as ItemRecord;
  if (record.approvalRequestId == null && record.approval_request_id == null) return false;
  const type = itemType(item);
  if (type === "patch") return record.success == null && !isCompletedRecord(item);
  if (type !== "exec") return false;
  const output = record.output && typeof record.output === "object" ? record.output as Record<string, unknown> : null;
  return record.exitCode == null && output?.exitCode == null && !isCompletedRecord(item);
}

function takeTrailingAutomaticApprovalReviewItems(items: ThreadItem[]): ThreadItem[] {
  const trailing: ThreadItem[] = [];
  for (;;) {
    const item = items[items.length - 1];
    if (!item || itemType(item) !== "automatic-approval-review") break;
    items.pop();
    trailing.unshift(item);
  }
  return trailing;
}

function hasAssistantOutput(item: ThreadItem): boolean {
  const record = item as ItemRecord;
  return assistantMessageText(item).trim().length > 0 || record.structuredOutput != null || record.structured_output != null;
}

function isSystemErrorItem(item: ThreadItem | undefined): item is ThreadItem {
  return Boolean(item) && itemType(item as ThreadItem) === "system-error";
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index] as T)) return index;
  }
  return -1;
}

function shouldRenderAssistantPlaceholder(item: ThreadItem): boolean {
  const record = item as ItemRecord;
  return record.renderPlaceholderWhileStreaming === true && record.completed !== true;
}

function isUserMessage(item: ThreadItem): boolean {
  return itemType(item) === "user-message";
}

function isAssistantMessage(item: ThreadItem): boolean {
  return itemType(item) === "assistant-message";
}
