// Thread lifecycle: start/read/resume, persisted tool-history hydration,
// ensure-ready-for-turn orchestration, runtime-context dispatch, and
// rollout-derived model / image-tool presence (mechanical extraction from
// thread-workflow.ts — logic moved verbatim). DAG note: sits above
// thread-workflow-{shared,params}; the fork/turns domain modules import from
// here, never the reverse.
import type { Thread, UserInput } from "@forge/codex-protocol";
import { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import { getHostStatus, isTauriRuntime, readTextFile, readThreadToolHistory } from "../lib/tauri-host";
import type { ThreadContextDefaults } from "./codex-ui-types";
import {
  forgeImageToolPresenceFromRolloutText,
  userInputLikelyRequestsImageGeneration,
  type ForgeImageToolPresence,
} from "./image-generation-tool";
import { mergeThreadToolHistory } from "./thread-history-tools";
import {
  isThreadStatusNotLoaded,
} from "./thread-status";
import { buildThreadResumeParams, buildThreadStartParams } from "./thread-workflow-params";
import {
  compactParams,
  isThreadNotMaterialized,
  stringOverride,
  trimmedStringField,
  type ThreadCreationOptions,
  type ThreadRuntimeContextResponse,
  type ThreadWorkflowDispatch,
  type WorkspaceDeveloperInstructionReader,
} from "./thread-workflow-shared";

export const IMAGE_TOOL_RESUME_FALLBACK_MESSAGE =
  "Selected thread does not expose a restorable image_gen tool; starting a new image-capable thread for this image request.";

const ROLLOUT_DYNAMIC_TOOL_HEAD_MAX_BYTES = 512_000;

export async function startThread(
  client: CodexJsonRpcClient,
  workspace: string,
  context?: ThreadContextDefaults | null,
  options?: ThreadCreationOptions,
) {
  return client.request<ThreadRuntimeContextResponse & { thread?: Thread }>(
    "thread/start",
    buildThreadStartParams(workspace, context, options),
  );
}

export async function readThread(
  client: CodexJsonRpcClient,
  threadId: string,
  includeTurns = true,
) {
  return client.request<{ thread?: Thread }>("thread/read", {
    threadId,
    includeTurns,
  });
}

export async function unsubscribeThread(
  client: CodexJsonRpcClient,
  threadId: string,
) {
  return client.request("thread/unsubscribe", { threadId }, 120_000);
}

export async function readThreadForDisplay(
  client: CodexJsonRpcClient,
  thread: Thread,
  dispatch: ThreadWorkflowDispatch,
): Promise<Thread | null> {
  // Issue both reads concurrently — the metadata read is only the fallback
  // for not-yet-materialized threads, and serializing it in front of the
  // (potentially multi-MB) full-turns read doubled the switch latency.
  const metadataPromise = readThread(client, thread.id, false);
  // Mark handled up front: when the full read rejects first and we re-throw,
  // a later metadata rejection must not surface as an unhandled rejection.
  metadataPromise.catch(() => undefined);
  const fullReadPromise = readThread(client, thread.id, true);
  try {
    const [metadataResult, result] = await Promise.all([metadataPromise, fullReadPromise]);
    return await hydrateThreadToolHistory(result.thread ?? metadataResult.thread ?? thread, dispatch);
  } catch (error) {
    if (!isThreadNotMaterialized(error)) throw error;
    dispatch({
      type: "log",
      text: "thread is not materialized yet; it will load turns after the first user message",
      level: "info",
    });
    const metadataResult = await metadataPromise.catch(() => null);
    return metadataResult?.thread ?? thread;
  }
}

/*
 * Thread ids whose persisted tool history has been successfully replayed into
 * the runtime snapshot this session (or that have nothing to replay). The
 * thread-switch fast path keys off this: thread/read and thread/resume
 * snapshots carry plain text only — worked-for/Explored cards exist solely
 * after hydration — so an items-bearing runtime that landed unhydrated (or
 * whose hydration failed because the host wasn't ready yet) must not be
 * treated as fully loaded, otherwise the missing cards stick for the session.
 */
const hydratedToolHistoryThreadIds = new Set<string>();

export function isThreadToolHistoryHydrated(threadId: string): boolean {
  return hydratedToolHistoryThreadIds.has(threadId);
}

export async function hydrateThreadToolHistory(
  thread: Thread,
  dispatch: ThreadWorkflowDispatch,
): Promise<Thread> {
  if (!isTauriRuntime()) {
    // No host to replay from — the snapshot is as complete as it gets.
    hydratedToolHistoryThreadIds.add(thread.id);
    return thread;
  }
  if (!thread.turns?.length) return thread;
  try {
    const status = await getHostStatus();
    const history = await readThreadToolHistory(status.codexHome, thread.id, thread.path);
    hydratedToolHistoryThreadIds.add(thread.id);
    return mergeThreadToolHistory(thread, history);
  } catch (error) {
    dispatch({
      type: "log",
      text: `failed to hydrate persisted tool calls: ${formatError(error)}`,
      level: "warn",
    });
    return thread;
  }
}

export async function createAndSelectThreadForTurn(
  client: CodexJsonRpcClient,
  workspace: string,
  dispatch: ThreadWorkflowDispatch,
  context?: ThreadContextDefaults | null,
  options?: ThreadCreationOptions,
): Promise<string | null> {
  const result = await startThread(client, workspace, context, options);
  const thread = result.thread
    ? await hydrateStartedThreadMetadata(client, result.thread)
    : null;
  const threadId = thread?.id ?? null;
  if (thread) {
    // Freshly created — no persisted tool history exists yet; every item
    // arrives live, so the switch fast path may treat it as fully loaded.
    hydratedToolHistoryThreadIds.add(thread.id);
    dispatch({ type: "upsertThread", thread, select: true });
    dispatchThreadContextDefaultsFromRuntimeResponse(dispatch, result, context);
  }
  return threadId;
}

async function hydrateStartedThreadMetadata(
  client: CodexJsonRpcClient,
  thread: Thread,
): Promise<Thread> {
  if (thread.gitInfo !== null) return thread;
  try {
    const result = await readThread(client, thread.id, false);
    return result.thread ?? thread;
  } catch {
    return thread;
  }
}

export type ReadyThreadForTurnSource = "selected" | "created" | "resumed";

export interface EnsureThreadReadyForTurnInput {
  client: CodexJsonRpcClient;
  activeThread: Thread | null | undefined;
  activeThreadId: string | null;
  input?: UserInput[];
  workspace: string;
  dispatch: ThreadWorkflowDispatch;
  context?: ThreadContextDefaults | null;
  threadCreationOptions?: ThreadCreationOptions;
  readRolloutText?: WorkspaceDeveloperInstructionReader;
}

export interface ReadyThreadForTurn {
  threadId: string | null;
  source: ReadyThreadForTurnSource;
}

export class ThreadProviderSwitchMismatchError extends Error {
  readonly threadId: string;
  readonly expectedProvider: string;
  readonly actualProvider: string;

  constructor(threadId: string, expectedProvider: string, actualProvider: string) {
    super(`thread ${threadId} resumed with provider ${actualProvider || "(unknown)"} instead of ${expectedProvider}`);
    this.name = "ThreadProviderSwitchMismatchError";
    this.threadId = threadId;
    this.expectedProvider = expectedProvider;
    this.actualProvider = actualProvider;
  }
}

export function isThreadProviderSwitchMismatchError(error: unknown): error is ThreadProviderSwitchMismatchError {
  return error instanceof ThreadProviderSwitchMismatchError;
}

export async function ensureThreadReadyForTurn({
  client,
  activeThread,
  activeThreadId,
  input,
  workspace,
  dispatch,
  context,
  threadCreationOptions,
  readRolloutText,
}: EnsureThreadReadyForTurnInput): Promise<ReadyThreadForTurn> {
  if (!activeThreadId) {
    return {
      threadId: await createAndSelectThreadForTurn(client, workspace, dispatch, context, threadCreationOptions),
      source: "created",
    };
  }

  if (isThreadStatusNotLoaded(activeThread?.status)) {
    if (await shouldCreateImageCapableThreadInsteadOfResume({
      activeThread,
      input: input ?? [],
      threadCreationOptions,
      readRolloutText,
    })) {
      dispatch({
        type: "log",
        text: IMAGE_TOOL_RESUME_FALLBACK_MESSAGE,
        level: "warn",
      });
      return {
        threadId: await createAndSelectThreadForTurn(client, workspace, dispatch, context, threadCreationOptions),
        source: "created",
      };
    }
    await readThreadResumeMetadata(client, activeThreadId);
    const result = await resumeThread(client, activeThreadId, workspace, context);
    assertThreadProviderSwitchApplied(activeThreadId, result, context);
    // The resume snapshot is plain text only — replay persisted tool calls
    // before it lands, or the worked-for/Explored cards vanish from history.
    dispatch({ type: "upsertThread", thread: await hydrateThreadToolHistory(result.thread, dispatch), select: true });
    dispatchThreadContextDefaultsFromRuntimeResponse(dispatch, result, context);
    return {
      threadId: result.thread.id,
      source: "resumed",
    };
  }

  if (shouldResumeForModelProviderSwitch(activeThread, context)) {
    await unsubscribeThread(client, activeThreadId);
    const result = await resumeThread(client, activeThreadId, workspace, context);
    assertThreadProviderSwitchApplied(activeThreadId, result, context);
    dispatch({ type: "upsertThread", thread: await hydrateThreadToolHistory(result.thread, dispatch), select: true });
    dispatchThreadContextDefaultsFromRuntimeResponse(dispatch, result, context);
    return {
      threadId: result.thread.id,
      source: "resumed",
    };
  }

  return {
    threadId: activeThreadId,
    source: "selected",
  };
}

function shouldResumeForModelProviderSwitch(
  activeThread: Thread | null | undefined,
  context?: ThreadContextDefaults | null,
): boolean {
  if (!isThreadStatusLoadedNonRunning(activeThread?.status)) return false;
  const activeProvider = activeThread?.modelProvider?.trim() ?? "";
  const nextProvider = context?.modelProvider?.trim() ?? "";
  return Boolean(activeProvider && nextProvider && activeProvider !== nextProvider);
}

function isThreadStatusLoadedNonRunning(status: unknown): boolean {
  if (isThreadStatusNotLoaded(status)) return false;
  if (typeof status === "string") return status !== "active";
  if (!status || typeof status !== "object") return false;
  const record = status as Record<string, unknown>;
  const statusType = trimmedStringField(record, "type") || trimmedStringField(record, "status");
  return Boolean(statusType && statusType !== "active");
}

export function assertThreadProviderSwitchApplied(
  threadId: string,
  result: { thread: Thread; modelProvider?: string | null },
  context?: ThreadContextDefaults | null,
): void {
  const expectedProvider = context?.modelProvider?.trim() ?? "";
  if (!expectedProvider) return;
  const actualProvider = (result.modelProvider ?? result.thread.modelProvider ?? "").trim();
  if (actualProvider && actualProvider !== expectedProvider) {
    throw new ThreadProviderSwitchMismatchError(threadId, expectedProvider, actualProvider);
  }
}

export function threadContextDefaultsFromRuntimeResponse(
  result: ThreadRuntimeContextResponse,
  current?: ThreadContextDefaults | null,
): ThreadContextDefaults | null {
  const patch = compactParams({
    model: stringOverride(result.model),
    modelProvider: stringOverride(result.modelProvider),
    serviceTier: result.serviceTier,
    reasoningEffort: result.reasoningEffort,
  }) as ThreadContextDefaults;
  if (Object.keys(patch).length === 0) return null;
  const next = compactParams({ ...current, ...patch }) as ThreadContextDefaults;
  return Object.keys(next).length > 0 ? next : null;
}

export function dispatchThreadContextDefaultsFromRuntimeResponse(
  dispatch: ThreadWorkflowDispatch,
  result: ThreadRuntimeContextResponse,
  current?: ThreadContextDefaults | null,
): void {
  const context = threadContextDefaultsFromRuntimeResponse(result, current);
  if (context) dispatch({ type: "setThreadContextDefaults", context });
  dispatchThreadResolvedModelFromRuntimeResponse(dispatch, result);
}

/*
 * Record the (model, modelProvider) the runtime reported for THIS thread.
 * `setThreadContextDefaults` above is a global slot that the last resume
 * wins; this per-thread record is what the model picker checkmark and the
 * composer chip read, so switching between chats on different providers
 * cannot cross-contaminate the display.
 */
export function dispatchThreadResolvedModelFromRuntimeResponse(
  dispatch: ThreadWorkflowDispatch,
  result: ThreadRuntimeContextResponse,
): void {
  const model = stringOverride(result.model) ?? null;
  const modelProvider = stringOverride(result.modelProvider)
    ?? stringOverride(result.thread.modelProvider)
    ?? null;
  if (!model && !modelProvider) return;
  dispatch({
    type: "setThreadResolvedModel",
    threadId: result.thread.id,
    model,
    modelProvider,
  });
}

/*
 * Extract the model a recorded session was using from its rollout JSONL:
 * `session_meta.payload.model_provider` (line 1) + the last
 * `turn_context.payload.model` present in the text. The thread protocol's
 * read/list responses carry modelProvider only, so for a not-yet-resumed
 * historical chat this is the only way to show its actual model.
 */
export function threadResolvedModelFromRolloutText(
  text: string,
): { model: string | null; modelProvider: string | null } | null {
  let model: string | null = null;
  let modelProvider: string | null = null;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) continue;
    let record: unknown;
    try {
      record = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!record || typeof record !== "object") continue;
    const { type, payload } = record as { type?: unknown; payload?: unknown };
    if (!payload || typeof payload !== "object") continue;
    if (type === "session_meta") {
      const provider = (payload as { model_provider?: unknown }).model_provider;
      if (typeof provider === "string" && provider.trim()) modelProvider = provider.trim();
    } else if (type === "turn_context") {
      const turnModel = (payload as { model?: unknown }).model;
      if (typeof turnModel === "string" && turnModel.trim()) model = turnModel.trim();
    }
  }
  return model || modelProvider ? { model, modelProvider } : null;
}

