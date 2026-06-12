import { Globe2 } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import type { MarkdownPromptLinkSegment } from "../state/conversation-markdown-engine";
import type { FileReference } from "./file-reference-types";

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

export function MarkdownLink({
  children,
  href,
  title,
  onOpenLocalHref,
}: {
  children: ReactNode;
  href: string;
  title?: string | null;
  onOpenLocalHref?: (href: string) => void;
}) {
  const external = isExternalHref(href);
  // A bare local href ("outputs/index.html") resolves against the SPA origin,
  // so a plain <a> click navigates the whole webview away (the page appears to
  // "refresh"). Local destinations must stay inside the app.
  const handleLocalClick = external
    ? undefined
    : (event: MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        onOpenLocalHref?.(href);
      };
  return (
    <a
      className={external ? "hc-markdown-link is-external" : "hc-markdown-link"}
      href={href}
      rel={external ? "noreferrer" : undefined}
      target={external ? "_blank" : undefined}
      title={title ?? undefined}
      onClick={handleLocalClick}
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

// codex: open-workspace-file — a markdown destination that is not an
// http(s)/other-scheme URL is treated as a workspace file reference. file://
// prefixes are stripped; anchor-only hrefs and foreign schemes (mailto:,
// vscode:, …) produce no reference and the click stays inert. A trailing
// #fragment / ?query addresses content inside the document, not the file on
// disk — the resolver matches literal paths, so both are stripped.
export function fileReferenceFromLocalHref(href: string): FileReference | null {
  let decoded = href;
  try {
    decoded = decodeURI(href);
  } catch {
    // keep the raw href when it is not valid percent-encoding
  }
  const path = decoded.replace(/^file:\/\//i, "").trim();
  if (!path || path.startsWith("#")) return null;
  // ≥2-char scheme guard keeps Windows drive paths ("C:/…") as paths.
  if (/^[a-z][a-z0-9+.-]+:/i.test(path)) return null;
  const filePath = path.replace(/[#?].*$/, "").trim();
  if (!filePath) return null;
  return { path: filePath, lineStart: 1 };
}
