import { Globe2 } from "lucide-react";
import type { ReactNode } from "react";
import type { MarkdownPromptLinkSegment } from "../state/conversation-markdown-engine";

export function Heading({ children, level }: { children: ReactNode; level: 1 | 2 | 3 | 4 | 5 | 6 }) {
  if (level === 1) return <h1>{children}</h1>;
  if (level === 2) return <h2>{children}</h2>;
  if (level === 3) return <h3>{children}</h3>;
  if (level === 4) return <h4>{children}</h4>;
  if (level === 5) return <h5>{children}</h5>;
  return <h6>{children}</h6>;
}

export function MarkdownPromptLink({ segment }: { segment: MarkdownPromptLinkSegment }) {
  return (
    <span
      className={`hc-markdown-prompt-link is-${segment.promptKind}`}
      data-prompt-link-kind={segment.promptKind}
      title={segment.href}
    >
      <span className="hc-markdown-prompt-link-mark" aria-hidden="true">
        {segment.promptKind === "skill" ? "$" : segment.promptKind === "plugin" ? "@" : "#"}
      </span>
      <span className="hc-markdown-prompt-link-label">{markdownPromptLinkDisplayLabel(segment)}</span>
    </span>
  );
}

export function markdownPromptLinkDisplayLabel(segment: MarkdownPromptLinkSegment): string {
  if (segment.promptKind === "skill") return segment.label.replace(/^\$/u, "");
  if (segment.promptKind === "plugin") return segment.label.replace(/^@/u, "");
  return segment.label;
}

export function MarkdownLink({ children, href, title }: { children: ReactNode; href: string; title?: string | null }) {
  const external = isExternalHref(href);
  return (
    <a
      className={external ? "hc-markdown-link is-external" : "hc-markdown-link"}
      href={href}
      rel={external ? "noreferrer" : undefined}
      target={external ? "_blank" : undefined}
      title={title ?? undefined}
    >
      {external && (
        <span className="hc-markdown-link-icon" aria-hidden="true">
          <Globe2 size={12} />
        </span>
      )}
      <span className="hc-markdown-link-label">{children}</span>
    </a>
  );
}

export function isExternalHref(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
