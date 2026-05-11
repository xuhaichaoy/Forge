import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { CollaborationModeMask, Thread, UserInput } from "@hicodex/codex-protocol";
import { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import { readImageDataUrl } from "../lib/tauri-host";
import type { ThreadContextDefaults } from "../state/codex-reducer";
import {
  buildUserInputFromComposer,
  composerHasImageAttachments,
  type ComposerAttachment,
  type ComposerMode,
  type ComposerSendOptions,
  type ComposerSubmitState,
} from "../state/composer-workflow";
import {
  createQueuedFollowUp,
  isQueuedFollowUpDuplicate,
  reorderQueuedFollowUps,
  removeQueuedFollowUp,
  updateQueuedFollowUpStatus,
  type QueuedFollowUp,
} from "../state/queued-followups";
import {
  PLAN_MODE_UNAVAILABLE_MESSAGE,
  composerModeRequiresUnavailablePlanMode,
  selectNextQueuedFollowUp,
  shouldQueueComposerFollowUp,
  shouldSteerQueuedFollowUp,
  turnStartOptionsFromComposerMode,
} from "../state/turn-submission";
import {
  createAndSelectThreadForTurn,
  dispatchOptimisticUserMessage,
  dropOptimisticUserMessage,
  ensureThreadReadyForTurn,
  isThreadNotFound,
  isThreadNeedsResume,
  refreshThreadMetadata,
  resumeSelectedThreadAndStartTurn,
  startTurn,
  steerTurn,
  type OptimisticUserMessageHandle,
  type ThreadWorkflowDispatch,
  type TurnStartOptions,
} from "../state/thread-workflow";

export interface UseTurnSubmissionInput {
  activeModelSupportsImageInput: boolean;
  activePendingRequestCount: number;
  activeThread: Thread | null;
  activeThreadId: string | null;
  activeThreadRunning: boolean;
  activeTurnId: string | null;
  client: CodexJsonRpcClient;
  collaborationModes: CollaborationModeMask[];
  collaborationModesForComposerMode: (mode: ComposerMode) => Promise<CollaborationModeMask[]>;
  composerAttachments: ComposerAttachment[];
  composerMode: ComposerMode;
  composerSubmitState: ComposerSubmitState;
  dispatch: ThreadWorkflowDispatch;
  ensureConnected: () => Promise<boolean>;
  includeImageDynamicTool: boolean;
  input: string;
  rememberLatestCollaborationMode: (threadId: string, options: TurnStartOptions | null | undefined) => void;
  resetComposerSelectionAfterCreatedThread: (threadId: string) => void;
  setActiveComposerMode: (mode: ComposerMode) => void;
  setComposerAttachments: Dispatch<SetStateAction<ComposerAttachment[]>>;
  setInput: Dispatch<SetStateAction<string>>;
  threadContextDefaults: ThreadContextDefaults | null;
  threadIds: string[];
  workspace: string;
}

export interface UseTurnSubmissionResult {
  activeQueuedFollowUps: QueuedFollowUp[];
  deleteQueuedFollowUp: (message: QueuedFollowUp) => void;
  editQueuedFollowUp: (message: QueuedFollowUp) => void;
  reorderQueuedFollowUp: (activeId: string, overId: string) => void;
  sendQueuedFollowUpNow: (message: QueuedFollowUp) => void;
  sendTurn: (options?: ComposerSendOptions) => Promise<void>;
}

export function useTurnSubmission({
  activeModelSupportsImageInput,
  activePendingRequestCount,
  activeThread,
  activeThreadId,
  activeThreadRunning,
  activeTurnId,
  client,
  collaborationModes,
  collaborationModesForComposerMode,
  composerAttachments,
  composerMode,
  composerSubmitState,
  dispatch,
  ensureConnected,
  includeImageDynamicTool,
  input,
  rememberLatestCollaborationMode,
  resetComposerSelectionAfterCreatedThread,
  setActiveComposerMode,
  setComposerAttachments,
  setInput,
  threadContextDefaults,
  threadIds,
  workspace,
}: UseTurnSubmissionInput): UseTurnSubmissionResult {
  const [queuedFollowUpsByThread, setQueuedFollowUpsByThread] = useState<Record<string, QueuedFollowUp[]>>({});
  const sendingQueuedFollowUpId = useRef<string | null>(null);
  const activeQueuedFollowUps = activeThreadId ? queuedFollowUpsByThread[activeThreadId] ?? [] : [];

  const updateQueuedFollowUps = useCallback((
    threadId: string,
    updater: (queue: QueuedFollowUp[]) => QueuedFollowUp[],
  ) => {
    setQueuedFollowUpsByThread((current) => {
      const nextQueue = updater(current[threadId] ?? []);
      if (nextQueue.length === 0) {
        const { [threadId]: _removed, ...rest } = current;
        return rest;
      }
      return { ...current, [threadId]: nextQueue };
    });
  }, []);

  useEffect(() => {
    const threadIdSet = new Set(threadIds);
    setQueuedFollowUpsByThread((current) => {
      let changed = false;
      const next: Record<string, QueuedFollowUp[]> = {};
      for (const [threadId, queue] of Object.entries(current)) {
        if (threadIdSet.has(threadId)) {
          next[threadId] = queue;
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [threadIds]);

  const sendQueuedFollowUp = useCallback(async (threadId: string, message: QueuedFollowUp) => {
    if (sendingQueuedFollowUpId.current === message.id) return;
    sendingQueuedFollowUpId.current = message.id;
    updateQueuedFollowUps(threadId, (queue) => updateQueuedFollowUpStatus(queue, message.id, "sending"));
    try {
      if (!(await ensureConnected())) {
        updateQueuedFollowUps(threadId, (queue) =>
          updateQueuedFollowUpStatus(queue, message.id, "paused", "Runtime is offline"),
        );
        return;
      }
      if (composerHasImageAttachments(message.attachments) && !activeModelSupportsImageInput) {
        const reason = "Current model does not declare image input support";
        updateQueuedFollowUps(threadId, (queue) => updateQueuedFollowUpStatus(queue, message.id, "paused", reason));
        dispatch({ type: "log", text: reason, level: "warn" });
        return;
      }
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
        await steerTurnWithOptimistic({ client, content, dispatch, threadId, turnId: steerTurnId });
      } else {
        let optimistic: OptimisticUserMessageHandle | null = null;
        const messageMode = message.mode ?? "default";
        const modes = await collaborationModesForComposerMode(messageMode);
        const turnStartOptions = turnStartOptionsFromComposerMode(messageMode, modes, threadContextDefaults);
        if (composerModeRequiresUnavailablePlanMode(messageMode, turnStartOptions)) {
          updateQueuedFollowUps(threadId, (queue) =>
            updateQueuedFollowUpStatus(queue, message.id, "paused", PLAN_MODE_UNAVAILABLE_MESSAGE),
          );
          dispatch({ type: "log", text: PLAN_MODE_UNAVAILABLE_MESSAGE, level: "warn" });
          return;
        }
        optimistic = dispatchOptimisticUserMessage(dispatch, threadId, content);
        try {
          await startTurn(client, threadId, content, message.cwd, threadContextDefaults, turnStartOptions);
          rememberLatestCollaborationMode(threadId, turnStartOptions);
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
            threadContextDefaults,
            turnStartOptions,
          ))) {
            dropOptimisticUserMessage(dispatch, optimistic);
            throw error;
          }
          rememberLatestCollaborationMode(threadId, turnStartOptions);
        }
      }
      updateQueuedFollowUps(threadId, (queue) => removeQueuedFollowUp(queue, message.id));
    } catch (error) {
      updateQueuedFollowUps(threadId, (queue) =>
        updateQueuedFollowUpStatus(queue, message.id, "paused", formatError(error)),
      );
      dispatch({ type: "log", text: formatError(error), level: "error" });
    } finally {
      sendingQueuedFollowUpId.current = null;
    }
  }, [
    activeModelSupportsImageInput,
    activeThreadId,
    activeThreadRunning,
    activeTurnId,
    client,
    collaborationModesForComposerMode,
    dispatch,
    ensureConnected,
    rememberLatestCollaborationMode,
    threadContextDefaults,
    updateQueuedFollowUps,
  ]);

  const sendTurn = useCallback(async (options: ComposerSendOptions = {}) => {
    if (composerSubmitState.disabled) {
      if (composerSubmitState.submitBlockReason !== "empty" && composerSubmitState.disabledReason) {
        dispatch({ type: "log", text: composerSubmitState.disabledReason, level: "warn" });
      }
      return;
    }
    if (composerHasImageAttachments(composerAttachments) && !activeModelSupportsImageInput) {
      dispatch({ type: "log", text: "Current model does not declare image input support", level: "warn" });
      return;
    }
    const sendAttachments = await attachmentsWithDataImagePreviews(composerAttachments);
    const content = buildUserInputFromComposer(input, sendAttachments);
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
      const modes = shouldQueueFollowUp
        ? collaborationModes
        : await collaborationModesForComposerMode(composerMode);
      const turnStartOptions = shouldQueueFollowUp
        ? null
        : turnStartOptionsFromComposerMode(composerMode, modes, threadContextDefaults);
      if (!shouldQueueFollowUp && composerModeRequiresUnavailablePlanMode(composerMode, turnStartOptions)) {
        dispatch({ type: "log", text: PLAN_MODE_UNAVAILABLE_MESSAGE, level: "warn" });
        return;
      }
      const selectedThreadId = activeThreadId;
      const readyThread = await ensureThreadReadyForTurn({
        client,
        activeThread,
        activeThreadId: selectedThreadId,
        workspace,
        dispatch,
        context: threadContextDefaults,
        threadCreationOptions: { includeDynamicTools: includeImageDynamicTool },
      });
      const threadId = readyThread.threadId;
      if (!threadId) throw new Error("No active Codex thread");
      setInput("");
      setComposerAttachments([]);
      if (shouldQueueFollowUp) {
        const existingQueue = queuedFollowUpsByThread[threadId] ?? [];
        if (isQueuedFollowUpDuplicate(existingQueue, { text: input, attachments: sendAttachments })) {
          return;
        }
        const queued = createQueuedFollowUp({
          text: input,
          attachments: sendAttachments,
          cwd: workspace,
          mode: composerMode,
        });
        updateQueuedFollowUps(threadId, (queue) => [...queue, queued]);
        return;
      }
      let optimistic: OptimisticUserMessageHandle | null = null;
      try {
        if (activeTurnId && activeThreadRunning) {
          await steerTurnWithOptimistic({ client, content, dispatch, threadId, turnId: activeTurnId });
        } else {
          optimistic = dispatchOptimisticUserMessage(dispatch, threadId, content);
          await startTurn(client, threadId, content, workspace, threadContextDefaults, turnStartOptions);
          await refreshThreadMetadata(client, threadId, dispatch);
          rememberLatestCollaborationMode(threadId, turnStartOptions);
          if (readyThread.source === "created") resetComposerSelectionAfterCreatedThread(threadId);
        }
      } catch (error) {
        const recoverableSelectedThreadError = isThreadNotFound(error) || isThreadNeedsResume(error);
        if (!recoverableSelectedThreadError) {
          dropOptimisticUserMessage(dispatch, optimistic);
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
          setInput(input);
          setComposerAttachments(composerAttachments);
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
          workspace,
          dispatch,
          threadContextDefaults,
          { includeDynamicTools: includeImageDynamicTool },
        );
        if (!nextThreadId) throw error;
        optimistic = dispatchOptimisticUserMessage(dispatch, nextThreadId, content);
        try {
          await startTurn(client, nextThreadId, content, workspace, threadContextDefaults, turnStartOptions);
          await refreshThreadMetadata(client, nextThreadId, dispatch);
        } catch (subError) {
          dropOptimisticUserMessage(dispatch, optimistic);
          throw subError;
        }
        rememberLatestCollaborationMode(nextThreadId, turnStartOptions);
        resetComposerSelectionAfterCreatedThread(nextThreadId);
      }
    } catch (error) {
      dispatch({ type: "log", text: formatError(error), level: "error" });
    }
  }, [
    activeModelSupportsImageInput,
    activeThread,
    activeThreadId,
    activeThreadRunning,
    activeTurnId,
    client,
    collaborationModes,
    collaborationModesForComposerMode,
    composerAttachments,
    composerMode,
    composerSubmitState.disabled,
    composerSubmitState.disabledReason,
    composerSubmitState.isQueueingEnabled,
    composerSubmitState.submitBlockReason,
    composerSubmitState.submitButtonMode,
    dispatch,
    ensureConnected,
    includeImageDynamicTool,
    input,
    queuedFollowUpsByThread,
    rememberLatestCollaborationMode,
    resetComposerSelectionAfterCreatedThread,
    setComposerAttachments,
    setInput,
    threadContextDefaults,
    updateQueuedFollowUps,
    workspace,
  ]);

  useEffect(() => {
    if (!activeThreadId) return;
    const nextQueuedFollowUp = selectNextQueuedFollowUp({
      activeThreadRunning,
      pendingRequestCount: activePendingRequestCount,
      queue: queuedFollowUpsByThread[activeThreadId] ?? [],
    });
    if (!nextQueuedFollowUp) return;
    void sendQueuedFollowUp(activeThreadId, nextQueuedFollowUp);
  }, [
    activePendingRequestCount,
    activeThreadId,
    activeThreadRunning,
    queuedFollowUpsByThread,
    sendQueuedFollowUp,
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
    deleteQueuedFollowUp,
    editQueuedFollowUp,
    reorderQueuedFollowUp,
    sendQueuedFollowUpNow,
    sendTurn,
  };
}

export async function attachmentsWithDataImagePreviews(
  attachments: ComposerAttachment[],
): Promise<ComposerAttachment[]> {
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

async function steerTurnWithOptimistic(input: {
  client: CodexJsonRpcClient;
  content: UserInput[];
  dispatch: ThreadWorkflowDispatch;
  threadId: string;
  turnId: string;
}): Promise<void> {
  const optimistic = dispatchOptimisticUserMessage(input.dispatch, input.threadId, input.content, input.turnId);
  try {
    await steerTurn(input.client, input.threadId, input.content, input.turnId);
  } catch (error) {
    dropOptimisticUserMessage(input.dispatch, optimistic);
    throw error;
  }
}
