import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BackgroundAgentPanel } from "../src/components/background-agent-panel";
import {
  nextSideChatTitle,
  projectSideChatRailEntries,
  type SideChatSummary,
} from "../src/hooks/use-background-agent-panel";

function assert(value: unknown, message: string): void {
  if (!value) throw new Error(message);
}

export default function runBackgroundAgentPanelTests(): void {
  rendersSideChatComposerControls();
  disablesPanelComposerWhileLoading();
  rendersPanelStopControlForRunningTurns();
  disablesPanelStopControlWhileInterrupting();
  projectsSideChatRailEntriesForReopeningPanelThreads();
}

function rendersSideChatComposerControls(): void {
  const html = renderToStaticMarkup(createElement(BackgroundAgentPanel, {
    kind: "sideChat",
    status: "idle",
    subtitle: "side-thread · idle",
    threadId: "side-thread",
    title: "Side chat",
    units: [],
    messageDraft: "follow up",
    onClose: () => {},
    onMessageDraftChange: () => {},
    onSendMessage: () => {},
  }));

  assert(html.includes("hc-background-agent-composer"), "side chat panel should render a composer surface");
  assert(html.includes("aria-label=\"Message side chat\""), "side chat composer should target the side panel thread");
  assert(html.includes("follow up"), "side chat composer should render the current draft");
  assert(!html.includes("disabled=\"\""), "ready side chat composer should allow sending non-empty drafts");
}

function disablesPanelComposerWhileLoading(): void {
  const html = renderToStaticMarkup(createElement(BackgroundAgentPanel, {
    kind: "backgroundAgent",
    loading: true,
    status: "loading",
    subtitle: "agent-thread · loading",
    threadId: "agent-thread",
    title: "Explorer",
    units: [],
    messageDraft: "check status",
    onClose: () => {},
    onMessageDraftChange: () => {},
    onSendMessage: () => {},
  }));

  assert(html.includes("aria-label=\"Message background agent\""), "background agent composer should be present");
  assert(html.includes("disabled=\"\""), "loading background agent panel should disable its composer controls");
}

function rendersPanelStopControlForRunningTurns(): void {
  const html = renderToStaticMarkup(createElement(BackgroundAgentPanel, {
    canInterrupt: true,
    kind: "sideChat",
    status: "running",
    subtitle: "side-thread · running",
    threadId: "side-thread",
    title: "Side chat",
    units: [],
    onClose: () => {},
    onInterrupt: () => {},
  }));

  assert(html.includes("aria-label=\"Stop side chat turn\""), "running side chat should expose a panel stop control");
  assert(!html.includes("title=\"Stopping\""), "ready stop control should not show the stopping state");
}

function disablesPanelStopControlWhileInterrupting(): void {
  const html = renderToStaticMarkup(createElement(BackgroundAgentPanel, {
    canInterrupt: true,
    interrupting: true,
    kind: "backgroundAgent",
    status: "running",
    subtitle: "agent-thread · running",
    threadId: "agent-thread",
    title: "Explorer",
    units: [],
    onClose: () => {},
    onInterrupt: () => {},
  }));

  assert(html.includes("aria-label=\"Stop background agent turn\""), "background agent should label its stop control");
  assert(html.includes("title=\"Stopping\""), "interrupting panel should show the stopping state");
  assert(html.includes("disabled=\"\""), "interrupting panel should disable the stop control");
}

function projectsSideChatRailEntriesForReopeningPanelThreads(): void {
  const existing: SideChatSummary[] = [{
    threadId: "side-1",
    parentThreadId: "main-1",
    title: "Side chat",
    model: "gpt-5.2",
    createdAt: 1,
  }];
  assert(
    nextSideChatTitle(existing, "side-2") === "Side chat 2",
    "subsequent side chats should get Desktop-style numbered titles",
  );

  const entries = projectSideChatRailEntries([
    ...existing,
    {
      threadId: "side-2",
      parentThreadId: "main-1",
      title: "Side chat 2",
      model: null,
      createdAt: 2,
    },
  ], [
    threadFixture("side-1", { status: { type: "idle" } }),
    threadFixture("side-2", { status: { type: "running" } }),
  ], {
    "side-2": {
      activeTurnId: "turn-running",
      items: [],
      turnOrder: [],
      pendingOptimisticTurns: [],
      latestCollaborationMode: null,
      turnPlan: null,
      turnDiff: "",
      composerMode: null,
      threadGoal: null,
      threadGoalTurnId: null,
      terminalTurnIds: [],
    },
  });

  assert(entries.length === 2, "side chat projection should keep every opened side chat for the parent thread");
  assert(entries[0]?.title === "Side chat", "first side chat should keep the base title");
  assert(entries[1]?.title === "Side chat 2", "second side chat should keep the numbered title");
  assert(entries[1]?.status === "active", "running side chat should project as active");
  assert(
    JSON.stringify(entries[1]?.action) === JSON.stringify({
      kind: "thread",
      threadId: "side-2",
      displayName: "Side chat 2",
      model: null,
      role: null,
    }),
    "side chat rail action should reopen the panel thread without selecting the main route",
  );
}

function threadFixture(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    forkedFromId: "main-1",
    preview: "",
    ephemeral: true,
    modelProvider: "openai",
    createdAt: 0,
    updatedAt: 0,
    status: { type: "idle" },
    path: null,
    cwd: "/workspace",
    cliVersion: "test",
    source: "appServer",
    threadSource: null,
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name: null,
    turns: [],
    ...overrides,
  } as never;
}
