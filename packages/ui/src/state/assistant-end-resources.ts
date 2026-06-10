import type {
  AssistantEndResource,
  AssistantGoogleDriveResourceKind,
  ThreadItem,
} from "./render-group-types";
import { filePathsFromItem, itemType } from "./thread-item-fields";
import { isProjectlessThreadCwd } from "./thread-workflow";

interface AssistantEndResourcesInput {
  items: ThreadItem[];
  assistantText: string | null;
  cwd?: string | null;
}

const DIFF_COVERAGE_FILE_EXTENSIONS = new Set([
  "avif",
  "csv",
  "doc",
  "docx",
  "gif",
  "jpeg",
  "jpg",
  "pdf",
  "png",
  "ppt",
  "pptx",
  "tsv",
  "webp",
  "xls",
  "xlsm",
  "xlsx",
]);
const DIRECT_END_RESOURCE_FILE_EXTENSIONS = new Set([
  ...DIFF_COVERAGE_FILE_EXTENSIONS,
  "md",
  "mdx",
]);
const LINKED_END_RESOURCE_FILE_EXTENSIONS = new Set([
  ...DIRECT_END_RESOURCE_FILE_EXTENSIONS,
]);

export function assistantEndResourcesForTurn(input: AssistantEndResourcesInput): AssistantEndResource[] {
  const assistantText = input.assistantText ?? "";
  const resources: AssistantEndResource[] = [];

  /*
   * In a PROJECTLESS thread (a "new chat" with no real workspace — its
   * ~/Documents/Codex/<date>/new-chat-N cwd is a generated slug dir, not a
   * codebase), a *cited* file is not a local workspace file: it's the source
   * document a tool (e.g. the Yuxi knowledge-base search) read. Rendering it as
   * a local-file end-resource card resolves to `cwd/<basename>`, which does not
   * exist → "无法加载此预览 / file does not exist" (reported KB-search bug). So we
   * drop cited FILE resources and bare linked filenames here; EDITED files stay
   * (apply_patch really created them under the projectless cwd), as do explicit
   * local artifact links, web resources, and Drive resources.
   * Real workspaces still require cited / linked assistant file references to
   * carry path context; a bare `source.docx` from a KB result is provenance, not
   * proof that `cwd/source.docx` exists.
   */
  const projectless = isProjectlessThreadCwd(input.cwd ?? null);

  for (const path of editedFilePaths(input.items)) {
    if (path && isDirectEndResourceFilePath(path)) {
      resources.push({ type: "file", path });
    }
  }

  if (!projectless) {
    for (const path of referencedFileCitationPaths(assistantText)) {
      if (isReferencedEndResourceFilePath(path) && hasLocalPathContext(path)) {
        resources.push({ type: "file", path });
      }
    }
  }

  for (const link of markdownLinks(assistantText)) {
    const googleDriveResource = googleDriveResourceFromLink(link);
    if (googleDriveResource) {
      resources.push(googleDriveResource);
      continue;
    }
    const path = filePathFromMarkdownDestination(link.destination);
    if (!path) continue;
    const hasPathContext = projectless ? hasExplicitLocalPathContext(path) : hasLocalPathContext(path);
    if (hasPathContext && isLinkedEndResourceFilePath(path)) {
      resources.push({ type: "file", path });
    }
  }

  const deduped = dedupeEndResources(resources, input.cwd);
  if (deduped.some((resource) => resource.type === "file")) return deduped;

  const website = uniqueWebsiteFromText(assistantText) ?? singleEditedWebsitePath(input.items);
  return website ? dedupeEndResources([...deduped, { type: "website", target: website }], input.cwd) : deduped;
}

export function endResourcesCoverEditedFiles(input: {
  resources: AssistantEndResource[];
  items: ThreadItem[];
  cwd?: string | null;
}): boolean {
  if (input.resources.length === 0) return false;
  const editedPaths = editedFilePaths(input.items);
  if (editedPaths.length === 0) return false;
  const resourcePaths = new Set<string>();
  for (const resource of input.resources) {
    if (resource.type === "file" && isDiffCoverageFilePath(resource.path)) {
      resourcePaths.add(normalizedResourcePath(input.cwd, resource.path));
    } else if (resource.type === "website" && !isHttpUrl(resource.target)) {
      resourcePaths.add(normalizedResourcePath(input.cwd, resource.target));
    }
  }
  return editedPaths.every((path) => resourcePaths.has(normalizedResourcePath(input.cwd, path)));
}

