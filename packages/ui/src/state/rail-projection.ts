import { stringField } from "../lib/format";

import type { ItemRecord, RailEntry, RailEntryReference, ThreadItem } from "./render-group-types";
import {
  dedupe,
  filePathsFromItem,
  itemText,
  itemType,
  mcpServerName,
  mcpSourceTitle,
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

  for (const path of filePathsFromItem(item)) {
    const reference = fileReferenceFromPath(path);
    setArtifact(artifacts, path, {
      id: path,
      title: reference.path.split("/").filter(Boolean).pop() ?? reference.path,
      meta: path,
      status: statusText(item),
      reference,
      action: { kind: "file", reference },
    });
  }

  if (item.type === "agentMessage") {
    for (const artifact of artifactsFromText(itemText(item))) {
      setArtifact(artifacts, artifactKey(artifact), artifact);
    }
  }

  if (itemType(item) === "generated-image" || itemType(item) === "imageGeneration") {
    const imageSrc = stringField(record, "src") || stringField(record, "url");
    if (imageSrc) {
      const url = imageEventSource(record);
      setArtifact(artifacts, `image:${imageSrc}`, {
        id: `image:${imageSrc}`,
        title: imageArtifactTitle(imageSrc),
        meta: imageSrc,
        status: statusText(item),
        action: { kind: "url", url },
      });
    }
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
  if (!src) return "";
  if (/^(?:data|blob|https?|file):/i.test(src)) return src;
  if (src.startsWith("/")) return `file://${encodeURI(src)}`;
  return src;
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
function artifactsFromText(text: string): RailEntry[] {
  const entries: RailEntry[] = [];
  const targets = [
    ...orderedMatches(text, /\[[^\]]+]\(([^)]+)\)/g, 1),
    ...orderedMatches(text, /https?:\/\/[^\s)]+/g, 0),
    ...orderedMatches(text, /`([^`]+\.[A-Za-z0-9]{1,8})`/g, 1),
  ].sort((left, right) => left.index - right.index).map((match) => match.target);
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

function orderedMatches(text: string, pattern: RegExp, group: number): Array<{ index: number; target: string }> {
  return Array.from(text.matchAll(pattern)).map((match) => ({
    index: match.index ?? 0,
    target: match[group] ?? "",
  }));
}

function setArtifact(artifacts: Map<string, RailEntry>, key: string, entry: RailEntry): void {
  if (artifacts.has(key)) return;
  artifacts.set(key, entry);
}

function setSource(sources: Map<string, RailEntry>, key: string, entry: RailEntry): void {
  if (sources.has(key)) return;
  sources.set(key, entry);
}

function artifactKey(entry: RailEntry): string {
  if (entry.status === "website") return `website:${entry.meta ?? entry.id}`;
  return entry.meta ?? entry.id;
}

function looksLikeFilePath(value: string): boolean {
  return value.startsWith("/") || value.startsWith("./") || value.startsWith("../") || /^[\w.-]+\/[\w./-]+\.[\w-]+$/.test(value);
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
