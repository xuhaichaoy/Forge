// Thread list paging plus archive/unarchive/rename and background-terminal
// cleanup (mechanical extraction from thread-workflow.ts — logic moved
// verbatim). DAG note: imports only the thread-workflow-shared leaf.
import type { Thread } from "@forge/codex-protocol";
import { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import { compactParams, type ThreadWorkflowDispatch } from "./thread-workflow-shared";

export const THREAD_LIST_PAGE_SIZE = 100;
export const THREAD_LIST_MAX_PAGES = 20;

interface ThreadListResponse {
  data?: Thread[];
  nextCursor?: string | null;
}

export async function refreshThreads(
  client: CodexJsonRpcClient,
  dispatch: ThreadWorkflowDispatch,
) {
  dispatch({ type: "setThreadsLoading", value: true });
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
    dispatch({ type: "setThreadsLoading", value: false });
    dispatch({ type: "log", text: formatError(error), level: "error" });
  }
}

export function buildThreadListParams(cursor: string | null = null): Record<string, unknown> {
  /*
   * app-server narrows omitted `modelProviders` to the configured default
   * provider. Forge can start threads with a picker override such as
   * `openai::gpt-5.5` without rewriting config.toml, so list all providers to
   * keep those chats visible after a renderer reload.
   */
  return compactParams({
    archived: false,
    cursor,
    limit: THREAD_LIST_PAGE_SIZE,
    modelProviders: [],
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

export async function cleanBackgroundTerminalsForThread(client: CodexJsonRpcClient, threadId: string): Promise<void> {
  await client.request("thread/backgroundTerminals/clean", { threadId }, 120_000);
}
