import {
  formatItemDetail,
  itemText,
  itemType,
  type ConversationRenderUnit,
} from "./render-groups";

export interface ConversationMarkdownInput {
  title: string;
  units: ConversationRenderUnit[];
}

export function buildConversationMarkdown(input: ConversationMarkdownInput): string {
  const sections = [`# ${escapeHeading(input.title || "Codex conversation")}`];

  for (const unit of input.units) {
    if (unit.kind === "message") {
      const text = normalizedText(unit.text).trim();
      if (text) {
        sections.push(unit.role === "user"
          ? `## User\n\n${blockquote(text)}`
          : `## Assistant\n\n${text}`);
      }
      if (unit.role === "assistant") {
        for (const after of unit.assistantAfter ?? []) {
          const section = after.kind === "generatedImageGallery"
            ? generatedImageGalleryMarkdown(after)
            : after.kind === "assistantEndResources"
              ? assistantEndResourcesMarkdown(after)
              : null;
          if (section) sections.push(section);
        }
      }
      continue;
    }

    if (unit.kind === "toolActivity") {
      const detail = unit.items
        .map((item) => normalizedText(formatItemDetail(item)).trim())
        .filter(Boolean)
        .join("\n\n");
      const body = detail || unit.summary.details.join("\n");
      sections.push(details(unit.summary.label, body || "No detail"));
      continue;
    }

    /*
     * `generatedImageGallery` is HiCodex's per-turn collected image carousel
     * (Codex `JC`). Markdown export renders each image as a separate
     * `![Generated image](src)` link rather than the carousel container.
     */
    if (unit.kind === "generatedImageGallery") {
      const section = generatedImageGalleryMarkdown(unit);
      if (section) sections.push(section);
      continue;
    }
    if (unit.kind === "assistantEndResources") {
      const section = assistantEndResourcesMarkdown(unit);
      if (section) sections.push(section);
      continue;
    }

    /*
     * A `dynamicToolCallGroup` is a render-only batching of consecutive
     * dynamic-tool-call items; markdown export expands it back to one section
     * per item (unchanged from the pre-grouping standalone export).
     */
    if (unit.kind === "dynamicToolCallGroup") {
      for (const item of unit.items) {
        const itemBody = normalizedText(formatItemDetail(item) || itemText(item)).trim();
        sections.push(details(threadItemLabel({ kind: "threadItem", key: item.id, item }), itemBody || "No detail"));
      }
      continue;
    }

    const body = unit.kind === "event"
      ? normalizedText(unit.text || itemText(unit.item)).trim()
      : normalizedText(formatItemDetail(unit.item) || itemText(unit.item)).trim();
    const label = unit.kind === "event" ? unit.label : threadItemLabel(unit);
    sections.push(details(label, body || "No detail"));
  }

  return `${sections.join("\n\n").trimEnd()}\n`;
}

function assistantEndResourcesMarkdown(unit: Extract<ConversationRenderUnit, { kind: "assistantEndResources" }>): string | null {
  if (unit.resources.length === 0) return null;
  const body = unit.resources.map((resource) => {
    switch (resource.type) {
      case "file":
        return `- ${resource.path}`;
      case "website":
        return `- ${resource.target}`;
      case "google-drive":
        return `- [${resource.title}](${resource.url})`;
    }
  }).join("\n");
  return details("Resources", body);
}

function generatedImageGalleryMarkdown(unit: Extract<ConversationRenderUnit, { kind: "generatedImageGallery" }>): string | null {
  if (unit.images.length === 0) return null;
  const imageLinks = unit.images
    .map((image, index) => {
      const source = imageSourceForMarkdown(image);
      return source ? `![Generated image ${index + 1}](${markdownImageTarget(source)})` : "";
    })
    .filter(Boolean)
    .join("\n\n");
  return imageLinks ? details("Generated images", imageLinks) : null;
}

function imageSourceForMarkdown(image: Record<string, unknown>): string {
  for (const key of ["src", "imageUrl", "path", "url", "savedPath"]) {
    const value = image[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  const result = image.result;
  return typeof result === "string" && result.trim().length > 0 ? `data:image/png;base64,${result.trim()}` : "";
}

function markdownImageTarget(value: string): string {
  return /[\s()<>]/.test(value) ? `<${value.replaceAll(">", "%3E")}>` : value;
}

function details(summary: string, body: string): string {
  return `<details><summary>${escapeHtml(summary || "Activity")}</summary>\n\n${sanitizeDetails(body).trim()}\n\n</details>`;
}

function blockquote(text: string): string {
  return text.split("\n").map((line) => line ? `> ${line}` : ">").join("\n");
}

function normalizedText(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function sanitizeDetails(value: string): string {
  return normalizedText(value).replaceAll(/<\/?details(?=[\s>])[^>]*>/gi, (match) => escapeHtml(match));
}

function escapeHeading(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim().replaceAll("#", "\\#") || "Codex conversation";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function threadItemLabel(unit: Extract<ConversationRenderUnit, { kind: "threadItem" }>): string {
  const type = itemType(unit.item);
  if (type === "dynamic-tool-call") return "Tool call";
  if (type === "automatic-approval-review") return "Auto-review";
  return "Activity";
}
