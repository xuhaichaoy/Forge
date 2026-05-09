import {
  Bot,
  LoaderCircle,
  X,
} from "lucide-react";
import type { ConversationRenderUnit } from "../state/render-groups";
import { ConversationView } from "./conversation-view";
import type { FileReference } from "./message-unit";
import type { OpenThreadHandler } from "./open-thread";

export interface BackgroundAgentPanelProps {
  error?: string | null;
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
  return (
    <aside
      aria-label="Background agent"
      className="hc-background-agent-panel"
      data-status={status}
    >
      <header className="hc-background-agent-header">
        <div className="hc-background-agent-title">
          <Bot size={16} />
          <div>
            <strong>{title}</strong>
            <small>{subtitle || `${shortThreadId(threadId)} · ${status}`}</small>
          </div>
        </div>
        <button
          aria-label="Close background agent"
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
            <span>Loading agent thread</span>
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
                No visible messages yet.
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
