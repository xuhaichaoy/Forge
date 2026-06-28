import {
  Check,
  Copy,
  WrapText,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import {
  codeBlockTitle,
  shouldRenderSvgCodePreview,
  svgCodePreviewDataUrl,
} from "./code-snippet-helpers";
import type { CodeSnippetWrapMode } from "./code-snippet-helpers";
import {
  codeHighlightKey,
  highlightCodeSegments,
  isPlainTextLanguage,
} from "./code-snippet-highlighting";
import type { CodeHighlightSegment } from "./code-snippet-highlighting";
import { highlightCodeSegmentsWithShiki } from "./code-snippet-shiki-highlighting";
import {
  MermaidDiagram,
  MermaidFlowchartPreview,
  mermaidFlowchartPreviewModel,
} from "./mermaid-code-preview";
import { useForgeIntl } from "./i18n-provider";

export type { CodeSnippetWrapMode } from "./code-snippet-helpers";
export {
  codeBlockTitle,
  desktopMarkdownCodeBlockWrapMode,
  shouldRenderSvgCodePreview,
  svgCodePreviewDataUrl,
} from "./code-snippet-helpers";
export {
  highlightCodeSegmentsWithShiki,
  setShikiImporterForTests,
} from "./code-snippet-shiki-highlighting";
export { highlightCodeSegments } from "./code-snippet-highlighting";
export type { CodeHighlightSegment } from "./code-snippet-highlighting";
export {
  mermaidDiagramKind,
  mermaidFlowchartPreviewModel,
  mermaidThemeVariables,
  resolvedMermaidThemeVariant,
  sanitizeMermaidCode,
  shouldRenderMermaidPreview,
} from "./mermaid-code-preview";
export type {
  MermaidDirection,
  MermaidNodeShape,
  MermaidPreviewEdge,
  MermaidPreviewModel,
  MermaidPreviewNode,
  MermaidThemeVariant,
} from "./mermaid-code-preview";

export function CodeSnippet({
  language,
  text,
  wrapMode = "user-controlled",
  showActionBar = true,
  wrapperClassName = "",
  codeContainerClassName = "",
  codeClassName = "",
}: {
  language: string;
  text: string;
  wrapMode?: CodeSnippetWrapMode;
  showActionBar?: boolean;
  wrapperClassName?: string;
  codeContainerClassName?: string;
  codeClassName?: string;
}) {
  const [userWrapped, setUserWrapped] = useState(false);
  const [copied, setCopied] = useState(false);
  const { formatMessage } = useForgeIntl();
  const normalizedLanguage = language.trim().toLowerCase();
  const wrapped = wrapMode === "always" || (wrapMode === "user-controlled" && userWrapped);
  const showWrapToggle = wrapMode === "user-controlled";
  // codex code-snippet-*.js - word-wrap toggle + copy-code labels are localized.
  const wrapLabel = wrapped
    ? formatMessage({ id: "codeSnippet.wrap.disable", defaultMessage: "Disable word wrap" })
    : formatMessage({ id: "codeSnippet.wrap.enable", defaultMessage: "Enable word wrap" });
  const copyCodeLabel = formatMessage({ id: "copyButton.copyCode", defaultMessage: "Copy code" });
  const title = codeBlockTitle(normalizedLanguage);
  const isDiff = normalizedLanguage === "diff";
  const shouldPreviewSvg = shouldRenderSvgCodePreview(normalizedLanguage, text);
  const isMermaid = normalizedLanguage === "mermaid";
  const mermaidPreview = shouldPreviewSvg ? null : mermaidFlowchartPreviewModel(normalizedLanguage, text);
  const shouldPreviewMermaid = mermaidPreview !== null;
  const highlightKey = codeHighlightKey(normalizedLanguage, text);
  const [shikiHighlight, setShikiHighlight] = useState<{ key: string; segments: CodeHighlightSegment[] | null } | null>(null);
  const asyncHighlightSegments = shikiHighlight?.key === highlightKey ? shikiHighlight.segments : null;

  useEffect(() => {
    if (isDiff || shouldPreviewSvg || isMermaid || text.length === 0 || isPlainTextLanguage(normalizedLanguage)) {
      setShikiHighlight(null);
      return;
    }
    let cancelled = false;
    setShikiHighlight(null);
    highlightCodeSegmentsWithShiki(normalizedLanguage, text)
      .then((segments) => {
        if (!cancelled) setShikiHighlight({ key: highlightKey, segments });
      })
      .catch(() => {
        if (!cancelled) setShikiHighlight({ key: highlightKey, segments: highlightCodeSegments(normalizedLanguage, text) });
      });
    return () => {
      cancelled = true;
    };
  }, [highlightKey, isDiff, isMermaid, normalizedLanguage, shouldPreviewSvg, text]);

  // codex: copy-button-*.js - direct port of upstream CopyButton.
  // Behavior mirrored exactly: writes the in-snippet selection (if any) or the
  // full block text to the clipboard, sets a transient `copied` flag, then
  // clears it after 2000ms (`setTimeout(...,2e3)`) - gated by a focus/mount
  // ref so we don't setState after unmount.
  // ICU strings from upstream copyButton.* family:
  //   copyButton.copied         = "Copied"
  //   copyButton.copy           = "Copy"
  //   CopyButton.copyTooltip    = "Copy"
  //   copyButton.copyAriaLabel  = "Copy"
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const handleCopy = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      const selectedText = selectedTextWithin(event.currentTarget.closest(".hc-code-snippet"), window.getSelection());
      await navigator.clipboard.writeText(selectedText || text);
      setCopied(true);
      window.setTimeout(() => {
        // codex shared copy-button (copy-button-*.js) resets at 2e3.
        if (mountedRef.current) setCopied(false);
      }, 2_000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <figure className={`hc-code-snippet ${wrapped ? "is-wrapped" : ""} ${isDiff ? "is-diff" : ""} ${shouldPreviewSvg ? "is-svg-preview" : ""} ${isMermaid ? "is-mermaid-preview" : ""} ${wrapperClassName}`}>
      {showActionBar && (
        <figcaption>
          <span>{title}</span>
          {/*
           * Codex Desktop i18n (code-snippet-*.js + copy-button-*.js):
           *   codeSnippet.wrap.disable  = "Disable word wrap"
           *   codeSnippet.wrap.enable   = "Enable word wrap"
           *   copyButton.copyCode       = "Copy code"
           * (Upstream default `CopyButton.copyTooltip` = "Copy" is overridden to
           *  "Copy code" inside the code-snippet chunk.)
           */}
          <div className="hc-code-actions">
            {showWrapToggle && (
              <button
                aria-label={wrapLabel}
                aria-pressed={wrapped}
                title={wrapLabel}
                type="button"
                onClick={() => setUserWrapped((value) => !value)}
              >
                <WrapText size={13} />
              </button>
            )}
            <button aria-label={copyCodeLabel} title={copyCodeLabel} type="button" onClick={handleCopy}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
        </figcaption>
      )}
      {isMermaid ? (
        <div className="hc-code-diagram-body">
          <MermaidDiagram
            code={text}
            fallback={shouldPreviewMermaid
              ? <MermaidFlowchartPreview model={mermaidPreview} />
              : (
                  <pre className="hc-mermaid-fallback-code">
                    <code data-language="mermaid">{text}</code>
                  </pre>
                )}
          />
        </div>
      ) : (
        <pre className={codeContainerClassName}>
          {shouldPreviewSvg ? (
            <img
              alt={`${title} preview`}
              className="hc-code-svg-preview"
              src={svgCodePreviewDataUrl(text)}
            />
          ) : (
            <code className={codeClassName} data-language={normalizedLanguage || undefined}>{renderCodeText(text, isDiff, normalizedLanguage, asyncHighlightSegments)}</code>
          )}
        </pre>
      )}
    </figure>
  );
}

function renderCodeText(text: string, isDiff: boolean, language: string, preferredSegments: CodeHighlightSegment[] | null = null): ReactNode {
  if (!isDiff) {
    const highlighted = preferredSegments ?? highlightCodeSegments(language, text);
    if (highlighted) {
      return highlighted.map((segment, index) => (
        <span className={segment.className} key={index} style={segment.style}>{segment.text}</span>
      ));
    }
    return text;
  }
  const lines = text.split("\n");
  return lines.map((line, index) => (
    <span className={diffLineClassName(line)} key={index}>
      {line}
      {index < lines.length - 1 ? "\n" : null}
    </span>
  ));
}

function diffLineClassName(line: string): string {
  if (line.startsWith("+") && !line.startsWith("+++")) return "hc-diff-add";
  if (line.startsWith("-") && !line.startsWith("---")) return "hc-diff-remove";
  if (line.startsWith("@@")) return "hc-diff-hunk";
  return "hc-diff-context";
}

function selectedTextWithin(container: Element | null, selection: Selection | null): string {
  if (!container || !selection || selection.isCollapsed) return "";
  const anchorInside = selection.anchorNode ? container.contains(selection.anchorNode) : false;
  const focusInside = selection.focusNode ? container.contains(selection.focusNode) : false;
  return anchorInside || focusInside ? selection.toString() : "";
}
