export type AccumulatedThreadItem = {
  id: string;
  type: string;
} & Record<string, unknown>;

export type ThreadItem = AccumulatedThreadItem;

export type ConversationRenderUnit =
  | {
      kind: "message";
      key: string;
      role: "user" | "assistant";
      item: ThreadItem;
      text: string;
      userContent?: UserMessageContentPart[];
      artifacts?: RailEntry[];
      assistantPhase?: AssistantMessagePhase;
      isStreaming?: boolean;
      renderPlaceholder?: boolean;
    }
  | {
      kind: "toolActivity";
      key: string;
      items: ThreadItem[];
      summary: ToolActivitySummary;
    }
  | {
      kind: "event";
      key: string;
      item: ThreadItem;
      label: string;
      text: string;
      tone?: EventTone;
      format?: EventFormat;
    }
  | {
      kind: "threadItem";
      key: string;
      item: ThreadItem;
    }
  /*
   * Codex Desktop `JC` gallery (local-conversation-thread-BX7YNcUw.js byte
   * ~506222) groups ALL generated-image items in a turn into a single
   * horizontal carousel of thumbnails — rather than one giant card per
   * image. HiCodex previously routed each `generated-image` to a separate
   * markdown ToolBlock, producing a stack of full-width image cards. This
   * unit captures the per-turn collected set so the renderer can emit
   * Codex's `<JC images={Ut} conversationId={n}/>` layout.
   *
   * - `images`: Codex `Ut = visibleCompletedGeneratedImages` — every item
   *   passing the `Hw(e.src != null)` filter, post `zC` PPTX exclusion.
   * - `hasPending`: Codex `$e = oe.some(Vw)` — at least one image is still
   *   `status === "in_progress"` with no `src`. Drives the 24×24
   *   placeholder spinner box rendered below the carousel.
   * - The container only mounts when `Wt = images.length > 0 || hasPending`
   *   (Codex `shouldRenderGeneratedImageOutputs`). Empty unit is suppressed
   *   in the project layer so the renderer doesn't need to re-check.
   */
  | {
      kind: "generatedImageGallery";
      key: string;
      images: ThreadItem[];
      hasPending: boolean;
      turnId: string | null;
    }
  /*
   * Live unified-diff stream for a running turn. HiCodex renders it as a
   * distinct unit at the top of the in-progress turn's agent stream.
   */
  | {
      kind: "inProgressDiff";
      key: string;
      diff: string;
      /**
       * `_turnId` of the surrounding turn segment so `groupUnitsByTurn`
       * (turn-collapse.tsx:72) keeps the live-diff card inside the same
       * TurnCollapseFrame as the user message it belongs to. Synthetic
       * (no source item) — populated by `injectInProgressDiffUnit`
       * (project-conversation.ts) when it splices the unit in.
       */
      turnId: string | null;
    };

export type EventTone = "info" | "warning" | "error";
export type EventFormat = "text" | "markdown" | "diff";

export interface ToolActivityLabelParts {
  action: string;
  detail: string;
}

export interface ToolActivitySummary {
  groupType: ToolActivityGroupType;
  icon: ToolActivityIcon;
  label: string;
  /**
   * Codex Desktop `<action>Ran</action> <detail>{command}</detail>` i18n template
   * (local-conversation-thread-*.js `wg.commandRanWithDetail` :3766; renderers `O_`/`D_` :4207-4211
   * — `action` muted via `text-token-foreground/40`, `detail` normal). Present only for single-item
   * collapsed-tool-activity exec rows where we want two-tone rendering.
   */
  labelParts?: ToolActivityLabelParts;
  activeDetail: string | null;
  activeDiffStats?: {
    linesAdded: number;
    linesRemoved: number;
  } | null;
  defaultExpanded?: boolean;
  details: string[];
  inProgress: boolean;
  totalDurationMs: number | null;
    counts: {
    commands: number;
    runningCommands?: number;
    webSearchCommands: number;
    runningWebSearchCommands: number;
    runningFolderCreationCommands: number;
    exploredFiles: number;
    searches: number;
    lists: number;
    fileChanges: number;
    createdFiles: number;
    runningCreatedFiles?: number;
    stoppedCreatedFiles?: number;
    runningCreatedLineCount?: number;
    editedFiles: number;
    runningEditedFiles?: number;
    deletedFiles: number;
    runningDeletedFiles?: number;
    mcpCalls: number;
    dynamicCalls: number;
    webSearches: number;
    reasoning: number;
    plans: number;
    other: number;
    /* Approval review counts used by the worked-for aggregate rows. */
    approvedRequests?: number;
    deniedRequests?: number;
  };
}

