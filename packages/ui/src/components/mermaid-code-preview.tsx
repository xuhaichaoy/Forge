import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import { useForgeIntl } from "./i18n-provider";
import {
  MERMAID_NODE_HEIGHT,
  MERMAID_NODE_WIDTH,
  type MermaidDirection,
  type MermaidPreviewModel,
  type MermaidPreviewNode,
} from "./mermaid-preview-model";

export {
  mermaidDiagramKind,
  mermaidFlowchartPreviewModel,
  shouldRenderMermaidPreview,
  type MermaidDirection,
  type MermaidNodeShape,
  type MermaidPreviewEdge,
  type MermaidPreviewModel,
  type MermaidPreviewNode,
} from "./mermaid-preview-model";

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
    const renderId = `forge-mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
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

export function MermaidFlowchartPreview({ model }: { model: MermaidPreviewModel }) {
  const { formatMessage } = useForgeIntl();
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
