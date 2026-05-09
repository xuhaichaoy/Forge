import { Activity, Archive, Copy, GitFork, MoreHorizontal, Pencil } from "lucide-react";
import { useState } from "react";
import type { Thread } from "@hicodex/codex-protocol";

const TOPBAR_TITLE_MAX_CHARS = 42;

export interface ConversationChromeProps {
  title: string;
  codexHome?: string;
  connected: boolean;
  pid?: number;
  workspace: string;
  onWorkspaceChange: (workspace: string) => void;
  activeThread?: Thread | null;
  activeThreadRunning?: boolean;
  onForkThread?: (thread: Thread) => void | Promise<void>;
  onRenameThread?: (thread: Thread) => void | Promise<void>;
  onArchiveThread?: (thread: Thread) => void | Promise<void>;
  onCopyWorkingDirectory?: () => void | Promise<void>;
  onCopySessionId?: () => void | Promise<void>;
  onCopyConversationMarkdown?: () => void | Promise<void>;
}

export function ConversationChrome({
  title,
  codexHome,
  connected,
  pid,
  workspace,
  onWorkspaceChange,
  activeThread = null,
  activeThreadRunning = false,
  onForkThread,
  onRenameThread,
  onArchiveThread,
  onCopyWorkingDirectory,
  onCopySessionId,
  onCopyConversationMarkdown,
}: ConversationChromeProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const hasThread = Boolean(activeThread);
  const currentWorkspace = activeThread?.cwd?.trim() || workspace.trim() || "";
  const meta = currentWorkspace || codexHome || "Sidecar not started";
  const displayTitle = truncateTopbarTitle(title);

  function runThreadAction(action?: (thread: Thread) => void | Promise<void>) {
    if (!activeThread || !action) return;
    setMenuOpen(false);
    void action(activeThread);
  }

  function runCopyAction(action?: () => void | Promise<void>) {
    if (!action) return;
    setMenuOpen(false);
    void action();
  }

  return (
    <>
      <header className="hc-topbar">
        <div className="hc-topbar-main">
          <div className="hc-top-title" title={title}>{displayTitle}</div>
          <div className="hc-top-meta" title={meta}>{meta}</div>
        </div>
        <div className="hc-topbar-actions">
          <div className="hc-status-pill" data-running={connected}>
            <Activity size={14} />
            {connected ? `running${pid ? `:${pid}` : ""}` : "offline"}
          </div>
          <div className="hc-thread-header-actions">
            <button
              type="button"
              className="hc-icon-button"
              title="Thread actions"
              aria-label="Thread actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              disabled={!hasThread}
              onClick={() => setMenuOpen((value) => !value)}
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && activeThread && (
              <div className="hc-thread-menu hc-thread-header-menu" role="menu">
                <button type="button" className="hc-thread-menu-item" role="menuitem" onClick={() => runThreadAction(onRenameThread)}>
                  <Pencil size={13} />
                  Rename chat
                </button>
                <button type="button" className="hc-thread-menu-item" role="menuitem" onClick={() => runThreadAction(onArchiveThread)}>
                  <Archive size={13} />
                  Archive chat
                </button>
                <div className="hc-thread-menu-separator" />
                <button type="button" className="hc-thread-menu-item" role="menuitem" onClick={() => runCopyAction(onCopyWorkingDirectory)}>
                  <Copy size={13} />
                  Copy working directory
                </button>
                <button type="button" className="hc-thread-menu-item" role="menuitem" onClick={() => runCopyAction(onCopySessionId)}>
                  <Copy size={13} />
                  Copy session ID
                </button>
                <button type="button" className="hc-thread-menu-item" role="menuitem" onClick={() => runCopyAction(onCopyConversationMarkdown)}>
                  <Copy size={13} />
                  Copy conversation markdown
                </button>
                <div className="hc-thread-menu-separator" />
                <button
                  type="button"
                  className="hc-thread-menu-item"
                  role="menuitem"
                  disabled={activeThreadRunning}
                  title={activeThreadRunning ? "Wait for the current turn to finish before forking" : "Fork chat"}
                  onClick={() => runThreadAction(onForkThread)}
                >
                  <GitFork size={13} />
                  Fork chat
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {!hasThread && (
        <section className="hc-workspace-bar">
          <label>cwd</label>
          <input value={workspace} onChange={(event) => onWorkspaceChange(event.target.value)} />
        </section>
      )}
    </>
  );
}

function truncateTopbarTitle(value: string, maxChars = TOPBAR_TITLE_MAX_CHARS): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  const chars = Array.from(normalized);
  if (chars.length <= maxChars) return normalized;
  return `${chars.slice(0, maxChars).join("")}...`;
}
