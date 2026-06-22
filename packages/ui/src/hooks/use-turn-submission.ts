import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { CollaborationModeMask, Thread, ThreadGoalSetResponse, UserInput } from "@forge/codex-protocol";
import { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { useForgeIntl } from "../components/i18n-provider";
import { useServices } from "../components/services-context";
import { formatError } from "../lib/format";
import {
  acquireQueuedFollowUpSendLock,
  createProjectlessThreadCwd,
  isTauriRuntime,
  listenGlobalStateChanges,
  readGlobalState,
  readImageDataUrl,
  releaseQueuedFollowUpSendLock,
  writeQueuedFollowUpsForThread,
} from "../lib/tauri-host";
import {
  CROSS_ACCOUNT_PROVIDER_SWITCH_MESSAGE,
  PROVIDER_SWITCH_FAILED_MESSAGE,
  isCrossAccountProviderSwitch,
} from "../model/model-provider-switch";
import type { ThreadContextDefaults } from "../state/codex-reducer";
import type { PendingSteerRuntime, TerminalTurnSnapshot, ThreadRuntimeSlice } from "../state/codex-ui-types";
// Module-level i18n singleton — these provider-switch errors are built in
// module-scope helpers that cannot reach the useForgeIntl() hook formatter
// (aliased: the hook body destructures its own `formatMessage`).
import { formatMessage as formatGlobalMessage } from "../state/i18n";
import {
  buildUserInputFromComposer,
  composerHasImageAttachments,
  type ComposerAttachment,
  type ComposerMode,
  type ComposerSendOptions,
  type ComposerSubmitState,
} from "../state/composer-workflow";
import {
  INTERRUPTED_STEER_PAUSED_REASON,
  QUEUED_FOLLOW_UPS_GLOBAL_STATE_KEY,
  createQueuedFollowUp,
  isQueuedFollowUpDuplicate,
  normalizeQueuedFollowUpsByThread,
  pauseQueuedFollowUpsWithReason,
  reorderQueuedFollowUps,
  removeQueuedFollowUp,
  resumeQueuedFollowUpsWithReason,
  updateQueuedFollowUpStatus,
  updateQueuedFollowUpsByThread,
  type QueuedFollowUp,
  type QueuedFollowUpsByThread,
} from "../state/queued-followups";
import {
  PLAN_MODE_UNAVAILABLE_MESSAGE,
  completedTurnAllowsQueuedFollowUpAutoDrain,
  composerModeRequiresUnavailablePlanMode,
  interruptedTerminalTurnKey,
  pendingSteerCompareKeyFromUserInput,
  pendingSteerRestorePausedReason,
  runtimeHasAcceptedSteer,
  selectNextQueuedFollowUpDrainCandidate,
  shouldResetCreatedThreadComposerMode,
  shouldPauseQueuedFollowUpsForInterruptedTerminalTurn,
  shouldPromptPausedQueueSubmit,
  shouldQueueComposerFollowUp,
  shouldSteerQueuedFollowUp,
  turnStartOptionsFromComposerMode,
} from "../state/turn-submission";
import {
  createAndSelectThreadForTurn,
  dispatchOptimisticUserMessage,
  dropOptimisticUserMessage,
  ensureThreadReadyForTurn,
  assertThreadProviderSwitchApplied,
  isProjectlessWorkspace,
  isThreadProviderSwitchMismatchError,
  type ThreadProviderSwitchMismatchError,
  isThreadNotFound,
  isThreadStatusNotLoaded,
  isThreadNeedsResume,
  projectlessThreadInstructions,
  readThread,
  refreshThreadMetadata,
  resumeThread,
  resumeSelectedThreadAndStartTurn,
  startTurn,
  dispatchThreadContextDefaultsFromRuntimeResponse,
  withWorkspaceDeveloperInstructions,
  type OptimisticUserMessageHandle,
  type ThreadWorkflowDispatch,
  type TurnStartOptions,
} from "../state/thread-workflow";
import { isThreadStatusInProgress } from "../state/thread-item-fields";

export type PausedQueueSubmitDecision = "clearQueue" | "sendMessage" | "cancel";

export interface UseTurnSubmissionInput {
  activeModelSupportsImageInput: boolean;
  activePendingRequestCount: number;
  activeThread: Thread | null;
  activeThreadGoal: boolean;
  activeThreadId: string | null;
  activeLatestTerminalTurn: TerminalTurnSnapshot | null;
  activeThreadRunning: boolean;
  activeTurnId: string | null;
  composerGoalMode: boolean;
  setComposerGoalMode: (on: boolean) => void;
  collaborationModes: CollaborationModeMask[];
  collaborationModesForComposerMode: (mode: ComposerMode) => Promise<CollaborationModeMask[]>;
  composerAttachments: ComposerAttachment[];
  composerMode: ComposerMode;
  composerSubmitState: ComposerSubmitState;
  ensureConnected: () => Promise<boolean>;
  includeImageDynamicTool: boolean;
  input: string;
  onRequestGoalReplace?: (objective: string) => void;
  onRequestPausedQueueSubmit?: (queuedMessageCount: number) => Promise<PausedQueueSubmitDecision>;
  rememberLatestCollaborationMode: (threadId: string, options: TurnStartOptions | null | undefined) => void;
  restartRuntimeForProviderSwitch?: () => Promise<boolean>;
  resetComposerSelectionAfterCreatedThread: (threadId: string) => void;
  setActiveComposerMode: (mode: ComposerMode) => void;
  setComposerAttachments: Dispatch<SetStateAction<ComposerAttachment[]>>;
  setInput: Dispatch<SetStateAction<string>>;
  threadContextDefaults: ThreadContextDefaults | null;
  threads: Thread[];
  threadsRuntime: Record<string, ThreadRuntimeSlice>;
  workspace: string;
}

export interface UseTurnSubmissionResult {
  activeQueuedFollowUps: QueuedFollowUp[];
  activeQueuedFollowUpsInterrupted: boolean;
  deleteQueuedFollowUp: (message: QueuedFollowUp) => void;
  editQueuedFollowUp: (message: QueuedFollowUp) => void;
  pauseActiveQueuedFollowUps: () => void;
  reorderQueuedFollowUp: (activeId: string, overId: string) => void;
  resumeInterruptedQueuedFollowUps: () => void;
  sendQueuedFollowUpNow: (message: QueuedFollowUp) => void;
  sendTurn: (options?: ComposerSendOptions) => Promise<void>;
  startingConversation: boolean;
}

interface PendingQueuedFollowUpTransform {
  threadId: string;
  previousQueue: QueuedFollowUp[];
  transform: (state: QueuedFollowUpsByThread) => QueuedFollowUpsByThread;
}

class CrossAccountProviderSwitchError extends Error {
  constructor() {
    super(formatGlobalMessage(CROSS_ACCOUNT_PROVIDER_SWITCH_MESSAGE));
    this.name = "CrossAccountProviderSwitchError";
  }
}

function isCrossAccountProviderSwitchError(error: unknown): error is CrossAccountProviderSwitchError {
  return error instanceof CrossAccountProviderSwitchError;
}

function assertSupportedProviderSwitch(
  activeThread: Thread | null | undefined,
  context?: ThreadContextDefaults | null,
): void {
  if (isCrossAccountProviderSwitch(activeThread?.modelProvider, context?.modelProvider)) {
    throw new CrossAccountProviderSwitchError();
  }
}

function userFacingProviderSwitchError(error: ThreadProviderSwitchMismatchError): Error {
  if (isCrossAccountProviderSwitch(error.actualProvider, error.expectedProvider)) {
    return new CrossAccountProviderSwitchError();
  }
  return new Error(formatGlobalMessage(PROVIDER_SWITCH_FAILED_MESSAGE));
}

async function assertActualThreadProviderForSubmission(
  client: CodexJsonRpcClient,
  threadId: string | null,
  context?: ThreadContextDefaults | null,
): Promise<void> {
  const expectedProvider = context?.modelProvider?.trim() ?? "";
  if (!threadId || !expectedProvider) return;
  const result = await readThread(client, threadId, false);
  if (!result.thread) return;
  assertThreadProviderSwitchApplied(threadId, { thread: result.thread }, context);
}

export function useTurnSubmission({
  activeModelSupportsImageInput,
  activePendingRequestCount,
  activeThread,
  activeThreadGoal,
  activeThreadId,
  activeLatestTerminalTurn,
  activeThreadRunning,
  activeTurnId,
  composerGoalMode,
  setComposerGoalMode,
  collaborationModes,
  collaborationModesForComposerMode,
  composerAttachments,
  composerMode,
  composerSubmitState,
  ensureConnected,
  includeImageDynamicTool,
  input,
  onRequestGoalReplace,
  onRequestPausedQueueSubmit,
  rememberLatestCollaborationMode,
  restartRuntimeForProviderSwitch,
  resetComposerSelectionAfterCreatedThread,
  setActiveComposerMode,
  setComposerAttachments,
  setInput,
  threadContextDefaults,
  threads,
  threadsRuntime,
  workspace,
}: UseTurnSubmissionInput): UseTurnSubmissionResult {
  const { client, dispatch } = useServices();
  const { formatMessage } = useForgeIntl();
  const hostQueuedFollowUpsEnabled = isTauriRuntime();
  const [queuedFollowUpsByThread, setQueuedFollowUpsByThread] = useState<QueuedFollowUpsByThread>({});
  const [interruptedQueueThreadIds, setInterruptedQueueThreadIds] = useState<Set<string>>(() => new Set());
  const [startingConversation, setStartingConversation] = useState(false);
  const sendingQueuedFollowUpId = useRef<string | null>(null);
  const handledInterruptedTerminalTurnKeysRef = useRef<Set<string>>(new Set());
  const queuedFollowUpsLoadedRef = useRef(!hostQueuedFollowUpsEnabled);
  const queuedFollowUpsSnapshotRef = useRef<QueuedFollowUpsByThread>({});
  const queuedFollowUpsEventBeforeLoadRef = useRef(false);
  const pendingQueuedFollowUpTransformsRef = useRef<PendingQueuedFollowUpTransform[]>([]);
  const latestInputRef = useRef(input);
  const latestComposerAttachmentsRef = useRef(composerAttachments);
  const threadsById = useMemo(() => new Map(threads.map((thread) => [thread.id, thread])), [threads]);
  const activeQueuedFollowUps = activeThreadId ? queuedFollowUpsByThread[activeThreadId] ?? [] : [];
  const activeQueuePausedByTerminalTurn = shouldPauseQueuedFollowUpsForInterruptedTerminalTurn({
    activeThreadId,
    handledInterruptedTerminalTurnKeys: handledInterruptedTerminalTurnKeysRef.current,
    latestTerminalTurn: activeLatestTerminalTurn,
    queuedFollowUpCount: activeQueuedFollowUps.length,
  });
  const activeQueuedFollowUpsInterrupted = Boolean(
    activeThreadId
      && activeQueuedFollowUps.length > 0
      && (interruptedQueueThreadIds.has(activeThreadId) || activeQueuePausedByTerminalTurn),
  );

  useEffect(() => {
    latestInputRef.current = input;
  }, [input]);

  useEffect(() => {
    latestComposerAttachmentsRef.current = composerAttachments;
  }, [composerAttachments]);

  const persistQueuedFollowUpsForThread = useCallback((
    threadId: string,
    previousQueue: QueuedFollowUp[],
    nextQueue: QueuedFollowUp[],
  ) => {
    if (!hostQueuedFollowUpsEnabled) return;
    void writeQueuedFollowUpsForThread({
      threadId,
      previousIds: previousQueue.map((message) => message.id),
      queue: nextQueue,
    }).catch((error) => {
      dispatch({
        type: "log",
        text: `Failed to save queued follow-ups for ${threadId}: ${formatError(error)}`,
        level: "warn",
      });
    });
  }, [dispatch, hostQueuedFollowUpsEnabled]);

  useEffect(() => {
    if (!hostQueuedFollowUpsEnabled) return undefined;
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    void readGlobalState(QUEUED_FOLLOW_UPS_GLOBAL_STATE_KEY)
      .then((value) => {
        if (cancelled) return;
        const normalized = normalizeQueuedFollowUpsByThread(value);
        const pendingTransforms = pendingQueuedFollowUpTransformsRef.current;
        const base = queuedFollowUpsEventBeforeLoadRef.current
          ? queuedFollowUpsBaseBeforePendingTransforms(queuedFollowUpsSnapshotRef.current, pendingTransforms)
          : normalized;
        const next = pendingTransforms.reduce((state, pending) => pending.transform(state), base);
        pendingQueuedFollowUpTransformsRef.current = [];
        queuedFollowUpsEventBeforeLoadRef.current = false;
        queuedFollowUpsLoadedRef.current = true;
        queuedFollowUpsSnapshotRef.current = next;
        setQueuedFollowUpsByThread(next);
        persistPendingQueuedFollowUpTransforms(base, next, pendingTransforms, persistQueuedFollowUpsForThread);
      })
      .catch((error) => {
        if (cancelled) return;
        const pendingTransforms = pendingQueuedFollowUpTransformsRef.current;
        pendingQueuedFollowUpTransformsRef.current = [];
        queuedFollowUpsEventBeforeLoadRef.current = false;
        queuedFollowUpsLoadedRef.current = true;
        const base = queuedFollowUpsBaseBeforePendingTransforms(
          queuedFollowUpsSnapshotRef.current,
          pendingTransforms,
        );
        const next = pendingTransforms.reduce((state, pending) => pending.transform(state), base);
        queuedFollowUpsSnapshotRef.current = next;
        setQueuedFollowUpsByThread(next);
        persistPendingQueuedFollowUpTransforms(base, next, pendingTransforms, persistQueuedFollowUpsForThread);
        dispatch({
          type: "log",
          text: `Failed to read queued follow-ups: ${formatError(error)}`,
          level: "warn",
        });
      });
    void listenGlobalStateChanges((event) => {
      if (event.key !== QUEUED_FOLLOW_UPS_GLOBAL_STATE_KEY) return;
      const normalized = normalizeQueuedFollowUpsByThread(event.value);
      if (!queuedFollowUpsLoadedRef.current) queuedFollowUpsEventBeforeLoadRef.current = true;
      queuedFollowUpsSnapshotRef.current = normalized;
      setQueuedFollowUpsByThread(normalized);
    })
      .then((stopListening) => {
        if (cancelled) {
          stopListening();
          return;
        }
        unlisten = stopListening;
      })
      .catch((error) => {
        dispatch({
          type: "log",
          text: `Failed to watch queued follow-ups: ${formatError(error)}`,
          level: "warn",
        });
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [dispatch, hostQueuedFollowUpsEnabled, persistQueuedFollowUpsForThread]);

  const ensureThreadReadyForSubmission = useCallback(async (
    input: Parameters<typeof ensureThreadReadyForTurn>[0],
  ) => {
    assertSupportedProviderSwitch(input.activeThread, input.context);
    try {
      const ready = await ensureThreadReadyForTurn(input);
      await assertActualThreadProviderForSubmission(input.client, ready.threadId, input.context);
      return ready;
    } catch (error) {
      if (isThreadProviderSwitchMismatchError(error)
        && isCrossAccountProviderSwitch(error.actualProvider, error.expectedProvider)) {
        throw userFacingProviderSwitchError(error);
      }
      if (!isThreadProviderSwitchMismatchError(error) || !restartRuntimeForProviderSwitch) {
        throw error;
      }
      if (!(await restartRuntimeForProviderSwitch())) {
        throw new Error(formatGlobalMessage(PROVIDER_SWITCH_FAILED_MESSAGE));
      }
      try {
        const result = await resumeThread(input.client, error.threadId, input.workspace, input.context);
        assertThreadProviderSwitchApplied(error.threadId, result, input.context);
        await assertActualThreadProviderForSubmission(input.client, result.thread.id, input.context);
        input.dispatch({ type: "upsertThread", thread: result.thread, select: input.select ?? true });
        // Guarded shared helper: a resume response missing all context fields
        // yields null, which must NOT wipe the global defaults.
        if (input.select ?? true) dispatchThreadContextDefaultsFromRuntimeResponse(input.dispatch, result, input.context);
        return {
          threadId: result.thread.id,
          source: "resumed" as const,
        };
      } catch (retryError) {
        if (isThreadProviderSwitchMismatchError(retryError)) {
          throw userFacingProviderSwitchError(retryError);
        }
        throw retryError;
      }
    }
  }, [restartRuntimeForProviderSwitch]);

  const updateQueuedFollowUps = useCallback((
    threadId: string,
    updater: (queue: QueuedFollowUp[]) => QueuedFollowUp[],
  ) => {
    const transform = (state: QueuedFollowUpsByThread) => updateQueuedFollowUpsByThread(state, threadId, updater);
    if (hostQueuedFollowUpsEnabled) {
      const base = queuedFollowUpsSnapshotRef.current;
      const previousQueue = base[threadId] ?? [];
      const next = transform(base);
      const nextQueue = next[threadId] ?? [];
      queuedFollowUpsSnapshotRef.current = next;
      if (!queuedFollowUpsLoadedRef.current) {
        pendingQueuedFollowUpTransformsRef.current = [
          ...pendingQueuedFollowUpTransformsRef.current,
          { threadId, previousQueue, transform },
        ];
      } else {
        persistQueuedFollowUpsForThread(threadId, previousQueue, nextQueue);
      }
      setQueuedFollowUpsByThread(next);
      return;
    }
    setQueuedFollowUpsByThread((current) => transform(current));
  }, [hostQueuedFollowUpsEnabled, persistQueuedFollowUpsForThread]);

  useEffect(() => {
    for (const [threadId, runtime] of Object.entries(threadsRuntime)) {
      const pendingSteers = runtime.pendingSteers ?? [];
      if (pendingSteers.length === 0) continue;
      for (const pending of pendingSteers) {
        if (runtimeHasAcceptedSteer(runtime, pending.clientUserMessageId, pending.compareKey, pending.turnId)) {
          dispatch({
            type: "dropPendingSteer",
            threadId,
            clientUserMessageId: pending.clientUserMessageId,
          });
          continue;
        }
        const pausedReason = pendingSteerRestorePausedReason({
          clientUserMessageId: pending.clientUserMessageId,
          compareKey: pending.compareKey,
          runtime,
          turnId: pending.turnId,
        });
        if (!pausedReason) continue;
        dispatch({
          type: "dropOptimisticUserMessage",
          threadId,
          localId: pending.optimisticLocalId,
        });
        dispatch({
          type: "dropPendingSteer",
          threadId,
          clientUserMessageId: pending.clientUserMessageId,
        });
        const restored = {
          ...createQueuedFollowUp({
            text: pending.text,
            attachments: pending.attachments,
            cwd: pending.cwd,
            ...(pending.context !== undefined ? { context: pending.context } : {}),
            createdAt: pending.createdAt,
            id: pending.id,
            ...(pending.mode ? { mode: pending.mode } : {}),
            ...(pending.responsesapiClientMetadata === undefined
              ? {}
              : { responsesapiClientMetadata: pending.responsesapiClientMetadata }),
          }),
          pausedReason,
        };
        updateQueuedFollowUps(threadId, (queue) => {
          if (queue.some((message) => message.id === restored.id)) return queue;
          return [restored, ...queue];
        });
        if (pausedReason === INTERRUPTED_STEER_PAUSED_REASON) {
          setInterruptedQueueThreadIds((current) => {
            if (current.has(threadId)) return current;
            const next = new Set(current);
            next.add(threadId);
            return next;
          });
        }
      }
    }
  }, [dispatch, threadsRuntime, updateQueuedFollowUps]);

  useEffect(() => {
    setInterruptedQueueThreadIds((current) => {
      let changed = false;
      const next = new Set<string>();
      for (const threadId of current) {
        if ((queuedFollowUpsByThread[threadId]?.length ?? 0) > 0) {
          next.add(threadId);
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [queuedFollowUpsByThread]);

  useEffect(() => {
    const key = interruptedTerminalTurnKey(activeThreadId, activeLatestTerminalTurn);
    if (!key || handledInterruptedTerminalTurnKeysRef.current.has(key)) return;
    handledInterruptedTerminalTurnKeysRef.current.add(key);
    if (!activeThreadId || activeQueuedFollowUps.length === 0) return;
    updateQueuedFollowUps(activeThreadId, (queue) =>
      pauseQueuedFollowUpsWithReason(queue, INTERRUPTED_STEER_PAUSED_REASON),
    );
    setInterruptedQueueThreadIds((current) => {
      if (current.has(activeThreadId)) return current;
      const next = new Set(current);
      next.add(activeThreadId);
      return next;
    });
  }, [activeLatestTerminalTurn, activeQueuedFollowUps.length, activeThreadId, updateQueuedFollowUps]);

  const pauseActiveQueuedFollowUps = useCallback(() => {
    if (!activeThreadId || activeQueuedFollowUps.length === 0) return;
    updateQueuedFollowUps(activeThreadId, (queue) =>
      pauseQueuedFollowUpsWithReason(queue, INTERRUPTED_STEER_PAUSED_REASON),
    );
    setInterruptedQueueThreadIds((current) => {
      if (current.has(activeThreadId)) return current;
      const next = new Set(current);
      next.add(activeThreadId);
      return next;
    });
  }, [activeQueuedFollowUps.length, activeThreadId, updateQueuedFollowUps]);

  const resumeInterruptedQueuedFollowUps = useCallback(() => {
    if (!activeThreadId) return;
    updateQueuedFollowUps(activeThreadId, (queue) =>
      resumeQueuedFollowUpsWithReason(queue, INTERRUPTED_STEER_PAUSED_REASON),
    );
    setInterruptedQueueThreadIds((current) => {
      if (!current.has(activeThreadId)) return current;
      const next = new Set(current);
      next.delete(activeThreadId);
      return next;
    });
  }, [activeThreadId, updateQueuedFollowUps]);

  const sendQueuedFollowUp = useCallback(async (threadId: string, message: QueuedFollowUp) => {
    // Single-flight across the whole queue (not just per-id): the drain effect
    // re-fires on queue state changes and manual "send now" can race the
    // in-flight send before its turn/start lands.
    if (sendingQueuedFollowUpId.current !== null) return;
    sendingQueuedFollowUpId.current = message.id;
    const hostLock = hostQueuedFollowUpsEnabled
      ? {
          conversationId: threadId,
          messageId: message.id,
          lockId: createQueuedFollowUpSendLockId(),
        }
      : null;
    let hostLockAcquired = false;
    let sent = false;
    try {
      if (hostLock) {
        hostLockAcquired = await acquireQueuedFollowUpSendLock(hostLock);
        if (!hostLockAcquired) return;
      }
      if (!(await ensureConnected())) {
        updateQueuedFollowUps(threadId, (queue) =>
          updateQueuedFollowUpStatus(queue, message.id, "paused", "Runtime is offline"),
        );
        return;
      }
      if (composerHasImageAttachments(message.attachments) && !activeModelSupportsImageInput) {
        const reason = "Remove images or switch models to send this message";
        updateQueuedFollowUps(threadId, (queue) => updateQueuedFollowUpStatus(queue, message.id, "paused", reason));
        dispatch({ type: "log", text: reason, level: "warn" });
        return;
      }
      const messageContext = queuedFollowUpContext(message, threadContextDefaults);
      const sendAttachments = await attachmentsWithDataImagePreviews(message.attachments);
      const content = buildUserInputFromComposer(message.text, sendAttachments);
      if (content.length === 0) {
        updateQueuedFollowUps(threadId, (queue) => removeQueuedFollowUp(queue, message.id));
        return;
      }
      const steerTurnId = shouldSteerQueuedFollowUp({ activeThreadId, activeThreadRunning, activeTurnId, threadId })
        ? activeTurnId
        : null;
      if (steerTurnId) {
        await steerTurnWithOptimistic({
          client,
          content,
          dispatch,
          restore: {
            text: message.text,
            attachments: message.attachments,
            ...(message.context !== undefined ? { context: message.context } : {}),
            cwd: message.cwd,
            createdAt: message.createdAt,
            id: message.id,
            ...(message.mode ? { mode: message.mode } : {}),
            ...(message.responsesapiClientMetadata === undefined
              ? {}
              : { responsesapiClientMetadata: message.responsesapiClientMetadata }),
          },
          threadId,
          turnId: steerTurnId,
        });
        sent = true;
      } else {
        let optimistic: OptimisticUserMessageHandle | null = null;
        const messageMode = message.mode ?? "default";
        const modes = await collaborationModesForComposerMode(messageMode);
        const turnStartOptions = turnStartOptionsFromComposerMode(messageMode, modes, messageContext);
        if (composerModeRequiresUnavailablePlanMode(messageMode, turnStartOptions)) {
          updateQueuedFollowUps(threadId, (queue) =>
            updateQueuedFollowUpStatus(queue, message.id, "paused", PLAN_MODE_UNAVAILABLE_MESSAGE),
          );
          dispatch({ type: "log", text: PLAN_MODE_UNAVAILABLE_MESSAGE, level: "warn" });
          return;
        }
        try {
          const shouldSelectTargetThread = threadId === activeThreadId;
          const targetThread = shouldSelectTargetThread ? activeThread : threadsById.get(threadId) ?? null;
          const readyThread = await ensureThreadReadyForSubmission({
            client,
            activeThread: targetThread,
            activeThreadId: threadId,
            input: content,
            workspace: message.cwd,
            dispatch,
            context: messageContext,
            select: shouldSelectTargetThread,
          });
          const targetThreadId = readyThread.threadId;
          if (!targetThreadId) throw new Error("No active Codex thread");
          optimistic = dispatchOptimisticUserMessage(dispatch, targetThreadId, content);
          await startTurn(client, targetThreadId, content, message.cwd, messageContext, turnStartOptions);
          rememberLatestCollaborationMode(targetThreadId, turnStartOptions);
          sent = true;
        } catch (error) {
          if (!isThreadNotFound(error) && !isThreadNeedsResume(error)) {
            dropOptimisticUserMessage(dispatch, optimistic);
            throw error;
          }
          if (!(await resumeSelectedThreadAndStartTurn(
            client,
            threadId,
            content,
            message.cwd,
            dispatch,
            messageContext,
            turnStartOptions,
            { select: threadId === activeThreadId },
          ))) {
            dropOptimisticUserMessage(dispatch, optimistic);
            throw error;
          }
          rememberLatestCollaborationMode(threadId, turnStartOptions);
          sent = true;
        }
      }
      updateQueuedFollowUps(threadId, (queue) => removeQueuedFollowUp(queue, message.id));
    } catch (error) {
      updateQueuedFollowUps(threadId, (queue) =>
        updateQueuedFollowUpStatus(queue, message.id, "paused", formatError(error)),
      );
      dispatch({
        type: "log",
        text: formatError(error),
        level: isCrossAccountProviderSwitchError(error) ? "warn" : "error",
      });
    } finally {
      if (hostLock && hostLockAcquired) {
        try {
          await releaseQueuedFollowUpSendLock({ ...hostLock, sent });
        } catch (error) {
          dispatch({
            type: "log",
            text: `Failed to release queued follow-up send lock: ${formatError(error)}`,
            level: "warn",
          });
        }
      }
      sendingQueuedFollowUpId.current = null;
    }
  }, [
    activeModelSupportsImageInput,
    activeThread,
    activeThreadId,
    activeThreadRunning,
    activeTurnId,
    client,
    collaborationModesForComposerMode,
    dispatch,
    ensureConnected,
    ensureThreadReadyForSubmission,
    hostQueuedFollowUpsEnabled,
    rememberLatestCollaborationMode,
    threadsById,
    threadContextDefaults,
    updateQueuedFollowUps,
  ]);

  const sendTurn = useCallback(async (options: ComposerSendOptions = {}) => {
    const draftInput = options.input ?? latestInputRef.current;
    const draftAttachments = options.attachments ?? latestComposerAttachmentsRef.current;
    const draftMode = options.mode ?? composerMode;
    const shouldClearDraft = options.input === undefined && options.attachments === undefined;
    if (composerSubmitState.disabled && !options.bypassSubmitState) {
      if (composerSubmitState.submitBlockReason !== "empty" && composerSubmitState.disabledReason) {
        dispatch({ type: "log", text: composerSubmitState.disabledReason, level: "warn" });
      }
      return;
    }
    if (composerHasImageAttachments(draftAttachments) && !activeModelSupportsImageInput) {
      dispatch({ type: "log", text: "Remove images or switch models to send this message", level: "warn" });
      return;
    }
    // codex composer goal mode: submitting while "Pursue goal" is active sets the
    // thread goal (thread/goal/set) instead of sending a turn, then turns the goal
    // toggle off. Gated on composerGoalMode (independent of plan) so default/plan
    // submits are entirely unaffected; plan mode is left untouched on purpose.
    if (composerGoalMode) {
      const objective = draftInput.trim();
      if (!objective) return;
      // codex composer.threadGoal.replaceConfirmation — replacing an existing goal
      // (only possible on an existing thread) prompts for confirmation first; the
      // host owns the dialog + the actual set.
      if (activeThreadGoal && onRequestGoalReplace) {
        if (shouldClearDraft) {
          clearComposerDraft(setInput, setComposerAttachments, latestInputRef, latestComposerAttachmentsRef);
        }
        setComposerGoalMode(false);
        onRequestGoalReplace(objective);
        return;
      }
      // Failure paths (not connected / RPC error) intentionally KEEP goal mode +
      // the typed objective so the user can retry without re-typing — only the
      // success path clears the draft and turns the goal toggle off.
      if (!(await ensureConnected())) return;
      // codex composer goal mode sets the goal on the ACTIVE thread. Forge does
      // NOT spin up a brand-new thread (and its generated projectless `new-chat`
      // working directory) just to set a goal: the app-server's thread/goal/set is
      // gated on the backend `Goals` feature, so creating a thread first would
      // strand an empty `new-chat` thread whenever that feature is disabled. Require
      // a real conversation and let the existing-thread set surface any backend error.
      if (!activeThreadId) {
        dispatch({
          type: "log",
          text: formatMessage({
            id: "composer.threadGoal.requiresThread",
            defaultMessage: "Select or start a thread before setting a goal.",
          }),
          level: "warn",
        });
        return;
      }
      try {
        const response = await client.request<ThreadGoalSetResponse>(
          "thread/goal/set",
          { threadId: activeThreadId, objective },
          120_000,
        );
        dispatch({
          type: "notification",
          message: { method: "thread/goal/updated", params: { threadId: activeThreadId, turnId: null, goal: response.goal } },
        });
        if (shouldClearDraft) {
          clearComposerDraft(setInput, setComposerAttachments, latestInputRef, latestComposerAttachmentsRef);
        }
        setComposerGoalMode(false);
      } catch (error) {
        dispatch({
          type: "log",
          text: `${formatMessage({ id: "composer.threadGoal.setError", defaultMessage: "Failed to set goal" })}: ${formatError(error)}`,
          level: "error",
        });
      }
      return;
    }
    const sendAttachments = await attachmentsWithDataImagePreviews(draftAttachments);
    const content = buildUserInputFromComposer(draftInput, sendAttachments);
    if (content.length === 0) return;
    try {
      if (!(await ensureConnected())) return;
      const shouldQueueFollowUp = shouldQueueComposerFollowUp({
        activeTurnId,
        activeThreadRunning,
        isQueueingEnabled: options.followUpSubmitAction
          ? options.followUpSubmitAction === "queue"
          : composerSubmitState.isQueueingEnabled,
        submitButtonMode: composerSubmitState.submitButtonMode,
      });
      const selectedThreadId = activeThreadId;
      if (
        shouldPromptPausedQueueSubmit({
          activeThreadId: selectedThreadId,
          queueInterrupted: activeQueuedFollowUpsInterrupted,
          queuedFollowUpCount: selectedThreadId ? queuedFollowUpsByThread[selectedThreadId]?.length ?? 0 : 0,
          shouldQueueFollowUp,
        })
      ) {
        if (!selectedThreadId) return;
        const queuedMessageCount = queuedFollowUpsByThread[selectedThreadId]?.length ?? 0;
        const decision = onRequestPausedQueueSubmit
          ? await onRequestPausedQueueSubmit(queuedMessageCount)
          : "sendMessage";
        if (decision === "cancel") return;
        if (decision === "clearQueue") {
          updateQueuedFollowUps(selectedThreadId, () => []);
        } else {
          updateQueuedFollowUps(selectedThreadId, (queue) =>
            resumeQueuedFollowUpsWithReason(queue, INTERRUPTED_STEER_PAUSED_REASON),
          );
        }
        setInterruptedQueueThreadIds((current) => {
          if (!current.has(selectedThreadId)) return current;
          const next = new Set(current);
          next.delete(selectedThreadId);
          return next;
        });
      }
      const modes = shouldQueueFollowUp
        ? collaborationModes
        : await collaborationModesForComposerMode(draftMode);
      const turnStartOptions = shouldQueueFollowUp
        ? null
        : turnStartOptionsFromComposerMode(draftMode, modes, threadContextDefaults);
      if (!shouldQueueFollowUp && composerModeRequiresUnavailablePlanMode(draftMode, turnStartOptions)) {
        dispatch({ type: "log", text: PLAN_MODE_UNAVAILABLE_MESSAGE, level: "warn" });
        return;
      }
      const creatingInitialThread = !selectedThreadId;
      // codex: a projectless thread (no real workspace) gets a generated working
      // directory under ~/Documents/Codex/<date>/<slug>/ plus a system prompt that
      // steers writes there instead of $HOME. Generate it once, then thread the
      // resulting cwd/context through both creation and the first turn.
      let turnWorkspace = workspace;
      let turnContext = threadContextDefaults;
      if (creatingInitialThread && isTauriRuntime() && isProjectlessWorkspace(workspace)) {
        try {
          const projectless = await createProjectlessThreadCwd({ prompt: draftInput });
          turnWorkspace = projectless.cwd;
          turnContext = withWorkspaceDeveloperInstructions(
            threadContextDefaults,
            projectlessThreadInstructions(projectless.cwd, projectless.outputDirectory),
          );
        } catch (error) {
          dispatch({
            type: "log",
            text: `Couldn't prepare a projectless workspace; using the default directory. ${formatError(error)}`,
            level: "warn",
          });
        }
      }
      if (creatingInitialThread) setStartingConversation(true);
      const steeringActiveTurn = Boolean(activeTurnId && activeThreadRunning);
      const readyThread = shouldQueueFollowUp && selectedThreadId
        ? { threadId: selectedThreadId, source: "selected" as const }
        : await ensureThreadReadyForSubmission({
            client,
            activeThread,
            activeThreadId: selectedThreadId,
            input: content,
            workspace: turnWorkspace,
            dispatch,
            context: steeringActiveTurn ? null : turnContext,
            threadCreationOptions: { includeDynamicTools: includeImageDynamicTool },
          });
      const threadId = readyThread.threadId;
      if (!threadId) throw new Error("No active Codex thread");
      if (shouldQueueFollowUp) {
        const existingQueue = queuedFollowUpsByThread[threadId] ?? [];
        if (isQueuedFollowUpDuplicate(existingQueue, { text: draftInput, attachments: sendAttachments })) {
          return;
        }
        if (shouldClearDraft) {
          clearComposerDraft(setInput, setComposerAttachments, latestInputRef, latestComposerAttachmentsRef);
        }
        const queued = createQueuedFollowUp({
          text: draftInput,
          attachments: sendAttachments,
          cwd: turnWorkspace,
          ...(turnContext !== undefined ? { context: turnContext } : {}),
          mode: draftMode,
        });
        updateQueuedFollowUps(threadId, (queue) => [...queue, queued]);
        return;
      }
      if (shouldClearDraft) {
        clearComposerDraft(setInput, setComposerAttachments, latestInputRef, latestComposerAttachmentsRef);
      }
      let optimistic: OptimisticUserMessageHandle | null = null;
      try {
        if (activeTurnId && activeThreadRunning) {
          await steerTurnWithOptimistic({
            client,
            content,
            dispatch,
            restore: {
              text: draftInput,
              attachments: sendAttachments,
              ...(turnContext !== undefined ? { context: turnContext } : {}),
              cwd: turnWorkspace,
              ...(draftMode ? { mode: draftMode } : {}),
            },
            threadId,
            turnId: activeTurnId,
          });
        } else {
          optimistic = dispatchOptimisticUserMessage(dispatch, threadId, content);
          await startTurn(client, threadId, content, turnWorkspace, turnContext, turnStartOptions);
          await refreshThreadMetadata(client, threadId, dispatch);
          rememberLatestCollaborationMode(threadId, turnStartOptions);
          if (readyThread.source === "created" && shouldResetCreatedThreadComposerMode(draftMode)) {
            resetComposerSelectionAfterCreatedThread(threadId);
          }
        }
      } catch (error) {
        const recoverableSelectedThreadError = isThreadNotFound(error) || isThreadNeedsResume(error);
        if (!recoverableSelectedThreadError) {
          dropOptimisticUserMessage(dispatch, optimistic);
          restoreComposerDraftIfUntouched(
            setInput,
            setComposerAttachments,
            latestInputRef,
            latestComposerAttachmentsRef,
            draftInput,
            draftAttachments,
          );
          throw error;
        }
        dropOptimisticUserMessage(dispatch, optimistic);
        optimistic = null;
        if (selectedThreadId && readyThread.source !== "resumed") {
          optimistic = dispatchOptimisticUserMessage(dispatch, selectedThreadId, content);
          if (await resumeSelectedThreadAndStartTurn(
            client,
            selectedThreadId,
            content,
            workspace,
            dispatch,
            threadContextDefaults,
            turnStartOptions,
          )) {
            rememberLatestCollaborationMode(selectedThreadId, turnStartOptions);
            return;
          }
          dropOptimisticUserMessage(dispatch, optimistic);
          optimistic = null;
        }
        if (selectedThreadId) {
          dispatch({ type: "removeThread", threadId: selectedThreadId });
          restoreComposerDraftIfUntouched(
            setInput,
            setComposerAttachments,
            latestInputRef,
            latestComposerAttachmentsRef,
            draftInput,
            draftAttachments,
          );
          dispatch({
            type: "log",
            text: "Selected thread is no longer available; message was not sent to a new thread.",
            level: "warn",
          });
          return;
        }
        dispatch({ type: "removeThread", threadId });
        const nextThreadId = await createAndSelectThreadForTurn(
          client,
          turnWorkspace,
          dispatch,
          turnContext,
          { includeDynamicTools: includeImageDynamicTool },
        );
        if (!nextThreadId) throw error;
        optimistic = dispatchOptimisticUserMessage(dispatch, nextThreadId, content);
        try {
          await startTurn(client, nextThreadId, content, turnWorkspace, turnContext, turnStartOptions);
          await refreshThreadMetadata(client, nextThreadId, dispatch);
        } catch (subError) {
          dropOptimisticUserMessage(dispatch, optimistic);
          restoreComposerDraftIfUntouched(
            setInput,
            setComposerAttachments,
            latestInputRef,
            latestComposerAttachmentsRef,
            draftInput,
            draftAttachments,
          );
          throw subError;
        }
        rememberLatestCollaborationMode(nextThreadId, turnStartOptions);
        if (shouldResetCreatedThreadComposerMode(draftMode)) {
          resetComposerSelectionAfterCreatedThread(nextThreadId);
        }
      }
    } catch (error) {
      dispatch({
        type: "log",
        text: formatError(error),
        level: isCrossAccountProviderSwitchError(error) ? "warn" : "error",
      });
    } finally {
      if (!activeThreadId) setStartingConversation(false);
    }
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- 故意省略 composerGoalMode：保持既有提交闸门的重建时机不变（stale 风险已在审计中单列待裁决）
  }, [
    activeModelSupportsImageInput,
    activeQueuedFollowUpsInterrupted,
    activeThread,
    activeThreadGoal,
    activeThreadId,
    activeThreadRunning,
    activeTurnId,
    client,
    collaborationModes,
    collaborationModesForComposerMode,
    composerMode,
    composerSubmitState.disabled,
    composerSubmitState.disabledReason,
    composerSubmitState.isQueueingEnabled,
    composerSubmitState.submitBlockReason,
    composerSubmitState.submitButtonMode,
    dispatch,
    ensureConnected,
    ensureThreadReadyForSubmission,
    formatMessage,
    includeImageDynamicTool,
    onRequestGoalReplace,
    onRequestPausedQueueSubmit,
    queuedFollowUpsByThread,
    rememberLatestCollaborationMode,
    resetComposerSelectionAfterCreatedThread,
    setComposerAttachments,
    setComposerGoalMode,
    setInput,
    threadContextDefaults,
    updateQueuedFollowUps,
    workspace,
  ]);

  useEffect(() => {
    const drainThreads = Object.entries(queuedFollowUpsByThread).flatMap(([threadId, queue]) => {
      const isActiveThread = threadId === activeThreadId;
      const thread = isActiveThread ? activeThread : threadsById.get(threadId) ?? null;
      if (!thread) return [];
      const runtime = threadsRuntime[threadId] ?? null;
      const threadRunning = isActiveThread
        ? activeThreadRunning
        : Boolean(runtime?.activeTurnId) || isThreadStatusInProgress(thread.status);
      const pendingRequestCount = isActiveThread ? activePendingRequestCount : 1;
      return [{
        threadId,
        activeThreadNeedsResume: isThreadStatusNotLoaded(thread.status),
        activeThreadRunning: threadRunning,
        pendingRequestCount,
        previousCompletedTurnAllowsAutoDrain: completedTurnAllowsQueuedFollowUpAutoDrain(runtime),
        queueInterrupted: isActiveThread ? activeQueuedFollowUpsInterrupted : true,
        queue,
      }];
    });
    const candidate = selectNextQueuedFollowUpDrainCandidate(drainThreads);
    if (!candidate) return;
    void sendQueuedFollowUp(candidate.threadId, candidate.message);
  }, [
    activePendingRequestCount,
    activeQueuedFollowUpsInterrupted,
    activeThread,
    activeThreadId,
    activeThreadRunning,
    queuedFollowUpsByThread,
    sendQueuedFollowUp,
    threadsById,
    threadsRuntime,
  ]);

  const sendQueuedFollowUpNow = useCallback((message: QueuedFollowUp) => {
    if (!activeThreadId) return;
    void sendQueuedFollowUp(activeThreadId, message);
  }, [activeThreadId, sendQueuedFollowUp]);

  const editQueuedFollowUp = useCallback((message: QueuedFollowUp) => {
    if (!activeThreadId) return;
    updateQueuedFollowUps(activeThreadId, (queue) => removeQueuedFollowUp(queue, message.id));
    setInput(message.text);
    setComposerAttachments(message.attachments);
    setActiveComposerMode(message.mode ?? "default");
  }, [
    activeThreadId,
    setActiveComposerMode,
    setComposerAttachments,
    setInput,
    updateQueuedFollowUps,
  ]);

  const deleteQueuedFollowUp = useCallback((message: QueuedFollowUp) => {
    if (!activeThreadId) return;
    updateQueuedFollowUps(activeThreadId, (queue) => removeQueuedFollowUp(queue, message.id));
  }, [activeThreadId, updateQueuedFollowUps]);

  const reorderQueuedFollowUp = useCallback((activeId: string, overId: string) => {
    if (!activeThreadId) return;
    updateQueuedFollowUps(activeThreadId, (queue) => reorderQueuedFollowUps(queue, activeId, overId));
  }, [activeThreadId, updateQueuedFollowUps]);

  return {
    activeQueuedFollowUps,
    activeQueuedFollowUpsInterrupted,
    deleteQueuedFollowUp,
    editQueuedFollowUp,
    pauseActiveQueuedFollowUps,
    reorderQueuedFollowUp,
    resumeInterruptedQueuedFollowUps,
    sendQueuedFollowUpNow,
    sendTurn,
    startingConversation,
  };
}

function createQueuedFollowUpSendLockId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `queued-follow-up-lock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function persistPendingQueuedFollowUpTransforms(
  previous: QueuedFollowUpsByThread,
  next: QueuedFollowUpsByThread,
  pendingTransforms: PendingQueuedFollowUpTransform[],
  persist: (threadId: string, previousQueue: QueuedFollowUp[], nextQueue: QueuedFollowUp[]) => void,
): void {
  if (pendingTransforms.length === 0) return;
  const threadIds = Array.from(new Set(pendingTransforms.map((pending) => pending.threadId)));
  for (const threadId of threadIds) {
    persist(threadId, previous[threadId] ?? [], next[threadId] ?? []);
  }
}

function queuedFollowUpsBaseBeforePendingTransforms(
  snapshot: QueuedFollowUpsByThread,
  pendingTransforms: PendingQueuedFollowUpTransform[],
): QueuedFollowUpsByThread {
  if (pendingTransforms.length === 0) return snapshot;
  const base = { ...snapshot };
  const restoredThreadIds = new Set<string>();
  for (const pending of pendingTransforms) {
    if (restoredThreadIds.has(pending.threadId)) continue;
    restoredThreadIds.add(pending.threadId);
    if (pending.previousQueue.length === 0) {
      delete base[pending.threadId];
    } else {
      base[pending.threadId] = pending.previousQueue;
    }
  }
  return base;
}

function queuedFollowUpContext(
  message: QueuedFollowUp,
  fallback: ThreadContextDefaults | null,
): ThreadContextDefaults | null {
  return message.context === undefined ? fallback : (message.context as ThreadContextDefaults | null);
}

export async function attachmentsWithDataImagePreviews(
  attachments: ComposerAttachment[],
): Promise<ComposerAttachment[]> {
  // codex `vl`: on a local host (Forge is always local) an image that has a real disk
  // path is sent as {type:"localImage", path} — NOT inlined as base64 — so the codex
  // sidecar reads the file to both show the model the image AND expose the path to the
  // agent's tools (python/shell can then edit the real file). Mirrors Codex's
  // `if (!isRemoteHost && localPath) return { type: "localImage", path }`. The downstream
  // imageAttachmentToUserInput already maps a bare path → localImage{path}, so we just keep
  // the localImage attachments as-is here. Only on web — where there is no host to read the
  // path — do we fall back to inlining a data URL (the original behaviour).
  if (isTauriRuntime()) return attachments;
  const resolved: ComposerAttachment[] = [];
  for (const attachment of attachments) {
    if (attachment.type !== "localImage") {
      resolved.push(attachment);
      continue;
    }
    try {
      resolved.push({
        type: "image",
        url: await readImageDataUrl(attachment.path),
        name: fileNameFromPath(attachment.path),
      });
    } catch {
      resolved.push(attachment);
    }
  }
  return resolved;
}

function fileNameFromPath(path: string): string {
  const normalized = path.trim().replace(/\/+$/, "");
  return normalized.split(/[\\/]/).filter(Boolean).pop() || "image";
}

function clearComposerDraft(
  setInput: Dispatch<SetStateAction<string>>,
  setComposerAttachments: Dispatch<SetStateAction<ComposerAttachment[]>>,
  latestInputRef: { current: string },
  latestComposerAttachmentsRef: { current: ComposerAttachment[] },
): void {
  latestInputRef.current = "";
  latestComposerAttachmentsRef.current = [];
  setInput("");
  setComposerAttachments([]);
}

function restoreComposerDraftIfUntouched(
  setInput: Dispatch<SetStateAction<string>>,
  setComposerAttachments: Dispatch<SetStateAction<ComposerAttachment[]>>,
  latestInputRef: { current: string },
  latestComposerAttachmentsRef: { current: ComposerAttachment[] },
  input: string,
  attachments: ComposerAttachment[],
): void {
  if (latestInputRef.current.length > 0 || latestComposerAttachmentsRef.current.length > 0) return;
  latestInputRef.current = input;
  latestComposerAttachmentsRef.current = attachments;
  setInput(input);
  setComposerAttachments(attachments);
}

async function steerTurnWithOptimistic(input: {
  client: CodexJsonRpcClient;
  content: UserInput[];
  dispatch: ThreadWorkflowDispatch;
  restore: {
    attachments: ComposerAttachment[];
    context?: unknown;
    cwd: string;
    createdAt?: number;
    id?: string;
    mode?: ComposerMode;
    responsesapiClientMetadata?: unknown;
    text: string;
  };
  threadId: string;
  turnId: string;
}): Promise<void> {
  const optimistic = dispatchOptimisticUserMessage(input.dispatch, input.threadId, input.content, input.turnId);
  const clientUserMessageId = optimistic.localId;
  const pending: PendingSteerRuntime = {
    ...input.restore,
    clientUserMessageId,
    compareKey: pendingSteerCompareKeyFromUserInput(input.content),
    createdAt: input.restore.createdAt ?? Date.now(),
    id: input.restore.id ?? clientUserMessageId,
    optimisticLocalId: optimistic.localId,
    turnId: input.turnId,
  };
  input.dispatch({ type: "registerPendingSteer", threadId: input.threadId, pending });
  try {
    await input.client.request("turn/steer", {
      threadId: input.threadId,
      clientUserMessageId,
      input: input.content,
      expectedTurnId: input.turnId,
    }, null);
  } catch (error) {
    input.dispatch({
      type: "dropPendingSteer",
      threadId: input.threadId,
      clientUserMessageId,
    });
    dropOptimisticUserMessage(input.dispatch, optimistic);
    throw error;
  }
}
