import {
  groupUnitsByTurn,
  isFinalAssistantUnit,
  isWorkedForUnit,
  shouldAllowTurnCollapse,
  shouldPreventTurnAutoCollapse,
  splitTurnUnits,
} from "../src/components/turn-collapse";
import { mcpAppResourceUri } from "../src/state/render-groups";
import type {
  AccumulatedThreadItem,
  ConversationRenderUnit,
} from "../src/state/render-groups";

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

export default function runTurnCollapseTests(): void {
  groupsConsecutiveUnitsByTurnId();
  identifiesWorkedForAndAssistantUnits();
  ignoresCommentaryAssistantMessagesAsFinalCollapseBoundary();
  splitsUserAgentAndFinalAssistantLikeDesktop();
  keepsSteeringUserMessagesPersistentWhenCollapsed();
  keepsMidTurnPlainUserMessagesPersistentWhenCollapsed();
  requiresFinalAssistantAndRenderableAgentItemsBeforeCollapse();
  preventsAutoCollapseForMcpAppToolCalls();
}

function makeUserUnit(turnId: string): ConversationRenderUnit {
  const item: AccumulatedThreadItem = {
    id: `user-${turnId}`,
    type: "userMessage",
    content: "hi",
    _turnId: turnId,
  };
  return {
    kind: "message",
    key: `u-${turnId}`,
    role: "user",
    item,
    text: "hi",
  };
}

function makeAssistantUnit(turnId: string, phase?: "commentary" | "final_answer"): ConversationRenderUnit {
  const item: AccumulatedThreadItem = {
    id: `agent-${turnId}`,
    type: "agentMessage",
    text: "ok",
    completed: true,
    _turnId: turnId,
  };
  return {
    kind: "message",
    key: `a-${turnId}`,
    role: "assistant",
    item,
    text: "ok",
    ...(phase ? { assistantPhase: phase } : {}),
  };
}

function makeWorkedForUnit(turnId: string): ConversationRenderUnit {
  const item: AccumulatedThreadItem = {
    id: `worked-for:${turnId}`,
    type: "worked-for",
    status: "completed",
    durationMs: 67_000,
    _turnId: turnId,
  };
  return {
    kind: "toolActivity",
    key: `w-${turnId}`,
    summary: {
      groupType: "worked-for",
      label: "Worked for 1m 7s",
      icon: "clock",
      activeDetail: null,
      details: [],
      inProgress: false,
      totalDurationMs: 67_000,
      counts: {
        commands: 0,
        webSearchCommands: 0,
        runningWebSearchCommands: 0,
        runningFolderCreationCommands: 0,
        exploredFiles: 0,
        searches: 0,
        lists: 0,
        fileChanges: 0,
        createdFiles: 0,
        editedFiles: 0,
        deletedFiles: 0,
        mcpCalls: 0,
        dynamicCalls: 0,
        webSearches: 0,
        reasoning: 0,
        plans: 0,
        other: 0,
      },
    },
    items: [item],
  };
}

function makeActivityUnit(turnId: string, id = "activity"): ConversationRenderUnit {
  const item: AccumulatedThreadItem = {
    id: `${id}-${turnId}`,
    type: "commandExecution",
    status: "completed",
    _turnId: turnId,
  };
  return {
    kind: "toolActivity",
    key: `${id}-${turnId}`,
    summary: {
      groupType: "collapsed-tool-activity",
      label: "Ran command",
      icon: "terminal",
      activeDetail: null,
      details: ["Ran command"],
      inProgress: false,
      totalDurationMs: null,
      counts: {
        commands: 1,
        webSearchCommands: 0,
        runningWebSearchCommands: 0,
        runningFolderCreationCommands: 0,
        exploredFiles: 0,
        searches: 0,
        lists: 0,
        fileChanges: 0,
        createdFiles: 0,
        editedFiles: 0,
        deletedFiles: 0,
        mcpCalls: 0,
        dynamicCalls: 0,
        webSearches: 0,
        reasoning: 0,
        plans: 0,
        other: 0,
      },
    },
    items: [item],
  };
}

function makeSteeringUserUnit(turnId: string): ConversationRenderUnit {
  const item: AccumulatedThreadItem = {
    id: `steering-${turnId}`,
    type: "userMessage",
    content: "continue",
    steeringStatus: "queued",
    _turnId: turnId,
  };
  return {
    kind: "message",
    key: `steering-${turnId}`,
    role: "user",
    item,
    text: "continue",
  };
}

function groupsConsecutiveUnitsByTurnId(): void {
  const units: ConversationRenderUnit[] = [
    makeUserUnit("t1"),
    makeWorkedForUnit("t1"),
    makeAssistantUnit("t1"),
    makeUserUnit("t2"),
    makeAssistantUnit("t2"),
  ];
  const groups = groupUnitsByTurn(units);
  assert(groups.length === 2, `expected 2 groups, got ${groups.length}`);
  assert(groups[0].turnId === "t1", "first group must be turn t1");
  assert(groups[0].units.length === 3, "turn t1 should aggregate three units");
  assert(groups[1].turnId === "t2" && groups[1].units.length === 2, "turn t2 should aggregate two units");
}

