import { Boxes, CheckCircle2, Loader2, Server, TerminalSquare, X } from "lucide-react";
import type { CommandPanelEntry, CommandPanelState } from "../state/command-panel";

export interface CommandPanelProps {
  panel: CommandPanelState;
  onClose: () => void;
}

export function CommandPanel({ panel, onClose }: CommandPanelProps) {
  return (
    <div className="hc-settings-backdrop">
      <section className="hc-command-panel">
        <header>
          <div>
            {panelIcon(panel.panel)}
            <span>{panel.title}</span>
          </div>
          <button className="hc-icon-button" type="button" onClick={onClose} aria-label="Close command panel">
            <X size={16} />
          </button>
        </header>

        {panel.message && (
          <div className="hc-command-panel-message" data-status={panel.status}>
            {panel.status === "loading" && <Loader2 className="hc-spin" size={14} />}
            <span>{panel.message}</span>
          </div>
        )}

        {panel.entries.length > 0 && (
          <div className="hc-command-panel-list">
            {panel.entries.map((entry) => (
              <CommandPanelRow entry={entry} key={entry.id} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CommandPanelRow({ entry }: { entry: CommandPanelEntry }) {
  return (
    <article className="hc-command-panel-row" data-disabled={entry.disabled ? "true" : "false"}>
      <div className="hc-command-panel-row-main">
        <div>
          <h3>{entry.title}</h3>
          {entry.meta && <p>{entry.meta}</p>}
        </div>
        {entry.status && <span className="hc-command-status">{entry.status}</span>}
      </div>
      {entry.details && entry.details.length > 0 && (
        <ul className="hc-command-details">
          {entry.details.slice(0, 8).map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
    </article>
  );
}

function panelIcon(panel: CommandPanelState["panel"]) {
  switch (panel) {
    case "mcp":
      return <Server size={17} />;
    case "plugins":
    case "skills":
    case "apps":
      return <Boxes size={17} />;
    case "status":
      return <CheckCircle2 size={17} />;
    default:
      return <TerminalSquare size={17} />;
  }
}
