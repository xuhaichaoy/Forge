// Pure type layer for the Codex UI reducer, extracted verbatim from
// codex-reducer.ts. Type-only consumers (collaboration-modes,
// notification-invalidation, thread-settings-projection, thread-workflow)
// import the contracts from here instead of from the reducer implementation —
// that import-type back-edge is what used to close the codex-reducer-centric
// dependency cycles. codex-reducer.ts re-exports everything in this module,
// so all existing importers keep working unchanged.
import type {
  CollaborationMode,
  JsonRpcNotification,
  JsonRpcRequest,
  ModelConfig,
  RequestId,
  Thread,
  ThreadGoal,
  UserInput,
} from "@forge/codex-protocol";
import type { TurnEnvironmentParams } from "@forge/codex-protocol/generated/v2/TurnEnvironmentParams";
import type { HostStatus } from "../lib/tauri-host";
import type { AccountState } from "./account-state";
import type { ComposerAttachment, ComposerMode } from "./composer-workflow";
import type { McpServerStartupStatus } from "./mcp-skills-management";
import type { AccumulatedThreadItem } from "./render-group-types";
import type {
  ThreadTokenSpeedSnapshot,
  ThreadTokenSpeedTracker,
  ThreadTokenUsageSnapshot,
} from "./thread-token-usage";

export interface PendingServerRequest {
  id: RequestId;
  method: string;
  params?: unknown;
  createdAt: number;
}

export interface LogLine {
  id: string;
  // codex toast-signal-CTz_x1Qc.js exposes info/success/warning/danger; Forge maps
  // warn≈warning and error≈danger, and adds `success` (the previously-missing green level).
  level: "info" | "warn" | "error" | "success";
  text: string;
  /*
   * Structured origin tag ("module/event", e.g. "team-model-gateway/provider-updated")
   * set by the emitting dispatch point. The toast viewport keys its mute table on this
   * tag (app-toast-viewport.tsx INTERNAL_LOG_SOURCES) instead of matching the
   * user-facing `text`, so copy stays free to migrate/localize. Optional: untagged
   * entries fall back to the viewport's text patterns.
   */
  source?: string;
  at: number;
}

export interface ThreadContextDefaults {
  model?: string;
  modelProvider?: string;
  serviceTier?: unknown;
  approvalPolicy?: unknown;
  approvalsReviewer?: unknown;
  sandbox?: unknown;
  // codex Jd/Qd/$d: a sandbox policy whose details deviate from the named-mode
  // defaults (read-only with network, or workspace-write with network /
  // exclude_slash_tmp / exclude_tmpdir_env_var) resolves to the `custom`
  // permission mode. The collapsed `sandbox` string can't carry these, so we
  // flag it here from the structured policy.
  sandboxIsNonDefault?: boolean;
  permissions?: string;
  environments?: TurnEnvironmentParams[];
  baseInstructions?: string;
  developerInstructions?: string;
  personality?: "none" | "friendly" | "pragmatic";
  reasoningEffort?: unknown;
  reasoningSummary?: unknown;
  memories?: ThreadMemoryPreferences;
}

export interface ThreadMemoryPreferences {
  useMemories: boolean;
  generateMemories: boolean;
}

export interface TurnPlanSnapshot {
  threadId: string;
  turnId: string | null;
  explanation: string | null;
  plan: unknown[];
  updatedAt: number;
}

export interface TerminalTurnSnapshot {
  turnId: string | null;
  status: "completed" | "failed" | "interrupted";
}

export interface PendingSteerCompareKey {
  imageCount: number;
  rawText: string;
}

export interface PendingSteerRuntime {
  attachments: ComposerAttachment[];
  clientUserMessageId: string;
  compareKey: PendingSteerCompareKey;
  context?: unknown;
  cwd: string;
  createdAt: number;
  id: string;
  mode?: ComposerMode;
  optimisticLocalId: string;
  responsesapiClientMetadata?: unknown;
  text: string;
  turnId: string;
}

export interface ThreadRuntimeSlice {
  activeTurnId: string | null;
  items: AccumulatedThreadItem[];
  /**
   * Ordered list of turn ids. Mirrors the per-turn `turn.items` model used by
   * Codex Desktop; new items are placed inside their turn segment.
   */
  turnOrder: string[];
  /**
   * FIFO queue of optimistic local turn ids. The head is bound to the real
   * `turnId` reported by the next `turn/started` notification on that thread.
   */
  pendingOptimisticTurns: string[];
  latestCollaborationMode: CollaborationMode | null;
  turnPlan: TurnPlanSnapshot | null;
  turnDiff: string;
  // codex: app-server-manager-signals-*.js — `turn/diff/updated` carries a
  // `turnId` and Codex stores the diff *on that turn* (`e.diff = t` inside
  // `updateTurnState(i, e, ...)`). The runtime keeps a flat string, so pair it
  // with the owning turn id so finishTurn can apply the ES priority
  // `e.diff ?? lS(patchBatches)` only to the matching turn.
  turnDiffTurnId: string | null;
  composerMode: ComposerMode | null;
  threadGoal: ThreadGoal | null;
  threadGoalTurnId: string | null;
  hookRunsByTurn?: Record<string, unknown[]>;
  terminalTurnIds: string[];
  latestTerminalTurn?: TerminalTurnSnapshot | null;
  pendingSteers?: PendingSteerRuntime[];
  // codex: local-conversation-thread-*.js — populated by the
  // `thread/tokenUsage/updated` notification; absent until the server emits
  // the first counter for this thread. Optional so older fixtures that do
  // not need the footer continue to type-check.
  tokenUsage?: ThreadTokenUsageSnapshot | null;
  tokenSpeed?: ThreadTokenSpeedSnapshot | null;
  tokenSpeedTracker?: ThreadTokenSpeedTracker | null;
  /**
   * The (model, modelProvider) the runtime reported for this thread on the
   * last thread/start / thread/resume response. The Thread protocol type only
   * carries modelProvider, so this is the client's only per-thread record of
   * the model actually in use — the model picker checkmark and the composer
   * model chip read it for active chats.
   */
  resolvedModel?: { model: string | null; modelProvider: string | null } | null;
}

