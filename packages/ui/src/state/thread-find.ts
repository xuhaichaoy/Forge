export interface ThreadFindUnit {
  unitKey: string;
  text: string;
}

export interface ThreadFindMatch {
  id: string;
  unitKey: string;
  unitIndex: number;
  matchIndex: number;
  start: number;
  end: number;
  preview: string;
}

interface SearchableTextNode {
  node: Text;
  start: number;
  end: number;
}

interface ThreadFindCssHighlightRegistry {
  delete: (name: string) => void;
  set: (name: string, highlight: unknown) => void;
}

type ThreadFindHighlightConstructor = new (...ranges: Range[]) => unknown;

interface ThreadFindSegment {
  match: ThreadFindMatch;
  start: number;
  end: number;
}

const TEXT_NODE = 3;
const SHOW_TEXT = 0x4;
const FILTER_ACCEPT = 1;
const FILTER_REJECT = 2;
const THREAD_FIND_HIGHLIGHT_NAME = "hc-thread-find-match";
const THREAD_FIND_CURRENT_HIGHLIGHT_NAME = "hc-thread-find-current";

export function normalizedThreadFindQuery(query: string): string {
  return query.trim();
}

export function findThreadFindMatches(units: ThreadFindUnit[], query: string): ThreadFindMatch[] {
  const needle = normalizedThreadFindQuery(query);
  if (!needle) return [];
  const normalizedNeedle = needle.toLocaleLowerCase();
  const matches: ThreadFindMatch[] = [];
  for (const [unitIndex, unit] of units.entries()) {
    const haystack = unit.text.toLocaleLowerCase();
    let start = haystack.indexOf(normalizedNeedle);
    let unitMatchIndex = 0;
    while (start >= 0) {
      const end = start + normalizedNeedle.length;
      matches.push({
        id: `${unit.unitKey}:${start}:${unitMatchIndex}`,
        unitKey: unit.unitKey,
        unitIndex,
        matchIndex: unitMatchIndex,
        start,
        end,
        preview: threadFindPreview(unit.text, start, end),
      });
      unitMatchIndex += 1;
      start = haystack.indexOf(normalizedNeedle, Math.max(end, start + 1));
    }
  }
  return matches;
}

export function nextThreadFindIndex(currentIndex: number, matchCount: number, direction: 1 | -1): number {
  if (matchCount <= 0) return 0;
  const normalized = Number.isFinite(currentIndex) ? currentIndex : 0;
  return (normalized + direction + matchCount) % matchCount;
}

export function clampThreadFindIndex(currentIndex: number, matchCount: number): number {
  if (matchCount <= 0) return 0;
  if (!Number.isFinite(currentIndex)) return 0;
  return Math.min(Math.max(0, currentIndex), matchCount - 1);
}

export function collectThreadFindUnitsFromDom(root: ParentNode): ThreadFindUnit[] {
  const seen = new Set<string>();
  return Array.from(root.querySelectorAll<HTMLElement>("[data-content-search-unit-key]"))
    .map((element): ThreadFindUnit | null => {
      const unitKey = element.dataset.contentSearchUnitKey?.trim();
      if (!unitKey || seen.has(unitKey)) return null;
      seen.add(unitKey);
      const text = collectSearchableTextNodes(element).text;
      if (!text.trim()) return null;
      return { unitKey, text };
    })
    .filter((unit): unit is ThreadFindUnit => unit !== null);
}

export function applyThreadFindMarks(root: ParentNode, matches: ThreadFindMatch[], currentMatchId: string | null): void {
  clearThreadFindMarks(root);
  if (matches.length === 0) return;
  const matchesByUnit = new Map<string, ThreadFindMatch[]>();
  for (const match of matches) {
    const existing = matchesByUnit.get(match.unitKey);
    if (existing) existing.push(match);
    else matchesByUnit.set(match.unitKey, [match]);
  }
  if (applyCssThreadFindHighlights(root, matchesByUnit, currentMatchId)) return;
  for (const [unitKey, unitMatches] of matchesByUnit) {
    const target = Array.from(root.querySelectorAll<HTMLElement>("[data-content-search-unit-key]"))
      .find((element) => element.dataset.contentSearchUnitKey === unitKey);
    if (!target) continue;
    markMatchesInElement(target, unitMatches, currentMatchId);
  }
}

export function clearThreadFindMarks(root: ParentNode): void {
  const highlightApi = threadFindCssHighlightApi(root);
  highlightApi?.registry.delete(THREAD_FIND_HIGHLIGHT_NAME);
  highlightApi?.registry.delete(THREAD_FIND_CURRENT_HIGHLIGHT_NAME);
  for (const mark of Array.from(root.querySelectorAll<HTMLElement>("mark.hc-thread-find-mark"))) {
    const parent = mark.parentNode;
    if (!parent) continue;
    parent.replaceChild(mark.ownerDocument.createTextNode(mark.textContent ?? ""), mark);
    parent.normalize();
  }
}

export function scrollThreadFindMatchIntoView(match: ThreadFindMatch, root: ParentNode = document): boolean {
  const target = Array.from(root.querySelectorAll<HTMLElement>("[data-content-search-unit-key]"))
    .find((element) => element.dataset.contentSearchUnitKey === match.unitKey);
  if (!target) return false;
  target.scrollIntoView({ block: "center" });
  return true;
}

