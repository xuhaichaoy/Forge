import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueuedFollowUpStack } from "../src/components/queued-follow-up-stack";
import { INTERRUPTED_STEER_PAUSED_REASON } from "../src/state/queued-followups";

export default function runQueuedFollowUpStackTests(): void {
  hidesInterruptedPausedReasonBehindQueueHeader();
  rendersRunEndedPausedReasonOnTheRow();
}

function hidesInterruptedPausedReasonBehindQueueHeader(): void {
  const html = renderToStaticMarkup(createElement(QueuedFollowUpStack, {
    messages: [{
      id: "queued-1",
      text: "continue",
      attachments: [],
      cwd: "/tmp/project",
      createdAt: 1,
      status: "queued",
      pausedReason: INTERRUPTED_STEER_PAUSED_REASON,
    }],
    isInterrupted: true,
    isQueueingEnabled: true,
    onDelete: () => undefined,
    onEdit: () => undefined,
    onQueueingChange: () => undefined,
    onReorder: () => undefined,
    onResumeInterruptedQueue: () => undefined,
    onSendNow: () => undefined,
  }));

  assertIncludes(html, "Queue paused because you interrupted", "interrupted queue should show the queue-level header");
  assertNotIncludes(html, "hc-queued-followup-warning", "interrupted reason should not render a duplicate row warning");
}

function rendersRunEndedPausedReasonOnTheRow(): void {
  const html = renderToStaticMarkup(createElement(QueuedFollowUpStack, {
    messages: [{
      id: "queued-1",
      text: "continue",
      attachments: [],
      cwd: "/tmp/project",
      createdAt: 1,
      status: "queued",
      pausedReason: "Run ended before the steer was accepted.",
    }],
    isInterrupted: false,
    isQueueingEnabled: true,
    onDelete: () => undefined,
    onEdit: () => undefined,
    onQueueingChange: () => undefined,
    onReorder: () => undefined,
    onResumeInterruptedQueue: () => undefined,
    onSendNow: () => undefined,
  }));

  assertIncludes(html, "hc-queued-followup-warning", "non-interrupted paused reason should stay visible on the row");
  assertIncludes(html, "Run ended before the steer was accepted.", "row warning should expose the run-ended reason");
}

function assertIncludes(html: string, text: string, message: string): void {
  if (!html.includes(text)) throw new Error(`${message}: missing ${text}`);
}

function assertNotIncludes(html: string, text: string, message: string): void {
  if (html.includes(text)) throw new Error(`${message}: unexpectedly found ${text}`);
}
