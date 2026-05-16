import {
  ArrowUp,
  Bot,
  LoaderCircle,
  MessageSquareText,
  Square,
  X,
} from "lucide-react";
import type { ConversationRenderUnit } from "../state/render-groups";
import { ConversationView } from "./conversation-view";
import type { FileReference } from "./file-reference-types";
import type { OpenThreadHandler } from "./open-thread";
import type { McpAppHostCallHandler, ReadMcpResourceHandler } from "./tool-activity-detail";

export interface BackgroundAgentPanelProps {
  error?: string | null;
  canInterrupt?: boolean;
  interrupting?: boolean;
  kind?: "backgroundAgent" | "sideChat";
  loading?: boolean;
  messageDraft?: string;
  messageError?: string | null;
  messageSending?: boolean;
  onClose: () => void;
  onInterrupt?: () => void | Promise<void>;
  onMessageDraftChange?: (value: string) => void;
  onMcpAppHostCall?: McpAppHostCallHandler;
  onOpenFileReference?: (reference: FileReference) => void;
  onOpenThreadId?: OpenThreadHandler;
  onReadMcpResource?: ReadMcpResourceHandler;
  onSendMessage?: () => void | Promise<void>;
  subtitle: string;
  status: string;
  threadId: string;
  title: string;
  units: ConversationRenderUnit[];
}

export function BackgroundAgentPanel({
  canInterrupt = false,
  error = null,
  interrupting = false,
  kind = "backgroundAgent",
  loading = false,
  messageDraft = "",
  messageError = null,
  messageSending = false,
  onClose,
  onInterrupt,
  onMessageDraftChange,
  onMcpAppHostCall,
  onOpenFileReference,
  onOpenThreadId,
  onReadMcpResource,
  onSendMessage,
  subtitle,
  status,
  threadId,
  title,
  units,
}: BackgroundAgentPanelProps) {
  const isSideChat = kind === "sideChat";
  const label = isSideChat ? "Side chat" : "Background agent";
  const Icon = isSideChat ? MessageSquareText : Bot;
  const canSendMessage = Boolean(onSendMessage && onMessageDraftChange);
  const showInterrupt = Boolean(onInterrupt && (canInterrupt || interrupting));
  const messageDisabled = loading || messageSending || messageDraft.trim().length === 0;
  return (
    <aside
      aria-label={label}
      className="hc-background-agent-panel"
      data-panel-kind={kind}
      data-status={status}
    >
      <header className="hc-background-agent-header">
        <div className="hc-background-agent-title">
          <Icon size={16} />
          <div>
            <strong>{title}</strong>
            <small>{subtitle || `${shortThreadId(threadId)} · ${status}`}</small>
          </div>
        </div>
        <div className="hc-background-agent-actions">
          {showInterrupt && (
            <button
              aria-label={`Stop ${isSideChat ? "side chat" : "background agent"} turn`}
              className="hc-icon-button"
              disabled={!canInterrupt || interrupting}
              title={interrupting ? "Stopping" : "Stop"}
              type="button"
              onClick={() => { void onInterrupt?.(); }}
            >
              {interrupting ? <LoaderCircle className="hc-background-agent-spinner" size={16} /> : <Square size={13} />}
            </button>
          )}
          <button
            aria-label={`Close ${isSideChat ? "side chat" : "background agent"}`}
            className="hc-icon-button"
            type="button"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="hc-background-agent-body">
        {loading && (
          <div className="hc-background-agent-state">
            <LoaderCircle className="hc-background-agent-spinner" size={16} />
            <span>{isSideChat ? "Loading side chat" : "Loading agent thread"}</span>
          </div>
        )}
        {!loading && error && (
          <div className="hc-background-agent-state error">
            {error}
          </div>
        )}
        {!loading && !error && (
          <ConversationView
            units={units}
            threadId={threadId}
            onMcpAppHostCall={onMcpAppHostCall}
            onOpenFileReference={onOpenFileReference}
            onOpenThreadId={onOpenThreadId}
            onReadMcpResource={onReadMcpResource}
            emptyState={(
              <div className="hc-background-agent-empty">
                {isSideChat ? "No side chat messages yet." : "No visible messages yet."}
              </div>
            )}
          />
        )}
      </div>
      {canSendMessage && (
        <form
          className="hc-background-agent-composer"
          onSubmit={(event) => {
            event.preventDefault();
            if (!messageDisabled) void onSendMessage?.();
          }}
        >
          {messageError && <div className="hc-background-agent-composer-error">{messageError}</div>}
          <div className="hc-background-agent-composer-row">
            <textarea
              aria-label={`Message ${isSideChat ? "side chat" : "background agent"}`}
              disabled={loading || messageSending}
              placeholder={isSideChat ? "Message side chat" : "Message background agent"}
              rows={2}
              value={messageDraft}
              onChange={(event) => onMessageDraftChange?.(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey) return;
                event.preventDefault();
                if (!messageDisabled) void onSendMessage?.();
              }}
            />
            <button
              aria-label={messageSending ? "Sending panel message" : `Send ${isSideChat ? "side chat" : "background agent"} message`}
              className="hc-background-agent-send"
              disabled={messageDisabled}
              title={messageSending ? "Sending" : "Send message"}
              type="submit"
            >
              {messageSending ? <LoaderCircle className="hc-background-agent-spinner" size={15} /> : <ArrowUp size={15} />}
            </button>
          </div>
        </form>
      )}
    </aside>
  );
}

function shortThreadId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id;
}
