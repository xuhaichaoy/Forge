import { Activity } from "lucide-react";

export interface ConversationChromeProps {
  title: string;
  codexHome?: string;
  connected: boolean;
  pid?: number;
  workspace: string;
  onWorkspaceChange: (workspace: string) => void;
}

export function ConversationChrome({
  title,
  codexHome,
  connected,
  pid,
  workspace,
  onWorkspaceChange,
}: ConversationChromeProps) {
  return (
    <>
      <header className="hc-topbar">
        <div>
          <div className="hc-top-title">{title}</div>
          <div className="hc-top-meta">{codexHome ?? "Sidecar not started"}</div>
        </div>
        <div className="hc-status-pill" data-running={connected}>
          <Activity size={14} />
          {connected ? `running${pid ? `:${pid}` : ""}` : "offline"}
        </div>
      </header>

      <section className="hc-workspace-bar">
        <label>cwd</label>
        <input value={workspace} onChange={(event) => onWorkspaceChange(event.target.value)} />
      </section>
    </>
  );
}
