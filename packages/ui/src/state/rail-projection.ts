import { stringField } from "../lib/format";

import { hiCodexImageToolOutputUrl } from "./image-generation-tool";
import type {
  AppRegistryEntry,
  ItemRecord,
  RailEntry,
  RailEntryReference,
  ThreadItem,
} from "./render-group-types";
import {
  commandOutputText,
  dedupe,
  filePathsFromItem,
  itemText,
  itemType,
  mcpServerName,
  mcpSourceTitle,
  mcpToolName,
  shouldProjectArtifactsFromItem,
  statusText,
} from "./thread-item-fields";

export function appRegistryEntriesFromResponse(value: unknown): AppRegistryEntry[] {
  return responseItems(value).flatMap((item) => {
    const id = stringField(item, "id");
    if (!id) return [];
    return [{
      id,
      name: stringField(item, "name") || id,
      pluginDisplayNames: stringArrayField(item, "pluginDisplayNames"),
      logoUrl: stringField(item, "logoUrl") || null,
      logoUrlDark: stringField(item, "logoUrlDark") || null,
    }];
  });
}

/**
 * Codex Desktop source matching (`split-items-into-render-groups-*`):
 * compare server name, tool name, and `${server}__${tool}` parts against app
 * aliases: name, id, id without connector prefix, and plugin display names.
 */
function lookupAppSource(
  server: string,
  tool: string,
  appRegistry: AppRegistryEntry[] | null | undefined,
): AppRegistryEntry | null {
  if (!appRegistry || appRegistry.length === 0 || !server) return null;
  const serverTokens = normalizedTokens(server);
  const toolTokens = normalizedTokens(tool);
  const functionPartTokens = `${server}__${tool}`
    .split("__")
    .map(normalizedTokens)
    .filter((tokens) => tokens.length > 0);
  for (const app of appRegistry) {
    const aliases = appAliasTokens(app);
    const matchesServer = aliases.some((alias) => tokensEqual(alias, serverTokens));
    const matchesTool = aliases.some((alias) => tokensStartWith(toolTokens, alias));
    const matchesFunctionPart = functionPartTokens.some((part) =>
      aliases.some((alias) => tokensStartWith(part, alias)));
    if (matchesServer || matchesTool || matchesFunctionPart) {
      return app;
    }
  }
  return null;
}

export function collectRailEntries(
  item: ThreadItem,
  artifacts: Map<string, RailEntry>,
  sources: Map<string, RailEntry>,
  fileCandidates?: ArtifactFileCandidateIndex,
  appRegistry?: AppRegistryEntry[] | null,
): RailEntry[] | null {
  const record = item as ItemRecord;
  const plan = itemType(item) === "todo-list" && Array.isArray(record.plan) ? record.plan : null;
  let progress: RailEntry[] | null = null;
  if (plan) {
    progress = progressEntriesFromPlan(plan, `todo:${item.id}`);
  }

  const projectItemArtifacts = shouldProjectArtifactsFromItem(item);

  if (projectItemArtifacts) {
    for (const path of filePathsFromItem(item)) {
      setArtifact(artifacts, fileArtifactEntryFromPath(path, statusText(item)));
    }

    addCommandOutputFileCandidates(fileCandidates, commandOutputText(item));
  }

  if (item.type === "agentMessage") {
    for (const artifact of artifactsFromText(itemText(item), { source: "assistant" })) {
      setArtifact(artifacts, resolveFileArtifactCandidate(artifact, fileCandidates));
    }
  }

  if (itemType(item) === "generated-image" || itemType(item) === "imageGeneration") {
    const imageSrc = stringField(record, "src")
      || stringField(record, "url")
      || stringField(record, "path")
      || stringField(record, "savedPath")
      || imageResultDataUrl(record);
    if (imageSrc) {
      setArtifact(artifacts, imageArtifactEntryFromSource(imageSrc, statusText(item)));
    }
  }

  const hiCodexImageUrl = hiCodexImageToolOutputUrl(item);
  if (hiCodexImageUrl) {
    setArtifact(artifacts, imageArtifactEntryFromSource(hiCodexImageUrl, statusText(item)));
  }

  if (item.type === "mcpToolCall") {
    const server = mcpServerName(item);
    if (server !== "node_repl") {
      const sourceId = `mcp-server:${server || "mcp"}`;
      const tool = mcpToolName(item);
      const appSource = lookupAppSource(server, tool, appRegistry);
      const sourceKey = appSource?.id || sourceId;
      setSource(sources, sourceKey, {
        id: sourceKey,
        title: appSource ? appSourceDisplayTitle(appSource) : mcpSourceTitle(server),
        logoUrl: appSource?.logoUrl ?? null,
        logoUrlDark: appSource?.logoUrlDark ?? null,
      });
    }
  }

  if (itemType(item) === "web-search") {
    setSource(sources, "webSearch", {
      id: "webSearch",
      title: "Web search",
    });
  }

  return progress;
}

