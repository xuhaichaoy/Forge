import type { Dispatch } from "react";
import type { CollaborationMode, Thread, TurnStartParams, UserInput } from "@hicodex/codex-protocol";
import { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError, formatUnknown, stringField } from "../lib/format";
import { getHostStatus, isTauriRuntime, readThreadToolHistory } from "../lib/tauri-host";
import { codexUiReducer, OPTIMISTIC_TURN_PLACEHOLDER_PREFIX, type ThreadContextDefaults } from "./codex-reducer";
import { mergeThreadToolHistory } from "./thread-history-tools";

export type ThreadWorkflowDispatch = Dispatch<Parameters<typeof codexUiReducer>[1]>;

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

export interface TurnStartOptions {
  collaborationMode?: CollaborationMode | null;
}

export const THREAD_LIST_PAGE_SIZE = 100;
export const THREAD_LIST_MAX_PAGES = 20;
const DEFAULT_THREAD_PERSONALITY = "pragmatic";
const TURN_STEER_TIMEOUT_MS: number | null = null;

interface ThreadListResponse {
  data?: Thread[];
  nextCursor?: string | null;
}

export async function refreshThreads(
  client: CodexJsonRpcClient,
  dispatch: ThreadWorkflowDispatch,
) {
  try {
    let cursor: string | null = null;
    let pageCount = 0;
    let threads: Thread[] = [];
    do {
      const result: ThreadListResponse = await client.request<ThreadListResponse>(
        "thread/list",
        buildThreadListParams(cursor),
      );
      threads = mergeThreadListPage(threads, result.data ?? []);
      cursor = result.nextCursor ?? null;
      pageCount += 1;
    } while (cursor && pageCount < THREAD_LIST_MAX_PAGES);
    dispatch({ type: "setThreads", threads });
    if (cursor) {
      dispatch({
        type: "log",
        text: `Thread history was truncated after ${threads.length} items; refine search or refresh again later.`,
        level: "warn",
      });
    }
  } catch (error) {
    dispatch({ type: "log", text: formatError(error), level: "error" });
  }
}

export function buildThreadListParams(cursor: string | null = null): Record<string, unknown> {
  return compactParams({
    archived: false,
    cursor,
    limit: THREAD_LIST_PAGE_SIZE,
    sortKey: "updated_at",
    sortDirection: "desc",
  });
}

export function mergeThreadListPage(existing: Thread[], page: Thread[]): Thread[] {
  const seen = new Set(existing.map((thread) => thread.id));
  const next = [...existing];
  for (const thread of page) {
    if (seen.has(thread.id)) continue;
    seen.add(thread.id);
    next.push(thread);
  }
  return next;
}

