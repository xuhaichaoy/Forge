import { FileText, ImageIcon, Presentation, ScrollText, Sheet, type LucideIcon } from "lucide-react";

import type { RailEntry } from "../state/render-group-types";
import { projectArtifactPreview } from "../state/artifact-preview";
import { convertLocalFileSrc } from "../lib/tauri-host";

export interface AssistantResourceCardViewModel {
  entry: RailEntry;
  icon: LucideIcon;
  imageSrc?: string;
  key: string;
  kind: ReturnType<typeof projectArtifactPreview>["kind"];
  meta: string;
  title: string;
  typeLabel: string;
}

export function assistantResourceCardViewModels(entries: RailEntry[]): AssistantResourceCardViewModel[] {
  return entries.flatMap((entry) => {
    const preview = projectArtifactPreview(entry);
    if (preview.kind === "url") return [];
    return [{
      entry,
      icon: assistantResourceIcon(preview.kind),
      imageSrc: assistantResourceImageSrc(preview),
      key: entry.meta ?? entry.id,
      kind: preview.kind,
      meta: preview.reference?.path ?? preview.meta ?? preview.title,
      title: preview.title,
      typeLabel: assistantResourceTypeLabel(preview.reference?.path ?? preview.title, preview.kind),
    }];
  });
}

export function AssistantResourceCards({
  entries,
  onOpenArtifact,
}: {
  entries: RailEntry[];
  onOpenArtifact?: (entry: RailEntry) => void;
}) {
  const cards = assistantResourceCardViewModels(entries);
  if (cards.length === 0) return null;

  return (
    <div className="hc-assistant-resource-list">
      {cards.map((card) => {
        const Icon = card.icon;
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
              <span className="hc-assistant-resource-card-type">{card.typeLabel}</span>
              <span className="hc-assistant-resource-card-meta">{card.meta}</span>
            </span>
          </>
        );

        if (!onOpenArtifact) {
          return (
            <div className="hc-assistant-resource-card" key={card.key}>
              {content}
            </div>
          );
        }

        return (
          <button
            className="hc-assistant-resource-card is-button"
            data-kind={card.kind}
            key={card.key}
            type="button"
            onClick={() => onOpenArtifact(card.entry)}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

function assistantResourceIcon(kind: ReturnType<typeof projectArtifactPreview>["kind"]): LucideIcon {
  if (kind === "image") return ImageIcon;
  if (kind === "spreadsheet") return Sheet;
  if (kind === "presentation") return Presentation;
  if (kind === "markdown" || kind === "text") return ScrollText;
  return FileText;
}

function assistantResourceImageSrc(preview: ReturnType<typeof projectArtifactPreview>): string {
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

function assistantResourceTypeLabel(path: string, kind: ReturnType<typeof projectArtifactPreview>["kind"]): string {
  const extension = pathExtension(path);
  const normalizedExtension = extension ? extension.toLowerCase() : "";
  if (normalizedExtension === "csv" || normalizedExtension === "tsv" || normalizedExtension === "xls" || normalizedExtension === "xlsm" || normalizedExtension === "xlsx") {
    return `Spreadsheet · ${normalizedExtension}`;
  }
  if (normalizedExtension === "ppt" || normalizedExtension === "pptx") {
    return `Slides · ${normalizedExtension}`;
  }
  if (kind === "image") return normalizedExtension ? `Image · ${normalizedExtension}` : "Image";
  if (normalizedExtension === "doc" || normalizedExtension === "docx" || normalizedExtension === "md" || normalizedExtension === "mdx") {
    return `Document · ${normalizedExtension}`;
  }
  if (kind === "markdown") return "Document · md";
  if (kind === "text") return normalizedExtension ? `Text · ${normalizedExtension}` : "Text";
  if (kind === "pdf") return "PDF";
  if (kind === "presentation") return "Presentation";
  if (kind === "spreadsheet") return "Spreadsheet";
  if (kind === "document") return "Document";
  return normalizedExtension ? `File · ${normalizedExtension}` : "File";
}

function pathExtension(value: string): string {
  const match = value.trim().match(/\.([A-Za-z0-9]+)(?:[#?].*)?$/);
  return match?.[1] ?? "";
}