export type ArtifactFileCandidateIndex = Map<string, RailEntry>;

export function addCommandOutputFileCandidates(
  candidates: ArtifactFileCandidateIndex | undefined,
  text: string,
): void {
  if (!candidates) return;
  for (const entry of artifactsFromText(text, { source: "output" })) {
    if (entry.action?.kind !== "file") continue;
    if (!isResolvedFilePath(fileArtifactPath(entry))) continue;
    addFileArtifactCandidate(candidates, entry);
  }
}

export function addFileArtifactCandidate(
  candidates: ArtifactFileCandidateIndex,
  entry: RailEntry,
): void {
  if (entry.action?.kind !== "file") return;
  for (const key of fileArtifactCandidateKeys(entry)) {
    if (!candidates.has(key)) candidates.set(key, entry);
  }
}

export function resolveFileArtifactCandidate(
  entry: RailEntry,
  candidates: ArtifactFileCandidateIndex | undefined,
): RailEntry {
  if (!candidates || entry.action?.kind !== "file") return entry;
  const path = fileArtifactPath(entry);
  if (isResolvedFilePath(path)) return entry;
  for (const key of fileArtifactCandidateKeys(entry)) {
    const candidate = candidates.get(key);
    if (candidate) return candidate;
  }
  return entry;
}

export function progressEntriesFromPlan(plan: unknown[], idPrefix: string): RailEntry[] {
  return plan.map((raw, index) => {
    const entry = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const title = stringField(entry, "step") || stringField(entry, "title") || stringField(entry, "text") || `Task ${index + 1}`;
    return {
      id: `${idPrefix}:${index}`,
      title,
      status: stringField(entry, "status") || "planned",
    };
  });
}
function imageArtifactEntryFromSource(source: string, status: string): RailEntry {
  const localPath = filePathFromFileUrl(source) || (source.startsWith("/") ? source : "");
  if (localPath) return fileArtifactEntryFromPath(localPath, status);
  return {
    id: `image:${source}`,
    title: imageArtifactTitle(source),
    meta: source,
    status,
    action: { kind: "url", url: source },
  };
}

function filePathFromFileUrl(value: string): string {
  if (!/^file:/i.test(value)) return "";
  try {
    const url = new URL(value);
    return url.protocol === "file:" ? decodeURIComponent(url.pathname) : "";
  } catch {
    return "";
  }
}

function imageResultDataUrl(record: ItemRecord): string {
  const result = stringField(record, "result").trim();
  return result ? `data:image/png;base64,${result}` : "";
}

