import type { ReactNode } from "react";

export type UserMessageInlineMarkdownSegment =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; label: string; href: string };

export function userMessageInlineMarkdownSegmentsForTest(text: string): UserMessageInlineMarkdownSegment[] {
  return userMessageInlineMarkdownSegments(text);
}

function userMessageInlineMarkdownSegments(text: string): UserMessageInlineMarkdownSegment[] {
  const segments: UserMessageInlineMarkdownSegment[] = [];
  let index = 0;
  const pushText = (value: string) => {
    if (!value) return;
    const previous = segments[segments.length - 1];
    if (previous?.kind === "text") previous.text += value;
    else segments.push({ kind: "text", text: value });
  };

  while (index < text.length) {
    const codeIndex = text.indexOf("`", index);
    const linkIndex = text.indexOf("[", index);
    const candidates = [codeIndex, linkIndex].filter((value) => value >= 0);
    const next = candidates.length > 0 ? Math.min(...candidates) : -1;
    if (next < 0) {
      pushText(text.slice(index));
      break;
    }
    pushText(text.slice(index, next));

    if (next === codeIndex) {
      const end = text.indexOf("`", next + 1);
      if (end < 0) {
        pushText(text.slice(next));
        break;
      }
      segments.push({ kind: "code", text: text.slice(next + 1, end) });
      index = end + 1;
      continue;
    }

    const link = parseUserMessageMarkdownLink(text, next);
    if (!link) {
      pushText(text.slice(next, next + 1));
      index = next + 1;
      continue;
    }
    if (isUnsafeUserMessageHref(link.href)) {
      pushText(text.slice(next, link.endIndex));
    } else {
      segments.push({ kind: "link", label: link.label, href: link.href });
    }
    index = link.endIndex;
  }

  return segments;
}

export function renderUserMessageInlineMarkdown(text: string): ReactNode[] {
  return userMessageInlineMarkdownSegments(text).map((segment, index) => {
    if (segment.kind === "code") {
      return <code key={index}>{segment.text}</code>;
    }
    if (segment.kind === "link") {
      const external = isExternalUserMessageHref(segment.href);
      return (
        <a
          className={external ? "hc-markdown-link is-external" : "hc-markdown-link"}
          href={segment.href}
          key={index}
          rel={external ? "noreferrer" : undefined}
          target={external ? "_blank" : undefined}
          title={segment.href}
          // A bare local/relative href resolves against the SPA origin, so a
          // plain click navigates the whole webview away. External links open
          // in a new tab; local ones stay inert (the assistant renderer routes
          // these through the file-reference opener — user messages don't).
          onClick={external ? undefined : (event) => event.preventDefault()}
        >
          <span className="hc-markdown-link-label">{segment.label}</span>
        </a>
      );
    }
    return segment.text;
  });
}

function parseUserMessageMarkdownLink(
  text: string,
  startIndex: number,
): { label: string; href: string; endIndex: number } | null {
  const labelEnd = text.indexOf("]", startIndex + 1);
  if (labelEnd <= startIndex + 1 || text[labelEnd + 1] !== "(") return null;
  let cursor = labelEnd + 2;
  let href = "";
  while (cursor < text.length) {
    const char = text[cursor];
    if (char === "\\") {
      const next = text[cursor + 1];
      if (!next) return null;
      href += next;
      cursor += 2;
      continue;
    }
    if (char === ")") {
      return {
        label: text.slice(startIndex + 1, labelEnd),
        href,
        endIndex: cursor + 1,
      };
    }
    href += char;
    cursor += 1;
  }
  return null;
}

function isUnsafeUserMessageHref(value: string): boolean {
  return /^\s*(?:javascript|data):/i.test(value);
}

function isExternalUserMessageHref(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
