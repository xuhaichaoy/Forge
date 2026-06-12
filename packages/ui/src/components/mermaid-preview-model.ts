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

export const MERMAID_NODE_WIDTH = 144;
export const MERMAID_NODE_HEIGHT = 48;

const MERMAID_DIRECTIVE_RE = /%%\{[\s\S]*?\}%%/g;
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
