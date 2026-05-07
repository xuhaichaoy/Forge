import { FileText, GitBranch, ListChecks, Network } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { FileReferencePanel } from "./file-reference-panel";
import type { BranchDetailsViewModel } from "../state/branch-details";
import type { FileReferenceSelection } from "../state/file-references";
import type { RailEntry, RailEntryAction, RailEntryReference } from "../state/render-groups";
import {
  clipRailEntries,
  type RightRailSection as RightRailSectionViewModel,
} from "../state/right-rail";

export interface RightRailProps {
  sections: RightRailSectionViewModel[];
  fileReference?: FileReferenceSelection | null;
  onCloseFileReference?: () => void;
  onOpenFileReferenceExternal?: (reference: FileReferenceSelection) => void;
  onOpenFileReference?: (reference: RailEntryReference) => void;
  onOpenUrl?: (url: string) => void;
  onOpenSource?: (itemId: string) => void;
  onOpenDiff?: () => void;
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
  fileReference = null,
  onCloseFileReference,
  onOpenFileReferenceExternal,
  onOpenFileReference,
  onOpenUrl,
  onOpenSource,
  onOpenDiff,
}: RightRailProps) {
  const canOpenEntry = (entry: RailEntry) =>
    isRailEntryActionAvailable(entry, {
      onOpenFileReference,
      onOpenUrl,
      onOpenSource,
      onOpenDiff,
    });
  const openEntry = (entry: RailEntry) => {
    openRailEntry(entry, {
      onOpenFileReference,
      onOpenUrl,
      onOpenSource,
      onOpenDiff,
    });
  };

  return (
    <aside className="hc-right-rail">
      {fileReference && onCloseFileReference && onOpenFileReferenceExternal && (
        <FileReferencePanel
          reference={fileReference}
          onClose={onCloseFileReference}
          onOpenExternal={onOpenFileReferenceExternal}
        />
      )}
      {sections.map((section) => (
        <RailSection key={section.id} icon={sectionIcon(section.id)} title={section.title}>
          {section.id === "branchDetails" && section.branchDetails
            ? <BranchDetailsCard details={section.branchDetails} canOpenEntry={canOpenEntry} onOpenEntry={openEntry} />
            : <RailList entries={section.allEntries} canOpenEntry={canOpenEntry} onOpenEntry={openEntry} />}
        </RailSection>
      ))}
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

function BranchDetailsCard({
  details,
  canOpenEntry,
  onOpenEntry,
}: {
  details: BranchDetailsViewModel;
  canOpenEntry: (entry: RailEntry) => boolean;
  onOpenEntry: (entry: RailEntry) => void;
}) {
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
        <RailEntryCard
          entry={{
            id: "diff",
            title: details.diff.title,
            meta: details.diff.summary,
            status: details.diff.files.length > 0
              ? details.diff.files.slice(0, 3).map((file) => file.path).join(", ")
              : undefined,
            action: { kind: "diff" },
          }}
          canOpen={canOpenEntry}
          onOpen={onOpenEntry}
        />
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

export function RailList({
  entries,
  canOpenEntry,
  onOpenEntry,
}: RailListProps & {
  canOpenEntry?: (entry: RailEntry) => boolean;
  onOpenEntry?: (entry: RailEntry) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const clipped = clipRailEntries(entries, expanded);
  return (
    <div className="hc-rail-list">
      {clipped.entries.map((entry) => (
        <RailEntryCard
          entry={entry}
          key={entry.id}
          canOpen={canOpenEntry}
          onOpen={onOpenEntry}
        />
      ))}
      {clipped.canToggle && (
        <button className="hc-rail-more-button" type="button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Show less" : `Show ${clipped.remainingCount} more`}
        </button>
      )}
    </div>
  );
}

function RailEntryCard({
  entry,
  canOpen,
  onOpen,
}: {
  entry: RailEntry;
  canOpen?: (entry: RailEntry) => boolean;
  onOpen?: (entry: RailEntry) => void;
}) {
  if (canOpen?.(entry) && onOpen) {
    return (
      <button
        className="hc-rail-card hc-rail-card-button"
        type="button"
        onClick={() => onOpen(entry)}
      >
        <RailEntryContent entry={entry} />
      </button>
    );
  }

  return (
    <div className="hc-rail-card">
      <RailEntryContent entry={entry} />
    </div>
  );
}

function RailEntryContent({ entry }: { entry: RailEntry }) {
  return (
    <>
      <div className="hc-rail-card-title">{entry.title}</div>
      {entry.meta && <div className="hc-rail-card-meta">{entry.meta}</div>}
      {entry.status && <div className="hc-rail-card-status">{entry.status}</div>}
    </>
  );
}

interface RailEntryOpenHandlers {
  onOpenFileReference?: (reference: RailEntryReference) => void;
  onOpenUrl?: (url: string) => void;
  onOpenSource?: (itemId: string) => void;
  onOpenDiff?: () => void;
}

function isRailEntryActionAvailable(entry: RailEntry, handlers: RailEntryOpenHandlers): boolean {
  const action = railEntryAction(entry);
  if (!action) return false;
  switch (action.kind) {
    case "file":
      return Boolean(handlers.onOpenFileReference);
    case "url":
      return Boolean(handlers.onOpenUrl);
    case "source":
      return Boolean(handlers.onOpenSource);
    case "diff":
      return Boolean(handlers.onOpenDiff);
  }
}

function openRailEntry(entry: RailEntry, handlers: RailEntryOpenHandlers): void {
  const action = railEntryAction(entry);
  if (!action) return;
  switch (action.kind) {
    case "file":
      handlers.onOpenFileReference?.(action.reference);
      return;
    case "url":
      handlers.onOpenUrl?.(action.url);
      return;
    case "source":
      handlers.onOpenSource?.(action.itemId);
      return;
    case "diff":
      handlers.onOpenDiff?.();
      return;
  }
}

function railEntryAction(entry: RailEntry): RailEntryAction | undefined {
  return entry.action ?? (entry.reference ? { kind: "file", reference: entry.reference } : undefined);
}
