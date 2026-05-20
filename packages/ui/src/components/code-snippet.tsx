import {
  Check,
  Copy,
  WrapText,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useId, useState } from "react";
import type { MouseEvent, ReactNode } from "react";

export type CodeSnippetWrapMode = "always" | "off" | "user-controlled";

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
  const normalizedLanguage = language.trim().toLowerCase();
  const wrapped = wrapMode === "always" || (wrapMode === "user-controlled" && userWrapped);
  const showWrapToggle = wrapMode === "user-controlled";
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

  const handleCopy = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      const selectedText = selectedTextWithin(event.currentTarget.closest(".hc-code-snippet"), window.getSelection());
      await navigator.clipboard.writeText(selectedText || text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <figure className={`hc-code-snippet ${wrapped ? "is-wrapped" : ""} ${isDiff ? "is-diff" : ""} ${shouldPreviewSvg ? "is-svg-preview" : ""} ${isMermaid ? "is-mermaid-preview" : ""} ${wrapperClassName}`}>
        {showActionBar && (
          <figcaption>
            <span>{title}</span>
            <div className="hc-code-actions">
              {showWrapToggle && (
                <button
                  aria-label={wrapped ? "Disable word wrap" : "Enable word wrap"}
                  aria-pressed={wrapped}
                  title={wrapped ? "Disable word wrap" : "Enable word wrap"}
                  type="button"
                  onClick={() => setUserWrapped((value) => !value)}
                >
                  <WrapText size={13} />
                </button>
              )}
              <button aria-label="Copy code" title="Copy code" type="button" onClick={handleCopy}>
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
      {copied && <CopyFeedbackToast />}
    </>
  );
}

function MermaidDiagram({ code, fallback }: { code: string; fallback: ReactNode }) {
  const reactId = useId();
  const themeVariant = useMermaidThemeVariant();
  const [result, setResult] = useState<{ html: string | null; status: "error" | "loading" | "ready" }>({
    html: null,
    status: "loading",
  });

  useEffect(() => {
    let cancelled = false;
    const safeCode = sanitizeMermaidCode(code);
    if (!safeCode) {
      setResult({ html: null, status: "error" });
      return;
    }
    const renderId = `hicodex-mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
    import("mermaid")
      .then(({ default: mermaid }) => {
        mermaid.initialize({
          deterministicIds: true,
          deterministicIDSeed: "codex-mermaid",
          flowchart: { htmlLabels: false },
          fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
          htmlLabels: false,
          securityLevel: "strict",
          startOnLoad: false,
          suppressErrorRendering: true,
          theme: "base",
          themeVariables: mermaidThemeVariables(themeVariant),
        });
        return mermaid.render(renderId, safeCode);
      })
      .then(({ svg }) => {
        if (!cancelled) setResult({ html: svg, status: "ready" });
      })
      .catch(() => {
        if (!cancelled) setResult({ html: null, status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [code, reactId, themeVariant]);

  if (result.status === "ready" && result.html) {
    return <div className="hc-mermaid-preview is-rendered" dangerouslySetInnerHTML={{ __html: result.html }} />;
  }
  return <>{fallback}</>;
}

const MERMAID_DIRECTIVE_RE = /%%\{[\s\S]*?\}%%/g;
const MERMAID_SECURITY_LEVEL_RE = /securityLevel\s*:/i;
const MERMAID_CLICK_RE = /^\s*click\s+.*$/gim;

export function sanitizeMermaidCode(text: string): string | null {
  let hadSecurityDirective = false;
  const withoutDirectives = text.replace(MERMAID_DIRECTIVE_RE, (directive) => {
    if (MERMAID_SECURITY_LEVEL_RE.test(directive)) hadSecurityDirective = true;
    return "";
  });
  if (hadSecurityDirective) return null;
  const cleaned = withoutDirectives
    .replace(MERMAID_CLICK_RE, "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .join("\n")
    .trim();
  return cleaned || null;
}

export type MermaidThemeVariant = "dark" | "light";

function useMermaidThemeVariant(): MermaidThemeVariant {
  const [variant, setVariant] = useState<MermaidThemeVariant>(() => resolvedMermaidThemeVariant());

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    const update = () => setVariant(resolvedMermaidThemeVariant());
    const themeRoots = [
      document.querySelector(".hc-app"),
      document.documentElement,
    ].filter((element): element is Element => element !== null);
    const observers = typeof MutationObserver === "undefined"
      ? []
      : themeRoots.map((element) => {
          const observer = new MutationObserver(update);
          observer.observe(element, {
            attributeFilter: ["data-theme", "data-theme-mode", "data-hc-theme"],
            attributes: true,
          });
          return observer;
        });
    const media = window.matchMedia?.("(prefers-color-scheme: dark)") ?? null;
    media?.addEventListener("change", update);
    update();
    return () => {
      observers.forEach((observer) => observer.disconnect());
      media?.removeEventListener("change", update);
    };
  }, []);

  return variant;
}

export function resolvedMermaidThemeVariant(): MermaidThemeVariant {
  if (typeof document === "undefined" || typeof window === "undefined") return "light";
  const explicitTheme = document.querySelector(".hc-app")?.getAttribute("data-theme")
    ?? document.documentElement.getAttribute("data-theme")
    ?? document.documentElement.getAttribute("data-hc-theme");
  if (explicitTheme === "dark" || explicitTheme === "light") return explicitTheme;
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

export function mermaidThemeVariables(theme: MermaidThemeVariant = "light"): Record<string, string> {
  if (theme === "dark") {
    return {
      background: "rgb(21, 23, 28)",
      clusterBkg: "rgba(235, 238, 244, 0.07)",
      edgeLabelBackground: "rgb(21, 23, 28)",
      lineColor: "rgba(232, 234, 238, 0.72)",
      mainBkg: "rgb(21, 23, 28)",
      noteBkgColor: "rgba(235, 238, 244, 0.08)",
      noteBorderColor: "rgba(235, 238, 244, 0.18)",
      noteTextColor: "rgb(232, 234, 238)",
      primaryBorderColor: "rgba(235, 238, 244, 0.18)",
      primaryColor: "rgb(27, 30, 36)",
      primaryTextColor: "rgb(232, 234, 238)",
      secondaryColor: "rgba(235, 238, 244, 0.08)",
      secondaryTextColor: "rgba(232, 234, 238, 0.72)",
      tertiaryColor: "rgba(235, 238, 244, 0.07)",
      tertiaryTextColor: "rgba(232, 234, 238, 0.58)",
      textColor: "rgb(232, 234, 238)",
    };
  }
  return {
    background: "rgb(255, 255, 255)",
    clusterBkg: "rgba(0, 0, 0, 0.04)",
    edgeLabelBackground: "rgb(255, 255, 255)",
    lineColor: "rgba(17, 24, 28, 0.7)",
    mainBkg: "rgb(255, 255, 255)",
    noteBkgColor: "rgba(0, 0, 0, 0.04)",
    noteBorderColor: "rgba(17, 24, 28, 0.14)",
    noteTextColor: "rgb(17, 24, 28)",
    primaryBorderColor: "rgba(17, 24, 28, 0.12)",
    primaryColor: "rgb(255, 255, 255)",
    primaryTextColor: "rgb(17, 24, 28)",
    secondaryColor: "rgba(0, 0, 0, 0.04)",
    secondaryTextColor: "rgba(17, 24, 28, 0.7)",
    tertiaryColor: "rgba(0, 0, 0, 0.04)",
    tertiaryTextColor: "rgba(17, 24, 28, 0.55)",
    textColor: "rgb(17, 24, 28)",
  };
}

export function codeBlockTitle(language: string): string {
  return language.trim() || "text";
}

export function desktopMarkdownCodeBlockWrapMode(language: string): CodeSnippetWrapMode {
  const normalizedLanguage = language.trim().toLowerCase();
  return !normalizedLanguage || normalizedLanguage === "text" || normalizedLanguage === "md" || normalizedLanguage === "markdown"
    ? "user-controlled"
    : "off";
}

export function shouldRenderSvgCodePreview(language: string, text: string): boolean {
  const normalizedLanguage = language.trim().toLowerCase();
  if (normalizedLanguage === "svg") return true;
  if (normalizedLanguage !== "xml" && normalizedLanguage !== "html") return false;
  return text.trimStart().startsWith("<svg");
}

export function svgCodePreviewDataUrl(text: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text.trim())}`;
}

export type MermaidDirection = "BT" | "LR" | "RL" | "TB" | "TD";
export type MermaidNodeShape = "circle" | "diamond" | "rect";

export interface MermaidPreviewNode {
  id: string;
  label: string;
  shape: MermaidNodeShape;
  x: number;
  y: number;
}

export interface MermaidPreviewEdge {
  from: string;
  to: string;
  label: string | null;
}

export interface MermaidPreviewModel {
  direction: MermaidDirection;
  edges: MermaidPreviewEdge[];
  height: number;
  nodes: MermaidPreviewNode[];
  width: number;
}

const MERMAID_NODE_WIDTH = 144;
const MERMAID_NODE_HEIGHT = 48;
const MERMAID_MARGIN = 20;
const MERMAID_LEVEL_GAP = 68;
const MERMAID_SIBLING_GAP = 36;
const MERMAID_MAX_NODES = 24;
const MERMAID_MAX_EDGES = 32;
const MERMAID_NODE_ID_RE = /[A-Za-z0-9_][\w.-]*/y;

const MERMAID_KIND_ALIASES = new Map<string, string>([
  ["classdiagram", "class"],
  ["erdiagram", "entityRelationship"],
  ["entityrelationshipdiagram", "entityRelationship"],
  ["flowchart", "flowchart"],
  ["gantt", "gantt"],
  ["gitgraph", "gitgraph"],
  ["gitgraphbeta", "gitgraph"],
  ["graph", "flowchart"],
  ["journey", "journey"],
  ["kanban", "kanban"],
  ["mindmap", "mindmap"],
  ["packet", "packet"],
  ["pie", "pie"],
  ["quadrantchart", "quadrant"],
  ["requirementdiagram", "requirement"],
  ["sankey", "sankey"],
  ["sankeybeta", "sankey"],
  ["sequencediagram", "sequence"],
  ["statediagram", "state"],
  ["timeline", "timeline"],
  ["userjourney", "journey"],
  ["xychart", "xychart"],
]);

export function mermaidDiagramKind(text: string): string | null {
  const firstLine = mermaidContentLines(text)[0];
  if (!firstLine) return null;
  const firstWord = firstLine.split(/\s+/)[0]?.replace(/[-_]/g, "").toLowerCase();
  if (!firstWord) return null;
  return MERMAID_KIND_ALIASES.get(firstWord) ?? null;
}

export function shouldRenderMermaidPreview(language: string, text: string): boolean {
  return mermaidFlowchartPreviewModel(language, text) !== null;
}

export function mermaidFlowchartPreviewModel(language: string, text: string): MermaidPreviewModel | null {
  if (language.trim().toLowerCase() !== "mermaid") return null;
  const lines = mermaidContentLines(text);
  const header = lines.shift();
  const headerMatch = header?.match(/^(?:graph|flowchart)(?:\s+([A-Za-z]{2}))?\b/i);
  if (!headerMatch) return null;
  const direction = normalizeMermaidDirection(headerMatch[1]);
  const nodes = new Map<string, Omit<MermaidPreviewNode, "x" | "y">>();
  const edges: MermaidPreviewEdge[] = [];

  for (const statement of mermaidStatements(lines)) {
    if (nodes.size >= MERMAID_MAX_NODES && edges.length >= MERMAID_MAX_EDGES) break;
    const edge = parseMermaidEdgeStatement(statement);
    if (edge) {
      if (nodes.size < MERMAID_MAX_NODES) upsertMermaidNode(nodes, edge.from);
      if (nodes.size < MERMAID_MAX_NODES) upsertMermaidNode(nodes, edge.to);
      if (edges.length < MERMAID_MAX_EDGES) edges.push({
        from: edge.from.id,
        to: edge.to.id,
        label: edge.label,
      });
      continue;
    }
    const node = parseMermaidNode(statement, 0);
    if (node && node.nextIndex >= statement.length && nodes.size < MERMAID_MAX_NODES) {
      upsertMermaidNode(nodes, node);
    }
  }

  if (nodes.size === 0) return null;
  return layoutMermaidPreview(direction, nodes, edges.filter((edge) => nodes.has(edge.from) && nodes.has(edge.to)));
}

function mermaidContentLines(text: string): string[] {
  return text
    .replace(MERMAID_DIRECTIVE_RE, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("%%"));
}

function normalizeMermaidDirection(direction: string | undefined): MermaidDirection {
  const normalized = direction?.toUpperCase();
  if (normalized === "BT" || normalized === "LR" || normalized === "RL" || normalized === "TB") return normalized;
  return "TD";
}

function mermaidStatements(lines: string[]): string[] {
  return lines.flatMap((line) => line.split(";")).map((statement) => statement.trim()).filter(Boolean);
}

interface ParsedMermaidNode {
  id: string;
  label: string;
  nextIndex: number;
  shape: MermaidNodeShape;
}

interface ParsedMermaidEdge {
  from: ParsedMermaidNode;
  label: string | null;
  to: ParsedMermaidNode;
}

function parseMermaidEdgeStatement(statement: string): ParsedMermaidEdge | null {
  const from = parseMermaidNode(statement, 0);
  if (!from) return null;
  const arrow = parseMermaidArrow(statement, from.nextIndex);
  if (!arrow) return null;
  const to = parseMermaidNode(statement, arrow.nextIndex);
  if (!to) return null;
  return { from, label: arrow.label, to };
}

function parseMermaidNode(statement: string, startIndex: number): ParsedMermaidNode | null {
  let index = skipMermaidWhitespace(statement, startIndex);
  MERMAID_NODE_ID_RE.lastIndex = index;
  const idMatch = MERMAID_NODE_ID_RE.exec(statement);
  if (!idMatch) return null;
  const id = idMatch[0];
  index = idMatch.index + id.length;
  const label = parseMermaidNodeLabel(statement, index);
  if (label) {
    index = label.nextIndex;
  }
  index = skipMermaidWhitespace(statement, index);
  return {
    id,
    label: label?.text ?? id,
    nextIndex: index,
    shape: label?.shape ?? "rect",
  };
}

function parseMermaidNodeLabel(statement: string, startIndex: number): { nextIndex: number; shape: MermaidNodeShape; text: string } | null {
  const index = skipMermaidWhitespace(statement, startIndex);
  const char = statement[index];
  if (char === "[") {
    const closeIndex = statement.indexOf("]", index + 1);
    if (closeIndex < 0) return null;
    return {
      nextIndex: closeIndex + 1,
      shape: "rect",
      text: cleanMermaidLabel(statement.slice(index + 1, closeIndex)),
    };
  }
  if (char === "(") {
    const closeIndex = statement.indexOf(")", index + 1);
    if (closeIndex < 0) return null;
    const isDouble = statement[index + 1] === "(" && statement[closeIndex + 1] === ")";
    return {
      nextIndex: closeIndex + (isDouble ? 2 : 1),
      shape: isDouble ? "circle" : "rect",
      text: cleanMermaidLabel(statement.slice(index + (isDouble ? 2 : 1), closeIndex)),
    };
  }
  if (char === "{") {
    const closeIndex = statement.indexOf("}", index + 1);
    if (closeIndex < 0) return null;
    return {
      nextIndex: closeIndex + 1,
      shape: "diamond",
      text: cleanMermaidLabel(statement.slice(index + 1, closeIndex)),
    };
  }
  if (char === "\"") {
    const closeIndex = statement.indexOf("\"", index + 1);
    if (closeIndex < 0) return null;
    return {
      nextIndex: closeIndex + 1,
      shape: "rect",
      text: cleanMermaidLabel(statement.slice(index + 1, closeIndex)),
    };
  }
  return null;
}

function parseMermaidArrow(statement: string, startIndex: number): { label: string | null; nextIndex: number } | null {
  const restStart = skipMermaidWhitespace(statement, startIndex);
  const rest = statement.slice(restStart);
  const pipeLabel = rest.match(/^(?:-->|---|==>|===|-.->|-.-|--o|--x)\s*\|([^|]+)\|\s*/);
  if (pipeLabel) {
    return {
      label: cleanMermaidLabel(pipeLabel[1] ?? ""),
      nextIndex: restStart + pipeLabel[0].length,
    };
  }
  const inlineLabel = rest.match(/^(?:--|==|-\.)\s+(.+?)\s+(?:-->|---|==>|===|-.->|-.-)\s*/);
  if (inlineLabel) {
    return {
      label: cleanMermaidLabel(inlineLabel[1] ?? ""),
      nextIndex: restStart + inlineLabel[0].length,
    };
  }
  const plainArrow = rest.match(/^(?:-->|---|==>|===|-.->|-.-|--o|--x)\s*/);
  if (!plainArrow) return null;
  return {
    label: null,
    nextIndex: restStart + plainArrow[0].length,
  };
}

function skipMermaidWhitespace(text: string, index: number): number {
  let next = index;
  while (next < text.length && /\s/.test(text[next] ?? "")) next += 1;
  return next;
}

function cleanMermaidLabel(label: string): string {
  return label.replace(/^["']|["']$/g, "").replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim();
}

function upsertMermaidNode(nodes: Map<string, Omit<MermaidPreviewNode, "x" | "y">>, node: ParsedMermaidNode): void {
  const existing = nodes.get(node.id);
  if (existing && existing.label !== existing.id) return;
  nodes.set(node.id, {
    id: node.id,
    label: node.label || node.id,
    shape: node.shape,
  });
}

function layoutMermaidPreview(
  direction: MermaidDirection,
  nodeMap: Map<string, Omit<MermaidPreviewNode, "x" | "y">>,
  edges: MermaidPreviewEdge[],
): MermaidPreviewModel {
  const horizontal = direction === "LR" || direction === "RL";
  const levelById = mermaidLevels(nodeMap, edges, direction);
  const nodesByLevel = new Map<number, Array<Omit<MermaidPreviewNode, "x" | "y">>>();
  for (const node of nodeMap.values()) {
    const level = levelById.get(node.id) ?? 0;
    const levelNodes = nodesByLevel.get(level) ?? [];
    levelNodes.push(node);
    nodesByLevel.set(level, levelNodes);
  }
  const sortedLevels = [...nodesByLevel.keys()].sort((left, right) => left - right);
  const maxSiblings = Math.max(1, ...[...nodesByLevel.values()].map((nodes) => nodes.length));
  const levelCount = Math.max(1, sortedLevels.length);
  const width = horizontal
    ? MERMAID_MARGIN * 2 + levelCount * MERMAID_NODE_WIDTH + (levelCount - 1) * MERMAID_LEVEL_GAP
    : MERMAID_MARGIN * 2 + maxSiblings * MERMAID_NODE_WIDTH + (maxSiblings - 1) * MERMAID_SIBLING_GAP;
  const height = horizontal
    ? MERMAID_MARGIN * 2 + maxSiblings * MERMAID_NODE_HEIGHT + (maxSiblings - 1) * MERMAID_SIBLING_GAP
    : MERMAID_MARGIN * 2 + levelCount * MERMAID_NODE_HEIGHT + (levelCount - 1) * MERMAID_LEVEL_GAP;
  const nodes: MermaidPreviewNode[] = [];

  for (const [levelIndex, level] of sortedLevels.entries()) {
    const levelNodes = nodesByLevel.get(level) ?? [];
    const mainSize = horizontal ? MERMAID_NODE_WIDTH : MERMAID_NODE_HEIGHT;
    const crossSize = horizontal ? MERMAID_NODE_HEIGHT : MERMAID_NODE_WIDTH;
    const rowSpan = levelNodes.length * crossSize + Math.max(0, levelNodes.length - 1) * MERMAID_SIBLING_GAP;
    const siblingStart = Math.max(MERMAID_MARGIN, (horizontal ? height : width) / 2 - rowSpan / 2);
    for (const [siblingIndex, node] of levelNodes.entries()) {
      const main = MERMAID_MARGIN + levelIndex * (mainSize + MERMAID_LEVEL_GAP);
      const cross = siblingStart + siblingIndex * (crossSize + MERMAID_SIBLING_GAP);
      nodes.push({
        ...node,
        x: horizontal ? main : cross,
        y: horizontal ? cross : main,
      });
    }
  }

  return {
    direction,
    edges,
    height,
    nodes,
    width,
  };
}

function mermaidLevels(
  nodes: Map<string, Omit<MermaidPreviewNode, "x" | "y">>,
  edges: MermaidPreviewEdge[],
  direction: MermaidDirection,
): Map<string, number> {
  const levels = new Map<string, number>([...nodes.keys()].map((id) => [id, 0]));
  for (let pass = 0; pass < nodes.size; pass += 1) {
    let changed = false;
    for (const edge of edges) {
      const fromLevel = levels.get(edge.from) ?? 0;
      const toLevel = levels.get(edge.to) ?? 0;
      if (toLevel <= fromLevel && fromLevel < nodes.size) {
        levels.set(edge.to, fromLevel + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }
  if (direction !== "RL" && direction !== "BT") return levels;
  const maxLevel = Math.max(0, ...levels.values());
  return new Map([...levels].map(([id, level]) => [id, maxLevel - level]));
}

function MermaidFlowchartPreview({ model }: { model: MermaidPreviewModel }) {
  const nodeById = new Map(model.nodes.map((node) => [node.id, node]));
  return (
    <div className="hc-mermaid-preview" data-mermaid-kind="flowchart">
      <svg aria-label="Mermaid flowchart preview" role="img" viewBox={`0 0 ${model.width} ${model.height}`}>
        <defs>
          <marker id="hc-mermaid-arrow" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
            <path d="M 0 0 L 8 4 L 0 8 z" />
          </marker>
        </defs>
        <g className="hc-mermaid-edges">
          {model.edges.map((edge, index) => {
            const from = nodeById.get(edge.from);
            const to = nodeById.get(edge.to);
            if (!from || !to) return null;
            const path = mermaidEdgePath(model.direction, from, to);
            const labelPosition = mermaidEdgeLabelPosition(model.direction, from, to);
            return (
              <g key={`${edge.from}-${edge.to}-${index}`}>
                <path d={path} markerEnd="url(#hc-mermaid-arrow)" />
                {edge.label && (
                  <text className="hc-mermaid-edge-label" x={labelPosition.x} y={labelPosition.y}>
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
        <g className="hc-mermaid-nodes">
          {model.nodes.map((node) => (
            <g key={node.id}>
              {renderMermaidNodeShape(node)}
              <text x={node.x + MERMAID_NODE_WIDTH / 2} y={node.y + MERMAID_NODE_HEIGHT / 2}>
                {mermaidLabelLines(node.label).map((line, index, lines) => (
                  <tspan dy={index === 0 ? `${(1 - lines.length) * 0.6}em` : "1.2em"} key={index} x={node.x + MERMAID_NODE_WIDTH / 2}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

function renderMermaidNodeShape(node: MermaidPreviewNode): ReactNode {
  if (node.shape === "diamond") {
    const cx = node.x + MERMAID_NODE_WIDTH / 2;
    const cy = node.y + MERMAID_NODE_HEIGHT / 2;
    return (
      <polygon points={`${cx},${node.y} ${node.x + MERMAID_NODE_WIDTH},${cy} ${cx},${node.y + MERMAID_NODE_HEIGHT} ${node.x},${cy}`} />
    );
  }
  if (node.shape === "circle") {
    return (
      <ellipse cx={node.x + MERMAID_NODE_WIDTH / 2} cy={node.y + MERMAID_NODE_HEIGHT / 2} rx={MERMAID_NODE_WIDTH / 2} ry={MERMAID_NODE_HEIGHT / 2} />
    );
  }
  return <rect height={MERMAID_NODE_HEIGHT} rx="8" width={MERMAID_NODE_WIDTH} x={node.x} y={node.y} />;
}

function mermaidEdgePath(direction: MermaidDirection, from: MermaidPreviewNode, to: MermaidPreviewNode): string {
  const horizontal = direction === "LR" || direction === "RL";
  const start = horizontal
    ? { x: from.x + MERMAID_NODE_WIDTH, y: from.y + MERMAID_NODE_HEIGHT / 2 }
    : { x: from.x + MERMAID_NODE_WIDTH / 2, y: from.y + MERMAID_NODE_HEIGHT };
  const end = horizontal
    ? { x: to.x, y: to.y + MERMAID_NODE_HEIGHT / 2 }
    : { x: to.x + MERMAID_NODE_WIDTH / 2, y: to.y };
  const control = horizontal
    ? { x: (start.x + end.x) / 2, y1: start.y, y2: end.y }
    : { x1: start.x, x2: end.x, y: (start.y + end.y) / 2 };
  return horizontal
    ? `M ${start.x} ${start.y} C ${control.x} ${control.y1}, ${control.x} ${control.y2}, ${end.x} ${end.y}`
    : `M ${start.x} ${start.y} C ${control.x1} ${control.y}, ${control.x2} ${control.y}, ${end.x} ${end.y}`;
}

function mermaidEdgeLabelPosition(direction: MermaidDirection, from: MermaidPreviewNode, to: MermaidPreviewNode): { x: number; y: number } {
  if (direction === "LR" || direction === "RL") {
    return {
      x: (from.x + MERMAID_NODE_WIDTH + to.x) / 2,
      y: (from.y + to.y) / 2 + MERMAID_NODE_HEIGHT / 2 - 6,
    };
  }
  return {
    x: (from.x + to.x) / 2 + MERMAID_NODE_WIDTH / 2 + 8,
    y: (from.y + MERMAID_NODE_HEIGHT + to.y) / 2,
  };
}

function mermaidLabelLines(label: string): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > 16 && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
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

export interface CodeHighlightSegment {
  className?: string;
  style?: CSSProperties;
  text: string;
}

const SHIKI_THEME = "github-light";
const SHIKI_LANGUAGE_ALIASES = new Map<string, string>([
  ["c++", "cpp"],
  ["cxx", "cpp"],
  ["h++", "cpp"],
  ["hpp", "cpp"],
  ["cc", "cpp"],
  ["c#", "csharp"],
  ["cs", "csharp"],
  ["f#", "fsharp"],
  ["fs", "fsharp"],
  ["objectivec", "objc"],
  ["objective-c", "objc"],
  ["obj-c", "objc"],
  ["shell", "bash"],
  ["sh", "bash"],
  ["zsh", "bash"],
  ["ps", "powershell"],
  ["ps1", "powershell"],
  ["dockerfile", "docker"],
  ["docker-compose", "yaml"],
  ["compose", "yaml"],
  ["postgres", "sql"],
  ["postgresql", "sql"],
  ["pgsql", "sql"],
  ["mysql", "sql"],
  ["sqlite", "sql"],
  ["rb", "ruby"],
  ["kt", "kotlin"],
  ["kts", "kotlin"],
  ["rs", "rust"],
  ["golang", "go"],
  ["py", "python"],
  ["js", "javascript"],
  ["jsx", "jsx"],
  ["mjs", "javascript"],
  ["cjs", "javascript"],
  ["ts", "typescript"],
  ["tsx", "tsx"],
  ["mts", "typescript"],
  ["cts", "typescript"],
  ["md", "markdown"],
  ["mdx", "mdx"],
  ["yml", "yaml"],
]);

type ShikiModule = {
  bundledLanguages?: Record<string, unknown>;
  bundledLanguagesAlias?: Record<string, unknown>;
  createHighlighter: (options: { langs: string[]; themes: string[] }) => Promise<ShikiHighlighter>;
};

type ShikiHighlighter = {
  codeToTokens: (code: string, options: { includeExplanation?: boolean; lang: string; theme: string }) => { tokens: ShikiToken[][] };
  loadLanguage: (language: string) => Promise<void>;
};

type ShikiToken = {
  color?: string;
  content: string;
  explanation?: Array<{
    scopes?: Array<{
      scopeName?: string;
    }>;
  }>;
  fontStyle?: number;
};

type ShikiImporter = () => Promise<ShikiModule>;

let shikiImporter: ShikiImporter = importShikiModule;
let shikiModulePromise: Promise<ShikiModule> | null = null;
let shikiHighlighterPromise: Promise<ShikiHighlighter> | null = null;
const loadedShikiLanguages = new Set<string>();

async function importShikiModule(): Promise<ShikiModule> {
  return import("shiki") as unknown as Promise<ShikiModule>;
}

export function setShikiImporterForTests(importer: ShikiImporter): () => void {
  const previous = shikiImporter;
  shikiImporter = importer;
  resetShikiCache();
  return () => {
    shikiImporter = previous;
    resetShikiCache();
  };
}

function resetShikiCache(): void {
  shikiModulePromise = null;
  shikiHighlighterPromise = null;
  loadedShikiLanguages.clear();
}

async function getShikiModule(): Promise<ShikiModule> {
  shikiModulePromise ??= shikiImporter();
  return shikiModulePromise;
}

async function getShikiHighlighter(module: ShikiModule): Promise<ShikiHighlighter> {
  shikiHighlighterPromise ??= module.createHighlighter({
    langs: [],
    themes: [SHIKI_THEME],
  });
  return shikiHighlighterPromise;
}

export async function highlightCodeSegmentsWithShiki(language: string, text: string): Promise<CodeHighlightSegment[] | null> {
  const fallback = () => highlightCodeSegments(language, text);
  const normalizedLanguage = normalizeShikiLanguage(language);
  if (!normalizedLanguage || text.length === 0) return fallback();
  try {
    const shikiModule = await getShikiModule();
    if (!isBundledShikiLanguage(shikiModule, normalizedLanguage)) return fallback();
    const highlighter = await getShikiHighlighter(shikiModule);
    if (!loadedShikiLanguages.has(normalizedLanguage)) {
      await highlighter.loadLanguage(normalizedLanguage);
      loadedShikiLanguages.add(normalizedLanguage);
    }
    const result = highlighter.codeToTokens(text, {
      includeExplanation: true,
      lang: normalizedLanguage,
      theme: SHIKI_THEME,
    });
    const segments = shikiTokensToHighlightSegments(result.tokens);
    return segments.some((segment) => Boolean(segment.className || segment.style)) ? segments : fallback();
  } catch {
    resetShikiCache();
    return fallback();
  }
}

function shikiTokensToHighlightSegments(lines: ShikiToken[][]): CodeHighlightSegment[] {
  const segments: CodeHighlightSegment[] = [];
  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) pushHighlightSegment(segments, "\n");
    line.forEach((token) => {
      pushHighlightSegment(segments, token.content, shikiTokenClassName(token), shikiTokenStyle(token));
    });
  });
  return segments;
}

function shikiTokenClassName(token: ShikiToken): string | undefined {
  const scopes = shikiTokenScopes(token);
  for (let index = scopes.length - 1; index >= 0; index -= 1) {
    const scope = scopes[index]?.toLowerCase() ?? "";
    const className = shikiScopeClassName(scope);
    if (className) return className;
  }
  return undefined;
}

function shikiScopeClassName(scope: string): string | undefined {
  if (!scope || scope.startsWith("source.")) return undefined;
  if (scope.includes("comment")) return "hljs-comment";
  if (scope.includes("markup.heading") || scope.includes("entity.name.section")) return "hljs-section";
  if (scope.includes("markup.inline.raw") || scope.includes("markup.raw") || scope.includes("markup.fenced_code")) return "hljs-code";
  if (scope.includes("markup.underline.link") || scope.includes("markup.link")) return "hljs-link";
  if (scope.includes("markup.italic") || scope.includes("markup.bold")) return "hljs-emphasis";
  if (scope.includes("constant.numeric")) return "hljs-number";
  if (scope.includes("string") || scope.includes("regexp")) return "hljs-string";
  if (scope.includes("constant.language") || scope.includes("constant.other")) return "hljs-literal";
  if (scope.includes("support.function")) return "hljs-built_in";
  if (scope.includes("entity.name.function")) return "hljs-title function_";
  if (scope.includes("keyword.operator")) return "hljs-operator";
  if (scope.includes("keyword") || scope.includes("storage")) return "hljs-keyword";
  if (scope.includes("entity.other.attribute-name")) return "hljs-attr";
  if (scope.includes("entity.name.tag")) return "hljs-name";
  if (scope.includes("punctuation.definition.tag") || scope.includes("meta.tag")) return "hljs-tag";
  if (scope.includes("variable.other.property") || scope.includes("support.variable.property")) return "hljs-property";
  if (scope.includes("support.class") || scope.includes("support.type") || scope.includes("entity.name.class") || scope.includes("entity.name.type")) return "hljs-built_in";
  if (scope.includes("variable")) return "hljs-variable";
  if (scope.startsWith("meta.")) return "hljs-meta";
  return undefined;
}

function shikiTokenScopes(token: ShikiToken): string[] {
  const scopes: string[] = [];
  for (const explanation of token.explanation ?? []) {
    for (const scope of explanation.scopes ?? []) {
      if (scope.scopeName) scopes.push(scope.scopeName);
    }
  }
  return scopes;
}

function shikiTokenStyle(token: ShikiToken): CSSProperties | undefined {
  if (!token.color && !token.fontStyle) return undefined;
  const style: CSSProperties = {};
  if (token.color) style.color = token.color;
  if (token.fontStyle) {
    if ((token.fontStyle & 1) === 1) style.fontStyle = "italic";
    if ((token.fontStyle & 2) === 2) style.fontWeight = 600;
    if ((token.fontStyle & 4) === 4) style.textDecoration = "underline";
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

function normalizeShikiLanguage(language: string): string | null {
  const normalized = language.trim().toLowerCase().replace(/^language-/, "");
  if (isPlainTextLanguage(normalized)) return null;
  return SHIKI_LANGUAGE_ALIASES.get(normalized) ?? normalized;
}

function isBundledShikiLanguage(module: ShikiModule, language: string): boolean {
  return Object.hasOwn(module.bundledLanguages ?? {}, language)
    || Object.hasOwn(module.bundledLanguagesAlias ?? {}, language);
}

function isPlainTextLanguage(language: string): boolean {
  return !language || ["plain", "plaintext", "text", "txt"].includes(language);
}

function codeHighlightKey(language: string, text: string): string {
  return `${language}\u0000${text}`;
}

export function highlightCodeSegments(language: string, text: string): CodeHighlightSegment[] | null {
  const normalizedLanguage = normalizeHighlightLanguage(language);
  if (!normalizedLanguage || text.length === 0) return null;
  if (normalizedLanguage === "json") return highlightJsonCode(text);
  if (normalizedLanguage === "xml") return highlightXmlCode(text);
  if (normalizedLanguage === "yaml") return highlightYamlCode(text);
  if (normalizedLanguage === "markdown") return highlightMarkdownCode(text);
  if (normalizedLanguage === "css") return highlightCssCode(text);
  if (normalizedLanguage === "sql") return highlightSqlCode(text);
  if (normalizedLanguage === "bash") {
    return highlightGenericCode(text, {
      hashComments: true,
      slashComments: false,
      dashComments: false,
      keywords: BASH_KEYWORDS,
      builtIns: BASH_BUILT_INS,
      literals: new Set(),
      variables: true,
    });
  }
  if (normalizedLanguage === "python") {
    return highlightGenericCode(text, {
      hashComments: true,
      slashComments: false,
      dashComments: false,
      keywords: PYTHON_KEYWORDS,
      builtIns: PYTHON_BUILT_INS,
      literals: PYTHON_LITERALS,
      variables: false,
    });
  }
  if (normalizedLanguage === "rust") {
    return highlightGenericCode(text, {
      hashComments: false,
      slashComments: true,
      dashComments: false,
      keywords: RUST_KEYWORDS,
      builtIns: RUST_BUILT_INS,
      literals: RUST_LITERALS,
      variables: false,
    });
  }
  if (normalizedLanguage === "go") {
    return highlightGenericCode(text, {
      hashComments: false,
      slashComments: true,
      dashComments: false,
      keywords: GO_KEYWORDS,
      builtIns: GO_BUILT_INS,
      literals: GO_LITERALS,
      variables: false,
    });
  }
  if (normalizedLanguage === "java") {
    return highlightGenericCode(text, {
      hashComments: false,
      slashComments: true,
      dashComments: false,
      keywords: JAVA_KEYWORDS,
      builtIns: JAVA_BUILT_INS,
      literals: JAVA_LITERALS,
      variables: false,
    });
  }
  if (normalizedLanguage === "javascript") {
    return highlightGenericCode(text, {
      hashComments: false,
      slashComments: true,
      dashComments: false,
      keywords: JS_TS_KEYWORDS,
      builtIns: JS_TS_BUILT_INS,
      literals: JS_TS_LITERALS,
      variables: false,
    });
  }
  return null;
}

function highlightJsonCode(text: string): CodeHighlightSegment[] {
  const segments: CodeHighlightSegment[] = [];
  let index = 0;
  while (index < text.length) {
    const whitespace = matchPatternAt(/\s+/y, text, index);
    if (whitespace) {
      pushHighlightSegment(segments, whitespace);
      index += whitespace.length;
      continue;
    }
    const lineComment = matchPatternAt(DOUBLE_SLASH_COMMENT_RE, text, index);
    if (lineComment) {
      pushHighlightSegment(segments, lineComment, "hljs-comment");
      index += lineComment.length;
      continue;
    }
    const string = matchPatternAt(/"(?:\\.|[^"\\])*"/y, text, index);
    if (string) {
      const nextIndex = nextNonWhitespaceIndex(text, index + string.length);
      pushHighlightSegment(segments, string, nextIndex >= 0 && text[nextIndex] === ":" ? "hljs-attr" : "hljs-string");
      index += string.length;
      continue;
    }
    const number = matchPatternAt(NUMBER_RE, text, index);
    if (number) {
      pushHighlightSegment(segments, number, "hljs-number");
      index += number.length;
      continue;
    }
    const literal = matchPatternAt(/\b(?:true|false|null)\b/y, text, index);
    if (literal) {
      pushHighlightSegment(segments, literal, "hljs-literal");
      index += literal.length;
      continue;
    }
    pushHighlightSegment(segments, text[index] ?? "", /^[{}[\],:]/u.test(text[index] ?? "") ? "hljs-operator" : undefined);
    index += 1;
  }
  return segments;
}

function highlightXmlCode(text: string): CodeHighlightSegment[] {
  const segments: CodeHighlightSegment[] = [];
  let index = 0;
  while (index < text.length) {
    if (text.startsWith("<!--", index)) {
      const end = text.indexOf("-->", index + 4);
      const comment = text.slice(index, end < 0 ? text.length : end + 3);
      pushHighlightSegment(segments, comment, "hljs-comment");
      index += comment.length;
      continue;
    }
    if (text[index] === "<") {
      const end = text.indexOf(">", index + 1);
      const tag = text.slice(index, end < 0 ? text.length : end + 1);
      highlightXmlTag(tag).forEach((segment) => pushHighlightSegment(segments, segment.text, segment.className));
      index += tag.length;
      continue;
    }
    const nextTag = text.indexOf("<", index);
    const plain = text.slice(index, nextTag < 0 ? text.length : nextTag);
    pushHighlightSegment(segments, plain);
    index += plain.length;
  }
  return segments;
}

function highlightXmlTag(tag: string): CodeHighlightSegment[] {
  const segments: CodeHighlightSegment[] = [];
  const open = /^<\/?/.exec(tag)?.[0] ?? "<";
  pushHighlightSegment(segments, open, "hljs-tag");
  let index = open.length;
  const tagName = matchPatternAt(/[A-Za-z][\w:.-]*/y, tag, index);
  if (tagName) {
    pushHighlightSegment(segments, tagName, "hljs-name");
    index += tagName.length;
  }
  while (index < tag.length) {
    const close = matchPatternAt(/\/?>/y, tag, index);
    if (close) {
      pushHighlightSegment(segments, close, "hljs-tag");
      index += close.length;
      continue;
    }
    const whitespace = matchPatternAt(/\s+/y, tag, index);
    if (whitespace) {
      pushHighlightSegment(segments, whitespace);
      index += whitespace.length;
      continue;
    }
    const attr = matchPatternAt(/[A-Za-z_:][\w:.-]*/y, tag, index);
    if (attr) {
      pushHighlightSegment(segments, attr, "hljs-attr");
      index += attr.length;
      continue;
    }
    const string = matchPatternAt(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/y, tag, index);
    if (string) {
      pushHighlightSegment(segments, string, "hljs-string");
      index += string.length;
      continue;
    }
    pushHighlightSegment(segments, tag[index] ?? "", tag[index] === "=" ? "hljs-operator" : undefined);
    index += 1;
  }
  return segments;
}

function matchPatternAt(pattern: RegExp, text: string, index: number): string | null {
  pattern.lastIndex = index;
  const match = pattern.exec(text);
  return match && match.index === index ? match[0] ?? null : null;
}

function pushHighlightSegment(segments: CodeHighlightSegment[], text: string, className?: string, style?: CSSProperties): void {
  if (!text) return;
  const previous = segments[segments.length - 1];
  if (previous && previous.className === className && highlightStyleKey(previous.style) === highlightStyleKey(style)) {
    previous.text += text;
    return;
  }
  segments.push({
    text,
    ...(className ? { className } : {}),
    ...(style ? { style } : {}),
  });
}

function highlightStyleKey(style: CSSProperties | undefined): string {
  if (!style) return "";
  return `${style.color ?? ""}|${style.fontStyle ?? ""}|${style.fontWeight ?? ""}|${style.textDecoration ?? ""}`;
}

function nextNonWhitespaceIndex(text: string, index: number): number {
  for (let cursor = index; cursor < text.length; cursor += 1) {
    if (!/\s/u.test(text[cursor] ?? "")) return cursor;
  }
  return -1;
}

function previousNonWhitespaceIndex(text: string, index: number): number {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (!/\s/u.test(text[cursor] ?? "")) return cursor;
  }
  return -1;
}

function selectedTextWithin(container: Element | null, selection: Selection | null): string {
  if (!container || !selection || selection.isCollapsed) return "";
  const anchorInside = selection.anchorNode ? container.contains(selection.anchorNode) : false;
  const focusInside = selection.focusNode ? container.contains(selection.focusNode) : false;
  return anchorInside || focusInside ? selection.toString() : "";
}

function CopyFeedbackToast() {
  return (
    <div className="hc-copy-toast" role="status" aria-live="polite">
      <span className="hc-copy-toast-icon" aria-hidden="true"><Check size={15} /></span>
      <span>Copied to clipboard</span>
    </div>
  );
}
function normalizeHighlightLanguage(language: string): "bash" | "css" | "go" | "java" | "javascript" | "json" | "markdown" | "python" | "rust" | "sql" | "xml" | "yaml" | null {
  const normalized = language.trim().toLowerCase();
  if (!normalized || normalized === "text" || normalized === "plaintext") return null;
  if (["js", "jsx", "mjs", "cjs", "javascript", "ts", "tsx", "mts", "cts", "typescript"].includes(normalized)) return "javascript";
  if (["json", "jsonc"].includes(normalized)) return "json";
  if (["sh", "shell", "bash", "zsh"].includes(normalized)) return "bash";
  if (["py", "python"].includes(normalized)) return "python";
  if (["html", "xml", "xhtml"].includes(normalized)) return "xml";
  if (["rs", "rust"].includes(normalized)) return "rust";
  if (["go", "golang"].includes(normalized)) return "go";
  if (["java"].includes(normalized)) return "java";
  if (["sql", "pgsql", "postgres", "postgresql", "mysql", "sqlite"].includes(normalized)) return "sql";
  if (["yaml", "yml"].includes(normalized)) return "yaml";
  if (["css", "scss", "sass", "less"].includes(normalized)) return "css";
  if (["md", "markdown", "mdx"].includes(normalized)) return "markdown";
  return null;
}

interface GenericHighlightConfig {
  hashComments: boolean;
  slashComments: boolean;
  dashComments: boolean;
  keywords: Set<string>;
  builtIns: Set<string>;
  literals: Set<string>;
  variables: boolean;
}

const JS_TS_KEYWORDS = new Set([
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "declare",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "of",
  "private",
  "protected",
  "public",
  "readonly",
  "return",
  "satisfies",
  "static",
  "switch",
  "throw",
  "try",
  "type",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

const JS_TS_LITERALS = new Set(["false", "Infinity", "NaN", "null", "true", "undefined"]);
const JS_TS_BUILT_INS = new Set([
  "Array",
  "Boolean",
  "Date",
  "Error",
  "JSON",
  "Map",
  "Math",
  "Number",
  "Object",
  "Promise",
  "Reflect",
  "RegExp",
  "Set",
  "String",
  "Symbol",
  "console",
  "document",
  "global",
  "process",
  "require",
  "window",
]);

const BASH_KEYWORDS = new Set([
  "case",
  "do",
  "done",
  "elif",
  "else",
  "esac",
  "fi",
  "for",
  "function",
  "if",
  "in",
  "select",
  "then",
  "until",
  "while",
]);

const BASH_BUILT_INS = new Set([
  "cd",
  "echo",
  "export",
  "local",
  "printf",
  "pwd",
  "read",
  "return",
  "set",
  "shift",
  "source",
  "test",
]);

const PYTHON_KEYWORDS = new Set([
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield",
]);

const PYTHON_LITERALS = new Set(["False", "None", "True"]);
const PYTHON_BUILT_INS = new Set(["dict", "enumerate", "int", "len", "list", "print", "range", "set", "str", "tuple"]);

const RUST_KEYWORDS = new Set([
  "as",
  "async",
  "await",
  "break",
  "const",
  "continue",
  "crate",
  "dyn",
  "else",
  "enum",
  "extern",
  "fn",
  "for",
  "if",
  "impl",
  "in",
  "let",
  "loop",
  "match",
  "mod",
  "move",
  "mut",
  "pub",
  "ref",
  "return",
  "self",
  "Self",
  "static",
  "struct",
  "super",
  "trait",
  "type",
  "unsafe",
  "use",
  "where",
  "while",
]);

const RUST_LITERALS = new Set(["false", "None", "Some", "true"]);
const RUST_BUILT_INS = new Set(["Box", "Clone", "Debug", "Default", "Err", "Ok", "Option", "Result", "String", "Vec", "println"]);

const GO_KEYWORDS = new Set([
  "break",
  "case",
  "chan",
  "const",
  "continue",
  "default",
  "defer",
  "else",
  "fallthrough",
  "for",
  "func",
  "go",
  "goto",
  "if",
  "import",
  "interface",
  "map",
  "package",
  "range",
  "return",
  "select",
  "struct",
  "switch",
  "type",
  "var",
]);

const GO_LITERALS = new Set(["false", "iota", "nil", "true"]);
const GO_BUILT_INS = new Set(["append", "bool", "byte", "cap", "close", "copy", "delete", "error", "int", "len", "make", "new", "panic", "print", "println", "rune", "string"]);

const JAVA_KEYWORDS = new Set([
  "abstract",
  "assert",
  "boolean",
  "break",
  "byte",
  "case",
  "catch",
  "char",
  "class",
  "const",
  "continue",
  "default",
  "do",
  "double",
  "else",
  "enum",
  "extends",
  "final",
  "finally",
  "float",
  "for",
  "if",
  "implements",
  "import",
  "instanceof",
  "int",
  "interface",
  "long",
  "native",
  "new",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "short",
  "static",
  "strictfp",
  "super",
  "switch",
  "synchronized",
  "this",
  "throw",
  "throws",
  "transient",
  "try",
  "void",
  "volatile",
  "while",
]);

const JAVA_LITERALS = new Set(["false", "null", "true"]);
const JAVA_BUILT_INS = new Set(["Boolean", "Double", "Exception", "Integer", "List", "Long", "Map", "Object", "Optional", "Set", "String", "System"]);

const SQL_KEYWORDS = new Set([
  "ADD",
  "ALTER",
  "AND",
  "AS",
  "ASC",
  "BETWEEN",
  "BY",
  "CASE",
  "CREATE",
  "DELETE",
  "DESC",
  "DISTINCT",
  "DROP",
  "ELSE",
  "END",
  "EXISTS",
  "FROM",
  "GROUP",
  "HAVING",
  "IN",
  "INNER",
  "INSERT",
  "INTO",
  "IS",
  "JOIN",
  "LEFT",
  "LIKE",
  "LIMIT",
  "NOT",
  "NULL",
  "ON",
  "OR",
  "ORDER",
  "OUTER",
  "RIGHT",
  "SELECT",
  "SET",
  "TABLE",
  "THEN",
  "UPDATE",
  "VALUES",
  "WHEN",
  "WHERE",
]);

const SQL_BUILT_INS = new Set(["AVG", "COUNT", "COALESCE", "LOWER", "MAX", "MIN", "NOW", "SUM", "UPPER"]);

const CSS_AT_KEYWORDS = new Set(["charset", "container", "font-face", "import", "keyframes", "media", "supports"]);

const MARKDOWN_BLOCK_RE = /^(?:#{1,6}\s.*|[-*+]\s+.*|\d+\.\s+.*|>\s?.*|```.*|---+|\*\*\*+|___+)\s*$/;

const BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//y;
const DOUBLE_SLASH_COMMENT_RE = /\/\/[^\n]*/y;
const DASH_COMMENT_RE = /--[^\n]*/y;
const HASH_COMMENT_RE = /#[^\n]*/y;
const STRING_RE = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/y;
const NUMBER_RE = /\b(?:0[xX][\da-fA-F]+|0[bB][01]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\b/y;
const IDENTIFIER_RE = /[A-Za-z_$][\w$]*/y;
const BASH_VARIABLE_RE = /\$(?:\{[A-Za-z_][\w]*\}|[A-Za-z_][\w]*|\d+)/y;

function highlightSqlCode(text: string): CodeHighlightSegment[] {
  return highlightGenericCode(text, {
    hashComments: false,
    slashComments: false,
    dashComments: true,
    keywords: SQL_KEYWORDS,
    builtIns: SQL_BUILT_INS,
    literals: new Set(["FALSE", "NULL", "TRUE"]),
    variables: false,
  });
}

function highlightCssCode(text: string): CodeHighlightSegment[] {
  const segments: CodeHighlightSegment[] = [];
  let index = 0;
  while (index < text.length) {
    const whitespace = matchPatternAt(/\s+/y, text, index);
    if (whitespace) {
      pushHighlightSegment(segments, whitespace);
      index += whitespace.length;
      continue;
    }
    const blockComment = matchPatternAt(BLOCK_COMMENT_RE, text, index);
    if (blockComment) {
      pushHighlightSegment(segments, blockComment, "hljs-comment");
      index += blockComment.length;
      continue;
    }
    const string = matchPatternAt(STRING_RE, text, index);
    if (string) {
      pushHighlightSegment(segments, string, "hljs-string");
      index += string.length;
      continue;
    }
    const customProperty = matchPatternAt(/--[A-Za-z_][\w-]*/y, text, index);
    if (customProperty) {
      pushHighlightSegment(segments, customProperty, "hljs-variable");
      index += customProperty.length;
      continue;
    }
    const atKeyword = matchPatternAt(/@[A-Za-z_-][\w-]*/y, text, index);
    if (atKeyword) {
      const name = atKeyword.slice(1);
      pushHighlightSegment(segments, atKeyword, CSS_AT_KEYWORDS.has(name) ? "hljs-keyword" : "hljs-meta");
      index += atKeyword.length;
      continue;
    }
    const numberWithUnit = matchPatternAt(/\b(?:\d+(?:\.\d*)?|\.\d+)(?:%|[A-Za-z]+)?\b/y, text, index);
    if (numberWithUnit) {
      pushHighlightSegment(segments, numberWithUnit, "hljs-number");
      index += numberWithUnit.length;
      continue;
    }
    const hexColor = matchPatternAt(/#[\da-fA-F]{3,8}\b/y, text, index);
    if (hexColor) {
      pushHighlightSegment(segments, hexColor, "hljs-number");
      index += hexColor.length;
      continue;
    }
    const identifier = matchPatternAt(/[A-Za-z_-][\w-]*/y, text, index);
    if (identifier) {
      const nextIndex = nextNonWhitespaceIndex(text, index + identifier.length);
      const previousIndex = previousNonWhitespaceIndex(text, index);
      const className = nextIndex >= 0 && text[nextIndex] === ":"
        ? "hljs-attr"
        : previousIndex >= 0 && text[previousIndex] === "."
          ? "hljs-title"
          : undefined;
      pushHighlightSegment(segments, identifier, className);
      index += identifier.length;
      continue;
    }
    const operator = /^[{}()[\].,;:+\-*/%=<>!&|?~]+/u.exec(text.slice(index))?.[0] ?? "";
    if (operator) {
      pushHighlightSegment(segments, operator, "hljs-operator");
      index += operator.length;
      continue;
    }
    pushHighlightSegment(segments, text[index] ?? "");
    index += 1;
  }
  return segments;
}

function highlightYamlCode(text: string): CodeHighlightSegment[] {
  const segments: CodeHighlightSegment[] = [];
  const lines = text.split(/(\n)/);
  for (const part of lines) {
    if (part === "\n") {
      pushHighlightSegment(segments, part);
      continue;
    }
    highlightYamlLine(part).forEach((segment) => pushHighlightSegment(segments, segment.text, segment.className));
  }
  return segments;
}

function highlightYamlLine(line: string): CodeHighlightSegment[] {
  const segments: CodeHighlightSegment[] = [];
  const commentIndex = line.search(/(^|\s)#/u);
  const body = commentIndex >= 0 ? line.slice(0, commentIndex + (line[commentIndex] === "#" ? 0 : 1)) : line;
  const comment = commentIndex >= 0 ? line.slice(body.length) : "";
  let cursor = 0;
  const keyMatch = /^(\s*(?:-\s*)?)([A-Za-z0-9_.-]+)(\s*:)/u.exec(body);
  if (keyMatch) {
    pushHighlightSegment(segments, keyMatch[1] ?? "");
    pushHighlightSegment(segments, keyMatch[2] ?? "", "hljs-attr");
    pushHighlightSegment(segments, keyMatch[3] ?? "", "hljs-operator");
    cursor = keyMatch[0].length;
  }
  while (cursor < body.length) {
    const whitespace = matchPatternAt(/\s+/y, body, cursor);
    if (whitespace) {
      pushHighlightSegment(segments, whitespace);
      cursor += whitespace.length;
      continue;
    }
    const string = matchPatternAt(/"(?:\\.|[^"\\])*"|'(?:''|[^'])*'/y, body, cursor);
    if (string) {
      pushHighlightSegment(segments, string, "hljs-string");
      cursor += string.length;
      continue;
    }
    const literal = matchPatternAt(/\b(?:false|null|true|yes|no|on|off)\b/y, body, cursor);
    if (literal) {
      pushHighlightSegment(segments, literal, "hljs-literal");
      cursor += literal.length;
      continue;
    }
    const number = matchPatternAt(NUMBER_RE, body, cursor);
    if (number) {
      pushHighlightSegment(segments, number, "hljs-number");
      cursor += number.length;
      continue;
    }
    const operator = /^[:[\]{},&*|>!-]+/u.exec(body.slice(cursor))?.[0] ?? "";
    if (operator) {
      pushHighlightSegment(segments, operator, "hljs-operator");
      cursor += operator.length;
      continue;
    }
    pushHighlightSegment(segments, body[cursor] ?? "");
    cursor += 1;
  }
  if (comment) pushHighlightSegment(segments, comment, "hljs-comment");
  return segments;
}

function highlightMarkdownCode(text: string): CodeHighlightSegment[] {
  const segments: CodeHighlightSegment[] = [];
  const lines = text.split(/(\n)/);
  for (const part of lines) {
    if (part === "\n") {
      pushHighlightSegment(segments, part);
    } else if (MARKDOWN_BLOCK_RE.test(part)) {
      pushHighlightSegment(segments, part, "hljs-section");
    } else {
      highlightMarkdownInline(part).forEach((segment) => pushHighlightSegment(segments, segment.text, segment.className));
    }
  }
  return segments;
}

function highlightMarkdownInline(text: string): CodeHighlightSegment[] {
  const segments: CodeHighlightSegment[] = [];
  let index = 0;
  while (index < text.length) {
    const code = matchPatternAt(/`[^`]+`/y, text, index);
    if (code) {
      pushHighlightSegment(segments, code, "hljs-code");
      index += code.length;
      continue;
    }
    const link = matchPatternAt(/\[[^\]]+\]\([^)]+\)/y, text, index);
    if (link) {
      pushHighlightSegment(segments, link, "hljs-link");
      index += link.length;
      continue;
    }
    const emphasis = matchPatternAt(/(?:\*\*|__)[\s\S]+?(?:\*\*|__)|(?:\*|_)[^*_]+(?:\*|_)/y, text, index);
    if (emphasis) {
      pushHighlightSegment(segments, emphasis, "hljs-emphasis");
      index += emphasis.length;
      continue;
    }
    pushHighlightSegment(segments, text[index] ?? "");
    index += 1;
  }
  return segments;
}

function highlightGenericCode(text: string, config: GenericHighlightConfig): CodeHighlightSegment[] {
  const segments: CodeHighlightSegment[] = [];
  let index = 0;
  while (index < text.length) {
    const whitespace = matchPatternAt(/\s+/y, text, index);
    if (whitespace) {
      pushHighlightSegment(segments, whitespace);
      index += whitespace.length;
      continue;
    }

    const blockComment = matchPatternAt(BLOCK_COMMENT_RE, text, index);
    if (blockComment) {
      pushHighlightSegment(segments, blockComment, "hljs-comment");
      index += blockComment.length;
      continue;
    }

    const lineComment = (config.slashComments ? matchPatternAt(DOUBLE_SLASH_COMMENT_RE, text, index) : null)
      ?? (config.dashComments ? matchPatternAt(DASH_COMMENT_RE, text, index) : null)
      ?? (config.hashComments ? matchPatternAt(HASH_COMMENT_RE, text, index) : null);
    if (lineComment) {
      pushHighlightSegment(segments, lineComment, "hljs-comment");
      index += lineComment.length;
      continue;
    }

    const variable = config.variables ? matchPatternAt(BASH_VARIABLE_RE, text, index) : null;
    if (variable) {
      pushHighlightSegment(segments, variable, "hljs-variable");
      index += variable.length;
      continue;
    }

    const string = matchPatternAt(STRING_RE, text, index);
    if (string) {
      pushHighlightSegment(segments, string, "hljs-string");
      index += string.length;
      continue;
    }

    const number = matchPatternAt(NUMBER_RE, text, index);
    if (number) {
      pushHighlightSegment(segments, number, "hljs-number");
      index += number.length;
      continue;
    }

    const identifier = matchPatternAt(IDENTIFIER_RE, text, index);
    if (identifier) {
      pushHighlightSegment(segments, identifier, genericIdentifierClass(text, index, identifier, config));
      index += identifier.length;
      continue;
    }

    const operator = /^[{}()[\].,;:+\-*/%=<>!&|?~]+/u.exec(text.slice(index))?.[0] ?? "";
    if (operator) {
      pushHighlightSegment(segments, operator, "hljs-operator");
      index += operator.length;
      continue;
    }

    pushHighlightSegment(segments, text[index] ?? "");
    index += 1;
  }
  return segments;
}

function genericIdentifierClass(
  text: string,
  index: number,
  identifier: string,
  config: GenericHighlightConfig,
): string | undefined {
  const upperIdentifier = identifier.toUpperCase();
  if (config.keywords.has(identifier) || config.keywords.has(upperIdentifier)) return "hljs-keyword";
  if (config.literals.has(identifier) || config.literals.has(upperIdentifier)) return "hljs-literal";
  if (config.builtIns.has(identifier) || config.builtIns.has(upperIdentifier)) return "hljs-built_in";
  const nextIndex = nextNonWhitespaceIndex(text, index + identifier.length);
  const previousIndex = previousNonWhitespaceIndex(text, index);
  if (nextIndex >= 0 && text[nextIndex] === "(" && (previousIndex < 0 || text[previousIndex] !== ".")) {
    return "hljs-title function_";
  }
  if (previousIndex >= 0 && text[previousIndex] === ".") return "hljs-property";
  return undefined;
}