function editedFilePaths(items: ThreadItem[]): string[] {
  const paths: string[] = [];
  for (const item of items) {
    if (itemType(item) !== "patch") continue;
    paths.push(...filePathsFromItem(item));
  }
  return dedupeStrings(paths.map(stripLineSuffix).filter(Boolean));
}

/**
 * codex: app-server-manager-signals-SKi6YePu.js `YC` — `_x(e) ∈ pC` where
 * `pC = {...fC, md, mdx}`. Exported so the inline assistant resource cards can
 * apply the same card-extension whitelist Codex uses for end resources.
 */
export function isDirectEndResourceFilePath(path: string): boolean {
  const extension = pathExtension(path);
  return extension ? DIRECT_END_RESOURCE_FILE_EXTENSIONS.has(extension) : false;
}

function isLinkedEndResourceFilePath(path: string): boolean {
  const extension = pathExtension(path);
  return extension ? LINKED_END_RESOURCE_FILE_EXTENSIONS.has(extension) : false;
}

function isReferencedEndResourceFilePath(path: string): boolean {
  const extension = pathExtension(path);
  return extension ? DIFF_COVERAGE_FILE_EXTENSIONS.has(extension) : false;
}

function isDiffCoverageFilePath(path: string): boolean {
  const extension = pathExtension(path);
  return extension ? DIFF_COVERAGE_FILE_EXTENSIONS.has(extension) : false;
}

function hasLocalPathContext(path: string): boolean {
  const normalized = stripLineSuffix(path).replaceAll("\\", "/");
  if (!normalized || isHttpUrl(normalized)) return false;
  return normalized.startsWith("/") || normalized.startsWith("./") || normalized.startsWith("../") || normalized.includes("/");
}

function hasExplicitLocalPathContext(path: string | null): boolean {
  if (!path) return false;
  const normalized = stripLineSuffix(path).replaceAll("\\", "/");
  if (!normalized || isHttpUrl(normalized)) return false;
  return normalized.startsWith("/") || normalized.startsWith("./") || normalized.startsWith("../");
}

