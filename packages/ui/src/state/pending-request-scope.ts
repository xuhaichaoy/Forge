import type { PendingServerRequest } from "./codex-reducer";

export interface PendingRequestScope {
  threadId: string | null;
  turnId: string | null;
  itemId: string | null;
  hasScope: boolean;
}

export interface ActivePendingRequestContext {
  threadId?: string | null;
  turnId?: string | null;
  activeThreadId?: string | null;
  activeTurnId?: string | null;
  activeItemIds?: Iterable<string> | null;
}

export interface PendingRequestThreadSummaryContext {
  itemsByThread?: Record<string, Array<{ id?: string }>> | null;
}

export interface ComposerPendingRequestContext extends ActivePendingRequestContext {
  backgroundThreadIds?: Iterable<string> | null;
  itemsByThread?: Record<string, Array<{ id?: string }>> | null;
}

export interface BackgroundPendingRequestContext extends PendingRequestThreadSummaryContext {
  activeThreadId?: string | null;
  backgroundThreadIds?: Iterable<string> | null;
}

export type PendingRequestAwaitingKind = "approval" | "userInput" | "toolCall" | "request";

export type PendingRequestAwaitingFlag =
  | "waitingOnApproval"
  | "waitingOnUserInput"
  | "waitingOnToolCall"
  | "waitingOnRequest";

export interface PendingRequestThreadAwaiting {
  threadId: string;
  requestIds: string[];
  latestCreatedAt: number;
  totalCount: number;
  approvalCount: number;
  userInputCount: number;
  toolCallCount: number;
  requestCount: number;
  awaiting: boolean;
  awaitingApproval: boolean;
  awaitingUserInput: boolean;
  awaitingToolCall: boolean;
  awaitingRequest: boolean;
  flags: PendingRequestAwaitingFlag[];
}

export type PendingRequestThreadAwaitingMap = Record<string, PendingRequestThreadAwaiting>;

export function pendingRequestScope(request: PendingServerRequest): PendingRequestScope {
  const paramsScope = scopeFromValue(request.params);
  const payloadScope = scopeFromValue((request as unknown as Record<string, unknown>).payload);
  const threadId = paramsScope.threadId ?? payloadScope.threadId;
  const turnId = paramsScope.turnId ?? payloadScope.turnId;
  const itemId = paramsScope.itemId ?? payloadScope.itemId;

  return {
    threadId,
    turnId,
    itemId,
    hasScope: threadId !== null || turnId !== null || itemId !== null,
  };
}

export function deriveActivePendingRequests(
  requests: PendingServerRequest[],
  context: ActivePendingRequestContext,
): PendingServerRequest[] {
  const activeThreadId = normalizedString(context.threadId ?? context.activeThreadId);
  const activeTurnId = normalizedString(context.turnId ?? context.activeTurnId);
  const activeItemIds = itemIdSet(context.activeItemIds);

  return dedupePendingRequests(requests)
    .filter((request) => pendingRequestMatchesActiveScope(request, activeThreadId, activeTurnId, activeItemIds))
    .sort(comparePendingRequests);
}

export function deriveComposerPendingRequests(
  requests: PendingServerRequest[],
  context: ComposerPendingRequestContext,
): PendingServerRequest[] {
  const activeRequests = deriveActivePendingRequests(requests, context);
  const backgroundThreadIds = idList(context.backgroundThreadIds);
  if (backgroundThreadIds.length === 0) return activeRequests;

  const activeRequestIds = new Set(activeRequests.map((request) => String(request.id)));
  const backgroundCandidates = dedupePendingRequests(requests)
    .filter((request) => {
      if (activeRequestIds.has(String(request.id))) return false;
      /*
       * CODEX-REF: composer-zFOdryLS.pretty.js child pending panel uses `af`
       * -> app-server manager `h_`, and `h_` only returns child `{type:"approval"}`
       * from command/file approval requests. Active-thread `f_` handles userInput,
       * optionPicker, permissionRequest, and MCP elicitations; child promotion
       * does not.
       */
      if (!isDesktopChildPromotedPendingRequest(request)) return false;
      const threadId = pendingRequestOwnerThreadId(request, context);
      return threadId !== null && backgroundThreadIds.includes(threadId);
    })
    .sort(comparePendingRequests);
  const backgroundRequest = backgroundThreadIds.flatMap((threadId) =>
    backgroundCandidates.filter((request) => {
      return pendingRequestOwnerThreadId(request, context) === threadId;
    }),
  )[0] ?? null;

  return backgroundRequest ? [backgroundRequest, ...activeRequests] : activeRequests;
}

