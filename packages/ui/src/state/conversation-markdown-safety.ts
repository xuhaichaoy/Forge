import type { MarkdownInlineSegment } from "./conversation-markdown-types";

export function markdownLinkSegment(
  text: string,
  href: string,
  title: string | null = null,
): Extract<MarkdownInlineSegment, { kind: "link" }> {
  return title === null ? { kind: "link", text, href } : { kind: "link", text, href, title };
}

export function normalizeMarkdownHref(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) return trimmed.slice(1, -1).trim();
  return trimmed;
}

export function safeMarkdownHref(value: string): string | null {
  const href = normalizeMarkdownHref(value);
  if (!href || /[\u0000-\u001F\u007F]/u.test(href)) return null;
  if (href.startsWith("//")) return null;
  const scheme = href.match(/^([A-Za-z][A-Za-z0-9+.-]*):/u)?.[1]?.toLowerCase();
  if (!scheme) return href;
  if (scheme === "http" || scheme === "https") {
    try {
      new URL(href);
      return href;
    } catch {
      return null;
    }
  }
  if (
    scheme === "irc"
    || scheme === "ircs"
    || scheme === "mailto"
    || scheme === "xmpp"
    || scheme === "codex"
  ) {
    return href;
  }
  return null;
}

export function safeMarkdownImageSrc(value: string): string | null {
  const src = normalizeMarkdownHref(value);
  if (!src) return null;
  if (/^data:(?:image|video)\//iu.test(src)) return src;
  if (/^file:/iu.test(src)) return src;
  if (src.startsWith("//")) return null;
  const scheme = src.match(/^([A-Za-z][A-Za-z0-9+.-]*):/u)?.[1]?.toLowerCase();
  if (!scheme) return src;
  return safeMarkdownHref(src);
}

export function priorityBadgeLabelFromSrc(src: string): string | null {
  try {
    const url = new URL(src);
    if (url.protocol !== "https:" || url.hostname !== "img.shields.io") return null;
    if (!url.pathname.startsWith("/badge/")) return null;
    return url.pathname.match(/^\/badge\/(P[0-9]+)(?:-|$)/)?.[1] ?? null;
  } catch {
    return null;
  }
}
