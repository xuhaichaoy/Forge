import {
  Bot,
  ChevronRight,
  CircleStop,
  Loader2,
  MessageSquarePlus,
  RefreshCcw,
  Settings,
} from "lucide-react";
import type { Thread } from "@hicodex/codex-protocol";
import { threadStatusLabel, threadTitle } from "../state/thread-workflow";

export interface SidebarProps {
  threads: Thread[];
  activeThreadId: string | null;
  activeThreadRunning: boolean;
  connected: boolean;
  connecting: boolean;
  onConnect: () => void | Promise<void>;
  onCreateThread: () => void | Promise<void>;
  onRefreshThreads: () => void | Promise<void>;
  onSelectThread: (thread: Thread) => void | Promise<void>;
  onOpenSettings: () => void;
  onDisconnect: () => void | Promise<void>;
  getThreadTitle?: (thread: Thread) => string;
  getThreadStatusLabel?: (status: unknown) => string;
}

export function Sidebar({
  threads,
  activeThreadId,
  activeThreadRunning,
  connected,
  connecting,
  onConnect,
  onCreateThread,
  onRefreshThreads,
  onSelectThread,
  onOpenSettings,
  onDisconnect,
  getThreadTitle = threadTitle,
  getThreadStatusLabel = threadStatusLabel,
}: SidebarProps) {
  return (
    <aside className="hc-sidebar">
      <div className="hc-brand">
        <div className="hc-brand-mark"><Bot size={18} /></div>
        <div>
          <div className="hc-brand-title">HiCodex</div>
          <div className="hc-brand-subtitle">Codex core desktop</div>
        </div>
      </div>

      <div className="hc-sidebar-actions">
        <button className="hc-button hc-button-primary" onClick={() => void (connected ? onCreateThread() : onConnect())} disabled={connecting}>
          {connecting ? <Loader2 className="hc-spin" size={16} /> : <MessageSquarePlus size={16} />}
          {connected ? "New thread" : "Connect"}
        </button>
        {connected && (
          <button className="hc-icon-button" onClick={() => void onRefreshThreads()} title="Refresh threads">
            <RefreshCcw size={16} />
          </button>
        )}
      </div>

      <div className="hc-thread-list">
        {threads.length === 0 && (
          <div className="hc-empty-panel">No threads loaded</div>
        )}
        {threads.map((thread) => (
          <button
            key={thread.id}
            className={`hc-thread-row ${thread.id === activeThreadId ? "is-active" : ""}`}
            onClick={() => void onSelectThread(thread)}
          >
            <div className="hc-thread-name">{getThreadTitle(thread)}</div>
            <div className="hc-thread-meta">
              <span>{thread.id === activeThreadId && activeThreadRunning ? "running" : getThreadStatusLabel((thread as { status?: unknown }).status)}</span>
              <ChevronRight size={14} />
            </div>
          </button>
        ))}
      </div>

      <div className="hc-sidebar-footer">
        <button className="hc-link-button" onClick={onOpenSettings}>
          <Settings size={15} /> Settings
        </button>
        {connected && (
          <button className="hc-link-button danger" onClick={() => void onDisconnect()}>
            <CircleStop size={15} /> Stop sidecar
          </button>
        )}
      </div>
    </aside>
  );
}
