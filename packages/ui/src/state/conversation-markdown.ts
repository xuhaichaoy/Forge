import {
  formatItemDetail,
  itemText,
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
      if (!text) continue;
      sections.push(unit.role === "user"
        ? `## User\n\n${blockquote(text)}`
        : `## Assistant\n\n${text}`);
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

    const body = normalizedText(unit.text || itemText(unit.item)).trim();
    sections.push(details(unit.label, body || "No detail"));
  }

  return `${sections.join("\n\n").trimEnd()}\n`;
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
