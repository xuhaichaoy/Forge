export interface MarkdownPromptLinkSegment {
  href: string;
  kind: "promptLink";
  label: string;
  promptKind: MarkdownPromptLinkKind;
}

export type MarkdownPromptLinkKind = "app" | "plugin" | "skill";

export function parseMarkdownPromptLink(text: string, startIndex = 0): (MarkdownPromptLinkSegment & { endIndex: number }) | null {
  if (text[startIndex] === "$") {
    const match = text.slice(startIndex).match(/^\$(?:\[([^\]\n]+)\]|([A-Za-z][\w-]*))/u);
    const name = (match?.[1] ?? match?.[2] ?? "").trim();
    if (!match || !name) return null;
    const label = `$${name}`;
    return {
      kind: "promptLink",
      endIndex: startIndex + match[0].length,
      href: `skill://${encodeURIComponent(name)}`,
      label,
      promptKind: "skill",
    };
  }

  if (text[startIndex] === "@") {
    const match = text.slice(startIndex).match(/^@[A-Za-z0-9][\w.-]*[\\/][\w./-]*/u);
    const label = match?.[0] ?? "";
    if (!label) return null;
    return {
      kind: "promptLink",
      endIndex: startIndex + label.length,
      href: `plugin://${label.slice(1).replace("\\", "/")}`,
      label,
      promptKind: "plugin",
    };
  }
  return null;
}

export function markdownPromptLinkFromHref(label: string, href: string): MarkdownPromptLinkSegment | null {
  const promptKind = markdownPromptLinkKindFromHref(href);
  if (!promptKind) return null;
  return {
    kind: "promptLink",
    href,
    label: normalizedMarkdownPromptLinkLabel(label, href, promptKind),
    promptKind,
  };
}

function markdownPromptLinkKindFromHref(href: string): MarkdownPromptLinkKind | null {
  try {
    const protocol = new URL(href).protocol;
    if (protocol === "app:") return "app";
    if (protocol === "plugin:") return "plugin";
    if (protocol === "skill:") return "skill";
  } catch {
    return null;
  }
  return null;
}

function normalizedMarkdownPromptLinkLabel(label: string, href: string, promptKind: MarkdownPromptLinkKind): string {
  const trimmed = label.trim();
  if (trimmed) return trimmed;
  try {
    const url = new URL(href);
    const name = decodeURIComponent(url.hostname || url.pathname.replace(/^\/+/u, ""));
    if (promptKind === "skill") return name ? `$${name}` : "$skill";
    if (promptKind === "plugin") return name ? `@${name}` : "@plugin";
    return name || "app";
  } catch {
    return promptKind;
  }
}