export interface NotificationInvalidationState {
  appList: number;
  appListMessage: string;
  skills: number;
  hooks: number;
  mcpStatus: number;
  mcpStatusMessage: string;
  accountRefresh: number;
  authRefresh: number;
}

export interface CodexUiState {
  connected: boolean;
  connecting: boolean;
  hostStatus: HostStatus | null;
  threads: Thread[];
  activeThreadId: string | null;
  threadsRuntime: Record<string, ThreadRuntimeSlice>;
  terminalInputBuffers?: Record<string, string>;
  composerMode: ComposerMode;
  pendingRequests: PendingServerRequest[];
  logs: LogLine[];
  models: ModelConfig[];
  threadContextDefaults: ThreadContextDefaults | null;
  mcpServerStartupStatuses: Record<string, McpServerStartupStatus>;
  // Notification-driven invalidation counters: a notification of the given
  // method bumps the counter so panels re-fetch. Folded out of ForgeApp's
  // ad-hoc nonce useStates so features decouple from the onNotification closure.
  invalidation: NotificationInvalidationState;
  // Account/auth projection (signed-in account + rate limits). Folded out of
  // ForgeApp's accountState useState so notification-driven account updates
  // run in the reducer (via the pure applyAccountNotification) instead of an
  // ad-hoc shadow reducer inside the onNotification closure.
  account: AccountState;
  // codex: electron-menu-shortcuts-*.js#navigateBack/Forward —
  // in-app thread history stack (browser-style back/forward over the
  // sequence of activated threads). See `./thread-history.ts`.
  threadHistoryStack: string[];
  threadHistoryIndex: number;
}

export type CodexUiAction =
  | { type: "connecting"; value: boolean }
  | { type: "connected"; value: boolean }
  | { type: "invalidateAppList"; message: string }
  | { type: "setAccount"; account: AccountState }
  | { type: "invalidateAuth" }
  | { type: "hostStatus"; status: HostStatus }
  | { type: "setThreads"; threads: Thread[] }
  | { type: "upsertThread"; thread: Thread; select?: boolean; replaceSnapshot?: boolean }
  | { type: "renameThread"; threadId: string; name: string }
  | { type: "setActiveThread"; threadId: string | null }
  | { type: "removeThread"; threadId: string }
  | { type: "markThreadsNeedResumeAfterReconnect" }
  | { type: "setLatestCollaborationMode"; threadId: string; collaborationMode: CollaborationMode | null }
  | { type: "setActiveComposerMode"; mode: ComposerMode }
  | { type: "resetThreadComposerMode"; threadId: string }
  | { type: "notification"; message: JsonRpcNotification }
  | { type: "serverRequest"; request: JsonRpcRequest }
  | { type: "resolveServerRequest"; id: RequestId }
  | { type: "log"; text: string; level?: "info" | "warn" | "error" | "success"; source?: string }
  | { type: "setModels"; models: ModelConfig[] }
  | { type: "upsertModel"; model: ModelConfig }
  | { type: "setThreadContextDefaults"; context: ThreadContextDefaults | null }
  | { type: "setThreadResolvedModel"; threadId: string; model: string | null; modelProvider: string | null }
  | {
      type: "optimisticUserMessage";
      threadId: string;
      localTurnId: string;
      localId: string;
      content: UserInput[];
      cwd?: string | null;
    }
  | { type: "bindOptimisticTurn"; threadId: string; localTurnId: string; turnId: string }
  | { type: "dropOptimisticUserMessage"; threadId: string; localId: string }
  | { type: "registerPendingSteer"; threadId: string; pending: PendingSteerRuntime }
  | { type: "dropPendingSteer"; threadId: string; clientUserMessageId: string }
  // codex: electron-menu-shortcuts-*.js#navigateBack/Forward —
  // dispatched by the ported menu commands (CmdOrCtrl+[ / CmdOrCtrl+]).
  | { type: "navigateBackInHistory" }
  | { type: "navigateForwardInHistory" };

// The lone value export in this otherwise type-only module: thread-workflow
// consumes this constant at runtime and everything else it needs from the
// reducer is a type, so hosting it on this leaf module keeps thread-workflow
// (and with it the render-groups projection chain) out of the reducer cycle.
export const OPTIMISTIC_TURN_PLACEHOLDER_PREFIX = "optimistic-turn:";