function imageArtifactTitle(value: string): string {
  if (/^(?:data|blob):/i.test(value)) return "Generated image";
  try {
    const url = new URL(value);
    const filename = url.pathname.split("/").filter(Boolean).pop();
    return filename ? decodeURIComponent(filename) : url.hostname || "Generated image";
  } catch {
    const filename = value.split(/[/?#]/).filter(Boolean).pop();
    return filename || "Generated image";
  }
}

type ArtifactTextSource = "assistant" | "generic" | "output";

interface ArtifactTextMatch {
  index: number;
  target: string;
  kind: "codeFile" | "linePath" | "markdownImage" | "markdownLink" | "url";
}

export function artifactsFromText(
  text: string,
  options: { source?: ArtifactTextSource } = {},
): RailEntry[] {
  const entries: RailEntry[] = [];
  const targets = [
    ...orderedMatches(text, /!\[[^\]]*]\(([^)]+)\)/g, 1, "markdownImage"),
    ...markdownLinkMatches(text),
    ...orderedMatches(text, /https?:\/\/[^\s)]+/g, 0, "url"),
    ...orderedMatches(text, /`([^`]+\.[A-Za-z0-9]{1,8})`/g, 1, "codeFile"),
    ...filePathLineMatches(text),
  ]
    .sort((left, right) => left.index - right.index)
    .filter((match) => shouldKeepArtifactTextMatch(text, match, options.source ?? "generic"))
    .map((match) => normalizeArtifactTarget(match.target));
  for (const target of dedupe(targets)) {
    if (!target || target.startsWith("#")) continue;
    if (target.startsWith("http://") || target.startsWith("https://")) {
      entries.push({
        id: `website:${target}`,
        title: websiteArtifactTitle(target),
        meta: target,
        status: "website",
        action: { kind: "url", url: target },
      });
      continue;
    }
    if (looksLikeFilePath(target)) {
      const reference = fileReferenceFromPath(target);
      entries.push({
        id: target,
        title: reference.path.split("/").filter(Boolean).pop() ?? reference.path,
        meta: target,
        reference,
        action: { kind: "file", reference },
      });
    }
  }
  return entries;
}

function fileReferenceFromPath(value: string): RailEntryReference {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.*?)(?::(\d+)(?:-(\d+))?)$/);
  if (!match || !match[1] || !match[2]) return { path: trimmed, lineStart: 1 };
  return {
    path: match[1],
    lineStart: Number(match[2]),
    ...(match[3] ? { lineEnd: Number(match[3]) } : {}),
  };
}

function orderedMatches(
  text: string,
  pattern: RegExp,
  group: number,
  kind: ArtifactTextMatch["kind"],
): ArtifactTextMatch[] {
  return Array.from(text.matchAll(pattern)).map((match) => ({
    index: match.index ?? 0,
    kind,
    target: match[group] ?? "",
  }));
}

function markdownLinkMatches(text: string): ArtifactTextMatch[] {
  const matches: ArtifactTextMatch[] = [];
  const pattern = /\[[^\]]+]\(([^)]+)\)/g;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (text[index - 1] === "!") continue;
    const target = match[1];
    if (!target) continue;
    matches.push({ index, kind: "markdownLink", target });
  }
  return matches;
}

export function setArtifact(artifacts: Map<string, RailEntry>, entry: RailEntry): void {
  if (!isRenderableArtifactEntry(entry)) return;

  const key = artifactKey(entry);
  if (artifacts.has(key)) return;

  const duplicateKey = fileArtifactDuplicateKey(artifacts, entry);
  if (duplicateKey) {
    const existing = artifacts.get(duplicateKey);
    if (!existing || !shouldReplaceFileArtifact(existing, entry)) return;
    artifacts.delete(duplicateKey);
  }

  artifacts.set(key, entry);
}

function setSource(sources: Map<string, RailEntry>, key: string, entry: RailEntry): void {
  sources.delete(key);
  sources.set(key, entry);
}

function appSourceDisplayTitle(app: AppRegistryEntry): string {
  const pluginNames = app.pluginDisplayNames?.filter((name) => name.trim().length > 0) ?? [];
  return pluginNames.length > 0 ? pluginNames.join(", ") : app.name || app.id;
}

export function artifactKey(entry: RailEntry): string {
  if (entry.status === "website") return `website:${entry.meta ?? entry.id}`;
  return entry.meta ?? entry.id;
}

function filePathLineMatches(text: string): ArtifactTextMatch[] {
  const matches: ArtifactTextMatch[] = [];
  let offset = 0;
  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const target = lineFilePathTarget(rawLine);
    if (target) {
      matches.push({ index: offset + rawLine.indexOf(target), kind: "linePath", target });
    }
    offset += rawLine.length + 1;
  }
  return matches;
}

function shouldKeepArtifactTextMatch(
  text: string,
  match: ArtifactTextMatch,
  source: ArtifactTextSource,
): boolean {
  if (match.kind === "url") return true;
  if (hasNegativeArtifactContext(text, match.index)) return false;
  if (source !== "assistant") return true;
  if (match.kind === "markdownImage") return true;
  // CODEX-REF: local-conversation-thread-*.js —
  // Codex Desktop's assistant artifact extraction parses markdown links and inline-code
  // file references without a "positive context" keyword gate; any resolved path it
  // surfaces becomes an artifact. HiCodex still keeps a heuristic for bare/relative
  // filenames (to avoid false positives in prose), but treats absolute filesystem
  // paths (`/Users/...`, `file://...`, `C:\...`) and `linePath` matches (lines that
  // start with a path) as strong-enough signals on their own, so AI messages like
  // "saved to /Users/me/Downloads/report.xlsx" keep the artifact even when no
  // surrounding verb such as "saved/created/wrote" is present.
  if (match.kind === "linePath") return true;
  if (isAbsoluteArtifactPath(match.target)) return true;
  return hasPositiveAssistantArtifactContext(text, match.index);
}

