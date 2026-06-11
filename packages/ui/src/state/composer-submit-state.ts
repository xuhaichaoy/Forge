import type { I18nMessageDescriptor, I18nValues } from "./i18n";

type FormatMessage = (descriptor: I18nMessageDescriptor, values?: I18nValues) => string;

export type ComposerSubmitButtonMode = "send" | "queue" | "stop";

export type ComposerThreadRuntimeStatus =
  | "idle"
  | "running"
  | "waitingForRequest"
  | "connecting";

export interface ComposerSubmitStateInput {
  input: string;
  attachmentCount: number;
  connecting: boolean;
  threadRunning: boolean;
  activeTurnId: string | null;
  pendingRequestCount: number;
  queueingEnabled?: boolean;
  /*
   * Set when no model provider is usable for a NEW chat (team not signed in,
   * no personal provider configured, no subscription). Sending would only
   * fail against a dead endpoint, so the composer blocks the send and shows
   * this guidance instead.
   */
  modelUnavailableReason?: string;
}

export interface ComposerSubmitState {
  submitButtonMode: ComposerSubmitButtonMode;
  threadRuntimeStatus: ComposerThreadRuntimeStatus;
  hasContent: boolean;
  disabled: boolean;
  disabledReason?: string;
  submitBlockReason?: "empty" | "connecting" | "pendingRequest" | "missingActiveTurn" | "noModelProvider";
  canStopFromEscape: boolean;
  isQueueingEnabled: boolean;
  requestCount: number;
}

export function projectComposerSubmitState(input: ComposerSubmitStateInput): ComposerSubmitState {
  const hasContent = input.input.trim().length > 0 || input.attachmentCount > 0;
  const hasActiveTurn = Boolean(input.activeTurnId);
  const requestCount = Math.max(0, input.pendingRequestCount);
  const threadRuntimeStatus = input.connecting
    ? "connecting"
    : requestCount > 0
      ? "waitingForRequest"
      : input.threadRunning
        ? "running"
        : "idle";

  if (input.connecting) {
    return {
      submitButtonMode: "send",
      threadRuntimeStatus,
      hasContent,
      disabled: true,
      disabledReason: "Connecting to Codex app-server",
      submitBlockReason: "connecting",
      canStopFromEscape: false,
      isQueueingEnabled: false,
      requestCount,
    };
  }

  if (input.modelUnavailableReason) {
    return {
      submitButtonMode: "send",
      threadRuntimeStatus,
      hasContent,
      disabled: true,
      disabledReason: input.modelUnavailableReason,
      submitBlockReason: "noModelProvider",
      canStopFromEscape: false,
      isQueueingEnabled: false,
      requestCount,
    };
  }

  if (input.threadRunning && !hasContent) {
    return {
      submitButtonMode: "stop",
      threadRuntimeStatus,
      hasContent,
      disabled: !hasActiveTurn,
      disabledReason: hasActiveTurn ? undefined : "Waiting for active turn before stopping",
      submitBlockReason: hasActiveTurn ? undefined : "missingActiveTurn",
      canStopFromEscape: hasActiveTurn,
      isQueueingEnabled: false,
      requestCount,
    };
  }

  if (requestCount > 0) {
    return {
      submitButtonMode: input.threadRunning ? "queue" : "send",
      threadRuntimeStatus,
      hasContent,
      disabled: true,
      disabledReason: requestCount === 1
        ? "Resolve the pending request before sending more input"
        : `Resolve ${requestCount} pending requests before sending more input`,
      submitBlockReason: "pendingRequest",
      canStopFromEscape: false,
      isQueueingEnabled: false,
      requestCount,
    };
  }

  if (input.threadRunning) {
    const isQueueingEnabled = hasActiveTurn && input.queueingEnabled !== false;
    return {
      submitButtonMode: "queue",
      threadRuntimeStatus,
      hasContent,
      disabled: !hasActiveTurn,
      disabledReason: hasActiveTurn ? undefined : "Waiting for active turn before queueing a follow-up",
      submitBlockReason: hasActiveTurn ? undefined : "missingActiveTurn",
      canStopFromEscape: false,
      isQueueingEnabled,
      requestCount,
    };
  }

  return {
    submitButtonMode: "send",
    threadRuntimeStatus,
    hasContent,
    disabled: !hasContent,
    disabledReason: hasContent ? undefined : "Enter a prompt or add context",
    submitBlockReason: hasContent ? undefined : "empty",
    canStopFromEscape: false,
    isQueueingEnabled: false,
    requestCount,
  };
}

export function composerSubmitTooltip(
  state: ComposerSubmitState,
  formatMessage?: FormatMessage,
): string {
  if (state.disabledReason) return state.disabledReason;

  // codex composer-CwxGJF3C.js: the submit-button tooltip label is a single
  // verb. The keyboard shortcut is rendered separately.
  const fm = (id: string, defaultMessage: string): string =>
    formatMessage ? formatMessage({ id, defaultMessage }) : defaultMessage;

  if (state.submitButtonMode === "stop") {
    return fm("composer.submitButtonTooltip.stop", "Stop");
  }

  if (state.submitButtonMode === "queue") {
    // Primary action: queue when queueing is enabled (Enter), otherwise steer.
    return state.isQueueingEnabled
      ? fm("composer.submitButtonTooltip.queue", "Queue")
      : fm("composer.submitButtonTooltip.steer", "Steer");
  }

  return fm("composer.submitButtonTooltip.send", "Send");
}
