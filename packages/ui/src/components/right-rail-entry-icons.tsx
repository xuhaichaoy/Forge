import {
  CheckCircle2,
  Circle,
  Clock,
  GitBranch,
  Globe,
  ImageIcon,
  LoaderCircle,
  MessageSquareText,
  Network,
  Terminal,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { fileIconFor } from "../lib/file-icon";
import { convertLocalFileSrc } from "../lib/tauri-host";
import type { RailEntry } from "../state/render-groups";
import type { RightRailSection as RightRailSectionViewModel } from "../state/right-rail";
import { normalizePlanStepStatus } from "../state/thread-item-fields";

export function railEntryIcon(entry: RailEntry, sectionId: RightRailSectionViewModel["id"]): ReactNode {
  if (sectionId === "progress") return progressEntryIcon(entry.status);
  if (sectionId === "automation") return <Clock size={16} />;
  if (sectionId === "branchDetails") return <GitBranch size={14} />;
  if (sectionId === "sideChats") {
    return normalizePlanStepStatus(entry.status) === "inProgress"
      ? <LoaderCircle className="hc-rail-progress-spinner" size={18} />
      : <MessageSquareText size={18} />;
  }
  if (sectionId === "backgroundSubagents") return null;
  if (sectionId === "backgroundTasks") return <Terminal size={18} />;
  if (sectionId === "browser") {
    return normalizePlanStepStatus(entry.status) === "inProgress"
      ? <LoaderCircle className="hc-rail-progress-spinner" size={16} />
      : <Globe size={16} />;
  }
  if (sectionId === "sources") {
    if (entry.id === "webSearch") return <Globe size={14} />;
    if (entry.logoUrl || entry.logoUrlDark) {
      return <SourceLogo logoUrl={entry.logoUrl} logoUrlDark={entry.logoUrlDark} alt={entry.title} />;
    }
    return <Network size={14} />;
  }
  const imageSrc = railEntryImageSrc(entry);
  if (imageSrc) return <img alt="" className="hc-rail-card-thumb" src={imageSrc} />;
  if (entry.action?.kind === "url") return <Globe size={18} />;
  if (entry.reference && isImageArtifactPath(entry.reference.path)) return <ImageIcon size={18} />;
  return fileIconFor({ path: entry.reference?.path, size: 18 });
}

export function sourceEntryLogo(entry: RailEntry): ReactNode {
  if (entry.id === "webSearch") return <Globe size={16} />;
  if (entry.logoUrl || entry.logoUrlDark) {
    return <SourceLogo logoUrl={entry.logoUrl} logoUrlDark={entry.logoUrlDark} alt={entry.title} />;
  }
  return <Network size={16} />;
}

function SourceLogo({
  logoUrl,
  logoUrlDark,
  alt,
}: {
  logoUrl?: string | null;
  logoUrlDark?: string | null;
  alt: string;
}): ReactNode {
  const [failed, setFailed] = useState(false);
  const [usingDark, setUsingDark] = useState(false);
  if (failed) return <Network size={14} />;
  const primary = usingDark ? logoUrlDark : logoUrl;
  const fallback = usingDark ? logoUrl : logoUrlDark;
  const src = primary || fallback || "";
  if (!src) return <Network size={14} />;
  return (
    <img
      alt={alt}
      className="hc-rail-card-thumb"
      src={src}
      onError={() => {
        if (!usingDark && logoUrlDark) {
          setUsingDark(true);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}

function progressEntryIcon(status: string | undefined): ReactNode {
  const normalized = normalizePlanStepStatus(status);
  if (normalized === "completed") return <CheckCircle2 size={18} />;
  if (normalized === "inProgress") return <LoaderCircle className="hc-rail-progress-spinner" size={18} />;
  return <Circle size={18} />;
}

export function isBackgroundTerminalEntry(entry: RailEntry): boolean {
  return entry.id.startsWith("background-terminal:");
}

export function isBackgroundAgentEntry(entry: RailEntry): boolean {
  return entry.id.startsWith("background-agent:");
}

function isImageArtifactPath(value: string): boolean {
  return /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|svg|tiff?|webp)(?:[?#].*)?$/i.test(value);
}

export function isGeneratedImageArtifact(entry: RailEntry): boolean {
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
  if (!imagePath.startsWith("/")) return "";
  try {
    return convertLocalFileSrc(imagePath);
  } catch {
    return `file://${encodeURI(imagePath)}`;
  }
}

function urlPathname(value: string): string {
  try {
    return new URL(value).pathname;
  } catch {
    return value;
  }
}