function isAbsoluteArtifactPath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/")) return true;
  if (/^file:\/\//i.test(trimmed)) return true;
  // Windows drive-letter paths (e.g. `C:\foo\bar.xlsx` or `C:/foo/bar.xlsx`).
  if (/^[A-Za-z]:[\\/]/.test(trimmed)) return true;
  return false;
}

function hasNegativeArtifactContext(text: string, index: number): boolean {
  const context = `${artifactLineContext(text, index, 96, 48)} ${artifactNearbyContext(text, index, 160, 48)}`;
  return /(?:没找到|没有找到|未找到|找不到|没在[^。\n；;]{0,40}找到|没有在[^。\n；;]{0,40}找到|不存在|无法找到|不能找到|还不能|不能开始|not found|no such file|couldn['’]?t find|cannot find|can['’]?t find|does not exist|doesn['’]?t exist|failed to (?:read|open|find)|unable to (?:read|open|find))/i.test(context);
}

function hasPositiveAssistantArtifactContext(text: string, index: number): boolean {
  const context = `${artifactLineContext(text, index, 96, 32)} ${artifactNearbyContext(text, index, 160, 32)}`;
  return /(?:created|generated|saved|wrote|updated|modified|added|exported|produced|built|attached|生成|生成了|创建|创建了|保存|保存到|写入|输出|导出|更新|修改|新增|生成的文件|文件是|已生成|已保存)/i.test(context);
}

function artifactLineContext(text: string, index: number, beforeLength: number, afterLength: number): string {
  const lineStart = Math.max(text.lastIndexOf("\n", index - 1) + 1, index - beforeLength, 0);
  const lineEnd = text.indexOf("\n", index);
  const end = Math.min(lineEnd < 0 ? text.length : lineEnd, index + afterLength);
  return text.slice(lineStart, end).replace(/\s+/g, " ");
}

function artifactNearbyContext(text: string, index: number, beforeLength: number, afterLength: number): string {
  const start = Math.max(index - beforeLength, 0);
  const end = Math.min(index + afterLength, text.length);
  return text.slice(start, end).replace(/\s+/g, " ");
}

function lineFilePathTarget(line: string): string {
  const normalized = line.trim().replace(/^["']|["']$/g, "");
  if (!normalized.startsWith("/") && !/^file:\/\//i.test(normalized)) return "";
  const target = normalizeArtifactTarget(normalized);
  return looksLikeLineFileArtifactTarget(target) ? target : "";
}

function normalizeArtifactTarget(value: string): string {
  let target = value.trim();
  if (target.startsWith("<") && target.endsWith(">")) {
    target = target.slice(1, -1).trim();
  }
  return target.replace(/[),.;:，。、；：]+$/g, "");
}

function fileArtifactDuplicateKey(artifacts: Map<string, RailEntry>, entry: RailEntry): string | null {
  const path = fileArtifactPath(entry);
  const basename = normalizedFileArtifactBasename(path);
  if (!basename) return null;
  for (const [key, existing] of artifacts) {
    if (normalizedFileArtifactBasename(fileArtifactPath(existing)) === basename) return key;
  }
  return null;
}

function shouldReplaceFileArtifact(existing: RailEntry, next: RailEntry): boolean {
  const existingPath = fileArtifactPath(existing);
  const nextPath = fileArtifactPath(next);
  if (!existingPath || !nextPath) return false;
  if (isResolvedFilePath(nextPath) && !isResolvedFilePath(existingPath)) return true;
  return false;
}

function fileArtifactPath(entry: RailEntry): string {
  if (entry.action?.kind === "file") return entry.action.reference.path;
  return entry.reference?.path ?? "";
}

function isRenderableArtifactEntry(entry: RailEntry): boolean {
  if (!hasArtifactDisplaySignal(entry.title) && !hasArtifactDisplaySignal(entry.meta ?? "")) return false;
  if (entry.action?.kind === "file") return hasArtifactDisplaySignal(fileArtifactPath(entry));
  if (entry.action?.kind === "url") return hasArtifactDisplaySignal(entry.action.url);
  return true;
}

function responseItems(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (isRecord(value) && Array.isArray(value.data)) return value.data.filter(isRecord);
  return [];
}

function stringArrayField(record: Record<string, unknown>, field: string): string[] {
  const value = record[field];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function appAliasTokens(app: AppRegistryEntry): string[][] {
  const values = [
    app.name ?? "",
    app.id,
    app.id.replace(/^connector[_-]/i, ""),
    ...(app.pluginDisplayNames ?? []),
  ];
  const aliases = values.map(normalizedTokens).filter((tokens) => tokens.length > 0);
  return aliases.filter((tokens, index) => aliases.findIndex((candidate) => tokensEqual(candidate, tokens)) === index);
}

function normalizedTokens(value: string | null | undefined): string[] {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((part) => part.length > 0);
}

function tokensEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

function tokensStartWith(value: string[], prefix: string[]): boolean {
  return prefix.length > 0 && value.length >= prefix.length && prefix.every((part, index) => part === value[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasArtifactDisplaySignal(value: string): boolean {
  return /[\p{L}\p{N}]/u.test(value);
}

function fileArtifactBasename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? "";
}

function normalizedFileArtifactBasename(path: string): string {
  return fileArtifactBasename(path)
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function fileArtifactCandidateKeys(entry: RailEntry): string[] {
  const values = [
    entry.title,
    entry.meta,
    entry.reference?.path,
    fileArtifactPath(entry),
    fileArtifactBasename(fileArtifactPath(entry)),
  ];
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value?.trim() ?? "";
    if (!trimmed) continue;
    const decoded = decodeUriComponentSafe(trimmed);
    for (const key of [
      trimmed,
      decoded,
      fileArtifactBasename(trimmed),
      fileArtifactBasename(decoded),
      normalizedFileArtifactBasename(trimmed),
      normalizedFileArtifactBasename(decoded),
    ]) {
      if (!key || seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

function decodeUriComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isResolvedFilePath(path: string): boolean {
  return path.startsWith("/") || /^file:\/\//i.test(path);
}

function looksLikeLineFileArtifactTarget(value: string): boolean {
  const withoutScheme = value.replace(/^file:\/\//i, "");
  const path = withoutScheme.replace(/:(\d+)(?:-(\d+))?$/, "");
  const basename = fileArtifactBasename(path);
  return /\.[A-Za-z0-9]{1,16}$/.test(basename);
}

function looksLikeFilePath(value: string): boolean {
  return value.startsWith("/")
    || value.startsWith("./")
    || value.startsWith("../")
    || /^[\w.-]+\/[\w./ -]+\.[\w-]+$/.test(value)
    || looksLikeBareFileName(value);
}

function websiteArtifactTitle(value: string): string {
  try {
    const url = new URL(value);
    return `${url.host}${url.pathname === "/" ? "" : url.pathname}${url.search}`;
  } catch {
    const filename = value.split(/[/?#]/).filter(Boolean).pop();
    return filename && filename.length > 0 ? filename : value;
  }
}

export function fileArtifactEntryFromPath(path: string, status = "referenced"): RailEntry {
  const reference = fileReferenceFromPath(path);
  return {
    id: path,
    title: reference.path.split("/").filter(Boolean).pop() ?? reference.path,
    meta: path,
    status,
    reference,
    action: { kind: "file", reference },
  };
}

const BARE_FILE_EXTENSIONS = new Set([
  "avif",
  "bash",
  "bmp",
  "c",
  "cc",
  "conf",
  "cpp",
  "css",
  "csv",
  "diff",
  "doc",
  "docx",
  "gif",
  "go",
  "h",
  "heic",
  "heif",
  "hpp",
  "html",
  "ipynb",
  "java",
  "jpeg",
  "jpg",
  "js",
  "json",
  "jsonl",
  "jsx",
  "kt",
  "log",
  "markdown",
  "md",
  "mdx",
  "mjs",
  "pdf",
  "png",
  "ppt",
  "pptx",
  "py",
  "rs",
  "sh",
  "svg",
  "swift",
  "toml",
  "ts",
  "tsx",
  "tsv",
  "txt",
  "webp",
  "xls",
  "xlsx",
  "xlsm",
  "xml",
  "yaml",
  "yml",
  "zsh",
]);

function looksLikeBareFileName(value: string): boolean {
  const trimmed = value.trim();
  if (!/^[^/\n]+\.[A-Za-z0-9]{1,16}$/.test(trimmed)) return false;
  const extension = trimmed.slice(trimmed.lastIndexOf(".") + 1).toLowerCase();
  return BARE_FILE_EXTENSIONS.has(extension);
}
