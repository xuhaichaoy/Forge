import type {
  AssistantEndResource,
  ConversationRenderUnit,
} from "./render-group-types";

export interface ThreadFindUnit {
  unitKey: string;
  text: string;
}

export interface ThreadFindCurrentRef {
  unitKey: string;
  matchIndex: number;
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

/*
 * State-side searchable units. Codex Desktop computes ⌘F matches from state
 * (local-conversation-thread-*.js groups state matches by unitKey before any
 * DOM work) because the turn list is virtualized — a DOM query only ever sees
 * the mounted window, so long conversations would be mostly unsearchable.
 * The strings here approximate the rendered text (markdown is searched as
 * source); the DOM marking pass re-derives exact offsets per mounted unit, so
 * highlight placement never depends on these strings.
 */
export function collectThreadFindUnitsFromConversation(
  units: readonly ConversationRenderUnit[],
): ThreadFindUnit[] {
  const seen = new Set<string>();
  const collected: ThreadFindUnit[] = [];
  const push = (unitKey: string | undefined, parts: Array<string | null | undefined>) => {
    if (!unitKey || seen.has(unitKey)) return;
    const text = parts
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
      .join("\n");
    if (!text.trim()) return;
    seen.add(unitKey);
    collected.push({ unitKey, text });
  };
  for (const unit of units) {
    switch (unit.kind) {
      case "message": {
        const parts: Array<string | null | undefined> = [];
        if (unit.userContent && unit.userContent.length > 0) {
          for (const part of unit.userContent) {
            parts.push(part.kind === "text" ? part.text : part.label);
          }
        } else {
          parts.push(unit.text);
        }
        push(unit.key, parts);
        for (const after of unit.assistantAfter ?? []) {
          if (after.kind === "assistantAfterEvent") {
            push(after.key, [after.label, after.text, after.details]);
          } else if (after.kind === "assistantEndResources") {
            push(after.key, after.resources.map(assistantEndResourceSearchText));
          } else if (after.kind === "assistantReviewComments") {
            push(after.key, after.comments.flatMap((comment) => [comment.title, comment.body, comment.path]));
          }
          // generatedImageGallery: thumbnails carry no searchable text
        }
        break;
      }
      case "event":
        push(unit.key, [unit.label, unit.text, unit.details]);
        break;
      case "toolActivity":
        push(unit.key, [unit.summary.label, unit.summary.activeDetail, ...unit.summary.details]);
        break;
      case "threadItem":
        push(unit.key, threadItemSearchableStrings(unit.item));
        break;
      case "dynamicToolCallGroup":
        push(unit.key, unit.items.flatMap((item) => threadItemSearchableStrings(item)));
        break;
      case "assistantEndResources":
        push(unit.key, unit.resources.map(assistantEndResourceSearchText));
        break;
      default:
        break; // generatedImageGallery
    }
  }
  return collected;
}

function assistantEndResourceSearchText(resource: AssistantEndResource): string {
  if (resource.type === "file") return resource.path;
  if (resource.type === "website") return resource.target;
  return resource.title || resource.url;
}

// Best-effort text projection for protocol thread items (plans, todo lists,
// errors, ...). Deliberately shallow — the DOM marking pass owns exact text;
// this only decides whether ⌘F can count/navigate to the unit.
function threadItemSearchableStrings(item: Record<string, unknown>): string[] {
  const parts: string[] = [];
  const pushString = (value: unknown) => {
    if (typeof value === "string" && value.trim()) parts.push(value);
  };
  pushString(item.text);
  pushString(item.title);
  pushString(item.name);
  pushString(item.summary);
  pushString(item.message);
  pushString(item.description);
  const steps = Array.isArray(item.steps) ? item.steps : Array.isArray(item.plan) ? item.plan : null;
  for (const step of steps ?? []) {
    if (typeof step === "string") {
      pushString(step);
    } else if (step && typeof step === "object") {
      const record = step as Record<string, unknown>;
      pushString(record.step ?? record.text ?? record.title);
    }
  }
  return parts;
}

/*
 * Marking stays DOM-local on purpose: state matches carry offsets into state
 * strings, not into rendered text, so the mounted window re-runs the query
 * against its own text nodes (Desktop equally only decorates the mounted
 * subset). The current match is correlated by (unitKey, matchIndex) and
 * clamped when the rendered text yields fewer matches than the projection.
 */
export function applyThreadFindMarksForQuery(
  root: ParentNode,
  query: string,
  current: ThreadFindCurrentRef | null,
): void {
  const matches = findThreadFindMatches(collectThreadFindUnitsFromDom(root), query);
  applyThreadFindMarks(root, matches, currentDomThreadFindMatchId(matches, current));
}

export function currentDomThreadFindMatchId(
  domMatches: ThreadFindMatch[],
  current: ThreadFindCurrentRef | null,
): string | null {
  if (!current) return null;
  const unitMatches = domMatches.filter((match) => match.unitKey === current.unitKey);
  if (unitMatches.length === 0) return null;
  const exact = unitMatches.find((match) => match.matchIndex === current.matchIndex);
  return (exact ?? unitMatches[unitMatches.length - 1]).id;
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

/*
 * Honour the `data-thread-find-skip` opt-out marker. codex:
 * local-conversation-thread-*.js sets `data-thread-find-skip` on subtrees the
 * find bar should never traverse (e.g. composer drafts, pending request
 * scaffolding); Forge's DEVELOPMENT.md §13 lists the attribute as part of the
 * find plumbing, but the previous walker only filtered tag names and live form
 * controls so the opt-out was effectively a no-op. Mirror Desktop by rejecting
 * any text node whose ancestor opts out.
 */
export function isSearchableThreadFindTextNodeParent(element: HTMLElement): boolean {
  if (element.closest("mark.hc-thread-find-mark")) return false;
  if (element.closest("[data-thread-find-skip]")) return false;
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
