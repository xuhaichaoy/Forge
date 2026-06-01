import { ChevronDown, FileText, Globe2, ImageIcon, Presentation, ScrollText, Sheet, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { projectArtifactPreview } from "../state/artifact-preview";
import type { AssistantEndResource, RailEntry } from "../state/render-group-types";

export interface AssistantEndResourceCardViewModel {
  entry: RailEntry;
  hoverLabel?: string;
  icon: LucideIcon;
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
      key: `file:${path}`,
      meta: path,
      hoverLabel: "Open preview",
      openLabel: `Open ${preview.title}`,
      title: preview.title,
      trailingLabel: "Open in",
      // CODEX-REF local-conversation-thread-DAwsPWah.js: subtitle = `tD(f,c)??nD(o)` —
      // when no known file-TYPE label matches, fall back to the parent DIRECTORY path
      // (`nD`), not "File · {EXT}".
      typeLabel: assistantEndResourceFileTypeLabel(path, preview.kind) ?? assistantEndResourceDirectory(path),
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
            {/* CODEX-REF local-conversation-thread-DAwsPWah.js: inline end-resource card
                always renders the file-type icon tile (`flex size-10 … rounded-lg` with a
                `size-6` icon) — even for images. Image thumbnails (`XE`) appear only in the
                separate generated-image gallery, never in inline cards. */}
            <span className="hc-assistant-resource-card-icon">
              <Icon size={18} />
            </span>
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
          {/* codex show-more button renders a trailing chevron (icon-xs = 16px). */}
          <ChevronDown size={16} aria-hidden />
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

// CODEX-REF local-conversation-thread-DAwsPWah.js `tD(e,t)`: file-type label is driven
// purely by the lower-cased file extension. Document (pdf/doc/docx/md/mdx), Spreadsheet
// (csv/tsv/xls/xlsm/xlsx), Slides (ppt/pptx) and Image (avif/gif/jpeg/jpg/png/webp) sets
// map to a `Kind · {EXT}` label; ANY other / missing extension returns null so the caller
// can fall back to the directory path (`nD`).
function assistantEndResourceFileTypeLabel(path: string, _kind: ReturnType<typeof projectArtifactPreview>["kind"]): string | null {
  const extension = pathExtension(path).toLowerCase();
  if (!extension) return null;
  const labelExtension = extension.toUpperCase();
  if (extension === "pdf" || extension === "doc" || extension === "docx" || extension === "md" || extension === "mdx") {
    return `Document · ${labelExtension}`;
  }
  if (extension === "csv" || extension === "tsv" || extension === "xls" || extension === "xlsm" || extension === "xlsx") {
    return `Spreadsheet · ${labelExtension}`;
  }
  if (extension === "ppt" || extension === "pptx") {
    return `Slides · ${labelExtension}`;
  }
  if (extension === "avif" || extension === "gif" || extension === "jpeg" || extension === "jpg" || extension === "png" || extension === "webp") {
    return `Image · ${labelExtension}`;
  }
  return null;
}

// CODEX-REF local-conversation-thread-DAwsPWah.js `nD(e)`: parent directory of the file
// path — `posix.dirname(path)`, returning "/" when the dirname is "." and otherwise the
// directory with a trailing slash.
function assistantEndResourceDirectory(path: string): string {
  const dir = posixDirname(path);
  return dir === "." ? "/" : `${dir}/`;
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

// POSIX `dirname` semantics (mirrors `path.posix.dirname` used by Codex `nD`): returns the
// parent directory of a "/"-separated path, or "." when there is no directory component.
function posixDirname(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const trimmed = normalized.replace(/\/+$/, "");
  const lastSlash = trimmed.lastIndexOf("/");
  if (lastSlash < 0) return ".";
  if (lastSlash === 0) return "/";
  return trimmed.slice(0, lastSlash);
}
