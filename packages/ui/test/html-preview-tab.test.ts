/*
 * Right-panel web preview for workspace .html: the html→Browser gate opens this
 * tab instead of the source view. The rendered page lives in an iframe whose
 * sandbox must NOT include allow-same-origin — same-origin page JS could read
 * any asset-scope file (and reach the Tauri IPC bridge in srcdoc setups).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  HTML_PREVIEW_DESIGN_WIDTH_PX,
  htmlPreviewFitScale,
  HtmlPreviewTabContent,
} from "../src/components/html-preview-tab";

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

export function rendersSandboxedIframeForHtmlPath(): void {
  const html = renderToStaticMarkup(createElement(HtmlPreviewTabContent, {
    path: "/tmp/site/index.html",
    onViewSource: () => {},
    onOpenExternal: () => {},
  }));
  assert(html.includes("<iframe"), "web preview renders an iframe");
  assert(html.includes('sandbox="allow-scripts allow-forms"'), "iframe is sandboxed without allow-same-origin");
  assert(!html.includes("allow-same-origin"), "sandbox must never include allow-same-origin");
  assert(html.includes("/tmp/site/index.html"), "iframe src targets the html file");
  assert(html.includes("hc-html-preview-toolbar"), "toolbar renders");
  assert(html.includes("View source"), "toolbar exposes View source");
  assert(html.includes("Open in browser"), "toolbar exposes the external-browser action");
}

export function omitsOptionalActionsWithoutHandlers(): void {
  const html = renderToStaticMarkup(createElement(HtmlPreviewTabContent, {
    path: "/tmp/site/index.html",
  }));
  assert(!html.includes("View source"), "View source hidden without a handler");
  assert(!html.includes("Open in browser"), "external action hidden without a handler");
  assert(html.includes("Reload preview"), "reload action always available");
  assert(html.includes("Actual size"), "fit/actual-size toggle always available");
}

// Desktop-authored pages collapse in a ~500px panel; fit mode lays out at the
// design width and scales the whole document down to the viewport width.
export function fitScaleShrinksOnlyNarrowViewports(): void {
  assert(htmlPreviewFitScale(null) === 1, "unknown viewport renders 1:1");
  assert(htmlPreviewFitScale(0) === 1, "zero-width viewport renders 1:1");
  assert(htmlPreviewFitScale(HTML_PREVIEW_DESIGN_WIDTH_PX) === 1, "design-width viewport renders 1:1");
  assert(htmlPreviewFitScale(HTML_PREVIEW_DESIGN_WIDTH_PX * 2) === 1, "wide viewport never upscales");
  const half = htmlPreviewFitScale(HTML_PREVIEW_DESIGN_WIDTH_PX / 2);
  assert(Math.abs(half - 0.5) < 1e-9, `half-width viewport scales to 0.5, got ${half}`);
}
