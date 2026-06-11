import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import { useHiCodexIntl } from "./i18n-provider";

// codex: mermaid-diagram-*.js (wrapper) + mermaid-*.js (core
// library) - codeblocks with `lang=mermaid` are rendered by
// `mermaid.render(id, source)` via a dynamic `import("mermaid")` so the
// ~1 MB core stays out of the initial bundle. Success: insert the returned
// SVG. Failure (parse error, mermaid throws, SSR with no DOM): render the
// `fallback`, which is either Desktop's static flowchart preview model or a
// raw `<pre><code class="language-mermaid">` block so the rest of the
// message keeps rendering.
export function MermaidDiagram({ code, fallback }: { code: string; fallback: ReactNode }) {
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

export function MermaidFlowchartPreview({ model }: { model: MermaidPreviewModel }) {
  const { formatMessage } = useHiCodexIntl();
  const nodeById = new Map(model.nodes.map((node) => [node.id, node]));
  return (
    <div className="hc-mermaid-preview" data-mermaid-kind="flowchart">
      <svg aria-label={formatMessage({ id: "mermaidDiagram.ariaLabel", defaultMessage: "Mermaid diagram" })} role="img" viewBox={`0 0 ${model.width} ${model.height}`}>
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