export function deriveBackgroundPendingRequests(
  requests: PendingServerRequest[],
  context: BackgroundPendingRequestContext,
): PendingServerRequest[] {
  const activeThreadId = normalizedString(context.activeThreadId);
  const backgroundThreadIds = idList(context.backgroundThreadIds)
    .filter((threadId) => threadId !== activeThreadId);
  if (backgroundThreadIds.length === 0) return [];

  const backgroundThreadIdSet = new Set(backgroundThreadIds);
  return dedupePendingRequests(requests)
    .filter((request) => {
      const threadId = pendingRequestOwnerThreadId(request, context);
      return threadId !== null && backgroundThreadIdSet.has(threadId);
    })
    .sort((left, right) => {
      const leftThreadIndex = backgroundThreadIds.indexOf(pendingRequestOwnerThreadId(left, context) ?? "");
      const rightThreadIndex = backgroundThreadIds.indexOf(pendingRequestOwnerThreadId(right, context) ?? "");
      return leftThreadIndex === rightThreadIndex
        ? comparePendingRequests(left, right)
        : leftThreadIndex - rightThreadIndex;
    });
}

export function pendingRequestOwnerThreadId(
  request: PendingServerRequest,
  context: PendingRequestThreadSummaryContext = {},
): string | null {
  const scope = pendingRequestScope(request);
  return scope.threadId ?? threadIdForItemId(scope.itemId, context.itemsByThread ?? null);
}

export function pendingRequestMatchesActiveScope(
  request: PendingServerRequest,
  activeThreadId: string | null,
  activeTurnId: string | null,
  activeItemIds: ReadonlySet<string> | null = null,
): boolean {
  const scope = pendingRequestScope(request);
  if (!scope.hasScope) return true;

  if (scope.threadId !== null && scope.threadId !== activeThreadId) return false;
  if (scope.turnId !== null && scope.turnId !== activeTurnId) return false;

  if (scope.threadId !== null || scope.turnId !== null) return true;
  return scope.itemId !== null && activeItemIds !== null && activeItemIds.has(scope.itemId);
}

export function summarizePendingRequestAwaitingByThread(
  requests: PendingServerRequest[],
  context: PendingRequestThreadSummaryContext = {},
): PendingRequestThreadAwaitingMap {
  return requests.reduce<PendingRequestThreadAwaitingMap>((summaries, request) => {
    const threadId = pendingRequestOwnerThreadId(request, context);
    if (threadId === null) return summaries;

    const summary = summaries[threadId] ?? emptyThreadAwaiting(threadId);
    addRequestToThreadAwaiting(summary, request);
    summaries[threadId] = summary;
    return summaries;
  }, {});
}

export function pendingRequestAwaitingKind(request: PendingServerRequest): PendingRequestAwaitingKind {
  switch (request.method) {
    case "item/commandExecution/requestApproval":
    case "execCommandApproval":
    case "item/fileChange/requestApproval":
    case "applyPatchApproval":
    case "item/permissions/requestApproval":
      return "approval";
    case "item/tool/requestUserInput":
    case "item/tool/requestOptionPicker":
    case "item/tool/requestSetupCodexContextPicker":
    case "mcpServer/elicitation/request":
      return "userInput";
    case "item/tool/call":
      return isDynamicInputToolRequest(request) ? "userInput" : "toolCall";
    default:
      return "request";
  }
}

function isDesktopChildPromotedPendingRequest(request: PendingServerRequest): boolean {
  switch (request.method) {
    case "item/commandExecution/requestApproval":
    case "execCommandApproval":
    case "item/fileChange/requestApproval":
    case "applyPatchApproval":
      return true;
    default:
      return false;
  }
}

function isDynamicInputToolRequest(request: PendingServerRequest): boolean {
  if (request.method !== "item/tool/call") return false;
  const params = objectRecord(request.params);
  const tool = normalizedString(params?.tool);
  return tool === "request_onboarding_input"
    || tool === "request_option_picker"
    || tool === "setup_codex_context_picker";
}

function scopeFromValue(value: unknown): Omit<PendingRequestScope, "hasScope"> {
  const record = objectRecord(value);
  if (!record) return emptyScopeFields();

  return mergeScopes(
    {
      threadId: idField(record, ["threadId", "thread_id"]),
      turnId: idField(record, ["turnId", "turn_id"]),
      itemId: idField(record, ["itemId", "item_id"]),
    },
    scopeFromNamedObject(record, "payload"),
    scopeFromNamedObject(record, "request"),
    scopeFromNamedObject(record, "context"),
    scopeFromNamedObject(record, "metadata"),
    scopeFromNestedId(record, "thread", "threadId"),
    scopeFromNestedId(record, "turn", "turnId"),
    scopeFromNestedId(record, "item", "itemId"),
  );
}

