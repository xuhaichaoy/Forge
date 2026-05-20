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
   * Codex `sT` portal (codex-local-conversation-thread.pretty.js :8003-8012)
   * + `in-progress-fixed-content` slot (:8339): while a turn is in progress
   * and the runtime has a live unified-diff stream, Codex renders the diff
   * via `createPortal` into a fixed-position container above the rest of the
   * process region. HiCodex has no portal infrastructure, so we approximate
   * by rendering the diff as a distinct render unit at the top of the
   * in-progress turn's agent stream.
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
      chipKind: "mention" | "skill" | "file";
      label: string;
      path: string;
      /**
       * Filename extension (lowercase, no leading dot) for chipKind === "file".
       * Renderer uses it to pick a file-type icon (Word/Excel/PDF/etc).
       */
      fileExtension?: string;
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
   * Live in-progress unified-diff stream from `turn/diff/updated` events
   * (codex-reducer.ts `turn/diff/updated` handler). Mirrors Codex's `sT` portal
   * input (codex-local-conversation-thread.pretty.js :8003). When non-empty
   * and the thread is running, the projection emits an `inProgressDiff`
   * render unit above the in-progress turn's agent stream.
   */
  turnDiff?: string;
}

export type ConversationDetailLevel = "STEPS_COMMANDS" | "STEPS_PROSE";
export type ItemRecord = ThreadItem & Record<string, unknown>;