function identifiesWorkedForAndAssistantUnits(): void {
  const worked = makeWorkedForUnit("turn-1");
  const assistant = makeAssistantUnit("turn-1");
  const commentary = makeAssistantUnit("turn-1", "commentary");
  assert(isWorkedForUnit(worked), "worked-for unit must be detected");
  assert(!isWorkedForUnit(assistant), "assistant must not be flagged worked-for");
  assert(isFinalAssistantUnit(assistant), "assistant message unit must be detected");
  assert(!isFinalAssistantUnit(commentary), "commentary assistant messages must stay inside agent activity");
  assert(!isFinalAssistantUnit(worked), "worked-for must not be flagged assistant");
}

function ignoresCommentaryAssistantMessagesAsFinalCollapseBoundary(): void {
  const user = makeUserUnit("turn-1");
  const activity = makeActivityUnit("turn-1");
  const commentary = makeAssistantUnit("turn-1", "commentary");
  const tailActivity = makeActivityUnit("turn-1", "tail-activity");
  const split = splitTurnUnits([user, activity, commentary, tailActivity]);

  assert(!split.hasFinalAssistantStarted, "commentary should not start the final assistant collapse boundary");
  assert(split.trailingUnits.length === 0, "commentary must stay in the agent body, not trailing final output");
  assert(
    split.expandedAgentUnits.length === 3
      && split.expandedAgentUnits[0] === activity
      && split.expandedAgentUnits[1] === commentary
      && split.expandedAgentUnits[2] === tailActivity,
    "agent body should preserve activity, commentary, and following activity while the turn is running",
  );
}

function splitsUserAgentAndFinalAssistantLikeDesktop(): void {
  const user = makeUserUnit("turn-1");
  const activity = makeActivityUnit("turn-1");
  const worked = makeWorkedForUnit("turn-1");
  const assistant = makeAssistantUnit("turn-1");
  const split = splitTurnUnits([user, activity, worked, assistant]);

  assert(split.leadingUnits.length === 1 && split.leadingUnits[0] === user, "user message must stay outside collapse");
  assert(split.workedForUnit === worked, "worked-for unit should become the collapse label source");
  assert(split.expandedAgentUnits.length === 1 && split.expandedAgentUnits[0] === activity, "expanded content should contain agent activity");
  assert(split.collapsibleAgentUnits.length === 1 && split.collapsibleAgentUnits[0] === activity, "collapsible content should contain agent activity");
  assert(split.trailingUnits.length === 1 && split.trailingUnits[0] === assistant, "final assistant must stay outside collapse");
  assert(split.hasFinalAssistantStarted, "final assistant presence should allow the OT guard");
}

function keepsSteeringUserMessagesPersistentWhenCollapsed(): void {
  const user = makeUserUnit("turn-1");
  const activity = makeActivityUnit("turn-1");
  const steering = makeSteeringUserUnit("turn-1");
  const assistant = makeAssistantUnit("turn-1");
  const split = splitTurnUnits([user, activity, steering, assistant]);

  assert(split.expandedAgentUnits.length === 2, "expanded agent entries should include steering messages");
  assert(split.collapsibleAgentUnits.length === 1 && split.collapsibleAgentUnits[0] === activity, "steering message should not be collapsible");
  assert(split.persistentAgentUnits.length === 1 && split.persistentAgentUnits[0] === steering, "steering message should remain visible when collapsed");
}

function keepsMidTurnPlainUserMessagesPersistentWhenCollapsed(): void {
  // Regression (Image #12 bug): a mid-turn follow-up user message the backend
  // folded into the running turn — WITHOUT stamping steeringStatus — must stay
  // visible when the "Worked for" toggle collapses the turn. HiCodex never
  // populates steeringStatus today, so every mid-turn user message hits this
  // path; Codex keeps all user messages out of the collapsible body
  // (split-items `Lb`/`zb`: a user-message entry is never collapsible).
  const user = makeUserUnit("turn-1");
  const activity = makeActivityUnit("turn-1");
  const followUp: ConversationRenderUnit = {
    kind: "message",
    key: "followup-turn-1",
    role: "user",
    item: { id: "followup-turn-1", type: "userMessage", content: "follow up", _turnId: "turn-1" },
    text: "follow up",
  };
  const assistant = makeAssistantUnit("turn-1");
  const split = splitTurnUnits([user, activity, followUp, assistant]);

  assert(split.leadingUnits.length === 1 && split.leadingUnits[0] === user, "the leading user message stays outside the collapse");
  assert(
    split.collapsibleAgentUnits.length === 1 && split.collapsibleAgentUnits[0] === activity,
    "a plain mid-turn user message must NOT be collapsible — only agent work is",
  );
  assert(
    split.persistentAgentUnits.length === 1 && split.persistentAgentUnits[0] === followUp,
    "a plain mid-turn user message must stay visible when the turn is collapsed",
  );
}

