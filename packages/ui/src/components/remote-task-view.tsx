import { ArrowLeft, Cloud, ExternalLink } from "lucide-react";

export interface RemoteTaskViewProps {
  taskId: string;
  onBack?: () => void;
  onOpenExternal?: (taskId: string) => void;
}

export function RemoteTaskView({
  taskId,
  onBack,
  onOpenExternal,
}: RemoteTaskViewProps) {
  return (
    <main className="hc-main hc-remote-task-main" aria-label="Codex Cloud task">
      <header className="hc-topbar">
        <div className="hc-topbar-main">
          {onBack && (
            <button
              aria-label="Back to local conversation"
              className="hc-topbar-nav-button"
              type="button"
              onClick={onBack}
            >
              <ArrowLeft size={16} aria-hidden="true" />
            </button>
          )}
          <Cloud size={16} aria-hidden="true" />
          <div className="hc-top-title">Codex Cloud task</div>
        </div>
        {onOpenExternal && (
          <button
            className="hc-remote-task-open"
            type="button"
            onClick={() => onOpenExternal(taskId)}
          >
            <ExternalLink size={14} aria-hidden="true" />
            <span>Open in browser</span>
          </button>
        )}
      </header>
      <section className="hc-remote-task-content" aria-label="Remote task content">
        <div className="hc-remote-task-card">
          <div className="hc-remote-task-card-icon" aria-hidden="true">
            <Cloud size={20} />
          </div>
          <div className="hc-remote-task-card-body">
            <div className="hc-remote-task-title">Remote task</div>
            <div className="hc-remote-task-id">{taskId}</div>
            <p className="hc-remote-task-note">
              This task was created in Codex Cloud. Open it in a browser to review the latest status and results.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
