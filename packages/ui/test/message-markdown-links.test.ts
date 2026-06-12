/*
 * Markdown local-link regression: an assistant reply like
 * "[打开网页文件：outputs/index.html](outputs/index.html)" rendered as a bare
 * <a href="outputs/index.html">. Clicking it resolved the relative href against
 * the SPA origin and navigated the whole webview away (the app appeared to
 * "refresh"). Local destinations must intercept the click and route through the
 * file-reference opener (whose html→Browser gate then renders .html via the
 * Codex-Browser file:// path).
 */
import type { MouseEvent, ReactElement } from "react";
import {
  fileReferenceFromLocalHref,
  isExternalHref,
  MarkdownLink,
} from "../src/components/message-markdown-links";

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

type AnchorProps = {
  href?: string;
  target?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

function renderedAnchorProps(element: ReactElement | null): AnchorProps {
  const props = (element as { props?: AnchorProps } | null)?.props;
  if (!props) throw new Error("MarkdownLink did not render an element");
  return props;
}

export function localLinkInterceptsClickAndRoutes(): void {
  const opened: string[] = [];
  let prevented = 0;
  const anchor = renderedAnchorProps(MarkdownLink({
    children: null,
    href: "outputs/index.html",
    onOpenLocalHref: (href) => opened.push(href),
  }) as ReactElement);
  assert(anchor.target === undefined, "local link must not open a _blank navigation");
  assert(typeof anchor.onClick === "function", "local link must intercept the click");
  anchor.onClick?.({ preventDefault: () => { prevented += 1; } } as unknown as MouseEvent<HTMLAnchorElement>);
  assert(prevented === 1, "local link click must preventDefault (no SPA navigation)");
  assert(opened.length === 1 && opened[0] === "outputs/index.html", "local link click must route the href");
}

export function localLinkWithoutOpenerStillPreventsNavigation(): void {
  let prevented = 0;
  const anchor = renderedAnchorProps(MarkdownLink({
    children: null,
    href: "outputs/index.html",
  }) as ReactElement);
  anchor.onClick?.({ preventDefault: () => { prevented += 1; } } as unknown as MouseEvent<HTMLAnchorElement>);
  assert(prevented === 1, "local link must preventDefault even without an opener");
}

export function externalLinkKeepsDefaultBlankNavigation(): void {
  const anchor = renderedAnchorProps(MarkdownLink({
    children: null,
    href: "https://example.com/docs",
    onOpenLocalHref: () => { throw new Error("external link must not route locally"); },
  }) as ReactElement);
  assert(anchor.target === "_blank", "external link keeps target=_blank");
  assert(anchor.onClick === undefined, "external link keeps default anchor behavior");
  assert(isExternalHref("https://example.com"), "https href is external");
  assert(!isExternalHref("outputs/index.html"), "relative href is not external");
}

export function localHrefBecomesFileReference(): void {
  const relative = fileReferenceFromLocalHref("outputs/index.html");
  assert(relative?.path === "outputs/index.html" && relative.lineStart === 1, "relative href maps to a file reference");

  const absolute = fileReferenceFromLocalHref("/tmp/site/index.html");
  assert(absolute?.path === "/tmp/site/index.html", "absolute href maps to a file reference");

  const fileScheme = fileReferenceFromLocalHref("file:///tmp/site/index.html");
  assert(fileScheme?.path === "/tmp/site/index.html", "file:// prefix is stripped");

  const encoded = fileReferenceFromLocalHref("outputs/my%20page.html");
  assert(encoded?.path === "outputs/my page.html", "percent-encoding is decoded");

  const drive = fileReferenceFromLocalHref("C:/site/index.html");
  assert(drive?.path === "C:/site/index.html", "Windows drive path is kept as a path");

  const anchored = fileReferenceFromLocalHref("outputs/index.html#top");
  assert(anchored?.path === "outputs/index.html", "trailing #fragment is stripped from the file path");

  const queried = fileReferenceFromLocalHref("outputs/index.html?x=1#sec");
  assert(queried?.path === "outputs/index.html", "trailing ?query is stripped from the file path");
}

export function nonFileHrefsStayInert(): void {
  assert(fileReferenceFromLocalHref("#section") === null, "anchor href produces no reference");
  assert(fileReferenceFromLocalHref("mailto:dev@example.com") === null, "mailto href produces no reference");
  assert(fileReferenceFromLocalHref("vscode://file/x.html") === null, "foreign scheme produces no reference");
  assert(fileReferenceFromLocalHref("https://example.com/a.html") === null, "http(s) href is not a local reference");
  assert(fileReferenceFromLocalHref("   ") === null, "blank href produces no reference");
  assert(fileReferenceFromLocalHref("?q=1") === null, "query-only href produces no reference");
}
