import { Activity, FileText, GitBranch, ListChecks, Network, Users } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import type { TeamSummary } from "@hicodex/codex-protocol";
import type { LogLine } from "../state/codex-reducer";
import type { BranchDetailsViewModel } from "../state/branch-details";
import type { ConversationProjection, RailEntry } from "../state/render-groups";

export type RightRailConversationProps = Pick<ConversationProjection, "progress" | "artifacts" | "sources">;

export interface RightRailProps {
  conversation: RightRailConversationProps;
  branchDetails: BranchDetailsViewModel;
  teams: TeamSummary[];
  activeTeamId: string | null;
  logs: LogLine[];
  onTeamSelect: (teamId: string) => void;
}

export interface RailSectionProps {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}

export interface RailListProps {
  entries: RailEntry[];
}

export function RightRail({
  conversation,
  branchDetails,
  teams,
  activeTeamId,
  logs,
  onTeamSelect,
}: RightRailProps) {
  return (
    <aside className="hc-right-rail">
      {conversation.progress.length > 0 && (
        <RailSection icon={<ListChecks size={15} />} title="Progress">
          <RailList entries={conversation.progress} />
        </RailSection>
      )}

      <RailSection icon={<GitBranch size={15} />} title={branchDetails.title}>
        <BranchDetailsCard details={branchDetails} />
      </RailSection>

      {conversation.artifacts.length > 0 && (
        <RailSection icon={<FileText size={15} />} title="Artifacts">
          <RailList entries={conversation.artifacts} />
        </RailSection>
      )}

      {conversation.sources.length > 0 && (
        <RailSection icon={<Network size={15} />} title="Sources">
          <RailList entries={conversation.sources} />
        </RailSection>
      )}

      <RailSection icon={<Users size={15} />} title="Team">
        {teams.map((team) => (
          <button
            key={team.id}
            className={`hc-team-row ${team.id === activeTeamId ? "is-active" : ""}`}
            onClick={() => onTeamSelect(team.id)}
          >
            <Users size={14} />
            <span>{team.name}</span>
            <small>{team.plan}</small>
          </button>
        ))}
      </RailSection>

      <RailSection icon={<Activity size={15} />} title="Logs">
        <div className="hc-log-list">
          {logs.slice(0, 8).map((line) => (
            <div key={line.id} className={`hc-log-line ${line.level}`}>
              {line.text}
            </div>
          ))}
        </div>
      </RailSection>
    </aside>
  );
}

function BranchDetailsCard({ details }: { details: BranchDetailsViewModel }) {
  if (!details.hasData) {
    return (
      <div className="hc-rail-card">
        <div className="hc-rail-card-meta">{details.emptyText}</div>
      </div>
    );
  }

  return (
    <div className="hc-rail-list">
      {details.rows.map((row) => (
        <div className="hc-rail-card" key={row.id}>
          <div className="hc-rail-card-title">{row.label}</div>
          <div className="hc-rail-card-meta">{row.value}</div>
        </div>
      ))}
      {details.diff && (
        <div className="hc-rail-card">
          <div className="hc-rail-card-title">{details.diff.title}</div>
          <div className="hc-rail-card-meta">{details.diff.summary}</div>
          {details.diff.files.length > 0 && (
            <div className="hc-rail-card-status">
              {details.diff.files.slice(0, 3).map((file) => file.path).join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function RailSection({ icon, title, children }: RailSectionProps) {
  return (
    <section className="hc-rail-section">
      <h2>{icon}{title}</h2>
      {children}
    </section>
  );
}

export function RailList({ entries }: RailListProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? entries : entries.slice(0, 6);
  return (
    <div className="hc-rail-list">
      {visible.map((entry) => (
        <div className="hc-rail-card" key={entry.id}>
          <div className="hc-rail-card-title">{entry.title}</div>
          {entry.meta && <div className="hc-rail-card-meta">{entry.meta}</div>}
          {entry.status && <div className="hc-rail-card-status">{entry.status}</div>}
        </div>
      ))}
      {entries.length > 6 && (
        <button className="hc-rail-more-button" type="button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Show less" : `Show ${entries.length - 6} more`}
        </button>
      )}
    </div>
  );
}
