import { Activity, ChevronDown, Terminal } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import {
  formatItemDetail,
  isItemInProgress,
  type ConversationRenderUnit,
} from "../state/render-groups";

export interface ConversationViewProps {
  units: ConversationRenderUnit[];
  emptyState?: ReactNode;
}

export function ConversationView({ units, emptyState = null }: ConversationViewProps) {
  if (units.length === 0) {
    return <>{emptyState}</>;
  }

  return (
    <>
      {units.map((unit) => (
        <ConversationUnitView key={unit.key} unit={unit} />
      ))}
    </>
  );
}

export function ConversationUnitView({ unit }: { unit: ConversationRenderUnit }) {
  if (unit.kind === "message") {
    return (
      <article className={`hc-message ${unit.role === "user" ? "user" : "agent"}`}>
        <div className="hc-message-role">{unit.role === "user" ? "You" : "Codex"}</div>
        <Markdownish text={unit.text} />
      </article>
    );
  }
  if (unit.kind === "toolActivity") {
    return <ToolActivityView unit={unit} />;
  }
  return <ToolBlock label={unit.label} value={unit.text} />;
}

export function ToolActivityView({ unit }: { unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }> }) {
  const [expanded, setExpanded] = useState(unit.summary.inProgress);
  return (
    <article className={`hc-tool-block activity ${unit.summary.inProgress ? "is-running" : ""}`}>
      <button className="hc-tool-summary" type="button" onClick={() => setExpanded((value) => !value)}>
        <Activity size={14} />
        <span>{unit.summary.label}</span>
        {unit.summary.details.length > 0 && <small>{unit.summary.details[0]}</small>}
        <ChevronDown className={expanded ? "is-open" : ""} size={14} />
      </button>
      {expanded && (
        <div className="hc-tool-details">
          {unit.items.map((item) => (
            <pre key={item.id} className={isItemInProgress(item) ? "is-running" : ""}>
              {formatItemDetail(item)}
            </pre>
          ))}
        </div>
      )}
    </article>
  );
}

export function ToolBlock({ label, value, tone }: { label: string; value: string; tone?: "terminal" }) {
  return (
    <article className={`hc-tool-block ${tone ?? ""}`}>
      <div className="hc-tool-label">
        <Terminal size={14} /> {label}
      </div>
      <pre>{value || "..."}</pre>
    </article>
  );
}

export function Markdownish({ text }: { text: string }) {
  return (
    <div className="hc-markdown">
      {text.split("\n").map((line, index) => (
        <p key={index}>{line || "\u00a0"}</p>
      ))}
    </div>
  );
}
