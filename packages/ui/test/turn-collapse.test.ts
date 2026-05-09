import {
  groupUnitsByTurn,
  isFinalAssistantUnit,
  isWorkedForUnit,
  shouldAllowTurnCollapse,
  shouldPreventTurnAutoCollapse,
  splitTurnUnits,
} from "../src/components/turn-collapse";
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
  splitsUserAgentAndFinalAssistantLikeDesktop();
  keepsSteeringUserMessagesPersistentWhenCollapsed();
  requiresFinalAssistantAndRenderableAgentItemsBeforeCollapse();
  preventsAutoCollapseForDesktopPendingToolContent();
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

function makeAssistantUnit(turnId: string): ConversationRenderUnit {
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
  assert(isWorkedForUnit(worked), "worked-for unit must be detected");
  assert(!isWorkedForUnit(assistant), "assistant must not be flagged worked-for");
  assert(isFinalAssistantUnit(assistant), "assistant message unit must be detected");
  assert(!isFinalAssistantUnit(worked), "worked-for must not be flagged assistant");
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

function preventsAutoCollapseForDesktopPendingToolContent(): void {
  const pendingMcp: AccumulatedThreadItem = {
    id: "mcp-1",
    type: "mcp-tool-call",
    status: "inProgress",
    _turnId: "turn-1",
  };
  const pendingUnit: ConversationRenderUnit = {
    kind: "toolActivity",
    key: "pending-mcp",
    items: [pendingMcp],
    summary: {
      groupType: "pending-mcp-tool-calls",
      label: "Waiting on MCP tool",
      icon: "mcp",
      activeDetail: null,
      details: [],
      inProgress: true,
      totalDurationMs: null,
      counts: {
        commands: 0,
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

  assert(shouldPreventTurnAutoCollapse([pendingUnit]), "pending MCP/app tool content should prevent default auto-collapse");
  assert(splitTurnUnits([makeUserUnit("turn-1"), pendingUnit, makeAssistantUnit("turn-1")]).preventAutoCollapse, "split should carry preventAutoCollapse to frame default");
}