/*
 * Display-only hydration for opening a historical chat: read the head of the
 * rollout file (session_meta + the early turn_context records always fit in
 * the host's 240KB text-read cap) and record the thread's actual model so
 * the composer chip / picker checkmark show it before the first resume.
 * Resume/start responses overwrite this with the runtime-reported value.
 */
export async function hydrateThreadResolvedModelFromRollout(
  thread: Thread,
  dispatch: ThreadWorkflowDispatch,
  readRolloutText: (path: string, maxBytes?: number) => Promise<string> = readTextFile,
): Promise<boolean> {
  const path = thread.path?.trim();
  if (!path) return false;
  if (readRolloutText === readTextFile && !isTauriRuntime()) return false;
  try {
    const parsed = threadResolvedModelFromRolloutText(await readRolloutText(path, 240_000));
    if (!parsed) return false;
    dispatch({
      type: "setThreadResolvedModel",
      threadId: thread.id,
      model: parsed.model,
      modelProvider: parsed.modelProvider ?? thread.modelProvider?.trim() ?? null,
    });
    return true;
  } catch {
    // Display-only nicety — a missing/unreadable rollout keeps the neutral label.
    return false;
  }
}

export async function shouldCreateImageCapableThreadInsteadOfResume(input: {
  activeThread: Thread | null | undefined;
  input: UserInput[];
  threadCreationOptions?: ThreadCreationOptions;
  readRolloutText?: WorkspaceDeveloperInstructionReader;
}): Promise<boolean> {
  if (input.threadCreationOptions?.includeDynamicTools !== true) return false;
  if (!userInputLikelyRequestsImageGeneration(input.input)) return false;
  const presence = await forgeImageToolPresenceForThread(input.activeThread, input.readRolloutText);
  return presence !== "present";
}

