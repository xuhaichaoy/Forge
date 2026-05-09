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
    };

export type EventTone = "info" | "warning" | "error";
export type EventFormat = "text" | "markdown" | "diff";

export interface ToolActivitySummary {
  groupType: ToolActivityGroupType;
  icon: ToolActivityIcon;
  label: string;
  activeDetail: string | null;
  defaultExpanded?: boolean;
  details: string[];
  inProgress: boolean;
  totalDurationMs: number | null;
  counts: {
    commands: number;
    exploredFiles: number;
    searches: number;
    lists: number;
    fileChanges: number;
    createdFiles: number;
    editedFiles: number;
    deletedFiles: number;
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
  reference?: RailEntryReference;
  action?: RailEntryAction;
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
  | { kind: "diff" };

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
      chipKind: "mention" | "skill";
      label: string;
      path: string;
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
  sources: RailEntry[];
}

export interface ConversationProjectionOptions {
  isThreadRunning?: boolean;
  conversationDetailLevel?: ConversationDetailLevel;
  progressPlan?: {
    id?: string | null;
    plan: unknown[];
  } | null;
}

export type ConversationDetailLevel = "STEPS_COMMANDS" | "STEPS_PROSE";
export type ItemRecord = ThreadItem & Record<string, unknown>;
