// Turn submission helpers: optimistic user-message projection, turn
// start/steer/interrupt, panel sends, the edit-last-user-turn fork/rollback
// flow, and in-progress turn lookup (mechanical extraction from
// thread-workflow.ts — logic moved verbatim). DAG note: top of the
// thread-workflow family — imports shared/params/lifecycle/fork; nothing in
// the family imports from here.
import type { Thread, UserInput } from "@forge/codex-protocol";
import { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import {
  OPTIMISTIC_TURN_PLACEHOLDER_PREFIX,
  type ThreadContextDefaults,
} from "./codex-ui-types";
import { forkThreadFromTurn } from "./thread-workflow-fork";
import {
  dispatchThreadContextDefaultsFromRuntimeResponse,
  hydrateThreadToolHistory,
  readThread,
  readThreadResumeMetadata,
  resumeThread,
} from "./thread-workflow-lifecycle";
import { buildTurnStartParams } from "./thread-workflow-params";
import {
  isThreadNeedsResume,
  isThreadNotFound,
  type ThreadWorkflowDispatch,
  type TurnStartOptions,
} from "./thread-workflow-shared";

export interface OptimisticUserMessageHandle {
  threadId: string;
  localTurnId: string;
  localId: string;
}

let optimisticIdCounter = 0;

function nextOptimisticToken(): string {
  optimisticIdCounter += 1;
  const random = typeof globalThis !== "undefined" && typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    : Math.random().toString(36).slice(2, 12);
  return `${Date.now().toString(36)}-${optimisticIdCounter.toString(36)}-${random}`;
}

/**
 * Insert an optimistic user message into the active turn segment so the UI
 * shows the prompt immediately, mirroring how Codex Desktop pushes the user
 * input into `turn.items` before the server echoes it back.
 *
 * `liveTurnId` is non-null when steering an already-running turn; in that case
 * we attach the item directly to the real turn id so no later binding is
 * required. When omitted, a placeholder turn id is used and bound to the next
 * `turn/started` notification by the reducer.
 */
export function dispatchOptimisticUserMessage(
  dispatch: ThreadWorkflowDispatch,
  threadId: string,
  content: UserInput[],
  liveTurnId?: string | null,
): OptimisticUserMessageHandle {
  const token = nextOptimisticToken();
  const localTurnId = liveTurnId && liveTurnId.length > 0
    ? liveTurnId
    : `${OPTIMISTIC_TURN_PLACEHOLDER_PREFIX}${token}`;
  const localId = `optimistic-user:${token}`;
  dispatch({
    type: "optimisticUserMessage",
    threadId,
    localTurnId,
    localId,
    content,
  });
  return { threadId, localTurnId, localId };
}

export function dropOptimisticUserMessage(
  dispatch: ThreadWorkflowDispatch,
  handle: OptimisticUserMessageHandle | null,
): void {
  if (!handle) return;
  dispatch({
    type: "dropOptimisticUserMessage",
    threadId: handle.threadId,
    localId: handle.localId,
  });
}

// codex bounds turn/start & turn/steer acks at 30s (app-server-manager-signals
// `timeoutMs: Yc`, Yc=3e4). Forge deliberately passes null (no short ack
// timeout) — guarded by thread-workflow.test.ts "should not use the short
// default RPC timeout". Kept as-is: this is a documented intentional divergence,
// and there is no evidence a 30s bound is safe for Forge's sidecar ack timing
// (memory reference_hicodex_sidecar_wire_facts: acks return fast, but the author
// chose unbounded on purpose). INFO-severity edge-case only.
const TURN_START_TIMEOUT_MS: number | null = null;
const TURN_STEER_TIMEOUT_MS: number | null = null;

export async function startTurn(
  client: CodexJsonRpcClient,
  threadId: string,
  input: UserInput[],
  workspace: string,
  context?: ThreadContextDefaults | null,
  options?: TurnStartOptions | null,
) {
  return client.request("turn/start", buildTurnStartParams(threadId, input, workspace, context, options), TURN_START_TIMEOUT_MS);
}

export async function resumeSelectedThreadAndStartTurn(
  client: CodexJsonRpcClient,
  threadId: string,
  input: UserInput[],
  workspace: string,
  dispatch: ThreadWorkflowDispatch,
  context?: ThreadContextDefaults | null,
  options?: TurnStartOptions | null,
  resumeOptions: { select?: boolean } = {},
): Promise<boolean> {
  try {
    await readThreadResumeMetadata(client, threadId);
    const result = await resumeThread(client, threadId, workspace, context);
    dispatch({
      type: "upsertThread",
      thread: await hydrateThreadToolHistory(result.thread, dispatch),
      select: resumeOptions.select ?? true,
    });
    if (resumeOptions.select ?? true) dispatchThreadContextDefaultsFromRuntimeResponse(dispatch, result, context);
    await startTurn(client, result.thread.id, input, workspace, context, options);
    return true;
  } catch (error) {
    if (isThreadNotFound(error)) return false;
    throw error;
  }
}

export async function steerTurn(
  client: CodexJsonRpcClient,
  threadId: string,
  input: UserInput[],
  expectedTurnId: string,
) {
  return client.request("turn/steer", {
    threadId,
    input,
    expectedTurnId,
  }, TURN_STEER_TIMEOUT_MS);
}

export async function interruptThreadTurn(
  client: CodexJsonRpcClient,
  threadId: string,
  turnId: string,
) {
  return client.request("turn/interrupt", {
    threadId,
    turnId,
  }, 120_000);
}

export async function sendPanelThreadMessage(
  client: CodexJsonRpcClient,
  threadId: string,
  input: UserInput[],
  workspace: string,
  context?: ThreadContextDefaults | null,
  activeTurnId?: string | null,
) {
  if (activeTurnId) {
    return steerTurn(client, threadId, input, activeTurnId);
  }
  return startTurn(client, threadId, input, workspace, context);
}

export async function editLastUserTurn(
  client: CodexJsonRpcClient,
  threadId: string,
  targetTurnId: string,
  message: string,
  workspace: string,
  context?: ThreadContextDefaults | null,
  onRollback?: (thread: Thread) => void,
  rolloutPath?: string | null,
) {
  /*
   * If the app-server lost its in-memory thread state (restart, crash, or the
   * thread was archived/unarchived since we last interacted), `thread/read`
   * comes back with `thread not found`. Auto-recover by calling `thread/resume`
   * — and crucially, if we know the rollout JSONL path, pass it so the server
   * goes through the path-based store lookup
   * (`read_thread_by_rollout_path`) instead of the session_index lookup that
   * also produces `thread not found` when the index is stale or empty. We
   * observed this exact case locally: a fresh rollout file on disk
   * (`~/Library/.../HiCodex/codex-home/sessions/.../rollout-*-019e1e5c-…jsonl`
   * — the "HiCodex" app-support dir segment is a deliberate legacy value)
   * but a `session_index.jsonl` with only one stale entry. Without the path
   * arg, both `thread/read` and `thread/resume` reject; with the path, the
   * server reads straight from the rollout and recovers.
   */
  let sourceThread: Thread | undefined;
  try {
    const initial = await readThread(client, threadId, true);
    sourceThread = initial.thread;
  } catch (error) {
    if (!isThreadNotFound(error)) throw error;
    await resumeThread(client, threadId, workspace, context, rolloutPath).catch(
      (resumeError) => {
        // If resume itself fails, surface the original `thread not found` error
        // rather than a misleading resume-stage message.
        throw isThreadNotFound(resumeError) ? error : resumeError;
      },
    );
    const retried = await readThread(client, threadId, true);
    sourceThread = retried.thread;
  }
  if (!sourceThread) throw new Error("Conversation state not found.");
  const latestTurn = sourceThread.turns.at(-1) ?? null;
  if (!latestTurn) throw new Error("Conversation has no turns to edit.");

  // codex: local-conversation-thread-Kn0WAsVa#Ri (L25914-25927) — editing a
  // historical user message in Codex Desktop branches into a new thread via
  // `thread/fork` (see `Wd` dialog handler L6424-6427), leaving the original
  // thread intact in the sidebar. We mirror that here: fork up to the target
  // turn, hand the new thread back to the caller (via `onRollback`, which
  // already dispatches `upsertThread {..., select: true}`), then recurse to
  // run the regular rollback + reissue path against the fork's tail turn.
  if (latestTurn.id !== targetTurnId) {
    const targetTurn = sourceThread.turns.find((turn) => turn.id === targetTurnId);
    if (!targetTurn) throw new Error("Target turn not found.");
    if (targetTurn.status === "inProgress") {
      throw new Error("Cannot edit a message while a turn is in progress.");
    }
    const forkResult = await forkThreadFromTurn(
      client,
      threadId,
      targetTurnId,
      sourceThread.cwd || workspace,
      context,
    );
    const forkedTail = forkResult.thread.turns.at(-1);
    if (!forkedTail) throw new Error("Forked thread has no turns to edit.");
    onRollback?.(forkResult.thread);
    return editLastUserTurn(
      client,
      forkResult.thread.id,
      forkedTail.id,
      message,
      forkResult.thread.cwd || workspace,
      context,
      onRollback,
      forkResult.thread.path ?? null,
    );
  }
  if (latestTurn.status === "inProgress") {
    throw new Error("Cannot edit a message while a turn is in progress.");
  }
  const userMessage = latestTurn.items.find(isProtocolUserMessage);
  if (!userMessage) throw new Error("User message not found for edit.");

  const input = replaceFirstTextInput(userMessage.content, message.trim());
  const rollback = await rollbackLatestTurnForEdit(
    client,
    threadId,
    sourceThread.cwd || workspace,
    context,
    sourceThread.path || rolloutPath,
  );
  const cwd = rollback.thread.cwd || sourceThread.cwd || workspace;
  let turnResult: unknown;
  try {
    turnResult = await startTurn(client, rollback.thread.id || threadId, input, cwd, context);
  } catch (error) {
    await restoreRolledBackUserTurnAfterEditFailure(
      client,
      rollback.thread.id || threadId,
      userMessage.content,
      cwd,
      context,
      error,
    );
    throw error;
  }
  onRollback?.(rollback.thread);
  return { thread: rollback.thread, turnResult };
}

async function restoreRolledBackUserTurnAfterEditFailure(
  client: CodexJsonRpcClient,
  threadId: string,
  input: UserInput[],
  cwd: string,
  context: ThreadContextDefaults | null | undefined,
  startError: unknown,
): Promise<void> {
  try {
    await startTurn(client, threadId, input, cwd, context);
  } catch (restoreError) {
    throw new Error(
      `Edited message failed to start after rollback: ${formatError(startError)}. `
      + `Restoring the original message also failed: ${formatError(restoreError)}`,
    );
  }
}

async function rollbackLatestTurnForEdit(
  client: CodexJsonRpcClient,
  threadId: string,
  workspace: string,
  context?: ThreadContextDefaults | null,
  rolloutPath?: string | null,
): Promise<{ thread: Thread }> {
  try {
    return await requestThreadRollback(client, threadId);
  } catch (error) {
    if (!isThreadNotFound(error) && !isThreadNeedsResume(error)) throw error;
    await resumeThread(client, threadId, workspace, context, rolloutPath).catch(
      (resumeError) => {
        throw isThreadNotFound(resumeError) ? error : resumeError;
      },
    );
    return requestThreadRollback(client, threadId);
  }
}

function requestThreadRollback(
  client: CodexJsonRpcClient,
  threadId: string,
): Promise<{ thread: Thread }> {
  return client.request<{ thread: Thread }>("thread/rollback", {
    threadId,
    numTurns: 1,
  }, 120_000);
}

function isProtocolUserMessage(
  item: Thread["turns"][number]["items"][number],
): item is Extract<Thread["turns"][number]["items"][number], { type: "userMessage" }> {
  return item.type === "userMessage";
}

function replaceFirstTextInput(input: UserInput[], message: string): UserInput[] {
  const firstTextIndex = input.findIndex((item) => item.type === "text");
  if (firstTextIndex < 0) return input.map(cloneUserInput);
  return input.map((item, index) => {
    if (index !== firstTextIndex || item.type !== "text") return cloneUserInput(item);
    return {
      ...item,
      text: message,
      text_elements: [],
    };
  });
}

function cloneUserInput(input: UserInput): UserInput {
  if (input.type === "text") {
    return {
      ...input,
      text_elements: input.text_elements.map((element) => ({
        ...element,
        byteRange: { ...element.byteRange },
      })),
    };
  }
  return { ...input } as UserInput;
}

export async function readInProgressTurnId(client: CodexJsonRpcClient, threadId: string): Promise<string | null> {
  const result = await readThread(client, threadId, true);
  const turns = result.thread?.turns ?? [];
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (turn.status === "inProgress") return turn.id;
  }
  return null;
}
