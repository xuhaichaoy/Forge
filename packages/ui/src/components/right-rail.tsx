import {
  Bot,
  CheckCircle2,
  ChevronRight,
  Circle,
  FileText,
  GitBranch,
  Globe,
  ImageIcon,
  ListChecks,
  LoaderCircle,
  Network,
  Square,
  Terminal,
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { ArtifactPreviewPanel } from "./artifact-preview-panel";
import { FileReferencePanel } from "./file-reference-panel";
import { convertLocalFileSrc } from "../lib/tauri-host";
import { shouldOpenArtifactPreview } from "../state/artifact-preview";
import type { BranchDetailsViewModel } from "../state/branch-details";
import type { FileReferenceSelection } from "../state/file-references";
import type { OpenThreadHandler } from "./open-thread";
import type { RailEntry, RailEntryAction, RailEntryReference } from "../state/render-groups";
import {
  clipRailEntries,
  type RightRailDisplayMode,
  type RightRailSection as RightRailSectionViewModel,
} from "../state/right-rail";

export interface RightRailProps {
  sections: RightRailSectionViewModel[];
  displayMode?: RightRailDisplayMode;
  artifactPreview?: RailEntry | null;
  fileReference?: FileReferenceSelection | null;
  onCloseArtifactPreview?: () => void;
  onCloseFileReference?: () => void;
  onOpenArtifactPreview?: (entry: RailEntry) => void;
  onOpenArtifactFileExternal?: (reference: RailEntryReference) => void;
  onOpenFileReferenceExternal?: (reference: FileReferenceSelection) => void;
  onOpenFileReference?: (reference: RailEntryReference) => void;
  onOpenUrl?: (url: string) => void;
  onOpenDiff?: () => void;
  onOpenThreadId?: OpenThreadHandler;
  onCleanBackgroundTerminals?: () => void;
  backgroundTerminalCleanupPending?: boolean;
}

export interface RailSectionProps {
  count: number;
  icon: ReactNode;
  id: RightRailSectionViewModel["id"];
  title: string;
  children: ReactNode;
  headerAction?: ReactNode;
}

export interface RailListProps {
  entries: RailEntry[];
  sectionId: RightRailSectionViewModel["id"];
}

export function RightRail({
  sections,
  displayMode = "overlay",
  artifactPreview = null,
  fileReference = null,
  onCloseArtifactPreview,
  onCloseFileReference,
  onOpenArtifactPreview,
  onOpenArtifactFileExternal,
  onOpenFileReferenceExternal,
  onOpenFileReference,
  onOpenUrl,
  onOpenDiff,
  onOpenThreadId,
  onCleanBackgroundTerminals,
  backgroundTerminalCleanupPending = false,
}: RightRailProps) {
  const canOpenEntry = (entry: RailEntry) =>
    isRailEntryActionAvailable(entry, {
      onOpenFileReference,
      onOpenUrl,
      onOpenDiff,
      onOpenThreadId,
    });
  const openEntry = (entry: RailEntry) => {
    openRailEntry(entry, {
      onOpenFileReference,
      onOpenUrl,
      onOpenDiff,
      onOpenThreadId,
    });
  };
  const canOpenArtifactEntry = (entry: RailEntry) =>
    canOpenEntry(entry) || Boolean(onOpenArtifactPreview && shouldOpenArtifactPreview(entry));
  const openArtifactEntry = (entry: RailEntry) => {
    if (onOpenArtifactPreview && shouldOpenArtifactPreview(entry)) {
      onOpenArtifactPreview(entry);
      return;
    }
    openEntry(entry);
  };

  return (
    <aside className="hc-right-rail" data-display-mode={displayMode}>
      {artifactPreview && onCloseArtifactPreview && (
        <ArtifactPreviewPanel
          entry={artifactPreview}
          onClose={onCloseArtifactPreview}
          onOpenFileReference={onOpenFileReference}
          onOpenFileExternal={onOpenArtifactFileExternal}
          onOpenUrl={onOpenUrl}
        />
      )}
      {fileReference && onCloseFileReference && onOpenFileReferenceExternal && (
        <FileReferencePanel
          reference={fileReference}
          onClose={onCloseFileReference}
          onOpenExternal={onOpenFileReferenceExternal}
        />
      )}
      {sections.map((section) => (
        <RailSection
          key={section.id}
          count={section.count}
          headerAction={section.id === "backgroundTerminals" && onCleanBackgroundTerminals ? (
            <button
              aria-label="Stop background terminals"
              className="hc-rail-section-action"
              disabled={backgroundTerminalCleanupPending}
              onClick={onCleanBackgroundTerminals}
              title="Stop background terminals"
              type="button"
            >
              <Square size={12} />
            </button>
          ) : null}
          icon={sectionIcon(section.id)}
          id={section.id}
          title={section.title}
        >
          {section.id === "branchDetails" && section.branchDetails
            ? <BranchDetailsCard details={section.branchDetails} canOpenEntry={canOpenEntry} onOpenEntry={openEntry} />
            : (
                <RailList
                  entries={section.allEntries}
                  sectionId={section.id}
                  canOpenEntry={section.id === "artifacts"
                    ? canOpenArtifactEntry
                    : section.id === "sources" ? undefined : canOpenEntry}
                  onOpenEntry={section.id === "artifacts"
                    ? openArtifactEntry
                    : section.id === "sources" ? undefined : openEntry}
                />
              )}
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
    case "backgroundAgents":
      return <Bot size={15} />;
    case "backgroundTerminals":
      return <Terminal size={15} />;
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
          sectionId="branchDetails"
          canOpen={canOpenEntry}
          onOpen={onOpenEntry}
        />
      )}
    </div>
  );
}

export function RailSection({ count, icon, id, title, children, headerAction = null }: RailSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const contentId = `hc-rail-section-content-${id}`;
  return (
    <section className="hc-rail-section">
      <div className="hc-rail-section-header">
        <button
          aria-controls={contentId}
          aria-expanded={expanded}
          className="hc-rail-section-toggle"
          type="button"
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronRight className="hc-rail-section-chevron" data-expanded={expanded ? "true" : "false"} size={14} />
          <span className="hc-rail-section-title">{icon}{title}</span>
          {!expanded && count > 0 && <span className="hc-rail-section-count">{count}</span>}
        </button>
        {headerAction}
      </div>
      {expanded && (
        <div className="hc-rail-section-content" id={contentId}>
          {children}
        </div>
      )}
    </section>
  );
}

export function RailList({
  entries,
  sectionId,
  canOpenEntry,
  onOpenEntry,
}: RailListProps & {
  canOpenEntry?: (entry: RailEntry) => boolean;
  onOpenEntry?: (entry: RailEntry) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const clipped = shouldClipRailList(sectionId)
    ? clipRailEntries(entries, expanded)
    : {
        entries,
        remainingCount: 0,
        canToggle: false,
      };
  let generatedImageCount = 0;
  return (
    <div className="hc-rail-list">
      {clipped.entries.map((entry) => {
        const isGeneratedImage = sectionId === "artifacts" && isGeneratedImageArtifact(entry);
        if (isGeneratedImage) generatedImageCount += 1;
        return (
          <RailEntryCard
            entry={entry}
            key={entry.id}
            sectionId={sectionId}
            displayTitle={isGeneratedImage ? `Generated image ${generatedImageCount}` : undefined}
            canOpen={canOpenEntry}
            onOpen={onOpenEntry}
          />
        );
      })}
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
  sectionId,
  displayTitle,
  canOpen,
  onOpen,
}: {
  entry: RailEntry;
  sectionId: RightRailSectionViewModel["id"];
  displayTitle?: string;
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
        <RailEntryContent entry={entry} sectionId={sectionId} displayTitle={displayTitle} />
      </button>
    );
  }

  return (
    <div className="hc-rail-card">
      <RailEntryContent entry={entry} sectionId={sectionId} displayTitle={displayTitle} />
    </div>
  );
}

function RailEntryContent({
  entry,
  sectionId,
  displayTitle,
}: {
  entry: RailEntry;
  sectionId: RightRailSectionViewModel["id"];
  displayTitle?: string;
}) {
  const title = displayTitle ?? entry.title;
  const showSecondary = sectionId === "branchDetails";
  const tooltip = entry.meta ?? title;
  const diffStats = sectionId === "backgroundAgents" ? entry.diffStats ?? null : null;
  return (
    <div className="hc-rail-card-main">
      <span className="hc-rail-card-icon" aria-hidden="true">
        {railEntryIcon(entry, sectionId)}
      </span>
      <div className="hc-rail-card-copy">
        <div className="hc-rail-card-title-row">
          <div className="hc-rail-card-title" title={tooltip}>{title}</div>
          {diffStats && <RailDiffStats stats={diffStats} />}
        </div>
        {showSecondary && entry.meta && <div className="hc-rail-card-meta">{entry.meta}</div>}
        {showSecondary && entry.status && <div className="hc-rail-card-status">{entry.status}</div>}
      </div>
    </div>
  );
}

function RailDiffStats({ stats }: { stats: NonNullable<RailEntry["diffStats"]> }) {
  return (
    <span className="hc-rail-diff-stats" aria-label={`${stats.linesAdded} lines added, ${stats.linesRemoved} lines removed`}>
      <span className="hc-rail-diff-added">+{stats.linesAdded}</span>
      <span className="hc-rail-diff-removed">-{stats.linesRemoved}</span>
    </span>
  );
}

function railEntryIcon(entry: RailEntry, sectionId: RightRailSectionViewModel["id"]): ReactNode {
  if (sectionId === "progress") return progressEntryIcon(entry.status);
  if (sectionId === "branchDetails") return <GitBranch size={14} />;
  if (sectionId === "backgroundAgents") {
    return entry.status === "active"
      ? <LoaderCircle className="hc-rail-progress-spinner" size={14} />
      : <Bot size={14} />;
  }
  if (sectionId === "backgroundTerminals") return <Terminal size={14} />;
  if (sectionId === "sources") return <Network size={14} />;
  const imageSrc = railEntryImageSrc(entry);
  if (imageSrc) return <img alt="" className="hc-rail-card-thumb" src={imageSrc} />;
  if (entry.action?.kind === "url") return <Globe size={14} />;
  if (entry.reference && isImageArtifactPath(entry.reference.path)) return <ImageIcon size={14} />;
  return <FileText size={14} />;
}

function shouldClipRailList(sectionId: RightRailSectionViewModel["id"]): boolean {
  return sectionId === "artifacts" || sectionId === "sources";
}

function progressEntryIcon(status: string | undefined): ReactNode {
  const normalized = normalizeProgressStatus(status);
  if (normalized === "completed") return <CheckCircle2 size={14} />;
  if (normalized === "inProgress") return <LoaderCircle className="hc-rail-progress-spinner" size={14} />;
  return <Circle size={14} />;
}

function normalizeProgressStatus(status: string | undefined): "completed" | "inProgress" | "pending" {
  if (status === "completed" || status === "complete" || status === "done") return "completed";
  if (status === "inProgress" || status === "in_progress" || status === "running" || status === "active") {
    return "inProgress";
  }
  return "pending";
}

interface RailEntryOpenHandlers {
  onOpenFileReference?: (reference: RailEntryReference) => void;
  onOpenUrl?: (url: string) => void;
  onOpenDiff?: () => void;
  onOpenThreadId?: OpenThreadHandler;
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
      return false;
    case "diff":
      return Boolean(handlers.onOpenDiff);
    case "thread":
      return Boolean(handlers.onOpenThreadId);
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
      return;
    case "diff":
      handlers.onOpenDiff?.();
      return;
    case "thread":
      handlers.onOpenThreadId?.(action.threadId, {
        displayName: action.displayName,
        model: action.model,
        role: action.role,
      });
      return;
  }
}

function railEntryAction(entry: RailEntry): RailEntryAction | undefined {
  return entry.action ?? (entry.reference ? { kind: "file", reference: entry.reference } : undefined);
}

function isImageArtifactPath(value: string): boolean {
  return /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|svg|tiff?|webp)(?:[?#].*)?$/i.test(value);
}

function isGeneratedImageArtifact(entry: RailEntry): boolean {
  const path = entry.reference?.path ?? entry.meta ?? entry.id;
  const basename = path.split(/[\\/]/).filter(Boolean).pop() ?? path;
  return /^ig_[a-f0-9]{32,}\.(?:avif|gif|jpe?g|png|webp)$/i.test(basename);
}

function railEntryImageSrc(entry: RailEntry): string {
  const action = entry.action;
  if (action?.kind === "url" && isImageArtifactPath(urlPathname(action.url))) return action.url;
  const imagePath = entry.reference?.path && isImageArtifactPath(entry.reference.path)
    ? entry.reference.path
    : entry.meta && isImageArtifactPath(entry.meta) ? entry.meta : "";
  if (!imagePath) return "";
  if (/^(?:data:image\/|blob:|https?:|file:)/i.test(imagePath)) return imagePath;
  try {
    return convertLocalFileSrc(imagePath);
  } catch {
    return imagePath.startsWith("/") ? `file://${encodeURI(imagePath)}` : "";
  }
}

function urlPathname(value: string): string {
  try {
    return new URL(value).pathname;
  } catch {
    return value;
  }
}
