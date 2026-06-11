import {
  Brain,
  Check,
  CircleUserRound,
  Cloud,
  GitFork,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { stringField } from "../lib/format";
import type { HiCodexIntlContextValue } from "./i18n-provider";
import type { ConversationRenderUnit } from "../state/render-groups";
import { itemType } from "../state/thread-item-fields";
import type { OpenRemoteTaskHandler, OpenThreadHandler } from "./open-thread";

type FormatMessage = HiCodexIntlContextValue["formatMessage"];

function statusDividerIcon(type: string) {
  const className = "hc-status-event-kind-icon";
  if (type === "auto-review-interruption-warning") return <ShieldAlert className={className} size={16} aria-hidden="true" />;
  if (type === "model-changed") return <Brain className={className} size={16} aria-hidden="true" />;
  if (type === "personality-changed") return <CircleUserRound className={className} size={16} aria-hidden="true" />;
  if (type === "remote-task-created") return <Cloud className={className} size={14} aria-hidden="true" />;
  if (type === "forked-from-conversation") return <GitFork className={className} size={14} aria-hidden="true" />;
  return null;
}

export function statusDividerContent({
  contextStatus,
  formatMessage,
  inProgress,
  item,
  label,
  onOpenConversationThreadId,
  onOpenRemoteTask,
}: {
  contextStatus: boolean;
  formatMessage: FormatMessage;
  inProgress: boolean;
  item?: Extract<ConversationRenderUnit, { kind: "event" }>["item"];
  label: string;
  onOpenConversationThreadId?: OpenThreadHandler;
  onOpenRemoteTask?: OpenRemoteTaskHandler;
}) {
  if (contextStatus) {
    return (
      <>
        {!inProgress && <Check className="hc-status-event-icon" size={12} aria-hidden="true" />}
        {inProgress ? <span className="hc-thinking-shimmer-text">{label}</span> : label}
      </>
    );
  }
  const type = item ? itemType(item) : "";
  if (type === "remote-task-created") {
    const taskId = item ? stringField(item, "taskId") || stringField(item, "task_id") : "";
    const canOpen = Boolean(taskId && onOpenRemoteTask);
    const taskLabel = formatMessage({ id: "localConversation.remoteTaskCreated.task", defaultMessage: "task" });
    const taskLink = (
      <button
        className="hc-status-event-inline-link"
        disabled={!canOpen}
        type="button"
        onClick={canOpen ? () => onOpenRemoteTask?.(taskId) : undefined}
      >
        {taskLabel}
      </button>
    );
    const [before, after] = splitOnPlaceholder(
      formatMessage({ id: "localConversation.remoteTaskCreated", defaultMessage: "Created {taskLink} in Codex Cloud" }),
      "taskLink",
    );
    return (
      <>
        {statusDividerIcon(type)}
        <span className="hc-status-event-rich-text" aria-label={label}>
          {before}
          {taskLink}
          {after}
        </span>
      </>
    );
  }
  if (type === "forked-from-conversation") {
    const sourceConversationId = item
      ? stringField(item, "sourceConversationId") || stringField(item, "source_conversation_id")
      : "";
    const canOpen = Boolean(sourceConversationId && onOpenConversationThreadId);
    return (
      <>
        {statusDividerIcon(type)}
        <button
          className="hc-status-event-inline-link hc-status-event-fork-link"
          disabled={!canOpen}
          type="button"
          onClick={canOpen ? () => onOpenConversationThreadId?.(sourceConversationId) : undefined}
        >
          {formatMessage({ id: "localConversation.forkedFromConversation", defaultMessage: "Forked from conversation" })}
        </button>
      </>
    );
  }
  const warning = item ? statusDividerWarning(type, item, formatMessage) : null;
  return (
    <>
      {statusDividerIcon(type)}
      {label}
      {item && warning && <StatusEventWarning item={item} type={type} warning={warning} />}
    </>
  );
}

interface StatusEventWarningModel {
  ariaLabel: string;
  content: ReactNode;
  title: string;
}

function StatusEventWarning({
  item,
  type,
  warning,
}: {
  item: Extract<ConversationRenderUnit, { kind: "event" }>["item"];
  type: string;
  warning: StatusEventWarningModel;
}) {
  const tooltipId = statusEventTooltipId(type, item);
  return (
    <span className="hc-status-event-warning-wrap">
      <span
        aria-describedby={tooltipId}
        aria-label={warning.ariaLabel}
        className="hc-status-event-warning"
        role="img"
        tabIndex={0}
        title={warning.title}
      >
        <TriangleAlert size={12} aria-hidden="true" />
      </span>
      <span className="hc-status-event-tooltip" id={tooltipId} role="tooltip">
        {warning.content}
      </span>
    </span>
  );
}

function statusEventTooltipId(type: string, item: Extract<ConversationRenderUnit, { kind: "event" }>["item"]): string {
  const rawId = stringField(item, "id") || `${type}-warning`;
  return `hc-status-event-tooltip-${rawId.replace(/[^A-Za-z0-9_-]+/g, "-")}`;
}

function splitOnPlaceholder(message: string, name: string): [string, string] {
  const token = `{${name}}`;
  const index = message.indexOf(token);
  if (index < 0) return [message, ""];
  return [message.slice(0, index), message.slice(index + token.length)];
}

function statusDividerWarning(
  type: string,
  item: Extract<ConversationRenderUnit, { kind: "event" }>["item"],
  formatMessage: FormatMessage,
): StatusEventWarningModel | null {
  if (type === "auto-review-interruption-warning") {
    const line = formatMessage({
      id: "localConversation.autoReviewInterruptionWarning.nextSteps",
      defaultMessage:
        "Auto-review stopped this turn after repeated denials. Add more context or choose a different permission mode to continue.",
    });
    return {
      ariaLabel: "Auto-review interruption guidance",
      content: <span>{line}</span>,
      title: line,
    };
  }
  if (type === "model-changed") {
    const line1 = formatMessage({
      id: "localConversation.modelChanged.warning.line1",
      defaultMessage: "Changing models mid-conversation will degrade performance.",
    });
    const line2 = formatMessage({
      id: "localConversation.modelChanged.warning.line2",
      defaultMessage: "Context may automatically compact.",
    });
    return {
      ariaLabel: "Model change warning",
      content: (
        <>
          <span>{line1}</span>
          <span>{line2}</span>
        </>
      ),
      title: `${line1}\n${line2}`,
    };
  }
  if (type === "model-rerouted" && stringField(item, "reason") === "highRiskCyberActivity") {
    const line1 = formatMessage({
      id: "localConversation.modelRerouted.warning.line1",
      defaultMessage: "Heads up, your request was re-routed to reduce cyber-abuse risk.",
    });
    const line2 = formatMessage({
      id: "localConversation.modelRerouted.warning.line2",
      defaultMessage:
        "Think this is a mistake? Request a review at <link>chatgpt.com/cyber</link> or report via /feedback",
    });
    const link = /^([\s\S]*?)<link>([\s\S]*?)<\/link>([\s\S]*)$/.exec(line2);
    const line2Prefix = link ? link[1] : line2;
    const linkText = link ? link[2] : "chatgpt.com/cyber";
    const line2Suffix = link ? link[3] : "";
    return {
      ariaLabel: "Model reroute warning",
      content: (
        <>
          <span>{line1}</span>
          <span>
            {line2Prefix}
            <a href="https://chatgpt.com/cyber" rel="noreferrer" target="_blank">{linkText}</a>
            {line2Suffix}
          </span>
        </>
      ),
      title: `${line1}\n${line2Prefix}${linkText}${line2Suffix}`,
    };
  }
  return null;
}

export function userInputResponseDetailRows(details: string): Array<{ question: string; answer: string }> {
  return details.split(/\n{2,}/).flatMap((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) return [];
    return [{ question: lines[0] ?? "Question", answer: lines.slice(1).join("\n") || "No answer provided" }];
  });
}
