import { FileText, Globe2, ImageIcon, Presentation, ScrollText, Sheet, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { convertLocalFileSrc } from "../lib/tauri-host";
import { projectArtifactPreview } from "../state/artifact-preview";
import type { AssistantEndResource, RailEntry } from "../state/render-group-types";

export interface AssistantEndResourceCardViewModel {
  entry: RailEntry;
  hoverLabel?: string;
  icon: LucideIcon;
  imageSrc?: string;
  key: string;
  meta: string;
  openLabel: string;
  title: string;
  trailingLabel: string;
  typeLabel: string;
}

const END_RESOURCE_PREVIEW_LIMIT = 3;

export function assistantEndResourceCardViewModels(resources: AssistantEndResource[]): AssistantEndResourceCardViewModel[] {
  return resources.map((resource) => {
    const entry = railEntryForEndResource(resource);
    if (resource.type === "website") {
      const title = "Web preview";
      return {
        entry,
        hoverLabel: "Open in Codex Browser",
        icon: Globe2,
        key: `website:${resource.target}`,
        meta: resource.target,
        openLabel: `Open ${title}`,
        title,
        trailingLabel: "Open in",
        typeLabel: "Website",
      };
    }
    if (resource.type === "google-drive") {
      return {
        entry,
        icon: googleDriveResourceIcon(resource.resourceKind),
        key: `google-drive:${resource.url}`,
        meta: resource.url,
        openLabel: `Open ${resource.title}`,
        title: resource.title,
        trailingLabel: "Open",
        typeLabel: googleDriveResourceTypeLabel(resource.resourceKind),
      };
    }
    const preview = projectArtifactPreview(entry);
    const path = preview.reference?.path ?? resource.path;
    return {
      entry,
      icon: assistantEndResourceIcon(preview.kind),
      imageSrc: assistantEndResourceImageSrc(preview),
      key: `file:${path}`,
      meta: path,
      hoverLabel: "Open preview",
      openLabel: `Open ${preview.title}`,
      title: preview.title,
      trailingLabel: "Open in",
      typeLabel: assistantEndResourceFileTypeLabel(path, preview.kind),
    };
  });
}

export function AssistantEndResourceCards({
  resources,
  onOpenArtifact,
}: {
  resources: AssistantEndResource[];
  onOpenArtifact?: (entry: RailEntry) => void;
}) {
  const cards = assistantEndResourceCardViewModels(resources);
  const [expanded, setExpanded] = useState(false);
  if (cards.length === 0) return null;
  const visibleCards = expanded ? cards : cards.slice(0, END_RESOURCE_PREVIEW_LIMIT);
  const hiddenCount = cards.length - visibleCards.length;

  return (
    <div className="hc-assistant-resource-list hc-assistant-end-resource-list">
      {visibleCards.map((card) => {
        const Icon = card.icon;
        const subtitle = (
          <span className="hc-assistant-resource-card-subtitles">
            <span className="hc-assistant-resource-card-type">{card.typeLabel}</span>
            {card.hoverLabel ? (
              <span className="hc-assistant-resource-card-hover-type">{card.hoverLabel}</span>
            ) : null}
          </span>
        );
        const content = (
          <>
            {card.imageSrc ? (
              <span className="hc-assistant-resource-card-preview">
                <img alt="" src={card.imageSrc} />
              </span>
            ) : (
              <span className="hc-assistant-resource-card-icon">
                <Icon size={18} />
              </span>
            )}
            <span className="hc-assistant-resource-card-copy">
              <span className="hc-assistant-resource-card-title">{card.title}</span>
              {subtitle}
            </span>
            <span className="hc-assistant-resource-card-open-label">{card.trailingLabel}</span>
          </>
        );

        if (!onOpenArtifact) {
          return (
            <div className="hc-assistant-resource-card hc-assistant-end-resource-card" key={card.key}>
              {content}
            </div>
          );
        }

        return (
          <button
            className="hc-assistant-resource-card hc-assistant-end-resource-card is-button"
            aria-label={card.openLabel}
            key={card.key}
            type="button"
            onClick={() => onOpenArtifact(card.entry)}
          >
            {content}
          </button>
        );
      })}
      {hiddenCount > 0 && (
        <button
          className="hc-assistant-resource-card hc-assistant-end-resource-card is-button is-show-more"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(true)}
        >
          <span>Show {hiddenCount} more</span>
        </button>
      )}
    </div>
  );
}

