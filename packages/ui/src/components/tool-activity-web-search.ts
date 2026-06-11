import { stringField } from "../lib/format";
import { isItemInProgress, type AccumulatedThreadItem } from "../state/render-groups";
import { webSearchActionDetail } from "../state/tool-activity-fields";

type ThreadItem = AccumulatedThreadItem;
type ItemRecord = ThreadItem & Record<string, unknown>;

export function webSearchDetail(record: ItemRecord): string {
  const action = webSearchActionDetail(record.action);
  const query = stringField(record, "query").trim();
  return action || query || (isItemInProgress(record) ? "Searching the web" : "Searched web");
}

const WEB_SEARCH_URL_RE = /\bhttps?:\/\/[^\s"'<>]+/iu;
const WEB_SEARCH_SITE_SINGLE_RE = /\bsite:([^\s]+)/iu;

export function webSearchFaviconUrl(record: ItemRecord): string | null {
  const actionUrl = webSearchActionUrl(record.action);
  if (actionUrl) return webSearchFaviconGoogleUrl(actionUrl);
  for (const query of webSearchFaviconQueryCandidates(record)) {
    const url = webSearchQueryUrl(query);
    if (url) return webSearchFaviconGoogleUrl(url);
  }
  return null;
}

function webSearchActionUrl(action: unknown): URL | null {
  if (!action || typeof action !== "object") return null;
  const record = action as Record<string, unknown>;
  const type = stringField(record, "type");
  if (type !== "openPage" && type !== "findInPage") return null;
  return parseWebSearchUrl(stringField(record, "url"));
}

function webSearchFaviconQueryCandidates(record: ItemRecord): string[] {
  const action = recordObject(record.action);
  if (stringField(action, "type") === "search") {
    return [
      stringField(action, "query"),
      ...arrayStringItems(action.queries),
      stringField(record, "query"),
    ].filter((value) => value.trim().length > 0);
  }
  const query = stringField(record, "query");
  return query.trim() ? [query] : [];
}

function webSearchQueryUrl(query: string): URL | null {
  const siteMatch = WEB_SEARCH_SITE_SINGLE_RE.exec(query);
  const candidate = siteMatch?.[1] ?? WEB_SEARCH_URL_RE.exec(query)?.[0] ?? "";
  return parseWebSearchUrl(candidate);
}

function parseWebSearchUrl(value: string): URL | null {
  const cleaned = trimSearchUrlCandidate(value);
  if (!cleaned) return null;
  try {
    const url = new URL(/^[a-z][a-z\d+\-.]*:\/\//iu.test(cleaned) ? cleaned : `https://${cleaned}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function trimSearchUrlCandidate(value: string): string {
  return value.trim().replace(/^[("'`]+|[)"'`,.;!?]+$/gu, "");
}

function webSearchFaviconGoogleUrl(url: URL): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(webSearchFaviconDomain(url.hostname))}&sz=32`;
}

function webSearchFaviconDomain(hostname: string): string {
  const parts = hostname.split(".");
  if (parts.length <= 2) return hostname;
  const secondLevel = parts.at(-2);
  const topLevel = parts.at(-1);
  if (topLevel?.length === 2 && secondLevel != null && secondLevel.length <= 3 && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

function recordObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function arrayStringItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}