export async function startThread(
  client: CodexJsonRpcClient,
  workspace: string,
  context?: ThreadContextDefaults | null,
) {
  return client.request<{ thread?: Thread }>("thread/start", buildThreadContextParams(workspace, context));
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

export async function readThreadForDisplay(
  client: CodexJsonRpcClient,
  thread: Thread,
  dispatch: ThreadWorkflowDispatch,
): Promise<Thread | null> {
  const metadataResult = await readThread(client, thread.id, false);
  const metadataThread = metadataResult.thread ?? thread;
  try {
    const result = await readThread(client, thread.id, true);
    return await hydrateThreadToolHistory(result.thread ?? metadataThread, dispatch);
  } catch (error) {
    if (!isThreadNotMaterialized(error)) throw error;
    dispatch({
      type: "log",
      text: "thread is not materialized yet; it will load turns after the first user message",
      level: "info",
    });
    return metadataThread;
  }
}

async function hydrateThreadToolHistory(
  thread: Thread,
  dispatch: ThreadWorkflowDispatch,
): Promise<Thread> {
  if (!isTauriRuntime() || !thread.turns?.length) return thread;
  try {
    const status = await getHostStatus();
    const history = await readThreadToolHistory(status.codexHome, thread.id, thread.path);
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
): Promise<string | null> {
  const result = await startThread(client, workspace, context);
  const thread = result.thread
    ? await hydrateStartedThreadMetadata(client, result.thread)
    : null;
  const threadId = thread?.id ?? null;
  if (thread) {
    dispatch({ type: "upsertThread", thread, select: true });
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
  workspace: string;
  dispatch: ThreadWorkflowDispatch;
  context?: ThreadContextDefaults | null;
}

export interface ReadyThreadForTurn {
  threadId: string | null;
  source: ReadyThreadForTurnSource;
}

export async function ensureThreadReadyForTurn({
  client,
  activeThread,
  activeThreadId,
  workspace,
  dispatch,
  context,
}: EnsureThreadReadyForTurnInput): Promise<ReadyThreadForTurn> {
  if (!activeThreadId) {
    return {
      threadId: await createAndSelectThreadForTurn(client, workspace, dispatch, context),
      source: "created",
    };
  }

  if (isThreadStatusNotLoaded(activeThread?.status)) {
    await readThreadResumeMetadata(client, activeThreadId);
    const result = await resumeThread(client, activeThreadId, workspace, context);
    dispatch({ type: "upsertThread", thread: result.thread, select: true });
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

export async function startTurn(
  client: CodexJsonRpcClient,
  threadId: string,
  input: UserInput[],
  workspace: string,
  context?: ThreadContextDefaults | null,
  options?: TurnStartOptions | null,
) {
  return client.request("turn/start", buildTurnStartParams(threadId, input, workspace, context, options));
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

export async function resumeSelectedThreadAndStartTurn(
  client: CodexJsonRpcClient,
  threadId: string,
  input: UserInput[],
  workspace: string,
  dispatch: ThreadWorkflowDispatch,
  context?: ThreadContextDefaults | null,
  options?: TurnStartOptions | null,
): Promise<boolean> {
  try {
    await readThreadResumeMetadata(client, threadId);
    const result = await resumeThread(client, threadId, workspace, context);
    dispatch({ type: "upsertThread", thread: result.thread, select: true });
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

export async function resumeThread(
  client: CodexJsonRpcClient,
  threadId: string,
  workspace: string,
  context?: ThreadContextDefaults | null,
) {
  return client.request<{ thread: Thread }>("thread/resume", {
    threadId,
    ...buildThreadContextParams(workspace, context),
  }, 120_000);
}

export async function resumeThreadWithMetadataRead(
  client: CodexJsonRpcClient,
  threadId: string,
  workspace: string,
  context?: ThreadContextDefaults | null,
) {
  await readThreadResumeMetadata(client, threadId);
  return resumeThread(client, threadId, workspace, context);
}

async function readThreadResumeMetadata(
  client: CodexJsonRpcClient,
  threadId: string,
) {
  await readThread(client, threadId, false);
}

export async function forkThread(
  client: CodexJsonRpcClient,
  threadId: string,
  workspace: string,
  context?: ThreadContextDefaults | null,
) {
  return client.request<{ thread: Thread }>("thread/fork", {
    threadId,
    ...buildThreadContextParams(workspace, context),
  }, 120_000);
}

export async function forkThreadFromTurn(
  client: CodexJsonRpcClient,
  sourceThreadId: string,
  targetTurnId: string,
  workspace: string,
  context?: ThreadContextDefaults | null,
) {
  const sourceResult = await readThread(client, sourceThreadId, true);
  const sourceThread = sourceResult.thread;
  if (!sourceThread) throw new Error("Source thread not found.");
  const targetTurnIndex = sourceThread.turns.findIndex((turn) => turn.id === targetTurnId);
  if (targetTurnIndex < 0) throw new Error("Target turn not found.");
  const rollbackTurns = sourceThread.turns.length - targetTurnIndex - 1;
  const forkResult = await client.request<{ thread: Thread }>("thread/fork", {
    threadId: sourceThreadId,
    path: null,
    persistExtendedHistory: false,
    ...buildThreadContextParams(workspace, context),
  }, 120_000);
  if (rollbackTurns <= 0) return forkResult;
  return client.request<{ thread: Thread }>("thread/rollback", {
    threadId: forkResult.thread.id,
    numTurns: rollbackTurns,
  }, 120_000);
}

export async function editLastUserTurn(
  client: CodexJsonRpcClient,
  threadId: string,
  targetTurnId: string,
  message: string,
  workspace: string,
  context?: ThreadContextDefaults | null,
  onRollback?: (thread: Thread) => void,
) {
  const sourceResult = await readThread(client, threadId, true);
  const sourceThread = sourceResult.thread;
  if (!sourceThread) throw new Error("Conversation state not found.");
  const latestTurn = sourceThread.turns.at(-1) ?? null;
  if (!latestTurn || latestTurn.id !== targetTurnId) {
    throw new Error("Only the most recent message can be edited.");
  }
  if (latestTurn.status === "inProgress") {
    throw new Error("Cannot edit a message while a turn is in progress.");
  }
  const userMessage = latestTurn.items.find(isProtocolUserMessage);
  if (!userMessage) throw new Error("User message not found for edit.");

  const input = replaceFirstTextInput(userMessage.content, message.trim());
  const rollback = await client.request<{ thread: Thread }>("thread/rollback", {
    threadId,
    numTurns: 1,
  }, 120_000);
  onRollback?.(rollback.thread);
  const cwd = rollback.thread.cwd || sourceThread.cwd || workspace;
  const turnResult = await startTurn(client, threadId, input, cwd, context);
  return { thread: rollback.thread, turnResult };
}

export async function refreshThreadContextDefaults(
  client: CodexJsonRpcClient,
  dispatch: ThreadWorkflowDispatch,
  workspace: string,
) {
  try {
    const result = await client.request<{ config?: Record<string, unknown> }>("config/read", {
      includeLayers: false,
      cwd: normalizedCwd(workspace),
    });
    dispatch({ type: "setThreadContextDefaults", context: projectThreadContextDefaults(result.config) });
  } catch (error) {
    dispatch({ type: "log", text: `config/read failed: ${formatError(error)}`, level: "warn" });
  }
}

export async function archiveThread(client: CodexJsonRpcClient, threadId: string) {
  return client.request("thread/archive", { threadId });
}

export async function unarchiveThread(client: CodexJsonRpcClient, threadId: string) {
  return client.request<{ thread?: Thread }>("thread/unarchive", { threadId });
}

export async function renameThread(
  client: CodexJsonRpcClient,
  threadId: string,
  name: string,
) {
  return client.request("thread/name/set", { threadId, name: name.trim() });
}

export function threadTitle(thread: Thread, items?: ReadonlyArray<unknown> | null): string {
  const explicit = trimmedStringField(thread, "name") || trimmedStringField(thread, "preview");
  if (explicit) return explicit;
  // Codex Desktop's `local-conversation-thread-*.js` derives an unnamed thread's
  // header label from the first user message in the turn — `Wd` walks
  // `thread.turns[0].items` and takes the first `userMessage` text. Falling back
  // straight to `shortId(thread.id)` (e.g. "019e072a...f40e") looks like a debug
  // string compared with Desktop, so do the same first-prompt projection here.
  const fromItems = firstUserMessagePreviewFromItems(items ?? null);
  if (fromItems) return fromItems;
  const fromTurns = firstUserMessagePreviewFromTurns(thread);
  if (fromTurns) return fromTurns;
  return shortId(thread.id);
}

function firstUserMessagePreviewFromItems(items: ReadonlyArray<unknown> | null): string {
  if (!items) return "";
  for (const candidate of items) {
    const preview = userMessagePreview(candidate);
    if (preview) return preview;
  }
  return "";
}

function firstUserMessagePreviewFromTurns(thread: Thread): string {
  const turns = (thread as { turns?: ReadonlyArray<{ items?: unknown[] }> }).turns;
  if (!Array.isArray(turns)) return "";
  for (const turn of turns) {
    const turnItems = Array.isArray(turn?.items) ? turn.items : [];
    const preview = firstUserMessagePreviewFromItems(turnItems);
    if (preview) return preview;
  }
  return "";
}

function userMessagePreview(candidate: unknown): string {
  if (!candidate || typeof candidate !== "object") return "";
  const record = candidate as Record<string, unknown>;
  if (record.type !== "userMessage") return "";
  const content = Array.isArray(record.content) ? record.content : [];
  const buffer: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const partRecord = part as Record<string, unknown>;
    if (partRecord.type === "text" && typeof partRecord.text === "string") {
      buffer.push(partRecord.text);
    }
  }
  const merged = buffer.join("\n").replace(/\s+/g, " ").trim();
  if (!merged) return "";
  return merged.length > 60 ? `${merged.slice(0, 60).trimEnd()}…` : merged;
}

export function threadStatusLabel(status: unknown): string {
  if (status === null || status === undefined) return "ready";
  if (typeof status === "string") return friendlyStatus(status);
  if (typeof status === "number" || typeof status === "boolean") return String(status);
  if (typeof status === "object") {
    const record = status as Record<string, unknown>;
    const type = trimmedStringField(record, "type");
    const value = trimmedStringField(record, "status");
    return type ? friendlyStatus(type) : value ? friendlyStatus(value) : compactUnknown(status);
  }
  return String(status);
}

export function isThreadStatusNotLoaded(status: unknown): boolean {
  if (typeof status === "string") return status === "notLoaded";
  if (!status || typeof status !== "object") return false;
  const record = status as Record<string, unknown>;
  return trimmedStringField(record, "type") === "notLoaded" || trimmedStringField(record, "status") === "notLoaded";
}

export function buildThreadContextParams(
  workspace: string,
  context?: ThreadContextDefaults | null,
): Record<string, unknown> {
  return {
    cwd: normalizedCwd(workspace),
    ...compactParams({
      model: context?.model,
      modelProvider: context?.modelProvider,
      serviceTier: context?.serviceTier,
      approvalPolicy: context?.approvalPolicy,
      approvalsReviewer: context?.approvalsReviewer,
      sandbox: context?.sandbox,
      baseInstructions: context?.baseInstructions,
      developerInstructions: context?.developerInstructions,
      personality: context?.personality,
    }),
  };
}

export function buildTurnStartParams(
  threadId: string,
  input: UserInput[],
  workspace: string,
  context?: ThreadContextDefaults | null,
  options?: TurnStartOptions | null,
): TurnStartParams {
  return {
    threadId,
    input,
    cwd: normalizedCwd(workspace),
    ...compactParams({
      model: context?.model,
      serviceTier: context?.serviceTier,
      approvalPolicy: context?.approvalPolicy,
      approvalsReviewer: context?.approvalsReviewer,
      sandboxPolicy: sandboxPolicyFromMode(context?.sandbox),
      effort: context?.reasoningEffort,
      summary: context?.reasoningSummary,
      personality: context?.personality,
      collaborationMode: options?.collaborationMode,
    }),
  } as TurnStartParams;
}

export function projectThreadContextDefaults(config: Record<string, unknown> | null | undefined): ThreadContextDefaults | null {
  if (!config) return null;
  const context = compactParams({
    model: stringOverride(config.model),
    modelProvider: stringOverride(config.model_provider),
    serviceTier: config.service_tier,
    approvalPolicy: config.approval_policy,
    approvalsReviewer: config.approvals_reviewer,
    sandbox: config.sandbox_mode,
    baseInstructions: stringOverride(config.instructions),
    developerInstructions: stringOverride(config.developer_instructions),
    personality: personalityOverride(config.personality) ?? defaultPersonalityOverride(config),
    reasoningEffort: config.model_reasoning_effort,
    reasoningSummary: config.model_reasoning_summary,
  }) as ThreadContextDefaults;
  return Object.keys(context).length > 0 ? context : null;
}

export function isThreadNotFound(error: unknown): boolean {
  return formatError(error).toLowerCase().includes("thread not found");
}

export function isThreadNeedsResume(error: unknown): boolean {
  const message = formatError(error).toLowerCase();
  return message.includes("not being streamed") || message.includes("needs_resume") || message.includes("needs resume");
}

export function isThreadNotMaterialized(error: unknown): boolean {
  const message = formatError(error).toLowerCase();
  return message.includes("not materialized yet") || message.includes("includeturns is unavailable");
}

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id;
}

function trimmedStringField(value: unknown, key: string): string {
  return stringField(value, key).trim();
}

function compactUnknown(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return formatUnknown(value);
  }
}

function normalizedCwd(workspace: string): string | null {
  return workspace.trim() || null;
}

function compactParams(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
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

function stringOverride(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function personalityOverride(value: unknown): ThreadContextDefaults["personality"] | undefined {
  return value === "none" || value === "friendly" || value === "pragmatic" ? value : undefined;
}

function defaultPersonalityOverride(config: Record<string, unknown>): ThreadContextDefaults["personality"] | undefined {
  return stringOverride(config.model) || stringOverride(config.model_provider) ? DEFAULT_THREAD_PERSONALITY : undefined;
}

function sandboxPolicyFromMode(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && typeof (value as Record<string, unknown>).type === "string") {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") return undefined;
  switch (value) {
    case "read-only":
      return { type: "readOnly", networkAccess: false };
    case "workspace-write":
      return {
        type: "workspaceWrite",
        writableRoots: [],
        networkAccess: false,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      };
    case "danger-full-access":
      return { type: "dangerFullAccess" };
    default:
      return undefined;
  }
}

function friendlyStatus(status: string): string {
  const normalized = status.trim();
  if (!normalized) return "ready";
  switch (normalized) {
    case "notLoaded":
      return "not loaded";
    case "inProgress":
    case "active":
      return "running";
    case "completed":
      return "idle";
    default:
      return normalized;
  }
}
