import {
  Archive,
  Bot,
  ChevronRight,
  CircleStop,
  Dot,
  GitFork,
  Loader2,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  RefreshCcw,
  RotateCcw,
  Settings,
} from "lucide-react";
import { useState } from "react";
import type { Thread } from "@hicodex/codex-protocol";
import type { PendingRequestThreadAwaitingMap } from "../state/pending-request-scope";
import { threadStatusLabel, threadTitle } from "../state/thread-workflow";

export interface SidebarProps {
  threads: Thread[];
  activeThreadId: string | null;
  activeThreadRunning: boolean;
  pendingRequestAwaitingByThread?: PendingRequestThreadAwaitingMap;
  connected: boolean;
  connecting: boolean;
  onConnect: () => void | Promise<void>;
  onCreateThread: () => void | Promise<void>;
  onRefreshThreads: () => void | Promise<void>;
  onSelectThread: (thread: Thread) => void | Promise<void>;
  onResumeThread: (thread: Thread) => void | Promise<void>;
  onForkThread: (thread: Thread) => void | Promise<void>;
  onRenameThread: (thread: Thread) => void | Promise<void>;
  onArchiveThread: (thread: Thread) => void | Promise<void>;
  onOpenSettings: () => void;
  onDisconnect: () => void | Promise<void>;
  getThreadTitle?: (thread: Thread) => string;
  getThreadStatusLabel?: (status: unknown) => string;
}

export function Sidebar({
  threads,
  activeThreadId,
  activeThreadRunning,
  pendingRequestAwaitingByThread = {},
  connected,
  connecting,
  onConnect,
  onCreateThread,
  onRefreshThreads,
  onSelectThread,
  onResumeThread,
  onForkThread,
  onRenameThread,
  onArchiveThread,
  onOpenSettings,
  onDisconnect,
  getThreadTitle = threadTitle,
  getThreadStatusLabel = threadStatusLabel,
}: SidebarProps) {
  const [openMenuThreadId, setOpenMenuThreadId] = useState<string | null>(null);

  const runThreadAction = (thread: Thread, action: (thread: Thread) => void | Promise<void>) => {
    setOpenMenuThreadId(null);
    void action(thread);
  };

  return (
    <aside className="hc-sidebar">
      <div className="hc-brand">
        <div className="hc-brand-main">
          <div className="hc-brand-mark"><Bot size={16} /></div>
          <div>
            <div className="hc-brand-title">HiCodex</div>
            <div className="hc-brand-subtitle">{connected ? "Local Codex" : "Offline"}</div>
          </div>
        </div>
        <button className="hc-icon-button hc-sidebar-settings-button" onClick={onOpenSettings} title="Settings" type="button">
          <Settings size={15} />
        </button>
      </div>

      <div className="hc-sidebar-actions">
        <button className="hc-button hc-button-primary" onClick={() => void (connected ? onCreateThread() : onConnect())} disabled={connecting}>
          {connecting ? <Loader2 className="hc-spin" size={16} /> : <MessageSquarePlus size={16} />}
          {connected ? "New chat" : "Connect"}
        </button>
        {connected && (
          <button className="hc-icon-button" onClick={() => void onRefreshThreads()} title="Refresh chats" type="button">
            <RefreshCcw size={16} />
          </button>
        )}
      </div>

      <div className="hc-thread-list">
        {threads.length === 0 && (
          <div className="hc-empty-panel">No threads loaded</div>
        )}
        {threads.map((thread) => {
          const awaiting = pendingRequestAwaitingByThread[thread.id];
          const isRunning = thread.id === activeThreadId && activeThreadRunning;
          const status = threadSidebarStatusLabel({
            awaiting,
            fallback: getThreadStatusLabel((thread as { status?: unknown }).status),
            isRunning,
          });
          const projectLabel = threadProjectLabel(thread);
          return (
            <div
              key={thread.id}
              className={`hc-thread-row ${thread.id === activeThreadId ? "is-active" : ""} ${openMenuThreadId === thread.id ? "is-menu-open" : ""}`}
            >
            <button
              type="button"
              className="hc-thread-select"
              onClick={() => {
                setOpenMenuThreadId(null);
                void onSelectThread(thread);
              }}
            >
              <div className="hc-thread-mainline">
                <div className="hc-thread-name">{getThreadTitle(thread)}</div>
                <ChevronRight className="hc-thread-chevron" size={14} />
              </div>
              <div className="hc-thread-meta">
                <span className="hc-thread-project">{projectLabel}</span>
                <span className="hc-thread-status">
                  <Dot className="hc-thread-status-dot" data-status={threadStatusTone(status)} size={16} />
                  {status}
                </span>
              </div>
            </button>
            <div className="hc-thread-actions" aria-label="Thread actions">
              <button
                type="button"
                className="hc-thread-action"
                title="Thread actions"
                aria-haspopup="menu"
                aria-expanded={openMenuThreadId === thread.id}
                onClick={() => setOpenMenuThreadId((value) => value === thread.id ? null : thread.id)}
              >
                <MoreHorizontal size={14} />
              </button>
              {openMenuThreadId === thread.id && (
                <div className="hc-thread-menu" role="menu">
                  <button
                    type="button"
                    className="hc-thread-menu-item"
                    role="menuitem"
                    onClick={() => runThreadAction(thread, onResumeThread)}
                  >
                    <RotateCcw size={13} />
                    Resume chat
                  </button>
                  <button
                    type="button"
                    className="hc-thread-menu-item"
                    role="menuitem"
                    onClick={() => runThreadAction(thread, onForkThread)}
                  >
                    <GitFork size={13} />
                    Fork chat
                  </button>
                  <button
                    type="button"
                    className="hc-thread-menu-item"
                    role="menuitem"
                    onClick={() => runThreadAction(thread, onRenameThread)}
                  >
                    <Pencil size={13} />
                    Rename chat
                  </button>
                  <button
                    type="button"
                    className="hc-thread-menu-item danger"
                    role="menuitem"
                    onClick={() => runThreadAction(thread, onArchiveThread)}
                  >
                    <Archive size={13} />
                    Archive chat
                  </button>
                </div>
              )}
            </div>
          </div>
          );
        })}
      </div>

      <div className="hc-sidebar-footer">
        {connected && (
          <button className="hc-link-button danger" onClick={() => void onDisconnect()}>
            <CircleStop size={15} /> Stop sidecar
          </button>
        )}
      </div>
    </aside>
  );
}

function threadSidebarStatusLabel({
  awaiting,
  fallback,
  isRunning,
}: {
  awaiting?: PendingRequestThreadAwaitingMap[string];
  fallback: string;
  isRunning: boolean;
}): string {
  if (awaiting?.awaitingApproval) return "awaiting approval";
  if (awaiting?.awaitingUserInput) return "awaiting response";
  if (awaiting?.awaitingToolCall) return "awaiting tool";
  if (awaiting?.awaitingRequest) return "awaiting request";
  if (isRunning) return "running";
  return fallback;
}

function threadStatusTone(status: string): "attention" | "muted" | "running" {
  if (status === "running") return "running";
  if (status.startsWith("awaiting")) return "attention";
  return "muted";
}

function threadProjectLabel(thread: Thread): string {
  const cwd = typeof thread.cwd === "string" ? thread.cwd.trim() : "";
  if (!cwd || cwd === "~" || cwd === "/") return "Local";
  const normalized = cwd.replace(/[\\/]+$/, "");
  return normalized.split(/[\\/]+/).filter(Boolean).pop() || cwd;
}
