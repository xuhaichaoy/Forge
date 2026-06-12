import { ChevronDown, ChevronRight, Clock, LoaderCircle, Terminal } from "lucide-react";
import { useState } from "react";
import type { ConversationRenderUnit, EventFormat, EventTone } from "../state/render-groups";
import { itemType } from "../state/thread-item-fields";
import { AnimatedDisclosure } from "./animated-disclosure";
import {
  statusDividerContent,
  userInputResponseDetailRows,
} from "./event-status-divider";
import type { FileReference } from "./file-reference-types";
import { useHiCodexIntl } from "./i18n-provider";
import { Markdownish } from "./message-markdown-renderer";
import type { OpenRemoteTaskHandler, OpenThreadHandler } from "./open-thread";
import { TurnDiffBlock, type PatchAction, type PatchActionState } from "./turn-diff-block";

export function ToolBlock({
  contentSearchUnitKey,
  details,
  format = "text",
  item,
  itemIds,
  label,
  inProgress = false,
  onOpenFileReference,
  onOpenConversationThreadId,
  onOpenDiff,
  onOpenRemoteTask,
  onPatchAction,
  patchActionState,
  patchActionInFlight,
  tone,
  value,
}: {
  contentSearchUnitKey?: string;
  details?: string;
  format?: EventFormat;
  inProgress?: boolean;
  item?: Extract<ConversationRenderUnit, { kind: "event" }>["item"];
  itemIds?: string;
  label: string;
  onOpenConversationThreadId?: OpenThreadHandler;
  onOpenDiff?: () => void;
  onOpenFileReference?: (reference: FileReference) => void;
  onOpenRemoteTask?: OpenRemoteTaskHandler;
  onPatchAction?: (action: PatchAction, diff: string) => void;
  patchActionState?: PatchActionState;
  patchActionInFlight?: boolean;
  tone?: "terminal" | EventTone;
  value: string;
}) {
  const { formatMessage } = useHiCodexIntl();
  const [streamErrorExpanded, setStreamErrorExpanded] = useState(false);
  const [userInputExpanded, setUserInputExpanded] = useState(false);
  if (format === "diff") {
    return (
      <TurnDiffBlock
        contentSearchUnitKey={contentSearchUnitKey}
        inProgress={inProgress}
        itemIds={itemIds}
        onOpenDiff={onOpenDiff}
        onPatchAction={onPatchAction}
        patchActionState={patchActionState}
        patchActionInFlight={patchActionInFlight}
        value={value}
      />
    );
  }
  if (format === "status" || format === "divider-status" || format === "context-status") {
    const dividerStatus = format === "divider-status" || format === "context-status";
    const contextStatus = format === "context-status";
    const statusContent = dividerStatus
      ? statusDividerContent({
          contextStatus,
          formatMessage,
          inProgress,
          item,
          label,
          onOpenConversationThreadId,
          onOpenRemoteTask,
        })
      : label;
    return (
      <article
        className={`hc-status-event ${dividerStatus ? "hc-status-event-divider" : ""}`}
        data-content-search-unit-key={contentSearchUnitKey}
        data-item-ids={itemIds}
        data-item-type={item ? itemType(item) : undefined}
        data-running={dividerStatus && inProgress ? "true" : undefined}
      >
        {dividerStatus && <span className="hc-status-event-rule" aria-hidden="true" />}
        <span className="hc-status-event-label">
          {statusContent}
        </span>
        {dividerStatus && <span className="hc-status-event-rule" aria-hidden="true" />}
      </article>
    );
  }
  if (format === "automation-update") {
    return (
      <article
        className="hc-automation-update-event"
        data-content-search-unit-key={contentSearchUnitKey}
        data-item-ids={itemIds}
      >
        <Clock aria-hidden className="hc-automation-update-icon" size={14} />
        <span className="hc-automation-update-text">{value || label}</span>
      </article>
    );
  }
  if (format === "user-input-response") {
    if (inProgress) {
      return (
        <article
          className="hc-user-input-response-event is-pending"
          data-content-search-unit-key={contentSearchUnitKey}
          data-item-ids={itemIds}
          data-running="true"
        >
          <div className="hc-user-input-response-summary">
            <LoaderCircle aria-hidden className="hc-user-input-response-spinner" size={14} />
            <span className="hc-user-input-response-summary-text">{value || label}</span>
          </div>
        </article>
      );
    }
    const hasDetails = Boolean(details?.trim());
    const rows = hasDetails ? userInputResponseDetailRows(details ?? "") : [];
    const summaryContent = (
      <>
        <span className="hc-user-input-response-summary-text">{value || label}</span>
        {hasDetails && <ChevronRight aria-hidden className={userInputExpanded ? "is-open" : ""} size={14} />}
      </>
    );
    return (
      <article
        className="hc-user-input-response-event"
        data-content-search-unit-key={contentSearchUnitKey}
        data-has-details={hasDetails || undefined}
        data-item-ids={itemIds}
      >
        {hasDetails ? (
          <button
            aria-expanded={userInputExpanded}
            className="hc-user-input-response-summary"
            type="button"
            onClick={() => setUserInputExpanded((value) => !value)}
          >
            {summaryContent}
          </button>
        ) : (
          <div className="hc-user-input-response-summary">
            {summaryContent}
          </div>
        )}
        {hasDetails && (
          <AnimatedDisclosure
            className="hc-user-input-response-details-motion"
            innerClassName="hc-user-input-response-details"
            open={userInputExpanded}
          >
            {rows.map((row, index) => (
              <div className="hc-user-input-response-detail" key={`${row.question}-${index}`}>
                <span className="hc-user-input-response-question">{row.question}</span>
                <span className="hc-user-input-response-answer">{row.answer === "No answer provided" ? formatMessage({ id: "localConversation.userInputRequest.noAnswer", defaultMessage: "No answer provided" }) : row.answer}</span>
              </div>
            ))}
          </AnimatedDisclosure>
        )}
      </article>
    );
  }
  if (format === "stream-error") {
    const hasDetails = Boolean(details?.trim());
    // Localize the Codex "Reconnecting N/M" progress string (data layer keeps the
    // English content for tests; render reverse-maps via the attempt/maxAttempts).
    const reconnectMatch = /^Reconnecting\s+(\d+)\/(\d+)$/.exec((value ?? "").trim());
    const streamErrorText = reconnectMatch
      ? formatMessage(
          { id: "localConversation.streamError.reconnecting", defaultMessage: "Reconnecting {progress}" },
          {
            progress: `${reconnectMatch[1]}${formatMessage(
              { id: "localConversation.streamError.reconnectingProgressDenominator", defaultMessage: "/{maxAttempts}" },
              { maxAttempts: reconnectMatch[2] },
            )}`,
          },
        )
      : value || label;
    const summaryContent = (
      <>
        <span className="hc-error-event-text">{streamErrorText}</span>
        {hasDetails && <ChevronDown aria-hidden className={streamErrorExpanded ? "is-open" : ""} size={14} />}
      </>
    );
    return (
      <article
        className="hc-error-event hc-stream-error-event"
        data-content-search-unit-key={contentSearchUnitKey}
        data-has-details={hasDetails || undefined}
        data-item-ids={itemIds}
      >
        {hasDetails ? (
          <button
            aria-expanded={streamErrorExpanded}
            className="hc-error-event-summary"
            type="button"
            onClick={() => setStreamErrorExpanded((value) => !value)}
          >
            {summaryContent}
          </button>
        ) : (
          <div className="hc-error-event-summary">
            {summaryContent}
          </div>
        )}
        {hasDetails && (
          <AnimatedDisclosure
            className="hc-error-event-details-motion"
            innerClassName="hc-error-event-details"
            open={streamErrorExpanded}
          >
            {details}
          </AnimatedDisclosure>
        )}
      </article>
    );
  }
  if (format === "system-error") {
    return (
      <article
        className="hc-error-event hc-system-error-event"
        data-content-search-unit-key={contentSearchUnitKey}
        data-item-ids={itemIds}
      >
        <div className="hc-error-event-text">{value || label}</div>
      </article>
    );
  }

  return (
    <article
      className={`hc-tool-block ${tone ?? ""}`}
      data-content-search-unit-key={contentSearchUnitKey}
      data-item-ids={itemIds}
    >
      <div className="hc-tool-label">
        <Terminal size={14} /> {label}
      </div>
      {format === "markdown"
        ? (
            <div className="hc-tool-markdown">
              <Markdownish text={value} onOpenFileReference={onOpenFileReference} />
            </div>
          )
        : <pre>{value || "..."}</pre>}
    </article>
  );
}
