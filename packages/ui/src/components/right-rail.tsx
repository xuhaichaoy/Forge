import { Activity, FileText, GitBranch, ListChecks, Network, Users } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import type { TeamSummary } from "@hicodex/codex-protocol";
import type { LogLine } from "../state/codex-reducer";
import type { BranchDetailsViewModel } from "../state/branch-details";
import type { RailEntry } from "../state/render-groups";
import {
  clipRailEntries,
  type RightRailSection as RightRailSectionViewModel,
} from "../state/right-rail";

export interface RightRailProps {
  sections: RightRailSectionViewModel[];
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
  sections,
  teams,
  activeTeamId,
  logs,
  onTeamSelect,
}: RightRailProps) {
  return (
    <aside className="hc-right-rail">
      {sections.map((section) => (
        <RailSection key={section.id} icon={sectionIcon(section.id)} title={section.title}>
          {section.id === "branchDetails" && section.branchDetails
            ? <BranchDetailsCard details={section.branchDetails} />
            : <RailList entries={section.allEntries} />}
        </RailSection>
      ))}

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

function sectionIcon(id: RightRailSectionViewModel["id"]): ReactNode {
  switch (id) {
    case "progress":
      return <ListChecks size={15} />;
    case "branchDetails":
      return <GitBranch size={15} />;
    case "artifacts":
      return <FileText size={15} />;
    case "sources":
      return <Network size={15} />;
  }
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
  const clipped = clipRailEntries(entries, expanded);
  return (
    <div className="hc-rail-list">
      {clipped.entries.map((entry) => (
        <div className="hc-rail-card" key={entry.id}>
          <div className="hc-rail-card-title">{entry.title}</div>
          {entry.meta && <div className="hc-rail-card-meta">{entry.meta}</div>}
          {entry.status && <div className="hc-rail-card-status">{entry.status}</div>}
        </div>
      ))}
      {clipped.canToggle && (
        <button className="hc-rail-more-button" type="button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Show less" : `Show ${clipped.remainingCount} more`}
        </button>
      )}
    </div>
  );
}
