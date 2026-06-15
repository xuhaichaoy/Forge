// Shared leaf of the thread-workflow module family: the dispatch alias, the
// cross-domain option/response types, shared constants, thread error
// predicates, and tiny pure helpers (mechanical extraction from
// thread-workflow.ts — logic moved verbatim). DAG note: every other
// thread-workflow-* domain module imports from this leaf; never import a
// thread-workflow sibling here, or the family stops being a DAG.
import type { Dispatch } from "react";
import type { CollaborationMode, Thread } from "@forge/codex-protocol";
import type { ThreadSource } from "@forge/codex-protocol/generated/v2/ThreadSource";
import { formatError, stringField } from "../lib/format";
import type { CodexUiAction } from "./codex-ui-types";

export type ThreadWorkflowDispatch = Dispatch<CodexUiAction>;

export interface TurnStartOptions {
  collaborationMode?: CollaborationMode | null;
}

export interface ThreadCreationOptions {
  includeDynamicTools?: boolean;
  threadSource?: ThreadSource | null;
}

export interface ThreadRuntimeContextResponse {
  thread: Thread;
  model?: string | null;
  modelProvider?: string | null;
  serviceTier?: unknown;
  reasoningEffort?: unknown;
}

export const DEFAULT_USER_THREAD_SOURCE: ThreadSource = "user";

export type WorkspaceDeveloperInstructionReader = (path: string, maxBytes?: number) => Promise<string>;
export type WorkspacePathExistsReader = (path: string) => Promise<boolean>;

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

export function trimmedStringField(value: unknown, key: string): string {
  return stringField(value, key).trim();
}

export function normalizedCwd(workspace: string): string | null {
  return workspace.trim() || null;
}

export function compactParams(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

export function stringOverride(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
