/*
 * Shared record->field parse helpers for tool-activity rendering.
 *
 * tool-activity-detail.tsx (the view-model + renderers) and
 * tool-activity-grouping.ts (the summary/grouping layer) each used to carry
 * their own private copy of these pure parsers. The duplicates had drifted
 * apart, so they live here in one place and both modules import them.
 *
 * Scope rule: this module holds only LOCALE-INDEPENDENT parsing. Helpers that
 * need i18n (e.g. the multi-agent verb/fallback label builders) intentionally
 * stay in tool-activity-grouping.ts / tool-activity-detail.tsx so this module
 * never depends on the i18n bundle. Signatures are unified to the `ThreadItem`
 * shape for the item-level helpers; an `ItemRecord` is assignable to a
 * `ThreadItem` parameter, so existing record-passing call sites keep working.
 */
import { stringField } from "../lib/format";

import { recordObject } from "./thread-item-fields";
import type { ItemRecord, ThreadItem } from "./render-group-types";

const WEB_SEARCH_SITE_RE = /\bsite:([^\s]+)/giu;
const WEB_SEARCH_OR_RE = /\bOR\b/gu;

export function webSearchActionDetail(action: unknown): string {
  if (!action || typeof action !== "object") return "";
  const record = action as Record<string, unknown>;
  const type = stringField(record, "type");
  if (type === "search") {
    const query = stringField(record, "query").trim();
    if (query) return cleanWebSearchQuery(query);
    const queries = Array.isArray(record.queries)
      ? record.queries.flatMap((value) => typeof value === "string" && value.trim() ? [value.trim()] : [])
      : [];
    if (queries.length > 1) return `${cleanWebSearchQuery(queries[0] ?? "")} ...`;
    return cleanWebSearchQuery(queries[0] ?? "");
  }
  if (type === "openPage") return stringField(record, "url").trim();
  if (type === "findInPage") {
    const pattern = stringField(record, "pattern").trim();
    const url = stringField(record, "url").trim();
    if (pattern && url) return `'${pattern}' in ${url}`;
    return pattern ? `'${pattern}'` : url;
  }
  return "";
}

export function cleanWebSearchQuery(query: string): string {
  const domains: string[] = [];
  const withoutSites = query.replace(WEB_SEARCH_SITE_RE, (match, domain: string) => {
    const normalized = normalizedSearchDomain(domain);
    if (!normalized) return match;
    if (!domains.includes(normalized)) domains.push(normalized);
    return "";
  });
  if (domains.length === 0) return query;
  const terms = withoutSites.replace(WEB_SEARCH_OR_RE, " ").replace(/\s+/gu, " ").trim();
  return terms ? `${terms} | ${domains.join(" · ")}` : query;
}

export function normalizedSearchDomain(domain: string): string | null {
  try {
    return new URL(`https://${domain}`).hostname.replace(/^www\./u, "");
  } catch {
    return null;
  }
}

export function displayPath(path: string): string {
  const trimmed = path.trim().replace(/^\.\/+/u, "").replace(/\\/gu, "/");
  if (!trimmed) return "file";
  return trimmed;
}

export function execExitCode(item: ThreadItem): number | null {
  const record = item as ItemRecord;
  if (typeof record.exitCode === "number" && Number.isFinite(record.exitCode)) return record.exitCode;
  const output = recordObject(record.output);
  return typeof output.exitCode === "number" && Number.isFinite(output.exitCode) ? output.exitCode : null;
}

export function patchChanges(item: ThreadItem): Record<string, unknown>[] {
  const changes = (item as ItemRecord).changes;
  if (Array.isArray(changes)) {
    return changes.filter((change): change is Record<string, unknown> => Boolean(change) && typeof change === "object");
  }
  if (!changes || typeof changes !== "object") return [];
  return Object.entries(changes as Record<string, unknown>).flatMap(([path, value]) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const change = value as Record<string, unknown>;
    return [{ ...change, path: stringField(change, "path") || path }];
  });
}

export function patchKind(change: Record<string, unknown>): "add" | "delete" | "update" {
  const directType = stringField(change, "type");
  if (directType === "add" || directType === "delete") return directType;
  if (directType === "update") return "update";
  const kind = change.kind;
  if (typeof kind === "string") {
    return kind === "add" || kind === "delete" ? kind : "update";
  }
  if (kind && typeof kind === "object") {
    const type = stringField(kind, "type");
    return type === "add" || type === "delete" ? type : "update";
  }
  return "update";
}

export function patchPath(change: Record<string, unknown>): string {
  return stringField(change, "path") || stringField(change, "newPath") || stringField(change, "oldPath") || "file";
}

export function threadSpawnSourceField(thread: Record<string, unknown>, snakeKey: string, camelKey: string): string {
  const source = thread.source;
  if (!source || typeof source !== "object" || Array.isArray(source)) return "";
  const sourceRecord = source as Record<string, unknown>;
  const direct = stringField(sourceRecord, camelKey);
  if (direct) return direct;
  const subAgent = sourceRecord.subAgent;
  if (!subAgent || typeof subAgent !== "object" || Array.isArray(subAgent)) return "";
  const threadSpawn = (subAgent as Record<string, unknown>).thread_spawn;
  if (!threadSpawn || typeof threadSpawn !== "object" || Array.isArray(threadSpawn)) return "";
  return stringField(threadSpawn as Record<string, unknown>, snakeKey)
    || stringField(threadSpawn as Record<string, unknown>, camelKey);
}

export function stripLeadingAt(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
}

export function multiAgentAction(item: ThreadItem): string {
  const record = item as ItemRecord;
  return stringField(record, "action") || stringField(record, "tool") || "agent";
}

export function multiAgentStatus(item: ThreadItem): string {
  return stringField(item as ItemRecord, "status") || "completed";
}
