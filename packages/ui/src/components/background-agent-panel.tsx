import {
  Bot,
  LoaderCircle,
  MessageSquareText,
  X,
} from "lucide-react";
import type { ConversationRenderUnit } from "../state/render-groups";
import { ConversationView } from "./conversation-view";
import type { FileReference } from "./message-unit";
import type { OpenThreadHandler } from "./open-thread";

export interface BackgroundAgentPanelProps {
  error?: string | null;
  kind?: "backgroundAgent" | "sideChat";
  loading?: boolean;
  onClose: () => void;
  onOpenFileReference?: (reference: FileReference) => void;
  onOpenThreadId?: OpenThreadHandler;
  subtitle: string;
  status: string;
  threadId: string;
  title: string;
  units: ConversationRenderUnit[];
}

export function BackgroundAgentPanel({
  error = null,
  kind = "backgroundAgent",
  loading = false,
  onClose,
  onOpenFileReference,
  onOpenThreadId,
  subtitle,
  status,
  threadId,
  title,
  units,
}: BackgroundAgentPanelProps) {
  const isSideChat = kind === "sideChat";
  const label = isSideChat ? "Side chat" : "Background agent";
  const Icon = isSideChat ? MessageSquareText : Bot;
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
        <button
          aria-label={`Close ${isSideChat ? "side chat" : "background agent"}`}
          className="hc-icon-button"
          type="button"
          onClick={onClose}
        >
          <X size={16} />
        </button>
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
            onOpenFileReference={onOpenFileReference}
            onOpenThreadId={onOpenThreadId}
            emptyState={(
              <div className="hc-background-agent-empty">
                {isSideChat ? "No side chat messages yet." : "No visible messages yet."}
              </div>
            )}
          />
        )}
      </div>
    </aside>
  );
}

function shortThreadId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id;
}
