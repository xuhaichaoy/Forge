import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Code2, ExternalLink, RefreshCw, ZoomIn, ZoomOut } from "lucide-react";
import { localFileSrc } from "./file-preview-helpers";
import { useHiCodexIntl } from "./i18n-provider";
import { readFileMetadata } from "../lib/tauri-host";
import type { FileReference } from "./file-reference-types";

export interface HtmlPreviewTabProps {
  path: string;
  isActive?: boolean;
  onViewSource?: (reference: FileReference) => void;
  onOpenExternal?: (reference: FileReference) => void;
}

type HtmlPreviewStatus = "loading" | "ready" | "missing";

/*
 * Generated pages are authored for desktop viewports; rendering them into a
 * ~500px panel collapses/overlaps their layout. Fit mode lays the page out at
 * a desktop width and scales the whole document down to the panel width
 * (CodePen-preview style), so the panel shows a miniature of what a real
 * browser window shows. 1:1 mode renders at panel width with native scroll.
 */
export const HTML_PREVIEW_DESIGN_WIDTH_PX = 1280;

export function htmlPreviewFitScale(containerWidthPx: number | null): number {
  if (!containerWidthPx || containerWidthPx <= 0) return 1;
  if (containerWidthPx >= HTML_PREVIEW_DESIGN_WIDTH_PX) return 1;
  return containerWidthPx / HTML_PREVIEW_DESIGN_WIDTH_PX;
}

/*
 * codex: the browser-sidebar file:// route renders a workspace .html inside the
 * right-hand panel. HiCodex has no embedded second webview (Electron
 * WebContentsView equivalent), so the rendered page lives in a sandboxed
 * iframe over the Tauri asset protocol: relative css/js/img resolve against
 * the document's asset URL, each sub-resource re-checked against the asset
 * scope. The sandbox deliberately omits allow-same-origin — with it, page JS
 * would run same-origin with asset://localhost and could fetch any file in
 * the asset scope (and reach window.__TAURI__ in the srcdoc case).
 */
export function HtmlPreviewTabContent({ path, onViewSource, onOpenExternal }: HtmlPreviewTabProps) {
  const { formatMessage } = useHiCodexIntl();
  const [reloadKey, setReloadKey] = useState(0);
  const [status, setStatus] = useState<HtmlPreviewStatus>("loading");
  const [fitWidth, setFitWidth] = useState(true);
  const [viewportWidth, setViewportWidth] = useState<number | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const src = useMemo(() => localFileSrc(path), [path]);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    readFileMetadata(path).catch(() => {
      if (!cancelled) setStatus("missing");
    });
    return () => {
      cancelled = true;
    };
  }, [path, reloadKey]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (typeof width === "number") setViewportWidth(width);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const scale = fitWidth ? htmlPreviewFitScale(viewportWidth) : 1;
  const scaled = scale < 1;
  const frameStyle: CSSProperties | undefined = scaled
    ? {
        width: `${HTML_PREVIEW_DESIGN_WIDTH_PX}px`,
        height: `${100 / scale}%`,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
      }
    : undefined;

  const reference: FileReference = { path, lineStart: 1 };

  return (
    <section className="hc-html-preview-tab" aria-label={formatMessage({ id: "hc.htmlPreview.label", defaultMessage: "Web preview" })}>
      <div className="hc-html-preview-toolbar">
        <span className="hc-html-preview-path" title={path}><bdi>{path}</bdi></span>
        <button
          className="hc-html-preview-icon-button"
          type="button"
          title={fitWidth
            ? formatMessage({ id: "hc.htmlPreview.actualSize", defaultMessage: "Actual size" })
            : formatMessage({ id: "hc.htmlPreview.fitWidth", defaultMessage: "Fit to panel" })}
          aria-pressed={fitWidth}
          onClick={() => setFitWidth((fit) => !fit)}
        >
          {fitWidth ? <ZoomIn size={14} aria-hidden="true" /> : <ZoomOut size={14} aria-hidden="true" />}
        </button>
        <button
          className="hc-html-preview-icon-button"
          type="button"
          title={formatMessage({ id: "hc.htmlPreview.refresh", defaultMessage: "Reload preview" })}
          onClick={() => setReloadKey((key) => key + 1)}
        >
          <RefreshCw size={14} aria-hidden="true" />
        </button>
        {onViewSource && (
          <button
            className="hc-html-preview-icon-button"
            type="button"
            title={formatMessage({ id: "hc.htmlPreview.viewSource", defaultMessage: "View source" })}
            onClick={() => onViewSource(reference)}
          >
            <Code2 size={14} aria-hidden="true" />
          </button>
        )}
        {onOpenExternal && (
          <button
            className="hc-html-preview-icon-button"
            type="button"
            title={formatMessage({ id: "hc.htmlPreview.openExternal", defaultMessage: "Open in browser" })}
            onClick={() => onOpenExternal(reference)}
          >
            <ExternalLink size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      {status === "missing" ? (
        <div className="hc-html-preview-state" data-status="missing">
          {formatMessage({ id: "hc.htmlPreview.missing", defaultMessage: "Couldn’t load this preview — the file does not exist." })}
        </div>
      ) : (
        <div className="hc-html-preview-viewport" data-scaled={scaled ? "true" : undefined} ref={viewportRef}>
          <iframe
            className="hc-html-preview-frame"
            key={reloadKey}
            src={src}
            sandbox="allow-scripts allow-forms"
            referrerPolicy="no-referrer"
            style={frameStyle}
            title={formatMessage({ id: "hc.htmlPreview.label", defaultMessage: "Web preview" })}
            onLoad={() => setStatus("ready")}
          />
        </div>
      )}
    </section>
  );
}