function requiresFinalAssistantAndRenderableAgentItemsBeforeCollapse(): void {
  assert(
    shouldAllowTurnCollapse({
      hasFinalAssistantStarted: true,
      isTurnCancelled: false,
      hasRenderableAgentItems: true,
    }),
    "completed turn with agent items should allow collapse",
  );
  assert(
    !shouldAllowTurnCollapse({
      hasFinalAssistantStarted: false,
      isTurnCancelled: false,
      hasRenderableAgentItems: true,
    }),
    "running turn without final assistant should not collapse",
  );
  assert(
    !shouldAllowTurnCollapse({
      hasFinalAssistantStarted: true,
      isTurnCancelled: true,
      hasRenderableAgentItems: true,
    }),
    "cancelled turn should not collapse",
  );
}

function makeMcpToolCallUnit(
  options: { id: string; resourceUri?: string; inProgress: boolean },
): { unit: ConversationRenderUnit; item: AccumulatedThreadItem } {
  const item: AccumulatedThreadItem = {
    id: options.id,
    type: "mcp-tool-call",
    _turnId: "turn-1",
    status: options.inProgress ? "inProgress" : "completed",
    completed: !options.inProgress,
    invocation: { server: "demo", tool: "render" },
    ...(options.inProgress
      ? {}
      // Resolved MCP app: result success carrying the resource URI under _meta,
      // matching mcpAppResourceUri's _meta.ui.resourceUri resolution path.
      : { result: { type: "success", _meta: options.resourceUri ? { ui: { resourceUri: options.resourceUri } } : {} } }),
  };
  const unit: ConversationRenderUnit = {
    kind: "toolActivity",
    key: `tool-${options.id}`,
    items: [item],
    summary: {
      groupType: options.inProgress ? "pending-mcp-tool-calls" : "collapsed-tool-activity",
      label: options.inProgress ? "Waiting on MCP tool" : "Used demo",
      icon: "mcp",
      activeDetail: null,
      details: [],
      inProgress: options.inProgress,
      totalDurationMs: null,
      counts: {
        commands: 0,
        webSearchCommands: 0,
        runningWebSearchCommands: 0,
        runningFolderCreationCommands: 0,
        exploredFiles: 0,
        searches: 0,
        lists: 0,
        fileChanges: 0,
        createdFiles: 0,
        editedFiles: 0,
        deletedFiles: 0,
        mcpCalls: 1,
        dynamicCalls: 0,
        webSearches: 0,
        reasoning: 0,
        plans: 0,
        other: 0,
      },
    },
  };
  return { unit, item };
}

function preventsAutoCollapseForMcpAppToolCalls(): void {
  // CODEX-REF split-items-into-render-groups `dc`/`C`: the default-expanded
  // (preventAutoCollapse) state keys PURELY on the turn containing an MCP-app
  // tool-call (a successful mcp-tool-call resolving to an MCP-app resource URI),
  // NOT on in-progress / pending activity.

  // 1. An MCP-APP tool-call (resolved resource URI) prevents auto-collapse —
  //    even though it is completed, not in-progress.
  const app = makeMcpToolCallUnit({ id: "mcp-app", resourceUri: "ui://app/widget", inProgress: false });
  assert(
    Boolean(mcpAppResourceUri(app.item)),
    "fixture sanity: the MCP-app tool-call must resolve a resource URI",
  );
  assert(
    shouldPreventTurnAutoCollapse([app.unit]),
    "a completed MCP-app tool-call must prevent default auto-collapse (Codex `dc`)",
  );
  assert(
    splitTurnUnits([makeUserUnit("turn-1"), app.unit, makeAssistantUnit("turn-1")]).preventAutoCollapse,
    "split should carry MCP-app-driven preventAutoCollapse to the frame default",
  );

  // 2. A PENDING / in-progress MCP tool-call that is NOT an app no longer drives
  //    preventAutoCollapse — Codex dropped the in-progress trigger.
  const pendingNonApp = makeMcpToolCallUnit({ id: "mcp-pending", inProgress: true });
  assert(
    !mcpAppResourceUri(pendingNonApp.item),
    "fixture sanity: a pending non-app tool-call has no resource URI",
  );
  assert(
    !shouldPreventTurnAutoCollapse([pendingNonApp.unit]),
    "a pending/in-progress non-app tool-call must NOT drive preventAutoCollapse anymore",
  );

  // 3. A completed NON-app tool-call follows the normal auto-collapse path.
  const completedNonApp = makeMcpToolCallUnit({ id: "mcp-plain", inProgress: false });
  assert(
    !shouldPreventTurnAutoCollapse([completedNonApp.unit]),
    "a completed non-app MCP tool-call follows Desktop's normal auto-collapse path",
  );
}