async function forgeImageToolPresenceForThread(
  thread: Thread | null | undefined,
  readRolloutText: WorkspaceDeveloperInstructionReader = readTextFile,
): Promise<ForgeImageToolPresence> {
  const rolloutPath = typeof thread?.path === "string" ? thread.path.trim() : "";
  if (!rolloutPath) return "unknown";
  if (readRolloutText === readTextFile && !isTauriRuntime()) return "unknown";
  try {
    return forgeImageToolPresenceFromRolloutText(
      await readRolloutText(rolloutPath, ROLLOUT_DYNAMIC_TOOL_HEAD_MAX_BYTES),
    );
  } catch {
    return "unknown";
  }
}

export async function refreshThreadMetadata(
  client: CodexJsonRpcClient,
  threadId: string,
  dispatch: ThreadWorkflowDispatch,
): Promise<void> {
  const id = threadId.trim();
  if (!id) return;
  try {
    const result = await readThread(client, id, false);
    if (result.thread) dispatch({ type: "upsertThread", thread: result.thread });
  } catch {
    // Metadata refresh is a best-effort UI projection update; turn streaming
    // continues from notifications even when this read is unavailable.
  }
}

export async function resumeThread(
  client: CodexJsonRpcClient,
  threadId: string,
  workspace: string,
  context?: ThreadContextDefaults | null,
  rolloutPath?: string | null,
) {
  /*
   * `path` lets the app-server skip the session_index lookup and read the
   * rollout file directly — see
   * `codex-rs/app-server/src/request_processors/thread_processor.rs:2810` /
   * `read_thread_by_rollout_path`. This is the recovery path when the thread
   * was orphaned (rollout JSONL on disk but session_index out of sync), which
   * `thread/read` and a plain `thread/resume` both surface as "thread not
   * found". Passing the rollout path bypasses that gap.
   */
  const rolloutPathParam =
    rolloutPath && rolloutPath.trim().length > 0 ? { path: rolloutPath.trim() } : {};
  return client.request<ThreadRuntimeContextResponse>("thread/resume", {
    threadId,
    ...rolloutPathParam,
    ...buildThreadResumeParams(workspace, context),
  }, 120_000);
}

export async function resumeThreadWithMetadataRead(
  client: CodexJsonRpcClient,
  threadId: string,
  workspace: string,
  context: ThreadContextDefaults | null | undefined,
  dispatch: ThreadWorkflowDispatch,
): Promise<ThreadRuntimeContextResponse> {
  await readThreadResumeMetadata(client, threadId);
  const result = await resumeThread(client, threadId, workspace, context);
  // Resume snapshots carry plain text only; replay persisted tool calls so
  // callers upsert a transcript with its worked-for/Explored cards intact.
  return { ...result, thread: await hydrateThreadToolHistory(result.thread, dispatch) };
}

export async function readThreadResumeMetadata(
  client: CodexJsonRpcClient,
  threadId: string,
) {
  await readThread(client, threadId, false);
}