export type ToolActivityIcon =
  | "activity"
  | "clock"
  | "edit"
  | "mcp"
  | "plan"
  | "reasoning"
  | "search"
  | "terminal"
  | "web-search";

export type ToolActivityGroupType =
  | "collapsed-tool-activity"
  | "exploration"
  | "pending-mcp-tool-calls"
  | "worked-for"
  | "reasoning"
  | "todo-list"
  | "web-search-group"
  | "multi-agent-group";

export interface RailEntry {
  id: string;
  title: string;
  meta?: string;
  status?: string;
  details?: string[];
  diffStats?: RailDiffStats;
  reference?: RailEntryReference;
  action?: RailEntryAction;
  /**
   * Tool source logo URLs（Sources panel 专用）。
   * rail-projection.ts 在 collectRailEntries 时按 mcpServerName 查 app 注册表填充。
   * 渲染层（right-rail SourceLogo）加载失败时回退到 Network icon。
   */
  logoUrl?: string | null;
  logoUrlDark?: string | null;
}

export interface RailDiffStats {
  linesAdded: number;
  linesRemoved: number;
}

export interface RailEntryReference {
  path: string;
  lineStart: number;
  lineEnd?: number;
}

export type RailEntryAction =
  | { kind: "file"; reference: RailEntryReference }
  | { kind: "url"; url: string }
  | { kind: "source"; itemId: string }
  | { kind: "diff" }
  | { kind: "thread"; threadId: string; displayName?: string | null; model?: string | null; role?: string | null };

export type UserMessageContentPart =
  | {
      kind: "text";
      text: string;
      textElements: UserMessageTextElement[];
    }
  | {
      kind: "image";
      source: "url" | "local";
      src: string;
      label: string;
    }
  | {
      kind: "chip";
      /**
       * UI-only chip category. Protocol payloads still serialize skills and
       * non-file mentions as UserInput.Skill / UserInput.Mention { name, path }.
       */
      chipKind: "mention" | "skill" | "app" | "plugin" | "agent" | "file";
      label: string;
      path: string;
      /**
       * Filename extension (lowercase, no leading dot) for chipKind === "file".
       * Renderer uses it to pick a file-type icon (Word/Excel/PDF/etc).
       */
      fileExtension?: string;
      /** Optional registry metadata for the current UI render. */
      iconSmall?: string | null;
      brandColor?: string | null;
      displayName?: string | null;
    };

export interface UserMessageTextElement {
  start: number;
  end: number;
  placeholder: string | null;
}

export type AssistantMessagePhase = "commentary" | "final_answer" | "unknown";

export interface ConversationProjection {
  units: ConversationRenderUnit[];
  progress: RailEntry[];
  artifacts: RailEntry[];
  backgroundAgents: RailEntry[];
  backgroundTerminals: RailEntry[];
  sources: RailEntry[];
}

export interface ConversationProjectionOptions {
  isThreadRunning?: boolean;
  conversationDetailLevel?: ConversationDetailLevel;
  mcpServerStatuses?: unknown;
  progressPlan?: {
    id?: string | null;
    plan: unknown[];
  } | null;
  /**
   * Live in-progress unified-diff stream from `turn/diff/updated` events.
   * When non-empty and the thread is running, the projection emits an
   * `inProgressDiff` render unit above the in-progress turn's agent stream.
   */
  turnDiff?: string;
  /**
   * App registry data (from `app/list` RPC). Used to look up logoUrl/logoUrlDark
   * for MCP tool sources. Matching mirrors Codex Desktop's server/tool/function
   * alias heuristic from `split-items-into-render-groups-*`.
   */
  appRegistry?: AppRegistryEntry[] | null;
}

/**
 * App 注册表条目（用于 MCP source logo 查询）。
 * 字段对应协议层 `app/list` 响应（packages/codex-protocol/src/generated/v2/AppInfo.ts）。
 *
 * AppInfo supplies `pluginDisplayNames`, so HiCodex can reproduce Desktop's
 * name/id/plugin alias matching without inventing a protocol-only tool table.
 */
export interface AppRegistryEntry {
  id: string;
  name?: string | null;
  pluginDisplayNames?: string[];
  logoUrl?: string | null;
  logoUrlDark?: string | null;
}

export type ConversationDetailLevel = "STEPS_COMMANDS" | "STEPS_PROSE";
export type ItemRecord = ThreadItem & Record<string, unknown>;