function applyCssThreadFindHighlights(
  root: ParentNode,
  matchesByUnit: Map<string, ThreadFindMatch[]>,
  currentMatchId: string | null,
): boolean {
  const highlightApi = threadFindCssHighlightApi(root);
  if (!highlightApi) return false;
  const matchRanges: Range[] = [];
  const currentRanges: Range[] = [];
  const ownerDocument = ownerDocumentForParentNode(root);
  if (!ownerDocument) return false;
  for (const [unitKey, unitMatches] of matchesByUnit) {
    const target = Array.from(root.querySelectorAll<HTMLElement>("[data-content-search-unit-key]"))
      .find((element) => element.dataset.contentSearchUnitKey === unitKey);
    if (!target) continue;
    const nodes = collectSearchableTextNodes(target).nodes;
    for (const textNode of nodes) {
      for (const segment of segmentsForTextNode(textNode, unitMatches)) {
        const range = ownerDocument.createRange();
        range.setStart(textNode.node, segment.start);
        range.setEnd(textNode.node, segment.end);
        if (segment.match.id === currentMatchId) currentRanges.push(range);
        else matchRanges.push(range);
      }
    }
  }
  highlightApi.registry.set(THREAD_FIND_HIGHLIGHT_NAME, new highlightApi.Highlight(...matchRanges));
  highlightApi.registry.set(THREAD_FIND_CURRENT_HIGHLIGHT_NAME, new highlightApi.Highlight(...currentRanges));
  return true;
}

function markMatchesInElement(
  element: HTMLElement,
  matches: ThreadFindMatch[],
  currentMatchId: string | null,
): void {
  const nodes = collectSearchableTextNodes(element).nodes;
  for (const textNode of nodes) {
    const segments = segmentsForTextNode(textNode, matches);
    if (segments.length === 0) continue;
    const text = textNode.node.nodeValue ?? "";
    const fragment = textNode.node.ownerDocument.createDocumentFragment();
    let cursor = 0;
    for (const segment of segments) {
      if (segment.start > cursor) {
        fragment.append(textNode.node.ownerDocument.createTextNode(text.slice(cursor, segment.start)));
      }
      const mark = textNode.node.ownerDocument.createElement("mark");
      mark.className = "hc-thread-find-mark";
      mark.dataset.threadFindMatchId = segment.match.id;
      if (segment.match.id === currentMatchId) mark.dataset.current = "true";
      mark.textContent = text.slice(segment.start, segment.end);
      fragment.append(mark);
      cursor = segment.end;
    }
    if (cursor < text.length) {
      fragment.append(textNode.node.ownerDocument.createTextNode(text.slice(cursor)));
    }
    textNode.node.replaceWith(fragment);
  }
}

function segmentsForTextNode(textNode: SearchableTextNode, matches: ThreadFindMatch[]): ThreadFindSegment[] {
  return matches
    .map((match) => ({
      match,
      start: Math.max(0, match.start - textNode.start),
      end: Math.min(textNode.end - textNode.start, match.end - textNode.start),
    }))
    .filter((segment) => segment.end > segment.start)
    .sort((left, right) => left.start - right.start);
}

function collectSearchableTextNodes(element: HTMLElement): { text: string; nodes: SearchableTextNode[] } {
  const nodes: SearchableTextNode[] = [];
  let text = "";
  const walker = element.ownerDocument.createTreeWalker(element, SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType !== TEXT_NODE || !node.nodeValue) return FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent || !isSearchableThreadFindTextNodeParent(parent)) return FILTER_REJECT;
      return FILTER_ACCEPT;
    },
  });
  let current = walker.nextNode();
  while (current) {
    const value = current.nodeValue ?? "";
    const start = text.length;
    text += value;
    nodes.push({ node: current as Text, start, end: text.length });
    current = walker.nextNode();
  }
  return { text, nodes };
}

function threadFindCssHighlightApi(root: ParentNode): {
  Highlight: ThreadFindHighlightConstructor;
  registry: ThreadFindCssHighlightRegistry;
} | null {
  const ownerDocument = ownerDocumentForParentNode(root);
  const view = ownerDocument?.defaultView as (Window & typeof globalThis & {
    CSS?: { highlights?: ThreadFindCssHighlightRegistry };
    Highlight?: ThreadFindHighlightConstructor;
  }) | null;
  const registry = view?.CSS?.highlights;
  const Highlight = view?.Highlight;
  if (!registry || typeof registry.set !== "function" || typeof registry.delete !== "function" || !Highlight) {
    return null;
  }
  return { Highlight, registry };
}

function ownerDocumentForParentNode(root: ParentNode): Document | null {
  if (root.nodeType === 9) return root as Document;
  return root.ownerDocument ?? null;
}

function isSearchableThreadFindTextNodeParent(element: HTMLElement): boolean {
  if (element.closest("mark.hc-thread-find-mark")) return false;
  if (element.closest("button, input, textarea, select, option, [contenteditable='true']")) return false;
  const tagName = element.tagName.toLowerCase();
  return tagName !== "script" && tagName !== "style" && tagName !== "noscript";
}

function threadFindPreview(text: string, start: number, end: number): string {
  const context = 48;
  const previewStart = Math.max(0, start - context);
  const previewEnd = Math.min(text.length, end + context);
  const prefix = previewStart > 0 ? "..." : "";
  const suffix = previewEnd < text.length ? "..." : "";
  return `${prefix}${text.slice(previewStart, previewEnd).replace(/\s+/g, " ").trim()}${suffix}`;
}
