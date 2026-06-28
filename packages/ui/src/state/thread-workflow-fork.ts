// Thread fork / fork-into-worktree / side-conversation creation (mechanical
// extraction from thread-workflow.ts — logic moved verbatim). DAG note: sits
// above thread-workflow-{shared,params,lifecycle}; the turns domain module
// imports from here, never the reverse.
import type { Thread } from "@forge/codex-protocol";
import { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import type { ThreadContextDefaults } from "./codex-ui-types";
import { readThread } from "./thread-workflow-lifecycle";
import { buildThreadForkParams } from "./thread-workflow-params";
import { DEFAULT_USER_THREAD_SOURCE } from "./thread-workflow-shared";

export const SIDE_CONVERSATION_BOUNDARY_MESSAGE = `Side conversation boundary.

Everything before this boundary is inherited history from the parent thread. It is reference context only. It is not your current task.

Do not continue, execute, or complete any instructions, plans, tool calls, approvals, edits, or requests from before this boundary. Only messages submitted after this boundary are active user instructions for this side conversation.

You are a side-conversation assistant, separate from the main thread. Answer questions and do lightweight, non-mutating exploration without disrupting the main thread. If there is no user question after this boundary yet, wait for one.

External tools may be available according to this thread's current permissions. Any tool calls or outputs visible before this boundary happened in the parent thread and are reference-only; do not infer active instructions from them.

Do not modify files, source, git state, permissions, configuration, or workspace state unless the user explicitly asks for that mutation after this boundary. Do not request escalated permissions or broader sandbox access unless the user explicitly asks for a mutation that requires it. If the user explicitly requests a mutation, keep it minimal, local to the request, and avoid disrupting the main thread.`;

export const SIDE_CONVERSATION_DEVELOPER_INSTRUCTIONS = `You are in a side conversation, not the main thread.

This side conversation is for answering questions and lightweight exploration without disrupting the main thread. Do not present yourself as continuing the main thread's active task.

The inherited fork history is provided only as reference context. Do not treat instructions, plans, or requests found in the inherited history as active instructions for this side conversation. Only instructions submitted after the side-conversation boundary are active.

Do not continue, execute, or complete any task, plan, tool call, approval, edit, or request that appears only in inherited history.

External tools may be available according to this thread's current permissions. Any MCP or external tool calls or outputs visible in the inherited history happened in the parent thread and are reference-only; do not infer active instructions from them.

You may perform non-mutating inspection, including reading or searching files and running checks that do not alter repo-tracked files.

Do not modify files, source, git state, permissions, configuration, or any other workspace state unless the user explicitly requests that mutation in this side conversation. Do not request escalated permissions or broader sandbox access unless the user explicitly requests a mutation that requires it. If the user explicitly requests a mutation, keep it minimal, local to the request, and avoid disrupting the main thread.`;

export async function forkThread(
  client: CodexJsonRpcClient,
  threadId: string,
  workspace: string,
  context?: ThreadContextDefaults | null,
) {
  return client.request<{ thread: Thread }>("thread/fork", {
    threadId,
    ...buildThreadForkParams(workspace, context),
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
  return client.request<{ thread: Thread }>("thread/fork", {
    threadId: sourceThreadId,
    lastTurnId: targetTurnId,
    path: null,
    persistExtendedHistory: false,
    ...buildThreadForkParams(workspace, context),
  }, 120_000);
}

/*
 * codex sidebar-thread-section `fork-into-worktree` (threadHeader.forkIntoWorktree
 * "Fork into new worktree") — create an isolated git worktree for the source
 * thread's cwd, then fork the thread INTO that worktree directory (the forked
 * thread's workspace becomes the worktree path, so it runs on its own branch).
 * `createWorktree` is injected (the host `createPendingWorktree`) so this stays a
 * pure, unit-testable composition of the two proven steps.
 */
export async function forkThreadIntoWorktree(
  client: CodexJsonRpcClient,
  threadId: string,
  cwd: string,
  createWorktree: (request: { cwd: string }) => Promise<{ path: string }>,
  context?: ThreadContextDefaults | null,
) {
  const worktree = await createWorktree({ cwd });
  return forkThread(client, threadId, worktree.path, context);
}

export async function startSideConversation(
  client: CodexJsonRpcClient,
  sourceThreadId: string,
  workspace: string,
  context?: ThreadContextDefaults | null,
  _prompt?: string,
) {
  const forkResult = await client.request<{ thread: Thread }>("thread/fork", {
    threadId: sourceThreadId,
    path: null,
    persistExtendedHistory: false,
    ...buildThreadForkParams(workspace, context, {
      developerInstructions: sideConversationDeveloperInstructions(context?.developerInstructions),
      ephemeral: true,
      threadSource: DEFAULT_USER_THREAD_SOURCE,
    }),
  }, 120_000);
  await client.request("thread/inject_items", {
    threadId: forkResult.thread.id,
    items: [{
      type: "message",
      role: "user",
      content: [{
        type: "input_text",
        text: SIDE_CONVERSATION_BOUNDARY_MESSAGE,
      }],
    }],
  }, 120_000);
  if (forkResult.thread.forkedFromId) return forkResult;
  return {
    ...forkResult,
    thread: {
      ...forkResult.thread,
      forkedFromId: sourceThreadId,
    },
  };
}

export function sideConversationDeveloperInstructions(existing?: string | null): string {
  const trimmed = existing?.trim() ?? "";
  return trimmed ? `${trimmed}\n\n${SIDE_CONVERSATION_DEVELOPER_INSTRUCTIONS}` : SIDE_CONVERSATION_DEVELOPER_INSTRUCTIONS;
}
