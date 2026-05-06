import type { Dispatch } from "react";
import type { Thread, UserInput } from "@hicodex/codex-protocol";
import { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError, formatUnknown, stringField } from "../lib/format";
import { codexUiReducer } from "./codex-reducer";

export type ThreadWorkflowDispatch = Dispatch<Parameters<typeof codexUiReducer>[1]>;

export async function refreshThreads(
  client: CodexJsonRpcClient,
  dispatch: ThreadWorkflowDispatch,
) {
  try {
    const result = await client.request<{ data?: Thread[] }>("thread/list", {});
    dispatch({ type: "setThreads", threads: result.data ?? [] });
  } catch (error) {
    dispatch({ type: "log", text: formatError(error), level: "error" });
  }
}

export async function startThread(client: CodexJsonRpcClient, workspace: string) {
  return client.request<{ thread?: Thread }>("thread/start", {
    cwd: workspace.trim() || null,
  });
}

export async function createAndSelectThreadForTurn(
  client: CodexJsonRpcClient,
  workspace: string,
  threads: Thread[],
  dispatch: ThreadWorkflowDispatch,
): Promise<string | null> {
  const result = await startThread(client, workspace);
  const threadId = result.thread?.id ?? null;
  if (result.thread) {
    dispatch({ type: "setThreads", threads: [result.thread, ...threads] });
    dispatch({ type: "setActiveThread", threadId });
  }
  return threadId;
}

export async function startTurn(
  client: CodexJsonRpcClient,
  threadId: string,
  input: UserInput[],
  workspace: string,
) {
  return client.request("turn/start", {
    threadId,
    input,
    cwd: workspace.trim() || null,
  });
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
  });
}

export function threadTitle(thread: Thread): string {
  return stringField(thread, "name") || stringField(thread, "preview") || shortId(thread.id);
}

export function threadStatusLabel(status: unknown): string {
  if (status === null || status === undefined) return "notLoaded";
  if (typeof status === "string") return status;
  if (typeof status === "number" || typeof status === "boolean") return String(status);
  if (typeof status === "object") {
    const record = status as Record<string, unknown>;
    return stringField(record, "type") || stringField(record, "status") || formatUnknown(status);
  }
  return String(status);
}

export function isThreadNotFound(error: unknown): boolean {
  return formatError(error).toLowerCase().includes("thread not found");
}

export function isThreadNotMaterialized(error: unknown): boolean {
  const message = formatError(error).toLowerCase();
  return message.includes("not materialized yet") || message.includes("includeturns is unavailable");
}

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id;
}
