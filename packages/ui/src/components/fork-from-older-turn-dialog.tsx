/*
 * codex: local-conversation-thread-Kn0WAsVa#Ud (L6204-6378) + #Wd (L6379-6453)
 *
 * Codex Desktop 在用户编辑非最后一条 user 消息时，会先弹出此确认对话框，让用户
 * 选择 "Fork into local"（在新 thread 里从该消息继续）或 "Cancel"。worktree 选项
 * (`Wd` 的 onForkIntoWorktree → `/worktree-init-v2/`) 只在 Codex Desktop 环境
 * （Tauri/electron + 本地 git repo）才显示；HiCodex 当前作为纯 web 客户端不支持
 * worktree 流，所以只暴露 local fork 这一个选项。
 *
 * 文案直接取自 Codex i18n `defaultMessage`：
 *   localConversation.forkFromOlderTurnDialog.title
 *   localConversation.forkFromOlderTurnDialog.subtitle
 *   localConversation.forkFromOlderTurnDialog.local.description
 *   localConversation.forkFromOlderTurnDialog.cancel
 *   threadHeader.forkIntoLocal (Ki.forkIntoLocal → "Fork into local")
 */
import { GitFork, X } from "lucide-react";
import { useHiCodexIntl } from "./i18n-provider";

export interface ForkFromOlderTurnDialogProps {
  open: boolean;
  isSubmitting?: boolean;
  onClose: () => void;
  onForkIntoLocal: () => void;
}

export function ForkFromOlderTurnDialog({
  open,
  isSubmitting = false,
  onClose,
  onForkIntoLocal,
}: ForkFromOlderTurnDialogProps) {
  const { formatMessage } = useHiCodexIntl();

  if (!open) return null;

  const handleBackdropMouseDown = () => {
    if (isSubmitting) return;
    onClose();
  };

  return (
    <div
      className="hc-settings-backdrop"
      role="presentation"
      onMouseDown={handleBackdropMouseDown}
    >
      <section
        className="hc-thread-dialog-panel hc-fork-older-turn-dialog"
        role="dialog"
        data-state="open"
        aria-modal="true"
        aria-labelledby="hc-fork-older-turn-title"
        aria-describedby="hc-fork-older-turn-subtitle"
        onKeyDown={(event) => {
          // codex: Radix dialog closes on Escape; match it (the other HiCodex dialogs do).
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div className="hc-fork-older-turn-title">
            <GitFork aria-hidden className="hc-fork-older-turn-icon" size={16} />
            <span id="hc-fork-older-turn-title">
              {formatMessage({
                id: "localConversation.forkFromOlderTurnDialog.title",
                defaultMessage: "Fork from earlier message?",
              })}
            </span>
          </div>
          <button
            type="button"
            aria-label={formatMessage({ id: "common.close", defaultMessage: "Close" })}
            disabled={isSubmitting}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>
        <div className="hc-thread-dialog-body hc-fork-older-turn-body">
          <p id="hc-fork-older-turn-subtitle" className="hc-fork-older-turn-subtitle">
            {formatMessage({
              id: "localConversation.forkFromOlderTurnDialog.subtitle",
              defaultMessage:
                "This keeps your current files and worktree state as-is. If later turns changed the filesystem, the new fork may not match what is currently on disk.",
            })}
          </p>
          <div className="hc-fork-older-turn-options">
            <button
              type="button"
              className="hc-fork-older-turn-option"
              disabled={isSubmitting}
              onClick={onForkIntoLocal}
            >
              <GitFork aria-hidden className="hc-fork-older-turn-option-icon" size={14} />
              <span className="hc-fork-older-turn-option-text">
                <span className="hc-fork-older-turn-option-title">
                  {formatMessage({
                    id: "threadHeader.forkIntoLocal",
                    defaultMessage: "Fork into local",
                  })}
                </span>
                <span className="hc-fork-older-turn-option-desc">
                  {formatMessage({
                    id: "localConversation.forkFromOlderTurnDialog.local.description",
                    defaultMessage: "Continue from this message in a new local chat",
                  })}
                </span>
              </span>
            </button>
          </div>
        </div>
        <footer className="hc-fork-older-turn-footer">
          <button
            type="button"
            className="hc-fork-older-turn-cancel"
            autoFocus
            disabled={isSubmitting}
            onClick={onClose}
          >
            {formatMessage({
              id: "localConversation.forkFromOlderTurnDialog.cancel",
              defaultMessage: "Cancel",
            })}
          </button>
        </footer>
      </section>
    </div>
  );
}