function filePathFromMarkdownDestination(destination: string): string | null {
  const decoded = decodeUriSafe(destination.trim());
  if (!decoded || decoded.startsWith("#") || isHttpUrl(decoded)) return null;
  const path = stripLineSuffix(decoded.replace(/^file:\/\//i, ""));
  return path && isLinkedEndResourceFilePath(path) ? path : null;
}

function referencedFileCitationPaths(text: string): string[] {
  const paths: string[] = [];
  for (const match of text.matchAll(/【([^†】\n]+)†L\d+(?:-L\d+)?】/g)) {
    const raw = (match[1] ?? "").trim();
    const forced = raw.startsWith("F:");
    const decoded = decodeUriSafe(forced ? raw.slice(2).trim() : raw);
    if (!decoded) continue;
    if (forced || isDirectEndResourceFilePath(decoded)) paths.push(stripLineSuffix(decoded));
  }
  return dedupeStrings(paths);
}

function markdownLinks(markdown: string): Array<{ label: string; destination: string }> {
  if (!markdown.includes("](")) return [];
  const links: Array<{ label: string; destination: string }> = [];
  let fence: "`" | "~" | null = null;
  for (const line of markdown.split(/\r?\n/u)) {
    const nextFence = markdownFenceMarker(line);
    if (nextFence) {
      fence = fence == null ? nextFence : null;
      continue;
    }
    if (!fence) parseMarkdownLinksInLine(links, line);
  }
  return links;
}

function parseMarkdownLinksInLine(result: Array<{ label: string; destination: string }>, line: string): void {
  let index = 0;
  while (index < line.length) {
    if (line[index] === "`") {
      const code = parseBacktickSpan(line, index);
      if (code) {
        const trimmed = code.value.trim();
        const link = parseMarkdownLinkAt(trimmed, 0);
        if (link && link.nextIndex === trimmed.length) {
          result.push({ label: link.label, destination: link.destination });
        }
        index = code.nextIndex;
        continue;
      }
    }

    const linkStart = line[index] === "!" && line[index + 1] === "[" ? index + 1 : index;
    if (line[linkStart] === "[") {
      const link = parseMarkdownLinkAt(line, linkStart);
      if (link) {
        result.push({ label: link.label, destination: link.destination });
        index = link.nextIndex;
        continue;
      }
    }
    index += 1;
  }
}

function parseMarkdownLinkAt(line: string, start: number): { label: string; destination: string; nextIndex: number } | null {
  const label = parseBracketText(line, start + 1);
  if (!label || line[label.nextIndex] !== "(") return null;
  const destination = parseLinkDestination(line, label.nextIndex + 1);
  if (!destination) return null;
  return {
    label: label.value.trim(),
    destination: destination.value,
    nextIndex: destination.nextIndex,
  };
}

function parseBracketText(line: string, start: number): { value: string; nextIndex: number } | null {
  const chars: string[] = [];
  let nested = 0;
  let index = start;
  while (index < line.length) {
    const char = line[index];
    if (char === "\n" || char === "\r") return null;
    if (char === "\\") {
      chars.push(line[index + 1] ?? char);
      index += line[index + 1] == null ? 1 : 2;
      continue;
    }
    if (char === "[") {
      nested += 1;
      chars.push(char);
      index += 1;
      continue;
    }
    if (char === "]") {
      if (nested === 0) return { value: chars.join(""), nextIndex: index + 1 };
      nested -= 1;
      chars.push(char);
      index += 1;
      continue;
    }
    chars.push(char ?? "");
    index += 1;
  }
  return null;
}

function parseLinkDestination(line: string, start: number): { value: string; nextIndex: number } | null {
  const index = skipMarkdownSpaces(line, start);
  if (line[index] === "<") return parseAngleLinkDestination(line, index + 1);
  return parseBareLinkDestination(line, index);
}

function parseBareLinkDestination(line: string, start: number): { value: string; nextIndex: number } | null {
  const chars: string[] = [];
  let nested = 0;
  let index = start;
  while (index < line.length) {
    const char = line[index];
    if (char === "\n" || char === "\r") return null;
    if (char === "\\") {
      chars.push(line[index + 1] ?? char);
      index += line[index + 1] == null ? 1 : 2;
      continue;
    }
    if (char === "(") {
      nested += 1;
      chars.push(char);
      index += 1;
      continue;
    }
    if (char === ")") {
      if (nested === 0) return { value: chars.join("").trim(), nextIndex: index + 1 };
      nested -= 1;
      chars.push(char);
      index += 1;
      continue;
    }
    if ((char === " " || char === "\t") && nested === 0) {
      const next = line[skipMarkdownSpaces(line, index)];
      if (next === "\"" || next === "'" || next === "(") {
        return consumeLinkTitleAndClosingParen(line, index, chars.join("").trim());
      }
    }
    chars.push(char ?? "");
    index += 1;
  }
  return null;
}

function parseAngleLinkDestination(line: string, start: number): { value: string; nextIndex: number } | null {
  const chars: string[] = [];
  let index = start;
  while (index < line.length) {
    const char = line[index];
    if (char === "\n" || char === "\r") return null;
    if (char === "\\") {
      chars.push(line[index + 1] ?? char);
      index += line[index + 1] == null ? 1 : 2;
      continue;
    }
    if (char === ">") return consumeLinkTitleAndClosingParen(line, index + 1, chars.join("").trim());
    chars.push(char ?? "");
    index += 1;
  }
  return null;
}

function consumeLinkTitleAndClosingParen(
  line: string,
  start: number,
  destination: string,
): { value: string; nextIndex: number } | null {
  let index = skipMarkdownSpaces(line, start);
  while (index < line.length) {
    const char = line[index];
    if (char === "\n" || char === "\r") return null;
    if (char === "\\") {
      index += line[index + 1] == null ? 1 : 2;
      continue;
    }
    if (char === ")") return { value: destination, nextIndex: index + 1 };
    index += 1;
  }
  return null;
}

function parseBacktickSpan(line: string, start: number): { value: string; nextIndex: number } | null {
  const tickCount = countRepeated(line, start, "`");
  const fence = "`".repeat(tickCount);
  const end = line.indexOf(fence, start + tickCount);
  if (end === -1) return null;
  return { value: line.slice(start + tickCount, end), nextIndex: end + tickCount };
}

function markdownFenceMarker(line: string): "`" | "~" | null {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/u);
  if (!match) return null;
  return match[1]?.startsWith("`") ? "`" : "~";
}

function skipMarkdownSpaces(line: string, start: number): number {
  let index = start;
  while (line[index] === " " || line[index] === "\t") index += 1;
  return index;
}

function countRepeated(line: string, start: number, char: string): number {
  let count = 0;
  while (line[start + count] === char) count += 1;
  return count;
}

function googleDriveResourceFromLink(link: { label: string; destination: string }): AssistantEndResource | null {
  let url: URL;
  try {
    url = new URL(link.destination);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const resourceKind = googleDriveResourceKind(url);
  if (!resourceKind) return null;
  return {
    type: "google-drive",
    url: url.href,
    title: link.label || googleDriveTitle(url),
    resourceKind,
  };
}

function googleDriveResourceKind(url: URL): AssistantGoogleDriveResourceKind | null {
  if (url.hostname === "docs.google.com") {
    if (url.pathname.startsWith("/document/")) return "document";
    if (url.pathname.startsWith("/spreadsheets/")) return "spreadsheet";
    if (url.pathname.startsWith("/presentation/")) return "presentation";
    return null;
  }
  if (url.hostname === "sheets.google.com") return "spreadsheet";
  if (url.hostname === "slides.google.com") return "presentation";
  if (url.hostname === "drive.google.com") return "drive";
  return null;
}

function uniqueWebsiteFromText(text: string): string | null {
  if (!text) return null;
  const urls = new Set<string>();
  for (const match of text.matchAll(/\bhttps?:\/\/[^\s<>)"'`]+/gi)) {
    const target = normalizedWebsiteUrl(match[0] ?? "");
    if (target && !googleDriveResourceKind(new URL(target))) urls.add(target);
  }
  return urls.size === 1 ? urls.values().next().value ?? null : null;
}

function normalizedWebsiteUrl(value: string): string | null {
  const trimmed = value.replace(/[.,;!?]+$/u, "");
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.port) return null;
    if (/[()[\]]/u.test(`${url.pathname}${url.search}${url.hash}`)) return null;
    if (!isLocalhostUrl(url)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function isLocalhostUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return host.endsWith(".localhost")
    || host === "localhost"
    || host === "127.0.0.1"
    || host === "0.0.0.0"
    || host === "::1"
    || host === "[::1]";
}

function singleEditedWebsitePath(items: ThreadItem[]): string | null {
  const htmlPaths = editedFilePaths(items).filter((path) => {
    const extension = pathExtension(path);
    return extension === "html" || extension === "htm";
  });
  const unique = dedupeStrings(htmlPaths);
  return unique.length === 1 ? unique[0] ?? null : null;
}

function dedupeEndResources(resources: AssistantEndResource[], cwd?: string | null): AssistantEndResource[] {
  const seen = new Set<string>();
  const result: AssistantEndResource[] = [];
  for (const resource of resources) {
    const key = endResourceKey(resource, cwd);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(resource);
  }
  return result;
}

function endResourceKey(resource: AssistantEndResource, cwd?: string | null): string {
  switch (resource.type) {
    case "file":
      return `file:${normalizedResourcePath(cwd, resource.path)}`;
    case "website":
      return `website:${normalizedResourcePath(cwd, resource.target)}`;
    case "google-drive":
      return `google-drive:${resource.url}`;
  }
}

function normalizedResourcePath(cwd: string | null | undefined, path: string): string {
  const normalized = stripLineSuffix(path).replaceAll("\\", "/");
  if (!cwd || normalized.startsWith("/") || isHttpUrl(normalized)) return normalizePathParts(normalized);
  return normalizePathParts(`${cwd.replaceAll("\\", "/").replace(/\/+$/, "")}/${normalized}`);
}

function normalizePathParts(path: string): string {
  if (isHttpUrl(path)) return path;
  const absolute = path.startsWith("/");
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length > 0 && parts[parts.length - 1] !== "..") parts.pop();
      else if (!absolute) parts.push(part);
      continue;
    }
    parts.push(part);
  }
  return `${absolute ? "/" : ""}${parts.join("/")}`.toLowerCase();
}

function stripLineSuffix(path: string): string {
  return path.trim().replace(/:(\d+)(?:-(\d+))?$/, "");
}

function pathExtension(path: string): string | null {
  const match = stripLineSuffix(path).match(/\.([A-Za-z0-9]+)(?:[#?].*)?$/);
  return match?.[1]?.toLowerCase() ?? null;
}

function dedupeStrings(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function decodeUriSafe(value: string): string {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}

function googleDriveTitle(url: URL): string {
  return url.hostname.replace(/^www\./, "");
}
