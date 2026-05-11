import { stringField } from "../lib/format";

import { hiCodexImageToolOutputUrl } from "./image-generation-tool";
import type { ItemRecord, RailEntry, RailEntryReference, ThreadItem } from "./render-group-types";
import {
  commandOutputText,
  dedupe,
  filePathsFromItem,
  itemText,
  itemType,
  mcpServerName,
  mcpSourceTitle,
  shouldProjectArtifactsFromItem,
  statusText,
} from "./thread-item-fields";

export function collectRailEntries(
  item: ThreadItem,
  artifacts: Map<string, RailEntry>,
  sources: Map<string, RailEntry>,
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

    for (const artifact of artifactsFromText(commandOutputText(item), { source: "output" })) {
      if (artifact.action?.kind === "file") setArtifact(artifacts, artifact);
    }
  }

  if (item.type === "agentMessage") {
    for (const artifact of artifactsFromText(itemText(item), { source: "assistant" })) {
      setArtifact(artifacts, artifact);
    }
  }

  if (itemType(item) === "generated-image" || itemType(item) === "imageGeneration") {
    const imageSrc = stringField(record, "src") || stringField(record, "url") || imageResultDataUrl(record);
    if (imageSrc) {
      const url = imageEventSource(record);
      setArtifact(artifacts, {
        id: `image:${imageSrc}`,
        title: imageArtifactTitle(imageSrc),
        meta: imageSrc,
        status: statusText(item),
        action: { kind: "url", url },
      });
    }
  }

  const hiCodexImageUrl = hiCodexImageToolOutputUrl(item);
  if (hiCodexImageUrl) {
    setArtifact(artifacts, {
      id: `image:${hiCodexImageUrl}`,
      title: imageArtifactTitle(hiCodexImageUrl),
      meta: hiCodexImageUrl,
      status: statusText(item),
      action: { kind: "url", url: hiCodexImageUrl },
    });
  }

  if (item.type === "mcpToolCall") {
    const server = mcpServerName(item);
    if (server !== "node_repl") {
      const sourceId = `mcp-server:${server || "mcp"}`;
      setSource(sources, sourceId, {
        id: sourceId,
        title: mcpSourceTitle(server),
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
function imageEventSource(record: ItemRecord): string {
  const src = stringField(record, "src") || stringField(record, "url") || stringField(record, "path") || stringField(record, "savedPath");
  if (!src) return imageResultDataUrl(record);
  if (/^(?:data|blob|https?|file):/i.test(src)) return src;
  if (src.startsWith("/")) return `file://${encodeURI(src)}`;
  return src;
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

function markdownImageTarget(value: string): string {
  return /[\s()<>]/.test(value) ? `<${value.replaceAll(">", "%3E")}>` : value;
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
    ...orderedMatches(text, /(?<!!)\[[^\]]+]\(([^)]+)\)/g, 1, "markdownLink"),
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
        status: "referenced",
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

export function setArtifact(artifacts: Map<string, RailEntry>, entry: RailEntry): void {
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
  if (sources.has(key)) return;
  sources.set(key, entry);
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
  return hasPositiveAssistantArtifactContext(text, match.index);
}

function hasNegativeArtifactContext(text: string, index: number): boolean {
  const context = artifactContext(text, index, 96, 48);
  return /(?:没找到|没有找到|未找到|找不到|没在[^。\n；;]{0,40}找到|没有在[^。\n；;]{0,40}找到|不存在|无法找到|不能找到|还不能|不能开始|not found|no such file|couldn['’]?t find|cannot find|can['’]?t find|does not exist|doesn['’]?t exist|failed to (?:read|open|find)|unable to (?:read|open|find))/i.test(context);
}

function hasPositiveAssistantArtifactContext(text: string, index: number): boolean {
  const context = artifactContext(text, index, 96, 32);
  return /(?:created|generated|saved|wrote|updated|modified|added|exported|produced|built|attached|生成|生成了|创建|创建了|保存|保存到|写入|输出|导出|更新|修改|新增|生成的文件|文件是|已生成|已保存)/i.test(context);
}

function artifactContext(text: string, index: number, beforeLength: number, afterLength: number): string {
  const lineStart = Math.max(text.lastIndexOf("\n", index - 1) + 1, index - beforeLength, 0);
  const lineEnd = text.indexOf("\n", index);
  const end = Math.min(lineEnd < 0 ? text.length : lineEnd, index + afterLength);
  return text.slice(lineStart, end).replace(/\s+/g, " ");
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
  return target.replace(/[),.;:]+$/g, "");
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
