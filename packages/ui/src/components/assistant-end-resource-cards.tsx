import { ChevronDown, FileText, FolderOpen, Globe2, ImageIcon, Presentation, ScrollText, Sheet, type LucideIcon } from "lucide-react";
import { useCallback, useRef, useState, type RefObject } from "react";

import { useDismissibleLayer } from "../hooks/use-dismissible-layer";
import { useHiCodexIntl } from "./i18n-provider";
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

// codex: localConversation.endResource.* — the view-model stays locale-free
// (English title/typeLabel, keeps the pure projection + tests stable); the
// renderer maps the English label back to the Codex key. "Website" typeLabel and
// file titles / directory fallbacks are not localized (no bundle key).
const END_RESOURCE_FILE_TYPE_KEY: Record<string, string> = {
  Document: "documentFileType",
  Spreadsheet: "spreadsheetFileType",
  Slides: "presentationFileType",
  Image: "imageFileType",
};
const END_RESOURCE_GOOGLE_SUBTITLE_KEY: Record<string, string> = {
  Docs: "googleDocsSubtitle",
  Sheets: "googleSheetsSubtitle",
  Slides: "googleSlidesSubtitle",
  Drive: "googleDriveSubtitle",
};
function localizeEndResourceTitle(title: string, formatMessage: ReturnType<typeof useHiCodexIntl>["formatMessage"]): string {
  return title === "Web preview"
    ? formatMessage({ id: "localConversation.endResource.websiteTitle", defaultMessage: "Web preview" })
    : title;
}
function localizeEndResourceTypeLabel(typeLabel: string, formatMessage: ReturnType<typeof useHiCodexIntl>["formatMessage"]): string {
  const fileMatch = /^(Document|Spreadsheet|Slides|Image) · (.+)$/.exec(typeLabel);
  if (fileMatch) {
    const kind = fileMatch[1]!;
    return formatMessage(
      { id: `localConversation.endResource.${END_RESOURCE_FILE_TYPE_KEY[kind]}`, defaultMessage: `${kind} · {extension}` },
      { extension: fileMatch[2]! },
    );
  }
  const googleKey = END_RESOURCE_GOOGLE_SUBTITLE_KEY[typeLabel];
  return googleKey
    ? formatMessage({ id: `localConversation.endResource.${googleKey}`, defaultMessage: typeLabel })
    : typeLabel;
}

export function AssistantEndResourceCards({
  resources,
  onOpenArtifact,
  onRevealResource,
}: {
  resources: AssistantEndResource[];
  onOpenArtifact?: (entry: RailEntry) => void;
  onRevealResource?: (entry: RailEntry) => void;
}) {
  const { formatMessage } = useHiCodexIntl();
  const cards = assistantEndResourceCardViewModels(resources);
  const [expanded, setExpanded] = useState(false);
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  const openMenuWrapRef = useRef<HTMLSpanElement | null>(null);
  const closeOpenMenu = useCallback(() => setOpenMenuKey(null), []);
  useDismissibleLayer(openMenuKey != null, openMenuWrapRef, closeOpenMenu);
  if (cards.length === 0) return null;
  const visibleCards = expanded ? cards : cards.slice(0, END_RESOURCE_PREVIEW_LIMIT);
  const hiddenCount = cards.length - visibleCards.length;

  return (
    <div className="hc-assistant-resource-list hc-assistant-end-resource-list">
      {visibleCards.map((card) => {
        const Icon = card.icon;
        const menuOpen = openMenuKey === card.key;
        const subtitle = (
          <span className="hc-assistant-resource-card-subtitles">
            <span className="hc-assistant-resource-card-type">{localizeEndResourceTypeLabel(card.typeLabel, formatMessage)}</span>
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
              <Icon size={24} />
            </span>
            <span className="hc-assistant-resource-card-copy">
              <span className="hc-assistant-resource-card-title">{localizeEndResourceTitle(card.title, formatMessage)}</span>
              {subtitle}
            </span>
            <EndResourceOpenInControl
              card={card}
              menuOpen={menuOpen}
              onOpenChange={(open) => setOpenMenuKey(open ? card.key : null)}
              onRevealResource={onRevealResource}
              refForOpenMenu={openMenuWrapRef}
            />
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
          <div
            className={`hc-assistant-resource-card hc-assistant-end-resource-card is-button ${menuOpen ? "is-menu-open" : ""}`}
            key={card.key}
          >
            <button
              aria-label={card.openLabel}
              className="hc-assistant-end-resource-preview-button"
              type="button"
              onClick={() => onOpenArtifact(card.entry)}
            />
            {content}
          </div>
        );
      })}
      {hiddenCount > 0 && (
        <button
          className="hc-assistant-resource-card hc-assistant-end-resource-card is-button is-show-more"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(true)}
        >
          <span>{formatMessage({ id: "localConversation.endResource.showMore", defaultMessage: "Show {count, number} more" }, { count: hiddenCount })}</span>
          {/* codex show-more button renders a trailing chevron (icon-xs = 16px). */}
          <ChevronDown size={16} aria-hidden />
        </button>
      )}
    </div>
  );
}

function EndResourceOpenInControl({
  card,
  menuOpen,
  onOpenChange,
  onRevealResource,
  refForOpenMenu,
}: {
  card: AssistantEndResourceCardViewModel;
  menuOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onRevealResource?: (entry: RailEntry) => void;
  refForOpenMenu: RefObject<HTMLSpanElement | null>;
}) {
  const { formatMessage } = useHiCodexIntl();
  const canRevealInFolder = card.entry.action?.kind === "file" && Boolean(onRevealResource);
  if (!canRevealInFolder) {
    return <span className="hc-assistant-resource-card-open-label">{card.trailingLabel}</span>;
  }

  return (
    <span
      className="hc-assistant-end-resource-open-menu-wrap"
      ref={menuOpen ? refForOpenMenu : undefined}
    >
      <button
        type="button"
        className="hc-assistant-resource-card-open-label hc-assistant-end-resource-open-trigger"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => onOpenChange(!menuOpen)}
      >
        <span>{card.trailingLabel}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {menuOpen && (
        <span className="hc-thread-menu hc-app-popover-menu hc-assistant-end-resource-open-menu" role="menu" data-state="open">
          <button
            type="button"
            className="hc-thread-menu-item"
            role="menuitem"
            onClick={() => {
              onOpenChange(false);
              onRevealResource?.(card.entry);
            }}
          >
            <FolderOpen size={13} aria-hidden />
            <span>{formatMessage({ id: "localConversation.endResource.openInFolder", defaultMessage: "Open in folder" })}</span>
          </button>
        </span>
      )}
    </span>
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