function scopeFromNamedObject(
  record: Record<string, unknown>,
  key: string,
): Omit<PendingRequestScope, "hasScope"> {
  return scopeFromValue(record[key]);
}

function scopeFromNestedId(
  record: Record<string, unknown>,
  key: string,
  idName: keyof Omit<PendingRequestScope, "hasScope">,
): Omit<PendingRequestScope, "hasScope"> {
  const nested = objectRecord(record[key]);
  if (!nested) return emptyScopeFields();
  return {
    threadId: idName === "threadId" ? idField(nested, ["id", "threadId", "thread_id"]) : null,
    turnId: idName === "turnId" ? idField(nested, ["id", "turnId", "turn_id"]) : null,
    itemId: idName === "itemId" ? idField(nested, ["id", "itemId", "item_id"]) : null,
  };
}

function mergeScopes(
  ...scopes: Omit<PendingRequestScope, "hasScope">[]
): Omit<PendingRequestScope, "hasScope"> {
  return scopes.reduce<Omit<PendingRequestScope, "hasScope">>((merged, scope) => ({
    threadId: merged.threadId ?? scope.threadId,
    turnId: merged.turnId ?? scope.turnId,
    itemId: merged.itemId ?? scope.itemId,
  }), emptyScopeFields());
}

function emptyScopeFields(): Omit<PendingRequestScope, "hasScope"> {
  return { threadId: null, turnId: null, itemId: null };
}

function idField(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = normalizedString(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function normalizedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function emptyThreadAwaiting(threadId: string): PendingRequestThreadAwaiting {
  return {
    threadId,
    requestIds: [],
    latestCreatedAt: 0,
    totalCount: 0,
    approvalCount: 0,
    userInputCount: 0,
    toolCallCount: 0,
    requestCount: 0,
    awaiting: false,
    awaitingApproval: false,
    awaitingUserInput: false,
    awaitingToolCall: false,
    awaitingRequest: false,
    flags: [],
  };
}

function addRequestToThreadAwaiting(
  summary: PendingRequestThreadAwaiting,
  request: PendingServerRequest,
): void {
  summary.requestIds.push(String(request.id));
  summary.latestCreatedAt = Math.max(summary.latestCreatedAt, request.createdAt);
  summary.totalCount += 1;
  summary.awaiting = true;

  const kind = pendingRequestAwaitingKind(request);
  if (kind === "approval") {
    summary.approvalCount += 1;
    summary.awaitingApproval = true;
    addFlag(summary.flags, "waitingOnApproval");
  } else if (kind === "userInput") {
    summary.userInputCount += 1;
    summary.awaitingUserInput = true;
    addFlag(summary.flags, "waitingOnUserInput");
  } else if (kind === "toolCall") {
    summary.toolCallCount += 1;
    summary.awaitingToolCall = true;
    addFlag(summary.flags, "waitingOnToolCall");
  } else {
    summary.requestCount += 1;
    summary.awaitingRequest = true;
    addFlag(summary.flags, "waitingOnRequest");
  }
}

function addFlag(flags: PendingRequestAwaitingFlag[], flag: PendingRequestAwaitingFlag): void {
  if (!flags.includes(flag)) flags.push(flag);
}

function itemIdSet(value: Iterable<string> | null | undefined): ReadonlySet<string> | null {
  if (!value) return null;
  const ids = new Set<string>();
  for (const item of value) {
    const id = normalizedString(item);
    if (id) ids.add(id);
  }
  return ids;
}

function idList(value: Iterable<string> | null | undefined): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of value) {
    const id = normalizedString(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function dedupePendingRequests(requests: PendingServerRequest[]): PendingServerRequest[] {
  const byId = new Map<string, PendingServerRequest>();
  for (const request of requests) {
    byId.set(String(request.id), request);
  }
  return Array.from(byId.values());
}

function comparePendingRequests(left: PendingServerRequest, right: PendingServerRequest): number {
  const priority = requestPriority(left) - requestPriority(right);
  if (priority !== 0) return priority;
  const createdAt = left.createdAt - right.createdAt;
  if (createdAt !== 0) return createdAt;
  return 0;
}

function requestPriority(request: PendingServerRequest): number {
  const kind = pendingRequestAwaitingKind(request);
  if (kind === "approval") return 0;
  if (kind === "userInput") return 1;
  if (kind === "toolCall") return 2;
  return 3;
}

function threadIdForItemId(
  itemId: string | null,
  itemsByThread: Record<string, Array<{ id?: string }>> | null,
): string | null {
  if (!itemId || !itemsByThread) return null;
  for (const [threadId, items] of Object.entries(itemsByThread)) {
    if (items.some((item) => item.id === itemId)) return threadId;
  }
  return null;
}