function railEntryForEndResource(resource: AssistantEndResource): RailEntry {
  if (resource.type === "file") {
    const reference = { path: resource.path, lineStart: 1 };
    return {
      id: `end-resource:file:${resource.path}`,
      title: basename(resource.path),
      meta: resource.path,
      status: "referenced",
      reference,
      action: { kind: "file", reference },
    };
  }
  if (resource.type === "website") {
    return {
      id: `end-resource:website:${resource.target}`,
      title: "Web preview",
      meta: resource.target,
      status: "website",
      action: { kind: "url", url: resource.target },
    };
  }
  return {
    id: `end-resource:google-drive:${resource.url}`,
    title: resource.title,
    meta: resource.url,
    status: googleDriveResourceTypeLabel(resource.resourceKind),
    action: { kind: "url", url: resource.url },
  };
}

function assistantEndResourceIcon(kind: ReturnType<typeof projectArtifactPreview>["kind"]): LucideIcon {
  if (kind === "image") return ImageIcon;
  if (kind === "spreadsheet") return Sheet;
  if (kind === "presentation") return Presentation;
  if (kind === "markdown" || kind === "text") return ScrollText;
  return FileText;
}

function googleDriveResourceIcon(kind: Extract<AssistantEndResource, { type: "google-drive" }>["resourceKind"]): LucideIcon {
  if (kind === "spreadsheet") return Sheet;
  if (kind === "presentation") return Presentation;
  return FileText;
}

function assistantEndResourceImageSrc(preview: ReturnType<typeof projectArtifactPreview>): string {
  const source = preview.imageSource;
  if (!source) return "";
  if (source.kind === "url") return source.src;
  if (/^file:/i.test(source.src)) return source.src;
  if (!source.src.startsWith("/")) return "";
  try {
    return convertLocalFileSrc(source.src);
  } catch {
    return `file://${encodeURI(source.src)}`;
  }
}

function assistantEndResourceFileTypeLabel(path: string, kind: ReturnType<typeof projectArtifactPreview>["kind"]): string {
  const extension = pathExtension(path);
  const normalizedExtension = extension ? extension.toLowerCase() : "";
  const labelExtension = normalizedExtension.toUpperCase();
  if (normalizedExtension === "csv" || normalizedExtension === "tsv" || normalizedExtension === "xls" || normalizedExtension === "xlsm" || normalizedExtension === "xlsx") {
    return `Spreadsheet · ${labelExtension}`;
  }
  if (normalizedExtension === "ppt" || normalizedExtension === "pptx") {
    return `Slides · ${labelExtension}`;
  }
  if (kind === "image") return normalizedExtension ? `Image · ${labelExtension}` : "Image";
  if (normalizedExtension === "pdf" || normalizedExtension === "doc" || normalizedExtension === "docx" || normalizedExtension === "md" || normalizedExtension === "mdx") {
    return `Document · ${labelExtension}`;
  }
  if (kind === "markdown") return "Document · MD";
  if (kind === "text") return normalizedExtension ? `Text · ${labelExtension}` : "Text";
  if (kind === "pdf") return "Document · PDF";
  if (kind === "presentation") return "Presentation";
  if (kind === "spreadsheet") return "Spreadsheet";
  if (kind === "document") return "Document";
  return normalizedExtension ? `File · ${labelExtension}` : "File";
}

function googleDriveResourceTypeLabel(kind: Extract<AssistantEndResource, { type: "google-drive" }>["resourceKind"]): string {
  if (kind === "document") return "Docs";
  if (kind === "spreadsheet") return "Sheets";
  if (kind === "presentation") return "Slides";
  return "Drive";
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function pathExtension(value: string): string {
  const match = value.trim().match(/\.([A-Za-z0-9]+)(?:[#?].*)?$/);
  return match?.[1] ?? "";
}
